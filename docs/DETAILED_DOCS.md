# Fact Checker — Detailed Documentation

## What this project does (end-to-end)

This is a full-stack web app that:

- Lets a user upload a PDF in the browser
- Extracts text from the PDF in the backend
- Uses Groq to extract the strongest factual claims (5–8)
- For each claim, fetches supporting/contradicting evidence from the live web
  - Primary provider: Tavily (if `TAVILY_API_KEY` is set)
  - Fallback provider: DuckDuckGo (no key; best-effort)
- Uses Groq again to classify each claim as **VERIFIED / INACCURATE / FALSE**
- Returns a structured “trust report” to the UI with evidence and source links

---

## Tech stack

### Frontend

- **React (Vite)**: SPA UI and build pipeline
- **Tailwind CSS**: styling and layout
- **framer-motion**: subtle motion/animations
- **XMLHttpRequest**: upload with progress bar (instead of `fetch`)

### Backend

- **FastAPI**: API server
- **Uvicorn**: ASGI server
- **python-multipart**: `multipart/form-data` upload parsing
- **PyMuPDF**: PDF text extraction
- **httpx**: HTTP client (Groq + Tavily)
- **duckduckgo_search**: keyless search fallback provider
- **pydantic-settings**: environment/config management

---

## Repo structure

```text
/
  public/
    sample1.pdf
    sample2.pdf
  src/
    App.jsx
    main.jsx
    index.css
    components/
      HeroSection.jsx
      UploadZone.jsx
      LoadingSteps.jsx
      TrustScore.jsx
      SummaryCards.jsx
      ClaimCard.jsx
      SourceList.jsx
      ui/
        Card.jsx
        Badge.jsx
    lib/
      upload.js
      format.js
  backend/
    requirements.txt
    app/
      main.py
      config.py
      routes/
        factcheck.py
      services/
        pdf_service.py
        groq_service.py
        search_service.py
        factcheck_service.py
        source_trust.py
      models/
        schemas.py
      utils/
        cache.py
  render.yaml
```

---

## Frontend: how each component works

### `src/main.jsx`

- Bootstraps React and renders `<App />` into `index.html`.

### `src/App.jsx` (application state + orchestration)

This is the “controller” for the UI. It owns:

- **File state**: `file`
- **Drag state**: `isDragging`
- **Request state**: `isLoading`, `uploadProgress`, `error`
- **Result state**: `result` (the API response JSON)
- **UI state**: filter selection and evidence accordion control

Main flows:

- **Select/drop file** → validates MIME type is `application/pdf`
- **Submit** → calls `uploadPdfWithProgress` with `${VITE_API_BASE_URL}/api/fact-check`
- **Success** → stores `result` and updates UI step/progress timers
- **Failure** → shows the error message from the backend (or network/timeout)
- **Sample report** → loads a local hard-coded report (`SAMPLE_REPORT`) without calling the backend

### `src/components/HeroSection.jsx` (header + sample PDF downloads)

- Displays the fixed header and “Download Sample PDFs” dropdown.
- Downloads sample PDFs from the frontend static path:
  - `/sample1.pdf`
  - `/sample2.pdf`
- The PDFs live in `public/`, so they are available in production builds.

### `src/components/UploadZone.jsx` (upload UX)

- Drag-and-drop target + “Choose file” picker.
- Shows selected file card (filename).
- Shows upload progress bar + “Processing…” state.
- Delegates logic to callbacks provided by `App.jsx`:
  - `onPickFile`, `onDrop`, `onRun`, `onClearFile`, etc.

### `src/components/LoadingSteps.jsx` (modal progress overlay)

- Shows the step-by-step “what’s happening” overlay while `isLoading` is true.
- `App.jsx` drives which step is active via `stepIndex`.

### `src/components/TrustScore.jsx` (document-level trust score)

- Computes a document-level trust score using `computeTrustScore` from `src/lib/format.js`.
- Renders:
  - a main circular “score dial”
  - a donut breakdown of VERIFIED / INACCURATE / FALSE counts

### `src/components/SummaryCards.jsx` (filter + counts)

- Displays four large stat cards:
  - Total claims
  - Verified
  - Inaccurate
  - False
- Clicking a card changes the active filter (driven by `App.jsx`).

### `src/components/ClaimCard.jsx` (per-claim detail + evidence)

For each claim result, it displays:

- Claim text
- Status badge (tone based on VERIFIED/INACCURATE/FALSE)
- Confidence score (smoothed via `estimateConfidence`)
- Explanation + corrected fact
- Expand/collapse evidence section:
  - Evidence summary
  - Sources list (`<SourceList />`)

### `src/components/SourceList.jsx` (sources)

- Renders evidence sources and/or `source_links`.
- In the backend, evidence is already “normalized” into a consistent schema.

### `src/components/ui/*`

- `Card.jsx`: base container styling
- `Badge.jsx`: status badge styling (success/warn/danger)

---

## Frontend: API integration details

### Base URL

Frontend uses:

- `VITE_API_BASE_URL` for the backend base URL

Examples:

