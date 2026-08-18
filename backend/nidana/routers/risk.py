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


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def _cover_days(qty_on_hand: int, avg_monthly_consumption: float) -> float:
    """Days of stock left at the current monthly consumption rate.

    Mirrors the TS fallback: no consumption at all is treated as a very
    long runway (999) rather than a division by zero.
    """
    if avg_monthly_consumption <= 0:
        return 999.0
    return (qty_on_hand / avg_monthly_consumption) * 30


def _cover_signal(cover_days: float) -> float:
    if cover_days < 15:
        return 1.0
    if cover_days < 30:
        return 0.6
    if cover_days < 60:
        return 0.3
    return 0.0


def _trend_signal(consumption: list[int]) -> float:
    """Newer-half vs older-half consumption, normalised and clamped to 0..1.

    Empty/singleton series have no trend to speak of, so they score 0 rather
    than blowing up on an empty mean.
    """
    if not consumption:
        return 0.0
    half = max(1, len(consumption) // 2)
    older = consumption[:half]
    newer = consumption[-half:]
    old_avg = sum(older) / len(older) if older else 0.0
    new_avg = sum(newer) / len(newer) if newer else 0.0
    if old_avg <= 0:
        return 0.0
    return _clamp((new_avg - old_avg) / old_avg)


def score_risk_signals(req: RiskRequest) -> tuple[list[RiskSignal], float]:
    """Compute the five weighted signals and their combined score.

    Kept separate from the route handler so the scoring logic is trivially
    unit-testable without spinning up FastAPI.
    """
    consumption = [n for n in req.recent_consumption if n == n]  # drop NaN (n == n is False for NaN)
    avg = sum(consumption) / len(consumption) if consumption else 0.0

    cover_days = _cover_days(req.qty_on_hand, avg)
    cover_signal = _cover_signal(cover_days)

    trend_signal = _trend_signal(consumption)

    below_reorder = 1.0 if req.qty_on_hand <= req.reorder_point else 0.0

    disease_signal = _clamp(req.disease_signal if req.disease_signal is not None else 0.0)

    supplier_signal = min(1.0, req.open_excursions * 0.3 + req.late_shipments * 0.2)

    # Round cover_days for display the same way the TS fallback does, but cap
    # the "999" sentinel so a zero-consumption pair doesn't render a silly
    # number in the UI.
    cover_days_display = round(cover_days) if cover_days < 999 else 999

    signals = [
        RiskSignal(
            name="cover_days",
            value=float(cover_days_display),
            weight=0.3,
            contribution=cover_signal * 0.3,
            explanation=f"about {cover_days_display} days of stock left at the current rate",
        ),
        RiskSignal(
            name="consumption_trend",
            value=round(trend_signal, 2),
            weight=0.2,
            contribution=trend_signal * 0.2,
            explanation="consumption is rising month over month" if trend_signal > 0.1 else "consumption is flat or falling",
        ),
        RiskSignal(
            name="below_reorder_point",
            value=below_reorder,
            weight=0.2,
            contribution=below_reorder * 0.2,
            explanation="stock is at or below the reorder point" if below_reorder else "stock is above the reorder point",
        ),
        RiskSignal(
            name="disease_signal",
            value=round(disease_signal, 2),
            weight=0.15,
            contribution=disease_signal * 0.15,
            explanation="rising disease incidence in this district" if disease_signal > 0.3 else "no unusual disease signal",
        ),
        RiskSignal(
            name="supplier_reliability",
            value=round(supplier_signal, 2),
            weight=0.15,
            contribution=supplier_signal * 0.15,
            explanation="this institution has open excursions or late inbound shipments" if supplier_signal > 0.3 else "inbound supply looks healthy",
        ),
    ]

    score = _clamp(sum(s.contribution for s in signals))
    return signals, score


def _band(score: float) -> str:
    if score >= 0.75:
        return "CRITICAL"
    if score >= 0.5:
        return "HIGH"
    if score >= 0.25:
        return "MEDIUM"
    return "LOW"


def _confidence(signals: list[RiskSignal]) -> str:
    """Signal AGREEMENT, not model certainty — "we don't cry wolf".

    A signal is "firing" when it's materially above zero relative to its own
    weight, i.e. contributing more than half of what it could. high when
    >=3 of 5 signals agree, medium at 2, low at 1 or 0.
    """
    agreeing = sum(1 for s in signals if s.weight > 0 and (s.contribution / s.weight) > 0.5)
    if agreeing >= 3:
        return "high"
    if agreeing == 2:
        return "medium"
    return "low"


@router.post("", response_model=RiskResponse)
def score_risk(req: RiskRequest) -> RiskResponse:
    """Deterministic weighted-sum stockout risk score (§6.4).

    Five signals: cover days, consumption trend, below-reorder-point,
    disease signal, and supplier reliability (open excursions / late
    shipments against this institution's inbound pipeline). Mirrors
    `riskFallback` in vayu-api's nidana-client.ts signal-for-signal so the
    two implementations are structurally indistinguishable to the UI.

    Confidence = signal AGREEMENT, not model certainty: `high` when >=3 of 5
    signals point the same way, `medium` at 2, `low` at 1 or 0. Make this
    rule visible in the UI tooltip -- "we don't cry wolf" is the demo line.
    """
    signals, score = score_risk_signals(req)
    return RiskResponse(
        score=round(score, 3),
        band=_band(score),
        confidence=_confidence(signals),
        signals=signals,
    )
