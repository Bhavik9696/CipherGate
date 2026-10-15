"""
CipherGate - Security Analytics & Telemetry Routes
Aggregates real request decisions, application usage, and threat breakdowns
directly from the security_events and applications database tables.
"""
import datetime
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db, SecurityEvent, Application

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _get_cutoff(time_range: str) -> Optional[datetime.datetime]:
    now = datetime.datetime.utcnow()
    if time_range == "24h":
        return now - datetime.timedelta(hours=24)
    elif time_range == "7d":
        return now - datetime.timedelta(days=7)
    elif time_range == "30d":
        return now - datetime.timedelta(days=30)
    return None


@router.get("/request-decisions")
def get_request_decisions(
    range: str = Query("all", pattern="^(all|24h|7d|30d)$"),
    db: Session = Depends(get_db),
):
    """
    Returns aggregated counts of Allowed vs. Blocked requests.
    Calculated purely from real SecurityEvent records with optional time range filter.
    """
    cutoff = _get_cutoff(range)
    base_q = db.query(SecurityEvent)
    if cutoff:
        base_q = base_q.filter(SecurityEvent.timestamp >= cutoff)

    total = base_q.count()
    allowed = base_q.filter(SecurityEvent.status == "ALLOWED").count()
    blocked = base_q.filter(SecurityEvent.status == "BLOCKED").count()

    allowed_pct = round((allowed / total * 100), 1) if total > 0 else 0.0
    blocked_pct = round((blocked / total * 100), 1) if total > 0 else 0.0

    return {
        "total": total,
        "allowed": allowed,
        "blocked": blocked,
        "allowed_pct": allowed_pct,
        "blocked_pct": blocked_pct,
        "range": range,
        "breakdown": [
            {
                "name": "Allowed Requests",
                "status": "ALLOWED",
                "value": allowed,
                "percentage": allowed_pct,
                "color": "#33e08a",
            },
            {
                "name": "Blocked Requests",
                "status": "BLOCKED",
                "value": blocked,
                "percentage": blocked_pct,
                "color": "#ff5d73",
            },
        ],
    }


@router.get("/application-requests")
def get_application_requests(
    range: str = Query("all", pattern="^(all|24h|7d|30d)$"),
    db: Session = Depends(get_db),
):
    """
    Returns request volumes aggregated by registered application.
    Correlates SecurityEvent.client_id with Application.id.
    Includes all registered apps (including CipherShop) and any unauthenticated traffic.
    """
    cutoff = _get_cutoff(range)

    # 1. Fetch all registered applications
    apps = db.query(Application).order_by(Application.created_at.desc()).all()
    app_map = {a.id: a for a in apps}

    # 2. Query event counts grouped by client_id and status
    q = db.query(
        SecurityEvent.client_id,
        SecurityEvent.status,
        func.count(SecurityEvent.id),
    )
    if cutoff:
        q = q.filter(SecurityEvent.timestamp >= cutoff)

    event_rows = q.group_by(SecurityEvent.client_id, SecurityEvent.status).all()

    # Aggregate counts per client_id
    counts_by_client: Dict[Optional[str], Dict[str, int]] = {}
    total_events = 0

    for client_id, status, count in event_rows:
        total_events += count
        if client_id not in counts_by_client:
            counts_by_client[client_id] = {"total": 0, "allowed": 0, "blocked": 0}
        counts_by_client[client_id]["total"] += count
        if status == "ALLOWED":
            counts_by_client[client_id]["allowed"] += count
        elif status == "BLOCKED":
            counts_by_client[client_id]["blocked"] += count

    # Build per-application metrics
    app_list: List[Dict[str, Any]] = []
    for app in apps:
        app_stats = counts_by_client.get(app.id, {"total": 0, "allowed": 0, "blocked": 0})
        app_list.append({
            "id": app.id,
            "name": app.name,
            "api_key_prefix": (app.api_key[:12] + "...") if app.api_key else "",
            "total_requests": app_stats["total"],
            "allowed_requests": app_stats["allowed"],
            "blocked_requests": app_stats["blocked"],
            "rate_limit": app.rate_limit,
            "is_active": app.is_active,
            "created_at": app.created_at.isoformat() if app.created_at else None,
        })

    # Sort applications by total_requests descending
    app_list.sort(key=lambda x: (x["total_requests"], x["name"]), reverse=True)

    # Check unauthenticated / unknown client traffic
    unauth_stats = counts_by_client.get(None, {"total": 0, "allowed": 0, "blocked": 0})
    for cid, s in counts_by_client.items():
        if cid is not None and cid not in app_map:
            unauth_stats["total"] += s["total"]
            unauth_stats["allowed"] += s["allowed"]
            unauth_stats["blocked"] += s["blocked"]

    return {
        "total_requests": total_events,
        "registered_apps_count": len(apps),
        "range": range,
        "applications": app_list,
        "unauthenticated": {
            "name": "Unauthenticated (Invalid/Missing API Key)",
            "total_requests": unauth_stats["total"],
            "allowed_requests": unauth_stats["allowed"],
            "blocked_requests": unauth_stats["blocked"],
        },
    }


