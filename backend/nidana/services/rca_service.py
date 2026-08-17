"""
Root-cause narration — grounded-first. ARCHITECTURE.md §6.3.

Step 1 (the caller's job, not this file's): assemble a deterministic evidence
bundle from Prisma. No LLM involvement.

Step 2 (this file): hand that evidence to Groq with a prompt that forbids
inventing numbers. The model is only ever asked to explain and recommend —
never to produce a figure that isn't already in the evidence.

Raises on any failure (missing key, timeout, bad response, malformed JSON) so
the caller's deterministic TypeScript fallback takes over. A silently wrong
narration is worse than an honest fallback.
"""

from __future__ import annotations

import json
import os
from typing import Any

import httpx

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "openai/gpt-oss-120b"
TIMEOUT_S = 8.0

SYSTEM_PROMPT = (
    "You are a supply-chain root-cause analyst for a pharmaceutical distributor. "
    "Explain the probable cause and recommend corrective actions using ONLY the "
    "evidence JSON provided. Cite specific figures from it. If the evidence is "
    "insufficient to support a conclusion, say so plainly instead of guessing. "
    "Never invent a number that is not in the evidence. Be concise and concrete."
)


class RcaUnavailable(Exception):
    """Groq is unreachable, unconfigured, or returned something unusable."""


async def _chat_json(user_prompt: str) -> dict[str, Any]:
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        raise RcaUnavailable("GROQ_API_KEY not set")

    async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
        try:
            res = await client.post(
                GROQ_URL,
                headers={"Authorization": f"Bearer {key}", "content-type": "application/json"},
                json={
                    "model": GROQ_MODEL,
                    "temperature": 0.2,
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": user_prompt},
                    ],
                },
            )
        except httpx.HTTPError as e:
            raise RcaUnavailable(f"groq request failed: {e}") from e

    if res.status_code != 200:
        raise RcaUnavailable(f"groq returned {res.status_code}: {res.text[:200]}")

    body = res.json()
    try:
        content = body["choices"][0]["message"]["content"]
    except (KeyError, IndexError) as e:
        raise RcaUnavailable(f"unexpected groq response shape: {e}") from e

    try:
        return json.loads(content)
    except json.JSONDecodeError as e:
        raise RcaUnavailable(f"groq did not return valid JSON: {e}") from e


async def narrate_complaint(evidence: dict[str, Any]) -> dict[str, Any]:
    """Single-complaint deep-dive. Returns probable_cause / contributing_pattern / recommended_actions."""
    prompt = (
        "Evidence for one institution-filed complaint:\n"
        f"{json.dumps(evidence, indent=2)}\n\n"
        "Respond with a JSON object with exactly these keys:\n"
        '  "probable_cause": string (2-3 sentences, cite figures from the evidence)\n'
        '  "contributing_pattern": string or null (a recurring pattern across the history evidence, if any; '
        "null if the evidence shows no pattern)\n"
        '  "recommended_actions": array of 2-4 short, concrete action strings'
    )
    data = await _chat_json(prompt)
    if "probable_cause" not in data or "recommended_actions" not in data:
        raise RcaUnavailable("groq JSON missing required keys")
    return data


async def narrate_insights(evidence: dict[str, Any]) -> dict[str, Any]:
    """Dashboard-level insight: one cause+suggestion per category, plus one per other chart."""
    categories = evidence.get("by_category", [])
    prompt = (
        "Aggregate evidence for a drug supply-chain complaints dashboard:\n"
        f"{json.dumps(evidence, indent=2)}\n\n"
        "Respond with a JSON object with exactly these keys:\n"
        '  "category_insights": array, one entry per category in by_category above, each '
        '{"category": string (must match the input category exactly), "cause": string (1-2 sentences, '
        'cite the count/percentage), "suggestion": string (1 concrete corrective action)}\n'
        '  "team_insight": {"cause": string, "suggestion": string} — read from by_team\n'
        '  "excursion_insight": {"cause": string, "suggestion": string} — read from excursion_severity\n'
        '  "trend_insight": {"cause": string, "suggestion": string} — read from monthly_trend\n'
        f"category_insights must have exactly {len(categories)} entries, one per input category, in the same order."
    )
    data = await _chat_json(prompt)
    for k in ("category_insights", "team_insight", "excursion_insight", "trend_insight"):
        if k not in data:
            raise RcaUnavailable(f"groq JSON missing key: {k}")
    return data
