const API = import.meta.env.VITE_API_URL ?? "/api";

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("calangus-token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

let handlingUnauthorized = false;

function handleUnauthorized() {
  if (handlingUnauthorized) return;
  handlingUnauthorized = true;
  try {
    localStorage.removeItem("calangus-token");
    localStorage.removeItem("calangus-user");
  } catch {
    /* ignore */
  }
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  if (path && path !== "/login") {
    // Full reload corta intervalos/polling que disparam /auth/me em loop
    window.location.replace(`${window.location.origin}/login`);
  } else {
    handlingUnauthorized = false;
  }
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
  if (res.status === 401) {
    // Login/senha inválidos também retornam 401 — não tratar como sessão expirada
    const isLoginAttempt = path.includes("/auth/login");
    if (!isLoginAttempt) {
      handleUnauthorized();
      throw new Error("Sessão expirada — faça login novamente");
    }
    throw new Error((data as { error?: string }).error ?? "Não autorizado");
  }
  if (!res.ok) throw new Error((data as { error?: string }).error ?? res.statusText);
  return data as T;
}

export interface WaUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "seller";
  active?: boolean;
  /** Vê todas as conversas (sem recorte) e pode assumir para histórico. */
  seeAllMessages?: boolean;
  /** Aparece no menu do bot para o cliente escolher. */
  showInAttendantList?: boolean;
  /** Atende fluxo Atendimento (opção 1) */
  flowAtendimento?: boolean;
  /** Atende fluxo Financeiro (opção 2) */
  flowFinanceiro?: boolean;
  /** CRUD catálogo (produtos/fotos) */
  canManageCatalog?: boolean;
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
  /** Nome exibido: savedName ?? pushName ?? phone */
  name: string | null;
  pushName?: string | null;
  savedName?: string | null;
  hasSavedContact?: boolean;
  status: ContactStatus;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastClientMessageAt?: string | null;
  unreadCount: number;
  openToAll?: boolean;
  offeredToId?: string | null;
  botFlow?: "atendimento" | "financeiro" | null;
  rating?: number | null;
  webhookPaused?: boolean;
  canWarnInactivity?: boolean;
  canResolveInactivity?: boolean;
  inactiveMinutes?: number;
  /** Disparo Gestor — lembrete de boleto enviado, aguardando resposta. */
  isBoletoReminder?: boolean;
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
  externalId?: string | null;
  quotedExternalId?: string | null;
  quotedBody?: string | null;
  quotedType?: string | null;
  quotedMediaUrl?: string | null;
  quoted?: {
    messageId: string | null;
    type: string;
    body: string | null;
    mediaUrl: string | null;
    author: string | null;
  } | null;
  createdAt: string;
  sentBy?: { id: string; name: string } | null;
  /** Key do envio no cliente (multi-foto). */
  clientKey?: string | null;
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
  images?: string[];
  productImages?: Array<{ id: string; imageUrl: string; sortOrder: number }>;
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
  sendText: (contactId: string, body: string, quotedMessageId?: string | null) =>
    request<WaMessage>("/whatsapp/messages", {
      method: "POST",
      body: JSON.stringify({
        contactId,
        body,
        ...(quotedMessageId ? { quotedMessageId } : {}),
      }),
    }),
  sendLocation: (
    contactId: string,
    data: {
      latitude: number;
      longitude: number;
      name?: string | null;
      address?: string | null;
      preamble?: string | null;
    }
  ) =>
    request<WaMessage>("/whatsapp/messages/location", {
      method: "POST",
      body: JSON.stringify({ contactId, ...data }),
    }),
  storeLocation: () =>
    request<{
      latitude: number | null;
      longitude: number | null;
      name: string | null;
      address: string | null;
      message: string | null;
    }>("/whatsapp/store-location"),
  updateStoreLocation: (data: {
    latitude?: number | null;
    longitude?: number | null;
    name?: string | null;
    address?: string | null;
    message?: string | null;
  }) =>
    request<{
      latitude: number | null;
      longitude: number | null;
      name: string | null;
      address: string | null;
      message: string | null;
    }>("/whatsapp/store-location", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  sendImage: async (contactId: string, file: File, caption?: string, clientKey?: string) => {
    const form = new FormData();
    form.append("contactId", contactId);
    form.append("file", file);
    if (caption) form.append("caption", caption);
    if (clientKey) form.append("clientKey", clientKey);
    const res = await fetch(`${API}/whatsapp/messages/image`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    const data = await res.json();
    if (res.status === 401) {
      handleUnauthorized();
      throw new Error("Sessão expirada — faça login novamente");
    }
    if (!res.ok) throw new Error(data.error ?? res.statusText);
    return data as WaMessage;
  },
  /** @deprecated prefer N× sendImage com clientKey (1 request por imagem). */
  sendImages: async (
    contactId: string,
    files: File[],
    opts?: { caption?: string; clientKeys?: string[] }
  ) => {
    const form = new FormData();
    form.append("contactId", contactId);
    if (opts?.caption) form.append("caption", opts.caption);
    if (opts?.clientKeys?.length) {
      form.append("clientKeys", JSON.stringify(opts.clientKeys));
    }
    for (const f of files) form.append("files", f);
    const res = await fetch(`${API}/whatsapp/messages/images`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      handleUnauthorized();
      throw new Error("Sessão expirada — faça login novamente");
    }
    if (!res.ok && !(data as { results?: unknown[] }).results) {
      throw new Error((data as { error?: string }).error ?? res.statusText);
    }
    return data as {
      results: Array<{
        ok: boolean;
        index: number;
        clientKey?: string;
        message?: WaMessage;
        error?: string;
      }>;
      messages: WaMessage[];
      errors: Array<{ index: number; clientKey?: string; error?: string }>;
    };
  },
  assign: (contactId: string, userId?: string, queueId?: string) =>
    request<WaContact>("/whatsapp/contacts/assign", {
      method: "POST",
      body: JSON.stringify({ contactId, userId, queueId }),
    }),
  openToAll: (contactId: string, queueId?: string) =>
    request<WaContact>("/whatsapp/contacts/open-to-all", {
      method: "POST",
      body: JSON.stringify({ contactId, queueId }),
    }),
  resolve: (contactId: string) =>
    request("/whatsapp/contacts/resolve", {
      method: "POST",
      body: JSON.stringify({ contactId }),
    }),
  restartBot: (contactId: string) =>
    request<WaContact>("/whatsapp/contacts/restart-bot", {
      method: "POST",
      body: JSON.stringify({ contactId }),
    }),
  webhookPause: (contactId: string, paused: boolean) =>
    request<WaContact>("/whatsapp/contacts/webhook-pause", {
      method: "POST",
      body: JSON.stringify({ contactId, paused }),
    }),
  saveContactName: (contactId: string, name: string) =>
    request<WaContact>("/whatsapp/contacts/save-name", {
      method: "POST",
      body: JSON.stringify({ contactId, name }),
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
  createUser: (data: {
    name: string;
    email: string;
    password: string;
    role?: string;
    seeAllMessages?: boolean;
    showInAttendantList?: boolean;
  }) =>
    request<WaUser>("/whatsapp/users", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  setUserActive: (id: string, active: boolean) =>
    request<WaUser>(`/whatsapp/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ active }),
    }),
  updateUser: (
    id: string,
    data: {
      name?: string;
      active?: boolean;
      role?: "admin" | "seller";
      seeAllMessages?: boolean;
      showInAttendantList?: boolean;
      flowAtendimento?: boolean;
      flowFinanceiro?: boolean;
      canManageCatalog?: boolean;
    }
  ) =>
    request<WaUser>(`/whatsapp/users/${id}`, {
      method: "PATCH",
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
      lastPairingCode?: string | null;
      credentialsOk: boolean;
      defaultPhone?: string;
      botEnabled?: boolean;
      live: unknown;
    }>("/whatsapp/connection"),
  setBotEnabled: (enabled: boolean) =>
    request<{ ok: boolean; botEnabled: boolean }>("/whatsapp/bot", {
      method: "POST",
      body: JSON.stringify({ enabled }),
    }),
  connectInstance: (instanceName: string, number?: string) =>
    request<{ lastQr: string | null; lastPairingCode?: string | null; pairingCode?: string | null }>(
      "/whatsapp/connection",
      {
        method: "POST",
        body: JSON.stringify({ instanceName, number }),
      }
    ),
  disconnectInstance: () => request("/whatsapp/connection", { method: "DELETE" }),
  metaStatus: () =>
    request<{
      provider: "meta" | "evolution" | "gupshup";
      configured: boolean;
      hasAccessToken: boolean;
      phoneNumberId: string | null;
      wabaId: string | null;
      appId: string | null;
      embeddedConfigId: string | null;
      embeddedSignupUrl: string | null;
      webhookPath: string;
      webhookUrl?: string | null;
      boletoTemplate: string | null;
      boletoTemplateLang?: string | null;
    }>("/whatsapp/meta/status"),
  saveMetaSettings: (data: { phoneNumberId?: string; wabaId?: string }) =>
    request<{ ok: boolean; phoneNumberId: string | null; wabaId: string | null }>(
      "/whatsapp/meta/settings",
      { method: "POST", body: JSON.stringify(data) }
    ),
  metaProfile: () =>
    request<{
      profile: {
        about: string;
        address: string;
        description: string;
        email: string;
        vertical: string;
        websites: string[];
        profilePictureUrl: string | null;
      } | null;
      phone: {
        displayPhoneNumber: string | null;
        verifiedName: string | null;
        qualityRating: string | null;
        status: string | null;
      } | null;
      managerUrl: string;
      note: string;
    }>("/whatsapp/meta/profile"),
  saveMetaProfile: (data: {
    about?: string;
    address?: string;
    description?: string;
    email?: string;
    vertical?: string;
    websites?: string[];
  }) =>
    request<{
      ok: boolean;
      profile: {
        about: string;
        address: string;
        description: string;
        email: string;
        vertical: string;
        websites: string[];
        profilePictureUrl: string | null;
      } | null;
    }>("/whatsapp/meta/profile", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  uploadMetaProfilePicture: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API}/whatsapp/meta/profile/picture`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error ?? res.statusText);
    return data as {
      ok: boolean;
      profile: {
        about: string;
        address: string;
        description: string;
        email: string;
        vertical: string;
        websites: string[];
        profilePictureUrl: string | null;
      } | null;
    };
  },
  gupshupStatus: () =>
    request<{
      provider: "meta" | "evolution" | "gupshup";
      configured: boolean;
      buttonsEnabled?: boolean;
      appName: string | null;
      appId: string | null;
      source: string | null;
      wabaId: string | null;
      coexistenceEnabled: boolean;
      connectedAt: string | null;
      webhookPath: string;
      webhookUrl: string | null;
      boletoTemplateId: string | null;
      webhookSecretSet: boolean;
    }>("/whatsapp/gupshup/status"),
  saveGupshupSettings: (data: { appId: string }) =>
    request<{ ok: boolean; appId: string | null }>("/whatsapp/gupshup/settings", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  metaTemplates: () =>
    request<{
      templates: {
        id: string;
        name: string;
        status: string;
        language: string;
        category: string;
        rejectedReason?: string | null;
      }[];
      defaultBoleto: {
        name: string;
        language: string;
        category: string;
        bodyText: string;
        bodyExamples: string[];
        headerFormat?: string | null;
      };
      defaultProduto?: {
        name: string;
        language: string;
        category: string;
        bodyText: string;
        bodyExamples: string[];
        headerFormat?: string | null;
        note?: string;
      };
    }>("/whatsapp/meta/templates"),
  createMetaTemplate: async (data: {
    name: string;
    language?: string;
    category?: string;
    bodyText: string;
    bodyExamples?: string[];
    replaceExisting?: boolean;
    headerFormat?: "IMAGE" | null;
    headerSampleUrl?: string;
    headerHandle?: string;
    headerFile?: File | null;
  }) => {
    if (data.headerFile) {
      const form = new FormData();
      form.append("name", data.name);
      form.append("bodyText", data.bodyText);
      if (data.language) form.append("language", data.language);
      if (data.category) form.append("category", data.category);
      if (data.replaceExisting) form.append("replaceExisting", "true");
      if (data.headerFormat) form.append("headerFormat", data.headerFormat);
      if (data.bodyExamples?.length) form.append("bodyExamples", JSON.stringify(data.bodyExamples));
      form.append("file", data.headerFile);
      const res = await fetch(`${API}/whatsapp/meta/templates`, {
        method: "POST",
        headers: authHeaders(),
        body: form,
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) {
        handleUnauthorized();
        throw new Error("Sessão expirada — faça login novamente");
      }
      if (!res.ok) throw new Error((body as { error?: string }).error ?? res.statusText);
      return body as { ok: boolean; data?: unknown };
    }
    return request<{ ok: boolean; data?: unknown; error?: string }>("/whatsapp/meta/templates", {
      method: "POST",
      body: JSON.stringify({
        name: data.name,
        language: data.language,
        category: data.category,
        bodyText: data.bodyText,
        bodyExamples: data.bodyExamples,
        replaceExisting: data.replaceExisting,
        headerFormat: data.headerFormat,
        headerSampleUrl: data.headerSampleUrl,
        headerHandle: data.headerHandle,
      }),
    });
  },
  sendProductOutreach: async (contactId: string, productName: string, file: File) => {
    const form = new FormData();
    form.append("contactId", contactId);
    form.append("productName", productName);
    form.append("file", file);
    const res = await fetch(`${API}/whatsapp/messages/product-outreach`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      handleUnauthorized();
      throw new Error("Sessão expirada — faça login novamente");
    }
    if (!res.ok) throw new Error((data as { error?: string }).error ?? res.statusText);
    return data as WaMessage;
  },
  deleteMetaTemplate: (name: string) =>
    request<{ ok: boolean }>("/whatsapp/meta/templates/" + encodeURIComponent(name), {
      method: "DELETE",
    }),
  setMetaProvider: (provider: "meta" | "evolution" | "gupshup") =>
    request<{ ok: boolean; provider: string }>("/whatsapp/meta/provider", {
      method: "POST",
      body: JSON.stringify({ provider }),
    }),
  metaExchange: (data: { code: string; phoneNumberId?: string; wabaId?: string }) =>
    request<{
      ok: boolean;
      error?: string;
      hint?: string;
      tokenPreview?: string | null;
      savedIds?: boolean;
    }>("/whatsapp/meta/exchange", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  usage: (params?: { from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (params?.from) q.set("from", params.from);
    if (params?.to) q.set("to", params.to);
    const qs = q.toString();
    return request<{
      from: string;
      to: string;
      total: number;
      billable: number;
      estimatedBrl: number;
      rateBrlPerMsg: number;
      bySource: Record<string, number>;
      byCategory: Record<string, number>;
      byProvider: Record<string, number>;
      byStatus: Record<string, number>;
      note: string;
    }>(`/whatsapp/usage${qs ? `?${qs}` : ""}`);
  },
  catalogConfig: () =>
    request<{
      mode: "wa_me" | "form";
      waLink: string | null;
      keyword: string;
      phone: string | null;
      underConstruction: boolean;
    }>("/catalog/config"),
  catalogProducts: () => request<CatalogProduct[]>("/catalog/products"),
  catalogGallery: () =>
    request<Array<{ id: string; imageUrl: string; caption: string | null }>>("/catalog/gallery"),
  catalogLead: (data: { name: string; phone: string; message?: string }) =>
    request<{ ok: boolean }>("/catalog/leads", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  adminProducts: () => request<CatalogProduct[]>("/catalog/admin/products"),
  adminCatalogSettings: () =>
    request<{ underConstruction: boolean }>("/catalog/admin/settings"),
  updateCatalogSettings: (data: { underConstruction: boolean }) =>
    request<{ underConstruction: boolean }>("/catalog/admin/settings", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
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
  uploadProductImages: (productId: string, files: File[]) => {
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    return request<CatalogProduct>(`/catalog/admin/products/${productId}/images`, {
      method: "POST",
      body: fd,
    });
  },
  deleteProductImage: (productId: string, imageId: string) =>
    request<CatalogProduct>(`/catalog/admin/products/${productId}/images/${imageId}`, {
      method: "DELETE",
    }),
  reorderProductImages: (productId: string, imageIds: string[]) =>
    request<CatalogProduct>(`/catalog/admin/products/${productId}/images/order`, {
      method: "PUT",
      body: JSON.stringify({ imageIds }),
    }),
  updateProduct: (id: string, data: Partial<CatalogProduct>) =>
    request<CatalogProduct>(`/catalog/admin/products/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteProduct: (id: string) =>
    request(`/catalog/admin/products/${id}`, { method: "DELETE" }),
  adminGallery: (status?: "pending" | "approved" | "rejected" | "") => {
    const q = status ? `?status=${encodeURIComponent(status)}` : "";
    return request<
      Array<{
        id: string;
        imageUrl: string;
        caption: string | null;
        status: "pending" | "approved" | "rejected";
        sortOrder: number;
        createdAt: string;
        submittedBy: { id: string; name: string } | null;
        reviewedBy: { id: string; name: string } | null;
        reviewedAt: string | null;
      }>
    >(`/catalog/admin/gallery${q}`);
  },
  updateGalleryImage: (
    id: string,
    data: { status?: "pending" | "approved" | "rejected"; sortOrder?: number; caption?: string | null }
  ) =>
    request(`/catalog/admin/gallery/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteGalleryImage: (id: string) =>
    request(`/catalog/admin/gallery/${id}`, { method: "DELETE" }),
};
