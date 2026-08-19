const SW_VERSION = "2026-08-19-v4";

/** Padrão de vibração (Android). iOS ignora — usa vibração do sistema nas notificações. */
const ALERT_VIBRATE = [120, 60, 120, 60, 120];

self.addEventListener("push", (event) => {
  event.waitUntil(onPush(event));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/app";
  event.waitUntil(openOrFocus(url));
});

async function setBadge(count) {
  const n = Number(count) || 0;
  try {
    if (self.registration.setAppBadge) {
      if (n > 0) await self.registration.setAppBadge(n);
      else await self.registration.clearAppBadge?.();
      return;
    }
  } catch {
    /* ignore */
  }
  try {
    if (n > 0) await self.navigator?.setAppBadge?.(n);
    else await self.navigator?.clearAppBadge?.();
  } catch {
    /* ignore */
  }
}

function parsePushData(event) {
  const fallback = {
    title: "Calangus",
    body: "Nova atualização",
    url: "/app",
    tag: "calangus",
    contactId: null,
    badge: 1,
  };
  try {
    if (event.data) return { ...fallback, ...event.data.json() };
  } catch (err) {
    console.error("[push][sw] payload inválido", err);
  }
  return fallback;
}

async function notifyClients(data) {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of windows) {
    client.postMessage({ type: "wa-push", data: { ...data, alert: true } });
  }
  return windows;
}

async function onPush(event) {
  console.log("[push][sw]", SW_VERSION, "evento push", { hasData: Boolean(event.data) });
  const data = parsePushData(event);

  // iOS: showNotification primeiro — SW tem pouco tempo em background.
  let notificationShown = false;
  try {
    await self.registration.showNotification(data.title || "Calangus", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag || "calangus",
      silent: false,
      vibrate: ALERT_VIBRATE,
      data: { url: data.url || "/app", contactId: data.contactId, alert: true },
    });
    notificationShown = true;
    console.log("[push][sw] showNotification ok");
  } catch (err) {
    console.error("[push][sw] showNotification falhou", err);
  }

  if (notificationShown) {
    await setBadge(data.badge ?? 1);
  }

  try {
    const windows = await notifyClients(data);
    console.log("[push][sw] janelas notificadas", windows.length);
  } catch (err) {
    console.error("[push][sw] notifyClients falhou", err);
  }
}

async function openOrFocus(url) {
  const abs = new URL(url, self.location.origin).href;
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of windows) {
    if (client.url.startsWith(self.location.origin) && "focus" in client) {
      await client.focus();
      client.postMessage({ type: "wa-open", url });
      return;
    }
  }
  await self.clients.openWindow(abs);
}
