import { Header } from "../components/Header";
import { ProductCard } from "../components/ProductCard";
import { CartDrawer } from "../components/CartDrawer";
import { PRODUCTS } from "../store/products";
import "./store.css";

export function Store() {
  return (
    <div className="store">
      <Header />
      <CartDrawer />

      <section className="store-hero">
        <div className="store-hero-bg" aria-hidden />
        <div className="store-hero-inner">
          <img
            className="hero-logo"
            src="/brand/logo-wordmark.png"
            alt="Calangus Moda Jovem"
          />
          <h1>Estilo que acompanha seu passo.</h1>
          <p>Conforto que te move todo dia. Preto, madeira e a marca vermelha da rua.</p>
          <a className="hero-cta" href="#catalogo">
            Ver catálogo
          </a>
        </div>
        <div className="store-hero-product">
          <img src="/brand/hero-product.png" alt="" />
        </div>
      </section>

      <section id="catalogo" className="catalog">
        <div className="catalog-head">
          <h2>Catálogo</h2>
          <p>Peças mockadas para você sentir a identidade Calangus.</p>
        </div>
        <div className="catalog-grid">
          {PRODUCTS.map((p, i) => (
            <div key={p.id} style={{ animationDelay: `${0.04 * i}s` }}>
              <ProductCard product={p} />
            </div>
          ))}
        </div>
      </section>

      <footer className="store-footer">
        <img src="/brand/logo-circle.png" alt="" width={36} height={36} />
        <span>Calangus Moda Jovem </span>
      </footer>
    </div>
  );
}
