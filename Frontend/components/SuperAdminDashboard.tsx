import React, { useState, useEffect, useCallback } from "react";
import {
  Shield,
  LogOut,
  Save,
  RefreshCw,
  AlertTriangle,
  CloudCog,
  FileText,
} from "lucide-react";
import { CompanyType } from "../types";

const API_BASE =
  String((import.meta as unknown as { env?: { VITE_API_URL?: string } }).env
    ?.VITE_API_URL ?? "").replace(/\/$/, "") || "";

type LicenseDto = {
  maxUsers: number | null;
  maxProducts: number | null;
  maxOrders: number | null;
  usage: { users: number; products: number; orders: number };
  enabledModules: string[];
  companyTypeManagedBySaas: boolean;
  forcedCompanyType: string | null;
  licenseKey: string | null;
  licenseExpiresAt: number | null;
  licenseExpired: boolean;
  allModuleIds?: readonly string[];
  externalSubscription?: {
    enabled: boolean;
    lastSyncAt: number | null;
    lastStatus: string | null;
    lastMessage: string | null;
  };
  externalLicenseApiEnabled?: boolean;
  externalLicenseApiBaseUrl?: string | null;
  externalLicenseVerifyPath?: string | null;
  externalLicenseTenantId?: string | null;
  externalLicenseApiTokenConfigured?: boolean;
  appliedCompanyType?: string | null;
};

const MODULE_LABELS: Record<string, string> = {
  dashboard: "Tableau de bord",
  tables: "Plan de salle",
  reports: "Rapports",
  pos: "Point de vente",
  "open-tickets": "Tickets en cours",
  kds: "Cuisine (KDS)",
  "gestion-article": "Gestion articles",
  "gestion-categories": "Catégories",
  "gestion-promotion": "Promotions",
  "gestion-stock": "Stock",
  achats: "Achats",
  analytics: "Analyses",
  clients: "Clients & factures",
  cash: "Caisse",
  settings: "Paramètres",
};

async function saasFetch(path: string, token: string, init?: RequestInit) {
  const r = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || r.statusText);
  return j;
}

interface Props {
  token: string;
  onExit: () => void;
}

function isSaasSessionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const m = String(err.message || "").toLowerCase();
  return (
    m.includes("session super admin requise") ||
    m.includes("unauthorized") ||
    m.includes("401")
  );
}

