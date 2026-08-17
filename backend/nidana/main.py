"""
Nidana — MedTrack intelligence service.

Named for the Ayurvedic term for diagnosis / etiology.

ARCHITECTURE.md §3.2, §6.3-6.5.

STATELESS. Receives data in the request. Owns no tables, holds no user data,
needs no migrations. Both Vayu and Dhanvantari call it.

Every endpoint here has a deterministic TypeScript fallback on the caller's
side (rolling-mean forecast, weighted-sum risk). Ship the fallback first.
Nidana must never be a single point of demo failure.

SCAFFOLD: routes are declared with their request/response shapes but return
stubs. Implement per phase (§9): risk in Phase 7, forecast in Phase 8, RCA and
routing in Phase 10.
"""

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load before any router reads os.environ (rca_service reads GROQ_API_KEY).
load_dotenv()

from routers import assistant, forecast, rca, risk, route

app = FastAPI(
    title="Nidana",
    description="MedTrack intelligence service — forecasting, risk, RCA, routing",
    version="0.1.0",
)

# Both Next.js apps call this service directly from server-side code.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(forecast.router)
app.include_router(risk.router)
app.include_router(rca.router)
app.include_router(route.router)
app.include_router(assistant.router)


@app.get("/health")
def health() -> dict[str, object]:
    """Liveness probe.

    Also the cron warm-up target: ping this ~10 minutes before the demo. Cold
    starts on free tiers are 30+ seconds and will kill the pitch (§3.2).
    """
    return {"ok": True, "service": "nidana", "version": "0.1.0"}
