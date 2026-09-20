import os
import razorpay
from dotenv import load_dotenv
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db, Order

load_dotenv(override=True)  # Always prefer .env values over existing process env

router = APIRouter(prefix="/api/razorpay", tags=["razorpay"])

def _get_key_id():
    return os.getenv("RAZORPAY_KEY_ID")

def _get_key_secret():
    return os.getenv("RAZORPAY_KEY_SECRET")

def _get_webhook_secret():
    return os.getenv("RAZORPAY_WEBHOOK_SECRET")

def get_razorpay_client():
    key_id = _get_key_id()
    key_secret = _get_key_secret()
    if not key_id or not key_secret:
        raise HTTPException(status_code=500, detail="Razorpay credentials are missing. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in backend/.env")
    return razorpay.Client(auth=(key_id, key_secret))

class CreateOrderRequest(BaseModel):
    product_name: str
    amount: float # E.g., 49.00 (INR)
    currency: Optional[str] = "INR"

class VerifyPaymentRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str

@router.get("/config")
def get_config():
    key_id = _get_key_id()
    if not key_id:
        raise HTTPException(status_code=500, detail="Razorpay Key ID not configured. Set RAZORPAY_KEY_ID in backend/.env")
    return {"key_id": key_id}

@router.get("/subscription")
def get_subscription(db: Session = Depends(get_db)):
    """Returns current active subscription status based on verified payments."""
    latest_paid = db.query(Order).filter(Order.status == "PAID").order_by(Order.updated_at.desc()).first()
    if latest_paid:
        return {
            "active": True,
            "plan": latest_paid.product_name,
            "amount": latest_paid.amount / 100.0,
            "currency": latest_paid.currency,
            "payment_id": latest_paid.razorpay_payment_id,
            "order_id": latest_paid.razorpay_order_id,
            "activated_at": latest_paid.updated_at.isoformat() if latest_paid.updated_at else None,
        }
    return {"active": False, "plan": None}

@router.get("/orders")
def get_orders(db: Session = Depends(get_db)):
    """Returns past orders from the database."""
    orders = db.query(Order).order_by(Order.created_at.desc()).limit(20).all()
    return [
        {
            "id": o.id,
            "product_name": o.product_name,
            "amount": o.amount / 100.0,
            "currency": o.currency,
            "razorpay_order_id": o.razorpay_order_id,
            "razorpay_payment_id": o.razorpay_payment_id,
            "status": o.status,
            "created_at": o.created_at.isoformat() if o.created_at else None,
        }
        for o in orders
    ]

@router.post("/create_order")
def create_order(request: CreateOrderRequest, db: Session = Depends(get_db)):
    client = get_razorpay_client()
    
    currency = (request.currency or "INR").upper()
    amount_in_paise = int(round(request.amount * 100))
    
    # 1. Create Internal Order (PENDING)
    internal_order = Order(
        product_name=request.product_name,
        amount=amount_in_paise,
        currency=currency,
        status="PENDING",
        razorpay_order_id="pending" 
    )
    
    data = {
        "amount": amount_in_paise,
        "currency": currency,
        "payment_capture": "1"
    }
    
    try:
        # 2. Create Razorpay Order
        rzp_order = client.order.create(data=data)
        
        # 3. Save to Database
        internal_order.razorpay_order_id = rzp_order["id"]
        db.add(internal_order)
        db.commit()
        db.refresh(internal_order)
        
        return {
            "internal_order_id": internal_order.id,
            "order_id": rzp_order["id"], 
            "amount": amount_in_paise, 
            "currency": currency
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create Razorpay order: {str(e)}")

@router.post("/verify")
def verify_payment(request: VerifyPaymentRequest, db: Session = Depends(get_db)):
    client = get_razorpay_client()
        
    # 1. Find the order in the database
    order = db.query(Order).filter(Order.razorpay_order_id == request.razorpay_order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found for this razorpay_order_id.")
    
    # 2. Idempotency Check
    if order.status == "PAID":
        return {"success": True, "message": "Payment was already verified.", "order_id": order.id}

    # 3. Verify Signature securely using Razorpay SDK
    try:
        params_dict = {
            'razorpay_order_id': request.razorpay_order_id,
            'razorpay_payment_id': request.razorpay_payment_id,
            'razorpay_signature': request.razorpay_signature
        }
        client.utility.verify_payment_signature(params_dict)
        
        # 4. Mark as PAID on success
        order.status = "PAID"
        order.razorpay_payment_id = request.razorpay_payment_id
        db.commit()
        
        return {"success": True, "message": "Payment successfully verified.", "order_id": order.id}
    except razorpay.errors.SignatureVerificationError:
        order.status = "FAILED"
        db.commit()
        raise HTTPException(status_code=400, detail="Payment signature verification failed.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/webhook")
async def razorpay_webhook(request: Request, db: Session = Depends(get_db)):
    client = get_razorpay_client()
    
    if not _get_webhook_secret():
        raise HTTPException(status_code=500, detail="Webhook secret not configured. Set RAZORPAY_WEBHOOK_SECRET in backend/.env")
        
    body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature")
    
    if not signature:
        raise HTTPException(status_code=400, detail="Missing Razorpay signature.")
        
    try:
        client.utility.verify_webhook_signature(body.decode("utf-8"), signature, _get_webhook_secret())
    except razorpay.errors.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid webhook signature.")
        
    import json
    data = json.loads(body)
    
    # Process events (idempotent)
    if data['event'] == 'payment.captured':
        payment_entity = data['payload']['payment']['entity']
        rzp_order_id = payment_entity.get('order_id')
        rzp_payment_id = payment_entity.get('id')
        
        if rzp_order_id:
            order = db.query(Order).filter(Order.razorpay_order_id == rzp_order_id).first()
            if order and order.status != "PAID":
                order.status = "PAID"
                order.razorpay_payment_id = rzp_payment_id
                db.commit()
                
    return {"status": "ok"}
