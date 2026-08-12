import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { waApi, type ReportsData } from "../whatsapp/waApi";
import { exportReportsCsv, exportReportsPdf, exportReportsXlsx } from "./reportExport";

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

function currentMonthValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type Preset = "today" | "week" | "month" | "custom";

export function ReportsPage() {
  const [data, setData] = useState<ReportsData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [preset, setPreset] = useState<Preset>("month");
  const [month, setMonth] = useState(currentMonthValue());
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [usage, setUsage] = useState<{
    total: number;
    billable: number;
    estimatedBrl: number;
    rateBrlPerMsg: number;
    bySource: Record<string, number>;
    byCategory: Record<string, number>;
    note: string;
  } | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const params =
        preset === "custom"
          ? { preset: "custom", from, to }
          : preset === "month"
            ? { preset: "month", month }
            : { preset };
      setData(await waApi.reports(params));
      try {
        setUsage(await waApi.usage());
      } catch {
        setUsage(null);
      }
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }, [preset, month, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const ratingChart = useMemo(
    () =>
      data
        ? Object.entries(data.ratingDistribution).map(([name, value]) => ({
            name: `${name}★`,
            value,
          }))
        : [],
    [data]
  );

  const sellerChart = useMemo(
    () =>
      data?.offerStatsBySeller.map((o) => {
        const a = data.assumeBySeller.find((x) => x.sellerId === o.sellerId);
        return {
          name: o.sellerName.split(" ")[0] ?? o.sellerName,
          assumidos: a?.count ?? 0,
          pegos: o.taken,
          vencidos: o.expired,
        };
      }) ?? [],
    [data]
  );

  const seriesChart = useMemo(() => {
    const rows = data?.seriesByDay ?? [];
    if (rows.length <= 21) return rows;
    // agrega por semana se período longo
    return rows;
  }, [data]);

  const labels: Record<string, string> = {
    waiting: "Pendente",
    human: "Em atendimento",
    awaiting_rating: "Aguardando avaliação",
    closed: "Finalizado",
    bot: "Bot",
  };

  async function onSeed() {
    setBusy(true);
    setError("");
    try {
      const r = await waApi.seedDemoReports(90);
      setError("");
      await load();
      alert(`Demo criado: ${r.created} conversas`);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-panel">
      <div className="admin-panel-head">
        <h1>Relatórios WhatsApp</h1>
      </div>

      <div className="report-filters">
        <div className="mode-toggle report-presets" role="group" aria-label="Período">
          {(
            [
              ["today", "Hoje"],
              ["week", "Esta semana"],
              ["month", "Este mês"],
              ["custom", "Período"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`mode-btn${preset === key ? " active" : ""}`}
              disabled={busy}
              onClick={() => setPreset(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {preset === "month" && (
          <label className="report-field">
            <span>Mês</span>
            <input
              type="month"
              value={month}
              disabled={busy}
              onChange={(e) => setMonth(e.target.value)}
            />
          </label>
        )}

        {preset === "custom" && (
          <>
            <label className="report-field">
              <span>De</span>
              <input
                type="date"
                value={from}
                disabled={busy}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="report-field">
              <span>Até</span>
              <input type="date" value={to} disabled={busy} onChange={(e) => setTo(e.target.value)} />
            </label>
          </>
        )}

        <button type="button" disabled={busy} onClick={() => void load()}>
          Atualizar
        </button>
        <button type="button" className="ghost" disabled={busy} onClick={() => void onSeed()}>
          Popular demo
        </button>
      </div>

      {data && (
        <div className="report-export">
          <span>{data.period?.label ?? "—"}</span>
          <button
            type="button"
            className="ghost"
            disabled={busy}
            onClick={() => exportReportsCsv(data)}
          >
            CSV
          </button>
          <button
            type="button"
            className="ghost"
            disabled={busy}
            onClick={() => void exportReportsXlsx(data)}
          >
            XLSX
          </button>
          <button
            type="button"
            className="ghost"
            disabled={busy}
            onClick={() => void exportReportsPdf(data)}
          >
            PDF
          </button>
        </div>
      )}

      {error && <p className="admin-error">{error}</p>}

      {data && (
        <>
          <div className="admin-stats">
            <article>
              <span>Atendimentos</span>
              <strong>{data.attendances}</strong>
            </article>
            <article>
              <span>Pegos de outros</span>
              <strong>{data.takenFromOthers}</strong>
              <small style={{ color: "var(--muted)" }}>após vencimento</small>
            </article>
            <article>
              <span>Ofertas vencidas</span>
              <strong>{data.expiredOffers}</strong>
              <small style={{ color: "var(--muted)" }}>10 min sem assume</small>
            </article>
            <article>
              <span>Tempo médio p/ assumir</span>
              <strong>{fmtDuration(data.avgAssumeSeconds)}</strong>
            </article>
            <article>
              <span>Média avaliação</span>
              <strong>{data.avgRating != null ? data.avgRating.toFixed(1) : "—"}</strong>
            </article>
            <article>
              <span>Avaliações</span>
              <strong>{data.ratingsCount}</strong>
            </article>
            <article>
              <span>Mensagens</span>
              <strong>{data.messagesInPeriod ?? data.messagesToday}</strong>
            </article>
          </div>

          {usage && (
            <>
              <h2 style={{ marginTop: "1.25rem" }}>Custo WhatsApp (Meta · previsão out/2026)</h2>
              <div className="admin-stats">
                <article>
                  <span>Enviadas (log)</span>
                  <strong>{usage.total}</strong>
                </article>
                <article>
                  <span>Faturáveis</span>
                  <strong>{usage.billable}</strong>
                </article>
                <article>
                  <span>Estimativa R$</span>
                  <strong>
                    {usage.estimatedBrl.toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </strong>
                  <small style={{ color: "var(--muted)" }}>
                    × R$ {usage.rateBrlPerMsg.toFixed(2)}/msg
                  </small>
                </article>
                <article>
                  <span>Por origem</span>
                  <strong style={{ fontSize: "0.95rem" }}>
                    {Object.entries(usage.bySource)
                      .map(([k, v]) => `${k}:${v}`)
                      .join(" · ") || "—"}
                  </strong>
                </article>
              </div>
              <p className="lede">{usage.note}</p>
            </>
          )}

          <div className="report-charts">
            <div className="report-chart">
              <h2>Volume diário</h2>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={seriesChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="assumes" name="Assumidos" stroke="#c62828" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="taken" name="Pegos" stroke="#2e7d32" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="expired" name="Vencidos" stroke="#ef6c00" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="report-chart">
              <h2>Avaliações (notas)</h2>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={ratingChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" name="Qtd" fill="#c62828" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="report-chart report-chart-wide">
              <h2>Por vendedor</h2>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={sellerChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="assumidos" name="Assumidos" fill="#455a64" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="pegos" name="Pegos" fill="#2e7d32" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="vencidos" name="Vencidos" fill="#ef6c00" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <h2 style={{ marginTop: "1.5rem", fontSize: "1.05rem" }}>Vendedores — assume / pegos / vencidos</h2>
          <p className="lede" style={{ marginTop: 0 }}>
            <strong>Pegos</strong>: atendimentos que outro vendedor assumiu após os 10 min.{" "}
            <strong>Vencidos</strong>: ofertas que expiraram (disponibilizadas a todos).
          </p>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Vendedor</th>
                  <th>Assumiu</th>
                  <th>Tempo médio</th>
                  <th>Pegos</th>
                  <th>Vencidos</th>
                  <th>Média ★</th>
                </tr>
              </thead>
              <tbody>
                {data.offerStatsBySeller.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ color: "var(--muted)" }}>
                      Sem dados no período. Use “Popular demo” para simular.
                    </td>
                  </tr>
                ) : (
                  data.offerStatsBySeller.map((o) => {
                    const a = data.assumeBySeller.find((x) => x.sellerId === o.sellerId);
                    const r = data.ratingsBySeller.find((x) => x.sellerId === o.sellerId);
                    return (
                      <tr key={o.sellerId}>
                        <td>{o.sellerName}</td>
                        <td>{a?.count ?? 0}</td>
                        <td>{fmtDuration(a?.avgSeconds ?? null)}</td>
                        <td>{o.taken}</td>
                        <td>{o.expired}</td>
                        <td>{r?.avgRating != null ? r.avgRating.toFixed(1) : "—"}</td>
                      </tr>
                    );
                  })
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
                {data.recentRatings.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ color: "var(--muted)" }}>
                      Sem avaliações no período
                    </td>
                  </tr>
                ) : (
                  data.recentRatings.map((r, i) => (
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
                  ))
                )}
              </tbody>
            </table>
          </div>

          <h2 style={{ marginTop: "1.5rem", fontSize: "1.05rem" }}>Status no período</h2>
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
