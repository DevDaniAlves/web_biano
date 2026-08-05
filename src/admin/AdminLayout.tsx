import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { clearSession, getStoredUser } from "../auth";
import ChangePasswordDialog from "../components/ChangePasswordDialog";
import PushPermissionBanner from "../components/PushPermissionBanner";
import { disablePushNotifications } from "../push";
import { useTheme } from "../store/ThemeContext";
import "./admin.css";

const MENU = [
  {
    label: "WhatsApp",
    children: [
      { to: "/admin/whatsapp/conversas", label: "Conversas" },
      { to: "/admin/whatsapp/relatorios", label: "Relatórios" },
      { to: "/admin/whatsapp/filas", label: "Filas" },
      { to: "/admin/whatsapp/conectar", label: "Conectar" },
      { to: "/admin/whatsapp/usuarios", label: "Usuários" },
    ],
  },
  { to: "/admin/catalogo", label: "Catálogo" },
  { to: "/admin/gestor", label: "Gestor" },
];

function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      {open ? (
        <path
          d="M6 6l12 12M18 6L6 18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M4 7h16M4 12h16M4 17h16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

export default function AdminLayout() {
  const user = getStoredUser();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggle } = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDrawerOpen(false);
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  function logout() {
    void disablePushNotifications().finally(() => {
      clearSession();
      navigate("/login");
    });
  }

  const nav = (
    <>
      <div className="admin-brand">
        <img src="/brand/logo-circle.png" alt="" width={40} height={40} />
        <div>
          <strong>Calangus</strong>
          <span>{user?.name}</span>
        </div>
      </div>
      <nav>
        {MENU.map((item) =>
          "children" in item && item.children ? (
            <div key={item.label} className="admin-group">
              <p>{item.label}</p>
              {item.children.map((c) => (
                <NavLink key={c.to} to={c.to} onClick={() => setDrawerOpen(false)}>
                  {c.label}
                </NavLink>
              ))}
            </div>
          ) : (
            <NavLink
              key={item.to}
              to={item.to!}
              className="admin-top-link"
              onClick={() => setDrawerOpen(false)}
            >
              {item.label}
            </NavLink>
          )
        )}
      </nav>
      <div className="admin-sidebar-foot">
        <button type="button" className="theme-toggle" onClick={toggle}>
          {theme === "dark" ? "Modo claro" : "Modo escuro"}
        </button>
        <button type="button" className="admin-logout" onClick={() => setPwdOpen(true)}>
          Alterar senha
        </button>
        <button type="button" className="admin-logout" onClick={logout}>
          Sair
        </button>
      </div>
    </>
  );

  return (
    <div className={`admin-shell${drawerOpen ? " drawer-open" : ""}`}>
      <header className="admin-appbar">
        <button
          type="button"
          className="admin-menu-btn"
          aria-label={drawerOpen ? "Fechar menu" : "Abrir menu"}
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen((v) => !v)}
        >
          <HamburgerIcon open={drawerOpen} />
        </button>
        <div className="admin-appbar-brand">
          <img src="/brand/logo-circle.png" alt="" width={28} height={28} />
          <strong>Calangus</strong>
        </div>
        <button type="button" className="theme-toggle admin-appbar-theme" onClick={toggle}>
          {theme === "dark" ? "Claro" : "Escuro"}
        </button>
      </header>

      <button
        type="button"
        className="admin-drawer-backdrop"
        aria-label="Fechar menu"
        tabIndex={drawerOpen ? 0 : -1}
        onClick={() => setDrawerOpen(false)}
      />

      <aside className="admin-sidebar">{nav}</aside>

      <main className="admin-main">
        <PushPermissionBanner active />
        <Outlet />
      </main>
      {pwdOpen && <ChangePasswordDialog onClose={() => setPwdOpen(false)} />}
    </div>
  );
}
