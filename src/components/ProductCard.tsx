import type { Product } from "../store/products";
import { useCart } from "../store/CartContext";
import "./ProductCard.css";

function money(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function ProductCard({ product }: { product: Product }) {
  const { add } = useCart();

  return (
    <article className="product-card">
      <div className="product-media">
        {product.tag && <span className="product-tag">{product.tag}</span>}
        <img src={product.image} alt={product.name} loading="lazy" />
      </div>
      <div className="product-body">
        <h3>{product.name}</h3>
        <p>{product.description}</p>
        <div className="product-row">
          <strong>{money(product.price)}</strong>
          <button type="button" onClick={() => add(product)}>
            Adicionar
          </button>
        </div>
      </div>
    </article>
  );
}
