"""
CipherGate - Zero-Trust API Security Gateway
FastAPI application entrypoint.

Route summary:
  GET  /health                 - liveness check
  POST /auth/register          - create a demo application (API key + HMAC secret)
  POST /auth/login             - issue a JWT for a registered application
  POST /gateway/request        - generic gated pass-through (used by the API Request Editor)
  POST /api/payment            - the demo backend endpoint, gated the same way
  GET  /audit/logs             - recent security events
  GET  /dashboard/stats        - aggregate counters for the dashboard
  GET  /applications           - list registered applications (no secrets returned)
"""
import json
import time
from typing import Optional

from fastapi import FastAPI, Depends, Header, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import init_db, get_db, Application, SecurityEvent, User
from auth.credentials import create_application, verify_password, get_application_by_id
from auth.user_auth import (
    create_user,
    verify_password as verify_user_password,
    get_user_by_email,
)
from auth.jwt_utils import create_access_token, verify_access_token, JWTError
from gateway.decision_engine import evaluate_request, DecisionResult
from audit.logger import log_event
from api.demo_backend import process_payment
from api.razorpay_routes import router as razorpay_router
from assistant.rag import answer as answer_assistant

app = FastAPI(title="CipherGate", version="1.0.0")
app.include_router(razorpay_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class RegisterRequest(BaseModel):
    name: str
    password: Optional[str] = None


class LoginRequest(BaseModel):
    application_id: str
    password: str


class UserRegisterRequest(BaseModel):
    email: str
    password: str
    full_name: Optional[str] = ""


class UserLoginRequest(BaseModel):
    email: str
    password: str


class GatewayRequest(BaseModel):
    method: str
    path: str
    body: Optional[dict] = None


class AssistantRequest(BaseModel):
    question: str


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok", "service": "CipherGate", "time": time.time()}


@app.post("/assistant/chat")
def assistant_chat(payload: AssistantRequest):
    question = payload.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail={"message": "Ask a question about CipherGate security."})
    result = answer_assistant(question)
    return {"success": True, "question": question, **result}


# ---------------------------------------------------------------------------
# Auth: registration + JWT login
# ---------------------------------------------------------------------------

@app.post("/auth/register")
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    app_obj = create_application(db, name=payload.name, password=payload.password)
    return {
        "success": True,
        "application_id": app_obj.id,
        "name": app_obj.name,
        "api_key": app_obj.api_key,
        "hmac_secret": app_obj.hmac_secret,
        "rate_limit": app_obj.rate_limit,
        "message": "Store the API key and HMAC secret now - the secret is not retrievable again.",
    }


@app.post("/auth/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    app_obj = get_application_by_id(db, payload.application_id)
    if not app_obj or not app_obj.hashed_password or not verify_password(payload.password, app_obj.hashed_password):
        raise HTTPException(status_code=401, detail={
            "success": False, "error": "AUTHENTICATION_FAILED", "message": "Invalid application ID or password"
        })
    token = create_access_token(app_obj.id, app_obj.name)
    return {"success": True, "access_token": token, "token_type": "bearer"}


# ---------------------------------------------------------------------------
# User Auth: email + password registration / login
# ---------------------------------------------------------------------------

@app.post("/auth/user/register")
def user_register(payload: UserRegisterRequest, db: Session = Depends(get_db)):
    if not payload.email or "@" not in payload.email:
        raise HTTPException(status_code=400, detail={"success": False, "error": "INVALID_EMAIL", "message": "A valid email address is required."})
    if not payload.password or len(payload.password) < 6:
        raise HTTPException(status_code=400, detail={"success": False, "error": "WEAK_PASSWORD", "message": "Password must be at least 6 characters."})
    existing = get_user_by_email(db, payload.email)
    if existing:
        raise HTTPException(status_code=409, detail={"success": False, "error": "EMAIL_TAKEN", "message": "An account with this email already exists."})
    user = create_user(db, email=payload.email, password=payload.password, full_name=payload.full_name or "")
    token = create_access_token(user.id, user.email)
    return {
        "success": True,
        "user_id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "access_token": token,
        "token_type": "bearer",
    }


@app.post("/auth/user/login")
def user_login(payload: UserLoginRequest, db: Session = Depends(get_db)):
    user = get_user_by_email(db, payload.email)
    if not user or not verify_user_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail={
            "success": False, "error": "AUTHENTICATION_FAILED", "message": "Invalid email or password."
        })
    token = create_access_token(user.id, user.email)
    return {
        "success": True,
        "user_id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "access_token": token,
        "token_type": "bearer",
    }


