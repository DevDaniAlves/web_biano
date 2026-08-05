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

export type ContactStatus = "bot" | "waiting" | "human" | "awaiting_rating" | "closed";

export type ReportsData = {
  period?: { from: string; to: string; label: string; preset: string };
  byStatus: Record<string, number>;
  avgRating: number | null;
  ratingsCount: number;
  ratingDistribution: Record<string, number>;
  ratingsBySeller: Array<{
    sellerId: string;
    sellerName: string;
    count: number;
    avgRating: number | null;
  }>;
  recentRatings: Array<{
    rating: number | null;
    sellerName: string | null;
    contactName: string | null;
    phone: string;
    at: string;
  }>;
  avgAssumeSeconds: number | null;
  assumeCount: number;
  assumeBySeller: Array<{
    sellerId: string;
    sellerName: string;
    count: number;
    avgSeconds: number | null;
  }>;
  messagesToday: number;
  messagesInPeriod?: number;
  expiredOffers: number;
  takenFromOthers: number;
  offerStatsBySeller: Array<{
    sellerId: string;
    sellerName: string;
    expired: number;
    taken: number;
  }>;
  seriesByDay: Array<{
    date: string;
    assumes: number;
    ratings: number;
    avgRating: number | null;
    expired: number;
    taken: number;
  }>;
  attendances: number;
};

export interface WaContact {
  id: string;
  phone: string;
  name: string | null;
  status: ContactStatus;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastClientMessageAt?: string | null;
  unreadCount: number;
  openToAll?: boolean;
  offeredToId?: string | null;
  rating?: number | null;
  canWarnInactivity?: boolean;
  canResolveInactivity?: boolean;
  inactiveMinutes?: number;
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
  /** UI: pending = relógio, sent = ✓✓ */
  delivery?: "pending" | "sent" | "failed";
}

export interface WaQueue {
  id: string;
  name: string;
}

export interface CatalogProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  active: boolean;
  sortOrder: number;
}

export const waApi = {
  login: (email: string, password: string) =>
    request<{ user: WaUser; token: string }>("/whatsapp/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<{ user: WaUser }>("/whatsapp/auth/me"),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean }>("/whatsapp/auth/password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  contacts: (q?: { status?: string; search?: string; sellerId?: string }) => {
    const p = new URLSearchParams();
    if (q?.status) p.set("status", q.status);
    if (q?.search) p.set("search", q.search);
    if (q?.sellerId) p.set("sellerId", q.sellerId);
    const qs = p.toString();
    return request<WaContact[]>(`/whatsapp/contacts${qs ? `?${qs}` : ""}`);
  },
  messages: (contactId: string, opts?: { peek?: boolean }) => {
    const p = new URLSearchParams({ contactId });
    if (opts?.peek) p.set("peek", "1");
    return request<{
      contact: WaContact;
      messages: WaMessage[];
      readOnly: boolean;
    }>(`/whatsapp/messages?${p}`);
  },
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
  warnInactivity: (contactId: string) =>
    request("/whatsapp/contacts/inactivity-warn", {
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
  reports: (params?: {
    preset?: string;
    from?: string;
    to?: string;
    month?: string;
  }) => {
    const q = new URLSearchParams();
    if (params?.preset) q.set("preset", params.preset);
    if (params?.from) q.set("from", params.from);
    if (params?.to) q.set("to", params.to);
    if (params?.month) q.set("month", params.month);
    const qs = q.toString();
    return request<ReportsData>(`/whatsapp/reports${qs ? `?${qs}` : ""}`);
  },
  seedDemoReports: (count = 90) =>
    request<{ created: number }>("/whatsapp/reports/seed-demo", {
      method: "POST",
      body: JSON.stringify({ count }),
    }),
  getSchedule: (userId: string) =>
    request<Array<{ id: string; dayOfWeek: number; startMin: number; endMin: number }>>(
      `/whatsapp/users/${userId}/schedule`
    ),
  addSchedule: (userId: string, data: { dayOfWeek: number; startMin: number; endMin: number }) =>
    request(`/whatsapp/users/${userId}/schedule`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteSchedule: (id: string) =>
    request(`/whatsapp/schedule/${id}`, { method: "DELETE" }),
  getLeaves: (userId: string) =>
    request<
      Array<{
        id: string;
        type: string;
        label: string | null;
        startsAt: string;
        endsAt: string;
      }>
    >(`/whatsapp/users/${userId}/leaves`),
  addLeave: (
    userId: string,
    data: { type: string; label?: string; startsAt: string; endsAt: string }
  ) =>
    request(`/whatsapp/users/${userId}/leaves`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteLeave: (id: string) => request(`/whatsapp/leaves/${id}`, { method: "DELETE" }),
  connection: () =>
    request<{
      instanceName: string;
      status: string;
      lastQr: string | null;
      credentialsOk: boolean;
      live: unknown;
    }>("/whatsapp/connection"),
  connectInstance: (instanceName: string) =>
    request("/whatsapp/connection", {
      method: "POST",
      body: JSON.stringify({ instanceName }),
    }),
  disconnectInstance: () => request("/whatsapp/connection", { method: "DELETE" }),
  catalogConfig: () =>
    request<{ mode: "wa_me" | "form"; waLink: string | null; keyword: string; phone: string | null }>(
      "/catalog/config"
    ),
  catalogProducts: () => request<CatalogProduct[]>("/catalog/products"),
  catalogLead: (data: { name: string; phone: string; message?: string }) =>
    request<{ ok: boolean }>("/catalog/leads", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  adminProducts: () => request<CatalogProduct[]>("/catalog/admin/products"),
  createProduct: (data: {
    name: string;
    price: number;
    description?: string;
    imageUrl?: string;
  }) =>
    request<CatalogProduct>("/catalog/admin/products", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateProduct: (id: string, data: Partial<CatalogProduct>) =>
    request<CatalogProduct>(`/catalog/admin/products/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteProduct: (id: string) =>
    request(`/catalog/admin/products/${id}`, { method: "DELETE" }),
};
