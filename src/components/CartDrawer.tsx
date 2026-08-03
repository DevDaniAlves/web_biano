import { Link } from "react-router-dom";
import { useCart } from "../store/CartContext";
import "./CartDrawer.css";

function money(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function CartDrawer() {
  const { items, open, setOpen, subtotal, setQty, remove } = useCart();

  if (!open) return null;

  return (
    <div className="cart-overlay" onClick={() => setOpen(false)}>
      <aside className="cart-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="cart-head">
          <h2>Carrinho</h2>
          <button type="button" className="cart-close" onClick={() => setOpen(false)}>
            Fechar
          </button>
        </div>

        {items.length === 0 ? (
          <p className="cart-empty">Seu carrinho está vazio.</p>
        ) : (
          <ul className="cart-list">
            {items.map(({ product, qty }) => (
              <li key={product.id}>
                <img src={product.image} alt="" />
                <div>
                  <strong>{product.name}</strong>
                  <span>{money(product.price)}</span>
                  <div className="qty-row">
                    <button type="button" onClick={() => setQty(product.id, qty - 1)}>
                      −
                    </button>
                    <span>{qty}</span>
                    <button type="button" onClick={() => setQty(product.id, qty + 1)}>
                      +
                    </button>
                    <button type="button" className="linkish" onClick={() => remove(product.id)}>
                      Remover
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="cart-foot">
          <div className="cart-sub">
            <span>Subtotal</span>
            <strong>{money(subtotal)}</strong>
          </div>
          <Link
            to="/checkout"
            className={`btn-checkout${items.length === 0 ? " disabled" : ""}`}
            onClick={(e) => {
              if (items.length === 0) e.preventDefault();
              else setOpen(false);
            }}
          >
            Finalizar
          </Link>
        </div>
      </aside>
    </div>
  );
}
