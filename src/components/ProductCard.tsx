import { useState } from "react";
import "./ProductCard.css";

export interface StoreProduct {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  image?: string | null;
  imageUrl?: string | null;
  images?: string[];
  tag?: string;
}

function money(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function ProductCard({
  product,
  sellerHref,
  mediaSrc = (u) => u,
}: {
  product: StoreProduct;
  sellerHref?: string | null;
  mediaSrc?: (url: string) => string;
}) {
  const gallery = (
    product.images?.length ? product.images : [product.imageUrl || product.image || ""]
  ).filter(Boolean);
  const [idx, setIdx] = useState(0);
  const img = gallery[idx] ?? "";

  return (
    <article className="product-card">
      <div className="product-media">
        {product.tag && <span className="product-tag">{product.tag}</span>}
        {img ? (
          <img src={mediaSrc(img)} alt={product.name} loading="lazy" />
        ) : (
          <div className="product-ph" />
        )}
        {gallery.length > 1 && (
          <>
            <button
              type="button"
              className="product-gallery-nav prev"
              aria-label="Foto anterior"
              onClick={() => setIdx((i) => (i - 1 + gallery.length) % gallery.length)}
            >
              ‹
            </button>
            <button
              type="button"
              className="product-gallery-nav next"
              aria-label="Próxima foto"
              onClick={() => setIdx((i) => (i + 1) % gallery.length)}
            >
              ›
            </button>
            <div className="product-gallery-dots">
              {gallery.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  className={i === idx ? "on" : ""}
                  aria-label={`Foto ${i + 1}`}
                  onClick={() => setIdx(i)}
                />
              ))}
            </div>
          </>
        )}
      </div>
      <div className="product-body">
        <h3>{product.name}</h3>
        {product.description && <p>{product.description}</p>}
        <div className="product-row">
          <strong>{money(product.price)}</strong>
        </div>
        {sellerHref && (
          <a className="product-seller" href={sellerHref} target="_blank" rel="noreferrer">
            Falar com um vendedor
          </a>
        )}
      </div>
    </article>
  );
}
