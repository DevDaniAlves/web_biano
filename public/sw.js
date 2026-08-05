self.addEventListener("push", (event) => {
  event.waitUntil(onPush(event));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/atendimento";
  event.waitUntil(openOrFocus(url));
});

async function onPush(event) {
  let data = {
    title: "Calangus",
    body: "Nova atualização",
    url: "/atendimento",
    tag: "calangus",
    contactId: null,
  };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    /* ignore */
  }

  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of windows) {
    client.postMessage({ type: "wa-push", data });
  }
  if (windows.some((c) => c.focused)) return;

  await self.registration.showNotification(data.title || "Calangus", {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: data.tag || "calangus",
    renotify: true,
    data: { url: data.url, contactId: data.contactId },
  });
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
