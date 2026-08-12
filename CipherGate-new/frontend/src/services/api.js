const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

async function parseJsonSafe(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

export async function apiGet(path) {
  try {
    const res = await fetch(`${BASE_URL}${path}`);
    return { status: res.status, data: await parseJsonSafe(res) };
  } catch (err) {
    return { status: 0, data: { message: "Network error: Unable to connect to backend server (is port 8000 running?)" } };
  }
}

export async function apiPostJson(path, body) {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, data: await parseJsonSafe(res) };
  } catch (err) {
    return { status: 0, data: { message: "Network error: Unable to connect to backend server (is port 8000 running?)" } };
  }
}

/**
 * Sends a raw, already-serialized body with custom security headers -
 * used by the Request Editor so the bytes signed are exactly the bytes
 * sent (no re-serialization by fetch that could change whitespace and
 * break the HMAC).
 */
export async function apiPostRaw(path, bodyRaw, headers) {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: bodyRaw,
    });
    return { status: res.status, data: await parseJsonSafe(res) };
  } catch (err) {
    return { status: 0, data: { message: "Network error: Unable to connect to backend server (is port 8000 running?)" } };
  }
}

export { BASE_URL };

