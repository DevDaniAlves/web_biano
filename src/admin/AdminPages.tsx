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
    provider: "meta" | "evolution";
    configured: boolean;
    hasAccessToken: boolean;
    phoneNumberId: string | null;
    wabaId: string | null;
    appId: string | null;
    embeddedConfigId: string | null;
    embeddedSignupUrl: string | null;
    webhookPath: string;
    boletoTemplate: string | null;
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

  async function load() {
    const row = await waApi.connection();
    setInfo(row);
    setInstanceName((prev) => prev || row.instanceName);
    setPhone((prev) => prev || row.defaultPhone || "");
  }

  async function loadMeta() {
    setMetaInfo(await waApi.metaStatus());
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
    loadHook().catch(() => {});
    const t = setInterval(() => {
      load().catch(() => {});
      loadMeta().catch(() => {});
      loadHook().catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, []);

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

  async function setProvider(provider: "meta" | "evolution") {
    setMetaBusy(true);
    setError("");
    try {
      await waApi.setMetaProvider(provider);
      await loadMeta();
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
  const provider = metaInfo?.provider ?? "evolution";

  return (
    <div className="admin-panel">
      <div className="admin-panel-head">
        <h1>Conectar WhatsApp</h1>
      </div>

      <h2>Meta Cloud API</h2>
      <p className="lede">
        Canal oficial (templates, webhook Graph). Provider ativo:{" "}
        <strong>{provider === "meta" ? "Meta" : "Evolution"}</strong>
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
      </div>
      {!metaInfo?.embeddedSignupUrl && (
        <p className="admin-hint-ok">
          Para o botão de cadastro: defina <code>META_APP_ID</code> e{" "}
          <code>META_EMBEDDED_CONFIG_ID</code> no .env da API.
        </p>
      )}
      <p className="lede">
        Webhook Meta: <code>{metaInfo?.webhookPath || "/whatsapp/webhook/meta"}</code>
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

      <h2 style={{ marginTop: "1.5rem" }}>Validar ngrok / webhook</h2>
      <p className="lede">
        Com o ngrok ligado, abra <code>/webhook/ping</code> na URL pública. Webhooks:{" "}
        <code>/whatsapp/webhook/evolution</code> e <code>/whatsapp/webhook/meta</code>
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
