import { FormEvent, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { homePathForSession, isStandaloneDisplay } from "../auth";
import { Header } from "../components/Header";
import { waApi } from "../whatsapp/waApi";
import "./store.css";

const CATALOG_URL = "https://www.calangus.com.br";

function waMeLink(phone: string, text: string) {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text.trim())}`;
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
  const [mode, setMode] = useState<"wa_me" | "form">("wa_me");
  const [waPhone, setWaPhone] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("catalogo");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [underConstruction, setUnderConstruction] = useState(false);

  useEffect(() => {
    waApi
      .catalogConfig()
      .then((c) => {
        setMode(c.mode);
        setWaPhone(c.phone);
        if (c.keyword) setKeyword(c.keyword);
        setUnderConstruction(Boolean(c.underConstruction));
      })
      .catch(() => {});
  }, []);

  const generalWa = useMemo(
    () => (waPhone && mode === "wa_me" ? waMeLink(waPhone, sellerMessage(keyword)) : null),
    [keyword, mode, waPhone]
  );

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

  if (underConstruction) {
    return (
      <div className="store store-construction">
        <Header minimal />
        <main className="construction-page">
          <img className="construction-logo" src="/brand/logo-wordmark.png" alt="Calangus Moda Jovem" />
          <h1>A Calangus esta em movimento</h1>
          <p>Estamos preparando uma experiencia ainda mais forte para apresentar a marca.</p>
          <div className="hero-ctas">
            <a className="hero-cta" href={CATALOG_URL} target="_blank" rel="noreferrer">
              Acessar catalogo
            </a>
            {generalWa && (
              <a className="hero-cta ghost" href={generalWa} target="_blank" rel="noreferrer">
                Fale conosco
              </a>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="store">
      <Header />

      <section id="marca" className="store-hero">
        <div className="store-hero-bg" aria-hidden />
        <div className="store-hero-inner">
          <img
            className="hero-logo"
            src="/brand/logo-wordmark.png"
            alt="Calangus Moda Jovem"
          />
          <p className="hero-kicker">Moda jovem com atitude urbana</p>
          <h1>Uma marca feita para vestir presenca, movimento e identidade.</h1>
          <p>
            A Calangus combina energia de rua, visual marcante e pecas pensadas para quem quer se
            destacar no dia a dia. Conheca nossa marca e acesse o novo catalogo oficial.
          </p>
          <div className="hero-ctas">
            <a className="hero-cta" href={CATALOG_URL} target="_blank" rel="noreferrer">
              Ver catalogo oficial
            </a>
            {generalWa && (
              <a className="hero-cta ghost" href={generalWa} target="_blank" rel="noreferrer">
                Fale conosco
              </a>
            )}
          </div>
          <ul className="hero-points">
            <li>Estilo urbano com assinatura propria</li>
            <li>Looks para rotina, rolê e presenca digital</li>
            <li>Atendimento rapido pelo WhatsApp</li>
          </ul>
        </div>
        <div className="store-hero-product">
          <div className="hero-showcase">
            <div className="hero-showcase-card">
              <span className="hero-chip">Colecao em destaque</span>
              <strong>Essenciais com atitude</strong>
              <p>Visual preto, acentos vermelhos e uma linguagem jovem para marcar a vitrine.</p>
            </div>
            <img src="/brand/hero-product.png" alt="" />
          </div>
        </div>
      </section>

      <section id="diferenciais" className="brand-section brand-story">
        <div className="section-heading">
          <p className="section-kicker">A marca</p>
          <h2>Mais do que vender roupa, a Calangus apresenta uma identidade.</h2>
        </div>
        <div className="story-grid">
          <article className="story-card">
            <h3>Estetica com energia</h3>
            <p>
              Nossa comunicacao mistura contraste forte, textura, tons quentes e uma presenca que
              conversa com a rua e com o digital.
            </p>
          </article>
          <article className="story-card">
            <h3>Pecas para viver o dia</h3>
            <p>
              A curadoria busca equilibrio entre conforto, visual marcante e versatilidade para
              diferentes momentos da rotina.
            </p>
          </article>
          <article className="story-card">
            <h3>Atendimento proximo</h3>
            <p>
              Quando quiser ajuda para escolher, combinar ou tirar duvidas, nosso time atende voce
              pelo WhatsApp.
            </p>
          </article>
        </div>
      </section>

      <section className="brand-section brand-banner">
        <div className="brand-banner-copy">
          <p className="section-kicker">Novo destino digital</p>
          <h2>O catalogo agora segue para uma experiencia dedicada da marca.</h2>
          <p>
            Em vez da vitrine dentro desta pagina, o acesso principal vai direto para o novo site
            da Calangus, com foco total na apresentacao da colecao.
          </p>
        </div>
        <div className="brand-banner-actions">
          <a className="hero-cta" href={CATALOG_URL} target="_blank" rel="noreferrer">
            Ir para www.calangus.com.br
          </a>
          {generalWa && (
            <a className="hero-cta ghost" href={generalWa} target="_blank" rel="noreferrer">
              Falar no WhatsApp
            </a>
          )}
        </div>
      </section>

      <section id="contato" className="contact-section">
        <div className="section-heading">
          <p className="section-kicker">Fale conosco</p>
          <h2>Quer ajuda para escolher uma peca ou conhecer melhor a marca?</h2>
          <p>
            {mode === "wa_me"
              ? "Abra o WhatsApp e fale com a equipe Calangus."
              : "Deixe seus dados e nossa equipe entra em contato com voce."}
          </p>
        </div>
        {mode === "wa_me" ? (
          generalWa ? (
            <a className="hero-cta" href={generalWa} target="_blank" rel="noreferrer">
              Fale conosco
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
