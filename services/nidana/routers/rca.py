"""POST /rca — complaint root-cause analysis. §6.3

Grounded-first: code builds a deterministic evidence bundle, the LLM only
narrates it. It cannot invent a number, because it is never asked to produce
one.
"""

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/rca", tags=["rca"])


class RCARequest(BaseModel):
    """The evidence bundle, assembled by the caller with no LLM involvement."""

    complaint: dict
    product: dict
    excursions: list[dict]
    shipment: dict
    history: dict


class RCAResponse(BaseModel):
    probable_cause: str
    contributing_pattern: str | None
    recommended_actions: list[str]
    evidence: dict  # echoed back so the UI can show it beside the prose


@router.post("", response_model=RCAResponse)
def analyse(req: RCARequest) -> RCAResponse:
    """SCAFFOLD — Phase 10.

    Prompt (§6.3): "Explain the probable cause and recommend corrective
    actions using ONLY the evidence below. Cite specific figures. If the
    evidence is insufficient, say so." Temperature 0.2.
    """
    raise NotImplementedError("Phase 10")
