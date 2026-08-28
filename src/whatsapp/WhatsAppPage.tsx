import { useEffect, useMemo, useRef, useState, type FormEvent, type TouchEvent } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { canManageCatalog, clearSession, getStoredUser, getToken, setSession } from "../auth";
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

function canSeeAllMessages(user: WaUser | null | undefined) {
  return user?.role === "admin" || Boolean(user?.seeAllMessages);
}

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

function badgeMeta(
  status: ContactStatus,
  webhookPaused?: boolean,
  openToAll?: boolean,
  botFlow?: "atendimento" | "financeiro" | null,
  isBoletoReminder?: boolean
) {
  if (isBoletoReminder) {
    return { labels: [{ label: "LEMBRETE_BOLETO", className: "badge-boleto" }] };
  }
  if (webhookPaused) {
    return { labels: [{ label: "Manual", className: "badge-manual" }] };
  }
  switch (status) {
    case "waiting": {
      if (openToAll) {
        const labels = [{ label: "Pendente", className: "badge-pending" }];
        if (botFlow === "financeiro") {
          labels.push({ label: "Financeiro", className: "badge-finance" });
        }
        return { labels };
      }
      return { labels: [{ label: "Pendente", className: "badge-pending" }] };
    }
    case "human":
      return {
        labels: [
          { label: "Em atendimento", className: "badge-human" },
          ...(botFlow === "financeiro"
            ? [{ label: "Financeiro", className: "badge-finance" }]
            : []),
        ],
      };
    case "awaiting_rating":
      return { labels: [{ label: "Aguardando avaliação", className: "badge-rating" }] };
    case "closed":
      return { labels: [{ label: "Finalizado", className: "badge-closed" }] };
    default:
      return { labels: [{ label: "Bot", className: "badge-bot" }] };
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
      // Mensagens distintas no WhatsApp (ids diferentes) nunca são a mesma
      if (x.externalId && m.externalId && x.externalId !== m.externalId) return false;
      if (m.type === "image" || m.type === "video" || m.type === "document" || m.type === "audio") {
        // Arquivos diferentes = envios diferentes (multi-foto)
        const xu = x.mediaUrl || "";
        const mu = m.mediaUrl || "";
        if (xu && mu && xu !== mu && !xu.startsWith("blob:") && !mu.startsWith("blob:")) {
          return false;
        }
        // tmp blob vs server: pode ser o mesmo envio se o corpo bate
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
  const byId = new Map<string, WaMessage>();

  for (const m of prev) {
    byId.set(m.id, m);
  }

  for (const m of server) {
    const prevMsg = byId.get(m.id);
    byId.set(m.id, {
      ...m,
      delivery: (m.delivery ?? "sent") as "sent",
      // Não perder mediaUrl local se o poll vier sem (eco webhook incompleto)
      mediaUrl: m.mediaUrl || prevMsg?.mediaUrl || null,
      sentBy: m.sentBy || prevMsg?.sentBy || null,
    });
  }

  const all = [...byId.values()];
  const serverOut = all.filter((m) => !m.id.startsWith("tmp-") && m.direction === "out");
  const matchedServer = new Set<string>();

  const result = all.filter((m) => {
    if (!(m.id.startsWith("tmp-") || m.id.startsWith("ck-")) || m.delivery !== "pending") {
      return true;
    }
    const pt = new Date(m.createdAt).getTime();
    const match = serverOut.find((s) => {
      if (matchedServer.has(s.id)) return false;
      if (m.clientKey && s.clientKey) return m.clientKey === s.clientKey;
      if (m.clientKey && !s.clientKey && s.id === m.id) return true;
      if (s.type !== m.type) return false;
      if (Math.abs(new Date(s.createdAt).getTime() - pt) > 120_000) return false;
      if (m.type === "image" || m.type === "video" || m.type === "audio" || m.type === "document") {
        const pb = (m.body ?? "").trim();
        const sb = (s.body ?? "").trim();
        if (pb && sb && pb !== sb && !isMediaPlaceholder(pb) && !isMediaPlaceholder(sb)) {
          return false;
        }
        return true;
      }
      return (s.body ?? "") === (m.body ?? "");
    });
    if (match) {
      matchedServer.add(match.id);
      if (m.mediaUrl?.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(m.mediaUrl);
        } catch {
          /* ignore */
        }
      }
      return false;
    }
    return true;
  });

  return sortThread(dedupeOutMessages(result));
}

function WaHamburgerIcon({ open }: { open: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      {open ? (
        <path
          d="M6 6l12 12M18 6L6 18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M4 7h16M4 12h16M4 17h16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

export default function WhatsAppPage({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const token = getToken();
  const user = getStoredUser();
  const { theme, toggle } = useTheme();
  const [pwdOpen, setPwdOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

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

  const showCatalogManage = canManageCatalog(user);

  return (
    <div className={`wa-shell${embedded ? " embedded" : ""}${drawerOpen ? " wa-drawer-open" : ""}`}>
      {!embedded && (
        <>
          <header className="wa-top">
            <button
              type="button"
              className="wa-menu-btn"
              aria-label={drawerOpen ? "Fechar menu" : "Abrir menu"}
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen((v) => !v)}
            >
              <WaHamburgerIcon open={drawerOpen} />
            </button>
            <div className="wa-top-title">
              <strong>Atendimento</strong>
              <span>{user.name}</span>
            </div>
            <button type="button" className="theme-toggle wa-top-theme" onClick={toggle}>
              {theme === "dark" ? "Claro" : "Escuro"}
            </button>
          </header>
          <button
            type="button"
            className="wa-drawer-backdrop"
            aria-label="Fechar menu"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="wa-drawer">
            <nav>
              <Link to="/atendimento" onClick={() => setDrawerOpen(false)}>
                Conversas
              </Link>
              <Link to="/" onClick={() => setDrawerOpen(false)}>
                Ver catálogo (loja)
              </Link>
              {showCatalogManage && (
                <Link to="/atendimento/catalogo" onClick={() => setDrawerOpen(false)}>
                  Gerenciar catálogo
                </Link>
              )}
              <button type="button" onClick={() => { setDrawerOpen(false); setPwdOpen(true); }}>
                Alterar senha
              </button>
              <button type="button" onClick={logout}>
                Sair
              </button>
            </nav>
          </aside>
        </>
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
  const [createRole, setCreateRole] = useState<"seller" | "admin">("seller");
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
          await waApi.createUser({
            name: name.trim(),
            email,
            password,
            role: createRole,
            ...(createRole === "admin"
              ? { seeAllMessages: true, showInAttendantList: false }
              : {}),
          });
          setName("");
          setEmail("");
          setPassword("");
          setCreateRole("seller");
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
        <select
          value={createRole}
          onChange={(e) => setCreateRole(e.target.value as "seller" | "admin")}
          aria-label="Perfil"
        >
          <option value="seller">Vendedor</option>
          <option value="admin">Admin</option>
        </select>
        <button type="submit">Criar usuário</button>
      </form>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Perfil</th>
              <th>Ver todas</th>
              <th>Lista atendentes</th>
              <th>Atendimento</th>
              <th>Financeiro</th>
              <th>Catálogo</th>
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
                  <button
                    type="button"
                    className="ghost"
                    disabled={u.id === getStoredUser()?.id && u.role === "admin"}
                    title={
                      u.id === getStoredUser()?.id && u.role === "admin"
                        ? "Você não pode remover seu próprio admin"
                        : u.role === "admin"
                          ? "Tornar vendedor"
                          : "Tornar admin (acesso ao painel)"
                    }
                    onClick={() => {
                      const next = u.role === "admin" ? "seller" : "admin";
                      if (
                        next === "admin" &&
                        !confirm(`Dar acesso de admin a ${u.name}? Ele verá o painel completo.`)
                      ) {
                        return;
                      }
                      if (
                        next === "seller" &&
                        !confirm(`Remover admin de ${u.name}? Ele volta a ser só vendedor.`)
                      ) {
                        return;
                      }
                      void waApi.updateUser(u.id, { role: next }).then(() => load());
                    }}
                  >
                    {u.role === "admin" ? "Admin — rebaixar" : "Vendedor — promover"}
                  </button>
                </td>
                <td>
                  {u.role === "admin" ? (
                    <span className="admin-pill ok">Sim (admin)</span>
                  ) : (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() =>
                        void waApi
                          .updateUser(u.id, { seeAllMessages: !u.seeAllMessages })
                          .then(() => load())
                      }
                    >
                      {u.seeAllMessages ? "Sim — desligar" : "Não — ligar"}
                    </button>
                  )}
                </td>
                <td>
                  {u.role === "admin" ? (
                    <span className="admin-pill">—</span>
                  ) : (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() =>
                        void waApi
                          .updateUser(u.id, {
                            showInAttendantList: u.showInAttendantList === false,
                          })
                          .then(() => load())
                      }
                    >
                      {u.showInAttendantList === false ? "Não — ligar" : "Sim — desligar"}
                    </button>
                  )}
                </td>
                <td>
                  {u.role === "admin" ? (
                    <span className="admin-pill">—</span>
                  ) : (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() =>
                        void waApi
                          .updateUser(u.id, {
                            flowAtendimento: u.flowAtendimento === false,
                          })
                          .then(() => load())
                      }
                    >
                      {u.flowAtendimento === false ? "Não — ligar" : "Sim — desligar"}
                    </button>
                  )}
                </td>
                <td>
                  {u.role === "admin" ? (
                    <span className="admin-pill">—</span>
                  ) : (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() =>
                        void waApi
                          .updateUser(u.id, {
                            flowFinanceiro: !u.flowFinanceiro,
                          })
                          .then(() => load())
                      }
                    >
                      {u.flowFinanceiro ? "Sim — desligar" : "Não — ligar"}
                    </button>
                  )}
                </td>
                <td>
                  {u.role === "admin" ? (
                    <span className="admin-pill ok">Sim (admin)</span>
                  ) : (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() =>
                        void waApi
                          .updateUser(u.id, { canManageCatalog: !u.canManageCatalog })
                          .then(() => load())
                      }
                    >
                      {u.canManageCatalog ? "Sim — desligar" : "Não — ligar"}
                    </button>
                  )}
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
                  {u.id !== getStoredUser()?.id && (
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
            disponível. Folga/férias só impedem nova conexão exclusiva do bot (o vendedor continua
            ativo e pode atender). Horário de Brasília.
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
                      Nenhum intervalo — vendedor considerado disponível (folga só bloqueia conexão exclusiva)
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

          <h3 style={{ margin: "1.5rem 0 0.5rem" }}>Folgas / férias</h3>
          <p className="lede" style={{ marginTop: 0 }}>
            Durante a folga o vendedor continua ativo. Só não recebe conexão exclusiva do bot; se o
            cliente escolher esse nome, a conversa abre para a equipe.
          </p>
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
  const [user, setUser] = useState(() => getStoredUser());
  const seeAll = canSeeAllMessages(user);
  const [params] = useSearchParams();
  const contactParam = params.get("contact");
  const [contacts, setContacts] = useState<WaContact[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [readOnly, setReadOnly] = useState(false);
  const [selectedFlags, setSelectedFlags] = useState<WaContact | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(() =>
    canSeeAllMessages(getStoredUser()) ? "" : "active"
  );
  const [sellerId, setSellerId] = useState("");
  const [sellers, setSellers] = useState<WaUser[]>([]);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<WaMessage | null>(null);
  const [msgMenuId, setMsgMenuId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [lightbox, setLightbox] = useState<{ src: string; type: "image" | "video" } | null>(null);
  const [error, setError] = useState("");
  const [saveContactOpen, setSaveContactOpen] = useState(false);
  const [saveContactDraft, setSaveContactDraft] = useState("");
  const [assumeOpen, setAssumeOpen] = useState(false);
  const [assumeTarget, setAssumeTarget] = useState("");
  const [outreachOpen, setOutreachOpen] = useState(false);
  const [outreachContactId, setOutreachContactId] = useState("");
  const [outreachProduct, setOutreachProduct] = useState("");
  const [outreachFile, setOutreachFile] = useState<File | null>(null);
  const [outreachPreview, setOutreachPreview] = useState<string | null>(null);
  const [newBelowCount, setNewBelowCount] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const knownMsgIdsRef = useRef<Set<string>>(new Set());
  const galleryRef = useRef<HTMLInputElement>(null);
  /** Trava síncrona — evita Enter/clique duplo antes do setState. */
  const sendingRef = useRef(false);
  const finishingRef = useRef(false);
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
      sellerId: seeAll ? sellerId || undefined : undefined,
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
    setAssumeOpen(false);
    setSaveContactOpen(false);
    if (recording || recRef.current) {
      recCancelRef.current = true;
      recRef.current?.stop();
      setRecording(false);
    }
    try {
      // Admin só supervisiona (peek). seeAllMessages assume ao abrir (registra histórico).
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
    waApi
      .me()
      .then(({ user: u }) => {
        const token = getToken();
        if (!token) return;
        setSession(token, u);
        setUser(u);
        if (canSeeAllMessages(u) && status === "active") {
          setStatus("");
        }
      })
      .catch(() => {
        // 401 já limpa sessão e redireciona em waApi
      });
  }, []);

  useEffect(() => {
    if (!seeAll) return;
    waApi.users().then(setSellers).catch(() => {});
  }, [seeAll]);

  useEffect(() => {
    refreshContacts().catch((e) => setError(String(e.message)));
    const t = setInterval(() => {
      refreshContacts().catch(() => {});
    }, 8000);
    return () => clearInterval(t);
  }, [search, status, sellerId, seeAll]);

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
    stickToBottomRef.current = true;
    setNewBelowCount(0);
    knownMsgIdsRef.current = new Set();
    finishingRef.current = false;
    setFinishing(false);
  }, [selectedId]);

  useEffect(() => {
    const prev = knownMsgIdsRef.current;
    const fresh = messages.filter((m) => !prev.has(m.id));
    knownMsgIdsRef.current = new Set(messages.map((m) => m.id));

    if (stickToBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: prev.size === 0 ? "auto" : "smooth" });
      setNewBelowCount(0);
      return;
    }

    const inboundNew = fresh.filter(
      (m) => m.direction === "in" && !m.id.startsWith("tmp-")
    );
    if (inboundNew.length) {
      setNewBelowCount((n) => n + inboundNew.length);
    }
  }, [messages]);

  function onThreadScroll() {
    const el = threadRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    stickToBottomRef.current = nearBottom;
    if (nearBottom) setNewBelowCount(0);
  }

  function jumpToLatest() {
    stickToBottomRef.current = true;
    setNewBelowCount(0);
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }
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
    stickToBottomRef.current = true;
    setNewBelowCount(0);
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

  async function sendMediaFile(
    file: File,
    opts?: { caption?: string; keepBusy?: boolean; clientKey?: string }
  ) {
    if (!selectedId || readOnly) return;
    if (sendingRef.current && !opts?.keepBusy) return;
    sendingRef.current = true;
    setAttachOpen(false);
    setBusy(true);
    setError("");
    const kind = mediaKindOf(file);
    const caption =
      opts?.caption !== undefined
        ? opts.caption || undefined
        : kind === "audio"
          ? undefined
          : text.trim() || undefined;
    const tempId =
      opts?.clientKey ||
      `ck-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const localUrl = URL.createObjectURL(file);
    const optimistic: WaMessage = {
      id: tempId,
      contactId: selectedId,
      direction: "out",
      type: kind,
      body:
        caption ??
        (kind === "audio"
          ? "[áudio]"
          : kind === "video"
            ? "[vídeo]"
            : kind === "document"
              ? file.name
              : null),
      mediaUrl: localUrl,
      clientKey: tempId,
      createdAt: new Date().toISOString(),
      sentBy: user ? { id: user.id, name: user.name } : null,
      delivery: "pending",
    };
    if (opts?.caption === undefined && kind !== "audio") setText("");
    stickToBottomRef.current = true;
    setNewBelowCount(0);
    setMessages((prev) => [...prev, optimistic]);
    try {
      const toSend = kind === "image" ? await compressImage(file) : file;
      const msg = await waApi.sendImage(selectedId, toSend, caption, tempId);
      setMessages((prev) => {
        const next = prev.filter(
          (m) => m.id !== tempId && m.id !== msg.id && m.clientKey !== tempId
        );
        const mediaUrl = msg.mediaUrl || localUrl;
        if (msg.mediaUrl && localUrl.startsWith("blob:")) {
          try {
            URL.revokeObjectURL(localUrl);
          } catch {
            /* ignore */
          }
        }
        return [
          ...next,
          { ...msg, mediaUrl, clientKey: msg.clientKey || tempId, delivery: "sent" as const },
        ];
      });
      void refreshContacts();
    } catch (e) {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, delivery: "failed" as const } : m))
      );
      setError(String((e as Error).message));
      throw e;
    } finally {
      if (!opts?.keepBusy) {
        sendingRef.current = false;
        setBusy(false);
      }
    }
  }

  async function sendMediaFiles(files: File[]) {
    if (!selectedId || readOnly || sendingRef.current || files.length === 0) return;
    const contactId = selectedId;
    const list = [...files];
    const caption = text.trim();
    setText("");
    sendingRef.current = true;
    setBusy(true);
    setError("");
    setAttachOpen(false);
    stickToBottomRef.current = true;
    setNewBelowCount(0);

    const baseTs = Date.now();
    const batch = list.map((file, i) => {
      const kind = mediaKindOf(file);
      const clientKey = `ck-${baseTs}-${i}-${Math.random().toString(36).slice(2, 9)}`;
      const localUrl = URL.createObjectURL(file);
      const cap = i === 0 ? caption || undefined : undefined;
      const optimistic: WaMessage = {
        id: clientKey,
        contactId,
        direction: "out",
        type: kind,
        body:
          cap ??
          (kind === "audio"
            ? "[áudio]"
            : kind === "video"
              ? "[vídeo]"
              : kind === "document"
                ? file.name
                : null),
        mediaUrl: localUrl,
        clientKey,
        createdAt: new Date(baseTs + i).toISOString(),
        sentBy: user ? { id: user.id, name: user.name } : null,
        delivery: "pending",
      };
      return { file, kind, clientKey, localUrl, caption: cap, optimistic };
    });

    setMessages((prev) => [...prev, ...batch.map((b) => b.optimistic)]);

    // 1 request por imagem, em paralelo — cada uma com clientKey única
    await Promise.all(
      batch.map(async (b) => {
        try {
          const toSend = b.kind === "image" ? await compressImage(b.file) : b.file;
          const msg = await waApi.sendImage(contactId, toSend, b.caption, b.clientKey);
          setMessages((prev) => {
            const next = prev.filter(
              (m) =>
                m.id !== b.clientKey &&
                m.clientKey !== b.clientKey &&
                m.id !== msg.id
            );
            const mediaUrl = msg.mediaUrl || b.localUrl;
            if (msg.mediaUrl && b.localUrl.startsWith("blob:")) {
              try {
                URL.revokeObjectURL(b.localUrl);
              } catch {
                /* ignore */
              }
            }
            return [
              ...next,
              {
                ...msg,
                mediaUrl,
                clientKey: msg.clientKey || b.clientKey,
                delivery: "sent" as const,
              },
            ];
          });
        } catch (e) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === b.clientKey || m.clientKey === b.clientKey
                ? { ...m, delivery: "failed" as const }
                : m
            )
          );
          setError(String((e as Error).message));
        }
      })
    );

    sendingRef.current = false;
    setBusy(false);
    void refreshContacts();
    if (selectedId) void refreshMessages(selectedId, true);
  }

  function stopRecStream() {
    recStreamRef.current?.getTracks().forEach((t) => t.stop());
    recStreamRef.current = null;
    recRef.current = null;
  }

  function micErrorMessage(err: unknown): string {
    const name = err instanceof DOMException ? err.name : "";
    const msg = err instanceof Error ? err.message : String(err);
    if (name === "NotAllowedError" || name === "PermissionDeniedError" || msg === "MIC_DENIED") {
      return "Microfone bloqueado. Permita o microfone neste site (cadeado/ícone na barra do navegador ou Ajustes do app) e toque em gravar de novo.";
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return "Nenhum microfone encontrado neste aparelho.";
    }
    if (msg === "MIC_MUTED") {
      return "Microfone mudo ou sem som. Desative o mudo, autorize o microfone e grave novamente.";
    }
    if (msg === "MIC_SILENT") {
      return "Áudio sem som capturado. Autorize o microfone (ou fale mais perto) e grave de novo.";
    }
    if (msg === "MIC_SHORT") {
      return "Áudio muito curto. Segure a gravação por pelo menos 1 segundo.";
    }
    return msg || "Não foi possível gravar o áudio";
  }

  async function requestMicStream(): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Este navegador não permite gravar áudio.");
    }
    try {
      const perm = await navigator.permissions.query({ name: "microphone" as PermissionName });
      if (perm.state === "denied") throw new Error("MIC_DENIED");
    } catch (e) {
      if (e instanceof Error && e.message === "MIC_DENIED") throw e;
      // Permissions API indisponível (ex.: Safari) — segue no getUserMedia
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    const track = stream.getAudioTracks()[0];
    if (!track || track.readyState !== "live") {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error("MIC_DENIED");
    }
    if (!track.enabled) track.enabled = true;
    // Alguns browsers marcam muted no 1º instante
    if (track.muted) {
      await new Promise((r) => setTimeout(r, 250));
    }
    if (track.muted) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error("MIC_MUTED");
    }
    return stream;
  }

  async function toggleRecord() {
    if (recording) {
      recRef.current?.stop();
      setRecording(false);
      return;
    }
    if (readOnly || busy || sendingRef.current) return;
    setError("");
    try {
      const stream = await requestMicStream();
      recStreamRef.current = stream;

      // Medidor simples: rejeita gravação sem nível de áudio (mic bloqueado/mudo)
      let peak = 0;
      let levelStop = () => {};
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const src = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          src.connect(analyser);
          const data = new Uint8Array(analyser.frequencyBinCount);
          const tick = window.setInterval(() => {
            analyser.getByteFrequencyData(data);
            for (const v of data) if (v > peak) peak = v;
          }, 80);
          levelStop = () => {
            window.clearInterval(tick);
            void ctx.close().catch(() => {});
          };
        }
      } catch {
        /* medidor opcional */
      }

      const mime = MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
        ? "audio/ogg;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
            ? "audio/webm;codecs=opus"
            : "";
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      const chunks: Blob[] = [];
      const startedAt = Date.now();
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = () => {
        levelStop();
        stopRecStream();
        if (recCancelRef.current) {
          recCancelRef.current = false;
          return;
        }
        const elapsed = Date.now() - startedAt;
        const type = rec.mimeType || "audio/webm";
        const ext = type.includes("ogg") ? "ogg" : type.includes("mp4") ? "m4a" : "webm";
        const blob = new Blob(chunks, { type });
        if (elapsed < 700) {
          setError(micErrorMessage(new Error("MIC_SHORT")));
          return;
        }
        if (blob.size < 800) {
          setError(micErrorMessage(new Error("MIC_SILENT")));
          return;
        }
        // peak=0 se medidor falhou; só bloqueia quando medimos e ficou mudo
        if (peak > 0 && peak < 10) {
          setError(micErrorMessage(new Error("MIC_SILENT")));
          return;
        }
        const file = new File([blob], `audio-${Date.now()}.${ext}`, { type });
        void sendMediaFile(file);
      };
      rec.onerror = () => {
        levelStop();
        stopRecStream();
        setRecording(false);
        setError("Falha ao gravar áudio. Autorize o microfone e tente de novo.");
      };
      rec.start(250);
      recRef.current = rec;
      setRecording(true);
    } catch (e) {
      setError(micErrorMessage(e));
      stopRecStream();
      setRecording(false);
    }
  }

  async function finish() {
    if (!selectedId || finishingRef.current || busy) return;
    finishingRef.current = true;
    setFinishing(true);
    setBusy(true);
    setError("");
    try {
      await waApi.resolve(selectedId);
      await refreshMessages(selectedId, true);
      await refreshContacts();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      finishingRef.current = false;
      setFinishing(false);
      setBusy(false);
    }
  }

  async function assumeConversation() {
    if (!selectedId || !user || !assumeTarget) return;
    setBusy(true);
    setError("");
    try {
      const contact =
        assumeTarget === "__open__"
          ? await waApi.openToAll(selectedId)
          : await waApi.assign(selectedId, assumeTarget);
      setSelectedFlags(contact);
      setAssumeOpen(false);
      await refreshContacts();
      await refreshMessages(selectedId, true);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
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
      !confirm(
        "Ativar atendimento manual? O bot para de responder e você pode falar pelo CRM (mesmo se a conversa estava encerrada)."
      )
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

  function openOutreach() {
    setError("");
    setOutreachProduct("");
    setOutreachFile(null);
    if (outreachPreview) URL.revokeObjectURL(outreachPreview);
    setOutreachPreview(null);
    setOutreachContactId(selectedId || contacts[0]?.id || "");
    setOutreachOpen(true);
  }

  async function submitOutreach(e: FormEvent) {
    e.preventDefault();
    if (!outreachContactId || !outreachProduct.trim() || !outreachFile) {
      setError("Selecione o cliente, informe o produto e envie a foto");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await waApi.sendProductOutreach(outreachContactId, outreachProduct.trim(), outreachFile);
      setOutreachOpen(false);
      setOutreachProduct("");
      setOutreachFile(null);
      if (outreachPreview) URL.revokeObjectURL(outreachPreview);
      setOutreachPreview(null);
      await openContact(outreachContactId);
      await refreshContacts();
    } catch (err) {
      setError(String((err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  const flags = selectedFlags ?? selected;

  const outreachOptions = useMemo(() => {
    const map = new Map(contacts.map((c) => [c.id, c]));
    if (selected && !map.has(selected.id)) map.set(selected.id, selected);
    return [...map.values()];
  }, [contacts, selected]);

  return (
    <div className={`wa-inbox${selectedId ? " has-chat" : ""}`}>
      <aside className="wa-list">
        <div className="wa-list-head">
          <h2>Conversas</h2>
          <button
            type="button"
            className="wa-outreach-btn"
            disabled={busy || (contacts.length === 0 && !selectedId)}
            onClick={() => openOutreach()}
          >
            Entrar em contato
          </button>
        </div>
        <div className="wa-list-tools">
          <input
            placeholder="Buscar ou iniciar conversa"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {seeAll && (
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
              ...(seeAll
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
        {error && !selectedId && !outreachOpen && <p className="wa-error pad">{error}</p>}
        <ul>
          {contacts.map((c) => {
            const b = badgeMeta(c.status, c.webhookPaused, c.openToAll, c.botFlow, c.isBoletoReminder);
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
                    <span className="wa-badges">
                      {b.labels.map((x) => (
                        <em key={x.label} className={`wa-badge ${x.className}`}>
                          {x.label}
                        </em>
                      ))}
                    </span>
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
                  {selected.assignedTo?.name ? ` · Com: ${selected.assignedTo.name}` : ""}
                  {selected.botFlow === "financeiro"
                    ? " · Financeiro"
                    : selected.botFlow === "atendimento"
                      ? " · Atendimento"
                      : ""}
                  {selected.openToAll && selected.status === "waiting"
                    ? " · Aberta para equipe"
                    : ""}
                  {selected.rating != null ? ` · Nota ${selected.rating}` : ""}
                </span>
              </div>
              <div className="wa-actions">
                {seeAll &&
                  flags?.status !== "closed" &&
                  flags?.status !== "awaiting_rating" &&
                  (assumeOpen ? (
                    <div className="wa-assume-picker">
                      <select
                        value={assumeTarget}
                        onChange={(e) => setAssumeTarget(e.target.value)}
                        aria-label="Mover atendimento"
                        disabled={busy}
                      >
                        <option value="__open__">
                          {selected.botFlow === "financeiro"
                            ? "Disponível p/ equipe financeira"
                            : "Disponível p/ equipe (primeiro responde)"}
                        </option>
                        {user && (
                          <option value={user.id}>Eu — {user.name}</option>
                        )}
                        {sellers
                          .filter((s) => s.active !== false && s.id !== user?.id)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                              {s.role === "admin" ? " (admin)" : ""}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        disabled={busy || !assumeTarget}
                        onClick={() => void assumeConversation()}
                      >
                        Confirmar
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        disabled={busy}
                        onClick={() => setAssumeOpen(false)}
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setAssumeTarget(user?.id ?? "");
                        setAssumeOpen(true);
                        if (sellers.length === 0) {
                          waApi.users().then(setSellers).catch(() => {});
                        }
                      }}
                    >
                      Mover atendimento
                    </button>
                  ))}
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
                  <button type="button" className="ghost" disabled={busy || finishing} onClick={() => void warnIdle()}>
                    Avisar inatividade
                  </button>
                )}
                {flags?.status === "human" && !readOnly && !selected.webhookPaused && (
                  <button
                    type="button"
                    className={finishing ? "wa-finishing" : ""}
                    disabled={busy || finishing}
                    onClick={() => void finish()}
                  >
                    {finishing ? (
                      <>
                        <span className="wa-btn-spinner" aria-hidden />
                        Finalizando…
                      </>
                    ) : (
                      "Finalizar"
                    )}
                  </button>
                )}
                {flags?.canResolveInactivity && !readOnly && !selected.webhookPaused && (
                  <button
                    type="button"
                    className={finishing ? "wa-finishing" : ""}
                    disabled={busy || finishing}
                    onClick={() => void finish()}
                  >
                    {finishing ? (
                      <>
                        <span className="wa-btn-spinner" aria-hidden />
                        Finalizando…
                      </>
                    ) : (
                      "Finalizar por inatividade"
                    )}
                  </button>
                )}
              </div>
            </div>
            <div className="wa-thread-wrap">
              <div
                className="wa-thread"
                ref={threadRef}
                onScroll={onThreadScroll}
                onClick={() => setMsgMenuId(null)}
              >
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
              {newBelowCount > 0 && (
                <button
                  type="button"
                  className="wa-jump-latest"
                  onClick={jumpToLatest}
                  aria-label={`${newBelowCount} mensagens novas`}
                >
                  <span className="wa-jump-arrow" aria-hidden>
                    ↓
                  </span>
                  <span className="wa-jump-badge">{newBelowCount > 99 ? "99+" : newBelowCount}</span>
                </button>
              )}
            </div>
            {error && <p className="wa-error pad">{error}</p>}
            {readOnly ? (
              <div className="wa-readonly">
                Histórico — conversa encerrada
                {user?.role === "admin" ? (
                  <>
                    {" · "}
                    <button
                      type="button"
                      className="wa-readonly-link"
                      disabled={busy}
                      onClick={() => void toggleWebhookPause()}
                    >
                      Ativar atendimento manual
                    </button>
                  </>
                ) : null}
              </div>
            ) : (
              <div className="wa-composer-wrap">
                {selected.openToAll && selected.status === "waiting" && (
                  <p className="wa-open-queue-hint">
                    Conversa aberta para a equipe — envie uma mensagem para assumir o atendimento.
                  </p>
                )}
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
                  multiple
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ogg,.webm,.mp4,.mp3,.m4a"
                  hidden
                  onChange={(e) => {
                    const files = e.target.files ? Array.from(e.target.files) : [];
                    e.target.value = "";
                    if (files.length === 1) void sendMediaFile(files[0]);
                    else if (files.length > 1) void sendMediaFiles(files);
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

      {outreachOpen && (
        <div
          className="wa-outreach-overlay"
          role="dialog"
          aria-label="Entrar em contato"
          onClick={() => !busy && setOutreachOpen(false)}
        >
          <form
            className="wa-outreach-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => void submitOutreach(e)}
          >
            <h3>Entrar em contato</h3>
            <p className="wa-outreach-hint">
              Envia o template com a foto do produto e o nome. O cliente precisa ter o template{" "}
              <code>produto_disponivel</code> aprovado na Meta.
            </p>
            {error && <p className="wa-error">{error}</p>}
            <label>
              Cliente
              <select
                value={outreachContactId}
                onChange={(e) => setOutreachContactId(e.target.value)}
                required
              >
                <option value="">Selecione…</option>
                {outreachOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || c.phone} · {c.phone}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nome do produto
              <input
                value={outreachProduct}
                onChange={(e) => setOutreachProduct(e.target.value)}
                placeholder="Ex.: Vestido Floral M"
                required
                maxLength={60}
              />
            </label>
            <label>
              Foto do produto
              <input
                type="file"
                accept="image/*"
                required={!outreachFile}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  if (outreachPreview) URL.revokeObjectURL(outreachPreview);
                  setOutreachFile(f);
                  setOutreachPreview(f ? URL.createObjectURL(f) : null);
                }}
              />
            </label>
            {outreachPreview && (
              <img src={outreachPreview} alt="Prévia" className="wa-outreach-preview" />
            )}
            <div className="wa-outreach-actions">
              <button type="button" className="ghost" disabled={busy} onClick={() => setOutreachOpen(false)}>
                Cancelar
              </button>
              <button type="submit" disabled={busy || !outreachContactId || !outreachProduct.trim() || !outreachFile}>
                {busy ? "Enviando…" : "Enviar"}
              </button>
            </div>
          </form>
        </div>
      )}
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
