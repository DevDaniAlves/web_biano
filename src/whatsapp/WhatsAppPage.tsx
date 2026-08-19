import { useEffect, useMemo, useRef, useState, type FormEvent, type TouchEvent } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { clearSession, getStoredUser, getToken } from "../auth";
import ChangePasswordDialog from "../components/ChangePasswordDialog";
import PushPermissionBanner from "../components/PushPermissionBanner";
import { disablePushNotifications, showForegroundNotification, syncAppBadgeFromServer, bindPushResumeRefresh, enablePushNotifications } from "../push";
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
  if (url.startsWith("http") || url.startsWith("blob:")) return url;
  const base = import.meta.env.VITE_API_URL ?? "";
  const path = url.startsWith("/") ? url : `/${url}`;
  if (base && !base.startsWith("/")) return `${base.replace(/\/$/, "")}${path}`;
  return path;
}

function isMediaPlaceholder(body: string | null) {
  if (!body) return true;
  const t = body.replace(/\*/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  return /^(?:[^:]{1,48}: )?(\[(imagem|figurinha|áudio|audio|vídeo|video|documento)\]|\{imagem\})$/.test(t);
}

function quoteKindLabel(type: string, body: string | null) {
  if (body && !isMediaPlaceholder(body)) return body;
  if (type === "image" || type === "sticker") return "Imagem";
  if (type === "video") return "Vídeo";
  if (type === "audio") return "Áudio";
  if (type === "document") return "Documento";
  return body || "Mensagem";
}

function scrollToQuoted(messageId: string | null, externalId?: string | null) {
  const el =
    (messageId && document.getElementById(`msg-${messageId}`)) ||
    (externalId &&
      document.querySelector<HTMLElement>(`[data-ext="${CSS.escape(externalId)}"]`));
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("flash");
  window.setTimeout(() => el.classList.remove("flash"), 1400);
}

function formatDuration(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Bolha com responder: swipe (mobile), long-press, menu ⋮ (desktop). */
function ChatBubble(props: {
  m: WaMessage;
  selectedName: string;
  selectedPhone: string;
  messages: WaMessage[];
  readOnly: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onReply: () => void;
  onCloseMenu: () => void;
  onLightbox: (src: string, type: "image" | "video") => void;
}) {
  const {
    m,
    selectedName,
    selectedPhone,
    messages,
    readOnly,
    menuOpen,
    onToggleMenu,
    onReply,
    onCloseMenu,
    onLightbox,
  } = props;
  const delivery =
    m.delivery ?? (m.id.startsWith("tmp-") ? "pending" : m.direction === "out" ? "sent" : undefined);
  const quoted =
    m.quoted ??
    (m.quotedBody || m.quotedMediaUrl || m.quotedExternalId
      ? {
          messageId:
            messages.find((x) => {
              const a = x.externalId || "";
              const b = m.quotedExternalId || "";
              return (
                x.id === m.quotedExternalId ||
                (a && b && (a === b || a.endsWith(b) || b.endsWith(a)))
              );
            })?.id ?? null,
          type: m.quotedType || "text",
          body: m.quotedBody ?? null,
          mediaUrl: m.quotedMediaUrl ?? null,
          author: selectedName || selectedPhone,
        }
      : null);
  const src = mediaSrc(m.mediaUrl);
  const quotedSrc = mediaSrc(quoted?.mediaUrl ?? null);
  const showImage = (m.type === "image" || m.type === "sticker") && src;
  const showQuote = Boolean(quoted);
  const hideBody = isMediaPlaceholder(m.body);
  const quoteThumb =
    quotedSrc &&
    (quoted?.type === "image" || quoted?.type === "sticker" || quoted?.type === "video");
  const canReply = !readOnly && Boolean(m.externalId) && !m.id.startsWith("tmp-");

  const swipeX = useRef(0);
  const startX = useRef(0);
  const startY = useRef(0);
  const swiping = useRef(false);
  const longTimer = useRef<number | null>(null);
  const [offset, setOffset] = useState(0);

  function clearLong() {
    if (longTimer.current != null) {
      window.clearTimeout(longTimer.current);
      longTimer.current = null;
    }
  }

  function onTouchStart(e: TouchEvent) {
    if (!canReply) return;
    const t = e.touches[0];
    startX.current = t.clientX;
    startY.current = t.clientY;
    swipeX.current = 0;
    swiping.current = false;
    clearLong();
    longTimer.current = window.setTimeout(() => {
      longTimer.current = null;
      onToggleMenu();
    }, 480);
  }

  function onTouchMove(e: TouchEvent) {
    if (!canReply) return;
    const t = e.touches[0];
    const dx = t.clientX - startX.current;
    const dy = t.clientY - startY.current;
    if (!swiping.current && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
      swiping.current = true;
      clearLong();
      onCloseMenu();
    }
    if (!swiping.current) {
      if (Math.abs(dy) > 10 || Math.abs(dx) > 10) clearLong();
      return;
    }
    const dir = m.direction === "in" ? 1 : -1;
    const next = Math.max(0, Math.min(72, dx * dir));
    swipeX.current = next;
    setOffset(next);
  }

  function onTouchEnd() {
    clearLong();
    if (swiping.current && swipeX.current >= 48) onReply();
    swiping.current = false;
    swipeX.current = 0;
    setOffset(0);
  }

  return (
    <div className={`wa-msg-row ${m.direction}${menuOpen ? " menu-open" : ""}`}>
      <div className="wa-swipe-hint" aria-hidden>
        ↩
      </div>
      <div className="wa-msg-cluster">
        {canReply && m.direction === "out" && (
          <div className="wa-msg-actions">
            <button
              type="button"
              className="wa-msg-more"
              aria-label="Mais opções"
              onClick={(e) => {
                e.stopPropagation();
                onToggleMenu();
              }}
            >
              ⋮
            </button>
            {menuOpen && (
              <div className="wa-msg-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReply();
                  }}
                >
                  Responder
                </button>
              </div>
            )}
          </div>
        )}
        <div
          id={`msg-${m.id}`}
          data-ext={m.externalId || undefined}
          className={`bubble ${m.direction}${delivery === "pending" ? " pending" : ""}`}
          style={offset ? { transform: `translateX(${m.direction === "in" ? offset : -offset}px)` } : undefined}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
          onContextMenu={(e) => {
            if (!canReply) return;
            e.preventDefault();
            onToggleMenu();
          }}
        >
          {showQuote && quoted && (
            <button
              type="button"
              className="wa-quote"
              onClick={() => scrollToQuoted(quoted.messageId, m.quotedExternalId)}
            >
              <div className="wa-quote-body">
                <strong>{quoted.author || selectedName || selectedPhone}</strong>
                <span>{quoteKindLabel(quoted.type, quoted.body)}</span>
              </div>
              {quoteThumb && quotedSrc && (
                <img className="wa-quote-thumb" src={quotedSrc} alt="" />
              )}
            </button>
          )}
          {showImage && src && (
            <button type="button" className="wa-media-open" onClick={() => onLightbox(src, "image")}>
              <img src={src} alt="" />
            </button>
          )}
          {m.type === "audio" && src && <AudioBubble key={src} src={src} />}
          {m.type === "video" && src && (
            <button type="button" className="wa-media-open" onClick={() => onLightbox(src, "video")}>
              <video className="wa-video" src={src} preload="metadata" muted />
            </button>
          )}
          {m.type === "document" && src && (
            <a className="wa-file" href={src} target="_blank" rel="noreferrer">
              {m.body && !hideBody ? m.body : "Abrir documento"}
            </a>
          )}
          {m.body && !hideBody && m.type !== "document" && (
            <p>
              <RichText text={m.body} />
            </p>
          )}
          {!src && ["image", "sticker", "audio", "video", "document"].includes(m.type) && (
            <p>{m.body || `[${m.type}]`}</p>
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
        {canReply && m.direction === "in" && (
          <div className="wa-msg-actions">
            <button
              type="button"
              className="wa-msg-more"
              aria-label="Mais opções"
              onClick={(e) => {
                e.stopPropagation();
                onToggleMenu();
              }}
            >
              ⋮
            </button>
            {menuOpen && (
              <div className="wa-msg-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReply();
                  }}
                >
                  Responder
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AudioBubble({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    setFailed(false);
    setPlaying(false);
    setProgress(0);
    setDuration(0);
    const onTime = () => {
      setProgress(el.currentTime);
      if (el.duration && Number.isFinite(el.duration)) setDuration(el.duration);
    };
    const onMeta = () => {
      if (el.duration && Number.isFinite(el.duration)) setDuration(el.duration);
    };
    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
    };
    const onErr = () => setFailed(true);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("ended", onEnd);
    el.addEventListener("error", onErr);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("ended", onEnd);
      el.removeEventListener("error", onErr);
    };
  }, [src]);

  async function toggle() {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
      return;
    }
    await el.play().catch(() => {});
    setPlaying(true);
  }

  const pct = duration > 0 ? Math.min(100, (progress / duration) * 100) : 0;

  return (
    <div className="wa-audio-player">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button type="button" className="wa-audio-play" onClick={() => void toggle()} aria-label={playing ? "Pausar" : "Ouvir"} disabled={failed}>
        {playing ? "❚❚" : "▶"}
      </button>
      <div className="wa-audio-track">
        <div className="wa-audio-bar">
          <i style={{ width: `${pct}%` }} />
        </div>
        <span>{failed ? "Áudio indisponível" : `${formatDuration(progress)} / ${formatDuration(duration)}`}</span>
      </div>
    </div>
  );
}

function badgeMeta(status: ContactStatus, webhookPaused?: boolean) {
  if (webhookPaused) {
    return { label: "Manual", className: "badge-manual" };
  }
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

function sortThread(list: WaMessage[]): WaMessage[] {
  const arr = [...list].sort((a, b) => {
    const t = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (t !== 0) return t;
    if (a.direction === b.direction) return 0;
    return a.direction === "in" ? -1 : 1;
  });
  let swapped = true;
  while (swapped) {
    swapped = false;
    for (let i = 0; i < arr.length - 1; i++) {
      const a = arr[i];
      const b = arr[i + 1];
      const dt = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (a.direction === "out" && !a.sentBy && b.direction === "in" && dt >= 0 && dt <= 20_000) {
        arr[i] = b;
        arr[i + 1] = a;
        swapped = true;
      }
    }
  }
  return arr;
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
      const cur = out[dupIdx];
      const pick =
        (!cur.mediaUrl && m.mediaUrl) || (cur.id.startsWith("tmp-") && !m.id.startsWith("tmp-"))
          ? m
          : cur;
      out[dupIdx] = {
        ...pick,
        mediaUrl: m.mediaUrl || cur.mediaUrl,
        sentBy: m.sentBy || cur.sentBy,
        externalId: m.externalId || cur.externalId,
        quotedBody: pick.quotedBody || m.quotedBody || cur.quotedBody,
        quotedExternalId: pick.quotedExternalId || m.quotedExternalId || cur.quotedExternalId,
        delivery: pick.id.startsWith("tmp-") ? "pending" : (pick.delivery ?? "sent"),
      };
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
  if (pending.length === 0) return sortThread(mapped);

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
  return sortThread(dedupeOutMessages([...mapped, ...kept]));
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
  const [replyTo, setReplyTo] = useState<WaMessage | null>(null);
  const [msgMenuId, setMsgMenuId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [lightbox, setLightbox] = useState<{ src: string; type: "image" | "video" } | null>(null);
  const [error, setError] = useState("");
  const [saveContactOpen, setSaveContactOpen] = useState(false);
  const [saveContactDraft, setSaveContactDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  /** Trava síncrona — evita Enter/clique duplo antes do setState. */
  const sendingRef = useRef(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const recStreamRef = useRef<MediaStream | null>(null);
  const recCancelRef = useRef(false);

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
    setReplyTo(null);
    setMsgMenuId(null);
    if (recording || recRef.current) {
      recCancelRef.current = true;
      recRef.current?.stop();
      setRecording(false);
    }
    try {
      const r = await waApi.messages(id, { peek: user?.role === "admin" });
      setMessages(
        sortThread(dedupeOutMessages(r.messages.map((m) => ({ ...m, delivery: "sent" as const }))))
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
    void enablePushNotifications();
  }, []);

  useEffect(() => {
    return bindPushResumeRefresh();
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    function onMsg(event: MessageEvent) {
      if (event.data?.type === "wa-push") {
        const payload = event.data?.data as {
          title?: string;
          body?: string;
          tag?: string;
          url?: string;
          contactId?: string;
          alert?: boolean;
        };
        showForegroundNotification({
          title: payload?.title,
          body: payload?.body,
          tag: payload?.tag ?? payload?.contactId,
          url: payload?.url,
          alert: payload?.alert !== false,
        });
        void refreshContacts();
        const id = payload?.contactId;
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

  useEffect(() => {
    setSaveContactOpen(false);
    setSaveContactDraft("");
  }, [selectedId]);

  function startReply(m: WaMessage) {
    if (!m.externalId || m.id.startsWith("tmp-")) {
      setError("Aguarde a mensagem ser enviada para poder responder");
      return;
    }
    setReplyTo(m);
    setMsgMenuId(null);
    window.setTimeout(() => {
      document.querySelector<HTMLTextAreaElement>(".wa-composer textarea")?.focus();
    }, 50);
  }

  async function saveContact(e?: FormEvent) {
    e?.preventDefault();
    if (!selectedId || !saveContactDraft.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const updated = await waApi.saveContactName(selectedId, saveContactDraft.trim());
      setSelectedFlags(updated);
      setContacts((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
      setSaveContactOpen(false);
      setSaveContactDraft("");
    } catch (err) {
      setError(String((err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!selectedId || !text.trim() || readOnly || sendingRef.current) return;
    sendingRef.current = true;
    setBusy(true);
    const body = text.trim();
    const quoting = replyTo;
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
      quotedExternalId: quoting?.externalId ?? null,
      quotedBody: quoting?.body ?? null,
      quotedType: quoting?.type ?? null,
      quotedMediaUrl: quoting?.mediaUrl ?? null,
      quoted: quoting
        ? {
            messageId: quoting.id,
            type: quoting.type,
            body: quoting.body,
            mediaUrl: quoting.mediaUrl,
            author:
              quoting.direction === "out"
                ? user?.name || "Você"
                : selected?.name || selected?.phone || null,
          }
        : null,
    };
    setText("");
    setReplyTo(null);
    setMessages((prev) => [...prev, optimistic]);
    setError("");
    try {
      const msg = await waApi.sendText(selectedId, body, quoting?.id ?? null);
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
      if (quoting) setReplyTo(quoting);
      setError(String((e as Error).message));
    } finally {
      sendingRef.current = false;
      setBusy(false);
    }
  }

  function mediaKindOf(file: File): "image" | "audio" | "video" | "document" {
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("audio/")) return "audio";
    if (file.type.startsWith("video/")) return "video";
    return "document";
  }

  async function sendMediaFile(file: File) {
    if (!selectedId || readOnly || sendingRef.current) return;
    sendingRef.current = true;
    setAttachOpen(false);
    setBusy(true);
    setError("");
    const kind = mediaKindOf(file);
    const caption = kind === "audio" ? undefined : text.trim() || undefined;
    const tempId = `tmp-media-${Date.now()}`;
    const localUrl = URL.createObjectURL(file);
    const optimistic: WaMessage = {
      id: tempId,
      contactId: selectedId,
      direction: "out",
      type: kind,
      body: caption ?? (kind === "audio" ? "[áudio]" : kind === "video" ? "[vídeo]" : kind === "document" ? file.name : null),
      mediaUrl: localUrl,
      createdAt: new Date().toISOString(),
      sentBy: user ? { id: user.id, name: user.name } : null,
      delivery: "pending",
    };
    setText("");
    setMessages((prev) => [...prev, optimistic]);
    try {
      const toSend = kind === "image" ? await compressImage(file) : file;
      const msg = await waApi.sendImage(selectedId, toSend, caption);
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

  function stopRecStream() {
    recStreamRef.current?.getTracks().forEach((t) => t.stop());
    recStreamRef.current = null;
    recRef.current = null;
  }

  async function toggleRecord() {
    if (recording) {
      recRef.current?.stop();
      setRecording(false);
      return;
    }
    if (readOnly || busy || sendingRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recStreamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
        ? "audio/ogg;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
            ? "audio/webm;codecs=opus"
            : "";
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = () => {
        stopRecStream();
        if (recCancelRef.current) {
          recCancelRef.current = false;
          return;
        }
        const type = rec.mimeType || "audio/webm";
        const ext = type.includes("ogg") ? "ogg" : type.includes("mp4") ? "m4a" : "webm";
        const blob = new Blob(chunks, { type });
        if (blob.size < 200) return;
        const file = new File([blob], `audio-${Date.now()}.${ext}`, { type });
        void sendMediaFile(file);
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível gravar o áudio");
      stopRecStream();
      setRecording(false);
    }
  }

  async function finish() {
    if (!selectedId) return;
    await waApi.resolve(selectedId);
    await refreshMessages(selectedId, true);
    await refreshContacts();
  }

  async function restartBot() {
    if (!selectedId) return;
    if (!confirm("Reiniciar este cliente no menu do bot?")) return;
    setBusy(true);
    try {
      await waApi.restartBot(selectedId);
      await refreshMessages(selectedId, true);
      await refreshContacts();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function toggleWebhookPause() {
    if (!selectedId) return;
    const paused = !selected?.webhookPaused;
    if (
      paused &&
      !confirm("Tirar este cliente do webhook? O bot não vai mais responder — use o WhatsApp do celular.")
    ) {
      return;
    }
    setBusy(true);
    try {
      await waApi.webhookPause(selectedId, paused);
      await refreshMessages(selectedId, true);
      await refreshContacts();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
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
              ...(user?.role === "admin"
                ? [
                    { v: "bot", l: "Bot" },
                    { v: "manual", l: "Manual" },
                  ]
                : []),
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
            const b = badgeMeta(c.status, c.webhookPaused);
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
              <div className="wa-contact-title">
                <div className="wa-contact-name-row">
                  <strong>{selected.name || selected.phone}</strong>
                  {!selected.hasSavedContact && !saveContactOpen && (
                    <button
                      type="button"
                      className="wa-save-contact"
                      disabled={busy}
                      onClick={() => {
                        setSaveContactDraft(selected.pushName || selected.name || "");
                        setSaveContactOpen(true);
                      }}
                    >
                      Salvar contato
                    </button>
                  )}
                </div>
                {saveContactOpen && (
                  <form className="wa-save-contact-form" onSubmit={(e) => void saveContact(e)}>
                    <input
                      type="text"
                      value={saveContactDraft}
                      onChange={(e) => setSaveContactDraft(e.target.value)}
                      placeholder="Nome do cliente"
                      autoFocus
                      maxLength={120}
                    />
                    <button type="submit" disabled={busy || !saveContactDraft.trim()}>
                      Salvar
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      disabled={busy}
                      onClick={() => {
                        setSaveContactOpen(false);
                        setSaveContactDraft("");
                      }}
                    >
                      Cancelar
                    </button>
                  </form>
                )}
                <span>
                  {selected.phone}
                  {selected.hasSavedContact && selected.pushName && selected.pushName !== selected.savedName
                    ? ` · WhatsApp: ${selected.pushName}`
                    : ""}
                  {selected.rating != null ? ` · Nota ${selected.rating}` : ""}
                </span>
              </div>
              <div className="wa-actions">
                {user?.role === "admin" && (
                  <button type="button" className="ghost" disabled={busy} onClick={() => void toggleWebhookPause()}>
                    {selected.webhookPaused ? "Voltar ao webhook" : "Atendimento manual"}
                  </button>
                )}
                {user?.role === "admin" && !selected.webhookPaused && (
                  <button type="button" className="ghost" disabled={busy} onClick={() => void restartBot()}>
                    Reiniciar no bot
                  </button>
                )}
                {flags?.canWarnInactivity && !readOnly && !selected.webhookPaused && (
                  <button type="button" className="ghost" onClick={() => void warnIdle()}>
                    Avisar inatividade
                  </button>
                )}
                {flags?.status === "human" && !readOnly && !selected.webhookPaused && (
                  <button type="button" onClick={() => void finish()}>
                    Finalizar
                  </button>
                )}
                {flags?.canResolveInactivity && !readOnly && !selected.webhookPaused && (
                  <button type="button" onClick={() => void finish()}>
                    Finalizar por inatividade
                  </button>
                )}
              </div>
            </div>
            <div className="wa-thread" onClick={() => setMsgMenuId(null)}>
              {messages.map((m) => (
                <ChatBubble
                  key={m.id}
                  m={m}
                  selectedName={selected.name || ""}
                  selectedPhone={selected.phone}
                  messages={messages}
                  readOnly={readOnly}
                  menuOpen={msgMenuId === m.id}
                  onToggleMenu={() =>
                    setMsgMenuId((cur) => (cur === m.id ? null : m.id))
                  }
                  onReply={() => startReply(m)}
                  onCloseMenu={() => setMsgMenuId(null)}
                  onLightbox={(src, type) => setLightbox({ src, type })}
                />
              ))}
              <div ref={bottomRef} />
            </div>
            {error && <p className="wa-error pad">{error}</p>}
            {readOnly ? (
              <div className="wa-readonly">Histórico — conversa encerrada</div>
            ) : (
              <div className="wa-composer-wrap">
                {replyTo && (
                  <div className="wa-reply-bar">
                    <div className="wa-reply-bar-body">
                      <strong>
                        Respondendo a{" "}
                        {replyTo.direction === "out"
                          ? "você"
                          : selected.name || selected.phone}
                      </strong>
                      <span>{quoteKindLabel(replyTo.type, replyTo.body)}</span>
                    </div>
                    <button
                      type="button"
                      className="wa-reply-cancel"
                      aria-label="Cancelar resposta"
                      onClick={() => setReplyTo(null)}
                    >
                      ×
                    </button>
                  </div>
                )}
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
                        Foto, vídeo ou arquivo
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
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ogg,.webm,.mp4,.mp3,.m4a"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void sendMediaFile(f);
                    e.target.value = "";
                  }}
                />
                <textarea
                  rows={1}
                  placeholder={recording ? "Gravando áudio…" : busy ? "Enviando…" : "Mensagem"}
                  value={text}
                  disabled={busy || recording}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (!sendingRef.current) void send();
                    }
                  }}
                />
                {text.trim() ? (
                  <button type="button" disabled={busy} onClick={() => void send()}>
                    {busy ? "…" : "Enviar"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`wa-mic${recording ? " rec" : ""}`}
                    disabled={busy}
                    onClick={() => void toggleRecord()}
                    aria-label={recording ? "Parar e enviar áudio" : "Gravar áudio"}
                  >
                    {recording ? (
                      <span className="wa-mic-stop" />
                    ) : (
                      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
                        <path
                          fill="currentColor"
                          d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V20H9v2h6v-2h-2v-2.08A7 7 0 0 0 19 11h-2z"
                        />
                      </svg>
                    )}
                  </button>
                )}
              </div>
              </div>
            )}
            {cameraOpen && (
              <CameraCapture
                onClose={() => setCameraOpen(false)}
                onCapture={(file) => {
                  setCameraOpen(false);
                  void sendMediaFile(file);
                }}
              />
            )}
            {lightbox && (
              <div className="wa-lightbox" onClick={() => setLightbox(null)} role="presentation">
                <button type="button" className="wa-lightbox-close" onClick={() => setLightbox(null)} aria-label="Fechar">
                  ×
                </button>
                {lightbox.type === "video" ? (
                  <video src={lightbox.src} controls autoPlay onClick={(e) => e.stopPropagation()} />
                ) : (
                  <img src={lightbox.src} alt="" onClick={(e) => e.stopPropagation()} />
                )}
              </div>
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
