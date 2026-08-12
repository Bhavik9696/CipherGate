"""
The "protected" demo backend API that sits behind CipherGate.

In the real architecture this would be an entirely separate service; here
it's a plain function the gateway route calls ONLY after every security
check has passed, so the frontend can never bypass the gateway to reach it
directly.
"""


def process_payment(body: dict) -> dict:
    amount = body.get("amount")
    receiver = body.get("receiver")
    if amount is None or receiver is None:
        return {"success": False, "message": "amount and receiver are required"}
    return {
        "success": True,
        "message": "Payment request processed",
        "amount": amount,
        "receiver": receiver,
    }
