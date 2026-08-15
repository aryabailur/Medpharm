"""POST /route/optimize — open TSP over delivery stops. §6.5

One warehouse, N institution deliveries, one vehicle.
Nearest-neighbour construction, then 2-opt improvement.

NN alone lands ~25% above optimal and leaves visibly crossing routes on the
map; 2-opt takes it to ~5% and removes every crossing. Judges look at the map,
and crossings look like a bug.
"""

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/route", tags=["route"])


class Stop(BaseModel):
    institution_id: str
    lat: float
    lng: float
    cold_chain: bool = False
    risk_band: str | None = None
    volume: float = 0.0


class RouteRequest(BaseModel):
    origin_lat: float
    origin_lng: float
    stops: list[Stop]
    vehicle_capacity: float | None = None
    use_osrm: bool = False  # public demo API — free, no key, no billing


class RouteResponse(BaseModel):
    order: list[str]
    total_km: float
    naive_km: float
    km_saved: float
    cold_chain_minutes_at_risk_saved: float  # the number nobody else will have
    polyline: str | None


@router.post("/optimize", response_model=RouteResponse)
def optimize(req: RouteRequest) -> RouteResponse:
    """SCAFFOLD — Phase 10.

    Constraints worth adding (§6.5), each one line, each buys a slide:
      - cold-chain deliveries first (minimize temperature-risk exposure)
      - CRITICAL stockout risk jumps the queue
      - vehicle capacity as a simple volume cap

    Distances: haversine by default, OSRM for real road distances.
    Skip Google Maps Directions -- billing card, hard external dependency.
    """
    raise NotImplementedError("Phase 10")
