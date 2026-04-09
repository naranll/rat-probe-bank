const BASE = "http://localhost:8080";

async function handleError(res) {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed (${res.status})`);
  }
  const text = await res.text().catch(() => "");
  throw new Error(text || `Request failed (${res.status})`);
}

export async function apiLogin(username, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) await handleError(res);
  return res.json(); // { id, username, password }
}

export async function apiSignup(username, password) {
  const res = await fetch(`${BASE}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) await handleError(res);
  return res.text(); // "User created"
}

export async function apiGetBalance(username) {
  const res = await fetch(
    `${BASE}/account/balance/${encodeURIComponent(username)}`,
  );
  if (!res.ok) await handleError(res);
  return res.json(); // double
}

export async function apiTransfer(from, to, amount) {
  const params = new URLSearchParams({ from, to, amount: String(amount) });
  const res = await fetch(`${BASE}/transfer?${params}`, { method: "POST" });
  if (!res.ok) await handleError(res);
  return res.text(); // "Transfer complete"
}

export async function apiGetHistory(username) {
  const res = await fetch(
    `${BASE}/transfer/history/${encodeURIComponent(username)}`,
  );
  if (!res.ok) await handleError(res);
  return res.json(); // Transaction[]
}
