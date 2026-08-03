import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { waApi, type WaContact, type WaMessage, type WaQueue, type WaUser } from "./waApi";
import "./whatsapp.css";

type Tab = "chat" | "fila" | "users";

function mediaSrc(url: string | null) {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  const base = import.meta.env.VITE_API_URL ?? "";
  if (base && !base.startsWith("/")) return `${base.replace(/\/$/, "")}${url}`;
  return url.startsWith("/") ? url : `/${url}`;
}

export default function WhatsAppPage() {
  const [user, setUser] = useState<WaUser | null>(() => {
    try {
      const raw = localStorage.getItem("calangus-user");
      return raw ? (JSON.parse(raw) as WaUser) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem("calangus-token"));
  const [email, setEmail] = useState("vendedor@calangus.com");
  const [password, setPassword] = useState("calangus123");
  const [loginError, setLoginError] = useState("");
  const [tab, setTab] = useState<Tab>("chat");

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setLoginError("");
    try {
      const r = await waApi.login(email, password);
      localStorage.setItem("calangus-token", r.token);
      localStorage.setItem("calangus-user", JSON.stringify(r.user));
      setToken(r.token);
      setUser(r.user);
    } catch (err) {
      setLoginError(String((err as Error).message));
    }
  }

  function logout() {
    localStorage.removeItem("calangus-token");
    localStorage.removeItem("calangus-user");
    setToken(null);
    setUser(null);
  }

  if (!token || !user) {
    return (
      <div className="wa-login">
        <img src="/brand/logo-circle.png" alt="" width={72} height={72} />
        <h1>Atendimento Calangus</h1>
        <p>Login do vendedor / admin</p>
        <form onSubmit={onLogin}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Senha"
          />
          {loginError && <p className="wa-error">{loginError}</p>}
          <button type="submit">Entrar</button>
        </form>
        <Link to="/">← Loja</Link>
      </div>
    );
  }

  return (
    <div className="wa-shell">
      <header className="wa-top">
        <div>
          <strong>WhatsApp</strong>
          <span>{user.name}</span>
        </div>
        <nav>
          <button className={tab === "chat" ? "on" : ""} onClick={() => setTab("chat")}>
            Conversas
          </button>
          <button className={tab === "fila" ? "on" : ""} onClick={() => setTab("fila")}>
            Filas
          </button>
          {user.role === "admin" && (
            <button className={tab === "users" ? "on" : ""} onClick={() => setTab("users")}>
              Usuários
            </button>
          )}
          <Link to="/gestor">Gestor</Link>
          <button type="button" onClick={logout}>
            Sair
          </button>
        </nav>
      </header>
      {tab === "chat" && <Inbox user={user} />}
      {tab === "fila" && <QueuesTab />}
      {tab === "users" && user.role === "admin" && <UsersTab />}
    </div>
  );
}

function Inbox({ user }: { user: WaUser }) {
  const [contacts, setContacts] = useState<WaContact[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => contacts.find((c) => c.id === selectedId) ?? null,
    [contacts, selectedId]
  );

  async function refreshContacts() {
    const list = await waApi.contacts({
      search: search || undefined,
      status: status || undefined,
    });
    setContacts(list);
  }

  /** Abrir conversa = assumir (backend assumeOnOpen ao listar mensagens). */
  async function openContact(id: string) {
    setError("");
    setSelectedId(id);
    try {
      setMessages(await waApi.messages(id));
      await refreshContacts();
    } catch (e) {
      setError(String((e as Error).message));
      setSelectedId(null);
      setMessages([]);
    }
  }

  async function refreshMessages(id: string) {
    try {
      setMessages(await waApi.messages(id));
      await refreshContacts();
    } catch (e) {
      setError(String((e as Error).message));
    }
  }

  useEffect(() => {
    refreshContacts().catch((e) => setError(String(e.message)));
    const t = setInterval(() => {
      refreshContacts().catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [search, status]);

  useEffect(() => {
    if (!selectedId) return;
    const t = setInterval(() => {
      refreshMessages(selectedId).catch(() => {});
    }, 3000);
    return () => clearInterval(t);
  }, [selectedId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, selectedId]);

  async function send() {
    if (!selectedId || !text.trim()) return;
    setBusy(true);
    setError("");
    try {
      await waApi.sendText(selectedId, text.trim());
      setText("");
      await refreshMessages(selectedId);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function sendImage(file: File) {
    if (!selectedId) return;
    setBusy(true);
    setError("");
    try {
      await waApi.sendImage(selectedId, file, text.trim() || undefined);
      setText("");
      await refreshMessages(selectedId);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (!selectedId) return;
    await waApi.resolve(selectedId);
    setSelectedId(null);
    setMessages([]);
    await refreshContacts();
  }

  function statusLabel(c: WaContact) {
    if (c.status === "waiting") {
      if (c.offeredTo?.id === user.id) return "Para você";
      if (c.openToAll) return "Fila aberta";
      if (c.offeredTo) return `→ ${c.offeredTo.name}`;
      return "Na fila";
    }
    if (c.status === "human") return "Em atendimento";
    if (c.status === "closed") return "Finalizado";
    if (c.status === "bot") return "Bot";
    return c.status;
  }

  return (
    <div className={`wa-inbox${selectedId ? " has-chat" : ""}`}>
      <aside className="wa-list">
        <div className="wa-list-tools">
          <input
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            <option value="waiting">Na fila</option>
            <option value="human">Em atendimento</option>
            <option value="bot">Bot</option>
            <option value="closed">Finalizados</option>
          </select>
        </div>
        <p className="wa-hint">Clique na conversa para assumir</p>
        {error && !selectedId && <p className="wa-error pad">{error}</p>}
        <ul>
          {contacts.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={c.id === selectedId ? "active" : ""}
                onClick={() => void openContact(c.id)}
              >
                <div className="wa-avatar">{(c.name || c.phone).slice(0, 1).toUpperCase()}</div>
                <div className="wa-meta">
                  <strong>{c.name || c.phone}</strong>
                  <span>{c.lastMessagePreview || "—"}</span>
                </div>
                <div className="wa-side">
                  <em className={`st ${c.status}`}>{statusLabel(c)}</em>
                  {c.unreadCount > 0 && <b>{c.unreadCount}</b>}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="wa-chat">
        {!selected ? (
          <div className="wa-empty">Selecione uma conversa na lista para assumir</div>
        ) : (
          <>
            <div className="wa-chat-head">
              <button type="button" className="wa-back" onClick={() => setSelectedId(null)}>
                ←
              </button>
              <div>
                <strong>{selected.name || selected.phone}</strong>
                <span>
                  {selected.phone} · {statusLabel(selected)}
                </span>
              </div>
              <div className="wa-actions">
                {selected.status !== "closed" && (
                  <button type="button" onClick={() => void finish()}>
                    Finalizar
                  </button>
                )}
              </div>
            </div>
            <div className="wa-thread">
              {messages.map((m) => (
                <div key={m.id} className={`bubble ${m.direction}`}>
                  {m.type === "image" && m.mediaUrl && (
                    <a href={mediaSrc(m.mediaUrl) ?? "#"} target="_blank" rel="noreferrer">
                      <img src={mediaSrc(m.mediaUrl) ?? ""} alt="" />
                    </a>
                  )}
                  {m.body && <p>{m.body}</p>}
                  <small>
                    {new Date(m.createdAt).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {m.sentBy ? ` · ${m.sentBy.name}` : ""}
                  </small>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            {error && <p className="wa-error pad">{error}</p>}
            <div className="wa-composer">
              <button type="button" className="attach" onClick={() => fileRef.current?.click()}>
                📷
              </button>
              <input
                ref={fileRef}
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
                placeholder="Mensagem"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <button type="button" disabled={busy || !text.trim()} onClick={() => void send()}>
                Enviar
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function QueuesTab() {
  const [queues, setQueues] = useState<WaQueue[]>([]);
  const [name, setName] = useState("");

  async function load() {
    setQueues(await waApi.queues());
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  return (
    <div className="wa-admin">
      <h2>Filas de atendimento</h2>
      <form
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
      <ul>
        {queues.map((q) => (
          <li key={q.id}>{q.name}</li>
        ))}
      </ul>
    </div>
  );
}

function UsersTab() {
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
    <div className="wa-admin">
      <h2>Vendedores / usuários</h2>
      <form
        onSubmit={async (e) => {
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
      <ul>
        {users.map((u) => (
          <li key={u.id}>
            {u.name} · {u.email} · {u.role}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Evita warning se importado sem rota */
export function WhatsAppGate() {
  return <WhatsAppPage />;
}
