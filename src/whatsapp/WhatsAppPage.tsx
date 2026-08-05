import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { clearSession, getStoredUser, getToken } from "../auth";
import ChangePasswordDialog from "../components/ChangePasswordDialog";
import PushPermissionBanner from "../components/PushPermissionBanner";
import { disablePushNotifications, syncAppBadgeFromServer } from "../push";
import { useTheme } from "../store/ThemeContext";
import {
  waApi,
  type ContactStatus,
  type WaContact,
  type WaMessage,
  type WaQueue,
  type WaUser,
} from "./waApi";
import "./whatsapp.css";

function mediaSrc(url: string | null) {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  const base = import.meta.env.VITE_API_URL ?? "";
  if (base && !base.startsWith("/")) return `${base.replace(/\/$/, "")}${url}`;
  return url.startsWith("/") ? url : `/${url}`;
}

function badgeMeta(status: ContactStatus) {
  switch (status) {
    case "waiting":
      return { label: "Pendente", className: "badge-pending" };
    case "human":
      return { label: "Em atendimento", className: "badge-human" };
    case "awaiting_rating":
      return { label: "Aguardando avaliação", className: "badge-rating" };
    case "closed":
      return { label: "Finalizado", className: "badge-closed" };
    default:
      return { label: "Bot", className: "badge-bot" };
  }
}

function formatTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/** Reduz imagem antes do upload (mais rápido na Evolution). */
async function compressImage(file: File, maxSide = 1280, quality = 0.72): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1 && file.size < 400_000) return file;
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/** Renderiza *negrito* estilo WhatsApp no texto. */
function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*[^*]+\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("*") && p.endsWith("*") && p.length > 2 ? (
          <strong key={i}>{p.slice(1, -1)}</strong>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

function MsgTicks({ delivery }: { delivery?: "pending" | "sent" | "failed" }) {
  if (delivery === "pending") {
    return (
      <span className="wa-ticks pending" title="Enviando" aria-label="Enviando">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
          <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M8 4.5v4l2.5 1.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  if (delivery === "failed") {
    return <span className="wa-ticks failed" title="Falha">!</span>;
  }
  return (
    <span className="wa-ticks sent" title="Enviado" aria-label="Enviado">
      <svg viewBox="0 0 20 12" width="16" height="11" aria-hidden>
        <path
          d="M1.2 6.4l2.8 2.8L10.2 2.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M6.2 6.4l2.8 2.8L15.2 2.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function dedupeOutMessages(list: WaMessage[]): WaMessage[] {
  const out: WaMessage[] = [];
  for (const m of list) {
    if (m.direction !== "out") {
      out.push(m);
      continue;
    }
    const mt = new Date(m.createdAt).getTime();
    const dupIdx = out.findIndex((x) => {
      if (x.direction !== "out" || x.type !== m.type) return false;
      if (Math.abs(new Date(x.createdAt).getTime() - mt) > 8_000) return false;
      if (m.type === "image" || m.type === "video") {
        return (x.body ?? "") === (m.body ?? "") || (!x.body && !m.body);
      }
      return (x.body ?? "") === (m.body ?? "");
    });
    if (dupIdx >= 0) {
      // Preferência: id real (não tmp) e mais recente
      const cur = out[dupIdx];
      if (cur.id.startsWith("tmp-") && !m.id.startsWith("tmp-")) {
        out[dupIdx] = { ...m, delivery: m.delivery ?? "sent" };
      }
      continue;
    }
    out.push(m);
  }
  return out;
}

function mergeServerMessages(server: WaMessage[], prev: WaMessage[]): WaMessage[] {
  const mapped = dedupeOutMessages(
    server.map((m) => ({
      ...m,
      delivery: (m.delivery ?? "sent") as "sent",
    }))
  );
  const pending = prev.filter((m) => m.id.startsWith("tmp-") && m.delivery === "pending");
  if (pending.length === 0) return mapped;

  const kept = pending.filter((p) => {
    const pt = new Date(p.createdAt).getTime();
    return !mapped.some((s) => {
      if (s.direction !== "out" || s.type !== p.type) return false;
      const close = Math.abs(new Date(s.createdAt).getTime() - pt) < 90_000;
      if (!close) return false;
      if (p.type === "image") return true;
      return (s.body ?? "") === (p.body ?? "");
    });
  });
  return dedupeOutMessages([...mapped, ...kept]);
}

export default function WhatsAppPage({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const token = getToken();
  const user = getStoredUser();
  const { theme, toggle } = useTheme();
  const [pwdOpen, setPwdOpen] = useState(false);

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  if (!embedded && user.role === "admin") {
    return <Navigate to={`/admin/whatsapp/conversas${location.search}`} replace />;
  }

  function logout() {
    void disablePushNotifications().finally(() => {
      clearSession();
      navigate("/login");
    });
  }

  return (
    <div className={`wa-shell${embedded ? " embedded" : ""}`}>
      {!embedded && (
        <header className="wa-top">
          <div>
            <strong>Atendimento</strong>
            <span>{user.name}</span>
          </div>
          <nav>
            <button type="button" className="theme-toggle" onClick={toggle}>
              {theme === "dark" ? "Claro" : "Escuro"}
            </button>
            <Link to="/">Catálogo</Link>
            <button type="button" onClick={() => setPwdOpen(true)}>
              Alterar senha
            </button>
            <button type="button" onClick={logout}>
              Sair
            </button>
          </nav>
        </header>
      )}
      {!embedded && <PushPermissionBanner active />}
      <Inbox />
      {pwdOpen && <ChangePasswordDialog onClose={() => setPwdOpen(false)} />}
    </div>
  );
}

export function QueuesTab() {
  const [queues, setQueues] = useState<WaQueue[]>([]);
  const [name, setName] = useState("");

  async function load() {
    setQueues(await waApi.queues());
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  return (
    <div className="admin-panel">
      <div className="admin-panel-head">
        <h2>Filas de atendimento</h2>
      </div>
      <form
        className="admin-toolbar"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          await waApi.createQueue(name.trim());
          setName("");
          await load();
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nova fila" />
        <button type="submit">Criar</button>
      </form>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>ID</th>
            </tr>
          </thead>
          <tbody>
            {queues.map((q) => (
              <tr key={q.id}>
                <td>
                  <strong>{q.name}</strong>
                </td>
                <td style={{ color: "var(--muted)", fontSize: "0.78rem" }}>{q.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function UsersTab() {
  const [users, setUsers] = useState<WaUser[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [slots, setSlots] = useState<
    Array<{ id: string; dayOfWeek: number; startMin: number; endMin: number }>
  >([]);
  const [leaves, setLeaves] = useState<
    Array<{ id: string; type: string; label: string | null; startsAt: string; endsAt: string }>
  >([]);
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("12:00");
  const [leaveType, setLeaveType] = useState("ferias");
  const [leaveLabel, setLeaveLabel] = useState("");
  const [leaveStart, setLeaveStart] = useState("");
  const [leaveEnd, setLeaveEnd] = useState("");
  const [schedError, setSchedError] = useState("");

  const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  function minToHHMM(mins: number) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  function hhmmToMin(v: string) {
    const [h, m] = v.split(":").map(Number);
    return h * 60 + m;
  }

  async function load() {
    setUsers(await waApi.users());
  }

  async function loadSchedule(userId: string) {
    setSchedError("");
    const [s, l] = await Promise.all([waApi.getSchedule(userId), waApi.getLeaves(userId)]);
    setSlots(s);
    setLeaves(l);
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setSlots([]);
      setLeaves([]);
      return;
    }
    loadSchedule(selectedId).catch((e) => setSchedError(String(e.message)));
  }, [selectedId]);

  const selected = users.find((u) => u.id === selectedId) ?? null;

  return (
    <div className="admin-panel">
      <div className="admin-panel-head">
        <h2>Vendedores / usuários</h2>
      </div>
      <form
        className="admin-toolbar"
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          await waApi.createUser({ name: name.trim(), email, password, role: "seller" });
          setName("");
          setEmail("");
          setPassword("");
          await load();
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" required />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-mail"
          required
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Senha"
          required
        />
        <button type="submit">Criar vendedor</button>
      </form>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Perfil</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  {editingId === u.id ? (
                    <form
                      style={{ display: "flex", gap: 8, alignItems: "center" }}
                      onSubmit={(e) => {
                        e.preventDefault();
                        void waApi
                          .updateUser(u.id, { name: editName.trim() })
                          .then(() => {
                            setEditingId(null);
                            return load();
                          });
                      }}
                    >
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        required
                        autoFocus
                      />
                      <button type="submit">Salvar</button>
                      <button type="button" className="ghost" onClick={() => setEditingId(null)}>
                        Cancelar
                      </button>
                    </form>
                  ) : (
                    <strong>{u.name}</strong>
                  )}
                </td>
                <td>{u.email}</td>
                <td>
                  <span className={`admin-pill${u.role === "admin" ? " role-admin" : " ok"}`}>
                    {u.role === "admin" ? "Admin" : "Vendedor"}
                  </span>
                </td>
                <td>
                  <span className={`admin-pill${u.active === false ? "" : " ok"}`}>
                    {u.active === false ? "Inativo" : "Ativo"}
                  </span>
                </td>
                <td>
                  {editingId !== u.id && (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        setEditingId(u.id);
                        setEditName(u.name);
                      }}
                    >
                      Editar nome
                    </button>
                  )}
                  {u.role !== "admin" && (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() =>
                        void waApi.setUserActive(u.id, u.active === false).then(() => load())
                      }
                    >
                      {u.active === false ? "Ativar" : "Desativar"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setSelectedId(u.id === selectedId ? null : u.id)}
                  >
                    {u.id === selectedId ? "Fechar escala" : "Escala / folgas"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <section style={{ marginTop: "1.5rem" }}>
          <h3 style={{ margin: "0 0 0.5rem" }}>Escala de {selected.name}</h3>
          <p className="lede" style={{ marginTop: 0 }}>
            Intervalos de atendimento (ex.: Seg 08:00–12:00 e 13:00–18:00). Sem escala cadastrada =
            disponível (exceto folgas). Horário de Brasília.
          </p>
          {schedError && <p className="admin-error">{schedError}</p>}

          <form
            className="admin-toolbar"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await waApi.addSchedule(selected.id, {
                  dayOfWeek,
                  startMin: hhmmToMin(startTime),
                  endMin: hhmmToMin(endTime),
                });
                await loadSchedule(selected.id);
              } catch (err) {
                setSchedError(String((err as Error).message));
              }
            }}
          >
            <select value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))}>
              {DAY_LABELS.map((label, i) => (
                <option key={label} value={i}>
                  {label}
                </option>
              ))}
            </select>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            <button type="submit">Add intervalo</button>
          </form>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Dia</th>
                  <th>Início</th>
                  <th>Fim</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {slots.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ color: "var(--muted)" }}>
                      Nenhum intervalo — vendedor considerado disponível fora de folgas
                    </td>
                  </tr>
                ) : (
                  slots.map((s) => (
                    <tr key={s.id}>
                      <td>{DAY_LABELS[s.dayOfWeek]}</td>
                      <td>{minToHHMM(s.startMin)}</td>
                      <td>{minToHHMM(s.endMin)}</td>
                      <td>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() =>
                            void waApi.deleteSchedule(s.id).then(() => loadSchedule(selected.id))
                          }
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <h3 style={{ margin: "1.5rem 0 0.5rem" }}>Folgas / férias / inatividade</h3>
          <form
            className="admin-toolbar"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await waApi.addLeave(selected.id, {
                  type: leaveType,
                  label: leaveLabel || undefined,
                  startsAt: new Date(leaveStart).toISOString(),
                  endsAt: new Date(leaveEnd).toISOString(),
                });
                setLeaveLabel("");
                await loadSchedule(selected.id);
              } catch (err) {
                setSchedError(String((err as Error).message));
              }
            }}
          >
            <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
              <option value="ferias">Férias</option>
              <option value="folga">Folga</option>
              <option value="outro">Outro</option>
            </select>
            <input
              value={leaveLabel}
              onChange={(e) => setLeaveLabel(e.target.value)}
              placeholder="Observação"
            />
            <input
              type="datetime-local"
              value={leaveStart}
              onChange={(e) => setLeaveStart(e.target.value)}
              required
            />
            <input
              type="datetime-local"
              value={leaveEnd}
              onChange={(e) => setLeaveEnd(e.target.value)}
              required
            />
            <button type="submit">Add período</button>
          </form>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Início</th>
                  <th>Fim</th>
                  <th>Obs.</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {leaves.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ color: "var(--muted)" }}>
                      Nenhum período cadastrado
                    </td>
                  </tr>
                ) : (
                  leaves.map((l) => (
                    <tr key={l.id}>
                      <td>{l.type}</td>
                      <td>{new Date(l.startsAt).toLocaleString("pt-BR")}</td>
                      <td>{new Date(l.endsAt).toLocaleString("pt-BR")}</td>
                      <td>{l.label ?? "—"}</td>
                      <td>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() =>
                            void waApi.deleteLeave(l.id).then(() => loadSchedule(selected.id))
                          }
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function Inbox() {
  const user = getStoredUser();
  const [params] = useSearchParams();
  const contactParam = params.get("contact");
  const [contacts, setContacts] = useState<WaContact[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [readOnly, setReadOnly] = useState(false);
  const [selectedFlags, setSelectedFlags] = useState<WaContact | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(() =>
    getStoredUser()?.role === "admin" ? "" : "active"
  );
  const [sellerId, setSellerId] = useState("");
  const [sellers, setSellers] = useState<WaUser[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  /** Trava síncrona — evita Enter/clique duplo antes do setState. */
  const sendingRef = useRef(false);

  const selected = useMemo(
    () => contacts.find((c) => c.id === selectedId) ?? selectedFlags,
    [contacts, selectedId, selectedFlags]
  );

  async function refreshContacts() {
    const list = await waApi.contacts({
      search: search || undefined,
      status: status || undefined,
      sellerId: user?.role === "admin" ? sellerId || undefined : undefined,
    });
    setContacts(list);
    void syncAppBadgeFromServer();
  }

  async function openContact(id: string) {
    setError("");
    setSelectedId(id);
    setAttachOpen(false);
    try {
      const r = await waApi.messages(id, { peek: user?.role === "admin" });
      setMessages(
        dedupeOutMessages(r.messages.map((m) => ({ ...m, delivery: "sent" as const })))
      );
      setReadOnly(r.readOnly);
      setSelectedFlags(r.contact);
      void refreshContacts();
    } catch (e) {
      setError(String((e as Error).message));
      setSelectedId(null);
      setMessages([]);
    }
  }

  async function refreshMessages(id: string, peek = true) {
    try {
      const r = await waApi.messages(id, { peek });
      setMessages((prev) => mergeServerMessages(r.messages, prev));
      setReadOnly(r.readOnly);
      setSelectedFlags(r.contact);
    } catch (e) {
      setError(String((e as Error).message));
    }
  }

  useEffect(() => {
    if (user?.role !== "admin") return;
    waApi.users().then(setSellers).catch(() => {});
  }, [user?.role]);

  useEffect(() => {
    refreshContacts().catch((e) => setError(String(e.message)));
    const t = setInterval(() => {
      refreshContacts().catch(() => {});
    }, 8000);
    return () => clearInterval(t);
  }, [search, status, sellerId]);

  useEffect(() => {
    if (contactParam) void openContact(contactParam);
  }, [contactParam]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    function onMsg(event: MessageEvent) {
      if (event.data?.type === "wa-push") {
        void refreshContacts();
        const id = event.data?.data?.contactId as string | undefined;
        if (id && id === selectedId) void refreshMessages(id, true);
      }
      if (event.data?.type === "wa-open") {
        const raw = String(event.data.url ?? "");
        try {
          const id = new URL(raw, window.location.origin).searchParams.get("contact");
          if (id) void openContact(id);
        } catch {
          /* ignore */
        }
      }
    }
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const t = setInterval(() => {
      refreshMessages(selectedId, true).catch(() => {});
    }, 4000);
    return () => clearInterval(t);
  }, [selectedId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, selectedId]);

  async function send() {
    if (!selectedId || !text.trim() || readOnly || sendingRef.current) return;
    sendingRef.current = true;
    setBusy(true);
    const body = text.trim();
    const tempId = `tmp-${Date.now()}`;
    const optimistic: WaMessage = {
      id: tempId,
      contactId: selectedId,
      direction: "out",
      type: "text",
      body: user ? `*${user.name}:*\n${body}` : body,
      mediaUrl: null,
      createdAt: new Date().toISOString(),
      sentBy: user ? { id: user.id, name: user.name } : null,
      delivery: "pending",
    };
    setText("");
    setMessages((prev) => [...prev, optimistic]);
    setError("");
    try {
      const msg = await waApi.sendText(selectedId, body);
      setMessages((prev) => {
        const next = prev.filter((m) => m.id !== tempId && m.id !== msg.id);
        return [...next, { ...msg, delivery: "sent" as const }];
      });
      void refreshContacts();
    } catch (e) {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, delivery: "failed" as const } : m))
      );
      setText(body);
      setError(String((e as Error).message));
    } finally {
      sendingRef.current = false;
      setBusy(false);
    }
  }

  async function sendImage(file: File) {
    if (!selectedId || readOnly || sendingRef.current) return;
    sendingRef.current = true;
    setAttachOpen(false);
    setBusy(true);
    setError("");
    const caption = text.trim() || undefined;
    const tempId = `tmp-img-${Date.now()}`;
    const localUrl = URL.createObjectURL(file);
    const optimistic: WaMessage = {
      id: tempId,
      contactId: selectedId,
      direction: "out",
      type: "image",
      body: caption ?? null,
      mediaUrl: localUrl,
      createdAt: new Date().toISOString(),
      sentBy: user ? { id: user.id, name: user.name } : null,
      delivery: "pending",
    };
    setText("");
    setMessages((prev) => [...prev, optimistic]);
    try {
      const compressed = await compressImage(file);
      const msg = await waApi.sendImage(selectedId, compressed, caption);
      setMessages((prev) => {
        const next = prev.filter((m) => {
          if (m.id === tempId) {
            if (m.mediaUrl?.startsWith("blob:")) URL.revokeObjectURL(m.mediaUrl);
            return false;
          }
          return m.id !== msg.id;
        });
        return [...next, { ...msg, delivery: "sent" as const }];
      });
      void refreshContacts();
    } catch (e) {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, delivery: "failed" as const } : m))
      );
      setError(String((e as Error).message));
    } finally {
      sendingRef.current = false;
      setBusy(false);
    }
  }

  async function finish() {
    if (!selectedId) return;
    await waApi.resolve(selectedId);
    await refreshMessages(selectedId, true);
    await refreshContacts();
  }

  async function warnIdle() {
    if (!selectedId) return;
    setBusy(true);
    try {
      await waApi.warnInactivity(selectedId);
      await refreshMessages(selectedId, true);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  const flags = selectedFlags ?? selected;

  return (
    <div className={`wa-inbox${selectedId ? " has-chat" : ""}`}>
      <aside className="wa-list">
        <div className="wa-list-head">
          <h2>Conversas</h2>
        </div>
        <div className="wa-list-tools">
          <input
            placeholder="Buscar ou iniciar conversa"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {user?.role === "admin" && (
            <select
              className="wa-seller-filter"
              value={sellerId}
              onChange={(e) => setSellerId(e.target.value)}
              aria-label="Filtrar por vendedor"
            >
              <option value="">Todos os vendedores</option>
              {sellers
                .filter((s) => s.role === "seller" && s.active !== false)
                .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <div className="wa-filters">
            {[
              { v: "active", l: "Atendimento" },
              ...(user?.role === "admin" ? [{ v: "bot", l: "Bot" }] : []),
              { v: "waiting", l: "Pendente" },
              { v: "human", l: "Em andamento" },
              { v: "awaiting_rating", l: "Avaliação" },
              { v: "closed", l: "Finalizado" },
              { v: "", l: "Todos" },
            ].map((f) => (
              <button
                key={f.v || "all"}
                type="button"
                className={status === f.v ? "on" : ""}
                onClick={() => setStatus(f.v)}
              >
                {f.l}
              </button>
            ))}
          </div>
        </div>
        {error && !selectedId && <p className="wa-error pad">{error}</p>}
        <ul>
          {contacts.map((c) => {
            const b = badgeMeta(c.status);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className={c.id === selectedId ? "active" : ""}
                  onClick={() => void openContact(c.id)}
                >
                  <div className="wa-avatar">{(c.name || c.phone).slice(0, 1).toUpperCase()}</div>
                  <div className="wa-meta">
                    <div className="wa-meta-top">
                      <strong>{c.name || c.phone}</strong>
                      <time>{formatTime(c.lastMessageAt)}</time>
                    </div>
                    <span className="wa-preview">{c.lastMessagePreview || "—"}</span>
                    <em className={`wa-badge ${b.className}`}>{b.label}</em>
                  </div>
                  {c.unreadCount > 0 && <b className="wa-unread">{c.unreadCount}</b>}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <section className="wa-chat">
        {!selected ? (
          <div className="wa-empty">
            <img src="/brand/logo-circle.png" alt="" width={64} height={64} />
            <p>Selecione uma conversa para ver o histórico</p>
          </div>
        ) : (
          <>
            <div className="wa-chat-head">
              <button type="button" className="wa-back" onClick={() => setSelectedId(null)}>
                ←
              </button>
              <div className="wa-avatar sm">
                {(selected.name || selected.phone).slice(0, 1).toUpperCase()}
              </div>
              <div>
                <strong>{selected.name || selected.phone}</strong>
                <span>
                  {selected.phone}
                  {selected.rating != null ? ` · Nota ${selected.rating}` : ""}
                </span>
              </div>
              <div className="wa-actions">
                {flags?.canWarnInactivity && !readOnly && (
                  <button type="button" className="ghost" onClick={() => void warnIdle()}>
                    Avisar inatividade
                  </button>
                )}
                {flags?.status === "human" && !readOnly && (
                  <button type="button" onClick={() => void finish()}>
                    Finalizar
                  </button>
                )}
                {flags?.canResolveInactivity && !readOnly && (
                  <button type="button" onClick={() => void finish()}>
                    Finalizar por inatividade
                  </button>
                )}
              </div>
            </div>
            <div className="wa-thread">
              {messages.map((m) => {
                const delivery =
                  m.delivery ??
                  (m.id.startsWith("tmp-") ? "pending" : m.direction === "out" ? "sent" : undefined);
                return (
                  <div
                    key={m.id}
                    className={`bubble ${m.direction}${delivery === "pending" ? " pending" : ""}`}
                  >
                    {m.type === "image" && m.mediaUrl && (
                      <a href={mediaSrc(m.mediaUrl) ?? "#"} target="_blank" rel="noreferrer">
                        <img src={mediaSrc(m.mediaUrl) ?? ""} alt="" />
                      </a>
                    )}
                    {m.body && (
                      <p>
                        <RichText text={m.body} />
                      </p>
                    )}
                    <small>
                      <span>
                        {new Date(m.createdAt).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {m.direction === "out" && <MsgTicks delivery={delivery} />}
                    </small>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
            {error && <p className="wa-error pad">{error}</p>}
            {readOnly ? (
              <div className="wa-readonly">Histórico — conversa encerrada</div>
            ) : (
              <div className="wa-composer">
                <div className="wa-attach-wrap">
                  <button
                    type="button"
                    className="attach"
                    disabled={busy}
                    onClick={() => setAttachOpen((v) => !v)}
                    aria-label="Anexar"
                  >
                    +
                  </button>
                  {attachOpen && (
                    <div className="wa-attach-menu">
                      <button
                        type="button"
                        onClick={() => {
                          setAttachOpen(false);
                          galleryRef.current?.click();
                        }}
                      >
                        Galeria / arquivo
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAttachOpen(false);
                          setCameraOpen(true);
                        }}
                      >
                        Câmera
                      </button>
                    </div>
                  )}
                </div>
                <input
                  ref={galleryRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void sendImage(f);
                    e.target.value = "";
                  }}
                />
                <textarea
                  rows={1}
                  placeholder={busy ? "Enviando…" : "Mensagem"}
                  value={text}
                  disabled={busy}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (!sendingRef.current) void send();
                    }
                  }}
                />
                <button type="button" disabled={busy || !text.trim()} onClick={() => void send()}>
                  {busy ? "…" : "Enviar"}
                </button>
              </div>
            )}
            {cameraOpen && (
              <CameraCapture
                onClose={() => setCameraOpen(false)}
                onCapture={(file) => {
                  setCameraOpen(false);
                  void sendImage(file);
                }}
              />
            )}
          </>
        )}
      </section>
    </div>
  );
}

function CameraCapture({
  onClose,
  onCapture,
}: {
  onClose: () => void;
  onCapture: (file: File) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (!window.isSecureContext) {
        setErr("A câmera só funciona em HTTPS ou localhost.");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setErr("Este navegador não suporta câmera.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
          setReady(true);
        }
      } catch (e) {
        const name = e instanceof DOMException ? e.name : "";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          setErr("Permissão da câmera negada. Libere no cadeado da barra de endereço.");
        } else if (name === "NotFoundError") {
          setErr("Nenhuma câmera encontrada neste dispositivo.");
        } else {
          setErr(String((e as Error).message || e));
        }
      }
    }
    void start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  function snap() {
    const video = videoRef.current;
    if (!video || !ready) return;
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        onCapture(file);
      },
      "image/jpeg",
      0.85
    );
  }

  return (
    <div className="wa-camera-overlay" role="dialog" aria-label="Câmera">
      <div className="wa-camera-box">
        <header>
          <strong>Câmera</strong>
          <button type="button" onClick={onClose}>
            Fechar
          </button>
        </header>
        {err ? (
          <p className="wa-camera-err">{err}</p>
        ) : (
          <video ref={videoRef} playsInline muted autoPlay />
        )}
        <footer>
          <button type="button" className="ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="snap" disabled={!ready || !!err} onClick={snap}>
            Tirar foto
          </button>
        </footer>
      </div>
    </div>
  );
}