- Local: `http://localhost:8000`
- Render: `https://YOUR-SERVICE.onrender.com`

### Upload implementation (`src/lib/upload.js`)

Why `XMLHttpRequest`:

- It supports `xhr.upload.onprogress` easily for real-time percentage progress.

Request details:

- Method: `POST`
- URL: `${VITE_API_BASE_URL}/api/fact-check`
- Body: `multipart/form-data` with field `file` (PDF)

---

## Backend: how it works (request → response)

### `backend/app/main.py`

- Creates FastAPI app
- Adds CORS middleware
  - `CORS_ORIGINS="*"` works because credentials are disabled
- Registers API router

### `backend/app/routes/factcheck.py`

Endpoint:

- `POST /api/fact-check`

Flow:

- Validates uploaded file is a PDF
- Reads bytes
- Calls `run_factcheck(filename, pdf_bytes)`
- Maps common failures to useful HTTP statuses:
  - timeouts → 504
  - quota / rate-limit → 429
  - auth failures → 401

### `backend/app/services/pdf_service.py`

- Extracts text from raw PDF bytes via PyMuPDF.
- Returns plain text that later steps truncate.

### `backend/app/services/search_service.py`

This is the key part that makes deployments work reliably:

- If `TAVILY_API_KEY` is present:
  - calls Tavily (`https://api.tavily.com/search`)
- If `TAVILY_API_KEY` is missing:
  - falls back to DuckDuckGo via `duckduckgo_search`

Both paths normalize results into a consistent shape:

- `title`, `snippet`, `url`, `domain`
- trust tier + trust score (from `source_trust.py`)
- relevance score (light heuristic)

Results are cached (TTL cache) to reduce repeated search calls.

### `backend/app/services/groq_service.py`

Two Groq calls:

1) **Extract claims**
- Prompt returns JSON containing: claim + temporal_kind + recommended search query

2) **Verify claims batch**
- Prompt receives: claims + slim evidence objects
- Prompt returns JSON with results for each claim:
  - status
  - explanation
  - corrected_fact
  - evidence_summary
  - optional per-source notes

### `backend/app/services/factcheck_service.py`

This orchestrates the full pipeline:

- Ensures `GROQ_API_KEY` exists
- Extracts text → truncates to `MAX_PDF_CHARS`
- Caches results by hash of truncated text
- Runs:
  - claim extraction (Groq)
  - web evidence gathering (Tavily or DDG fallback)
  - verification (Groq)
- Computes additional heuristics:
  - confidence score adjustment
  - document-level score + label + summary

---

## How frontend and backend connect (deployment-ready)

You need **two URLs** in production:

- **Frontend URL** (Vercel/Netlify/Cloudflare Pages)
- **Backend URL** (Render/Railway/Fly.io)

Then configure:

- Frontend env: `VITE_API_BASE_URL=<backend-url>`
- Backend env: `CORS_ORIGINS=<frontend-url>` (or `*` if you want public access)

Important:

- For Vercel/Netlify, env vars must be set in the provider dashboard and the site rebuilt.

---

## Deployment: Render (Backend)

This repo includes `render.yaml` already.

Recommended Render service settings:

- **Root directory**: `backend`
- **Build command**: `pip install -r requirements.txt`
- **Start command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

Render environment variables:

- `GROQ_API_KEY` (required)
- `TAVILY_API_KEY` (optional)
- `CORS_ORIGINS` (recommended: your frontend URL)

### Health check

After deploy:

- `GET /health` should return JSON:
  - `status: ok`
  - `model: ...`

---

## Deployment: Vercel (Frontend)

Project settings:

- Framework preset: **Vite**
- Build command: `npm run build`
- Output directory: `dist`

Environment variables:

- `VITE_API_BASE_URL=https://YOUR-RENDER-BACKEND.onrender.com`

Sample PDFs:

- The download dropdown hits `/sample1.pdf` and `/sample2.pdf`
- These work because the PDFs are in `public/`

---

## Deployment: other backend platforms (quick notes)

### Railway

- Start command: same Uvicorn command (bind `0.0.0.0:$PORT`)
- Set env vars in Railway dashboard

### Fly.io

- Needs a `fly.toml` + Dockerfile (not included in this repo)
- But the server command is still:
  - `uvicorn app.main:app --host 0.0.0.0 --port 8080` (or `$PORT`)

### Cloud Run / Docker platforms

- Put backend into a Docker image
- Ensure it listens on `$PORT` and `0.0.0.0`

---

## Common “it deployed but doesn’t work” causes (and fixes)

- **Missing `GROQ_API_KEY`**: API will return 500-ish errors; set it in the platform env vars.
- **CORS blocked**: set backend `CORS_ORIGINS` to your frontend origin.
- **Wrong frontend base URL**: set `VITE_API_BASE_URL` to the backend public URL and redeploy frontend.
- **Timeouts**: PDFs that are too big or slow search provider; increase frontend timeout if needed, or reduce `MAX_PDF_CHARS`.
- **Tavily missing**: now handled by DDG fallback; optionally add `TAVILY_API_KEY` for more reliable search.

