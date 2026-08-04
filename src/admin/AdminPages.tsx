import { useEffect, useState } from "react";
import { waApi } from "../whatsapp/waApi";

function fmtDuration(sec: number | null) {
  if (sec == null) return "—";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return s ? `${m}min ${s}s` : `${m}min`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}min` : `${h}h`;
}

export function ReportsPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof waApi.reports>> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    waApi
      .reports()
      .then(setData)
      .catch((e) => setError(String(e.message)));
  }, []);

  const labels: Record<string, string> = {
    waiting: "Pendente",
    human: "Em atendimento",
    awaiting_rating: "Aguardando avaliação",
    closed: "Finalizado",
    bot: "Bot",
  };

  return (
    <div className="admin-panel">
      <div className="admin-panel-head">
        <h1>Relatórios WhatsApp</h1>
      </div>
      {error && <p className="admin-error">{error}</p>}
      {data && (
        <>
          <div className="admin-stats">
            <article>
              <span>Mensagens hoje</span>
              <strong>{data.messagesToday}</strong>
            </article>
            <article>
              <span>Tempo médio p/ assumir</span>
              <strong>{fmtDuration(data.avgAssumeSeconds)}</strong>
              <small style={{ color: "var(--muted)" }}>{data.assumeCount} conversas</small>
            </article>
            <article>
              <span>Média de avaliação</span>
              <strong>
                {data.avgRating != null ? data.avgRating.toFixed(1) : "—"}
              </strong>
            </article>
            <article>
              <span>Avaliações</span>
              <strong>{data.ratingsCount}</strong>
            </article>
          </div>

          <h2 style={{ marginTop: "1.5rem", fontSize: "1.05rem" }}>Tempo para assumir (por vendedor)</h2>
          <p className="lede" style={{ marginTop: 0 }}>
            Destinado a um vendedor: conta do disparo. Se outro assume após os 10 min: conta da
            disponibilização para todos.
          </p>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Vendedor</th>
                  <th>Conversas</th>
                  <th>Média</th>
                </tr>
              </thead>
              <tbody>
                {data.assumeBySeller.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ color: "var(--muted)" }}>
                      Ainda sem dados (passa a gravar nas próximas assumidas).
                    </td>
                  </tr>
                ) : (
                  data.assumeBySeller.map((s) => (
                    <tr key={s.sellerId}>
                      <td>{s.sellerName}</td>
                      <td>{s.count}</td>
                      <td>{fmtDuration(s.avgSeconds)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <h2 style={{ marginTop: "1.5rem", fontSize: "1.05rem" }}>Avaliações</h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Nota</th>
                  <th>Quantidade</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.ratingDistribution).map(([k, v]) => (
                  <tr key={k}>
                    <td>{k} ★</td>
                    <td>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 style={{ marginTop: "1.5rem", fontSize: "1.05rem" }}>Média por vendedor</h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Vendedor</th>
                  <th>Avaliações</th>
                  <th>Média</th>
                </tr>
              </thead>
              <tbody>
                {data.ratingsBySeller.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ color: "var(--muted)" }}>
                      Sem avaliações ainda
                    </td>
                  </tr>
                ) : (
                  data.ratingsBySeller.map((s) => (
                    <tr key={s.sellerId}>
                      <td>{s.sellerName}</td>
                      <td>{s.count}</td>
                      <td>{s.avgRating != null ? s.avgRating.toFixed(1) : "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <h2 style={{ marginTop: "1.5rem", fontSize: "1.05rem" }}>Últimas avaliações</h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Nota</th>
                  <th>Cliente</th>
                  <th>Vendedor</th>
                  <th>Quando</th>
                </tr>
              </thead>
              <tbody>
                {data.recentRatings.map((r, i) => (
                  <tr key={`${r.phone}-${i}`}>
                    <td>{r.rating} ★</td>
                    <td>
                      {r.contactName || r.phone}
                      {r.contactName ? (
                        <div style={{ color: "var(--muted)", fontSize: "0.75rem" }}>{r.phone}</div>
                      ) : null}
                    </td>
                    <td>{r.sellerName ?? "—"}</td>
                    <td>{new Date(r.at).toLocaleString("pt-BR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 style={{ marginTop: "1.5rem", fontSize: "1.05rem" }}>Status das conversas</h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Quantidade</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.byStatus).map(([k, v]) => (
                  <tr key={k}>
                    <td>{labels[k] ?? k}</td>
                    <td>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}


export function ConnectPage() {
  const [instanceName, setInstanceName] = useState("BIANO");
  const [info, setInfo] = useState<{
    instanceName: string;
    status: string;
    lastQr: string | null;
    credentialsOk: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
    setInstanceName(row.instanceName);
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
    loadHook().catch(() => {});
    const t = setInterval(() => {
      load().catch(() => {});
      loadHook().catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, []);

  async function connect() {
    setBusy(true);
    setError("");
    try {
      await waApi.connectInstance(instanceName);
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

  const open = /open|connected/i.test(info?.status ?? "");

  return (
    <div className="admin-panel">
      <div className="admin-panel-head">
        <h1>Conectar WhatsApp</h1>
      </div>
      <p className="lede">
        Credenciais da Evolution ficam no .env. Aqui você cria/conecta a instância e lê o QR.
      </p>
      {error && <p className="admin-error">{error}</p>}
      {info && (
        <p>
          Status:{" "}
          <span className={`connect-status${open ? " open" : ""}`}>{info.status}</span>
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
        <button type="button" disabled={busy || open} onClick={() => void connect()}>
          Conectar / Gerar QR
        </button>
        <button type="button" className="ghost" disabled={busy} onClick={() => void disconnect()}>
          Desconectar
        </button>
      </div>
      {!open && info?.lastQr && (
        <img
          className="admin-qr"
          src={info.lastQr.startsWith("data:") ? info.lastQr : `data:image/png;base64,${info.lastQr}`}
          alt="QR Code WhatsApp"
        />
      )}

      <h2 style={{ marginTop: "1.5rem" }}>Validar ngrok / webhook</h2>
      <p className="lede">
        Com o ngrok ligado, abra <code>/webhook/ping</code> na URL pública. Se aparecer abaixo, o
        túnel está ok. Webhook da Evolution: <code>/whatsapp/webhook/evolution</code>
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
