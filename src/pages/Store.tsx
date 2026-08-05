import { FormEvent, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { homePathForSession, isStandaloneDisplay } from "../auth";
import { Header } from "../components/Header";
import { ProductCard } from "../components/ProductCard";
import { waApi, type CatalogProduct } from "../whatsapp/waApi";
import "./store.css";

function waMeLink(phone: string, text: string) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

function sellerMessage(keyword: string, productName?: string) {
  if (productName) {
    return [
      `Olá! Vi o item *${productName}* no catálogo da Calangus Moda Jovem e gostaria de falar com um vendedor.`,
      "",
      keyword,
    ].join("\n");
  }
  return [
    "Olá! Vim pelo catálogo da Calangus Moda Jovem e gostaria de falar com um vendedor.",
    "Pode me ajudar a escolher uma peça?",
    "",
    keyword,
  ].join("\n");
}

export function Store() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [mode, setMode] = useState<"wa_me" | "form">("wa_me");
  const [waPhone, setWaPhone] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("catalogo");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    waApi.catalogConfig().then((c) => {
      setMode(c.mode);
      setWaPhone(c.phone);
      if (c.keyword) setKeyword(c.keyword);
    }).catch(() => {});
    waApi.catalogProducts().then(setProducts).catch(() => {});
  }, []);

  const generalWa =
    waPhone && mode === "wa_me" ? waMeLink(waPhone, sellerMessage(keyword)) : null;

  async function onLead(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await waApi.catalogLead({ name, phone, message: message || undefined });
      setSent(true);
      setName("");
      setPhone("");
      setMessage("");
    } catch (err) {
      setError(String((err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  if (isStandaloneDisplay()) {
    return <Navigate to={homePathForSession()} replace />;
  }

  return (
    <div className="store">
      <Header />

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
          <div className="hero-ctas">
            <a className="hero-cta" href="#catalogo">
              Ver catálogo
            </a>
            <a className="hero-cta ghost" href="#contato">
              Entrar em contato
            </a>
          </div>
        </div>
        <div className="store-hero-product">
          <img src="/brand/hero-product.png" alt="" />
        </div>
      </section>

      <section id="catalogo" className="catalog">
        <div className="catalog-head">
          <h2>Catálogo</h2>
          <p>Peças selecionadas da Calangus Moda Jovem.</p>
        </div>
        <div className="catalog-grid">
          {products.map((p, i) => (
            <div key={p.id} style={{ animationDelay: `${0.04 * i}s` }}>
              <ProductCard
                product={p}
                sellerHref={
                  waPhone && mode === "wa_me"
                    ? waMeLink(waPhone, sellerMessage(keyword, p.name))
                    : null
                }
              />
            </div>
          ))}
          {products.length === 0 && (
            <p className="catalog-empty">Nenhum item publicado ainda.</p>
          )}
        </div>
        {generalWa && (
          <div className="catalog-seller-wrap">
            <a className="hero-cta" href={generalWa} target="_blank" rel="noreferrer">
              Falar com um vendedor
            </a>
          </div>
        )}
      </section>

      <section id="contato" className="contact-section">
        <div className="catalog-head">
          <h2>Entrar em contato</h2>
          <p>
            {mode === "wa_me"
              ? "Fale conosco no WhatsApp e escolha um vendedor."
              : "Deixe seus dados e um vendedor da fila irá te atender."}
          </p>
        </div>
        {mode === "wa_me" ? (
          generalWa ? (
            <a className="hero-cta" href={generalWa} target="_blank" rel="noreferrer">
              Abrir WhatsApp
            </a>
          ) : (
            <p>Configure WHATSAPP_BUSINESS_PHONE no servidor.</p>
          )
        ) : sent ? (
          <p className="contact-ok">Recebemos seu pedido! Em breve um vendedor entra em contato.</p>
        ) : (
          <form className="contact-form" onSubmit={(e) => void onLead(e)}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
              required
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="WhatsApp (com DDD)"
              required
            />
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Mensagem (opcional)"
              rows={3}
            />
            {error && <p className="contact-error">{error}</p>}
            <button type="submit" disabled={busy}>
              {busy ? "Enviando…" : "Solicitar atendimento"}
            </button>
          </form>
        )}
      </section>

      <footer className="store-footer">
        <img src="/brand/logo-circle.png" alt="" width={36} height={36} />
        <span>Calangus Moda Jovem</span>
      </footer>
    </div>
  );
}
