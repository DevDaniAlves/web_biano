import { Link } from "react-router-dom";
import { useCart } from "../store/CartContext";
import { useTheme } from "../store/ThemeContext";
import "./Header.css";

export function Header() {
  const { count, setOpen } = useCart();
  const { theme, toggle } = useTheme();

  return (
    <header className="store-header">
      <Link to="/" className="store-logo">
        <img src="/brand/logo-circle.png" alt="Calangus" width={48} height={48} />
        <span>
          Calangus
          <small>Moda Jovem</small>
        </span>
      </Link>
      <nav className="store-nav">
        <a href="#catalogo">Catálogo</a>
        <Link to="/atendimento" className="nav-muted">
          WhatsApp
        </Link>
        <Link to="/gestor" className="nav-muted">
          Gestor
        </Link>
        <button type="button" className="theme-toggle" onClick={toggle} aria-label="Alternar tema">
          {theme === "dark" ? "Claro" : "Escuro"}
        </button>
        <button type="button" className="cart-btn" onClick={() => setOpen(true)}>
          Carrinho
          {count > 0 && <span className="cart-badge">{count}</span>}
        </button>
      </nav>
    </header>
  );
}
