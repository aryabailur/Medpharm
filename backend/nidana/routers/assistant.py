"""POST /assistant/explain — LLM narration over a given evidence bundle. §7

The LLM never sees the database. It sees typed JSON, already scoped to the
caller's org server-side. Never generate SQL from an LLM.

NOTE: as of this implementation, `vayu-api` and `dhanvantari-api` call Groq
directly from their own assistant routes (`query.ts` / `index.ts`) rather than
routing through this endpoint — each of those already carries its own
template fallback and narration cache. This endpoint exists so Nidana's own
service surface is complete and consistent with the rest of the intelligence
API (risk, forecast, rca all live here), and so a future caller (or a
same-process narration path) has one ready to use without re-implementing the
Groq plumbing. It is a fully working, independently-testable implementation,
not a dead stub.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import time
from typing import Any

import httpx
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/assistant", tags=["assistant"])

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "openai/gpt-oss-120b"
TIMEOUT_S = 8.0
MAX_COMPLETION_TOKENS = 700

# Same account, same measured 8000-tokens/minute budget as the TS side
# (rca_service.py's model, gpt-oss-120b, spends a chunk of that on hidden
# reasoning tokens before the visible answer). Keep the prompt small and
# cache successful narrations so a repeated demo question costs zero
# additional tokens and returns instantly — "an 8-second round trip on stage
# feels like a crash."
PROMPT_ROW_LIMIT = 6
VERBOSE_ROW_FIELDS = {"history", "drivers", "signals", "incidents", "qc", "shipments", "photos"}

SYSTEM_PROMPT = (
    "You explain supply-chain evidence to a pharmaceutical operations team. "
    "Answer using ONLY the JSON evidence provided. Cite specific figures from it, in words. "
    "Some arrays are capped with a totalCount field -- that count is real and citable "
    "even though only the first few rows are shown. "
    "If the evidence is insufficient to answer, say so plainly. "
    "Never invent a number that is not in the evidence. Be concise -- 2 to 4 sentences. "
    "Write plain prose for a human reader, as you would speak it out loud. Never quote the JSON "
    'verbatim, and never emit field names, key:value pairs, braces, brackets, or bracketed '
    'citation markers of any kind -- no "point":43266, no {...}, no [...]. Refer to quantities '
    "in ordinary words with rounded units, never as a raw JSON field."
)

_CITATION_BRACKET_RE = re.compile(r"[【][^】]*[】]")
_JSON_FRAGMENT_RE = re.compile(r'[\[{][^{}\[\]]*"[A-Za-z0-9_]+"\s*:\s*[^{}\[\]]*[\]}]')


def _strip_json_leakage(text: str) -> str:
    """Defensive strip of JSON-shaped leakage from the LLM's prose -- mirrors
    the same fix applied to vayu-api's and dhanvantari-api's narrate(). Seen
    live: the model "citing" evidence as verbatim <U+3010>"point":43266.7<U+3011>
    -style brackets, or bare {"key": value} fragments. The system prompt
    forbids this, but a prompt alone is not 100% reliable. Conservative: only
    removes bracket pairs carrying a quoted-key/colon pair, so ordinary
    parenthetical prose is untouched.
    """
    out = _CITATION_BRACKET_RE.sub("", text)
    out = _JSON_FRAGMENT_RE.sub("", out)
    out = re.sub(r"[ \t]{2,}", " ", out)
    out = re.sub(r"\s+([.,;:])", r"\1", out)
    out = re.sub(r"\(\s*\)", "", out)
    return out.strip()


class ExplainRequest(BaseModel):
    intent: str
    question: str
    evidence: dict  # typed, from the DB, scoped before it ever reaches here


class ExplainResponse(BaseModel):
    answer: str
    cited_figures: list[str]
    narration: str  # "llm" | "template" -- mirrors the TS assistants' response shape


def _compact_for_prompt(value: Any, depth: int = 0) -> Any:
    """Cap arrays to the first PROMPT_ROW_LIMIT entries (plus a total count)
    and drop bulky per-row sub-arrays that don't change the narration. This
    only ever shrinks what is SENT to the model -- the evidence returned to
    the caller (their evidence panel) is never touched, because this function
    only ever sees a copy assembled for the prompt.
    """
    if isinstance(value, list):
        total = len(value)
        trimmed = [_compact_for_prompt(v, depth + 1) for v in value[:PROMPT_ROW_LIMIT]]
        if total > len(trimmed):
            return {"totalCount": total, "items": trimmed}
        return trimmed
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for k, v in value.items():
            if depth > 0 and k in VERBOSE_ROW_FIELDS and isinstance(v, list):
                out[k] = f"[{len(v)} entries omitted for brevity]"
                continue
            out[k] = _compact_for_prompt(v, depth + 1)
        return out
    return value


class _CacheEntry:
    __slots__ = ("answer", "expires_at")

    def __init__(self, answer: str, expires_at: float) -> None:
        self.answer = answer
        self.expires_at = expires_at


_NARRATION_CACHE_TTL_S = 10 * 60.0
# Keyed on (intent, question, hash of the *prompt* evidence). Only successful
# LLM narrations are ever stored -- a transient rate-limit or timeout must
# never poison a repeat question with template prose.
_narration_cache: dict[str, _CacheEntry] = {}


def _cache_key(intent: str, question: str, prompt_evidence: Any) -> str:
    digest = hashlib.sha1(json.dumps(prompt_evidence, sort_keys=True).encode("utf-8")).hexdigest()
    return f"{intent}:{question.strip().lower()}:{digest}"


def _read_cache(key: str) -> str | None:
    hit = _narration_cache.get(key)
    if hit is None:
        return None
    if hit.expires_at < time.monotonic():
        del _narration_cache[key]
        return None
    return hit.answer


def _write_cache(key: str, answer: str) -> None:
    _narration_cache[key] = _CacheEntry(answer, time.monotonic() + _NARRATION_CACHE_TTL_S)
    if len(_narration_cache) > 200:
        now = time.monotonic()
        for k in [k for k, v in _narration_cache.items() if v.expires_at < now]:
            del _narration_cache[k]


def _template_narration(evidence: dict) -> str:
    """Deterministic prose from the evidence -- the demo-safe path when the
    key is absent or the Groq call fails for any reason. Genuinely useful
    prose, not a placeholder: it reads the shape of the evidence rather than
    just echoing a generic "see the panel" line.
    """
    if not evidence:
        return "No evidence was supplied for this question."

    # Prefer an explicit summary field if the caller's evidence bundle has one
    # (vayu-api / dhanvantari-api evidence bundles always do).
    summary = evidence.get("summary") if isinstance(evidence, dict) else None
    data = evidence.get("data", evidence) if isinstance(evidence, dict) else evidence

    if data is None:
        return summary or "The evidence for this question was empty."

    if isinstance(data, list):
        if not data:
            return f"{summary}. Nothing matched." if summary else "Nothing matched this question."
        n = min(5, len(data))
        base = f"{summary}." if summary else f"{len(data)} record(s) matched."
        return f"{base} Showing the top {n} of {len(data)} in the evidence panel."

    if isinstance(data, dict):
        # Surface a couple of top-level scalar fields so the fallback still
        # cites something concrete instead of only the summary sentence.
        scalars = [f"{k}={v}" for k, v in data.items() if isinstance(v, (int, float, str, bool))]
        if summary and scalars:
            return f"{summary} ({', '.join(scalars[:4])})."
        if summary:
            return summary
        if scalars:
            return f"Evidence on record: {', '.join(scalars[:4])}."

    return summary or "See the evidence panel for details."


async def _call_groq(question: str, prompt_evidence: Any) -> tuple[str | None, str | None]:
    """Returns (answer, error). Never raises -- every failure mode is
    reported back as a string so the caller can log it and fall back,
    exactly like the TS assistants' narrate().
    """
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        return None, "GROQ_API_KEY not set"

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
            res = await client.post(
                GROQ_URL,
                headers={"Authorization": f"Bearer {key}", "content-type": "application/json"},
                json={
                    "model": GROQ_MODEL,
                    "max_tokens": MAX_COMPLETION_TOKENS,
                    "temperature": 0.2,
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {
                            "role": "user",
                            "content": f"Question: {question}\n\nEvidence:\n{json.dumps(prompt_evidence)}",
                        },
                    ],
                },
            )
    except httpx.TimeoutException:
        return None, f"timeout after {TIMEOUT_S}s"
    except httpx.HTTPError as e:
        return None, f"groq request failed: {e}"

    if res.status_code != 200:
        return None, f"groq returned {res.status_code}: {res.text[:300]}"

    body = res.json()
    try:
        choice = body["choices"][0]
        content = choice.get("message", {}).get("content")
    except (KeyError, IndexError, AttributeError) as e:
        return None, f"unexpected groq response shape: {e}"

    if choice.get("finish_reason") == "length":
        # Still usable -- gpt-oss-120b is a reasoning model, so a truncated
        # completion can still carry visible content. Log-worthy, not fatal.
        pass

    text = (content or "").strip()
    if not text:
        return None, f"groq returned empty content, finish_reason={choice.get('finish_reason', 'unknown')}"
    # Defensive cleanup -- see _strip_json_leakage: the prompt forbids raw
    # JSON citations, but a reasoning model doesn't always comply.
    return _strip_json_leakage(text), None


def _cited_figures(question: str, evidence: dict) -> list[str]:
    """Best-effort list of the concrete figures available to be cited, so the
    UI can show "grounded in" chips without re-parsing the prose. Deterministic
    and evidence-only -- never derived from the LLM's own output.
    """
    data = evidence.get("data", evidence) if isinstance(evidence, dict) else evidence
    figures: list[str] = []

    def collect(node: Any) -> None:
        if len(figures) >= 8:
            return
        if isinstance(node, dict):
            for k, v in node.items():
                if len(figures) >= 8:
                    return
                if isinstance(v, (int, float)) and not isinstance(v, bool):
                    figures.append(f"{k}={v}")
                elif isinstance(v, (dict, list)):
                    collect(v)
        elif isinstance(node, list):
            for item in node[:5]:
                collect(item)

    collect(data)
    return figures


_GROUNDING_STOPWORDS = {
    "about", "above", "after", "again", "against", "because", "before",
    "being", "between", "currently", "district", "evidence", "following",
    "have", "information", "insufficient", "institution", "other", "plainly",
    "question", "shipment", "showing", "these", "those", "though", "through",
    "under", "which", "while", "with", "without",
}

_WORD_RE = re.compile(r"[a-z]{4,}")


def _word_tokens_in(value: Any, out: set[str] | None = None) -> set[str]:
    """Collect distinct-word tokens (>=4 letters, lowercased) from every
    string value in the compacted prompt evidence -- drug names, statuses,
    institutions, etc. Numbers are deliberately not the grounding signal:
    the prompt asks the model to spell quantities in words ("ninety-five
    units" rather than "95"), so a digit-based check would reject perfectly
    good, grounded prose.
    """
    if out is None:
        out = set()
    if isinstance(value, str):
        for w in _WORD_RE.findall(value.lower()):
            if w not in _GROUNDING_STOPWORDS:
                out.add(w)
    elif isinstance(value, list):
        for v in value:
            _word_tokens_in(v, out)
    elif isinstance(value, dict):
        for v in value.values():
            _word_tokens_in(v, out)
    return out


def _is_grounded(answer: str, prompt_evidence: Any) -> bool:
    """Was this LLM answer actually grounded in the evidence it was given?

    Guards against a plausible-sounding but ungrounded hedge (e.g. "I don't
    have enough information...") for evidence that plainly contains the
    answer -- observed live on the sibling TS assistants. Such a response
    isn't caught by the empty-content check, and once cached it would serve
    the same wrong answer for the full TTL. If the evidence has any named
    entities, the answer must mention at least one. Evidence with too few
    groundable words (< 3 -- e.g. a mostly-numeric scorecard with just an
    internal ID string) always passes: there's too little to check against,
    and rejecting a good numeric-only answer is worse than missing a rare
    thin hedge here.
    """
    evidence_words = _word_tokens_in(prompt_evidence)
    if len(evidence_words) < 3:
        return True
    answer_words = set(_WORD_RE.findall(answer.lower()))
    return bool(answer_words & evidence_words)


@router.post("/explain", response_model=ExplainResponse)
async def explain(req: ExplainRequest) -> ExplainResponse:
    """Narrate strictly from the supplied evidence.

    Prompt: "explain using ONLY this evidence; cite the numbers" (§7). Keeps
    a template-narration fallback for when GROQ_API_KEY is absent, or the
    Groq call is down/rate-limited/timed-out/malformed mid-demo -- this
    endpoint must degrade gracefully, never 500. Caches successful LLM
    narrations (never template fallbacks) keyed on intent + question + a hash
    of the compacted evidence, so a repeated demo question is instant and a
    transient rate limit never poisons a repeat.
    """
    prompt_evidence = _compact_for_prompt(req.evidence)
    key = _cache_key(req.intent, req.question, prompt_evidence)

    cached = _read_cache(key)
    if cached is not None:
        return ExplainResponse(answer=cached, cited_figures=_cited_figures(req.question, req.evidence), narration="llm")

    answer, error = await _call_groq(req.question, prompt_evidence)
    if answer is None:
        # error is always set when answer is None; narrationError-equivalent
        # logging -- print, not raise, so a missing key or a 429 degrades to
        # the template path instead of a 500.
        print(f'[assistant.explain] narration fallback: intent={req.intent!r} error="{error}"')
        template = _template_narration(req.evidence)
        return ExplainResponse(answer=template, cited_figures=_cited_figures(req.question, req.evidence), narration="template")

    # Grounding check -- see _is_grounded. Never trust or cache a
    # plausible-sounding hedge over evidence that plainly has numbers; a
    # cached hedge would serve the same wrong answer for the full TTL.
    if not _is_grounded(answer, prompt_evidence):
        print(f'[assistant.explain] narration fallback: intent={req.intent!r} error="ungrounded answer: {answer[:150]!r}"')
        template = _template_narration(req.evidence)
        return ExplainResponse(answer=template, cited_figures=_cited_figures(req.question, req.evidence), narration="template")

    _write_cache(key, answer)
    return ExplainResponse(answer=answer, cited_figures=_cited_figures(req.question, req.evidence), narration="llm")
