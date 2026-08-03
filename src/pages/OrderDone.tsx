import { Link } from "react-router-dom";
import { useMemo } from "react";
import "./order-done.css";

interface OrderPayload {
  orderId: string;
  nome: string;
  telefone: string;
  cidade: string;
  subtotal: number;
  items: number;
}

function money(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function OrderDone() {
  const order = useMemo(() => {
    try {
      const raw = sessionStorage.getItem("calangus-order");
      return raw ? (JSON.parse(raw) as OrderPayload) : null;
    } catch {
      return null;
    }
  }, []);

  return (
    <div className="order-done">
      <img src="/brand/logo-circle.png" alt="Calangus" width={88} height={88} />
      <h1>Pedido confirmado</h1>
      {order ? (
        <>
          <p className="order-id">#{order.orderId}</p>
          <p>
            Obrigado, <strong>{order.nome}</strong>. Recebemos seu pedido mockado
            ({order.items} item(ns) · {money(order.subtotal)}) para {order.cidade}.
          </p>
        </>
      ) : (
        <p>Seu pedido foi registrado.</p>
      )}
      <Link to="/" className="done-cta">
        Voltar à loja
      </Link>
    </div>
  );
}
