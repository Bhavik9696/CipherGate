"""Small dependency-free retrieval layer for the in-product security assistant."""

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class KnowledgeChunk:
    title: str
    content: str
    tags: tuple[str, ...]


KNOWLEDGE_BASE = (
    KnowledgeChunk(
        "Gateway pipeline",
        "Every protected request passes API key authentication, timestamp freshness, nonce replay protection, HMAC-SHA256 integrity verification, and rate limiting before it reaches the backend. Failed decisions are written to the audit log.",
        ("gateway", "pipeline", "checks", "request", "security"),
    ),
    KnowledgeChunk(
        "HMAC request integrity",
        "CipherGate signs the canonical request METHOD, PATH, TIMESTAMP, NONCE, and BODY with HMAC-SHA256. The server compares the signature with a constant-time comparison, so changing a signed body or path is rejected as tampering.",
        ("hmac", "signature", "integrity", "tampering", "canonical"),
    ),
    KnowledgeChunk(
        "Replay protection",
        "Each request includes a nonce and a timestamp. A timestamp outside the configured 30-second replay window is rejected, and a nonce already seen for the same application is blocked as a replay attack.",
        ("replay", "nonce", "timestamp", "freshness", "window"),
    ),
    KnowledgeChunk(
        "Rate limiting",
        "The gateway applies an in-memory sliding-window limit per registered application. The default application limit is 20 requests per minute; requests beyond the limit receive a RATE_LIMIT response and are recorded as security events.",
        ("rate", "limit", "burst", "requests", "application"),
    ),
    KnowledgeChunk(
        "Using the Request Editor",
        "Register an application on the Applications page, copy its API key and HMAC secret into Request Editor, then generate a timestamp, nonce, and HMAC before sending. Send Again reuses the nonce to demonstrate replay protection; changing the body without regenerating HMAC demonstrates tamper detection.",
        ("editor", "workflow", "api key", "secret", "demo"),
    ),
    KnowledgeChunk(
        "Audit and dashboard",
        "Dashboard counters and Security Events rows come from the security_events table. They show allowed and blocked requests plus HMAC failures, replay attacks, authentication failures, rate-limit violations, and timestamp failures.",
        ("dashboard", "audit", "events", "metrics", "logs"),
    ),
)


def _terms(text: str) -> set[str]:
    return {term for term in re.findall(r"[a-z0-9]+", text.lower()) if len(term) > 2}


def retrieve(query: str, limit: int = 3) -> list[KnowledgeChunk]:
    query_terms = _terms(query)
    scored = []
    for chunk in KNOWLEDGE_BASE:
        searchable = _terms(f"{chunk.title} {chunk.content} {' '.join(chunk.tags)}")
        score = len(query_terms & searchable)
        if score:
            scored.append((score, chunk))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [chunk for _, chunk in scored[:limit]]


def answer(query: str) -> dict:
    sources = retrieve(query)
    if not sources:
        return {
            "answer": "I could not find that in the CipherGate knowledge base. Try asking about HMAC, replay protection, rate limits, the gateway pipeline, or the Request Editor.",
            "sources": [],
        }

    highlights = " ".join(chunk.content for chunk in sources[:2])
    return {
        "answer": highlights,
        "sources": [{"title": chunk.title} for chunk in sources],
    }