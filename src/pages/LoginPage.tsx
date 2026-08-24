import { FormEvent, useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { getStoredUser, getToken, homePathForSession, isStandaloneDisplay, setSession } from "../auth";
import { enablePushNotifications } from "../push";
import { useTheme } from "../store/ThemeContext";
import { waApi } from "../whatsapp/waApi";
import "./login.css";

function canAskPushNow() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "PushManager" in window &&
    Notification.permission === "default"
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const existing = getToken() && getStoredUser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pushStep, setPushStep] = useState(false);

  if (existing && !pushStep) {
    return <Navigate to={homePathForSession()} replace />;
  }

  function goHome() {
    navigate(homePathForSession(), { replace: true });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await waApi.login(email, password);
      setSession(r.token, r.user);
      if (canAskPushNow()) {
        setPushStep(true);
        return;
      }
      if (isStandaloneDisplay()) {
        await enablePushNotifications();
      }
      goHome();
    } catch (err) {
      setError(String((err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function activatePush() {
    setBusy(true);
    try {
      await enablePushNotifications();
    } finally {
      setBusy(false);
      goHome();
    }
  }

  return (
    <div className="login-page">
      <button type="button" className="theme-toggle login-theme" onClick={toggle}>
        {theme === "dark" ? "Modo claro" : "Modo escuro"}
      </button>
      <div className="login-card">
        <img src="/brand/logo-circle.png" alt="" width={72} height={72} />
        <h1>Calangus</h1>
        {pushStep ? (
          <>
            <p>Ative as notificações para receber novos atendimentos no iPhone, mesmo com o app fechado.</p>
            <button type="button" disabled={busy} onClick={() => void activatePush()}>
              {busy ? "Ativando…" : "Ativar notificações"}
            </button>
            <button type="button" className="login-skip" disabled={busy} onClick={goHome}>
              Agora não
            </button>
          </>
        ) : (
          <>
            <p>Acesso de vendedores e administradores</p>
            <form onSubmit={onSubmit} autoComplete="off">
              <input
                name="calangus-user"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="E-mail"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                inputMode="email"
              />
              <input
                name="calangus-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Senha"
                autoComplete="new-password"
              />
              {error && <p className="login-error">{error}</p>}
              <button type="submit" disabled={busy}>
                {busy ? "Entrando…" : "Entrar"}
              </button>
            </form>
            {!isStandaloneDisplay() && <Link to="/">← Catálogo</Link>}
          </>
        )}
      </div>
    </div>
  );
}

export function RequireAuth({
  children,
  role,
}: {
  children: ReactNode;
  role?: "admin" | "seller";
}) {
  const token = getToken();
  const stored = getStoredUser();
  const [user, setUser] = useState(stored);
  const [checking, setChecking] = useState(Boolean(token && role === "admin"));

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    waApi
      .me()
      .then(({ user: u }) => {
        if (cancelled) return;
        setSession(token, u);
        setUser(u);
      })
      .catch(() => {
        if (cancelled) return;
        setUser(null);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, role]);

  if (!token || (!user && !checking)) return <Navigate to="/login" replace />;
  if (checking) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (role === "admin" && user.role !== "admin") {
    return <Navigate to="/atendimento" replace />;
  }
  return <>{children}</>;
}
