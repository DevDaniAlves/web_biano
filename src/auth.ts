import type { WaUser } from "./whatsapp/waApi";

const TOKEN_KEY = "calangus-token";
const USER_KEY = "calangus-user";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): WaUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as WaUser) : null;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: WaUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
