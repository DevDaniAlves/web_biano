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

export interface WaUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "seller";
}

export interface WaContact {
  id: string;
  phone: string;
  name: string | null;
  status: "bot" | "waiting" | "human" | "closed";
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  openToAll?: boolean;
  offeredToId?: string | null;
  assignedTo?: { id: string; name: string } | null;
  offeredTo?: { id: string; name: string } | null;
  queue?: { id: string; name: string } | null;
}

export interface WaMessage {
  id: string;
  contactId: string;
  direction: "in" | "out";
  type: string;
  body: string | null;
  mediaUrl: string | null;
  createdAt: string;
  sentBy?: { id: string; name: string } | null;
}

export interface WaQueue {
  id: string;
  name: string;
}

export const waApi = {
  login: (email: string, password: string) =>
    request<{ user: WaUser; token: string }>("/whatsapp/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<{ user: WaUser }>("/whatsapp/auth/me"),
  contacts: (q?: { status?: string; search?: string }) => {
    const p = new URLSearchParams();
    if (q?.status) p.set("status", q.status);
    if (q?.search) p.set("search", q.search);
    const qs = p.toString();
    return request<WaContact[]>(`/whatsapp/contacts${qs ? `?${qs}` : ""}`);
  },
  messages: (contactId: string) =>
    request<WaMessage[]>(`/whatsapp/messages?contactId=${encodeURIComponent(contactId)}`),
  sendText: (contactId: string, body: string) =>
    request<WaMessage>("/whatsapp/messages", {
      method: "POST",
      body: JSON.stringify({ contactId, body }),
    }),
  sendImage: async (contactId: string, file: File, caption?: string) => {
    const form = new FormData();
    form.append("contactId", contactId);
    form.append("file", file);
    if (caption) form.append("caption", caption);
    const res = await fetch(`${API}/whatsapp/messages/image`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? res.statusText);
    return data as WaMessage;
  },
  assign: (contactId: string, userId?: string, queueId?: string) =>
    request<WaContact>("/whatsapp/contacts/assign", {
      method: "POST",
      body: JSON.stringify({ contactId, userId, queueId }),
    }),
  resolve: (contactId: string) =>
    request("/whatsapp/contacts/resolve", {
      method: "POST",
      body: JSON.stringify({ contactId }),
    }),
  queues: () => request<WaQueue[]>("/whatsapp/queues"),
  createQueue: (name: string) =>
    request<WaQueue>("/whatsapp/queues", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  users: () => request<WaUser[]>("/whatsapp/users"),
  createUser: (data: { name: string; email: string; password: string; role?: string }) =>
    request<WaUser>("/whatsapp/users", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  agents: () => request<unknown[]>("/whatsapp/agents"),
  createAgent: (userId: string, queueId?: string | null) =>
    request("/whatsapp/agents", {
      method: "POST",
      body: JSON.stringify({ userId, queueId: queueId ?? null }),
    }),
};
