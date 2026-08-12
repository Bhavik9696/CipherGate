"""
HMAC-SHA256 request-integrity verification.

Canonical request format (this MUST match exactly on client and server):

    METHOD\nPATH\nTIMESTAMP\nNONCE\nBODY

- METHOD is uppercase (GET, POST, ...)
- PATH is the request path only (no host, no query string in this demo)
- BODY is the raw JSON body string sent by the client ("" for no body)

signature = hex( HMAC_SHA256(secret, canonical_request) )

We never implement the hash ourselves - we use Python's standard `hmac`
and `hashlib` modules, and always compare digests with `hmac.compare_digest`
to avoid timing attacks.
"""
import hashlib
import hmac


def build_canonical_request(method: str, path: str, timestamp: str, nonce: str, body: str) -> str:
    return "\n".join([method.upper(), path, timestamp, nonce, body or ""])


def sign(secret: str, canonical_request: str) -> str:
    return hmac.new(
        secret.encode("utf-8"),
        canonical_request.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def verify_signature(secret: str, canonical_request: str, provided_signature: str) -> bool:
    expected = sign(secret, canonical_request)
    try:
        return hmac.compare_digest(expected, provided_signature)
    except TypeError:
        return False
