/**
 * Client-side request signing, using the browser's native Web Crypto API
 * (SubtleCrypto) - never a hand-rolled hash implementation.
 *
 * This mirrors backend/crypto/hmac_utils.py exactly:
 *   canonical = METHOD \n PATH \n TIMESTAMP \n NONCE \n BODY
 *   signature = hex( HMAC_SHA256(secret, canonical) )
 */

export function buildCanonicalRequest(method, path, timestamp, nonce, body) {
  return [String(method).toUpperCase(), path, timestamp, nonce, body || ""].join("\n");
}

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hmacSha256Hex(secret, message) {
  const enc = new TextEncoder();
  const key = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await window.crypto.subtle.sign("HMAC", key, enc.encode(message));
  return bufferToHex(signature);
}

export function generateTimestamp() {
  return (Date.now() / 1000).toFixed(3);
}

export function generateNonce() {
  const bytes = new Uint8Array(24);
  window.crypto.getRandomValues(bytes);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function signRequest({ secret, method, path, timestamp, nonce, bodyRaw }) {
  const canonical = buildCanonicalRequest(method, path, timestamp, nonce, bodyRaw);
  return hmacSha256Hex(secret, canonical);
}
