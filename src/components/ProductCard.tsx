import "./ProductCard.css";

export interface StoreProduct {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  image?: string | null;
  imageUrl?: string | null;
  tag?: string;
}

function money(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function ProductCard({
  product,
  sellerHref,
}: {
  product: StoreProduct;
  sellerHref?: string | null;
}) {
  const img = product.imageUrl || product.image || "";

  return (
    <article className="product-card">
      <div className="product-media">
        {product.tag && <span className="product-tag">{product.tag}</span>}
        {img ? <img src={img} alt={product.name} loading="lazy" /> : <div className="product-ph" />}
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
