import { useEffect, useState } from "react";
import { enablePushNotifications } from "../push";

function currentPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window) || !("PushManager" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

export default function PushPermissionBanner({ active }: { active: boolean }) {
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(currentPermission);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(
    () => sessionStorage.getItem("calangus-push-banner") === "1"
  );

  useEffect(() => {
    if (!active) return;
    setPerm(currentPermission());
  }, [active]);

  async function activate() {
    setBusy(true);
    try {
      const r = await enablePushNotifications();
      setPerm(currentPermission());
      if (r === "denied") setPerm("denied");
      if (r === "ok") setHidden(true);
    } finally {
      setBusy(false);
    }
  }

  if (!active || hidden || perm === "unsupported" || perm === "granted") return null;

  if (perm === "denied") {
    return (
      <div className="push-banner" role="status">
        <span>
          Notificações bloqueadas. No iPhone: Ajustes → Calangus → Notificações.
        </span>
        <button
          type="button"
          className="push-banner-close"
          aria-label="Fechar"
          onClick={() => {
            sessionStorage.setItem("calangus-push-banner", "1");
            setHidden(true);
          }}
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div className="push-banner" role="status">
      <span>Ative as notificações para alertas de novas conversas.</span>
      <button type="button" className="push-banner-action" disabled={busy} onClick={() => void activate()}>
        {busy ? "…" : "Ativar"}
      </button>
    </div>
  );
}
