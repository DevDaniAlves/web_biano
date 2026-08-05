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

/** Destino do PWA / login: atendimento se logado, senão tela de login. */
export function homePathForSession() {
  const token = getToken();
  const user = getStoredUser();
  if (!token || !user) return "/login";
  return user.role === "admin" ? "/admin/whatsapp/conversas" : "/atendimento";
}

export function isStandaloneDisplay() {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}
