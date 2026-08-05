import { getToken } from "./auth";

const API = import.meta.env.VITE_API_URL ?? "/api";

export type PushEnableResult = "ok" | "denied" | "unsupported" | "skipped";

function log(...args: unknown[]) {
  console.log("[push]", ...args);
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function authFetch(path: string, init?: RequestInit) {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? res.statusText);
  return data;
}

export async function enablePushNotifications(): Promise<PushEnableResult> {
  log("iniciando ativação", {
    href: location.href,
    standalone: window.matchMedia("(display-mode: standalone)").matches,
    sw: "serviceWorker" in navigator,
    pushManager: "PushManager" in window,
    notification: "Notification" in window,
    permission: typeof Notification !== "undefined" ? Notification.permission : "n/a",
    hasToken: Boolean(getToken()),
    api: API,
  });

  if (!getToken()) {
    log("abortado: sem token de login");
    return "skipped";
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    log("abortado: navegador sem suporte a SW/Push/Notification");
    return "unsupported";
  }

  let perm = Notification.permission;
  if (perm === "default") {
    log("solicitando permissão…");
    perm = await Notification.requestPermission();
    log("resultado da permissão:", perm);
  } else {
    log("permissão atual:", perm);
  }
  if (perm !== "granted") {
    log("abortado: permissão não concedida →", perm);
    return perm === "denied" ? "denied" : "skipped";
  }

  const reg = await navigator.serviceWorker.ready;
  log("service worker pronto", { scope: reg.scope, active: Boolean(reg.active) });

  try {
    const { publicKey } = (await authFetch("/whatsapp/push/vapid-public")) as { publicKey: string };
    log("VAPID public ok", publicKey.slice(0, 24) + "…");

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      log("sem subscription — criando…");
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      log("subscription criada");
    } else {
      log("subscription já existia");
    }

    const json = sub.toJSON();
    log("endpoint", json.endpoint?.slice(0, 80));
    await authFetch("/whatsapp/push/subscribe", {
      method: "POST",
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: json.keys,
      }),
    });
    log("subscription gravada na API — push pronto");
    return "ok";
  } catch (err) {
    console.error("[push] falha ao ativar:", err);
    return "skipped";
  }
}

export async function setAppBadgeCount(count: number) {
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (count > 0) await nav.setAppBadge?.(count);
    else await nav.clearAppBadge?.();
  } catch (err) {
    log("badge não suportado/falhou", err);
  }
}

export async function syncAppBadgeFromServer() {
  if (!getToken()) {
    await setAppBadgeCount(0);
    return 0;
  }
  try {
    const { count } = (await authFetch("/whatsapp/push/badge")) as { count: number };
    await setAppBadgeCount(count);
    return count;
  } catch (err) {
    log("falha ao sync badge", err);
    return 0;
  }
}

export async function disablePushNotifications() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await authFetch(`/whatsapp/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`, {
      method: "DELETE",
    }).catch((err) => log("unsubscribe API falhou", err));
    await sub.unsubscribe().catch(() => {});
    await setAppBadgeCount(0);
    log("subscription removida");
  } catch (err) {
    log("disable falhou", err);
  }
}

if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "wa-push") {
      log("SW recebeu push (aba aberta)", event.data.data);
    }
  });
}
