import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { clearSession, getStoredUser, getToken } from "../auth";
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
  const token = getToken();
  const user = getStoredUser();
  const { theme, toggle } = useTheme();

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  if (!embedded && user.role === "admin") {
    return <Navigate to="/admin/whatsapp/conversas" replace />;
  }

  function logout() {
    clearSession();
    navigate("/login");
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
            <button type="button" onClick={logout}>
              Sair
            </button>
          </nav>
        </header>
      )}
      <Inbox />
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

  async function load() {
    setUsers(await waApi.users());
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  return (
    <div className="admin-panel">
      <div className="admin-panel-head">
        <h2>Vendedores / usuários</h2>
      </div>
      <form
        className="admin-toolbar"
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          await waApi.createUser({ name, email, password, role: "seller" });
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
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <strong>{u.name}</strong>
                </td>
                <td>{u.email}</td>
                <td>
                  <span className={`admin-pill${u.role === "admin" ? " role-admin" : " ok"}`}>
                    {u.role === "admin" ? "Admin" : "Vendedor"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Inbox() {
  const user = getStoredUser();
  const [contacts, setContacts] = useState<WaContact[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [readOnly, setReadOnly] = useState(false);
  const [selectedFlags, setSelectedFlags] = useState<WaContact | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
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
    });
    setContacts(list);
  }

  async function openContact(id: string) {
    setError("");
    setSelectedId(id);
    setAttachOpen(false);
    try {
      const r = await waApi.messages(id);
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
    refreshContacts().catch((e) => setError(String(e.message)));
    const t = setInterval(() => {
      refreshContacts().catch(() => {});
    }, 8000);
    return () => clearInterval(t);
  }, [search, status]);

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
          <div className="wa-filters">
            {[
              { v: "", l: "Todos" },
              { v: "waiting", l: "Pendente" },
              { v: "human", l: "Atendimento" },
              { v: "awaiting_rating", l: "Avaliação" },
              { v: "closed", l: "Finalizado" },
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
