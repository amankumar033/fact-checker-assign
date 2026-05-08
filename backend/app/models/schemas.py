from typing import Literal

from pydantic import BaseModel, Field


class EvidenceSource(BaseModel):
    source_name: str
    title: str
    snippet: str
    url: str
    domain: str = ""
    trust_tier: int = Field(default=4, ge=1, le=4)
    trust_score: int = Field(default=1, ge=1, le=10)
    relevance_score: int = Field(default=0, ge=0, le=100)
    explanation: str = ""


class ClaimResult(BaseModel):
    claim: str
    status: Literal["VERIFIED", "INACCURATE", "FALSE"]
    explanation: str
    reasoning: str = ""
    incorrect_part: str = ""
    corrected_fact: str
    confidence_score: int = Field(ge=0, le=100)
    evidence_summary: str
    temporal_kind: str = ""
    evidence_sources: list[EvidenceSource] = Field(default_factory=list)
    source_links: list[str] = Field(default_factory=list)


class FactCheckResponse(BaseModel):
    filename: str
    total_claims: int
    cached: bool = False
    results: list[ClaimResult]
    document_score: int = Field(default=0, ge=0, le=100)
    document_label: str = ""
    avg_confidence: int = Field(default=0, ge=0, le=100)
    document_summary: str = ""
