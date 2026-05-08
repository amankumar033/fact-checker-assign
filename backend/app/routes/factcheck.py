import logging

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.models.schemas import FactCheckResponse
from app.services.factcheck_service import run_factcheck

logger = logging.getLogger("fact_checker")
router = APIRouter(prefix="/api", tags=["factcheck"])


@router.post("/fact-check", response_model=FactCheckResponse)
async def fact_check_pdf(file: UploadFile = File(...)) -> FactCheckResponse:
    logger.info("Fact-check request received. filename=%s", file.filename)
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    try:
        pdf_bytes = await file.read()
        return await run_factcheck(file.filename, pdf_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        message = str(exc)
        if "timed out" in message.lower():
            raise HTTPException(status_code=504, detail=message) from exc
        if "quota" in message.lower() or "rate" in message.lower():
            raise HTTPException(status_code=429, detail="API quota exceeded. Please try again later.") from exc
        if "authentication failed" in message.lower() or "tavily api authentication" in message.lower():
            raise HTTPException(status_code=401, detail=message) from exc
        raise HTTPException(status_code=500, detail=message) from exc
    except Exception as exc:
        logger.exception("Unexpected error during fact-check.")
        raise HTTPException(status_code=500, detail="Fact-check failed due to an internal error.") from exc
