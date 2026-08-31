import { useEffect, useState } from "react";
import {
  CatalogPhotoPicker,
  CatalogProductPhotos,
  pendingPhotosToFiles,
  revokePendingPhotos,
  type PendingPhoto,
} from "./CatalogPhotoPicker";
import { formatPriceBr, maskPriceBrInput, parsePriceBr } from "../lib/price";
import { waApi } from "../whatsapp/waApi";

export { ReportsPage } from "./ReportsPage";

function formatPairingCode(code: string) {
  const clean = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (clean.length === 8) return `${clean.slice(0, 4)}-${clean.slice(4)}`;
  return clean || code;
}

export function ConnectPage() {
  const [instanceName, setInstanceName] = useState("");
  const [phone, setPhone] = useState("");
  const [info, setInfo] = useState<{
    instanceName: string;
    status: string;
    lastQr: string | null;
    lastPairingCode?: string | null;
    credentialsOk: boolean;
    defaultPhone?: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [metaBusy, setMetaBusy] = useState(false);
  const [metaInfo, setMetaInfo] = useState<{
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
    webhookVerifyTokenSet?: boolean;
    boletoTemplate: string | null;
  } | null>(null);
  const [botEnabled, setBotEnabled] = useState(true);
  const [gupshupInfo, setGupshupInfo] = useState<{
    provider: "meta" | "evolution" | "gupshup";
    configured: boolean;
    buttonsEnabled?: boolean;
    appName: string | null;
    appId?: string | null;
    source: string | null;
    wabaId: string | null;
    coexistenceEnabled: boolean;
    webhookUrl: string | null;
    boletoTemplateId: string | null;
  } | null>(null);
  const [gupshupAppId, setGupshupAppId] = useState("");
  const [hookStatus, setHookStatus] = useState<{
    hits: number;
    lastHitAt: string | null;
    recent: {
      at: string;
      path: string;
      method?: string;
      event?: string | null;
      from?: string | null;
      preview?: string | null;
    }[];
  } | null>(null);

  const [tplBusy, setTplBusy] = useState(false);
  const [templates, setTemplates] = useState<
    {
      id: string;
      name: string;
      status: string;
      language: string;
      category: string;
      rejectedReason?: string | null;
    }[]
  >([]);
  const [tplName, setTplName] = useState("boleto_lembrete");
  const [tplLang, setTplLang] = useState("pt_BR");
  const [tplBody, setTplBody] = useState("");
  const [tplCategory, setTplCategory] = useState<"UTILITY" | "MARKETING">("UTILITY");
  const [tplExamples, setTplExamples] = useState<string[]>([
    "Maria",
    "129,90",
    "20/08/2026",
    "https://calangusmoda.crediario.digital/login",
  ]);
  const [tplHeaderFormat, setTplHeaderFormat] = useState<"IMAGE" | null>(null);
  const [tplHeaderSampleUrl, setTplHeaderSampleUrl] = useState("");
  const [tplHeaderFile, setTplHeaderFile] = useState<File | null>(null);
  const [tplMsg, setTplMsg] = useState("");
  const [tplPresets, setTplPresets] = useState<{
    boleto?: {
      name: string;
      language: string;
      category: string;
      bodyText: string;
      bodyExamples: string[];
    };
    produto?: {
      name: string;
      language: string;
      category: string;
      bodyText: string;
      bodyExamples: string[];
      note?: string;
    };
  }>({});
  const [metaPhoneId, setMetaPhoneId] = useState("");
  const [metaWabaId, setMetaWabaId] = useState("");
  const [profileMsg, setProfileMsg] = useState("");
  const [profilePhone, setProfilePhone] = useState<{
    displayPhoneNumber: string | null;
    verifiedName: string | null;
    qualityRating: string | null;
    status: string | null;
  } | null>(null);
  const [profile, setProfile] = useState({
    about: "",
    address: "",
    description: "",
    email: "",
    vertical: "APPAREL",
    websites: "",
    profilePictureUrl: null as string | null,
  });
  const [managerUrl, setManagerUrl] = useState(
    "https://business.facebook.com/latest/whatsapp_manager/phone_numbers/?tab=phone-numbers"
  );
  const [storeLat, setStoreLat] = useState("");
  const [storeLng, setStoreLng] = useState("");
  const [storeLocName, setStoreLocName] = useState("");
  const [storeLocAddress, setStoreLocAddress] = useState("");
  const [storeLocMessage, setStoreLocMessage] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [pixKeyType, setPixKeyType] = useState("CNPJ");
  const [pixMerchantName, setPixMerchantName] = useState("");
  const [pixMessage, setPixMessage] = useState("");

  async function loadStoreLocation() {
    const row = await waApi.storeLocation();
    setStoreLat(row.latitude != null ? String(row.latitude) : "");
    setStoreLng(row.longitude != null ? String(row.longitude) : "");
    setStoreLocName(row.name ?? "");
    setStoreLocAddress(row.address ?? "");
    setStoreLocMessage(row.message ?? "");
  }

  async function saveStoreLocation() {
    setMetaBusy(true);
    setError("");
    try {
      await waApi.updateStoreLocation({
        latitude: storeLat.trim() ? Number(storeLat) : null,
        longitude: storeLng.trim() ? Number(storeLng) : null,
        name: storeLocName,
        address: storeLocAddress,
        message: storeLocMessage,
      });
      await loadStoreLocation();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setMetaBusy(false);
    }
  }

  async function loadPixKey() {
    const row = await waApi.pixKey();
    setPixKey(row.key ?? "");
    setPixKeyType(row.keyType ?? "CNPJ");
    setPixMerchantName(row.merchantName ?? "");
    setPixMessage(row.message ?? "");
  }

  async function savePixKey() {
    setMetaBusy(true);
    setError("");
    try {
      await waApi.updatePixKey({
        key: pixKey.trim() || null,
        keyType: pixKeyType,
        merchantName: pixMerchantName,
        message: pixMessage,
      });
      await loadPixKey();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setMetaBusy(false);
    }
  }

  async function load() {
    const row = await waApi.connection();
    setInfo(row);
    setInstanceName((prev) => prev || row.instanceName);
    setPhone((prev) => prev || row.defaultPhone || "");
    if (typeof row.botEnabled === "boolean") setBotEnabled(row.botEnabled);
  }

  async function toggleBot(enabled: boolean) {
    setMetaBusy(true);
    setError("");
    try {
      const r = await waApi.setBotEnabled(enabled);
      setBotEnabled(r.botEnabled);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setMetaBusy(false);
    }
  }

  async function loadMeta() {
    const row = await waApi.metaStatus();
    setMetaInfo(row);
    setMetaPhoneId((prev) => prev || row.phoneNumberId || "");
    setMetaWabaId((prev) => prev || row.wabaId || "");
  }

  async function loadMetaProfile() {
    try {
      const r = await waApi.metaProfile();
      setProfilePhone(r.phone);
      if (r.managerUrl) setManagerUrl(r.managerUrl);
      if (r.profile) {
        setProfile({
          about: r.profile.about || "",
          address: r.profile.address || "",
          description: r.profile.description || "",
          email: r.profile.email || "",
          vertical: r.profile.vertical || "APPAREL",
          websites: (r.profile.websites || []).join("\n"),
          profilePictureUrl: r.profile.profilePictureUrl,
        });
      }
    } catch (e) {
      setProfileMsg(String((e as Error).message));
    }
  }

  async function saveMetaIds() {
    setMetaBusy(true);
    setError("");
    setProfileMsg("");
    try {
      await waApi.saveMetaSettings({
        phoneNumberId: metaPhoneId.trim() || undefined,
        wabaId: metaWabaId.trim() || undefined,
      });
      await loadMeta();
      setProfileMsg("Phone Number ID / WABA salvos. Atualize também no Railway (.env).");
      await loadMetaProfile();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setMetaBusy(false);
    }
  }

  async function saveProfile() {
    setMetaBusy(true);
    setProfileMsg("");
    setError("");
    try {
      const r = await waApi.saveMetaProfile({
        about: profile.about,
        address: profile.address,
        description: profile.description,
        email: profile.email,
        vertical: profile.vertical,
        websites: profile.websites
          .split(/[\n,]/)
          .map((w) => w.trim())
          .filter(Boolean),
      });
      if (r.profile) {
        setProfile((p) => ({
          ...p,
          about: r.profile!.about || "",
          address: r.profile!.address || "",
          description: r.profile!.description || "",
          email: r.profile!.email || "",
          vertical: r.profile!.vertical || "APPAREL",
          websites: (r.profile!.websites || []).join("\n"),
          profilePictureUrl: r.profile!.profilePictureUrl,
        }));
      }
      setProfileMsg("Perfil comercial atualizado na Meta.");
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setMetaBusy(false);
    }
  }

  async function onProfilePhoto(file: File | null) {
    if (!file) return;
    setMetaBusy(true);
    setProfileMsg("");
    setError("");
    try {
      const r = await waApi.uploadMetaProfilePicture(file);
      if (r.profile?.profilePictureUrl) {
        setProfile((p) => ({ ...p, profilePictureUrl: r.profile!.profilePictureUrl }));
      }
      setProfileMsg("Foto de perfil enviada.");
      await loadMetaProfile();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setMetaBusy(false);
    }
  }

  async function loadGupshup() {
    const row = await waApi.gupshupStatus();
    setGupshupInfo(row);
    setGupshupAppId((prev) => prev || row.appId || "");
  }

  async function saveGupshupAppId() {
    const appId = gupshupAppId.trim();
    if (!appId) {
      setError("Informe o App ID do Settings Gupshup");
      return;
    }
    setMetaBusy(true);
    setError("");
    try {
      await waApi.saveGupshupSettings({ appId });
      await loadGupshup();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setMetaBusy(false);
    }
  }

  async function loadTemplates() {
    try {
      const r = await waApi.metaTemplates();
      setTemplates(r.templates);
      setTplPresets({ boleto: r.defaultBoleto, produto: r.defaultProduto });
      if (!tplBody && r.defaultBoleto?.bodyText) {
        setTplBody(r.defaultBoleto.bodyText);
        setTplName(r.defaultBoleto.name || "boleto_lembrete");
        setTplLang(r.defaultBoleto.language || "pt_BR");
        setTplCategory("UTILITY");
        setTplExamples(r.defaultBoleto.bodyExamples || []);
        setTplHeaderFormat(null);
      }
    } catch (e) {
      setTplMsg(String((e as Error).message));
    }
  }

  function applyPreset(kind: "boleto" | "produto") {
    const p = kind === "boleto" ? tplPresets.boleto : tplPresets.produto;
    if (!p) return;
    setTplName(p.name);
    setTplLang(p.language || "pt_BR");
    setTplBody(p.bodyText);
    setTplCategory(p.category === "MARKETING" ? "MARKETING" : "UTILITY");
    setTplExamples(p.bodyExamples || []);
    setTplHeaderFormat(kind === "produto" ? "IMAGE" : null);
    setTplHeaderFile(null);
    setTplMsg(
      kind === "produto"
        ? "Modelo produto carregado. Faça upload da foto de exemplo e clique em Criar."
        : "Modelo boleto carregado."
    );
  }

  async function saveTemplate(replaceExisting: boolean) {
    setTplBusy(true);
    setTplMsg("");
    setError("");
    try {
      if (tplHeaderFormat === "IMAGE" && !tplHeaderFile && !tplHeaderSampleUrl.trim()) {
        throw new Error("Template com foto: envie uma imagem ou URL HTTPS de exemplo");
      }
      await waApi.createMetaTemplate({
        name: tplName,
        language: tplLang,
        category: tplCategory,
        bodyText: tplBody,
        bodyExamples: tplExamples,
        replaceExisting,
        headerFormat: tplHeaderFormat,
        headerSampleUrl: tplHeaderSampleUrl.trim() || undefined,
        headerFile: tplHeaderFile,
      });
      setTplMsg(
        replaceExisting
          ? "Template recriado e enviado para análise da Meta."
          : "Template criado e enviado para análise da Meta."
      );
      await loadTemplates();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setTplBusy(false);
    }
  }

  async function removeTemplate(name: string) {
    if (!window.confirm(`Excluir template "${name}" na Meta?`)) return;
    setTplBusy(true);
    setTplMsg("");
    try {
      await waApi.deleteMetaTemplate(name);
      setTplMsg(`Template ${name} excluído.`);
      await loadTemplates();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setTplBusy(false);
    }
  }

  async function loadHook() {
    try {
      const API = import.meta.env.VITE_API_URL ?? "/api";
      const res = await fetch(`${API}/webhook/status`);
      setHookStatus(await res.json());
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    load().catch((e) => setError(String(e.message)));
    loadStoreLocation().catch(() => {});
    loadPixKey().catch(() => {});
    loadMeta().catch(() => {});
    loadGupshup().catch(() => {});
    loadTemplates().catch(() => {});
    loadMetaProfile().catch(() => {});
    loadHook().catch(() => {});
    const t = setInterval(() => {
      load().catch(() => {});
      loadMeta().catch(() => {});
      loadGupshup().catch(() => {});
      loadHook().catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, []);

  async function connect(byCode = false) {
    setBusy(true);
    setError("");
    try {
      if (byCode && !phone.replace(/\D/g, "")) {
        throw new Error("Informe o telefone com DDI e DDD para gerar o código");
      }
      await waApi.connectInstance(instanceName, byCode ? phone.replace(/\D/g, "") : undefined);
      await load();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await waApi.disconnectInstance();
      await load();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function setProvider(provider: "meta" | "evolution" | "gupshup") {
    setMetaBusy(true);
    setError("");
    try {
      await waApi.setMetaProvider(provider);
      await Promise.all([loadMeta(), loadGupshup()]);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setMetaBusy(false);
    }
  }

  const status = (info?.status ?? "").trim().toLowerCase();
  const open = status === "open" || status === "connected";
  const statusLabel =
    open ? "conectado" : status === "connecting" ? "conectando" : status === "close" || status === "closed" || status === "disconnected" ? "desconectado" : info?.status || "—";
  const provider = metaInfo?.provider ?? gupshupInfo?.provider ?? "evolution";
  const providerLabel =
    provider === "meta" ? "Meta" : provider === "gupshup" ? "Gupshup" : "Evolution";

  return (
    <div className="admin-panel">
      <div className="admin-panel-head">
        <h1>Conectar WhatsApp</h1>
      </div>

      <h2>Robô CRM (menus)</h2>
      <p className="lede">
        Quando ativo, o bot envia menus (departamento, vendedores) e responde automaticamente.
        Desative para testar o número/API sem respostas automáticas — as mensagens dos clientes
        continuam entrando no CRM.
      </p>
      <p>
        Status do robô:{" "}
        <strong className={botEnabled ? "connect-status open" : "connect-status"}>
          {botEnabled ? "ativado" : "desativado"}
        </strong>
      </p>
      <div className="admin-toolbar">
        <button
          type="button"
          disabled={metaBusy || botEnabled}
          onClick={() => void toggleBot(true)}
        >
          Ativar robô CRM
        </button>
        <button
          type="button"
          className="ghost"
          disabled={metaBusy || !botEnabled}
          onClick={() => void toggleBot(false)}
        >
          Desativar robô CRM
        </button>
      </div>

      <h2>Localização da loja</h2>
      <p className="lede">
        Cadastro usado no atendimento WhatsApp (+ → Localização da loja). A mensagem é enviada antes
        do pin no mapa.
      </p>
      <div className="admin-toolbar" style={{ flexWrap: "wrap", alignItems: "flex-end" }}>
        <input
          value={storeLat}
          onChange={(e) => setStoreLat(e.target.value)}
          placeholder="Latitude (ex: -15.601)"
          style={{ maxWidth: "10rem" }}
        />
        <input
          value={storeLng}
          onChange={(e) => setStoreLng(e.target.value)}
          placeholder="Longitude (ex: -56.098)"
          style={{ maxWidth: "10rem" }}
        />
        <input
          value={storeLocName}
          onChange={(e) => setStoreLocName(e.target.value)}
          placeholder="Nome do local"
          style={{ minWidth: "10rem", flex: 1 }}
        />
        <input
          value={storeLocAddress}
          onChange={(e) => setStoreLocAddress(e.target.value)}
          placeholder="Endereço completo"
          style={{ minWidth: "14rem", flex: 2 }}
        />
      </div>
      <textarea
        value={storeLocMessage}
        onChange={(e) => setStoreLocMessage(e.target.value)}
        placeholder="Mensagem enviada junto (ex: Estamos te esperando na loja! Horário: seg–sex 8h–18h30, sáb 8h–16h30.)"
        rows={3}
        style={{ width: "100%", marginBottom: "0.65rem" }}
      />
      <div className="admin-toolbar">
        <button type="button" disabled={metaBusy} onClick={() => void saveStoreLocation()}>
          Salvar localização
        </button>
      </div>

      <h2>Chave Pix</h2>
      <p className="lede">
        Cadastro usado no atendimento WhatsApp (+ → Pix). Envia o cartão nativo com botão
        &quot;Copiar chave Pix&quot; (CNPJ, CPF, celular, e-mail ou chave aleatória).
      </p>
      <div className="admin-toolbar" style={{ flexWrap: "wrap", alignItems: "flex-end" }}>
        <input
          value={pixKey}
          onChange={(e) => setPixKey(e.target.value)}
          placeholder="Chave Pix (ex: 11184995000104)"
          style={{ minWidth: "14rem", flex: 2 }}
        />
        <select
          value={pixKeyType}
          onChange={(e) => setPixKeyType(e.target.value)}
          style={{ maxWidth: "9rem" }}
        >
          <option value="CNPJ">CNPJ</option>
          <option value="CPF">CPF</option>
          <option value="PHONE">Celular</option>
          <option value="EMAIL">E-mail</option>
          <option value="EVP">Aleatória</option>
        </select>
        <input
          value={pixMerchantName}
          onChange={(e) => setPixMerchantName(e.target.value)}
          placeholder="Nome exibido (ex: Calangus Moda Jovem)"
          style={{ minWidth: "14rem", flex: 2 }}
        />
      </div>
      <textarea
        value={pixMessage}
        onChange={(e) => setPixMessage(e.target.value)}
        placeholder="Mensagem acima do cartão (ex: Segue nossa chave Pix para pagamento 👇)"
        rows={2}
        style={{ width: "100%", marginBottom: "0.65rem" }}
      />
      <div className="admin-toolbar">
        <button type="button" disabled={metaBusy} onClick={() => void savePixKey()}>
          Salvar chave Pix
        </button>
      </div>

      <h2>Meta Cloud API</h2>
      <p className="lede">
        Canal oficial (templates, webhook Graph). Provider ativo:{" "}
        <strong>{providerLabel}</strong>
        {metaInfo?.configured ? " · credenciais OK" : " · configure token/Phone Number ID no .env"}
      </p>
      {profilePhone && (
        <p>
          Número: <strong>{profilePhone.displayPhoneNumber || "—"}</strong>
          {" · "}
          Nome verificado: <strong>{profilePhone.verifiedName || "—"}</strong>
          {" · "}
          Qualidade: <code>{profilePhone.qualityRating || "—"}</code>
          {" · "}
          Status: <code>{profilePhone.status || "—"}</code>
        </p>
      )}
      <div className="admin-toolbar" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
        <input
          value={metaPhoneId}
          onChange={(e) => setMetaPhoneId(e.target.value)}
          placeholder="Phone Number ID (ex: 1236714352864758)"
          style={{ maxWidth: "18rem" }}
        />
        <input
          value={metaWabaId}
          onChange={(e) => setMetaWabaId(e.target.value)}
          placeholder="WABA ID (ex: 2142001143396659)"
          style={{ maxWidth: "16rem" }}
        />
        <button
          type="button"
          className="ghost"
          disabled={metaBusy || (!metaPhoneId.trim() && !metaWabaId.trim())}
          onClick={() => void saveMetaIds()}
        >
          Salvar IDs Meta
        </button>
      </div>
      <div className="admin-toolbar">
        <button
          type="button"
          disabled={metaBusy || !metaInfo?.embeddedSignupUrl}
          onClick={() => {
            if (metaInfo?.embeddedSignupUrl) window.open(metaInfo.embeddedSignupUrl, "_blank");
          }}
        >
          Abrir cadastro Meta
        </button>
        <button
          type="button"
          disabled={metaBusy || !metaInfo?.configured || provider === "meta"}
          onClick={() => void setProvider("meta")}
        >
          Usar Meta
        </button>
        <button
          type="button"
          className="ghost"
          disabled={metaBusy || provider === "evolution"}
          onClick={() => void setProvider("evolution")}
        >
          Usar Evolution
        </button>
        <button
          type="button"
          disabled={metaBusy || !gupshupInfo?.configured || provider === "gupshup"}
          onClick={() => void setProvider("gupshup")}
        >
          Usar Gupshup
        </button>
      </div>

      <h2 style={{ marginTop: "1.5rem" }}>Perfil comercial (Meta API)</h2>
      <p className="lede">
        Foto, sobre, descrição, e-mail, endereço, categoria e sites.{" "}
        <strong>Nome de exibição</strong> e <strong>horário de funcionamento</strong> só no{" "}
        <a href={managerUrl} target="_blank" rel="noreferrer">
          WhatsApp Manager
        </a>
        .
      </p>
      {profileMsg && <p className="admin-hint-ok">{profileMsg}</p>}
      <div className="meta-profile-grid">
        <div className="meta-profile-photo">
          {profile.profilePictureUrl ? (
            <img src={profile.profilePictureUrl} alt="Foto do perfil WhatsApp" />
          ) : (
            <div className="meta-profile-photo-empty">Sem foto</div>
          )}
          <label className="ghost" style={{ cursor: "pointer" }}>
            Trocar foto
            <input
              type="file"
              accept="image/*"
              hidden
              disabled={metaBusy}
              onChange={(e) => void onProfilePhoto(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        <div className="meta-profile-fields">
          <label>
            Sobre (máx. 139)
            <input
              value={profile.about}
              maxLength={139}
              onChange={(e) => setProfile((p) => ({ ...p, about: e.target.value }))}
              placeholder="Moda jovem Calangus"
            />
          </label>
          <label>
            Descrição (máx. 512)
            <textarea
              value={profile.description}
              maxLength={512}
              rows={3}
              onChange={(e) => setProfile((p) => ({ ...p, description: e.target.value }))}
              placeholder="Loja de moda jovem…"
            />
          </label>
          <label>
            E-mail
            <input
              value={profile.email}
              onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
              placeholder="contato@calangusmodajovem.com"
            />
          </label>
          <label>
            Endereço
            <input
              value={profile.address}
              onChange={(e) => setProfile((p) => ({ ...p, address: e.target.value }))}
              placeholder="Rua…, Cuiabá - MT"
            />
          </label>
          <label>
            Categoria
            <select
              value={profile.vertical}
              onChange={(e) => setProfile((p) => ({ ...p, vertical: e.target.value }))}
            >
              <option value="APPAREL">Roupas e vestuário</option>
              <option value="RETAIL">Varejo / shopping</option>
              <option value="BEAUTY">Beleza</option>
              <option value="OTHER">Outro</option>
            </select>
          </label>
          <label>
            Sites (1 por linha, máx. 2)
            <textarea
              value={profile.websites}
              rows={2}
              onChange={(e) => setProfile((p) => ({ ...p, websites: e.target.value }))}
              placeholder={"https://instagram.com/...\nhttps://webbiano-production.up.railway.app"}
            />
          </label>
          <div className="admin-toolbar">
            <button type="button" disabled={metaBusy} onClick={() => void saveProfile()}>
              Salvar perfil
            </button>
            <button type="button" className="ghost" disabled={metaBusy} onClick={() => void loadMetaProfile()}>
              Recarregar
            </button>
            <a className="ghost" href={managerUrl} target="_blank" rel="noreferrer" style={{ padding: "0.45rem 0.75rem" }}>
              Nome / horário no Manager
            </a>
          </div>
        </div>
      </div>
      {!gupshupInfo?.configured && (
        <p className="admin-hint-ok">
          Usar Gupshup só habilita depois de <code>GUPSHUP_API_KEY</code>,{" "}
          <code>GUPSHUP_APP_NAME</code> e <code>GUPSHUP_SOURCE</code> no .env da API (e restart).
        </p>
      )}
      {!metaInfo?.embeddedSignupUrl && (
        <p className="admin-hint-ok">
          Para o botão de cadastro: defina <code>META_APP_ID</code> e{" "}
          <code>META_EMBEDDED_CONFIG_ID</code> no .env da API.
        </p>
      )}
      <p className="lede">
        Callback URL na Meta (obrigatório HTTPS):{" "}
        <code>
          {metaInfo?.webhookUrl ||
            "https://apibiano-production.up.railway.app/whatsapp/webhook/meta"}
        </code>
      </p>
      <p className="admin-hint-ok">
        Em Developers → WhatsApp → Configuração → Webhook: cole essa URL, verify token ={" "}
        <code>META_WEBHOOK_VERIFY_TOKEN</code> do Railway, assine o campo <code>messages</code>.
        O painel da Meta pode listar eventos mesmo quando a entrega à sua API falha — Hits abaixo
        só sobem se o POST chegar aqui.
      </p>

      <h2 style={{ marginTop: "1.5rem" }}>Templates Meta</h2>
      <p className="lede">
        Boleto (Utility): <code>{"{{1}}"}</code> nome, <code>{"{{2}}"}</code> valor,{" "}
        <code>{"{{3}}"}</code> vencimento, <code>{"{{4}}"}</code> link. Produto disponível
        (Marketing): <code>{"{{1}}"}</code> nome do cliente, <code>{"{{2}}"}</code> nome do
        produto + <strong>foto no HEADER</strong>. Template aprovado não edita in-place —
        “Recriar” apaga e envia de novo.
      </p>
      {tplMsg && <p className="admin-hint-ok">{tplMsg}</p>}
      <div className="admin-toolbar" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
        <button type="button" className="ghost" disabled={tplBusy} onClick={() => applyPreset("boleto")}>
          Modelo boleto
        </button>
        <button type="button" className="ghost" disabled={tplBusy} onClick={() => applyPreset("produto")}>
          Modelo produto + foto
        </button>
        <button type="button" className="ghost" disabled={tplBusy} onClick={() => void loadTemplates()}>
          Atualizar lista
        </button>
      </div>
      <div className="admin-toolbar" style={{ flexWrap: "wrap", gap: "0.5rem", marginTop: "0.5rem" }}>
        <input
          value={tplName}
          onChange={(e) => setTplName(e.target.value)}
          placeholder="nome_template"
          style={{ maxWidth: "12rem" }}
        />
        <input
          value={tplLang}
          onChange={(e) => setTplLang(e.target.value)}
          placeholder="pt_BR"
          style={{ maxWidth: "6rem" }}
        />
        <select
          value={tplCategory}
          onChange={(e) => setTplCategory(e.target.value === "MARKETING" ? "MARKETING" : "UTILITY")}
          style={{ maxWidth: "10rem" }}
        >
          <option value="UTILITY">UTILITY</option>
          <option value="MARKETING">MARKETING</option>
        </select>
      </div>
      <textarea
        value={tplBody}
        onChange={(e) => setTplBody(e.target.value)}
        rows={8}
        style={{ width: "100%", marginTop: "0.5rem", fontFamily: "inherit" }}
        placeholder="Corpo do template com {{1}} {{2}}..."
      />
      {tplHeaderFormat === "IMAGE" && (
        <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <label style={{ fontSize: "0.85rem" }}>
            Foto de exemplo (upload)
            <input
              type="file"
              accept="image/*"
              style={{ display: "block", marginTop: "0.25rem" }}
              onChange={(e) => setTplHeaderFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {tplHeaderFile && (
            <span className="admin-hint-ok" style={{ fontSize: "0.8rem" }}>
              Arquivo: {tplHeaderFile.name}
            </span>
          )}
          <input
            value={tplHeaderSampleUrl}
            onChange={(e) => setTplHeaderSampleUrl(e.target.value)}
            placeholder="Ou URL HTTPS da foto de exemplo"
            style={{ width: "100%" }}
          />
        </div>
      )}
      <div className="admin-toolbar" style={{ marginTop: "0.5rem" }}>
        <button
          type="button"
          disabled={tplBusy || !tplName.trim() || !tplBody.trim()}
          onClick={() => void saveTemplate(false)}
        >
          Criar template
        </button>
        <button
          type="button"
          className="ghost"
          disabled={tplBusy || !tplName.trim() || !tplBody.trim()}
          onClick={() => {
            if (
              window.confirm(
                "Recriar apaga o template com esse nome na Meta e cria de novo (precisa nova aprovação). Continuar?"
              )
            ) {
              void saveTemplate(true);
            }
          }}
        >
          Recriar (editar)
        </button>
      </div>
      {templates.length > 0 && (
        <table className="admin-table" style={{ marginTop: "1rem", width: "100%" }}>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Idioma</th>
              <th>Categoria</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={`${t.id}-${t.language}`}>
                <td>
                  <button
                    type="button"
                    className="ghost"
                    style={{ padding: 0 }}
                    onClick={() => {
                      setTplName(t.name);
                      setTplLang(t.language || "pt_BR");
                    }}
                  >
                    {t.name}
                  </button>
                </td>
                <td>{t.language}</td>
                <td>{t.category}</td>
                <td>
                  {t.status}
                  {t.rejectedReason ? ` (${t.rejectedReason})` : ""}
                </td>
                <td>
                  <button
                    type="button"
                    className="ghost"
                    disabled={tplBusy}
                    onClick={() => void removeTemplate(t.name)}
                  >
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 style={{ marginTop: "1.5rem" }}>Gupshup</h2>
      <p className="lede">
        BSP (Access API). App e Coexistência (CoEx) são feitos no{" "}
        <a href="https://docs.gupshup.io/docs/onboarding-guide" target="_blank" rel="noreferrer">
          dashboard Gupshup
        </a>
        , não neste CRM. Provider ativo: <strong>{providerLabel}</strong>
        {gupshupInfo?.configured ? " · credenciais OK" : " · configure API key / app / source no .env"}
      </p>
      {gupshupInfo && (
        <p>
          App: <code>{gupshupInfo.appName || "—"}</code>
          {" · "}
          App ID: <code>{gupshupInfo.appId || "—"}</code>
          {" · "}
          Source: <code>{gupshupInfo.source || "—"}</code>
          {" · "}
          CoEx: <code>{gupshupInfo.coexistenceEnabled ? "sim" : "não"}</code>
          {" · "}
          Botões: <code>{gupshupInfo.buttonsEnabled ? "sim" : "não (falta App ID)"}</code>
          {" · "}
          Template boleto: <code>{gupshupInfo.boletoTemplateId || "—"}</code>
        </p>
      )}
      <p>
        Status:{" "}
        <strong>
          {gupshupInfo?.configured
            ? provider === "gupshup"
              ? "conectado (Gupshup ativo)"
              : "configurado (não ativo)"
            : "não configurado"}
        </strong>
      </p>
      <div className="admin-toolbar" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
        <input
          value={gupshupAppId}
          onChange={(e) => setGupshupAppId(e.target.value)}
          placeholder="App ID (Settings Gupshup)"
          style={{ maxWidth: "22rem" }}
        />
        <button type="button" className="ghost" disabled={metaBusy || !gupshupAppId.trim()} onClick={() => void saveGupshupAppId()}>
          Salvar App ID
        </button>
        <button
          type="button"
          disabled={metaBusy || !gupshupInfo?.configured || provider === "gupshup"}
          onClick={() => void setProvider("gupshup")}
        >
          Usar Gupshup
        </button>
      </div>
      {!gupshupInfo?.buttonsEnabled && (
        <p className="admin-hint-ok">
          Sem App ID o menu vai como texto (<code>1 - Atendimento</code>), não como botão clicável.
          Cole o UUID de BianoWhats → Settings (ex. <code>cabde7f5-ff76-4530-afcc-4ef014ff8d00</code>)
          ou defina <code>GUPSHUP_APP_ID</code> no Railway.
        </p>
      )}
      <p className="lede">
        Callback URL no painel Gupshup:{" "}
        <code>
          {gupshupInfo?.webhookUrl ||
            "https://apibiano-production.up.railway.app/whatsapp/webhook/gupshup"}
        </code>
      </p>
      <p className="admin-hint-ok">
        Cole essa URL em Callback / webhook do app Access API. O BIANO só guarda IDs depois do Go
        Live. Evolution permanece como fallback (botão Usar Evolution acima).
      </p>

      <h2 style={{ marginTop: "1.5rem" }}>Evolution (QR)</h2>
      <p className="lede">
        Credenciais da Evolution ficam no .env. A instância abaixo é usada quando o provider é
        Evolution.
      </p>
      {error && <p className="admin-error">{error}</p>}
      {info && (
        <p>
          Instância{" "}
          <strong>{info.instanceName || "—"}</strong>
          {" · "}
          <span className={`connect-status${open ? " open" : ""}`}>{statusLabel}</span>
          {!info.credentialsOk && " · Configure WHATSAPP_API_URL e WHATSAPP_API_KEY"}
        </p>
      )}
      {open && (
        <p className="admin-hint-ok">
          WhatsApp já está conectado — por isso o QR não aparece. Para gerar um QR novo, clique em
          Desconectar e depois em Conectar / Gerar QR.
        </p>
      )}
      <div className="admin-toolbar">
        <input
          value={instanceName}
          onChange={(e) => setInstanceName(e.target.value)}
          placeholder="Nome da instância"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Telefone DDI+DDD (556634016000)"
          inputMode="tel"
        />
        <button type="button" disabled={busy || open || !instanceName.trim()} onClick={() => void connect(false)}>
          Conectar / Gerar QR
        </button>
        <button type="button" disabled={busy || open || !instanceName.trim()} onClick={() => void connect(true)}>
          Gerar código
        </button>
        <button type="button" className="ghost" disabled={busy} onClick={() => void disconnect()}>
          Desconectar
        </button>
      </div>
      {!open && info?.lastPairingCode && (
        <div className="admin-pairing">
          <span>Código para o WhatsApp</span>
          <strong>{formatPairingCode(info.lastPairingCode)}</strong>
          <p>
            No celular: WhatsApp → Aparelhos conectados → Conectar um aparelho →{" "}
            <em>Conectar com número de telefone</em> → cole este código.
          </p>
        </div>
      )}
      {!open && info?.lastQr && (
        <img
          className="admin-qr"
          src={info.lastQr.startsWith("data:") ? info.lastQr : `data:image/png;base64,${info.lastQr}`}
          alt="QR Code WhatsApp"
        />
      )}

      <h2 style={{ marginTop: "1.5rem" }}>Validar webhook</h2>
      <p className="lede">
        Meta (produção):{" "}
        <code>https://apibiano-production.up.railway.app/whatsapp/webhook/meta</code>
        . Gupshup:{" "}
        <code>https://apibiano-production.up.railway.app/whatsapp/webhook/gupshup</code>
        . Evolution/local: <code>/webhook/ping</code> no ngrok. Se Hits ficar 0 com a Meta
        mostrando “Carga”, a Callback URL na Meta está errada ou a entrega falhou.
      </p>
      <p>
        Hits: <strong>{hookStatus?.hits ?? 0}</strong>
        {hookStatus?.lastHitAt
          ? ` · último: ${new Date(hookStatus.lastHitAt).toLocaleString("pt-BR")}`
          : " · nenhum hit ainda"}
      </p>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Path</th>
              <th>Evento</th>
              <th>De</th>
              <th>Preview</th>
            </tr>
          </thead>
          <tbody>
            {(hookStatus?.recent ?? []).map((h, i) => (
              <tr key={`${h.at}-${i}`}>
                <td>{new Date(h.at).toLocaleTimeString("pt-BR")}</td>
                <td>{h.path}</td>
                <td>{h.event ?? "—"}</td>
                <td style={{ fontSize: "0.75rem" }}>{h.from ?? "—"}</td>
                <td>{h.preview ?? "—"}</td>
              </tr>
            ))}
            {(hookStatus?.recent?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={5} style={{ color: "var(--muted)" }}>
                  Nenhum request recebido ainda
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function catalogMediaSrc(url: string) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url) || url.startsWith("blob:")) return url;
  const base = import.meta.env.VITE_API_URL ?? "";
  const path = url.startsWith("/") ? url : `/${url}`;
  if (base && !base.startsWith("/")) return `${base.replace(/\/$/, "")}${path}`;
  return path;
}

type CatalogProductRow = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  images?: string[];
  productImages?: Array<{ id: string; imageUrl: string; sortOrder: number }>;
  active: boolean;
};

export function CatalogAdminPage() {
  const [products, setProducts] = useState<CatalogProductRow[]>([]);
  const [underConstruction, setUnderConstruction] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [newPhotos, setNewPhotos] = useState<PendingPhoto[]>([]);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const [list, settings] = await Promise.all([
      waApi.adminProducts(),
      waApi.adminCatalogSettings(),
    ]);
    setProducts(list);
    setUnderConstruction(settings.underConstruction);
  }

  useEffect(() => {
    load().catch((e) => setError(String(e.message)));
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const parsedPrice = parsePriceBr(price);
    if (parsedPrice == null) {
      setError("Informe um preço válido (ex.: 49,90)");
      return;
    }
    setBusy(true);
    try {
      const product = await waApi.createProduct({
        name,
        price: parsedPrice,
        description: description || undefined,
      });
      if (newPhotos.length) {
        await waApi.uploadProductImages(product.id, pendingPhotosToFiles(newPhotos));
      }
      revokePendingPhotos(newPhotos);
      setName("");
      setPrice("");
      setDescription("");
      setNewPhotos([]);
      await load();
    } catch (err) {
      setError(String((err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function toggleConstruction() {
    setBusy(true);
    setError("");
    try {
      const next = !underConstruction;
      await waApi.updateCatalogSettings({ underConstruction: next });
      setUnderConstruction(next);
    } catch (err) {
      setError(String((err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function uploadOnePhoto(productId: string, file: File) {
    setUploadingId(productId);
    setError("");
    try {
      await waApi.uploadProductImages(productId, [file]);
      await load();
    } catch (err) {
      setError(String((err as Error).message));
      throw err;
    } finally {
      setUploadingId(null);
    }
  }

  function startEdit(product: CatalogProductRow) {
    setEditingId(product.id);
    setEditName(product.name);
    setEditPrice(formatPriceBr(product.price));
    setEditDescription(product.description ?? "");
    setError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditPrice("");
    setEditDescription("");
  }

  async function saveEdit(productId: string) {
    const parsedPrice = parsePriceBr(editPrice);
    if (!editName.trim()) {
      setError("Informe o nome do item");
      return;
    }
    if (parsedPrice == null) {
      setError("Informe um preço válido (ex.: 49,90)");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await waApi.updateProduct(productId, {
        name: editName.trim(),
        price: parsedPrice,
        description: editDescription.trim() || null,
      });
      cancelEdit();
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
        <h1>Catálogo</h1>
      </div>
      {error && <p className="admin-error">{error}</p>}

      <div className="catalog-settings-bar">
        <label className="inline-check catalog-construction-toggle">
          <input
            type="checkbox"
            checked={underConstruction}
            disabled={busy}
            onChange={() => void toggleConstruction()}
          />
          <span>
            <strong>Loja em construção</strong>
            <small>O visitante vê só a página “Em construção” — produtos ficam ocultos.</small>
          </span>
        </label>
      </div>

      <div className="catalog-create-section">
        <form className="admin-toolbar catalog-create-info" onSubmit={(e) => void create(e)}>
          <h2 className="catalog-section-title">Informações do item</h2>
          <div className="catalog-create-fields">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" required />
            <input
              value={price}
              onChange={(e) => setPrice(maskPriceBrInput(e.target.value))}
              placeholder="0,00"
              inputMode="numeric"
              required
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrição"
            />
            <button type="submit" disabled={busy}>
              {busy ? "Salvando…" : "Adicionar item"}
            </button>
          </div>
        </form>

        <div className="admin-toolbar catalog-create-photos">
          <h2 className="catalog-section-title">Fotos do item</h2>
          <CatalogPhotoPicker photos={newPhotos} onChange={setNewPhotos} disabled={busy} />
        </div>
      </div>

      <div className="catalog-admin-list">
        {products.map((p) => (
          <article key={p.id} className="catalog-admin-product">
            <div className="catalog-admin-product-media">
              <CatalogProductPhotos
                productId={p.id}
                images={p.productImages ?? []}
                mediaSrc={catalogMediaSrc}
                uploading={uploadingId === p.id}
                onUpload={uploadOnePhoto}
                onDelete={async (productId, imageId) => {
                  await waApi.deleteProductImage(productId, imageId);
                  await load();
                }}
                onReorder={async (productId, imageIds) => {
                  await waApi.reorderProductImages(productId, imageIds);
                  await load();
                }}
                onReplace={async (productId, imageId, file) => {
                  setUploadingId(productId);
                  try {
                    await waApi.replaceProductImage(productId, imageId, file);
                    await load();
                  } finally {
                    setUploadingId(null);
                  }
                }}
              />
            </div>
            <div className="catalog-admin-product-info">
              {editingId === p.id ? (
                <form
                  className="catalog-admin-edit-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveEdit(p.id);
                  }}
                >
                  <div className="catalog-admin-product-head">
                    <h3 className="catalog-section-title">Editar item</h3>
                    <span className={`admin-pill${p.active ? " ok" : " warn"}`}>
                      {p.active ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                  <label className="catalog-admin-edit-field">
                    <span>Nome</span>
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Nome"
                      required
                      disabled={busy}
                    />
                  </label>
                  <label className="catalog-admin-edit-field">
                    <span>Preço</span>
                    <input
                      value={editPrice}
                      onChange={(e) => setEditPrice(maskPriceBrInput(e.target.value))}
                      placeholder="0,00"
                      inputMode="numeric"
                      required
                      disabled={busy}
                    />
                  </label>
                  <label className="catalog-admin-edit-field">
                    <span>Descrição</span>
                    <input
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Descrição"
                      disabled={busy}
                    />
                  </label>
                  <div className="actions">
                    <button type="submit" disabled={busy}>
                      {busy ? "Salvando…" : "Salvar"}
                    </button>
                    <button type="button" className="ghost" disabled={busy} onClick={cancelEdit}>
                      Cancelar
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="catalog-admin-product-head">
                    <div>
                      <strong>{p.name}</strong>
                      <div className="catalog-admin-product-price">
                        {p.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </div>
                      {p.description && (
                        <div className="catalog-admin-product-desc">{p.description}</div>
                      )}
                    </div>
                    <span className={`admin-pill${p.active ? " ok" : " warn"}`}>
                      {p.active ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                  <div className="actions">
                    <button type="button" disabled={busy} onClick={() => startEdit(p)}>
                      Editar
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() =>
                        void waApi.updateProduct(p.id, { active: !p.active }).then(load)
                      }
                    >
                      {p.active ? "Desativar" : "Ativar"}
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => void waApi.deleteProduct(p.id).then(load)}
                    >
                      Remover
                    </button>
                  </div>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function galleryMediaSrc(url: string) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url) || url.startsWith("blob:")) return url;
  const base = import.meta.env.VITE_API_URL ?? "";
  const path = url.startsWith("/") ? url : `/${url}`;
  if (base && !base.startsWith("/")) return `${base.replace(/\/$/, "")}${path}`;
  return path;
}

type GalleryRow = {
  id: string;
  imageUrl: string;
  caption: string | null;
  status: "pending" | "approved" | "rejected";
  sortOrder: number;
  createdAt: string;
  submittedBy: { id: string; name: string } | null;
  reviewedBy: { id: string; name: string } | null;
  reviewedAt: string | null;
};

/** Aprova fotos de vendedores para a galeria da LP. */
export function GalleryAdminPage() {
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "">("pending");
  const [items, setItems] = useState<GalleryRow[]>([]);
  const [error, setError] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null);

  async function load() {
    setItems(await waApi.adminGallery(filter));
  }

  useEffect(() => {
    load().catch((e) => setError(String(e.message)));
  }, [filter]);

  async function setStatus(id: string, status: "approved" | "rejected" | "pending") {
    setError("");
    try {
      await waApi.updateGalleryImage(id, { status });
      await load();
    } catch (err) {
      setError(String((err as Error).message));
    }
  }

  return (
    <div className="admin-panel">
      <div className="admin-panel-head">
        <h1>Galeria da loja</h1>
      </div>
      <p className="lede" style={{ marginTop: 0 }}>
        Fotos enviadas pelos vendedores no atendimento entram como{" "}
        <strong>pendentes</strong>. Aprove produto/estilo para a LP; rejeite comprovante e
        documentos.
      </p>
      {error && <p className="admin-error">{error}</p>}
      <div className="admin-toolbar" style={{ flexWrap: "wrap" }}>
        {(
          [
            { v: "pending" as const, l: "Pendentes" },
            { v: "approved" as const, l: "Aprovadas" },
            { v: "rejected" as const, l: "Rejeitadas" },
            { v: "" as const, l: "Todas" },
          ] as const
        ).map((f) => (
          <button
            key={f.v || "all"}
            type="button"
            className={filter === f.v ? "" : "ghost"}
            onClick={() => setFilter(f.v)}
          >
            {f.l}
          </button>
        ))}
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th />
              <th>Legenda</th>
              <th>Vendedor</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((g) => (
              <tr key={g.id}>
                <td>
                  <button
                    type="button"
                    className="ghost"
                    style={{ padding: 0 }}
                    onClick={() => setLightbox(galleryMediaSrc(g.imageUrl))}
                  >
                    <img className="admin-thumb" src={galleryMediaSrc(g.imageUrl)} alt="" />
                  </button>
                </td>
                <td>
                  <div style={{ color: "var(--muted)", fontSize: "0.78rem" }}>
                    {g.caption || "—"}
                  </div>
                  <div style={{ color: "var(--muted)", fontSize: "0.72rem" }}>
                    {new Date(g.createdAt).toLocaleString("pt-BR")}
                  </div>
                </td>
                <td>{g.submittedBy?.name ?? "—"}</td>
                <td>
                  <span
                    className={`admin-pill${
                      g.status === "approved" ? " ok" : g.status === "pending" ? " warn" : ""
                    }`}
                  >
                    {g.status === "approved"
                      ? "Na LP"
                      : g.status === "pending"
                        ? "Pendente"
                        : "Rejeitada"}
                  </span>
                </td>
                <td>
                  <div className="actions">
                    {g.status !== "approved" && (
                      <button type="button" onClick={() => void setStatus(g.id, "approved")}>
                        Aprovar
                      </button>
                    )}
                    {g.status !== "rejected" && (
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => void setStatus(g.id, "rejected")}
                      >
                        Rejeitar
                      </button>
                    )}
                    {g.status !== "pending" && (
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => void setStatus(g.id, "pending")}
                      >
                        Voltar pendente
                      </button>
                    )}
                    <button
                      type="button"
                      className="ghost"
                      onClick={() =>
                        void waApi.deleteGalleryImage(g.id).then(load).catch((e) => {
                          setError(String((e as Error).message));
                        })
                      }
                    >
                      Remover
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} style={{ color: "var(--muted)" }}>
                  Nenhuma foto neste filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {lightbox && (
        <button
          type="button"
          className="ghost"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 80,
            background: "rgba(0,0,0,0.82)",
            display: "grid",
            placeItems: "center",
            border: "none",
            cursor: "zoom-out",
          }}
          onClick={() => setLightbox(null)}
          aria-label="Fechar"
        >
          <img
            src={lightbox}
            alt=""
            style={{ maxWidth: "92vw", maxHeight: "88vh", objectFit: "contain" }}
          />
        </button>
      )}
    </div>
  );
}
