import { FormEvent, useState, type ReactNode } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { getStoredUser, getToken, homePathForSession, setSession } from "../auth";
import { useTheme } from "../store/ThemeContext";
import { waApi } from "../whatsapp/waApi";
import "./login.css";

export default function LoginPage() {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const existing = getToken() && getStoredUser();
  const [email, setEmail] = useState("admin@calangus.com");
  const [password, setPassword] = useState("calangus123");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (existing) {
    return <Navigate to={homePathForSession()} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await waApi.login(email, password);
      setSession(r.token, r.user);
      navigate(homePathForSession(), { replace: true });
    } catch (err) {
      setError(String((err as Error).message));
    } finally {
      setBusy(false);
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
        <p>Acesso de vendedores e administradores</p>
        <form onSubmit={onSubmit}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-mail"
            autoComplete="username"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Senha"
            autoComplete="current-password"
          />
          {error && <p className="login-error">{error}</p>}
          <button type="submit" disabled={busy}>
            {busy ? "Entrando…" : "Entrar"}
          </button>
        </form>
        <Link to="/">← Catálogo</Link>
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
  const user = getStoredUser();
  if (!token || !user) return <Navigate to="/login" replace />;
  if (role === "admin" && user.role !== "admin") {
    return <Navigate to="/atendimento" replace />;
  }
  return <>{children}</>;
}
