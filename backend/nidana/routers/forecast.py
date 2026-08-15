"""POST /forecast — LightGBM point + P10/P90 band + SHAP drivers. §6.4"""

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/forecast", tags=["forecast"])


class ForecastRequest(BaseModel):
    institution_id: str
    drug_id: str
    history: list[dict]  # [{period: "YYYY-MM", dispensed: int}, ...]
    horizon_months: int = 1


class ForecastDriver(BaseModel):
    """A SHAP attribution, already translated to plain language.

    Never surface raw feature names. `lag_1` becomes "last month's
    consumption"; `disease_idx` becomes "rising malaria incidence in this
    district". §6.4
    """

    label: str
    direction: str  # "up" | "down"
    magnitude: float


class ForecastResponse(BaseModel):
    point: float
    p10: float
    p90: float
    drivers: list[ForecastDriver]
    model_version: str


@router.post("", response_model=ForecastResponse)
def create_forecast(req: ForecastRequest) -> ForecastResponse:
    """SCAFFOLD — Phase 8.

    Implementation notes (§6.4):
      - Features: lags 1/2/3/6/12, rolling mean & std 3/6/12, month sin/cos
        (CYCLICAL encoding, not a raw integer month), institution tier, drug
        category, disease-signal index.
      - Validation: chronological split, hold out last 2 months. Report MAPE
        and coverage of the 80% band. If coverage lands at 40%, the bands are
        cosmetic and a sharp judge will catch it.
    """
    raise NotImplementedError("Phase 8")
