import logging

from pathlib import Path

from fastapi import FastAPI, Response
from fastapi.responses import FileResponse, JSONResponse

from app.config import settings
from app.routes.factcheck import router as factcheck_router

app = FastAPI(title="AI Fact Checker API", version="1.0.0")
logger = logging.getLogger("fact_checker")
app.include_router(factcheck_router)
REPO_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_DIST_DIR = REPO_ROOT / "dist"
FRONTEND_INDEX = FRONTEND_DIST_DIR / "index.html"


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "provider": "groq", "model": settings.groq_model}


@app.get("/", include_in_schema=False)
def serve_root() -> Response:
    if FRONTEND_INDEX.is_file():
        return FileResponse(FRONTEND_INDEX)
    return JSONResponse(
        status_code=503,
        content={
            "detail": "Frontend build not found. Run `npm run build` to generate the `dist` folder."
        },
    )


@app.get("/{full_path:path}", include_in_schema=False)
def serve_spa(full_path: str) -> Response:
    if full_path.startswith("api/") or full_path == "health":
        return JSONResponse(status_code=404, content={"detail": "Not Found"})

    if not FRONTEND_DIST_DIR.exists():
        return JSONResponse(
            status_code=503,
            content={
                "detail": "Frontend build not found. Run `npm run build` to generate the `dist` folder."
            },
        )

    requested_path = (FRONTEND_DIST_DIR / full_path).resolve()

    # Block path traversal and only serve files inside dist/.
    if FRONTEND_DIST_DIR.resolve() in requested_path.parents and requested_path.is_file():
        return FileResponse(requested_path)

    if FRONTEND_INDEX.is_file():
        return FileResponse(FRONTEND_INDEX)

    return JSONResponse(status_code=404, content={"detail": "Not Found"})
