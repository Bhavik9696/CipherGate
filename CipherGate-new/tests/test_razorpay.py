import os
import hmac
import hashlib
import json
from unittest.mock import patch, MagicMock
import pytest
from database import SessionLocal, Order

def test_razorpay_config(client):
    res = client.get("/api/razorpay/config")
    assert res.status_code == 200
    data = res.json()
    assert "key_id" in data
    assert len(data["key_id"]) > 0

def test_razorpay_create_order(client):
    payload = {
        "product_name": "CipherGate Pro Subscription",
        "amount": 3999.00,
        "currency": "INR"
    }
    with patch("api.razorpay_routes.get_razorpay_client") as mock_get_client:
        mock_client = MagicMock()
        mock_client.order.create.return_value = {
            "id": "order_test_123456",
            "amount": 399900,
            "currency": "INR"
        }
        mock_get_client.return_value = mock_client
        
        res = client.post("/api/razorpay/create_order", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["order_id"] == "order_test_123456"
        assert data["amount"] == 399900
        assert data["currency"] == "INR"
        assert "internal_order_id" in data

        # Verify order in DB
        db = SessionLocal()
        order = db.query(Order).filter(Order.razorpay_order_id == "order_test_123456").first()
        assert order is not None
        assert order.status == "PENDING"
        assert order.amount == 399900
        db.close()

def test_razorpay_verify_payment_success(client):
    # First create an order in DB
    db = SessionLocal()
    order = Order(
        product_name="CipherGate Pro",
        amount=399900,
        currency="INR",
        status="PENDING",
        razorpay_order_id="order_verify_success"
    )
    db.add(order)
    db.commit()
    db.close()

    verify_payload = {
        "razorpay_order_id": "order_verify_success",
        "razorpay_payment_id": "pay_test_999",
        "razorpay_signature": "valid_mock_signature"
    }

    with patch("api.razorpay_routes.get_razorpay_client") as mock_get_client:
        mock_client = MagicMock()
        mock_client.utility.verify_payment_signature.return_value = True
        mock_get_client.return_value = mock_client

        res = client.post("/api/razorpay/verify", json=verify_payload)
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True

        # Check order updated to PAID
        db = SessionLocal()
        updated_order = db.query(Order).filter(Order.razorpay_order_id == "order_verify_success").first()
        assert updated_order.status == "PAID"
        assert updated_order.razorpay_payment_id == "pay_test_999"
        db.close()

def test_razorpay_verify_payment_invalid_signature(client):
    db = SessionLocal()
    order = Order(
        product_name="CipherGate Pro",
        amount=399900,
        currency="INR",
        status="PENDING",
        razorpay_order_id="order_verify_fail"
    )
    db.add(order)
    db.commit()
    db.close()

    verify_payload = {
        "razorpay_order_id": "order_verify_fail",
        "razorpay_payment_id": "pay_test_fail",
        "razorpay_signature": "invalid_sig"
    }

    import razorpay
    with patch("api.razorpay_routes.get_razorpay_client") as mock_get_client:
        mock_client = MagicMock()
        mock_client.utility.verify_payment_signature.side_effect = razorpay.errors.SignatureVerificationError("Invalid signature")
        mock_get_client.return_value = mock_client

        res = client.post("/api/razorpay/verify", json=verify_payload)
        assert res.status_code == 400

        db = SessionLocal()
        updated_order = db.query(Order).filter(Order.razorpay_order_id == "order_verify_fail").first()
        assert updated_order.status == "FAILED"
        db.close()

def test_razorpay_subscription_and_orders_endpoint(client):
    # Check initially empty
    sub_res = client.get("/api/razorpay/subscription")
    assert sub_res.status_code == 200
    assert sub_res.json()["active"] is False

    orders_res = client.get("/api/razorpay/orders")
    assert orders_res.status_code == 200
    assert isinstance(orders_res.json(), list)

    # Insert a paid order
    db = SessionLocal()
    order = Order(
        product_name="CipherGate Pro Subscription",
        amount=399900,
        currency="INR",
        status="PAID",
        razorpay_order_id="order_sub_active",
        razorpay_payment_id="pay_sub_123"
    )
    db.add(order)
    db.commit()
    db.close()

    # Subscription should now be active
    sub_res = client.get("/api/razorpay/subscription")
    assert sub_res.status_code == 200
    sub_data = sub_res.json()
    assert sub_data["active"] is True
    assert sub_data["plan"] == "CipherGate Pro Subscription"
    assert sub_data["payment_id"] == "pay_sub_123"

    orders_res = client.get("/api/razorpay/orders")
    assert orders_res.status_code == 200
    orders = orders_res.json()
    assert len(orders) >= 1
    assert orders[0]["razorpay_order_id"] == "order_sub_active"
    assert orders[0]["status"] == "PAID"
