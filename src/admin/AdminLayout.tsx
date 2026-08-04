import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { clearSession, getStoredUser } from "../auth";
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

export default function AdminLayout() {
  const user = getStoredUser();
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();

  function logout() {
    clearSession();
    navigate("/login");
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
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
                  <NavLink key={c.to} to={c.to}>
                    {c.label}
                  </NavLink>
                ))}
              </div>
            ) : (
              <NavLink key={item.to} to={item.to!} className="admin-top-link">
                {item.label}
              </NavLink>
            )
          )}
        </nav>
        <div className="admin-sidebar-foot">
          <button type="button" className="theme-toggle" onClick={toggle}>
            {theme === "dark" ? "Modo claro" : "Modo escuro"}
          </button>
          <button type="button" className="admin-logout" onClick={logout}>
            Sair
          </button>
        </div>
      </aside>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
