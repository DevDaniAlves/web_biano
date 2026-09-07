import { useEffect, useState, type FormEvent } from "react";
import { api, type BusinessClosure } from "../api";
import "./admin.css";

function toBr(ymd: string) {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export default function ClosuresPage() {
  const [rows, setRows] = useState<BusinessClosure[]>([]);
  const [dateYmd, setDateYmd] = useState("");
  const [label, setLabel] = useState("");
  const [blockAttendance, setBlockAttendance] = useState(true);
  const [blockBoleto, setBlockBoleto] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  async function load() {
    setRows(await api.listClosures());
  }

  useEffect(() => {
    load().catch((e) => setError(String((e as Error).message)));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!dateYmd) {
      setError("Informe a data");
      return;
    }
    if (!blockAttendance && !blockBoleto) {
      setError("Marque ao menos um bloqueio (atendimento ou boleto)");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.createClosure({
        dateYmd,
        label: label.trim() || null,
        blockAttendance,
        blockBoleto,
      });
      setDateYmd("");
      setLabel("");
      setBlockAttendance(true);
      setBlockBoleto(true);
      setToast("Feriado cadastrado");
      await load();
    } catch (err) {
      setError(String((err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(
    row: BusinessClosure,
    field: "blockAttendance" | "blockBoleto",
    value: boolean
  ) {
    setBusy(true);
    setError("");
    try {
      await api.updateClosure(row.id, { [field]: value });
      await load();
    } catch (err) {
      setError(String((err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: BusinessClosure) {
    if (!confirm(`Remover ${toBr(row.dateYmd)}${row.label ? ` (${row.label})` : ""}?`)) return;
    setBusy(true);
    setError("");
    try {
      await api.deleteClosure(row.id);
      setToast("Removido");
      await load();
    } catch (err) {
      setError(String((err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-panel">
      <div className="admin-panel-head">
        <div>
          <h1>Feriados / sem expediente</h1>
          <p className="muted">
            Datas sem atendimento WhatsApp e/ou sem disparo de boleto. No próximo dia útil o
            Gestor acumula os vencimentos adiados.
          </p>
        </div>
      </div>

      {error ? <p className="admin-error">{error}</p> : null}
      {toast ? <p className="admin-ok">{toast}</p> : null}

      <form className="admin-toolbar" onSubmit={onCreate} style={{ flexWrap: "wrap", gap: "0.75rem" }}>
        <label>
          Data
          <input
            type="date"
            value={dateYmd}
            onChange={(e) => setDateYmd(e.target.value)}
            required
            disabled={busy}
          />
        </label>
        <label>
          Nome (opcional)
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ex.: Independência"
            disabled={busy}
          />
        </label>
        <label className="admin-check">
          <input
            type="checkbox"
            checked={blockAttendance}
            onChange={(e) => setBlockAttendance(e.target.checked)}
            disabled={busy}
          />
          Bloquear atendimento
        </label>
        <label className="admin-check">
          <input
            type="checkbox"
            checked={blockBoleto}
            onChange={(e) => setBlockBoleto(e.target.checked)}
            disabled={busy}
          />
          Bloquear disparo de boleto
        </label>
        <button type="submit" disabled={busy}>
          {busy ? "Salvando…" : "Cadastrar"}
        </button>
      </form>

      <p className="muted" style={{ margin: "0.5rem 0 1rem" }}>
        <strong>Bloquear atendimento</strong> = fluxo de fora do horário no WhatsApp.{" "}
        <strong>Bloquear boleto</strong> = Gestor não dispara; no próximo dia útil acumula os
        vencimentos.
      </p>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Nome</th>
              <th>Atendimento</th>
              <th>Boleto</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  Nenhum feriado cadastrado.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>{toBr(r.dateYmd)}</td>
                  <td>{r.label || "—"}</td>
                  <td>
                    <label className="admin-check">
                      <input
                        type="checkbox"
                        checked={r.blockAttendance}
                        disabled={busy}
                        onChange={(e) => void toggle(r, "blockAttendance", e.target.checked)}
                      />
                      Bloqueado
                    </label>
                  </td>
                  <td>
                    <label className="admin-check">
                      <input
                        type="checkbox"
                        checked={r.blockBoleto}
                        disabled={busy}
                        onChange={(e) => void toggle(r, "blockBoleto", e.target.checked)}
                      />
                      Bloqueado
                    </label>
                  </td>
                  <td>
                    <button type="button" className="ghost" disabled={busy} onClick={() => void remove(r)}>
                      Remover
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
