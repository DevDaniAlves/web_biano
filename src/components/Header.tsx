import { Link } from "react-router-dom";
import { useTheme } from "../store/ThemeContext";
import "./Header.css";

export function Header({ minimal = false }: { minimal?: boolean }) {
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
      {!minimal && (
        <nav className="store-nav">
          <a href="#catalogo">Catálogo</a>
          <a href="#galeria">Galeria</a>
          <a href="#contato">Contato</a>
          <button type="button" className="theme-toggle" onClick={toggle} aria-label="Alternar tema">
            {theme === "dark" ? "Claro" : "Escuro"}
          </button>
        </nav>
      )}
    </header>
  );
}
