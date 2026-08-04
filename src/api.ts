const API = import.meta.env.VITE_API_URL ?? "/api";

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("calangus-token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...authHeaders(),
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? res.statusText);
  return data as T;
}

export type BoletoStatus = "pending" | "sent" | "failed" | "skipped";

export interface Boleto {
  id: string;
  cpf: string;
  clienteNome: string;
  clienteTelefone: string;
  codigoCliente: string;
  risco: string | null;
  contrato: string;
  parcela: string;
  vencimento: string;
  valorVencimento: number;
  situacao: string | null;
  status: BoletoStatus;
  dispatchError: string | null;
  dispatchedAt: string | null;
}

export interface Job {
  id: string;
  status: string;
  message: string | null;
  rowsFound: number;
  rowsUpserted: number;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface Stats {
  vencimento: string | null;
  byStatus: Record<string, { count: number; valor: number }>;
}

export const api = {
  health: () => request<{ ok: boolean }>("/health"),
  stats: () => request<Stats>("/boletos/stats?hoje=true"),
  boletos: (status?: string) =>
    request<Boleto[]>(`/boletos?hoje=true${status ? `&status=${status}` : ""}`),
  jobs: () => request<Job[]>("/jobs"),
  scrape: () => request<{ jobId: string }>("/scrape", { method: "POST" }),
  job: (id: string) => request<Job>(`/jobs/${id}`),
  dispatch: () =>
    request<{ sent: number; failed: number; skipped: number; total: number }>("/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hoje: true }),
    }),
  resetDispatch: () =>
    request<{ reset: number }>("/dispatch/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hoje: true }),
    }),
  deleteAll: () =>
    request<{ deletedBoletos: number; deletedJobs: number }>("/boletos", {
      method: "DELETE",
    }),
  importCsv: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API}/import/csv`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? res.statusText);
    return data as { jobId: string; rows: number; upserted: number };
  },
};