@app.get("/auth/verify")
def verify(authorization: str = Header(default=None)):
    """Demonstrates JWT authentication independent of HMAC integrity checks."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail={"success": False, "error": "MISSING_TOKEN"})
    token = authorization.split(" ", 1)[1]
    try:
        payload = verify_access_token(token)
    except JWTError as e:
        raise HTTPException(status_code=401, detail={"success": False, "error": "JWT_INVALID", "message": e.reason})
    return {"success": True, "claims": payload}


# ---------------------------------------------------------------------------
# Applications (credential management - secrets never re-exposed)
# ---------------------------------------------------------------------------

@app.get("/applications")
def list_applications(db: Session = Depends(get_db)):
    apps = db.query(Application).all()
    return [
        {
            "id": a.id,
            "name": a.name,
            "api_key": a.api_key,       # public identifier, ok to show in this demo UI
            "rate_limit": a.rate_limit,
            "created_at": a.created_at.isoformat(),
            "is_active": a.is_active,
        }
        for a in apps
    ]


# ---------------------------------------------------------------------------
# The gated pipeline shared by /gateway/request and /api/payment
# ---------------------------------------------------------------------------

def _run_gateway(
    db: Session,
    *,
    method: str,
    path: str,
    body_raw: str,
    x_api_key: Optional[str],
    x_timestamp: Optional[str],
    x_nonce: Optional[str],
    x_signature: Optional[str],
) -> DecisionResult:
    result = evaluate_request(
        db,
        method=method,
        path=path,
        body_raw=body_raw,
        api_key=x_api_key,
        timestamp=x_timestamp,
        nonce=x_nonce,
        signature=x_signature,
    )
    log_event(db, method=method, endpoint=path, result=result)
    return result


def _decision_payload(result: DecisionResult) -> dict:
    if result.allowed:
        return {"allowed": True, "checks": result.checks}
    return {
        "allowed": False,
        "checks": result.checks,
        "failed_check": result.failed_check,
        "reason": result.reason,
    }


@app.post("/api/payment")
async def api_payment(
    request: Request,
    db: Session = Depends(get_db),
    x_api_key: Optional[str] = Header(default=None),
    x_timestamp: Optional[str] = Header(default=None),
    x_nonce: Optional[str] = Header(default=None),
    x_signature: Optional[str] = Header(default=None),
):
    raw_body = (await request.body()).decode("utf-8") or ""
    result = _run_gateway(
        db, method="POST", path="/api/payment", body_raw=raw_body,
        x_api_key=x_api_key, x_timestamp=x_timestamp, x_nonce=x_nonce, x_signature=x_signature,
    )
    decision = _decision_payload(result)

    if not result.allowed:
        return JSONResponse(status_code=result.status_code, content={
            "success": False,
            "error": result.error_code,
            "message": result.reason,
            "security_check": result.failed_check,
            "decision": decision,
        })

    try:
        body_json = json.loads(raw_body) if raw_body else {}
    except json.JSONDecodeError:
        body_json = {}

    backend_response = process_payment(body_json)
    return JSONResponse(status_code=200, content={**backend_response, "decision": decision})


@app.post("/gateway/request")
async def gateway_request(
    request: Request,
    db: Session = Depends(get_db),
    x_api_key: Optional[str] = Header(default=None),
    x_timestamp: Optional[str] = Header(default=None),
    x_nonce: Optional[str] = Header(default=None),
    x_signature: Optional[str] = Header(default=None),
):
    """
    Generic gated pass-through used by the API Request Editor for
    demonstrating the pipeline against any configured target path.
    Currently routes only to the demo backend (/api/payment) since that is
    the only real backend endpoint in this PBL prototype.
    """
    raw_body = (await request.body()).decode("utf-8") or ""
    try:
        envelope = json.loads(raw_body) if raw_body else {}
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail={"success": False, "error": "MALFORMED_BODY"})

    target_method = (envelope.get("method") or "POST").upper()
    target_path = envelope.get("path") or "/api/payment"
    target_body = envelope.get("body") or {}
    target_body_raw = json.dumps(target_body, separators=(",", ":")) if target_body else ""

    # NOTE: for the HMAC canonical request, the signature must have been
    # computed by the client over (target_method, target_path, timestamp,
    # nonce, target_body_raw) - i.e. over the *inner* request, not this
    # envelope. See frontend services/crypto.js.
    result = _run_gateway(
        db, method=target_method, path=target_path, body_raw=target_body_raw,
        x_api_key=x_api_key, x_timestamp=x_timestamp, x_nonce=x_nonce, x_signature=x_signature,
    )
    decision = _decision_payload(result)

    if not result.allowed:
        return JSONResponse(status_code=result.status_code, content={
            "success": False,
            "error": result.error_code,
            "message": result.reason,
            "security_check": result.failed_check,
            "decision": decision,
        })

    if target_path == "/api/payment":
        backend_response = process_payment(target_body)
    else:
        # Generic demo backend: any path that passes all security checks
        # gets a success response proving the gateway allowed it through.
        backend_response = {
            "success": True,
            "message": f"Request to {target_method} {target_path} passed all security checks and reached the backend",
            "endpoint": target_path,
            "method": target_method,
            "body_received": target_body,
        }

    return JSONResponse(status_code=200, content={**backend_response, "decision": decision})


# ---------------------------------------------------------------------------
# Audit log + dashboard
# ---------------------------------------------------------------------------

@app.get("/audit/logs")
def audit_logs(limit: int = 50, db: Session = Depends(get_db)):
    events = (
        db.query(SecurityEvent)
        .order_by(SecurityEvent.timestamp.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": e.id,
            "timestamp": e.timestamp.isoformat(),
            "client_id": e.client_id,
            "endpoint": e.endpoint,
            "method": e.method,
            "event_type": e.event_type,
            "security_check": e.security_check,
            "status": e.status,
            "reason": e.reason,
        }
        for e in events
    ]


@app.get("/dashboard/stats")
def dashboard_stats(db: Session = Depends(get_db)):
    total = db.query(func.count(SecurityEvent.id)).scalar() or 0
    allowed = db.query(func.count(SecurityEvent.id)).filter(SecurityEvent.status == "ALLOWED").scalar() or 0
    blocked = db.query(func.count(SecurityEvent.id)).filter(SecurityEvent.status == "BLOCKED").scalar() or 0

    def count_type(event_type: str) -> int:
        return db.query(func.count(SecurityEvent.id)).filter(SecurityEvent.event_type == event_type).scalar() or 0

    return {
        "total_requests": total,
        "allowed": allowed,
        "blocked": blocked,
        "hmac_failures": count_type("TAMPERING"),
        "replay_attacks": count_type("REPLAY"),
        "authentication_failures": count_type("AUTH_FAILURE"),
        "rate_limit_violations": count_type("RATE_LIMIT"),
        "timestamp_failures": count_type("TIMESTAMP_EXPIRED"),
    }
