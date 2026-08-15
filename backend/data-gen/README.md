# data-gen

Synthetic data generators. ARCHITECTURE.md §10.

**Generator quality matters more than volume.** Give each carrier a
personality (one chronically late, one with a failing reefer), each district a
seasonal profile, each drug a demand shape. Then every analytical feature has
something *true* to find — the forecast has real seasonality to catch, the risk
score has real signals to agree on, the RCA has a real culprit carrier.

**Clean data makes every downstream feature look fake.** Inject noise, stockout
truncation, and reporting gaps deliberately. If the generator is too clean, the
forecast will look implausibly perfect and a sharp judge will notice.

## Scripts

| Script | Output |
|---|---|
| `gen_consumption.py` | 12 months of per-institution, per-drug consumption — trend + seasonality + noise + injected stockouts |
| `gen_orders_shipments.py` | Supply orders and shipments across 4–5 carrier personalities |
| `gen_telemetry.py` | GPS + temperature traces with excursions matching each carrier's profile |

```bash
python -m venv .venv && source .venv/Scripts/activate
pip install pandas numpy
python gen_consumption.py --out out/consumption.json
```

Output lands in `out/` (gitignored — regenerate, don't commit).
