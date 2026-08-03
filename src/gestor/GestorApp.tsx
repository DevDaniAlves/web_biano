import { Link } from "react-router-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Boleto, type BoletoStatus, type Job, type Stats } from "../api";
import { useTheme } from "../store/ThemeContext";
import "./gestor.css";

const STATUS_FILTERS: Array<BoletoStatus | "all"> = [
  "all",
  "pending",
  "sent",
  "failed",
  "skipped",
];

function money(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function brDate(ymd: string) {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ymd;
}

export default function GestorApp() {
  const { theme, toggle } = useTheme();
  const [stats, setStats] = useState<Stats | null>(null);
  const [boletos, setBoletos] = useState<Boleto[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filter, setFilter] = useState<BoletoStatus | "all">("all");
  const [busy, setBusy] = useState<
    "scrape" | "dispatch" | "import" | "reset" | "delete" | null
  >(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const pollRef = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const [s, b, j] = await Promise.all([
      api.stats(),
      api.boletos(filter === "all" ? undefined : filter),
      api.jobs(),
    ]);
    setStats(s);
    setBoletos(b);
    setJobs(j);
  }, [filter]);

  useEffect(() => {
    refresh().catch((e) => setToast({ text: String(e.message ?? e), error: true }));
  }, [refresh]);

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  function startJobPoll(jobId: string) {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      try {
        const job = await api.job(jobId);
        if (job.status === "success" || job.status === "failed") {
          if (pollRef.current) window.clearInterval(pollRef.current);
          setBusy(null);
          setToast({
            text:
              job.status === "success"
                ? `Scrape OK: ${job.rowsUpserted} boleto(s) salvos`
                : `Scrape falhou: ${job.message ?? "erro"}`,
            error: job.status === "failed",
          });
          await refresh();
        }
      } catch {
        /* ignore */
      }
    }, 2000);
  }

  async function onScrape() {
    setBusy("scrape");
    setToast(null);
    try {
      const { jobId } = await api.scrape();
      setToast({ text: `Scrape iniciado (${jobId.slice(0, 8)}…)` });
      startJobPoll(jobId);
      await refresh();
    } catch (e) {
      setBusy(null);
      setToast({ text: String((e as Error).message ?? e), error: true });
    }
  }

  async function onDispatch() {
    setBusy("dispatch");
    setToast(null);
    try {
      const r = await api.dispatch();
      setToast({
        text: `Disparo: ${r.sent} enviados · ${r.failed} falhas · ${r.skipped} ignorados`,
        error: r.failed > 0,
      });
      await refresh();
    } catch (e) {
      setToast({ text: String((e as Error).message ?? e), error: true });
    } finally {
      setBusy(null);
    }
  }

  async function onImport(file: File) {
    setBusy("import");
    setToast(null);
    try {
      const r = await api.importCsv(file);
      setToast({ text: `CSV importado: ${r.upserted}/${r.rows} salvos` });
      await refresh();
    } catch (e) {
      setToast({ text: String((e as Error).message ?? e), error: true });
    } finally {
      setBusy(null);
    }
  }

  async function onResetDispatch() {
    setBusy("reset");
    setToast(null);
    try {
      const r = await api.resetDispatch();
      setToast({ text: `Reset: ${r.reset} boleto(s) voltaram para pending` });
      await refresh();
    } catch (e) {
      setToast({ text: String((e as Error).message ?? e), error: true });
    } finally {
      setBusy(null);
    }
  }

  async function onDeleteAll() {
    if (!window.confirm("Apagar TODOS os boletos e jobs? Essa ação não tem volta.")) return;
    setBusy("delete");
    setToast(null);
    try {
      const r = await api.deleteAll();
      setToast({
        text: `Apagados: ${r.deletedBoletos} boleto(s) · ${r.deletedJobs} job(s)`,
      });
      await refresh();
    } catch (e) {
      setToast({ text: String((e as Error).message ?? e), error: true });
    } finally {
      setBusy(null);
    }
  }

  const pending = stats?.byStatus.pending?.count ?? 0;
  const sent = stats?.byStatus.sent?.count ?? 0;
  const failed = stats?.byStatus.failed?.count ?? 0;
  const skipped = stats?.byStatus.skipped?.count ?? 0;
  const canReset = sent + failed + skipped > 0;
  const totalBoletos = Object.values(stats?.byStatus ?? {}).reduce(
    (acc, s) => acc + (s.count ?? 0),
    0
  );
  const totalValor =
    Object.values(stats?.byStatus ?? {}).reduce((acc, s) => acc + (s.valor ?? 0), 0) || 0;

  return (
    <div className="gestor">
      <div className="gestor-top">
        <div style={{ display: "flex", gap: "0.85rem", alignItems: "center" }}>
          <Link to="/" className="gestor-back">
            ← Loja
          </Link>
          <Link to="/atendimento" className="gestor-back">
            WhatsApp
          </Link>
        </div>
        <button type="button" className="theme-toggle" onClick={toggle}>
          {theme === "dark" ? "Claro" : "Escuro"}
        </button>
      </div>
      <div className="app">
        <header className="hero">
          <div className="gestor-brand-row">
            <img src="/brand/logo-circle.png" alt="" width={44} height={44} />
            <h1 className="brand">
              Calangus <span>Gestor</span>
            </h1>
          </div>
          <p className="lead">
            Coleta o extrato de parcelas em aberto do Meu Crediário (filtro Hoje), grava no banco e
            dispara a mensagem de cobrança.
          </p>
          <div className="actions">
            <button className="btn btn-primary" disabled={!!busy} onClick={onScrape}>
              {busy === "scrape" ? "Coletando…" : "Coletar hoje (Playwright)"}
            </button>
            <button className="btn" disabled={!!busy || pending === 0} onClick={onDispatch}>
              {busy === "dispatch" ? "Disparando…" : `Disparar pending (${pending})`}
            </button>
            <button
              className="btn btn-ghost"
              disabled={!!busy || !canReset}
              onClick={onResetDispatch}
            >
              {busy === "reset" ? "Resetando…" : "Desmarcar envios (teste)"}
            </button>
            <button
              className="btn btn-ghost"
              disabled={!!busy}
              onClick={() => fileRef.current?.click()}
            >
              {busy === "import" ? "Importando…" : "Importar CSV"}
            </button>
            <button
              className="btn btn-danger"
              disabled={!!busy || totalBoletos === 0}
              onClick={onDeleteAll}
            >
              {busy === "delete" ? "Apagando…" : "Apagar todos"}
            </button>
            <input
              ref={fileRef}
              className="file-input"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onImport(f);
                e.target.value = "";
              }}
            />
          </div>
        </header>

        {toast && <p className={`toast${toast.error ? " error" : ""}`}>{toast.text}</p>}

        <section className="stats">
          <div className="stat">
            <label>Vencimento</label>
            <strong>{stats?.vencimento ? brDate(stats.vencimento) : "—"}</strong>
            <small>filtro do dia</small>
          </div>
          <div className="stat">
            <label>Pendentes</label>
            <strong>{pending}</strong>
            <small>{money(stats?.byStatus.pending?.valor ?? 0)}</small>
          </div>
          <div className="stat">
            <label>Enviados</label>
            <strong>{sent}</strong>
            <small>{failed} falhas</small>
          </div>
          <div className="stat">
            <label>Total do dia</label>
            <strong>{money(totalValor)}</strong>
            <small>soma valor vencimento</small>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Boletos de hoje</h2>
            <div className="filters">
              {STATUS_FILTERS.map((s) => (
                <button
                  key={s}
                  className={`chip${filter === s ? " active" : ""}`}
                  onClick={() => setFilter(s)}
                >
                  {s === "all" ? "todos" : s}
                </button>
              ))}
            </div>
          </div>
          <div className="table-wrap">
            {boletos.length === 0 ? (
              <p className="empty">Nenhum boleto. Colete com Playwright ou importe o CSV.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Telefone</th>
                    <th>Contrato</th>
                    <th>Parcela</th>
                    <th>Valor</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {boletos.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <div>{b.clienteNome}</div>
                        <small style={{ color: "var(--muted)" }}>{b.cpf}</small>
                      </td>
                      <td>{b.clienteTelefone || "—"}</td>
                      <td>{b.contrato}</td>
                      <td>{b.parcela}</td>
                      <td>{money(b.valorVencimento)}</td>
                      <td>
                        <span className={`badge ${b.status}`}>{b.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section className="jobs">
          {jobs.slice(0, 5).map((j) => (
            <div className="job" key={j.id}>
              <div>
                <strong>{j.status}</strong> · {j.message ?? "—"}
                <div className="meta">
                  {j.rowsFound} linhas · {j.rowsUpserted} salvos · {j.id.slice(0, 8)}
                </div>
              </div>
              <div className="meta">{new Date(j.createdAt).toLocaleString("pt-BR")}</div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
