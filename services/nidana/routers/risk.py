"""POST /risk — deterministic 5-signal stockout risk + drilldown. §6.4

The hero feature. Deterministic, no training needed, impossible to
hallucinate, and the drilldown demos beautifully.
"""

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/risk", tags=["risk"])


class RiskRequest(BaseModel):
    institution_id: str
    drug_id: str
    qty_on_hand: int
    reorder_point: int
    recent_consumption: list[int]
    open_excursions: int = 0
    late_shipments: int = 0
    disease_signal: float | None = None


class RiskSignal(BaseModel):
    name: str
    value: float
    weight: float
    contribution: float
    explanation: str


class RiskResponse(BaseModel):
    score: float  # 0..1
    band: str  # "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
    confidence: str  # "low" | "medium" | "high" — signal agreement
    signals: list[RiskSignal]


@router.post("", response_model=RiskResponse)
def score_risk(req: RiskRequest) -> RiskResponse:
    """SCAFFOLD — Phase 7.

    Five signals (§6.4): cover days, consumption trend, disease signal,
    supply reliability, and supplier reliability (open excursions / late
    shipments against this institution's inbound pipeline).

    Confidence = signal AGREEMENT, not model certainty: `high` when >=3 of 5
    signals point the same way, `medium` at 2, `low` at 1. Make this rule
    visible in the UI tooltip -- "we don't cry wolf" is the demo line.
    """
    raise NotImplementedError("Phase 7")
