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

function sellerMessage(keyword: string) {
  return [
    "Olá! Vim pela Calangus Moda Jovem e quero ver as peças.",
    "Pode me atender?",
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
          <p className="hero-kicker">Moda masculina • Acessórios • Perfumes</p>
          <h1>Chama no Whats e garante o seu look</h1>
          <p>Atendimento de 08h às 18h. Parcelamos em até 10x sem juros.</p>
          <div className="hero-ctas">
            {generalWa ? (
              <a className="hero-cta" href={generalWa} target="_blank" rel="noreferrer">
                Chama no Whats
              </a>
            ) : (
              <a className="hero-cta" href={CATALOG_URL} target="_blank" rel="noreferrer">
                Ver catálogo
              </a>
            )}
            <a className="hero-cta ghost" href={CATALOG_URL} target="_blank" rel="noreferrer">
              Ver catálogo
            </a>
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
          <p className="hero-kicker">Moda masculina • Acessórios • Perfumes</p>
          <h1>Estilo que acompanha seu passo.</h1>
          <p>
            Camisetas, óculos, calçados e perfumes para o homem que quer marcar presença no dia a
            dia, no rolê e na pista. Escolhe o look, chama no Whats e fecha com a gente.
          </p>
          <div className="hero-ctas">
            <a className="hero-cta" href={CATALOG_URL} target="_blank" rel="noreferrer">
              Ver catálogo
            </a>
            {generalWa && (
              <a className="hero-cta ghost" href={generalWa} target="_blank" rel="noreferrer">
                Chama no Whats
              </a>
            )}
          </div>
          <ul className="hero-offers">
            <li>
              <span>⏱️</span> Atendimento: 08h às 18h
            </li>
            <li>
              <span>💳</span> Parcelamos em até 10x sem juros
            </li>
            <li>
              <span>📲</span> Chama no Whats e garante o seu
            </li>
          </ul>
        </div>
        <div className="store-hero-product">
          <div className="hero-showcase">
            <div className="hero-showcase-card">
              <span className="hero-chip">Em alta na loja</span>
              <strong>Calçados com até 30% OFF</strong>
              <p>Conforto que te move — e preço pra fechar agora.</p>
            </div>
            <img src="/brand/hero-product.png" alt="" />
          </div>
        </div>
      </section>

      <section id="colecao" className="brand-section brand-story">
        <div className="section-heading">
          <p className="section-kicker">O que você encontra</p>
          <h2>Moda masculina completa pra vestir do básico ao street.</h2>
          <p>Peças pra rotina, acessórios pra fechar o look e perfumes pra completar o estilo.</p>
        </div>
        <div className="story-grid">
          <article className="story-card">
            <p className="story-tag">Moda masculina</p>
            <h3>Camisetas e essentials</h3>
            <p>
              Básicas justas, oversize com pegada e estampas que falam por você — do dia a dia até o
              visual moto e street.
            </p>
          </article>
          <article className="story-card">
            <p className="story-tag">Acessórios</p>
            <h3>Óculos e calçados</h3>
            <p>
              Óculos com cara de vitrine e calçados pra acompanhar o ritmo. Detalhe certo muda o
              look inteiro.
            </p>
          </article>
          <article className="story-card">
            <p className="story-tag">Perfumes</p>
            <h3>Fragrâncias pra marcar presença</h3>
            <p>
              Do clássico ao marcante: escolha o perfume que combina com o seu estilo e leve o look
              completo.
            </p>
          </article>
        </div>
      </section>

      <section className="brand-section brand-banner">
        <div className="brand-banner-copy">
          <p className="section-kicker">Fechou fácil</p>
          <h2>Viu, gostou, chama no Whats.</h2>
          <p>
            Atendimento de 08h às 18h. Parcelamos em até 10x sem juros. Nossa equipe te ajuda a
            escolher tamanho, modelo e o melhor combo pra você.
          </p>
        </div>
        <div className="brand-banner-actions">
          {generalWa && (
            <a className="hero-cta" href={generalWa} target="_blank" rel="noreferrer">
              Chama no Whats
            </a>
          )}
          <a className={`hero-cta${generalWa ? " ghost" : ""}`} href={CATALOG_URL} target="_blank" rel="noreferrer">
            Ver catálogo
          </a>
        </div>
      </section>

      <section id="contato" className="contact-section">
        <div className="section-heading">
          <p className="section-kicker">Atendimento</p>
          <h2>Chama no Whats 👇🏻</h2>
          <p>
            {mode === "wa_me"
              ? "Fala com a equipe Calangus e garante sua peça."
              : "Deixa seus dados que a gente te chama no WhatsApp."}
          </p>
        </div>
        {mode === "wa_me" ? (
          generalWa ? (
            <a className="hero-cta" href={generalWa} target="_blank" rel="noreferrer">
              Chama no Whats
            </a>
          ) : (
            <a className="hero-cta" href={CATALOG_URL} target="_blank" rel="noreferrer">
              Ver catálogo
            </a>
          )
        ) : sent ? (
          <p className="contact-ok">Recebemos! Em breve um vendedor te chama.</p>
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
              placeholder="O que você está buscando? (opcional)"
              rows={3}
            />
            {error && <p className="contact-error">{error}</p>}
            <button type="submit" disabled={busy}>
              {busy ? "Enviando…" : "Quero atendimento"}
            </button>
          </form>
        )}
      </section>

      <footer className="store-footer">
        <img src="/brand/logo-circle.png" alt="" width={36} height={36} />
        <span>Calangus Moda Jovem · Moda masculina • Acessórios • Perfumes</span>
      </footer>
    </div>
  );
}
