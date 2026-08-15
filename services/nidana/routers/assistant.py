"""POST /assistant/explain — LLM narration over a given evidence bundle. §7

The LLM never sees the database. It sees typed JSON, already scoped to the
caller's org server-side. Never generate SQL from an LLM.
"""

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/assistant", tags=["assistant"])


class ExplainRequest(BaseModel):
    intent: str
    question: str
    evidence: dict  # typed, from the DB, scoped before it ever reaches here


class ExplainResponse(BaseModel):
    answer: str
    cited_figures: list[str]


@router.post("/explain", response_model=ExplainResponse)
def explain(req: ExplainRequest) -> ExplainResponse:
    """SCAFFOLD — Phase 9.

    Prompt: "explain using ONLY this evidence; cite the numbers".

    Keep a template-narration fallback for when the LLM API is down or
    rate-limited mid-demo, and cache the six demo questions -- an 8-second
    round trip on stage feels like a crash. §7.4
    """
    raise NotImplementedError("Phase 9")
