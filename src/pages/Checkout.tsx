import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Header } from "../components/Header";
import { CartDrawer } from "../components/CartDrawer";
import { useCart } from "../store/CartContext";
import "./checkout.css";

function money(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function Checkout() {
  const { items, subtotal, clear, count } = useCart();
  const navigate = useNavigate();
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cidade, setCidade] = useState("");

  if (count === 0) {
    return <Navigate to="/" replace />;
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const orderId = `CG-${Date.now().toString().slice(-6)}`;
    sessionStorage.setItem(
      "calangus-order",
      JSON.stringify({ orderId, nome, telefone, cidade, subtotal, items: items.length })
    );
    clear();
    navigate("/pedido-ok");
  }

  return (
    <div className="checkout-page">
      <Header />
      <CartDrawer />
      <div className="checkout-wrap">
        <form className="checkout-form" onSubmit={onSubmit}>
          <h1>Checkout</h1>
          <p className="muted">Pedido mockado — sem pagamento real.</p>

          <label>
            Nome
            <input
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Seu nome"
            />
          </label>
          <label>
            Telefone
            <input
              required
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="(66) 99999-9999"
            />
          </label>
          <label>
            Cidade
            <input
              required
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
              placeholder="Sua cidade"
            />
          </label>

          <button type="submit" className="checkout-submit">
            Confirmar pedido
          </button>
          <Link to="/" className="back-link">
            Voltar ao catálogo
          </Link>
        </form>

        <aside className="checkout-summary">
          <h2>Resumo</h2>
          <ul>
            {items.map(({ product, qty }) => (
              <li key={product.id}>
                <span>
                  {qty}× {product.name}
                </span>
                <strong>{money(product.price * qty)}</strong>
              </li>
            ))}
          </ul>
          <div className="checkout-total">
            <span>Total</span>
            <strong>{money(subtotal)}</strong>
          </div>
        </aside>
      </div>
    </div>
  );
}
