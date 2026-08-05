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

async function onPush(event) {
  console.log("[push][sw] evento push recebido", { hasData: Boolean(event.data) });
  let data = {
    title: "Calangus",
    body: "Nova atualização",
    url: "/app",
    tag: "calangus",
    contactId: null,
    badge: 1,
  };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (err) {
    console.error("[push][sw] payload inválido", err);
  }
  console.log("[push][sw] payload", data);

  await setBadge(data.badge ?? 1);

  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  console.log("[push][sw] janelas abertas", windows.length, {
    focused: windows.some((c) => c.focused),
  });
  for (const client of windows) {
    client.postMessage({ type: "wa-push", data });
  }

  try {
    await self.registration.showNotification(data.title || "Calangus", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag || "calangus",
      renotify: true,
      data: { url: data.url || "/app", contactId: data.contactId },
    });
    console.log("[push][sw] showNotification ok");
  } catch (err) {
    console.error("[push][sw] showNotification falhou", err);
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