@router.get("/security-threats")
def get_security_threats(
    range: str = Query("all", pattern="^(all|24h|7d|30d)$"),
    db: Session = Depends(get_db),
):
    """
    Returns security threat breakdown by category from actual blocked audit logs.
    Includes HMAC verification failures, Replay attack detections, Expired timestamps,
    Authentication failures, and Rate-limit violations.
    """
    cutoff = _get_cutoff(range)

    q = db.query(
        SecurityEvent.event_type,
        SecurityEvent.security_check,
        func.count(SecurityEvent.id),
    ).filter(SecurityEvent.status == "BLOCKED")

    if cutoff:
        q = q.filter(SecurityEvent.timestamp >= cutoff)

    threat_rows = q.group_by(SecurityEvent.event_type, SecurityEvent.security_check).all()

    # Calculate total blocked threats
    counts_map = {}
    total_threats = 0
    for event_type, security_check, count in threat_rows:
        counts_map[(event_type, security_check)] = count
        total_threats += count

    # Threat definitions
    definitions = [
        {
            "category": "HMAC Verification Failures",
            "event_type": "TAMPERING",
            "security_check": "hmac",
            "description": "Payload or header tampered in transit (integrity check failed)",
            "color": "#ff5d73",
        },
        {
            "category": "Rate-Limit Violations",
            "event_type": "RATE_LIMIT",
            "security_check": "rate_limit",
            "description": "Exceeded client sliding-window request limit",
            "color": "#f5b942",
        },
        {
            "category": "Replay Attack Detections",
            "event_type": "REPLAY",
            "security_check": "nonce",
            "description": "Reused nonce within active replay protection window",
            "color": "#a855f7",
        },
        {
            "category": "Expired / Stale Timestamps",
            "event_type": "TIMESTAMP_EXPIRED",
            "security_check": "timestamp",
            "description": "Request timestamp exceeded maximum allowed clock skew window",
            "color": "#f97316",
        },
        {
            "category": "Authentication Failures",
            "event_type": "AUTH_FAILURE",
            "security_check": "authentication",
            "description": "Missing or unregistered API key",
            "color": "#ec4899",
        },
    ]

    categories: List[Dict[str, Any]] = []
    matched_keys = set()

    for item in definitions:
        key = (item["event_type"], item["security_check"])
        matched_keys.add(key)
        count = counts_map.get(key, 0)
        pct = round((count / total_threats * 100), 1) if total_threats > 0 else 0.0

        # Retrieve a real sample reason from the latest event in this category
        sample_event = (
            db.query(SecurityEvent.reason)
            .filter(
                SecurityEvent.status == "BLOCKED",
                SecurityEvent.event_type == item["event_type"],
                SecurityEvent.security_check == item["security_check"],
            )
            .order_by(SecurityEvent.timestamp.desc())
            .first()
        )
        sample_reason = sample_event[0] if sample_event else item["description"]

        categories.append({
            "category": item["category"],
            "event_type": item["event_type"],
            "security_check": item["security_check"],
            "count": count,
            "percentage": pct,
            "description": item["description"],
            "sample_reason": sample_reason,
            "color": item["color"],
        })

    # Catch any additional/custom blocked events
    other_count = 0
    for key, count in counts_map.items():
        if key not in matched_keys:
            other_count += count

    if other_count > 0:
        pct = round((other_count / total_threats * 100), 1) if total_threats > 0 else 0.0
        categories.append({
            "category": "Other Security Rejections",
            "event_type": "OTHER",
            "security_check": "other",
            "count": other_count,
            "percentage": pct,
            "description": "Unclassified or custom security rejection",
            "sample_reason": "Blocked by security policy",
            "color": "#64748b",
        })

    return {
        "total_threats": total_threats,
        "range": range,
        "categories": categories,
    }