const SuperAdminDashboard: React.FC<Props> = ({ token, onExit }) => {
  const [data, setData] = useState<LicenseDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const [maxUsers, setMaxUsers] = useState("");
  const [maxProducts, setMaxProducts] = useState("");
  const [maxOrders, setMaxOrders] = useState("");
  const [licenseKey, setLicenseKey] = useState("");
  const [licenseExpiresAt, setLicenseExpiresAt] = useState("");
  const [companyTypeManaged, setCompanyTypeManaged] = useState(false);
  const [forcedCompanyType, setForcedCompanyType] = useState<CompanyType>(
    CompanyType.RESTAURANT_CAFE,
  );
  const [modules, setModules] = useState<Set<string>>(new Set());
  const [newSuperAdminCode, setNewSuperAdminCode] = useState("");

  const [extEnabled, setExtEnabled] = useState(false);
  const [extBaseUrl, setExtBaseUrl] = useState("");
  const [extPath, setExtPath] = useState("/license/status");
  const [extTenantId, setExtTenantId] = useState("");
  const [extToken, setExtToken] = useState("");
  const [extClearToken, setExtClearToken] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [devLogDays, setDevLogDays] = useState<string[]>([]);
  const [devLogDate, setDevLogDate] = useState<string>("");
  const [devLogContent, setDevLogContent] = useState<string>("");
  const [devLogNote, setDevLogNote] = useState("");
  const [devLogBusy, setDevLogBusy] = useState(false);

  const load = useCallback(async () => {
    setErr("");
    setLoading(true);
    try {
      const j = await saasFetch("/saas/license", token);
      setData(j);
      setMaxUsers(j.maxUsers != null ? String(j.maxUsers) : "");
      setMaxProducts(j.maxProducts != null ? String(j.maxProducts) : "");
      setMaxOrders(j.maxOrders != null ? String(j.maxOrders) : "");
      setLicenseKey(j.licenseKey || "");
      setLicenseExpiresAt(
        j.licenseExpiresAt
          ? new Date(Number(j.licenseExpiresAt)).toISOString().slice(0, 16)
          : "",
      );
      setCompanyTypeManaged(Boolean(j.companyTypeManagedBySaas));
      setForcedCompanyType(
        (j.forcedCompanyType as CompanyType) || CompanyType.RESTAURANT_CAFE,
      );
      setModules(new Set(j.enabledModules || []));
      setExtEnabled(Boolean(j.externalSubscription?.enabled ?? j.externalLicenseApiEnabled));
      setExtBaseUrl(String(j.externalLicenseApiBaseUrl || "").trim());
      setExtPath(String(j.externalLicenseVerifyPath || "/license/status").trim());
      setExtTenantId(String(j.externalLicenseTenantId || "").trim());
      setExtToken("");
      setExtClearToken(false);
    } catch (e) {
      if (isSaasSessionError(e)) {
        setErr("Session super admin expirée. Merci de vous reconnecter.");
        onExit();
        return;
      }
      setErr(e instanceof Error ? e.message : "Erreur chargement licence");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const j = (await saasFetch("/saas/logs", token)) as {
          days?: string[];
        };
        if (cancelled) return;
        const days = Array.isArray(j.days) ? j.days : [];
        const today = new Date().toISOString().slice(0, 10);
        setDevLogDays(days);
        setDevLogDate((prev) =>
          prev && days.includes(prev) ? prev : days[0] || today,
        );
      } catch (e) {
        if (cancelled) return;
        if (isSaasSessionError(e)) {
          setErr("Session super admin expirée. Merci de vous reconnecter.");
          onExit();
          return;
        }
        setErr(
          e instanceof Error
            ? `Journal développeur indisponible: ${e.message}`
            : "Journal développeur indisponible.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!devLogDate) return;
    let cancelled = false;
    void (async () => {
      try {
        const j = (await saasFetch(
          `/saas/logs?date=${encodeURIComponent(devLogDate)}`,
          token,
        )) as { content?: string };
        if (cancelled) return;
        setDevLogContent(typeof j.content === "string" ? j.content : "");
      } catch (e) {
        if (cancelled) return;
        if (isSaasSessionError(e)) {
          setErr("Session super admin expirée. Merci de vous reconnecter.");
          onExit();
          return;
        }
        setErr(
          e instanceof Error
            ? `Lecture du journal impossible: ${e.message}`
            : "Lecture du journal impossible.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, devLogDate]);

  const toggleMod = (id: string) => {
    setModules((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const handleSave = async () => {
    setErr("");
    setOkMsg("");
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        maxUsers: maxUsers.trim() === "" ? null : Number.parseInt(maxUsers, 10),
        maxProducts:
          maxProducts.trim() === "" ? null : Number.parseInt(maxProducts, 10),
        maxOrders:
          maxOrders.trim() === "" ? null : Number.parseInt(maxOrders, 10),
        enabledModules: Array.from(modules),
        companyTypeManagedBySaas: companyTypeManaged,
        forcedCompanyType: companyTypeManaged ? forcedCompanyType : null,
        licenseKey: licenseKey.trim() || null,
        licenseExpiresAt:
          licenseExpiresAt.trim() === ""
            ? null
            : new Date(licenseExpiresAt).getTime(),
      };
      if (newSuperAdminCode.trim().length >= 4) {
        payload.newSuperAdminCode = newSuperAdminCode.trim();
      }
      payload.externalLicenseApiEnabled = extEnabled;
      payload.externalLicenseApiBaseUrl = extBaseUrl.trim() || null;
      payload.externalLicenseVerifyPath = extPath.trim() || null;
      payload.externalLicenseTenantId = extTenantId.trim() || null;
      if (extClearToken) payload.externalLicenseApiToken = null;
      else if (extToken.trim())
        payload.externalLicenseApiToken = extToken.trim();

      await saasFetch("/saas/license", token, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setNewSuperAdminCode("");
      setOkMsg("Licence enregistrée.");
      await load();
    } catch (e) {
      if (isSaasSessionError(e)) {
        setErr("Session super admin expirée. Merci de vous reconnecter.");
        onExit();
        return;
      }
      setErr(e instanceof Error ? e.message : "Erreur sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  const handleSyncExternal = async () => {
    setErr("");
    setOkMsg("");
    setSyncing(true);
    try {
      const r = await fetch(`${API_BASE}/saas/license/sync-external`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const j = await r.json().catch(() => ({}));
      await load();
      if (!r.ok) {
        setErr(
          typeof j?.error === "string"
            ? j.error
            : "Synchronisation impossible.",
        );
        return;
      }
      setOkMsg("Licence mise à jour depuis l’API d’abonnement.");
    } catch (e) {
      if (isSaasSessionError(e)) {
        setErr("Session super admin expirée. Merci de vous reconnecter.");
        onExit();
        return;
      }
      setErr(e instanceof Error ? e.message : "Erreur réseau (sync).");
      await load();
    } finally {
      setSyncing(false);
    }
  };

  const allIds = data?.allModuleIds?.length
    ? data.allModuleIds
    : Array.from(modules);

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-violet-600 flex items-center justify-center shadow-lg">
              <Shield size={24} />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight">
                Super administrateur
              </h1>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Licence & quotas — SaaS
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => load()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 text-[10px] font-black uppercase tracking-widest hover:bg-slate-700"
            >
              <RefreshCw size={14} /> Rafraîchir
            </button>
            <button
              type="button"
              onClick={onExit}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 text-[10px] font-black uppercase tracking-widest"
            >
              <LogOut size={14} /> Quitter
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {data?.licenseExpired && (
          <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 flex gap-3 items-start">
            <AlertTriangle className="text-rose-400 shrink-0" />
            <p className="text-sm font-bold text-rose-200">
              La licence est expirée : les créations (utilisateurs, articles,
              commandes) peuvent être bloquées. Mettez à jour la date ou la clé.
            </p>
          </div>
        )}

        {err && (
          <p className="rounded-xl bg-rose-500/15 border border-rose-500/30 px-4 py-3 text-sm font-bold text-rose-300">
            {err}
          </p>
        )}
        {okMsg && (
          <p className="rounded-xl bg-emerald-500/15 border border-emerald-500/30 px-4 py-3 text-sm font-bold text-emerald-300">
            {okMsg}
          </p>
        )}

        {loading ? (
          <p className="text-slate-500 font-bold">Chargement…</p>
        ) : (
          <>
            <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <p className="text-[10px] font-black uppercase text-slate-500">
                  Utilisateurs
                </p>
                <p className="text-2xl font-black mt-1">
                  {data?.usage.users ?? 0}
                  {data?.maxUsers != null ? (
                    <span className="text-slate-500 text-lg font-bold">
                      {" "}
                      / {data.maxUsers}
                    </span>
                  ) : (
                    <span className="text-slate-600 text-sm font-bold">
                      {" "}
                      (illimité)
                    </span>
                  )}
                </p>
                <label className="block mt-3 text-[10px] font-black uppercase text-slate-500">
                  Plafond (vide = illimité)
                </label>
                <input
                  type="number"
                  min={0}
                  value={maxUsers}
                  onChange={(e) => setMaxUsers(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-sm font-bold"
                />
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <p className="text-[10px] font-black uppercase text-slate-500">
                  Articles
                </p>
                <p className="text-2xl font-black mt-1">
                  {data?.usage.products ?? 0}
                  {data?.maxProducts != null ? (
                    <span className="text-slate-500 text-lg font-bold">
                      {" "}
                      / {data.maxProducts}
                    </span>
                  ) : (
                    <span className="text-slate-600 text-sm font-bold">
                      {" "}
                      (illimité)
                    </span>
                  )}
                </p>
                <label className="block mt-3 text-[10px] font-black uppercase text-slate-500">
                  Plafond (vide = illimité)
                </label>
                <input
                  type="number"
                  min={0}
                  value={maxProducts}
                  onChange={(e) => setMaxProducts(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-sm font-bold"
                />
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <p className="text-[10px] font-black uppercase text-slate-500">
                  Commandes (tickets)
                </p>
                <p className="text-2xl font-black mt-1">
                  {data?.usage.orders ?? 0}
                  {data?.maxOrders != null ? (
                    <span className="text-slate-500 text-lg font-bold">
                      {" "}
                      / {data.maxOrders}
                    </span>
                  ) : (
                    <span className="text-slate-600 text-sm font-bold">
                      {" "}
                      (illimité)
                    </span>
                  )}
                </p>
                <label className="block mt-3 text-[10px] font-black uppercase text-slate-500">
                  Plafond (vide = illimité)
                </label>
                <input
                  type="number"
                  min={0}
                  value={maxOrders}
                  onChange={(e) => setMaxOrders(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-sm font-bold"
                />
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
              <h2 className="text-sm font-black uppercase tracking-widest text-violet-400">
                Licence
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500">
                    Clé / référence licence
                  </label>
                  <input
                    value={licenseKey}
                    onChange={(e) => setLicenseKey(e.target.value)}
                    className="mt-1 w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-sm font-bold"
                    placeholder="ex. LIC-2026-XXXX"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500">
                    Fin de validité (optionnel)
                  </label>
                  <input
                    type="datetime-local"
                    value={licenseExpiresAt}
                    onChange={(e) => setLicenseExpiresAt(e.target.value)}
                    className="mt-1 w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-sm font-bold"
                  />
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
              <h2 className="text-sm font-black uppercase tracking-widest text-violet-400 flex items-center gap-2">
                <CloudCog size={18} />
                API abonnement / licence (externe)
              </h2>
              <p className="text-xs text-slate-400 font-bold leading-relaxed">
                Connexion optionnelle vers votre application de facturation ou
                d’abonnements. Le serveur envoie un POST JSON{" "}
                <code className="text-slate-300">{`{ tenantId, licenseKey }`}</code>{" "}
                vers l’URL configurée et met à jour quotas, modules et date
                d’expiration selon la réponse (champs{" "}
                <code className="text-slate-300">maxUsers</code>,{" "}
                <code className="text-slate-300">licenseExpiresAt</code>, etc.).
              </p>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={extEnabled}
                  onChange={(e) => setExtEnabled(e.target.checked)}
                  className="h-4 w-4 rounded"
                />
                <span className="text-sm font-bold">
                  Activer la synchronisation avec l’API externe
                </span>
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="text-[10px] font-black uppercase text-slate-500">
                    URL de base (ex. https://billing.example.com/api)
                  </label>
                  <input
                    value={extBaseUrl}
                    onChange={(e) => setExtBaseUrl(e.target.value)}
                    disabled={!extEnabled}
                    className="mt-1 w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-sm font-bold disabled:opacity-50"
                    placeholder="https://…"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500">
                    Chemin ou URL complète
                  </label>
                  <input
                    value={extPath}
                    onChange={(e) => setExtPath(e.target.value)}
                    disabled={!extEnabled}
                    className="mt-1 w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-sm font-bold disabled:opacity-50"
                    placeholder="/license/status"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500">
                    ID tenant / abonnement (côté plateforme)
                  </label>
                  <input
                    value={extTenantId}
                    onChange={(e) => setExtTenantId(e.target.value)}
                    disabled={!extEnabled}
                    className="mt-1 w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-sm font-bold disabled:opacity-50"
                    placeholder="ex. sub_xxx ou UUID"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-[10px] font-black uppercase text-slate-500">
                    Token / clé API (Authorization: Bearer …)
                  </label>
                  <input
                    type="password"
                    value={extToken}
                    onChange={(e) => setExtToken(e.target.value)}
                    disabled={!extEnabled}
                    autoComplete="new-password"
                    className="mt-1 w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-sm font-bold disabled:opacity-50"
                    placeholder={
                      data?.externalLicenseApiTokenConfigured
                        ? "Laisser vide pour conserver le token actuel"
                        : "Optionnel"
                    }
                  />
                  <label className="mt-2 flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-400">
                    <input
                      type="checkbox"
                      checked={extClearToken}
                      onChange={(e) => setExtClearToken(e.target.checked)}
                      disabled={!extEnabled}
                    />
                    Supprimer le token stocké
                  </label>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={!extEnabled || syncing}
                  onClick={handleSyncExternal}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                >
                  <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
                  {syncing ? "Synchronisation…" : "Synchroniser maintenant"}
                </button>
                {data?.externalSubscription?.lastSyncAt != null && (
                  <span className="text-[10px] font-bold text-slate-500">
                    Dernière synchro :{" "}
                    {new Date(
                      Number(data.externalSubscription.lastSyncAt),
                    ).toLocaleString()}
                    {data.externalSubscription.lastStatus
                      ? ` — ${data.externalSubscription.lastStatus}`
                      : ""}
                  </span>
                )}
              </div>
              {data?.externalSubscription?.lastMessage && (
                <p className="text-xs font-bold text-amber-400/90">
                  {data.externalSubscription.lastMessage}
                </p>
              )}
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
              <h2 className="text-sm font-black uppercase tracking-widest text-violet-400">
                Type de société (admin local)
              </h2>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={companyTypeManaged}
                  onChange={(e) => setCompanyTypeManaged(e.target.checked)}
                  className="h-4 w-4 rounded"
                />
                <span className="text-sm font-bold">
                  Forcer le type depuis le Super Admin (l’admin ne peut plus le
                  modifier dans Paramètres)
                </span>
              </label>
              {companyTypeManaged && (
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500">
                    Type imposé
                  </label>
                  <select
                    value={forcedCompanyType}
                    onChange={(e) =>
                      setForcedCompanyType(e.target.value as CompanyType)
                    }
                    className="mt-1 w-full max-w-md rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-sm font-bold"
                  >
                    <option value={CompanyType.FAST_FOOD}>Fast-food</option>
                    <option value={CompanyType.RESTAURANT_CAFE}>
                      Restaurant / Café
                    </option>
                    <option value={CompanyType.SHOP_SINGLE}>
                      Commerce — boutique
                    </option>
                    <option value={CompanyType.SHOP_MULTI}>
                      Commerce — multi-magasins
                    </option>
                  </select>
                </div>
              )}
              <div className="rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Type appliqué en base
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-lg bg-slate-700 px-3 py-1 text-xs font-black text-slate-100">
                    {String(data?.appliedCompanyType || forcedCompanyType || "N/A")
                      .replaceAll("_", " ")}
                  </span>
                  {companyTypeManaged ? (
                    <span className="rounded-lg bg-emerald-500/20 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-300 border border-emerald-500/30">
                      verrouillé SaaS
                    </span>
                  ) : (
                    <span className="rounded-lg bg-amber-500/20 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-amber-300 border border-amber-500/30">
                      modifiable localement
                    </span>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
              <h2 className="text-sm font-black uppercase tracking-widest text-violet-400">
                Modules visibles (menu)
              </h2>
              <p className="text-xs text-slate-400 font-bold">
                Décochez pour masquer une entrée du menu pour tous les rôles.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {allIds.map((id) => (
                  <label
                    key={id}
                    className="flex items-center gap-2 rounded-xl bg-slate-800/50 px-3 py-2 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={modules.has(id)}
                      onChange={() => toggleMod(id)}
                    />
                    <span className="text-sm font-bold">
                      {MODULE_LABELS[id] || id}
                    </span>
                  </label>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="text-sm font-black uppercase tracking-widest text-violet-400 flex items-center gap-2">
                  <FileText size={18} />
                  Journal développeur
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    void (async () => {
                      try {
                        const j = (await saasFetch("/saas/logs", token)) as {
                          days?: string[];
                        };
                        const days = Array.isArray(j.days) ? j.days : [];
                        setDevLogDays(days);
                        setDevLogDate((prev) =>
                          prev && days.includes(prev)
                            ? prev
                            : days[0] || new Date().toISOString().slice(0, 10),
                        );
                        setOkMsg("Journal développeur actualisé.");
                      } catch (e) {
                        if (isSaasSessionError(e)) {
                          setErr("Session super admin expirée. Merci de vous reconnecter.");
                          onExit();
                          return;
                        }
                        setErr(
                          e instanceof Error
                            ? e.message
                            : "Impossible de charger le journal.",
                        );
                      }
                    })();
                  }}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 text-[10px] font-black uppercase tracking-widest hover:bg-slate-700"
                >
                  <RefreshCw size={14} /> Rafraîchir les jours
                </button>
              </div>
              <p className="text-xs text-slate-400 font-bold leading-relaxed">
                Fichiers côté serveur :{" "}
                <code className="text-slate-300">
                  data/audit-logs/developer/AAAA-MM-JJ/HH-mm/events.jsonl
                </code>{" "}
                (une ligne JSON par événement). Les modifications de licence et la
                synchro externe sont journalisées automatiquement.
              </p>
              <div className="flex flex-wrap gap-3 items-center">
                <label className="text-[10px] font-black uppercase text-slate-500">
                  Jour
                </label>
                <select
                  value={devLogDate}
                  onChange={(e) => setDevLogDate(e.target.value)}
                  className="rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-sm font-bold min-w-[9rem]"
                >
                  {devLogDays.length === 0 ? (
                    <option value="">—</option>
                  ) : (
                    devLogDays.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <pre className="max-h-64 overflow-auto rounded-xl bg-slate-950 text-emerald-300/90 text-[11px] p-4 font-mono whitespace-pre-wrap border border-slate-800">
                {devLogContent.trim() ||
                  "— Aucune entrée pour ce jour —"}
              </pre>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500">
                  Note développeur
                </label>
                <textarea
                  value={devLogNote}
                  onChange={(e) => setDevLogNote(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-sm font-bold"
                  placeholder="Maintenance, incident, référence ticket…"
                />
                <button
                  type="button"
                  disabled={devLogBusy || !devLogNote.trim()}
                  onClick={() => {
                    if (!devLogNote.trim()) return;
                    setDevLogBusy(true);
                    void (async () => {
                      try {
                        await saasFetch("/saas/logs", token, {
                          method: "POST",
                          body: JSON.stringify({
                            message: devLogNote.trim(),
                          }),
                        });
                        setDevLogNote("");
                        setOkMsg("Note ajoutée au journal.");
                        const day =
                          devLogDate ||
                          new Date().toISOString().slice(0, 10);
                        if (!devLogDate) setDevLogDate(day);
                        const j = (await saasFetch(
                          `/saas/logs?date=${encodeURIComponent(day)}`,
                          token,
                        )) as { content?: string };
                        setDevLogContent(
                          typeof j.content === "string" ? j.content : "",
                        );
                      } catch (e) {
                        if (isSaasSessionError(e)) {
                          setErr("Session super admin expirée. Merci de vous reconnecter.");
                          onExit();
                          return;
                        }
                        setErr(
                          e instanceof Error
                            ? e.message
                            : "Échec enregistrement note.",
                        );
                      } finally {
                        setDevLogBusy(false);
                      }
                    })();
                  }}
                  className="px-4 py-2 rounded-xl bg-violet-700 hover:bg-violet-600 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                >
                  Enregistrer la note
                </button>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
              <h2 className="text-sm font-black uppercase tracking-widest text-violet-400">
                Code Super Admin
              </h2>
              <p className="text-xs text-slate-400 font-bold">
                Laissez vide pour ne pas changer. Minimum 4 caractères si saisi.
              </p>
              <input
                type="password"
                value={newSuperAdminCode}
                onChange={(e) => setNewSuperAdminCode(e.target.value)}
                className="w-full max-w-md rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-sm font-bold"
                placeholder="Nouveau code"
                autoComplete="new-password"
              />
            </section>

            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="flex items-center justify-center gap-2 w-full md:w-auto px-10 py-4 rounded-2xl bg-violet-600 hover:bg-violet-500 font-black text-xs uppercase tracking-widest disabled:opacity-50"
            >
              <Save size={18} /> {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </>
        )}
      </main>
    </div>
  );
};

export default SuperAdminDashboard;
