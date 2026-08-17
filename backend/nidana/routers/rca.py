"""POST /rca, POST /rca/insights — complaint root-cause analysis. §6.3

Grounded-first: the caller builds a deterministic evidence bundle, this
service only narrates it. It cannot invent a number, because it is never
asked to produce one — see services/rca_service.py.

Both endpoints return 502 on any narration failure (missing key, timeout,
malformed model output) rather than a best-effort guess. The caller
(vayu-api's nidana-client) already has a deterministic TypeScript fallback
for exactly this case — a stub is worse than an honest 502.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.rca_service import RcaUnavailable, narrate_complaint, narrate_insights

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
async def analyse(req: RCARequest) -> RCAResponse:
    """Prompt (§6.3): "Explain the probable cause and recommend corrective
    actions using ONLY the evidence below. Cite specific figures. If the
    evidence is insufficient, say so." Temperature 0.2.
    """
    evidence = req.model_dump()
    try:
        narrated = await narrate_complaint(evidence)
    except RcaUnavailable as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    return RCAResponse(
        probable_cause=narrated["probable_cause"],
        contributing_pattern=narrated.get("contributing_pattern"),
        recommended_actions=narrated["recommended_actions"],
        evidence=evidence,
    )


class CategoryCount(BaseModel):
    category: str
    count: int
    pct: float


class NamedCount(BaseModel):
    label: str
    count: int


class InsightsRequest(BaseModel):
    """Dashboard-level aggregate evidence — deterministic Prisma groupBy output."""

    total_complaints: int
    by_category: list[CategoryCount]
    by_team: list[NamedCount]
    excursion_severity: list[NamedCount]
    monthly_trend: list[NamedCount]


class CategoryInsight(BaseModel):
    category: str
    cause: str
    suggestion: str


class ChartInsight(BaseModel):
    cause: str
    suggestion: str


class InsightsResponse(BaseModel):
    category_insights: list[CategoryInsight]
    team_insight: ChartInsight
    excursion_insight: ChartInsight
    trend_insight: ChartInsight


@router.post("/insights", response_model=InsightsResponse)
async def insights(req: InsightsRequest) -> InsightsResponse:
    """One Groq call narrates every chart on the root-cause dashboard at once —
    cheaper and faster than one call per chart segment.
    """
    evidence = req.model_dump()
    try:
        narrated = await narrate_insights(evidence)
    except RcaUnavailable as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    return InsightsResponse(**narrated)
