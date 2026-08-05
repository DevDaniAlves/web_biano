import { useEffect, useState } from "react";
import { enablePushNotifications } from "../push";

export default function PushPermissionBanner({ active }: { active: boolean }) {
  const [denied, setDenied] = useState(false);
  const [hidden, setHidden] = useState(
    () => sessionStorage.getItem("calangus-push-banner") === "1"
  );

  useEffect(() => {
    if (!active) return;
    void enablePushNotifications()
      .then((r) => {
        console.log("[push] enable resultado:", r);
        setDenied(r === "denied");
      })
      .catch((err) => {
        console.error("[push] enable erro:", err);
      });
  }, [active]);

  if (!active || !denied || hidden) return null;

  return (
    <div className="push-banner" role="status">
      <span>
        Notificações bloqueadas. Ative nas configurações do navegador para receber alertas com o
        app fechado.
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
