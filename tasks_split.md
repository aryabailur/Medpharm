# MedTrack — Team Task Division Plan

To optimize your team of 5, here is a clean split between **"Small Potato"** tasks (ideal for manual coding or basic AI autocomplete chat) and **"Big Potato"** tasks (ideal for Claude Code Pro to run autonomously on complex logic).


> **Companion doc.** This page answers *"who should take this task, given their tooling?"* — it splits by difficulty and Claude Pro access. [`WORKPLAN.md`](WORKPLAN.md) answers *"which files may I touch without colliding with a teammate?"* — it splits by file ownership so two people never edit the same file. Pick the person here; get their owned file globs there and in the service READMEs.

---

## 🥔 Small Potato Tasks (For the 2 without Claude Pro)
These tasks are isolated, UI-heavy, standard CRUD, or static scripting. They have low architectural risk and are highly visible (great for getting the dashboards looking beautiful).

### 1. Database Seeding & Mock Data (Phase 1)
*   **What to do:** 
    *   Populate a JSON or CSV list of ~60 drugs based on the National List of Essential Medicines (NLEM).
    *   Populate a JSON list of ~20 fictional hospitals/institutions in India (PHCs, CHCs, District Hospitals) with lat/lng coordinates.
    *   Write a simple script to read these files and seed them into the database using Prisma.
*   **Why it's safe:** It's standard scripting and doesn't touch active API runtime logic.

### 2. Frontend Dashboards & Layouts (Theme & Navigation)
*   **What to do:**
    *   Build the main layouts (sidebars, navbars, responsive grids) for both Vayu and Dhanvantari.
    *   Apply the design system (CSS, global styles, fonts like Inter/Outfit).
    *   Create empty dashboard shell pages with nice loading skeletons for all core pages: Catalog, Orders, Shipments, Complaints, Analytics, Assistant.
*   **Why it's safe:** Purely presentation layer.

### 3. Vayu Catalog & Batch CRUD (Phase 2)
*   **What to do:**
    *   **Backend:** Write basic GET/POST endpoints for `/api/catalog` and `/api/batches` (standard Prisma read/write).
    *   **Frontend:** Create the UI to list drugs, add a new drug, list batches, and a batch details view that renders a QR code (using a simple React QR component).
*   **Why it's safe:** Standard database CRUD operations with zero real-time or background sync logic.

### 4. Dhanvantari Inventory & POS UI (Phase 2)
*   **What to do:**
    *   **Backend:** Simple endpoints to update inventory stock counts when a drug is marked as "dispensed".
    *   **Frontend:** A basic patient-dispensing interface (a POS calculator where a pharmacist enters batch ID + quantity and submits).
*   **Why it's safe:** Basic forms and local state updates.

---

## 🚀 Big Potato Tasks (For the 3 with Claude Pro)
These are system-level, real-time, security-sensitive, or mathematically complex tasks. Let Claude Pro run on these as they require cross-file editing, complex error handling, or heavy algorithms.

### 1. Monorepo Setup & Shared Contracts
*   **What to do:**
    *   Configure `packages/contracts` using Zod for all cross-app requests.
    *   Set up Prisma migrations for both schemas (`vayu`, `dhanvantari`) in the single Postgres database.
    *   Write the HMAC signing and verification middleware in `packages/crypto`.

### 2. The Order Loop Sync (Phase 3 🔒 Hard Gate)
*   **What to do:**
    *   Build the server-to-server communication loop: Dhanvantari API sends signed HMAC request -> Vayu API validates HMAC -> Vayu DB updates -> Vayu webhook notifies Dhanvantari.
    *   Implement the `OutboundEvent` retry table queue (backing off on failure) so network glitches don't break the demo.

### 3. Live Telemetry Pipeline (Phase 4)
*   **What to do:**
    *   Build the `/api/sensors/ingest` pipeline.
    *   Implement the Server-Sent Events (SSE) stream (`/api/stream/shipments/:id`) with auto-reconnect logic on the client.
    *   Build the live Mapbox/Leaflet tracker and real-time Recharts line chart that ticks as simulator telemetry arrives.

### 4. Nidana Intelligence Service (Phase 7 & 8)
*   **What to do:**
    *   Write the Python FastAPI routes.
    *   Write the 2-opt route optimization algorithm (ordering delivery points to avoid crossing routes).
    *   Build the forecasting service using LightGBM + TreeExplainer for SHAP feature importance.

### 5. Chatbot Narration Agent (Phase 9)
*   **What to do:**
    *   Implement the LLM intent classifier (mapping chat messages to database tools).
    *   Write the secure database queries that retrieve the context, and bundle them into the LLM prompt for narration.

---

## How to coordinate

1.  **Set up the Shared Contracts first:** Have the Claude Pro users build `packages/contracts` and the DB migrations.
2.  **Unblock the UI devs:** Once the database tables and Zod models are defined, the UI team can build all frontend pages and tables using mock data or simple local APIs.
3.  **Integrate the pipes:** While the UI team works on the frontend appearance, the Claude Pro team can work on the background sync hooks, Nidana ML models, and SSE telemetry streams.
