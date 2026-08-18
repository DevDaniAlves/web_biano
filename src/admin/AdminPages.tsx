import { useEffect, useState } from "react";
import { waApi } from "../whatsapp/waApi";

export { ReportsPage } from "./ReportsPage";

function formatPairingCode(code: string) {
  const clean = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (clean.length === 8) return `${clean.slice(0, 4)}-${clean.slice(4)}`;
  return clean || code;
}

export function ConnectPage() {
  const [instanceName, setInstanceName] = useState("");
  const [phone, setPhone] = useState("");
  const [info, setInfo] = useState<{
    instanceName: string;
    status: string;
    lastQr: string | null;
    lastPairingCode?: string | null;
    credentialsOk: boolean;
    defaultPhone?: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [metaBusy, setMetaBusy] = useState(false);
  const [metaInfo, setMetaInfo] = useState<{
    provider: "meta" | "evolution" | "gupshup";
    configured: boolean;
    hasAccessToken: boolean;
    phoneNumberId: string | null;
    wabaId: string | null;
    appId: string | null;
    embeddedConfigId: string | null;
    embeddedSignupUrl: string | null;
    webhookPath: string;
    webhookUrl?: string | null;
    webhookVerifyTokenSet?: boolean;
    boletoTemplate: string | null;
  } | null>(null);
  const [gupshupInfo, setGupshupInfo] = useState<{
    provider: "meta" | "evolution" | "gupshup";
    configured: boolean;
    appName: string | null;
    appId?: string | null;
    source: string | null;
    wabaId: string | null;
    coexistenceEnabled: boolean;
    webhookUrl: string | null;
    boletoTemplateId: string | null;
  } | null>(null);
  const [hookStatus, setHookStatus] = useState<{
    hits: number;
    lastHitAt: string | null;
    recent: {
      at: string;
      path: string;
      method?: string;
      event?: string | null;
      from?: string | null;
      preview?: string | null;
    }[];
  } | null>(null);

  const [tplBusy, setTplBusy] = useState(false);
  const [templates, setTemplates] = useState<
    {
      id: string;
      name: string;
      status: string;
      language: string;
      category: string;
      rejectedReason?: string | null;
    }[]
  >([]);
  const [tplName, setTplName] = useState("boleto_lembrete");
  const [tplLang, setTplLang] = useState("pt_BR");
  const [tplBody, setTplBody] = useState("");
  const [tplMsg, setTplMsg] = useState("");

  async function load() {
    const row = await waApi.connection();
    setInfo(row);
    setInstanceName((prev) => prev || row.instanceName);
    setPhone((prev) => prev || row.defaultPhone || "");
  }

  async function loadMeta() {
    setMetaInfo(await waApi.metaStatus());
  }

  async function loadGupshup() {
    setGupshupInfo(await waApi.gupshupStatus());
  }

  async function loadTemplates() {
    try {
      const r = await waApi.metaTemplates();
      setTemplates(r.templates);
      if (!tplBody && r.defaultBoleto?.bodyText) {
        setTplBody(r.defaultBoleto.bodyText);
        setTplName(r.defaultBoleto.name || "boleto_lembrete");
        setTplLang(r.defaultBoleto.language || "pt_BR");
      }
    } catch (e) {
      setTplMsg(String((e as Error).message));
    }
  }

  async function loadHook() {
    try {
      const API = import.meta.env.VITE_API_URL ?? "/api";
      const res = await fetch(`${API}/webhook/status`);
      setHookStatus(await res.json());
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    load().catch((e) => setError(String(e.message)));
    loadMeta().catch(() => {});
    loadGupshup().catch(() => {});
    loadTemplates().catch(() => {});
    loadHook().catch(() => {});
    const t = setInterval(() => {
      load().catch(() => {});
      loadMeta().catch(() => {});
      loadGupshup().catch(() => {});
      loadHook().catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, []);

  async function saveTemplate(replaceExisting: boolean) {
    setTplBusy(true);
    setTplMsg("");
    setError("");
    try {
      await waApi.createMetaTemplate({
        name: tplName,
        language: tplLang,
        category: "UTILITY",
        bodyText: tplBody,
        bodyExamples: ["Maria", "129,90", "20/08/2026", "https://calangusmoda.crediario.digital/login"],
        replaceExisting,
      });
      setTplMsg(
        replaceExisting
          ? "Template recriado e enviado para análise da Meta."
          : "Template criado e enviado para análise da Meta."
      );
      await loadTemplates();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setTplBusy(false);
    }
  }

  async function removeTemplate(name: string) {
    if (!window.confirm(`Excluir template "${name}" na Meta?`)) return;
    setTplBusy(true);
    setTplMsg("");
    try {
      await waApi.deleteMetaTemplate(name);
      setTplMsg(`Template ${name} excluído.`);
      await loadTemplates();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setTplBusy(false);
    }
  }

  async function connect(byCode = false) {
    setBusy(true);
    setError("");
    try {
      if (byCode && !phone.replace(/\D/g, "")) {
        throw new Error("Informe o telefone com DDI e DDD para gerar o código");
      }
      await waApi.connectInstance(instanceName, byCode ? phone.replace(/\D/g, "") : undefined);
      await load();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await waApi.disconnectInstance();
      await load();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function setProvider(provider: "meta" | "evolution" | "gupshup") {
    setMetaBusy(true);
    setError("");
    try {
      await waApi.setMetaProvider(provider);
      await Promise.all([loadMeta(), loadGupshup()]);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setMetaBusy(false);
    }
  }

  const status = (info?.status ?? "").trim().toLowerCase();
  const open = status === "open" || status === "connected";
  const statusLabel =
    open ? "conectado" : status === "connecting" ? "conectando" : status === "close" || status === "closed" || status === "disconnected" ? "desconectado" : info?.status || "—";
  const provider = metaInfo?.provider ?? gupshupInfo?.provider ?? "evolution";
  const providerLabel =
    provider === "meta" ? "Meta" : provider === "gupshup" ? "Gupshup" : "Evolution";

  return (
    <div className="admin-panel">
      <div className="admin-panel-head">
        <h1>Conectar WhatsApp</h1>
      </div>

      <h2>Meta Cloud API</h2>
      <p className="lede">
        Canal oficial (templates, webhook Graph). Provider ativo:{" "}
        <strong>{providerLabel}</strong>
        {metaInfo?.configured ? " · credenciais OK" : " · configure token/Phone Number ID no .env"}
      </p>
      {metaInfo && (
        <p>
          Phone Number ID: <code>{metaInfo.phoneNumberId || "—"}</code>
          {" · "}
          WABA: <code>{metaInfo.wabaId || "—"}</code>
          {" · "}
          Template boleto: <code>{metaInfo.boletoTemplate || "—"}</code>
        </p>
      )}
      <div className="admin-toolbar">
        <button
          type="button"
          disabled={metaBusy || !metaInfo?.embeddedSignupUrl}
          onClick={() => {
            if (metaInfo?.embeddedSignupUrl) window.open(metaInfo.embeddedSignupUrl, "_blank");
          }}
        >
          Abrir cadastro Meta
        </button>
        <button
          type="button"
          disabled={metaBusy || !metaInfo?.configured || provider === "meta"}
          onClick={() => void setProvider("meta")}
        >
          Usar Meta
        </button>
        <button
          type="button"
          className="ghost"
          disabled={metaBusy || provider === "evolution"}
          onClick={() => void setProvider("evolution")}
        >
          Usar Evolution
        </button>
        <button
          type="button"
          disabled={metaBusy || !gupshupInfo?.configured || provider === "gupshup"}
          onClick={() => void setProvider("gupshup")}
        >
          Usar Gupshup
        </button>
      </div>
      {!gupshupInfo?.configured && (
        <p className="admin-hint-ok">
          Usar Gupshup só habilita depois de <code>GUPSHUP_API_KEY</code>,{" "}
          <code>GUPSHUP_APP_NAME</code> e <code>GUPSHUP_SOURCE</code> no .env da API (e restart).
        </p>
      )}
      {!metaInfo?.embeddedSignupUrl && (
        <p className="admin-hint-ok">
          Para o botão de cadastro: defina <code>META_APP_ID</code> e{" "}
          <code>META_EMBEDDED_CONFIG_ID</code> no .env da API.
        </p>
      )}
      <p className="lede">
        Callback URL na Meta (obrigatório HTTPS):{" "}
        <code>
          {metaInfo?.webhookUrl ||
            "https://apibiano-production.up.railway.app/whatsapp/webhook/meta"}
        </code>
      </p>
      <p className="admin-hint-ok">
        Em Developers → WhatsApp → Configuração → Webhook: cole essa URL, verify token ={" "}
        <code>META_WEBHOOK_VERIFY_TOKEN</code> do Railway, assine o campo <code>messages</code>.
        O painel da Meta pode listar eventos mesmo quando a entrega à sua API falha — Hits abaixo
        só sobem se o POST chegar aqui.
      </p>

      <h2 style={{ marginTop: "1.5rem" }}>Templates Meta (boleto)</h2>
      <p className="lede">
        Criar/recriar templates Utility na WABA (ex.: <code>boleto_lembrete</code>). Variáveis
        posicionais: <code>{"{{1}}"}</code> nome, <code>{"{{2}}"}</code> valor,{" "}
        <code>{"{{3}}"}</code> vencimento, <code>{"{{4}}"}</code> link. Texto precisa ser longo o
        bastante (Meta rejeita muitas variáveis em frase curta). Template aprovado não edita
        in-place — “Recriar” apaga e envia de novo.
      </p>
      {tplMsg && <p className="admin-hint-ok">{tplMsg}</p>}
      <div className="admin-toolbar" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
        <input
          value={tplName}
          onChange={(e) => setTplName(e.target.value)}
          placeholder="nome_template"
          style={{ maxWidth: "12rem" }}
        />
        <input
          value={tplLang}
          onChange={(e) => setTplLang(e.target.value)}
          placeholder="pt_BR"
          style={{ maxWidth: "6rem" }}
        />
        <button type="button" className="ghost" disabled={tplBusy} onClick={() => void loadTemplates()}>
          Atualizar lista
        </button>
      </div>
      <textarea
        value={tplBody}
        onChange={(e) => setTplBody(e.target.value)}
        rows={8}
        style={{ width: "100%", marginTop: "0.5rem", fontFamily: "inherit" }}
        placeholder="Corpo do template com {{1}} {{2}} {{3}} {{4}}"
      />
      <div className="admin-toolbar" style={{ marginTop: "0.5rem" }}>
        <button
          type="button"
          disabled={tplBusy || !tplName.trim() || !tplBody.trim()}
          onClick={() => void saveTemplate(false)}
        >
          Criar template
        </button>
        <button
          type="button"
          className="ghost"
          disabled={tplBusy || !tplName.trim() || !tplBody.trim()}
          onClick={() => {
            if (
              window.confirm(
                "Recriar apaga o template com esse nome na Meta e cria de novo (precisa nova aprovação). Continuar?"
              )
            ) {
              void saveTemplate(true);
            }
          }}
        >
          Recriar (editar)
        </button>
      </div>
      {templates.length > 0 && (
        <table className="admin-table" style={{ marginTop: "1rem", width: "100%" }}>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Idioma</th>
              <th>Categoria</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={`${t.id}-${t.language}`}>
                <td>
                  <button
                    type="button"
                    className="ghost"
                    style={{ padding: 0 }}
                    onClick={() => {
                      setTplName(t.name);
                      setTplLang(t.language || "pt_BR");
                    }}
                  >
                    {t.name}
                  </button>
                </td>
                <td>{t.language}</td>
                <td>{t.category}</td>
                <td>
                  {t.status}
                  {t.rejectedReason ? ` (${t.rejectedReason})` : ""}
                </td>
                <td>
                  <button
                    type="button"
                    className="ghost"
                    disabled={tplBusy}
                    onClick={() => void removeTemplate(t.name)}
                  >
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 style={{ marginTop: "1.5rem" }}>Gupshup</h2>
      <p className="lede">
        BSP (Access API). App e Coexistência (CoEx) são feitos no{" "}
        <a href="https://docs.gupshup.io/docs/onboarding-guide" target="_blank" rel="noreferrer">
          dashboard Gupshup
        </a>
        , não neste CRM. Provider ativo: <strong>{providerLabel}</strong>
        {gupshupInfo?.configured ? " · credenciais OK" : " · configure API key / app / source no .env"}
      </p>
      {gupshupInfo && (
        <p>
          App: <code>{gupshupInfo.appName || "—"}</code>
          {" · "}
          App ID: <code>{gupshupInfo.appId || "—"}</code>
          {" · "}
          Source: <code>{gupshupInfo.source || "—"}</code>
          {" · "}
          CoEx: <code>{gupshupInfo.coexistenceEnabled ? "sim" : "não"}</code>
          {" · "}
          Template boleto: <code>{gupshupInfo.boletoTemplateId || "—"}</code>
        </p>
      )}
      <p>
        Status:{" "}
        <strong>
          {gupshupInfo?.configured
            ? provider === "gupshup"
              ? "conectado (Gupshup ativo)"
              : "configurado (não ativo)"
            : "não configurado"}
        </strong>
      </p>
      <div className="admin-toolbar">
        <button
          type="button"
          disabled={metaBusy || !gupshupInfo?.configured || provider === "gupshup"}
          onClick={() => void setProvider("gupshup")}
        >
          Usar Gupshup
        </button>
      </div>
      <p className="lede">
        Callback URL no painel Gupshup:{" "}
        <code>
          {gupshupInfo?.webhookUrl ||
            "https://apibiano-production.up.railway.app/whatsapp/webhook/gupshup"}
        </code>
      </p>
      <p className="admin-hint-ok">
        Cole essa URL em Callback / webhook do app Access API. O BIANO só guarda IDs depois do Go
        Live. Evolution permanece como fallback (botão Usar Evolution acima).
      </p>

      <h2 style={{ marginTop: "1.5rem" }}>Evolution (QR)</h2>
      <p className="lede">
        Credenciais da Evolution ficam no .env. A instância abaixo é usada quando o provider é
        Evolution.
      </p>
      {error && <p className="admin-error">{error}</p>}
      {info && (
        <p>
          Instância{" "}
          <strong>{info.instanceName || "—"}</strong>
          {" · "}
          <span className={`connect-status${open ? " open" : ""}`}>{statusLabel}</span>
          {!info.credentialsOk && " · Configure WHATSAPP_API_URL e WHATSAPP_API_KEY"}
        </p>
      )}
      {open && (
        <p className="admin-hint-ok">
          WhatsApp já está conectado — por isso o QR não aparece. Para gerar um QR novo, clique em
          Desconectar e depois em Conectar / Gerar QR.
        </p>
      )}
      <div className="admin-toolbar">
        <input
          value={instanceName}
          onChange={(e) => setInstanceName(e.target.value)}
          placeholder="Nome da instância"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Telefone DDI+DDD (556634016000)"
          inputMode="tel"
        />
        <button type="button" disabled={busy || open || !instanceName.trim()} onClick={() => void connect(false)}>
          Conectar / Gerar QR
        </button>
        <button type="button" disabled={busy || open || !instanceName.trim()} onClick={() => void connect(true)}>
          Gerar código
        </button>
        <button type="button" className="ghost" disabled={busy} onClick={() => void disconnect()}>
          Desconectar
        </button>
      </div>
      {!open && info?.lastPairingCode && (
        <div className="admin-pairing">
          <span>Código para o WhatsApp</span>
          <strong>{formatPairingCode(info.lastPairingCode)}</strong>
          <p>
            No celular: WhatsApp → Aparelhos conectados → Conectar um aparelho →{" "}
            <em>Conectar com número de telefone</em> → cole este código.
          </p>
        </div>
      )}
      {!open && info?.lastQr && (
        <img
          className="admin-qr"
          src={info.lastQr.startsWith("data:") ? info.lastQr : `data:image/png;base64,${info.lastQr}`}
          alt="QR Code WhatsApp"
        />
      )}

      <h2 style={{ marginTop: "1.5rem" }}>Validar webhook</h2>
      <p className="lede">
        Meta (produção):{" "}
        <code>https://apibiano-production.up.railway.app/whatsapp/webhook/meta</code>
        . Gupshup:{" "}
        <code>https://apibiano-production.up.railway.app/whatsapp/webhook/gupshup</code>
        . Evolution/local: <code>/webhook/ping</code> no ngrok. Se Hits ficar 0 com a Meta
        mostrando “Carga”, a Callback URL na Meta está errada ou a entrega falhou.
      </p>
      <p>
        Hits: <strong>{hookStatus?.hits ?? 0}</strong>
        {hookStatus?.lastHitAt
          ? ` · último: ${new Date(hookStatus.lastHitAt).toLocaleString("pt-BR")}`
          : " · nenhum hit ainda"}
      </p>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Path</th>
              <th>Evento</th>
              <th>De</th>
              <th>Preview</th>
            </tr>
          </thead>
          <tbody>
            {(hookStatus?.recent ?? []).map((h, i) => (
              <tr key={`${h.at}-${i}`}>
                <td>{new Date(h.at).toLocaleTimeString("pt-BR")}</td>
                <td>{h.path}</td>
                <td>{h.event ?? "—"}</td>
                <td style={{ fontSize: "0.75rem" }}>{h.from ?? "—"}</td>
                <td>{h.preview ?? "—"}</td>
              </tr>
            ))}
            {(hookStatus?.recent?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={5} style={{ color: "var(--muted)" }}>
                  Nenhum request recebido ainda
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CatalogAdminPage() {
  const [products, setProducts] = useState<
    {
      id: string;
      name: string;
      description: string | null;
      price: number;
      imageUrl: string | null;
      active: boolean;
    }[]
  >([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setProducts(await waApi.adminProducts());
  }

  useEffect(() => {
    load().catch((e) => setError(String(e.message)));
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await waApi.createProduct({
        name,
        price: Number(price),
        description: description || undefined,
        imageUrl: imageUrl || undefined,
      });
      setName("");
      setPrice("");
      setDescription("");
      setImageUrl("");
      await load();
    } catch (err) {
      setError(String((err as Error).message));
    }
  }

  return (
    <div className="admin-panel">
      <div className="admin-panel-head">
        <h1>Catálogo</h1>
      </div>
      {error && <p className="admin-error">{error}</p>}
      <form className="admin-toolbar" onSubmit={(e) => void create(e)}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" required />
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Preço"
          required
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descrição"
        />
        <input
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="URL da imagem"
        />
        <button type="submit">Adicionar</button>
      </form>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th />
              <th>Nome</th>
              <th>Preço</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.imageUrl ? (
                    <img className="admin-thumb" src={p.imageUrl} alt="" />
                  ) : (
                    <div className="admin-thumb" />
                  )}
                </td>
                <td>
                  <strong>{p.name}</strong>
                  {p.description && (
                    <div style={{ color: "var(--muted)", fontSize: "0.78rem" }}>
                      {p.description}
                    </div>
                  )}
                </td>
                <td>
                  {p.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </td>
                <td>
                  <span className={`admin-pill${p.active ? " ok" : " warn"}`}>
                    {p.active ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td>
                  <div className="actions">
                    <button
                      type="button"
                      className="ghost"
                      onClick={() =>
                        void waApi.updateProduct(p.id, { active: !p.active }).then(load)
                      }
                    >
                      {p.active ? "Desativar" : "Ativar"}
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => void waApi.deleteProduct(p.id).then(load)}
                    >
                      Remover
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
