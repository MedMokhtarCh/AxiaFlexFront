import React, { useState, useEffect, useMemo, useRef } from "react";
import { usePOS } from "../store/POSContext";
import { notifyError, notifySuccess } from "../utils/notify";
import { printerBonProfile, isReceiptPrinter } from "../utils/printerUtils";
import {
  formatAdminLogEntryFriendly,
  parseAdminLogJsonl,
} from "../utils/adminLogHumanReadable";
import {
  Role,
  User,
  Printer,
  DetectedPrinter,
  TableReservation,
  ShiftSummary,
  CompanyType,
  PosDiscountPreset,
  DEFAULT_POS_DISCOUNT_PRESETS,
  RestaurantVoucher,
  RestaurantCard,
  RestaurantCardMovement,
  TerminalNodeInfo,
  USER_CLAIM_OPTIONS,
} from "../types";
import RestaurantFloorPlanEditor, {
  suggestTablePlanLayout,
} from "./RestaurantFloorPlanEditor";
import HtmlTemplateDesigner from "./HtmlTemplateDesigner";
import {
  Printer as PrinterIcon,
  Trash2,
  Plus,
  Settings as SettingsIcon,
  StickyNote,
  X,
  Map,
  Layout,
  Users,
  ShieldCheck,
  ChefHat,
  Package,
  Banknote,
  UserPlus,
  Key,
  Pencil,
  MapPin,
  Check,
  AlertCircle,
  AlertTriangle,
  BarChart2,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Bell,
  DollarSign,
  Download,
  Edit2,
  FileText,
  Filter,
  History,
  Image as ImageIcon,
  Info,
  LayoutDashboard,
  ListChecks,
  Lock,
  LogOut,
  MinusCircle,
  Percent,
  Save,
  Settings,
  Table,
  Unlock,
  Upload,
  CreditCard,
  Ticket,
  ScanLine,
  HelpCircle,
  Lightbulb,
} from "lucide-react";

type ClientTicketTemplateUi = "CLASSIC" | "COMPACT" | "MODERN";
type ClientKdsModeUi = "STANDARD" | "WALLBOARD" | "AUTO";
type TvaCatalogEntry = { code: string; label: string; rate: number };
type FiscalCategoryEntry = {
  articleCategory: string;
  familyCode: string;
  label?: string;
};

const normalizeTvaCatalogFromSettings = (raw: any, fallbackRate = 0): TvaCatalogEntry[] => {
  const list = Array.isArray(raw) ? raw : [];
  const normalized = list
    .map((row: any, index: number) => ({
      code: String(row?.code || `TVA_${index + 1}`).trim().toUpperCase(),
      label: String(row?.label || "").trim(),
      rate: Number(row?.rate ?? 0),
    }))
    .filter((row: TvaCatalogEntry) => row.code.length > 0 && Number.isFinite(row.rate) && row.rate >= 0);
  if (normalized.length > 0) return normalized;
  return [{ code: "TVA_STD", label: "TVA standard", rate: Math.max(0, Number(fallbackRate || 0)) }];
};

const normalizeFiscalCategoryCatalogFromSettings = (raw: any): FiscalCategoryEntry[] => {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((row: any) => ({
      articleCategory: String(
        row?.articleCategory ?? row?.productCategory ?? row?.category ?? "",
      ).trim(),
      familyCode: String(row?.familyCode ?? row?.code ?? "")
        .trim()
        .toUpperCase(),
      label: String(row?.label ?? "").trim(),
    }))
    .filter(
      (row: FiscalCategoryEntry) =>
        row.articleCategory.length > 0 && row.familyCode.length > 0,
    );
};

const isValidFiscalFamilyCode = (value: string) =>
  /^[A-Z0-9_]{2,32}$/.test(String(value || "").trim().toUpperCase());

const GeneralSettingsSection: React.FC<{
  title: string;
  description?: string;
  headerBadge?: React.ReactNode;
  onSave: () => void | Promise<void>;
  onReset: () => void;
  children: React.ReactNode;
}> = ({ title, description, headerBadge, onSave, onReset, children }) => {
  const [busy, setBusy] = useState(false);
  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-white shadow-sm p-6 sm:p-8 space-y-5">
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <h4 className="text-lg sm:text-xl font-black text-slate-800 tracking-tight">
            {title}
          </h4>
          {headerBadge}
        </div>
        {description ? (
          <p className="text-xs text-slate-500 mt-1 font-medium leading-relaxed">
            {description}
          </p>
        ) : null}
      </div>
      <div className="space-y-4">{children}</div>
      <div className="flex flex-wrap gap-2 pt-4 border-t border-slate-100">
        <button
          type="button"
          onClick={async () => {
            setBusy(true);
            try {
              await Promise.resolve(onSave());
              notifySuccess("Section enregistrée.");
            } catch (e: any) {
              notifyError(e?.message || "Enregistrement impossible.");
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy}
          className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest shadow-sm disabled:opacity-50"
        >
          {busy ? "..." : "Enregistrer"}
        </button>
        <button
          type="button"
          onClick={onReset}
          className="px-5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50"
        >
          Réinitialiser
        </button>
      </div>
    </div>
  );
};

type SettingsTab =
  | "general"
  | "adminLogs"
  | "users"
  | "warehouses"
  | "permissions"
  | "nacef"
  | "hardware"
  | "zones"
  | "notes"
  | "posDiscounts"
  | "paymentInstruments"
  | "reservations"
  | "shifts";

const SETTINGS_TAB_ITEMS: {
  id: SettingsTab;
  label: string;
  description: string;
}[] = [
  {
    id: "general",
    label: "Général",
    description: "Identité du restaurant, coordonnées et préférences globales.",
  },
  {
    id: "adminLogs",
    label: "Journal admin",
    description:
      "Journal administrateur lisible (actions, utilisateur, date/heure).",
  },
  {
    id: "users",
    label: "Utilisateurs",
    description:
      "Comptes PIN, rôles, claims (accès menu) et droits de gestion de caisse.",
  },
  {
    id: "warehouses",
    label: "Dépôts",
    description:
      "Création, activation et maintenance des dépôts (stock + vente).",
  },
  {
    id: "permissions",
    label: "Caisses",
    description: "Fonds de caisse enregistrés (multi-poste / multi-devise).",
  },
  {
    id: "nacef",
    label: "NACEF",
    description: "Etat S-MDF, certificat, synchronisation et test signature.",
  },
  {
    id: "hardware",
    label: "Matériel",
    description: "Configuration et liaison des imprimantes.",
  },
  {
    id: "zones",
    label: "Zones & Tables",
    description: "Plan de salle, zones de service et tables.",
  },
  {
    id: "notes",
    label: "Notes Cuisine",
    description: "Raccourcis d'instructions pour la préparation.",
  },
  {
    id: "posDiscounts",
    label: "Remises POS",
    description:
      "Raccourcis remise sur une ligne ou sur tout le ticket (fidélité, staff, etc.).",
  },
  {
    id: "paymentInstruments",
    label: "Tickets/Cartes resto",
    description:
      "Création, recharge et consultation des moyens de paiement restaurant.",
  },
  {
    id: "reservations",
    label: "Reservations",
    description: "Historique des réservations et statut de libération.",
  },
  {
    id: "shifts",
    label: "Shifts",
    description: "Suivi des performances et soldes par shift.",
  },
];

const SETTINGS_LOG_API_BASE =
  String(
    (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env
      ?.VITE_API_URL ?? "",
  ).replace(/\/$/, "") || "";

const SettingsManager: React.FC = () => {
  const {
    currentUser,
    printers,
    addPrinter,
    updatePrinter,
    deletePrinter,
    getDetectedPrinters,
    getTerminalNodes,
    deleteTerminalNode,
    bindPrinterTerminal,
    settings,
    updateSettings,
    categories,
    zones,
    addZone,
    deleteZone,
    tables,
    addTable,
    deleteTable,
    patchTableLayout,
    patchZoneLayout,
    funds,
    getFunds,
    addFund,
    updateFund,
    deleteFund,
    getTableReservations,
    getShiftSummaries,
    allUsers,
    warehouses,
    addUser,
    deleteUser,
    updateUser,
    listWarehouses,
    createWarehouse,
    updateWarehouse,
    deleteWarehouse,
    uploadLogo,
    createRestaurantVoucher,
    getRestaurantVoucherByCode,
    listRestaurantVouchers,
    createRestaurantCard,
    getRestaurantCardByCode,
    listRestaurantCards,
    topupRestaurantCard,
    listRestaurantCardMovements,
    testExternalRestaurantCardApi,
    printProductionTest,
    printReceiptTest,
    getPdfArchives,
    downloadPdfArchiveFile,
  } = usePOS();

  const articleCategoryOptions = useMemo(() => {
    const names = (Array.isArray(categories) ? categories : [])
      .map((c: any) => String(c?.name || "").trim())
      .filter((name: string) => name.length > 0);
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, "fr"));
  }, [categories]);

  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [nacefImdf, setNacefImdf] = useState<string>(
    String((settings as any)?.nacefImdf || ""),
  );
  const [nacefManifest, setNacefManifest] = useState<any>(null);
  const [nacefBusy, setNacefBusy] = useState(false);
  const [nacefMode, setNacefMode] = useState<"ONLINE" | "OFFLINE">("ONLINE");
  const [showNacefGuide, setShowNacefGuide] = useState(true);
  const [nacefGuideStep, setNacefGuideStep] = useState(0);
  const [nacefGuideSignDone, setNacefGuideSignDone] = useState(false);
  const [nacefRuntimeMode, setNacefRuntimeMode] = useState<"SIMULATED" | "REMOTE">(
    String((settings as any)?.nacefMode || "SIMULATED").toUpperCase() === "REMOTE"
      ? "REMOTE"
      : "SIMULATED",
  );
  const [nacefRuntimeBaseUrl, setNacefRuntimeBaseUrl] = useState<string>(
    String((settings as any)?.nacefBaseUrl || "http://127.0.0.1:10006"),
  );
  const [showFormHelp, setShowFormHelp] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const tourGlowClass = (stepIndex: number) =>
    showFormHelp && tourStep === stepIndex
      ? "rounded-2xl border border-amber-300 bg-amber-50/60 shadow-[0_0_0_4px_rgba(251,191,36,0.22)]"
      : "";
  const goToTourStep = (nextStep: number) => {
    const next = Math.max(0, Math.min(2, nextStep));
    setTourStep(next);
    if (next === 0) setActiveTab("general");
    if (next === 1) setActiveTab("hardware");
    if (next === 2) setActiveTab("general");
  };

  const nacefBaseUrl = SETTINGS_LOG_API_BASE || "";

  const callNacef = async (path: string, init?: RequestInit) => {
    const response = await fetch(`${nacefBaseUrl}${path}`, {
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
      ...init,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        String(data?.message || data?.error || data?.errorCode || "Erreur NACEF"),
      );
    }
    return data;
  };

  const refreshNacefManifest = async () => {
    const imdf = String(nacefImdf || "").trim().toUpperCase();
    if (!imdf) throw new Error("IMDF requis");
    const data = await callNacef(`/pos/nacef/manifest/${encodeURIComponent(imdf)}`, {
      method: "GET",
    });
    setNacefManifest(data);
    return data;
  };

  const runNacefAction = async (fn: () => Promise<any>, okMessage: string) => {
    try {
      setNacefBusy(true);
      await fn();
      notifySuccess(okMessage);
    } catch (e: any) {
      notifyError(e?.message || "Action NACEF impossible.");
    } finally {
      setNacefBusy(false);
    }
  };

  useEffect(() => {
    setNacefImdf(String((settings as any)?.nacefImdf || ""));
  }, [(settings as any)?.nacefImdf]);

  useEffect(() => {
    setNacefRuntimeMode(
      String((settings as any)?.nacefMode || "SIMULATED").toUpperCase() === "REMOTE"
        ? "REMOTE"
        : "SIMULATED",
    );
    setNacefRuntimeBaseUrl(
      String((settings as any)?.nacefBaseUrl || "http://127.0.0.1:10006"),
    );
  }, [(settings as any)?.nacefMode, (settings as any)?.nacefBaseUrl]);

  useEffect(() => {
    setNacefGuideSignDone(false);
  }, [nacefImdf]);

  useEffect(() => {
    if (activeTab !== "nacef") return;
    const imdf = String(nacefImdf || "").trim();
    if (!imdf) return;
    void runNacefAction(() => refreshNacefManifest(), "Etat NACEF chargé.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const nacefCanSign = Boolean((nacefManifest as any)?.canSign);
  const nacefManifestLoaded = Boolean(nacefManifest);
  const nacefBlockingCode = String((nacefManifest as any)?.blockingErrorCode || "")
    .trim()
    .toUpperCase();
  const nacefBlockingMessage = String((nacefManifest as any)?.blockingMessage || "").trim();
  const nacefRecommendation = (() => {
    if (!nacefBlockingCode) return "Aucun blocage. La signature des tickets est autorisée.";
    if (nacefBlockingCode === "SMDF_CERTIFICATE_REQUEST_PENDING") {
      return "Finaliser la génération du certificat puis lancer une synchronisation.";
    }
    if (nacefBlockingCode === "SMDF_CERTFICATE_NOT_GENERATED") {
      return "Demander/générer le certificat avant toute tentative de signature.";
    }
    if (nacefBlockingCode === "SMDF_NOT_SYNCHRONIZED") {
      return "Lancer la synchronisation S-MDF pour autoriser les transactions.";
    }
    if (nacefBlockingCode === "SMDF_OFFLINE_TICKET_QUOTA_EXHAUSTED") {
      return "Quota offline épuisé: repasser online et synchroniser immédiatement.";
    }
    if (nacefBlockingCode === "SMDF_EXPIRED_CERTIFICATE") {
      return "Certificat expiré: renouveler le certificat puis synchroniser.";
    }
    if (nacefBlockingCode === "SMDF_IMDF_CAN_NOT_BE_USED") {
      return "S-MDF suspendu: lever la suspension côté administration fiscale.";
    }
    if (nacefBlockingCode === "SMDF_REVOKED_CERTIFICATE") {
      return "Certificat révoqué: régénérer un certificat valide puis synchroniser.";
    }
    return "Consulter le code de blocage et appliquer la procédure NACEF appropriée.";
  })();

  const nacefQuickAction = (() => {
    if (nacefCanSign || !nacefManifestLoaded) return null;
    if (
      nacefBlockingCode === "SMDF_NOT_SYNCHRONIZED" ||
      nacefBlockingCode === "SMDF_OFFLINE_TICKET_QUOTA_EXHAUSTED"
    ) {
      return { id: "sync", label: "Synchroniser maintenant" };
    }
    if (
      nacefBlockingCode === "SMDF_CERTIFICATE_REQUEST_PENDING" ||
      nacefBlockingCode === "SMDF_CERTFICATE_NOT_GENERATED"
    ) {
      return { id: "request-cert", label: "Demander certificat" };
    }
    if (nacefBlockingCode === "SMDF_EXPIRED_CERTIFICATE") {
      return { id: "renew-cert", label: "Renouveler certificat (simulation)" };
    }
    if (nacefBlockingCode === "SMDF_IMDF_CAN_NOT_BE_USED") {
      return { id: "reactivate", label: "Lever suspension" };
    }
    if (nacefBlockingCode === "SMDF_REVOKED_CERTIFICATE") {
      return { id: "request-cert", label: "Regénérer certificat" };
    }
    return { id: "refresh", label: "Rafraîchir état" };
  })();

  const runNacefQuickAction = async () => {
    const imdf = String(nacefImdf || "").trim().toUpperCase();
    if (!imdf) throw new Error("IMDF requis");
    if (!nacefQuickAction) return;
    if (nacefQuickAction.id === "sync") {
      await callNacef(`/pos/nacef/sync`, {
        method: "POST",
        body: JSON.stringify({ imdf, mode: nacefMode }),
      });
      await refreshNacefManifest();
      return;
    }
    if (nacefQuickAction.id === "request-cert") {
      await callNacef(`/pos/nacef/certificate/request`, {
        method: "POST",
        body: JSON.stringify({ imdf }),
      });
      await refreshNacefManifest();
      return;
    }
    if (nacefQuickAction.id === "renew-cert") {
      await callNacef(`/pos/nacef/certificate/simulate-generated`, {
        method: "POST",
        body: JSON.stringify({ imdf, expiresInDays: 365 }),
      });
      await callNacef(`/pos/nacef/sync`, {
        method: "POST",
        body: JSON.stringify({ imdf, mode: nacefMode }),
      });
      await refreshNacefManifest();
      return;
    }
    if (nacefQuickAction.id === "reactivate") {
      await callNacef(`/pos/nacef/status`, {
        method: "POST",
        body: JSON.stringify({ imdf, status: "ACTIVE" }),
      });
      await refreshNacefManifest();
      return;
    }
    await refreshNacefManifest();
  };

  const nacefGuideSteps = [
    {
      title: "1) Renseigner l'identité fiscale",
      hint: "Saisir IMDF, choisir le mode backend et l'URL S-MDF si mode REMOTE.",
      actionLabel: "Enregistrer la config",
      successMessage: "Configuration NACEF enregistrée.",
      run: async () => {
        await updateSettings({
          nacefImdf: String(nacefImdf || "").trim(),
          nacefMode: nacefRuntimeMode,
          nacefBaseUrl: String(nacefRuntimeBaseUrl || "").trim(),
        } as any);
        await refreshNacefManifest();
      },
    },
    {
      title: "2) Vérifier l'état du module",
      hint: "Lire le manifest pour connaître le statut, certificat et blocages.",
      actionLabel: "Rafraîchir l'état",
      successMessage: "Etat NACEF chargé.",
      run: async () => {
        await refreshNacefManifest();
      },
    },
    {
      title: "3) Demander un certificat",
      hint: "Nécessaire avant toute signature si aucun certificat valide n'existe.",
      actionLabel: "Demander certificat",
      successMessage: "Demande certificat envoyée.",
      run: async () => {
        const imdf = String(nacefImdf || "").trim().toUpperCase();
        if (!imdf) throw new Error("IMDF requis");
        await callNacef(`/pos/nacef/certificate/request`, {
          method: "POST",
          body: JSON.stringify({ imdf }),
        });
        await refreshNacefManifest();
      },
    },
    {
      title: "4) Synchroniser le S-MDF",
      hint: "La synchronisation est obligatoire pour autoriser la signature.",
      actionLabel: "Synchroniser",
      successMessage: "Synchronisation NACEF réussie.",
      run: async () => {
        const imdf = String(nacefImdf || "").trim().toUpperCase();
        if (!imdf) throw new Error("IMDF requis");
        await callNacef(`/pos/nacef/sync`, {
          method: "POST",
          body: JSON.stringify({ imdf, mode: nacefMode }),
        });
        await refreshNacefManifest();
      },
    },
    {
      title: "5) Tester la signature",
      hint: "Signer un ticket test pour valider le flux de bout en bout.",
      actionLabel: "Signer ticket test",
      successMessage: "Ticket test signé.",
      run: async () => {
        const imdf = String(nacefImdf || "").trim().toUpperCase();
        if (!imdf) throw new Error("IMDF requis");
        await callNacef(`/pos/nacef/sign`, {
          method: "POST",
          body: JSON.stringify({
            imdf,
            ticket: {
              id: `GUIDE-${Date.now()}`,
              operationType: "SALE",
              transactionType: "NORMAL",
              totalHt: "10.000",
              taxTotal: "1.900",
            },
          }),
        });
        setNacefGuideSignDone(true);
        await refreshNacefManifest();
      },
    },
  ] as const;
  const nacefCurrentGuide = nacefGuideSteps[Math.max(0, Math.min(nacefGuideSteps.length - 1, nacefGuideStep))];
  const normalizedImdfDraft = String(nacefImdf || "").trim().toUpperCase();
  const normalizedSavedImdf = String((settings as any)?.nacefImdf || "").trim().toUpperCase();
  const normalizedBaseUrlDraft = String(nacefRuntimeBaseUrl || "").trim();
  const normalizedSavedBaseUrl = String((settings as any)?.nacefBaseUrl || "").trim();
  const normalizedSavedRuntimeMode =
    String((settings as any)?.nacefMode || "SIMULATED").toUpperCase() === "REMOTE"
      ? "REMOTE"
      : "SIMULATED";
  const nacefGuideStepCompleted = [
    Boolean(normalizedImdfDraft) &&
      (nacefRuntimeMode !== "REMOTE" || Boolean(normalizedBaseUrlDraft)) &&
      normalizedImdfDraft === normalizedSavedImdf &&
      nacefRuntimeMode === normalizedSavedRuntimeMode &&
      normalizedBaseUrlDraft === normalizedSavedBaseUrl,
    Boolean(nacefManifestLoaded),
    ["PIN_VALIDATED", "CERTIFICATE_GENERATED"].includes(
      String((nacefManifest as any)?.certificateInfo?.certRequestStatus || "").toUpperCase(),
    ),
    String((nacefManifest as any)?.status || "").toUpperCase() === "SYNCHRONIZED",
    nacefGuideSignDone || nacefCanSign,
  ] as const;
  const nacefGuideCurrentStepDone = Boolean(nacefGuideStepCompleted[nacefGuideStep]);

  // Staff Management States
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [showAssignmentModal, setShowAssignmentModal] = useState<User | null>(
    null,
  );
  const [showEditUserModal, setShowEditUserModal] = useState<User | null>(null);
  const [newUserName, setNewUserName] = useState("");
  const [newUserRole, setNewUserRole] = useState<Role>(Role.SERVER);
  const [newUserPin, setNewUserPin] = useState("");
  const [newUserClaims, setNewUserClaims] = useState<string[]>([]);
  const [newUserWarehouseIds, setNewUserWarehouseIds] = useState<string[]>([]);
  const [newUserSalesWarehouseId, setNewUserSalesWarehouseId] = useState("");
  const [editUserName, setEditUserName] = useState("");
  const [editUserPin, setEditUserPin] = useState("");
  const [editUserRole, setEditUserRole] = useState<Role>(Role.SERVER);
  const [editUserClaims, setEditUserClaims] = useState<string[]>([]);
  const [editUserWarehouseIds, setEditUserWarehouseIds] = useState<string[]>([]);
  const [editUserSalesWarehouseId, setEditUserSalesWarehouseId] = useState("");
  const [newUserAssignedPrinterId, setNewUserAssignedPrinterId] = useState("");
  const [editUserAssignedPrinterId, setEditUserAssignedPrinterId] = useState("");
  const [editFundPermission, setEditFundPermission] = useState<
    "default" | "allow" | "deny"
  >("default");
  const [addUserModalTab, setAddUserModalTab] = useState<"info" | "claims">(
    "info",
  );
  const [editUserModalTab, setEditUserModalTab] = useState<"info" | "claims">(
    "info",
  );

  // Hardware States
  const [newPrinterName, setNewPrinterName] = useState("");
  const [editingPrinterId, setEditingPrinterId] = useState<string | null>(null);
  /** false = bon de préparation (poste libre) ; true = ticket client caisse */
  const [newPrinterIsReceipt, setNewPrinterIsReceipt] = useState(false);
  const [newPrinterStationLabel, setNewPrinterStationLabel] = useState("");
  const [newPrinterBonProfile, setNewPrinterBonProfile] = useState<
    "kitchen" | "bar"
  >("kitchen");
  const [bonProfileTouched, setBonProfileTouched] = useState(false);
  const [detectedPrinters, setDetectedPrinters] = useState<DetectedPrinter[]>(
    [],
  );
  const [selectedDetected, setSelectedDetected] = useState<string>("");
  const [terminalNodes, setTerminalNodes] = useState<TerminalNodeInfo[]>([]);
  const [terminalCloudBusy, setTerminalCloudBusy] = useState(false);
  const [bindingDrafts, setBindingDrafts] = useState<
    Record<string, { terminalNodeId: string; terminalPrinterLocalId: string }>
  >({});
  const routingRaw = String((settings as any)?.printRoutingMode || "LOCAL")
    .toUpperCase()
    .trim();
  const printRoutingMode =
    routingRaw === "CLOUD"
      ? "CLOUD"
      : routingRaw === "DESKTOP_BRIDGE"
        ? "DESKTOP_BRIDGE"
        : "LOCAL";
  const desktopBridgeCfg = ((settings as any)?.desktopPrintBridge || {}) as any;

  const guessBonProfileFromName = (name: string): "kitchen" | "bar" => {
    const n = name.toLowerCase();
    if (
      /\bbar\b/.test(n) ||
      n.includes("bar ") ||
      n.startsWith("bar") ||
      n.includes(" barman")
    )
      return "bar";
    return "kitchen";
  };
  const resetPrinterForm = () => {
    setEditingPrinterId(null);
    setNewPrinterName("");
    setNewPrinterStationLabel("");
    setSelectedDetected("");
    setBonProfileTouched(false);
    setNewPrinterBonProfile("kitchen");
    setNewPrinterIsReceipt(false);
  };
  const startEditPrinter = (printer: Printer) => {
    const isReceipt = isReceiptPrinter(printer);
    setEditingPrinterId(printer.id);
    setNewPrinterName(String(printer.name || ""));
    setNewPrinterIsReceipt(isReceipt);
    setNewPrinterStationLabel(isReceipt ? "" : String(printer.type || ""));
    setNewPrinterBonProfile(printerBonProfile(printer));
    setBonProfileTouched(true);
    setSelectedDetected("");
  };

  const refreshCloudTerminalsAndPrinters = async (
    notifyDone = false,
  ): Promise<void> => {
    const uid = String(currentUser?.id || "").trim();
    if (!uid) {
      notifyError("Utilisateur requis pour charger les terminaux.");
      return;
    }
    setTerminalCloudBusy(true);
    try {
      const res = await getTerminalNodes(uid);
      const terminals = Array.isArray(res?.terminals) ? res.terminals : [];
      setTerminalNodes(terminals);
      const fromAgents: DetectedPrinter[] = terminals.flatMap((t) =>
        (Array.isArray(t.printers) ? t.printers : []).map((lp) => ({
          Name: String(lp.name || lp.printerLocalId || ""),
          DriverName: String(lp.driverName || ""),
          PortName: String(lp.printerLocalId || lp.portName || ""),
        })),
      );
      setDetectedPrinters(fromAgents);
      setBindingDrafts((prev) => {
        const next = { ...prev };
        for (const p of printers) {
          if (!next[p.id]) {
            next[p.id] = {
              terminalNodeId: String((p as any).terminalNodeId || ""),
              terminalPrinterLocalId: String(
                (p as any).terminalPrinterLocalId || "",
              ),
            };
          }
        }
        return next;
      });
      if (notifyDone) {
        notifySuccess("Terminaux cloud rafraîchis.");
      }
    } catch (e: any) {
      notifyError(e?.message || "Impossible de rafraîchir les terminaux.");
      setTerminalNodes([]);
    } finally {
      setTerminalCloudBusy(false);
    }
  };

  useEffect(() => {
    if (activeTab !== "hardware") return;
    if (printRoutingMode !== "CLOUD") return;
    void refreshCloudTerminalsAndPrinters(false);
  }, [activeTab, currentUser?.id, printers, printRoutingMode]);

  // Zones & Tables States
  const [newZoneName, setNewZoneName] = useState("");
  const [newTableNum, setNewTableNum] = useState("");
  const [newTableZone, setNewTableZone] = useState("");
  const [newTableCap, setNewTableCap] = useState("4");
  const [posRoomDisplayMode, setPosRoomDisplayMode] =
    useState<"plan" | "simple">("plan");

  const [adminLogDays, setAdminLogDays] = useState<string[]>([]);
  const [adminLogDate, setAdminLogDate] = useState<string>("");
  const [adminLogContent, setAdminLogContent] = useState<string>("");
  const [adminLogNote, setAdminLogNote] = useState("");
  const [adminLogBusy, setAdminLogBusy] = useState(false);
  const [adminLogViewTab, setAdminLogViewTab] = useState<"simple" | "technical">(
    "simple",
  );
  const [adminLogSearch, setAdminLogSearch] = useState("");
  const [adminLogActionFilter, setAdminLogActionFilter] = useState("all");
  const [adminLogIntegrity, setAdminLogIntegrity] = useState<{
    ok: boolean;
    totalEntries: number;
    signedEntries: number;
    missingProofEntries: number;
    brokenEntries: number;
  } | null>(null);
  const [securityOperationalStatus, setSecurityOperationalStatus] = useState<{
    overall: "ok" | "warning" | "critical";
    generatedAt: number;
    checks: Array<{
      key: string;
      level: "ok" | "warning" | "critical";
      message: string;
    }>;
  } | null>(null);
  const [securityProofFile, setSecurityProofFile] = useState<File | null>(null);
  const [securityExportFile, setSecurityExportFile] = useState<File | null>(null);
  const [securityVerifyResult, setSecurityVerifyResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [securityVerifyHistory, setSecurityVerifyHistory] = useState<
    Array<{
      at: number;
      exportFileName: string;
      proofFileName: string;
      ok: boolean;
      message: string;
    }>
  >([]);
  const [securityStatusBusy, setSecurityStatusBusy] = useState(false);
  const [securityCheckFilter, setSecurityCheckFilter] = useState<
    "all" | "critical" | "warning" | "ok"
  >("all");
  const SECURITY_CHECK_FILTER_STORAGE_KEY = "pos.security.checkFilter.v1";
  const SECURITY_VERIFY_HISTORY_STORAGE_KEY = "pos.security.verifyHistory.v1";
  const [adminIntegrityReportBusy, setAdminIntegrityReportBusy] = useState(false);
  const [adminIntegrityReport, setAdminIntegrityReport] = useState<{
    ok: boolean;
    kind: string;
    totalDays: number;
    totalEntries: number;
    signedEntries: number;
    missingProofEntries: number;
    brokenEntries: number;
    days: Array<{
      dateKey: string;
      ok: boolean;
      totalEntries: number;
      signedEntries: number;
      missingProofEntries: number;
      brokenEntries: number;
    }>;
  } | null>(null);

  const adminLogEntries = useMemo(
    () => parseAdminLogJsonl(adminLogContent),
    [adminLogContent],
  );
  const securityStatusAgeMs = securityOperationalStatus
    ? Math.max(0, Date.now() - Number(securityOperationalStatus.generatedAt || 0))
    : 0;
  const securityStatusAgeMinutes = Math.floor(securityStatusAgeMs / 60000);
  const securityStatusStaleLevel: "none" | "warning" | "critical" = !securityOperationalStatus
    ? "none"
    : securityStatusAgeMinutes >= 15
      ? "critical"
      : securityStatusAgeMinutes >= 5
        ? "warning"
        : "none";
  const securityChecksSummary = useMemo(() => {
    const checks = securityOperationalStatus?.checks || [];
    const counts = checks.reduce(
      (acc, check) => {
        if (check.level === "critical") acc.critical += 1;
        else if (check.level === "warning") acc.warning += 1;
        else acc.ok += 1;
        return acc;
      },
      { critical: 0, warning: 0, ok: 0 },
    );
    const recommendation =
      counts.critical > 0
        ? "Traiter les points critiques en priorité avant exploitation."
        : counts.warning > 0
          ? "Planifier la correction des warnings pour stabiliser l'environnement."
          : "Aucune action urgente: garder la surveillance active.";
    return { ...counts, recommendation };
  }, [securityOperationalStatus]);
  const filteredSecurityChecks = useMemo(() => {
    const checks = securityOperationalStatus?.checks || [];
    if (securityCheckFilter === "all") return checks;
    return checks.filter((check) => check.level === securityCheckFilter);
  }, [securityOperationalStatus, securityCheckFilter]);

  const adminLogStructured = useMemo(() => {
    return adminLogEntries.map((entry, idx) => {
      const e = entry as Record<string, unknown>;
      const action = String(e.action ?? "autre").toLowerCase();
      const userName = String(e.userName ?? "Inconnu");
      const date = String((e.dateLocal ?? adminLogDate) || "");
      const time = String(e.timeLocal ?? "");
      const sentence = formatAdminLogEntryFriendly(entry);
      return {
        idx,
        raw: e,
        action,
        userName,
        date,
        time,
        sentence,
      };
    });
  }, [adminLogEntries, adminLogDate]);

  const adminLogFiltered = useMemo(() => {
    const q = adminLogSearch.trim().toLowerCase();
    return adminLogStructured.filter((row) => {
      if (adminLogActionFilter !== "all" && row.action !== adminLogActionFilter)
        return false;
      if (!q) return true;
      return (
        row.sentence.toLowerCase().includes(q) ||
        row.userName.toLowerCase().includes(q) ||
        JSON.stringify(row.raw).toLowerCase().includes(q)
      );
    });
  }, [adminLogStructured, adminLogSearch, adminLogActionFilter]);

  const adminLogStats = useMemo(() => {
    const stats: Record<string, number> = {
      insert: 0,
      update: 0,
      delete: 0,
      confirm: 0,
      cancel: 0,
      other: 0,
    };
    for (const row of adminLogFiltered) {
      if (row.action in stats) stats[row.action] += 1;
      else stats.other += 1;
    }
    return stats;
  }, [adminLogFiltered]);

  const exportSimpleCsv = () => {
    const rows = adminLogFiltered;
    const esc = (v: string) => `"${String(v || "").replace(/"/g, '""')}"`;
    const lines = [
      ["Date", "Heure", "Utilisateur", "Action", "Description"]
        .map(esc)
        .join(";"),
      ...rows.map((r) =>
        [r.date, r.time, r.userName, r.action, r.sentence].map(esc).join(";"),
      ),
    ];
    const csv = "\uFEFF" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `journal-admin-simple-${adminLogDate || "date"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };
  const toHex = (buffer: ArrayBuffer) =>
    Array.from(new Uint8Array(buffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  const computeSha256Hex = async (blob: Blob) => {
    if (typeof crypto === "undefined" || !crypto?.subtle?.digest) {
      throw new Error("SHA-256 indisponible sur cet environnement.");
    }
    const raw = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", raw);
    return toHex(digest);
  };
  const exportSha256Proof = async (blob: Blob, exportedFileName: string) => {
    const sha256 = await computeSha256Hex(blob);
    const proofContent = `${sha256}  ${exportedFileName}\n`;
    const proofBlob = new Blob([proofContent], { type: "text/plain;charset=utf-8" });
    downloadBlob(proofBlob, `${exportedFileName}.sha256.txt`);
  };
  const handleVerifySecuritySha256 = async () => {
    if (!securityProofFile || !securityExportFile) {
      notifyError("Sélectionnez le fichier exporté et le fichier .sha256.txt.");
      return;
    }
    try {
      const proofText = await securityProofFile.text();
      const firstLine = String(proofText)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0);
      if (!firstLine) {
        throw new Error("Fichier .sha256.txt vide.");
      }
      const match = firstLine.match(/^([a-fA-F0-9]{64})\s+(.+)$/);
      if (!match) {
        throw new Error("Format .sha256.txt invalide (attendu: <hash>  <nom_fichier>).");
      }
      const expected = String(match[1] || "").toLowerCase();
      const expectedFileName = String(match[2] || "").trim();
      const actual = (await computeSha256Hex(securityExportFile)).toLowerCase();
      const fileNameMatches = expectedFileName === securityExportFile.name;
      if (actual === expected && fileNameMatches) {
        const message = "Signature SHA-256 valide (hash + nom de fichier conformes).";
        setSecurityVerifyResult({ ok: true, message });
        setSecurityVerifyHistory((prev) =>
          [
            {
              at: Date.now(),
              exportFileName: securityExportFile.name,
              proofFileName: securityProofFile.name,
              ok: true,
              message,
            },
            ...prev,
          ].slice(0, 8),
        );
        notifySuccess(message);
        return;
      }
      const mismatchReason = !fileNameMatches
        ? `Nom attendu: ${expectedFileName}, reçu: ${securityExportFile.name}.`
        : "Le hash calculé ne correspond pas au hash attendu.";
      const message = `Signature invalide. ${mismatchReason}`;
      setSecurityVerifyResult({ ok: false, message });
      setSecurityVerifyHistory((prev) =>
        [
          {
            at: Date.now(),
            exportFileName: securityExportFile.name,
            proofFileName: securityProofFile.name,
            ok: false,
            message,
          },
          ...prev,
        ].slice(0, 8),
      );
      notifyError(message);
    } catch (e: any) {
      const message = e?.message || "Vérification SHA-256 impossible.";
      setSecurityVerifyResult({ ok: false, message });
      setSecurityVerifyHistory((prev) =>
        [
          {
            at: Date.now(),
            exportFileName: securityExportFile?.name || "(inconnu)",
            proofFileName: securityProofFile?.name || "(inconnu)",
            ok: false,
            message,
          },
          ...prev,
        ].slice(0, 8),
      );
      notifyError(message);
    }
  };

  const exportTechnicalJson = () => {
    const json = JSON.stringify(
      adminLogFiltered.map((r) => r.raw),
      null,
      2,
    );
    const blob = new Blob([json], { type: "application/json;charset=utf-8;" });
    downloadBlob(blob, `journal-admin-tech-${adminLogDate || "date"}.json`);
  };

  const exportSimplePdfNative = () => {
    const escapePdf = (input: string) =>
      input
        .replace(/\\/g, "\\\\")
        .replace(/\(/g, "\\(")
        .replace(/\)/g, "\\)");
    const lines = [
      `Journal administrateur - ${adminLogDate || "date"}`,
      `Total: ${adminLogFiltered.length} | insert: ${adminLogStats.insert} | update: ${adminLogStats.update} | delete: ${adminLogStats.delete} | confirm: ${adminLogStats.confirm} | cancel: ${adminLogStats.cancel}`,
      "",
      ...adminLogFiltered.map((r) => `${r.date} ${r.time} - ${r.sentence}`),
    ];
    const maxChars = 105;
    const wrapped: string[] = [];
    for (const line of lines) {
      if (line.length <= maxChars) {
        wrapped.push(line);
        continue;
      }
      let chunk = "";
      for (const part of line.split(" ")) {
        if (!chunk) {
          chunk = part;
          continue;
        }
        if ((chunk + " " + part).length > maxChars) {
          wrapped.push(chunk);
          chunk = part;
        } else {
          chunk += " " + part;
        }
      }
      if (chunk) wrapped.push(chunk);
    }

    const pageHeight = 842;
    const top = 800;
    const lineStep = 14;
    const linesPerPage = 52;
    const pages: string[] = [];
    for (let i = 0; i < wrapped.length; i += linesPerPage) {
      const chunk = wrapped.slice(i, i + linesPerPage);
      const textOps = ["BT", "/F1 10 Tf"];
      let y = top;
      for (const ln of chunk) {
        textOps.push(`1 0 0 1 40 ${y} Tm (${escapePdf(ln)}) Tj`);
        y -= lineStep;
      }
      textOps.push("ET");
      pages.push(textOps.join("\n"));
    }
    if (pages.length === 0) pages.push("BT /F1 10 Tf 1 0 0 1 40 800 Tm (Aucune entree) Tj ET");

    const objects: string[] = [];
    objects.push("<< /Type /Catalog /Pages 2 0 R >>");
    const kids = pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ");
    objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
    pages.forEach((content, i) => {
      const pageId = 3 + i * 2;
      const contentId = 4 + i * 2;
      objects[pageId - 1] =
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 ${pageHeight}] /Resources << /Font << /F1 ${3 + pages.length * 2} 0 R >> >> /Contents ${contentId} 0 R >>`;
      objects[contentId - 1] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
    });
    objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

    let pdf = "%PDF-1.4\n";
    const offsets: number[] = [0];
    for (let i = 0; i < objects.length; i++) {
      offsets.push(pdf.length);
      pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
    }
    const xrefPos = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += "0000000000 65535 f \n";
    for (let i = 1; i < offsets.length; i++) {
      pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
    const blob = new Blob([pdf], { type: "application/pdf" });
    downloadBlob(blob, `journal-admin-simple-${adminLogDate || "date"}.pdf`);
  };

  const exportBundleZip = () => {
    const enc = new TextEncoder();
    const simpleRows = adminLogFiltered.map((r) => ({
      date: r.date,
      time: r.time,
      user: r.userName,
      action: r.action,
      description: r.sentence,
    }));
    const csvEsc = (v: string) => `"${String(v || "").replace(/"/g, '""')}"`;
    const csv = "\uFEFF" + [
      ["Date", "Heure", "Utilisateur", "Action", "Description"]
        .map(csvEsc)
        .join(";"),
      ...simpleRows.map((r) =>
        [r.date, r.time, r.user, r.action, r.description].map(csvEsc).join(";"),
      ),
    ].join("\n");
    const technical = JSON.stringify(
      adminLogFiltered.map((r) => r.raw),
      null,
      2,
    );
    const simpleJson = JSON.stringify(simpleRows, null, 2);
    const stats = JSON.stringify(
      {
        date: adminLogDate || null,
        total: adminLogFiltered.length,
        ...adminLogStats,
        integrity: adminLogIntegrity,
      },
      null,
      2,
    );
    const files = [
      { name: "lecture-simple.json", bytes: enc.encode(simpleJson) },
      { name: "lecture-simple.csv", bytes: enc.encode(csv) },
      { name: "donnees-techniques.json", bytes: enc.encode(technical) },
      { name: "stats.json", bytes: enc.encode(stats) },
    ];

    const crcTable = (() => {
      const table = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        table[i] = c >>> 0;
      }
      return table;
    })();
    const crc32 = (buf: Uint8Array) => {
      let crc = 0xffffffff;
      for (let i = 0; i < buf.length; i++) {
        crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
      }
      return (crc ^ 0xffffffff) >>> 0;
    };
    const toU16 = (n: number) => [n & 0xff, (n >>> 8) & 0xff];
    const toU32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

    const chunks: Uint8Array[] = [];
    const central: Uint8Array[] = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name);
      const data = f.bytes;
      const crc = crc32(data);
      const localHeader = new Uint8Array([
        ...toU32(0x04034b50), ...toU16(20), ...toU16(0), ...toU16(0),
        ...toU16(0), ...toU16(0), ...toU32(crc), ...toU32(data.length), ...toU32(data.length),
        ...toU16(name.length), ...toU16(0), ...name,
      ]);
      chunks.push(localHeader, data);
      const centralHeader = new Uint8Array([
        ...toU32(0x02014b50), ...toU16(20), ...toU16(20), ...toU16(0), ...toU16(0),
        ...toU16(0), ...toU16(0), ...toU32(crc), ...toU32(data.length), ...toU32(data.length),
        ...toU16(name.length), ...toU16(0), ...toU16(0), ...toU16(0), ...toU16(0),
        ...toU32(0), ...toU32(offset), ...name,
      ]);
      central.push(centralHeader);
      offset += localHeader.length + data.length;
    }
    const centralSize = central.reduce((s, c) => s + c.length, 0);
    const end = new Uint8Array([
      ...toU32(0x06054b50), ...toU16(0), ...toU16(0),
      ...toU16(files.length), ...toU16(files.length),
      ...toU32(centralSize), ...toU32(offset), ...toU16(0),
    ]);
    const zipBlob = new Blob([...chunks, ...central, end], { type: "application/zip" });
    downloadBlob(zipBlob, `journal-admin-${adminLogDate || "date"}.zip`);
  };

  useEffect(() => {
    if (activeTab !== "adminLogs" || currentUser?.role !== Role.ADMIN) return;
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(
          `${SETTINGS_LOG_API_BASE}/pos/admin/logs?userId=${encodeURIComponent(currentUser.id)}`,
        );
        const j = (await r.json().catch(() => ({}))) as {
          days?: string[];
          error?: string;
        };
        if (!r.ok || cancelled) return;
        const days = Array.isArray(j.days) ? j.days : [];
        setAdminLogDays(days);
        setAdminLogDate((prev) =>
          prev && days.includes(prev) ? prev : days[0] || "",
        );
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, currentUser?.id, currentUser?.role]);

  useEffect(() => {
    if (
      activeTab !== "adminLogs" ||
      currentUser?.role !== Role.ADMIN ||
      !adminLogDate
    )
      return;
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(
          `${SETTINGS_LOG_API_BASE}/pos/admin/logs?userId=${encodeURIComponent(currentUser.id)}&date=${encodeURIComponent(adminLogDate)}`,
        );
        const j = (await r.json().catch(() => ({}))) as {
          content?: string;
          integrity?: {
            ok?: boolean;
            totalEntries?: number;
            signedEntries?: number;
            missingProofEntries?: number;
            brokenEntries?: number;
          };
        };
        if (!r.ok || cancelled) return;
        setAdminLogContent(typeof j.content === "string" ? j.content : "");
        setAdminLogIntegrity(
          j.integrity
            ? {
                ok: Boolean(j.integrity.ok),
                totalEntries: Number(j.integrity.totalEntries || 0),
                signedEntries: Number(j.integrity.signedEntries || 0),
                missingProofEntries: Number(j.integrity.missingProofEntries || 0),
                brokenEntries: Number(j.integrity.brokenEntries || 0),
              }
            : null,
        );
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, currentUser?.id, currentUser?.role, adminLogDate]);

  useEffect(() => {
    const dbMode = (settings as any)?.roomDisplayMode;
    if (dbMode === "plan" || dbMode === "simple") setPosRoomDisplayMode(dbMode);
    else setPosRoomDisplayMode("plan");
  }, [settings]);

  // Notes States
  const [newNote, setNewNote] = useState("");

  // Reservation History States
  const [reservationHistory, setReservationHistory] = useState<
    TableReservation[]
  >([]);
  const [reservationLoading, setReservationLoading] = useState(false);

  // Fund Management States
  const [newFundName, setNewFundName] = useState("");
  const [newFundCurrency, setNewFundCurrency] = useState("DT");
  const [newFundTerminalId, setNewFundTerminalId] = useState("");
  const [newWarehouseCode, setNewWarehouseCode] = useState("");
  const [newWarehouseName, setNewWarehouseName] = useState("");

  // Shift Summary States
  const [shiftSummaries, setShiftSummaries] = useState<ShiftSummary[]>([]);
  const [shiftFilterDate, setShiftFilterDate] = useState<string>("");
  const [shiftFilterUserId, setShiftFilterUserId] = useState<string>("");
  const [shiftFilterFromTime, setShiftFilterFromTime] = useState<string>("");
  const [shiftFilterToTime, setShiftFilterToTime] = useState<string>("");
  const [shiftLoading, setShiftLoading] = useState(false);

  // Payment Instruments (restaurant tickets/cards)
  const [voucherCode, setVoucherCode] = useState("");
  const [voucherAmount, setVoucherAmount] = useState("5");
  const [voucherLookupCode, setVoucherLookupCode] = useState("");
  const [voucherLookupResult, setVoucherLookupResult] =
    useState<RestaurantVoucher | null>(null);
  const [vouchers, setVouchers] = useState<RestaurantVoucher[]>([]);

  const [cardCode, setCardCode] = useState("");
  const [cardHolderName, setCardHolderName] = useState("");
  const [cardInitialBalance, setCardInitialBalance] = useState("0");
  const [cardLookupCode, setCardLookupCode] = useState("");
  const [cardLookupResult, setCardLookupResult] = useState<RestaurantCard | null>(
    null,
  );
  const [cardTopupAmount, setCardTopupAmount] = useState("0");
  const [cardTopupReference, setCardTopupReference] = useState("");
  const [cards, setCards] = useState<RestaurantCard[]>([]);
  const [cardMovements, setCardMovements] = useState<RestaurantCardMovement[]>([]);
  const [externalCardApiEnabled, setExternalCardApiEnabled] = useState(false);
  const [externalCardApiUrl, setExternalCardApiUrl] = useState("");
  const [externalCardApiToken, setExternalCardApiToken] = useState("");
  const [externalCardApiTimeout, setExternalCardApiTimeout] = useState("8000");
  const [externalApiTestResult, setExternalApiTestResult] = useState<{
    ok: boolean;
    status?: number;
    message?: string;
    response?: any;
  } | null>(null);
  const [pdfArchivesLoading, setPdfArchivesLoading] = useState(false);
  const [pdfArchives, setPdfArchives] = useState<{
    baseDir: string;
    categories: Array<{
      category: string;
      path: string;
      files: Array<{
        name: string;
        relativePath: string;
        size: number;
        updatedAt: number;
      }>;
    }>;
  } | null>(null);
  const ticketTemplateImportRef = useRef<HTMLInputElement | null>(null);

  const generalTabPrevRef = useRef<string | null>(null);

  const [genIdentity, setGenIdentity] = useState({
    restaurantName: "",
    logoUrl: "",
    phone: "",
    email: "",
    address: "",
  });
  const [genStation, setGenStation] = useState({
    terminalId: "",
    companyType: CompanyType.FAST_FOOD as CompanyType,
  });
  const [genCashClosing, setGenCashClosing] = useState<{
    cashClosingModePreference: "AUTO" | "INDEPENDENT" | "SHIFT_HANDOVER";
  }>({ cashClosingModePreference: "AUTO" });
  const [genPrefixes, setGenPrefixes] = useState({
    ticketPrefix: "",
    orderPrefix: "",
    invoicePrefix: "",
    clientPrefix: "",
    stockDocumentPrefix: "",
    productPrefix: "",
  });
  const [genFiscal, setGenFiscal] = useState({
    taxId: "",
    tvaRate: 0,
    tvaCatalog: [{ code: "TVA_STD", label: "TVA standard", rate: 0 }] as TvaCatalogEntry[],
    fiscalCategoryCatalog: [] as FiscalCategoryEntry[],
    timbreValue: 0,
    applyTvaToTicket: false,
    applyTvaToInvoice: false,
    applyTimbreToTicket: false,
    applyTimbreToInvoice: false,
    printPreviewOnValidate: false,
    printAutoOnPreview: true,
  });
  const [genTouch, setGenTouch] = useState({
    touchUiMode: false,
    clientKdsDisplayMode: "STANDARD" as ClientKdsModeUi,
    clientKdsWallboardMinWidthPx: 1920,
    clientTicketPrintCopies: 1,
    receiptPdfDirectory: "",
    autoDownloadReceiptPdfOnClient: false,
  });
  const [genTicket, setGenTicket] = useState<{
    clientTicketTemplate: ClientTicketTemplateUi;
    clientTicketLayout: Record<string, unknown>;
  }>({
    clientTicketTemplate: "CLASSIC",
    clientTicketLayout: {},
  });
  const [genKitchen, setGenKitchen] = useState<{
    kitchenBarPrintTemplates: Record<string, unknown>;
    paymentSoundEnabled: boolean;
  }>({
    kitchenBarPrintTemplates: {},
    paymentSoundEnabled: false,
  });
  const [designerTemplates, setDesignerTemplates] = useState<{
    clientHtml: string;
    kitchenHtml: string;
    barHtml: string;
  }>({
    clientHtml: "",
    kitchenHtml: "",
    barHtml: "",
  });
  const [printTemplateSource, setPrintTemplateSource] = useState<{
    client: "BUILTIN" | "DESIGNER";
    kitchen: "BUILTIN" | "DESIGNER";
    bar: "BUILTIN" | "DESIGNER";
  }>({ client: "BUILTIN", kitchen: "BUILTIN", bar: "BUILTIN" });
  const [designerModalKind, setDesignerModalKind] = useState<
    null | "client" | "kitchen" | "bar"
  >(null);
  const [productionEditorKind, setProductionEditorKind] = useState<
    "kitchen" | "bar"
  >("kitchen");
  const printTemplateKinds = ["client", "kitchen", "bar"] as const;
  const printTemplateKindLabels: Record<
    (typeof printTemplateKinds)[number],
    string
  > = {
    client: "Client",
    kitchen: "Cuisine",
    bar: "Bar",
  };

  const hydrateGeneralSections = () => {
    setGenIdentity({
      restaurantName: settings.restaurantName || "",
      logoUrl: settings.logoUrl || "",
      phone: settings.phone || "",
      email: settings.email || "",
      address: settings.address || "",
    });
    setGenStation({
      terminalId: settings.terminalId || "",
      companyType: (settings.companyType || CompanyType.FAST_FOOD) as CompanyType,
    });
    setGenCashClosing({
      cashClosingModePreference:
        (settings as any).cashClosingModePreference || "AUTO",
    });
    setGenPrefixes({
      ticketPrefix: settings.ticketPrefix || "",
      orderPrefix: String((settings as any).orderPrefix || ""),
      invoicePrefix: String((settings as any).invoicePrefix || ''),
      clientPrefix: String((settings as any).clientPrefix || ""),
      stockDocumentPrefix: String((settings as any).stockDocumentPrefix || ""),
      productPrefix: String((settings as any).productPrefix || ""),
    });
    setGenFiscal({
      taxId: settings.taxId ?? "",
      tvaRate: settings.tvaRate ?? 0,
      tvaCatalog: normalizeTvaCatalogFromSettings((settings as any).tvaCatalog, settings.tvaRate ?? 0),
      fiscalCategoryCatalog: normalizeFiscalCategoryCatalogFromSettings(
        (settings as any).fiscalCategoryCatalog,
      ),
      timbreValue: settings.timbreValue ?? 0,
      applyTvaToTicket: Boolean(settings.applyTvaToTicket),
      applyTvaToInvoice: Boolean(settings.applyTvaToInvoice),
      applyTimbreToTicket: Boolean(settings.applyTimbreToTicket),
      applyTimbreToInvoice: Boolean(settings.applyTimbreToInvoice),
      printPreviewOnValidate: Boolean(settings.printPreviewOnValidate),
      printAutoOnPreview: (settings as any).printAutoOnPreview !== false,
    });
    setGenTouch({
      touchUiMode: Boolean(settings.touchUiMode),
      clientKdsDisplayMode: (settings.clientKdsDisplayMode || "STANDARD") as ClientKdsModeUi,
      clientKdsWallboardMinWidthPx: settings.clientKdsWallboardMinWidthPx ?? 1920,
      clientTicketPrintCopies: Math.max(
        1,
        Math.min(10, Number(settings.clientTicketPrintCopies) || 1),
      ),
      receiptPdfDirectory: settings.receiptPdfDirectory || "",
      autoDownloadReceiptPdfOnClient: Boolean(
        settings.autoDownloadReceiptPdfOnClient,
      ),
    });
    setGenTicket({
      clientTicketTemplate: (settings.clientTicketTemplate || "CLASSIC") as ClientTicketTemplateUi,
      clientTicketLayout: JSON.parse(
        JSON.stringify(settings.clientTicketLayout || {}),
      ),
    });
    setGenKitchen({
      kitchenBarPrintTemplates: JSON.parse(
        JSON.stringify(settings.kitchenBarPrintTemplates || {}),
      ),
      paymentSoundEnabled: Boolean(settings.paymentSoundEnabled),
    });
    const designer = ((settings as any).designerPrintTemplates || {}) as any;
    setDesignerTemplates({
      clientHtml: String(designer?.clientHtml || ""),
      kitchenHtml: String(designer?.kitchenHtml || ""),
      barHtml: String(designer?.barHtml || ""),
    });
    const src = ((settings as any).printTemplateSource || {}) as any;
    setPrintTemplateSource({
      client:  (String(src?.client  || "").toUpperCase() === "DESIGNER" ? "DESIGNER" : "BUILTIN") as "BUILTIN" | "DESIGNER",
      kitchen: (String(src?.kitchen || "").toUpperCase() === "DESIGNER" ? "DESIGNER" : "BUILTIN") as "BUILTIN" | "DESIGNER",
      bar:     (String(src?.bar     || "").toUpperCase() === "DESIGNER" ? "DESIGNER" : "BUILTIN") as "BUILTIN" | "DESIGNER",
    });
  };

  useEffect(() => {
    if (activeTab !== "general") {
      generalTabPrevRef.current = activeTab;
      return;
    }
    const entered = generalTabPrevRef.current !== "general";
    generalTabPrevRef.current = "general";
    if (entered) hydrateGeneralSections();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "general") return;
    setGenIdentity((prev) => ({
      ...prev,
      logoUrl: settings.logoUrl || prev.logoUrl || "",
    }));
  }, [activeTab, settings.logoUrl]);

  const formatAmount = (value: unknown, digits = 3) =>
    Number(value ?? 0).toFixed(digits);

  const formatDateTime = (value?: number | null) => {
    if (!value) return "-";
    const date = new Date(Number(value));
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString();
  };
  const formatFileSize = (value: number) => {
    const n = Number(value || 0);
    if (n < 1024) return `${n} o`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
    return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
  };

  const refreshPdfArchives = async () => {
    setPdfArchivesLoading(true);
    try {
      const data = await getPdfArchives();
      setPdfArchives(data || null);
    } catch (e: any) {
      notifyError(e?.message || "Chargement des archives PDF impossible.");
    } finally {
      setPdfArchivesLoading(false);
    }
  };
  useEffect(() => {
    if (activeTab !== "general") return;
    refreshPdfArchives().catch(() => undefined);
  }, [activeTab]);

  const companyTypeOptions: { id: CompanyType; label: string; help: string }[] =
    [
      {
        id: CompanyType.FAST_FOOD,
        label: "Fast-food",
        help: "Dans le Point de vente : vente à emporter directe, flux caisse rapide. Le reste du menu (stock, rapports, etc.) reste disponible selon le rôle.",
      },
      {
        id: CompanyType.RESTAURANT_CAFE,
        label: "Restaurant / Café",
        help: "Seul ce mode affiche le plan de salle (sidebar et « Sur place » au POS). Livraison et à emporter restent disponibles. Même menu latéral complet pour la gestion.",
      },
      {
        id: CompanyType.SHOP_SINGLE,
        label: "Magasin (1 caisse)",
        help: "Dans le Point de vente : vente comptoir type emporter. Multi-caisses : filtrage par terminal dans les paramètres.",
      },
      {
        id: CompanyType.SHOP_MULTI,
        label: "Magasin (multi-caisses)",
        help: "Comme magasin 1 caisse au POS, avec terminal par poste (paramètres) pour commandes et caisse.",
      },
    ];

  const handleAddUser = () => {
    if (newUserName.trim() === "" || newUserPin.length !== 4) {
      notifyError("Erreur : Veuillez saisir un nom et un PIN à 4 chiffres.");
      return;
    }

    addUser({
      name: newUserName,
      role: newUserRole,
      pin: newUserPin,
      assignedZoneIds: [],
      assignedWarehouseIds: [...newUserWarehouseIds],
      salesWarehouseId: newUserSalesWarehouseId || null,
      claims: [...newUserClaims],
      assignedPrinterId: newUserAssignedPrinterId.trim() || null,
    });

    // Reset
    setNewUserName("");
    setNewUserPin("");
    setNewUserRole(Role.SERVER);
    setNewUserClaims([]);
    setNewUserWarehouseIds([]);
    setNewUserSalesWarehouseId("");
    setNewUserAssignedPrinterId("");
    setAddUserModalTab("info");
    setShowAddUserModal(false);
  };

  const toggleZoneAssignment = (user: User, zoneId: string) => {
    const current = user.assignedZoneIds || [];
    const updated = current.includes(zoneId)
      ? current.filter((id) => id !== zoneId)
      : [...current, zoneId];

    updateUser(user.id, { assignedZoneIds: updated });
    if (showAssignmentModal?.id === user.id) {
      setShowAssignmentModal({ ...user, assignedZoneIds: updated });
    }
  };

  const openEditUserModal = (user: User) => {
    setShowEditUserModal(user);
    setEditUserModalTab("info");
    setEditUserName(user.name || "");
    setEditUserPin(String(user.pin || ""));
    setEditUserRole(user.role);
    setEditUserClaims([...(user.claims || [])]);
    setEditUserWarehouseIds([...(user.assignedWarehouseIds || [])]);
    setEditUserSalesWarehouseId(String(user.salesWarehouseId || ""));
    setEditUserAssignedPrinterId(String(user.assignedPrinterId || ""));
    setEditFundPermission(
      user.canManageFund === true
        ? "allow"
        : user.canManageFund === false
          ? "deny"
          : "default",
    );
  };

  const toggleEditClaim = (claimId: string) => {
    setEditUserClaims((prev) =>
      prev.includes(claimId)
        ? prev.filter((c) => c !== claimId)
        : [...prev, claimId],
    );
  };

  const toggleNewUserClaim = (claimId: string) => {
    setNewUserClaims((prev) =>
      prev.includes(claimId)
        ? prev.filter((c) => c !== claimId)
        : [...prev, claimId],
    );
  };

  const toggleNewUserWarehouse = (warehouseId: string) => {
    setNewUserWarehouseIds((prev) => {
      const next = prev.includes(warehouseId)
        ? prev.filter((id) => id !== warehouseId)
        : [...prev, warehouseId];
      if (!next.includes(newUserSalesWarehouseId)) {
        setNewUserSalesWarehouseId("");
      }
      return next;
    });
  };

  const toggleEditUserWarehouse = (warehouseId: string) => {
    setEditUserWarehouseIds((prev) => {
      const next = prev.includes(warehouseId)
        ? prev.filter((id) => id !== warehouseId)
        : [...prev, warehouseId];
      if (!next.includes(editUserSalesWarehouseId)) {
        setEditUserSalesWarehouseId("");
      }
      return next;
    });
  };

  const handleCreateWarehouse = async () => {
    const code = newWarehouseCode.trim().toUpperCase();
    const name = newWarehouseName.trim();
    if (!code || !name) {
      notifyError("Code et nom dépôt obligatoires.");
      return;
    }
    const saved = await createWarehouse({ code, name });
    if (saved) {
      setNewWarehouseCode("");
      setNewWarehouseName("");
      notifySuccess("Dépôt créé.");
    }
  };

  const handleToggleWarehouseActive = async (warehouseId: string, isActive: boolean) => {
    const saved = await updateWarehouse(warehouseId, { isActive: !isActive });
    if (saved) notifySuccess("Dépôt mis à jour.");
  };

  const handleUpdateUser = async () => {
    if (!showEditUserModal) return;
    const name = editUserName.trim();
    const pin = editUserPin.trim();
    if (!name) {
      notifyError("Erreur : Veuillez saisir un nom.");
      return;
    }
    if (pin.length !== 4) {
      notifyError("Erreur : Le PIN doit contenir 4 chiffres.");
      return;
    }
    const canManageFund =
      editFundPermission === "default"
        ? null
        : editFundPermission === "allow";
    await updateUser(showEditUserModal.id, {
      name,
      pin,
      role: editUserRole,
      claims: [...editUserClaims],
      assignedWarehouseIds: [...editUserWarehouseIds],
      salesWarehouseId: editUserSalesWarehouseId || null,
      canManageFund,
      assignedPrinterId: editUserAssignedPrinterId.trim() || null,
    });
    setShowEditUserModal(null);
  };

  const getRoleIcon = (role: Role) => {
    switch (role) {
      case Role.ADMIN:
        return <ShieldCheck size={18} />;
      case Role.MANAGER:
        return <Layout size={18} />;
      case Role.CASHIER:
        return <Banknote size={18} />;
      case Role.BARTENDER:
        return <Banknote size={18} />;
      case Role.CHEF:
        return <ChefHat size={18} />;
      case Role.SERVER:
        return <ChefHat size={18} />;
      case Role.STOCK_MANAGER:
        return <Package size={18} />;
      default:
        return <Users size={18} />;
    }
  };

  const getRoleColor = (role: Role) => {
    switch (role) {
      case Role.ADMIN:
        return "bg-indigo-600";
      case Role.MANAGER:
        return "bg-amber-500";
      case Role.CASHIER:
        return "bg-blue-500";
      case Role.BARTENDER:
        return "bg-violet-500";
      case Role.CHEF:
        return "bg-rose-500";
      case Role.SERVER:
        return "bg-emerald-500";
      case Role.STOCK_MANAGER:
        return "bg-slate-500";
      default:
        return "bg-slate-400";
    }
  };

  const getFundPermissionLabel = (value?: boolean | null) => {
    if (value === true) return "Autorise";
    if (value === false) return "Refuse";
    return "Par role";
  };

  const isRestrictedRole = (role: Role) => {
    return ![Role.ADMIN, Role.MANAGER, Role.CASHIER, Role.STOCK_MANAGER].includes(
      role,
    );
  };

  const handleAddNote = () => {
    if (!newNote) return;
    updateSettings({ predefinedNotes: [...settings.predefinedNotes, newNote] });
    setNewNote("");
  };

  const handleRemoveNote = (note: string) => {
    updateSettings({
      predefinedNotes: settings.predefinedNotes.filter((n) => n !== note),
    });
  };

  const posDiscountList = useMemo(() => {
    if (
      Array.isArray(settings.posDiscountPresets) &&
      settings.posDiscountPresets.length > 0
    ) {
      return settings.posDiscountPresets;
    }
    return [...DEFAULT_POS_DISCOUNT_PRESETS];
  }, [settings.posDiscountPresets]);

  const updatePosPresetAt = (
    index: number,
    partial: Partial<PosDiscountPreset>,
  ) => {
    const list = posDiscountList.map((p, i) =>
      i === index ? { ...p, ...partial } : p,
    );
    updateSettings({ posDiscountPresets: list });
  };

  const addPosPreset = () => {
    updateSettings({
      posDiscountPresets: [
        ...posDiscountList,
        {
          id: `preset-${Date.now()}`,
          label: "Nouvelle remise",
          type: "PERCENT",
          value: 10,
        },
      ],
    });
  };

  const removePosPreset = (index: number) => {
    const next = posDiscountList.filter((_, i) => i !== index);
    updateSettings({ posDiscountPresets: next });
  };

  const handleLogoUpload = (file: File | null) => {
    if (!file) return;
    uploadLogo(file);
  };

  const refreshPaymentInstruments = () => {
    Promise.all([listRestaurantVouchers(), listRestaurantCards()])
      .then(([vs, cs]) => {
        setVouchers(vs || []);
        setCards(cs || []);
      })
      .catch(() => undefined);
  };

  const handleCreateVoucher = async () => {
    const code = voucherCode.trim();
    const amount = parseFloat(voucherAmount) || 0;
    if (!code || amount <= 0) {
      notifyError("Code et montant ticket resto obligatoires.");
      return;
    }
    try {
      await createRestaurantVoucher({ code, amount });
      setVoucherCode("");
      setVoucherAmount("5");
      refreshPaymentInstruments();
    } catch (e: any) {
      notifyError(e?.message || "Création ticket resto impossible.");
    }
  };

  const handleLookupVoucher = async () => {
    const code = voucherLookupCode.trim();
    if (!code) return;
    try {
      const row = await getRestaurantVoucherByCode(code);
      setVoucherLookupResult(row || null);
    } catch (e: any) {
      setVoucherLookupResult(null);
      notifyError(e?.message || "Ticket resto introuvable.");
    }
  };

  const handleCreateCard = async () => {
    const code = cardCode.trim();
    const initialBalance = parseFloat(cardInitialBalance) || 0;
    if (!code) {
      notifyError("Code carte resto obligatoire.");
      return;
    }
    try {
      await createRestaurantCard({
        code,
        holderName: cardHolderName.trim() || undefined,
        initialBalance,
      });
      setCardCode("");
      setCardHolderName("");
      setCardInitialBalance("0");
      refreshPaymentInstruments();
    } catch (e: any) {
      notifyError(e?.message || "Création carte resto impossible.");
    }
  };

  const handleLookupCard = async () => {
    const code = cardLookupCode.trim();
    if (!code) return;
    try {
      const row = await getRestaurantCardByCode(code);
      setCardLookupResult(row || null);
      const mv = await listRestaurantCardMovements(code);
      setCardMovements(mv || []);
    } catch (e: any) {
      setCardLookupResult(null);
      setCardMovements([]);
      notifyError(e?.message || "Carte resto introuvable.");
    }
  };

  const handleTopupCard = async () => {
    const code = cardLookupCode.trim();
    const amount = parseFloat(cardTopupAmount) || 0;
    if (!code || amount <= 0) {
      notifyError("Code carte et montant recharge obligatoires.");
      return;
    }
    try {
      const updated = await topupRestaurantCard(code, {
        amount,
        reference: cardTopupReference.trim() || undefined,
      });
      setCardLookupResult(updated);
      const mv = await listRestaurantCardMovements(code);
      setCardMovements(mv || []);
      setCardTopupAmount("0");
      setCardTopupReference("");
      refreshPaymentInstruments();
    } catch (e: any) {
      notifyError(e?.message || "Recharge carte impossible.");
    }
  };

  const handleSaveExternalCardApi = () => {
    updateSettings({
      externalRestaurantCardApi: {
        enabled: externalCardApiEnabled,
        url: externalCardApiUrl.trim(),
        token: externalCardApiToken.trim(),
        timeoutMs: Math.max(1000, parseInt(externalCardApiTimeout || "8000", 10) || 8000),
      },
    });
  };

  const handleTestExternalCardApi = async () => {
    try {
      const result = await testExternalRestaurantCardApi({
        enabled: externalCardApiEnabled,
        url: externalCardApiUrl.trim(),
        token: externalCardApiToken.trim(),
        timeoutMs:
          Math.max(1000, parseInt(externalCardApiTimeout || "8000", 10)) ||
          8000,
      });
      setExternalApiTestResult(result || null);
      if (result?.ok) notifySuccess("Test endpoint OK.");
      else notifyError(result?.message || "Endpoint répondu sans ok=true.");
    } catch (e: any) {
      setExternalApiTestResult({
        ok: false,
        message: e?.message || "Test endpoint échoué.",
      });
      notifyError(e?.message || "Test endpoint échoué.");
    }
  };

  const handlePrintKitchenBarTest = async (station: "KITCHEN" | "BAR") => {
    try {
      await printProductionTest({ station });
      notifySuccess(
        station === "BAR"
          ? "Bon test (style bar) envoyé."
          : "Bon test (style cuisine) envoyé.",
      );
    } catch (e: any) {
      notifyError(
        e?.message ||
          (station === "BAR"
            ? "Impression test bar impossible."
            : "Impression test cuisine impossible."),
      );
    }
  };

  const handlePrintOnePrinterTest = async (printerId: string) => {
    try {
      await printProductionTest({ printerId });
      notifySuccess("Bon de test envoyé sur cette imprimante.");
    } catch (e: any) {
      notifyError(e?.message || "Test impression impossible.");
    }
  };

  const handlePrintReceiptPrinterTest = async (printerId: string) => {
    try {
      await printReceiptTest({ printerId });
      notifySuccess("Ticket client test envoyé sur cette imprimante.");
    } catch (e: any) {
      notifyError(e?.message || "Test ticket client impossible.");
    }
  };

  const handleExportTicketTemplate = () => {
    try {
      const payload = {
        exportedAt: Date.now(),
        model: {
          clientTicketTemplate: genTicket.clientTicketTemplate || "CLASSIC",
          clientTicketPrintCopies: Math.max(
            1,
            Number(genTouch.clientTicketPrintCopies || 1),
          ),
          printPreviewOnValidate: Boolean(genFiscal.printPreviewOnValidate),
          printAutoOnPreview: Boolean(genFiscal.printAutoOnPreview),
          clientTicketLayout: {
            ...(genTicket.clientTicketLayout || {}),
          },
        },
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ticket-template-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      notifySuccess("Modèle ticket exporté.");
    } catch {
      notifyError("Export du modèle ticket impossible.");
    }
  };

  const handleImportTicketTemplate = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw);
      const source = parsed?.model || parsed || {};
      const templateRaw = String(source?.clientTicketTemplate || "CLASSIC").toUpperCase();
      const template =
        templateRaw === "COMPACT" || templateRaw === "MODERN" || templateRaw === "CLASSIC"
          ? (templateRaw as "CLASSIC" | "COMPACT" | "MODERN")
          : "CLASSIC";
      const copies = Math.max(
        1,
        Math.min(10, parseInt(String(source?.clientTicketPrintCopies || "1"), 10) || 1),
      );
      const layout = source?.clientTicketLayout || {};
      setGenTicket({
        clientTicketTemplate: template,
        clientTicketLayout: {
          headerText: String(layout?.headerText || "").slice(0, 120),
          footerText: String(layout?.footerText || "").slice(0, 200),
          showLogo: layout?.showLogo ?? true,
          showAddress: layout?.showAddress ?? true,
          showPhone: layout?.showPhone ?? true,
          showTaxId: layout?.showTaxId ?? true,
          showServer: layout?.showServer ?? true,
          showTable: layout?.showTable ?? true,
          showDate: layout?.showDate ?? true,
          showTicketNumber: layout?.showTicketNumber ?? true,
          showPriceHt: layout?.showPriceHt ?? true,
          showTicketDiscount: layout?.showTicketDiscount ?? true,
          showTimbre: layout?.showTimbre ?? true,
          showTva: layout?.showTva ?? true,
          showPriceTtc: layout?.showPriceTtc ?? true,
          showQrCode: layout?.showQrCode ?? false,
          showItemUnitPrice: layout?.showItemUnitPrice ?? true,
          showPaymentMethod: layout?.showPaymentMethod ?? true,
          showTerminal: layout?.showTerminal ?? false,
          showClientName: layout?.showClientName ?? false,
          showFiscalQrCode: layout?.showFiscalQrCode ?? false,
        },
      });
      if (source?.printPreviewOnValidate !== undefined) {
        setGenFiscal((p) => ({
          ...p,
          printPreviewOnValidate: Boolean(source?.printPreviewOnValidate),
        }));
      }
      if (source?.printAutoOnPreview !== undefined) {
        setGenFiscal((p) => ({
          ...p,
          printAutoOnPreview: Boolean(source?.printAutoOnPreview),
        }));
      }
      if (source?.clientTicketPrintCopies !== undefined) {
        setGenTouch((p) => ({
          ...p,
          clientTicketPrintCopies: copies,
        }));
      }
      notifySuccess("Modèle importé dans le brouillon — enregistrez la section Ticket client.");
    } catch {
      notifyError("Fichier invalide pour le modèle ticket.");
    } finally {
      e.target.value = "";
    }
  };

  const handleDownloadExternalTicketTemplateSample = async () => {
    try {
      const response = await fetch(
        `${SETTINGS_LOG_API_BASE}/pos/settings/client-receipt-template/sample`,
        {
          method: "GET",
          cache: "no-store",
        },
      );
      if (!response.ok) {
        throw new Error(`Téléchargement impossible (${response.status})`);
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/i);
      const fileName = match?.[1] || "client-receipt-template.sample.txt";
      downloadBlob(blob, fileName);
      notifySuccess(
        "Modèle externe téléchargé. Déposez-le dans C:\\ProgramData\\AxiaFlex\\templates\\client-receipt-template.txt",
      );
    } catch (e: any) {
      notifyError(
        e?.message || "Téléchargement du modèle externe impossible.",
      );
    }
  };

  const handleDownloadExternalClientHtmlTemplateSample = () => {
    try {
      const sample = [
        "<!doctype html>",
        "<html>",
        "  <head>",
        "    <meta charset=\"utf-8\" />",
        "    <title>Ticket Client</title>",
        "    <style>",
        "      body { font-family: Arial, sans-serif; font-size: 12px; color: #0f172a; margin: 0; padding: 10px; }",
        "      .card { border: 1px solid #dbe2ea; border-radius: 14px; padding: 12px; }",
        "      .center { text-align: center; }",
        "      .logo { width: 38px; height: 38px; border-radius: 999px; object-fit: cover; margin: 0 auto 6px; display: block; }",
        "      .name { font-size: 22px; font-weight: 800; letter-spacing: .3px; margin: 2px 0; }",
        "      .meta { font-size: 12px; color: #475569; margin: 2px 0; }",
        "      .divider { border: none; border-top: 1px dashed #cbd5e1; margin: 10px 0; }",
        "      .row { display: flex; justify-content: space-between; gap: 10px; margin: 4px 0; }",
        "      .line-label { font-weight: 700; }",
        "      .line-value { font-weight: 700; white-space: nowrap; }",
        "      .totals .row { margin: 2px 0; }",
        "      .total { font-size: 16px; font-weight: 900; color: #1d4ed8; }",
        "      .muted { color: #64748b; }",
        "      .footer { margin-top: 10px; text-align: center; font-weight: 700; color: #475569; }",
        "      .items pre { margin: 0; white-space: pre-wrap; font-family: Arial, sans-serif; }",
        "    </style>",
        "  </head>",
        "  <body>",
        "    <div class=\"card\">",
        "      <div class=\"center\">",
        "        <img class=\"logo\" src=\"https://dummyimage.com/64x64/ef4444/ffffff&text=F1\" alt=\"logo\"/>",
        "        <div class=\"name\">{{restaurantName}}</div>",
        "        <div class=\"meta\">{{createdAt}}</div>",
        "        <div class=\"meta\">Ticket: {{ticketCode}}</div>",
        "        <div class=\"meta\">{{address}}</div>",
        "        <div class=\"meta\">Tel: {{phone}}</div>",
        "        <div class=\"meta\">MF: {{taxId}}</div>",
        "        <div class=\"meta\">Serveur: {{serverName}}</div>",
        "        <div class=\"meta\">Table: {{tableNumber}}</div>",
        "        <div class=\"meta\">Paiement: {{amount}} {{currency}}</div>",
        "      </div>",
        "      <hr class=\"divider\"/>",
        "      <div class=\"items\"><pre>{{itemsLines}}</pre></div>",
        "      <hr class=\"divider\"/>",
        "      <div class=\"totals\">",
        "        <div class=\"row\"><span class=\"line-label\">Prix HT</span><span class=\"line-value\">{{subtotal}} {{currency}}</span></div>",
        "        <div class=\"row\"><span class=\"line-label\" style=\"color:#f97316\">Remise ticket</span><span class=\"line-value\" style=\"color:#f97316\">-{{discount}} {{currency}}</span></div>",
        "        <div class=\"row\"><span class=\"line-label\">Timbre</span><span class=\"line-value\">{{timbre}} {{currency}}</span></div>",
        "        <div class=\"row total\"><span>Prix TTC</span><span>{{total}} {{currency}}</span></div>",
        "      </div>",
        "      <div class=\"footer\">{{footerText}}</div>",
        "    </div>",
        "  </body>",
        "</html>",
        "",
      ].join("\n");
      const blob = new Blob([sample], { type: "text/html;charset=utf-8;" });
      downloadBlob(blob, "client-receipt-template.html");
      notifySuccess(
        "Template HTML client téléchargé. Déposez-le dans C:\\ProgramData\\AxiaFlex\\templates\\client-receipt-template.html",
      );
    } catch {
      notifyError("Téléchargement du template HTML client impossible.");
    }
  };

  const handleDownloadNacefHtmlTemplateSample = async () => {
    try {
      const response = await fetch(
        `${SETTINGS_LOG_API_BASE}/pos/settings/client-receipt-template/nacef-html`,
        {
          method: "GET",
          cache: "no-store",
        },
      );
      if (!response.ok) {
        throw new Error(`Téléchargement impossible (${response.status})`);
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/i);
      const fileName = match?.[1] || "client-nacef-template.sample.html";
      downloadBlob(blob, fileName);
      notifySuccess("Template HTML NACEF téléchargé.");
    } catch (e: any) {
      notifyError(
        e?.message || "Téléchargement du template HTML NACEF impossible.",
      );
    }
  };

  const handleDownloadExternalKitchenTemplateSample = () => {
    try {
      const sample = [
        "{{title}}",
        "Commande #{{orderRef}}",
        "Type: {{orderType}}",
        "Table: {{tableNumber}}",
        "Serveur: {{serverName}}",
        "Heure: {{createdAt}}",
        "------------------------------",
        "{{itemsLines}}",
        "{{footerText}}",
        "",
      ].join("\n");
      const blob = new Blob([sample], { type: "text/plain;charset=utf-8;" });
      downloadBlob(blob, "kitchen-ticket-template.sample.txt");
      notifySuccess(
        "Modèle cuisine téléchargé. Déposez-le dans C:\\ProgramData\\AxiaFlex\\templates\\kitchen-ticket-template.txt",
      );
    } catch {
      notifyError("Téléchargement du modèle cuisine impossible.");
    }
  };

  const handleDownloadExternalKitchenHtmlTemplateSample = () => {
    try {
      const sample = [
        "<!doctype html>",
        "<html>",
        "  <head>",
        "    <meta charset=\"utf-8\" />",
        "    <style>",
        "      body { font-family: Arial, sans-serif; font-size: 12px; margin: 0; padding: 10px; color: #111827; }",
        "      .card { border: 1px solid #d1d5db; border-radius: 10px; padding: 10px; }",
        "      .title { text-align:center; font-size: 16px; font-weight: 900; margin-bottom: 6px; }",
        "      .meta { font-size: 12px; color: #374151; margin: 2px 0; }",
        "      .divider { border: none; border-top: 1px dashed #cbd5e1; margin: 8px 0; }",
        "      pre { margin: 0; white-space: pre-wrap; font-family: Arial, sans-serif; font-weight: 700; }",
        "      .foot { margin-top: 8px; font-size: 11px; color: #475569; }",
        "    </style>",
        "  </head>",
        "  <body>",
        "    <div class=\"card\">",
        "      <div class=\"title\">{{title}}</div>",
        "      <div class=\"meta\">Commande #{{orderRef}}</div>",
        "      <div class=\"meta\">Type: {{orderType}}</div>",
        "      <div class=\"meta\">Table: {{tableNumber}}</div>",
        "      <div class=\"meta\">Serveur: {{serverName}}</div>",
        "      <div class=\"meta\">Heure: {{createdAt}}</div>",
        "      <hr class=\"divider\"/>",
        "      <pre>{{itemsLines}}</pre>",
        "      <hr class=\"divider\"/>",
        "      <div class=\"foot\">{{footerText}}</div>",
        "    </div>",
        "  </body>",
        "</html>",
        "",
      ].join("\n");
      const blob = new Blob([sample], { type: "text/html;charset=utf-8;" });
      downloadBlob(blob, "kitchen-ticket-template.html");
      notifySuccess(
        "Template HTML cuisine téléchargé. Déposez-le dans C:\\ProgramData\\AxiaFlex\\templates\\kitchen-ticket-template.html",
      );
    } catch {
      notifyError("Téléchargement du template HTML cuisine impossible.");
    }
  };

  const handleDownloadExternalBarTemplateSample = () => {
    try {
      const sample = [
        "{{title}}",
        "Commande #{{orderRef}}",
        "Type: {{orderType}}",
        "Table: {{tableNumber}}",
        "Serveur: {{serverName}}",
        "Heure: {{createdAt}}",
        "------------------------------",
        "{{itemsLines}}",
        "{{footerText}}",
        "",
      ].join("\n");
      const blob = new Blob([sample], { type: "text/plain;charset=utf-8;" });
      downloadBlob(blob, "bar-ticket-template.sample.txt");
      notifySuccess(
        "Modèle bar téléchargé. Déposez-le dans C:\\ProgramData\\AxiaFlex\\templates\\bar-ticket-template.txt",
      );
    } catch {
      notifyError("Téléchargement du modèle bar impossible.");
    }
  };

  const handleDownloadExternalBarHtmlTemplateSample = () => {
    try {
      const sample = [
        "<!doctype html>",
        "<html>",
        "  <head>",
        "    <meta charset=\"utf-8\" />",
        "    <style>",
        "      body { font-family: Arial, sans-serif; font-size: 12px; margin: 0; padding: 10px; color: #111827; }",
        "      .card { border: 1px solid #d1d5db; border-radius: 10px; padding: 10px; }",
        "      .title { text-align:center; font-size: 16px; font-weight: 900; margin-bottom: 6px; }",
        "      .meta { font-size: 12px; color: #374151; margin: 2px 0; }",
        "      .divider { border: none; border-top: 1px dashed #cbd5e1; margin: 8px 0; }",
        "      pre { margin: 0; white-space: pre-wrap; font-family: Arial, sans-serif; font-weight: 700; }",
        "      .foot { margin-top: 8px; font-size: 11px; color: #475569; }",
        "    </style>",
        "  </head>",
        "  <body>",
        "    <div class=\"card\">",
        "      <div class=\"title\">{{title}}</div>",
        "      <div class=\"meta\">Commande #{{orderRef}}</div>",
        "      <div class=\"meta\">Type: {{orderType}}</div>",
        "      <div class=\"meta\">Table: {{tableNumber}}</div>",
        "      <div class=\"meta\">Serveur: {{serverName}}</div>",
        "      <div class=\"meta\">Heure: {{createdAt}}</div>",
        "      <hr class=\"divider\"/>",
        "      <pre>{{itemsLines}}</pre>",
        "      <hr class=\"divider\"/>",
        "      <div class=\"foot\">{{footerText}}</div>",
        "    </div>",
        "  </body>",
        "</html>",
        "",
      ].join("\n");
      const blob = new Blob([sample], { type: "text/html;charset=utf-8;" });
      downloadBlob(blob, "bar-ticket-template.html");
      notifySuccess(
        "Template HTML bar téléchargé. Déposez-le dans C:\\ProgramData\\AxiaFlex\\templates\\bar-ticket-template.html",
      );
    } catch {
      notifyError("Téléchargement du template HTML bar impossible.");
    }
  };
  const handleTemplatePreviewOrDownload = async (
    kind: "client" | "kitchen" | "bar",
    format: "html" | "pdf",
    mode: "preview" | "download",
  ) => {
    try {
      const response = await fetch(
        `${SETTINGS_LOG_API_BASE}/pos/settings/print-template/preview?kind=${encodeURIComponent(kind)}&format=${encodeURIComponent(format)}`,
        {
          method: "GET",
          cache: "no-store",
        },
      );
      if (!response.ok) {
        throw new Error(`Impossible de générer le fichier (${response.status})`);
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/i);
      const fileName =
        match?.[1] || `${kind}-template-preview.${format === "pdf" ? "pdf" : "html"}`;
      if (mode === "download") {
        downloadBlob(blob, fileName);
        notifySuccess(`Template ${kind} ${format.toUpperCase()} téléchargé.`);
        return;
      }
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e: any) {
      notifyError(
        e?.message || "Aperçu/téléchargement du template impossible.",
      );
    }
  };
  const handleTestDesktopBridge = async () => {
    try {
      const res = await fetch(
        `${SETTINGS_LOG_API_BASE}/pos/settings/desktop-bridge/test`,
        {
          method: "GET",
          cache: "no-store",
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String((json as any)?.error || `Erreur ${res.status}`));
      }
      notifySuccess("Desktop Bridge connecté et prêt.");
    } catch (e: any) {
      notifyError(e?.message || "Desktop Bridge indisponible.");
    }
  };
  const handleLoadSecurityStatus = async (options?: { silent?: boolean }) => {
    try {
      setSecurityStatusBusy(true);
      const userId = String(currentUser?.id || "").trim();
      if (!userId) throw new Error("Utilisateur admin requis.");
      const res = await fetch(
        `${SETTINGS_LOG_API_BASE}/pos/settings/security-status?userId=${encodeURIComponent(userId)}`,
        {
          method: "GET",
          cache: "no-store",
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String((json as any)?.error || `Erreur ${res.status}`));
      }
      setSecurityOperationalStatus({
        overall:
          String((json as any)?.overall || "").toLowerCase() === "critical"
            ? "critical"
            : String((json as any)?.overall || "").toLowerCase() === "warning"
              ? "warning"
              : "ok",
        generatedAt: Number((json as any)?.generatedAt || Date.now()),
        checks: Array.isArray((json as any)?.checks)
          ? (json as any).checks.map((c: any) => ({
              key: String(c?.key || ""),
              level:
                String(c?.level || "").toLowerCase() === "critical"
                  ? "critical"
                  : String(c?.level || "").toLowerCase() === "warning"
                    ? "warning"
                    : "ok",
              message: String(c?.message || ""),
            }))
          : [],
      });
      if (!options?.silent) notifySuccess("Statut sécurité chargé.");
    } catch (e: any) {
      if (!options?.silent) {
        notifyError(e?.message || "Impossible de charger le statut sécurité.");
      }
    } finally {
      setSecurityStatusBusy(false);
    }
  };
  const handleExportSecurityStatus = async () => {
    if (!securityOperationalStatus) {
      notifyError("Aucun statut sécurité à exporter.");
      return;
    }
    try {
      const blob = new Blob(
        [
          JSON.stringify(
            {
              exportedAt: Date.now(),
              source: "settings-security-status",
              ...securityOperationalStatus,
            },
            null,
            2,
          ),
        ],
        { type: "application/json;charset=utf-8" },
      );
      const dateKey = new Date().toISOString().slice(0, 10);
      const filename = `security-status-${dateKey}.json`;
      downloadBlob(blob, filename);
      await exportSha256Proof(blob, filename);
      notifySuccess("Rapport sécurité JSON + signature SHA-256 exportés.");
    } catch {
      notifyError("Export du rapport sécurité impossible.");
    }
  };
  const handleExportSecurityStatusPdf = async () => {
    if (!securityOperationalStatus) {
      notifyError("Aucun statut sécurité à exporter.");
      return;
    }
    try {
      const escapePdf = (input: string) =>
        input
          .replace(/\\/g, "\\\\")
          .replace(/\(/g, "\\(")
          .replace(/\)/g, "\\)");
      const generatedAt = new Date(securityOperationalStatus.generatedAt).toLocaleString();
      const lines = [
        "Rapport sécurité opérationnel",
        `Exporté le: ${new Date().toLocaleString()}`,
        `Statut global: ${securityOperationalStatus.overall}`,
        `Généré le: ${generatedAt}`,
        "",
        "Checks:",
        ...securityOperationalStatus.checks.map(
          (check, idx) => `${idx + 1}. [${check.level}] ${check.key} - ${check.message}`,
        ),
      ];
      const maxChars = 100;
      const wrapped: string[] = [];
      for (const line of lines) {
        if (line.length <= maxChars) {
          wrapped.push(line);
          continue;
        }
        let chunk = "";
        for (const part of line.split(" ")) {
          if (!chunk) {
            chunk = part;
            continue;
          }
          if ((chunk + " " + part).length > maxChars) {
            wrapped.push(chunk);
            chunk = part;
          } else {
            chunk += " " + part;
          }
        }
        if (chunk) wrapped.push(chunk);
      }
      const pageHeight = 842;
      const top = 800;
      const lineStep = 14;
      const linesPerPage = 52;
      const pages: string[] = [];
      for (let i = 0; i < wrapped.length; i += linesPerPage) {
        const chunk = wrapped.slice(i, i + linesPerPage);
        const textOps = ["BT", "/F1 10 Tf"];
        let y = top;
        for (const ln of chunk) {
          textOps.push(`1 0 0 1 40 ${y} Tm (${escapePdf(ln)}) Tj`);
          y -= lineStep;
        }
        textOps.push("ET");
        pages.push(textOps.join("\n"));
      }
      if (pages.length === 0) pages.push("BT /F1 10 Tf 1 0 0 1 40 800 Tm (Aucune donnée) Tj ET");
      const objects: string[] = [];
      objects.push("<< /Type /Catalog /Pages 2 0 R >>");
      const kids = pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ");
      objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
      pages.forEach((content, i) => {
        const pageId = 3 + i * 2;
        const contentId = 4 + i * 2;
        objects[pageId - 1] =
          `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 ${pageHeight}] /Resources << /Font << /F1 ${3 + pages.length * 2} 0 R >> >> /Contents ${contentId} 0 R >>`;
        objects[contentId - 1] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
      });
      objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
      let pdf = "%PDF-1.4\n";
      const offsets: number[] = [0];
      for (let i = 0; i < objects.length; i++) {
        offsets.push(pdf.length);
        pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
      }
      const xrefPos = pdf.length;
      pdf += `xref\n0 ${objects.length + 1}\n`;
      pdf += "0000000000 65535 f \n";
      for (let i = 1; i < offsets.length; i++) {
        pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
      }
      pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
      const blob = new Blob([pdf], { type: "application/pdf" });
      const dateKey = new Date().toISOString().slice(0, 10);
      const filename = `security-status-${dateKey}.pdf`;
      downloadBlob(blob, filename);
      await exportSha256Proof(blob, filename);
      notifySuccess("Rapport sécurité PDF + signature SHA-256 exportés.");
    } catch {
      notifyError("Export PDF du rapport sécurité impossible.");
    }
  };
  const handleCopySecurityDiagnostic = async () => {
    if (!securityOperationalStatus) {
      notifyError("Aucun statut sécurité chargé.");
      return;
    }
    try {
      const diagnostic = {
        copiedAt: Date.now(),
        scope: "settings-security-operational-status",
        freshness: {
          ageMs: securityStatusAgeMs,
          ageMinutes: securityStatusAgeMinutes,
          staleLevel: securityStatusStaleLevel,
        },
        status: securityOperationalStatus,
      };
      await navigator.clipboard.writeText(JSON.stringify(diagnostic, null, 2));
      notifySuccess("Diagnostic sécurité copié.");
    } catch {
      notifyError("Copie du diagnostic sécurité impossible.");
    }
  };
  const handleCopyCriticalSecurityChecks = async () => {
    if (!securityOperationalStatus) {
      notifyError("Aucun statut sécurité chargé.");
      return;
    }
    try {
      const criticalChecks = (securityOperationalStatus.checks || []).filter(
        (check) => check.level === "critical",
      );
      if (criticalChecks.length === 0) {
        notifySuccess("Aucun check critique à copier.");
        return;
      }
      const payload = {
        copiedAt: Date.now(),
        scope: "settings-security-critical-checks",
        totalCritical: criticalChecks.length,
        checks: criticalChecks,
      };
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      notifySuccess("Checks critiques copiés.");
    } catch {
      notifyError("Copie des checks critiques impossible.");
    }
  };
  const handleDownloadCriticalSecurityChecks = async () => {
    if (!securityOperationalStatus) {
      notifyError("Aucun statut sécurité chargé.");
      return;
    }
    try {
      const criticalChecks = (securityOperationalStatus.checks || []).filter(
        (check) => check.level === "critical",
      );
      if (criticalChecks.length === 0) {
        notifySuccess("Aucun check critique à exporter.");
        return;
      }
      const payload = {
        exportedAt: Date.now(),
        scope: "settings-security-critical-checks",
        totalCritical: criticalChecks.length,
        checks: criticalChecks,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const dateKey = new Date().toISOString().slice(0, 10);
      const fileName = `security-critical-checks-${dateKey}.json`;
      downloadBlob(blob, fileName);
      await exportSha256Proof(blob, fileName);
      notifySuccess("Checks critiques + signature SHA-256 téléchargés.");
    } catch {
      notifyError("Export des checks critiques impossible.");
    }
  };
  const handleDownloadSecurityDiagnostic = async () => {
    if (!securityOperationalStatus) {
      notifyError("Aucun statut sécurité chargé.");
      return;
    }
    try {
      const diagnostic = {
        exportedAt: Date.now(),
        scope: "settings-security-operational-status",
        freshness: {
          ageMs: securityStatusAgeMs,
          ageMinutes: securityStatusAgeMinutes,
          staleLevel: securityStatusStaleLevel,
        },
        status: securityOperationalStatus,
      };
      const blob = new Blob([JSON.stringify(diagnostic, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const dateKey = new Date().toISOString().slice(0, 10);
      const fileName = `security-diagnostic-${dateKey}.json`;
      downloadBlob(blob, fileName);
      await exportSha256Proof(blob, fileName);
      notifySuccess("Diagnostic sécurité + signature SHA-256 téléchargés.");
    } catch {
      notifyError("Téléchargement du diagnostic sécurité impossible.");
    }
  };

  const refreshReservations = () => {
    setReservationLoading(true);
    return getTableReservations()
      .then((data) => {
        setReservationHistory(data || []);
      })
      .finally(() => {
        setReservationLoading(false);
      });
  };

  const refreshShifts = () => {
    setShiftLoading(true);
    return getShiftSummaries()
      .then((data) => {
        setShiftSummaries(data || []);
      })
      .finally(() => {
        setShiftLoading(false);
      });
  };

  useEffect(() => {
    if (activeTab !== "reservations") return;
    refreshReservations();
  }, [activeTab, getTableReservations]);

  useEffect(() => {
    if (activeTab !== "shifts") return;
    refreshShifts();
  }, [activeTab, getShiftSummaries]);

  useEffect(() => {
    if (activeTab !== "permissions") return;
    getFunds().catch(() => undefined);
  }, [activeTab, getFunds]);

  useEffect(() => {
    if (activeTab !== "warehouses" && activeTab !== "users") return;
    listWarehouses().catch(() => undefined);
  }, [activeTab, listWarehouses]);

  useEffect(() => {
    if (activeTab !== "paymentInstruments") return;
    refreshPaymentInstruments();
  }, [activeTab]);
  useEffect(() => {
    try {
      const storedFilter = String(
        window.localStorage.getItem(SECURITY_CHECK_FILTER_STORAGE_KEY) || "",
      ).toLowerCase();
      if (
        storedFilter === "all" ||
        storedFilter === "critical" ||
        storedFilter === "warning" ||
        storedFilter === "ok"
      ) {
        setSecurityCheckFilter(storedFilter);
      }
      const historyRaw = window.localStorage.getItem(
        SECURITY_VERIFY_HISTORY_STORAGE_KEY,
      );
      if (historyRaw) {
        const parsed = JSON.parse(historyRaw);
        if (Array.isArray(parsed)) {
          const cleaned = parsed
            .map((row: any) => ({
              at: Number(row?.at || 0),
              exportFileName: String(row?.exportFileName || ""),
              proofFileName: String(row?.proofFileName || ""),
              ok: Boolean(row?.ok),
              message: String(row?.message || ""),
            }))
            .filter((row) => row.at > 0)
            .slice(0, 8);
          setSecurityVerifyHistory(cleaned);
        }
      }
    } catch {
      // no-op: corrupted local storage should not break settings screen
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(
        SECURITY_CHECK_FILTER_STORAGE_KEY,
        securityCheckFilter,
      );
    } catch {
      // no-op
    }
  }, [securityCheckFilter]);
  useEffect(() => {
    try {
      window.localStorage.setItem(
        SECURITY_VERIFY_HISTORY_STORAGE_KEY,
        JSON.stringify(securityVerifyHistory.slice(0, 8)),
      );
    } catch {
      // no-op
    }
  }, [securityVerifyHistory]);
  useEffect(() => {
    if (activeTab !== "hardware") return;
    handleLoadSecurityStatus({ silent: true }).catch(() => undefined);
    const intervalId = window.setInterval(() => {
      handleLoadSecurityStatus({ silent: true }).catch(() => undefined);
    }, 120000);
    return () => window.clearInterval(intervalId);
  }, [activeTab, currentUser?.id]);

  useEffect(() => {
    const ext = settings.externalRestaurantCardApi;
    setExternalCardApiEnabled(Boolean(ext?.enabled));
    setExternalCardApiUrl(String(ext?.url || ""));
    setExternalCardApiToken(String(ext?.token || ""));
    setExternalCardApiTimeout(String(ext?.timeoutMs || 8000));
  }, [settings.externalRestaurantCardApi]);

  const resolvedLogoUrl = genIdentity.logoUrl || "";
  const ticketLayout = useMemo(() => {
    const L = genTicket.clientTicketLayout || {};
    return {
      headerText: String(L.headerText || ""),
      footerText: String(L.footerText || ""),
      showLogo: Boolean(L.showLogo ?? true),
      showAddress: Boolean(L.showAddress ?? true),
      showPhone: Boolean(L.showPhone ?? true),
      showTaxId: Boolean(L.showTaxId ?? true),
      showServer: Boolean(L.showServer ?? true),
      showTable: Boolean(L.showTable ?? true),
      showDate: Boolean(L.showDate ?? true),
      showTicketNumber: Boolean(L.showTicketNumber ?? true),
      showPriceHt: Boolean(L.showPriceHt ?? true),
      showTicketDiscount: Boolean(L.showTicketDiscount ?? true),
      showTimbre: Boolean(L.showTimbre ?? true),
      showTva: Boolean(L.showTva ?? true),
      showPriceTtc: Boolean(L.showPriceTtc ?? true),
      showQrCode: Boolean(L.showQrCode ?? false),
      showItemUnitPrice: Boolean(L.showItemUnitPrice ?? true),
      showPaymentMethod: Boolean(L.showPaymentMethod ?? true),
      showTerminal: Boolean(L.showTerminal ?? false),
      showClientName: Boolean(L.showClientName ?? false),
      showFiscalQrCode: Boolean(L.showFiscalQrCode ?? false),
    };
  }, [genTicket.clientTicketLayout]);
  const isNacefTicketTemplateLocked = Boolean((settings as any)?.nacefEnabled);
  const previewShellClass = useMemo(() => {
    switch (genTicket.clientTicketTemplate) {
      case "COMPACT":
        return "w-full max-w-[280px] bg-white p-4 rounded-2xl border border-slate-200";
      case "MODERN":
        return "w-full max-w-[320px] bg-gradient-to-b from-white to-slate-50 p-6 rounded-[1.5rem] border border-slate-200";
      case "CLASSIC":
      default:
        return "w-full max-w-[300px] bg-white p-6 rounded-3xl border border-slate-200";
    }
  }, [genTicket.clientTicketTemplate]);
  const previewItems = useMemo(
    () => [
      { id: "pv-1", name: "Pizza Margherita", quantity: 1, price: 18.5 },
      { id: "pv-2", name: "Coca Cola", quantity: 2, price: 3.5 },
    ],
    [],
  );
  const previewSubtotal = useMemo(
    () =>
      previewItems.reduce(
        (sum, row) => sum + Number(row.quantity || 0) * Number(row.price || 0),
        0,
      ),
    [previewItems],
  );
  const previewDiscount = 1.5;
  const previewHt = Math.max(0, previewSubtotal - previewDiscount);
  const previewTva = previewHt * 0.19;
  const previewTimbre = 1;
  const previewTtc = previewHt + previewTva + previewTimbre;
  const kitchenTpl = useMemo(() => {
    const k = (genKitchen.kitchenBarPrintTemplates as any)?.kitchen || {};
    return {
      title: k.title || "BON CUISINE",
      footerText: k.footerText || "",
      showOrderRef: k.showOrderRef ?? true,
      showTime: k.showTime ?? true,
      showTable: k.showTable ?? true,
      showServer: k.showServer ?? true,
      showItemQty: k.showItemQty ?? true,
      showItemNotes: k.showItemNotes ?? true,
    };
  }, [genKitchen.kitchenBarPrintTemplates]);
  const barTpl = useMemo(() => {
    const b = (genKitchen.kitchenBarPrintTemplates as any)?.bar || {};
    return {
      title: b.title || "BON BAR",
      footerText: b.footerText || "",
      showOrderRef: b.showOrderRef ?? true,
      showTime: b.showTime ?? true,
      showTable: b.showTable ?? true,
      showServer: b.showServer ?? true,
      showItemQty: b.showItemQty ?? true,
      showItemNotes: b.showItemNotes ?? true,
    };
  }, [genKitchen.kitchenBarPrintTemplates]);
  const printDiagnosticSnapshot = useMemo(
    () =>
      JSON.stringify(
        {
          routing: {
            printRoutingMode: (settings as any)?.printRoutingMode || "LOCAL",
            desktopPrintBridgeEnabled: Boolean(
              (settings as any)?.desktopPrintBridge?.enabled,
            ),
          },
          sources: {
            saved: (settings as any)?.printTemplateSource || {},
            draft: printTemplateSource,
          },
          client: {
            template: settings.clientTicketTemplate || "CLASSIC",
            layout: settings.clientTicketLayout || {},
          },
          production: {
            templates: settings.kitchenBarPrintTemplates || {},
          },
          designer: {
            clientHtmlLength: String((settings as any)?.designerPrintTemplates?.clientHtml || "")
              .trim()
              .length,
            kitchenHtmlLength: String((settings as any)?.designerPrintTemplates?.kitchenHtml || "")
              .trim()
              .length,
            barHtmlLength: String((settings as any)?.designerPrintTemplates?.barHtml || "")
              .trim()
              .length,
          },
        },
        null,
        2,
      ),
    [printTemplateSource, settings],
  );
  const activeProductionTpl =
    productionEditorKind === "kitchen" ? kitchenTpl : barTpl;
  const updateProductionTemplate = (
    kind: "kitchen" | "bar",
    patch: Record<string, unknown>,
  ) => {
    setGenKitchen((g) => ({
      ...g,
      kitchenBarPrintTemplates: {
        ...(g.kitchenBarPrintTemplates as object),
        [kind]: {
          ...((g.kitchenBarPrintTemplates as any)?.[kind] || {}),
          ...patch,
        },
      },
    }));
  };
  const duplicateProductionTemplate = (
    from: "kitchen" | "bar",
    to: "kitchen" | "bar",
  ) => {
    const source =
      from === "kitchen"
        ? (genKitchen.kitchenBarPrintTemplates as any)?.kitchen || {}
        : (genKitchen.kitchenBarPrintTemplates as any)?.bar || {};
    updateProductionTemplate(to, {
      title: source.title,
      footerText: source.footerText,
      showOrderRef: source.showOrderRef,
      showTime: source.showTime,
      showTable: source.showTable,
      showServer: source.showServer,
      showItemQty: source.showItemQty,
      showItemNotes: source.showItemNotes,
    });
  };

  const activeTabMeta =
    SETTINGS_TAB_ITEMS.find((tab) => tab.id === activeTab) ||
    SETTINGS_TAB_ITEMS[0];

  return (
    <div className="flex flex-col h-full gap-4 sm:gap-8">
      <div
        className={`flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm shrink-0 w-max overflow-x-auto max-w-full scrollbar-hide transition ${tourGlowClass(0)}`}
      >
        {SETTINGS_TAB_ITEMS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 sm:px-6 py-2.5 rounded-xl text-[11px] sm:text-xs font-black transition-all whitespace-nowrap min-h-11 ${activeTab === tab.id ? "bg-indigo-600 text-white shadow-lg" : "text-slate-500 hover:bg-slate-50"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        className={`bg-white border border-slate-100 rounded-2xl px-4 sm:px-5 py-4 transition ${tourGlowClass(1)}`}
      >
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          Section active
        </p>
        <h3 className="text-sm font-black text-slate-800 mt-1">
          {activeTabMeta.label}
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          {activeTabMeta.description}
        </p>
      </div>

      <div className="bg-white border border-indigo-100 rounded-2xl px-4 sm:px-5 py-4">
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-indigo-700 font-semibold">
            Besoin d'aide pour compléter ce formulaire ?
          </div>
          <button
            type="button"
            onClick={() => setShowFormHelp((v) => !v)}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-indigo-200 bg-white text-indigo-700 text-xs font-black hover:bg-indigo-50"
          >
            <HelpCircle size={14} />
            {showFormHelp ? "Masquer l'aide" : "Aide guidée"}
          </button>
        </div>
        {showFormHelp && (
          <div className="mt-3 rounded-2xl border border-indigo-200 bg-white shadow-sm p-4 space-y-3 animate-in fade-in duration-200">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {[
                "Etape 1: choisir l'onglet de parametres adapte.",
                "Etape 2: modifier les champs de la section.",
                "Etape 3: enregistrer pour appliquer les changements.",
              ].map((step, index) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => goToTourStep(index)}
                  className={`text-left rounded-xl border px-3 py-2 transition ${
                    tourStep === index
                      ? "border-amber-300 bg-amber-50"
                      : "border-slate-200 hover:border-indigo-200 hover:bg-indigo-50/60"
                  }`}
                >
                  <p className="text-[11px] font-black text-slate-700">{step}</p>
                </button>
              ))}
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 flex items-center gap-2">
              <Lightbulb size={14} className="text-amber-600 animate-pulse" />
              <p className="text-[11px] font-black text-amber-700">
                Etape actuelle: {tourStep + 1}/3
              </p>
            </div>
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => goToTourStep(tourStep - 1)}
                disabled={tourStep <= 0}
                className="px-3 py-1.5 rounded-lg border border-indigo-200 bg-white text-xs font-black text-indigo-700 disabled:opacity-40"
              >
                Précédent
              </button>
              <button
                type="button"
                onClick={() => goToTourStep(tourStep + 1)}
                disabled={tourStep >= 2}
                className="px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-xs font-black text-indigo-700 disabled:opacity-40"
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </div>

      <div
        className={`flex-1 overflow-y-auto pr-1 sm:pr-2 pb-20 space-y-5 sm:space-y-8 scrollbar-hide transition ${tourGlowClass(2)}`}
      >
        {activeTab === "general" && (
          <div className="w-full bg-white p-4 sm:p-10 rounded-[1.5rem] sm:rounded-[3rem] shadow-sm border border-slate-100 space-y-5 sm:space-y-8">
            <h3 className="text-2xl font-black text-slate-800 flex items-center gap-3">
              <SettingsIcon /> Paramètres de l'établissement
            </h3>
            <p className="text-xs text-slate-500 font-medium -mt-2">
              Chaque bloc possède ses boutons{" "}
              <span className="font-black text-slate-700">Enregistrer</span> et{" "}
              <span className="font-black text-slate-700">Réinitialiser</span>.
              Les changements ne sont pas appliqués tant que vous n&apos;enregistrez
              pas la section concernée.
            </p>
            <div className="space-y-6">
              <GeneralSettingsSection
                title="Identité & coordonnées"
                description="Nom commercial, logo et coordonnées sur les documents."
                onSave={() =>
                  updateSettings({
                    restaurantName: genIdentity.restaurantName.trim(),
                    logoUrl: genIdentity.logoUrl.trim(),
                    phone: genIdentity.phone.trim(),
                    email: genIdentity.email.trim(),
                    address: genIdentity.address.trim(),
                  })
                }
                onReset={() =>
                  setGenIdentity({
                    restaurantName: settings.restaurantName || "",
                    logoUrl: settings.logoUrl || "",
                    phone: settings.phone || "",
                    email: settings.email || "",
                    address: settings.address || "",
                  })
                }
              >
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block ml-2">
                    Nom du Restaurant
                  </label>
                  <input
                    type="text"
                    value={genIdentity.restaurantName}
                    onChange={(e) =>
                      setGenIdentity((p) => ({
                        ...p,
                        restaurantName: e.target.value,
                      }))
                    }
                    className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold outline-none border border-transparent focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block ml-2">
                    Logo (URL)
                  </label>
                  <input
                    type="text"
                    value={genIdentity.logoUrl}
                    onChange={(e) =>
                      setGenIdentity((p) => ({ ...p, logoUrl: e.target.value }))
                    }
                    className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold outline-none border border-transparent focus:border-indigo-500"
                  />
                  <div className="mt-3 flex items-center gap-4">
                    <label className="px-4 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest cursor-pointer">
                      Importer Logo
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) =>
                          handleLogoUpload(e.target.files?.[0] || null)
                        }
                      />
                    </label>
                    {genIdentity.logoUrl ? (
                      <img
                        src={resolvedLogoUrl}
                        alt="Logo"
                        className="h-10 w-10 object-contain rounded"
                      />
                    ) : null}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block ml-2">
                      Téléphone
                    </label>
                    <input
                      type="text"
                      value={genIdentity.phone}
                      onChange={(e) =>
                        setGenIdentity((p) => ({ ...p, phone: e.target.value }))
                      }
                      className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold outline-none border border-transparent focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block ml-2">
                      Email
                    </label>
                    <input
                      type="email"
                      value={genIdentity.email}
                      onChange={(e) =>
                        setGenIdentity((p) => ({ ...p, email: e.target.value }))
                      }
                      className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold outline-none border border-transparent focus:border-indigo-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block ml-2">
                    Adresse
                  </label>
                  <input
                    type="text"
                    value={genIdentity.address}
                    onChange={(e) =>
                      setGenIdentity((p) => ({
                        ...p,
                        address: e.target.value,
                      }))
                    }
                    className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold outline-none border border-transparent focus:border-indigo-500"
                  />
                </div>
              </GeneralSettingsSection>

              <GeneralSettingsSection
                title="Poste & type d'activité"
                description="Identifiant du terminal POS et mode d'exploitation (plan de salle, etc.)."
                onSave={() =>
                  updateSettings({
                    terminalId: genStation.terminalId.trim() || null,
                    ...(!(settings as any).saasLicense?.companyTypeManagedBySaas
                      ? { companyType: genStation.companyType }
                      : {}),
                  } as any)
                }
                onReset={() =>
                  setGenStation({
                    terminalId: settings.terminalId || "",
                    companyType: (settings.companyType ||
                      CompanyType.FAST_FOOD) as CompanyType,
                  })
                }
              >
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block ml-2">
                    ID Terminal
                  </label>
                  <input
                    type="text"
                    value={genStation.terminalId}
                    onChange={(e) =>
                      setGenStation((p) => ({
                        ...p,
                        terminalId: e.target.value,
                      }))
                    }
                    className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold outline-none border border-transparent focus:border-indigo-500"
                    placeholder="ex: TERMINAL-1"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block ml-2">
                    Type de société
                  </label>
                  {(settings as any).saasLicense?.companyTypeManagedBySaas && (
                    <p className="mb-2 text-xs font-bold text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2">
                      Géré par le <strong>Super Admin</strong> (licence SaaS).
                      L’admin local ne peut pas modifier ce champ.
                    </p>
                  )}
                  <select
                    value={genStation.companyType as any}
                    disabled={Boolean(
                      (settings as any).saasLicense?.companyTypeManagedBySaas,
                    )}
                    onChange={(e) =>
                      setGenStation((p) => ({
                        ...p,
                        companyType: e.target.value as CompanyType,
                      }))
                    }
                    className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold outline-none border border-transparent focus:border-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {companyTypeOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-slate-500 ml-2">
                    {
                      (
                        companyTypeOptions.find(
                          (o) =>
                            o.id ===
                            (genStation.companyType || CompanyType.FAST_FOOD),
                        ) || companyTypeOptions[0]
                      ).help
                    }
                  </p>
                </div>
              </GeneralSettingsSection>

              <div className="rounded-[2rem] border border-indigo-100 bg-gradient-to-br from-indigo-50/80 to-white p-6 shadow-sm sm:p-8">
                <h4 className="text-lg font-black text-slate-800">
                  Affichage du plan de salle au POS
                </h4>
                <p className="mt-2 text-xs font-medium leading-relaxed text-slate-600">
                  Réglage stocké en <strong>base de données</strong> et partagé
                  sur tous les postes. Utile pour choisir par défaut la grille
                  simple ou le plan dessiné en paramètres ; le même choix peut
                  être modifié directement sur l&apos;écran « Plan de salle ».
                </p>
                <div className="mt-5">
                  <label className="mb-2 ml-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Mode d&apos;affichage par défaut
                  </label>
                  <select
                    value={posRoomDisplayMode}
                    onChange={(e) => {
                      const v = e.target.value as "plan" | "simple";
                      setPosRoomDisplayMode(v);
                      updateSettings({ roomDisplayMode: v } as any)
                        .then(() =>
                          notifySuccess(
                            "Préférence du plan enregistrée en base.",
                          ),
                        )
                        .catch((err: any) =>
                          notifyError(
                            err?.message ||
                              "Impossible d'enregistrer la préférence du plan.",
                          ),
                        );
                    }}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-6 py-4 font-bold outline-none focus:border-indigo-500"
                  >
                    <option value="plan">
                      Plan (parquet et emplacements, si configurés)
                    </option>
                    <option value="simple">Grille simple (grandes cartes)</option>
                  </select>
                </div>
              </div>

              <GeneralSettingsSection
                title="Clôture caisse (équipes)"
                description="Adapte le flux à votre exploitation : plusieurs créneaux serveur (midi / soir) ou caisse autonome."
                onSave={() =>
                  updateSettings({
                    cashClosingModePreference:
                      genCashClosing.cashClosingModePreference,
                  } as any)
                }
                onReset={() =>
                  setGenCashClosing({
                    cashClosingModePreference:
                      (settings as any).cashClosingModePreference || "AUTO",
                  })
                }
              >
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block ml-2">
                    Stratégie de clôture station
                  </label>
                  <select
                    value={genCashClosing.cashClosingModePreference}
                    onChange={(e) =>
                      setGenCashClosing({
                        cashClosingModePreference: e.target.value as
                          | "AUTO"
                          | "INDEPENDENT"
                          | "SHIFT_HANDOVER",
                      })
                    }
                    className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold outline-none border border-transparent focus:border-indigo-500"
                  >
                    <option value="AUTO">
                      Automatique (restaurant / café = équipes d’abord ; autres = libre)
                    </option>
                    <option value="SHIFT_HANDOVER">
                      Toujours : fermer tous les shifts serveur puis la station
                    </option>
                    <option value="INDEPENDENT">
                      Toujours : station indépendante des shifts
                    </option>
                  </select>
                  <p className="mt-2 text-xs text-slate-500 ml-2 font-medium leading-relaxed">
                    <strong>Effectif actuel sur ce poste :</strong>{" "}
                    {(settings as any).cashClosingMode === "SHIFT_HANDOVER"
                      ? "Les shifts ouverts bloquent « Clôturer Station » jusqu’à « Cloture Serveurs »."
                      : "La station peut se clôturer même s’il reste des shifts ouverts (selon vos procédures internes)."}
                  </p>
                </div>
              </GeneralSettingsSection>

              <GeneralSettingsSection
                title="Préfixes de numérotation"
                description="Préfixes des tickets, commandes, factures, clients, stock et produits."
                onSave={() =>
                  updateSettings({
                    ticketPrefix: genPrefixes.ticketPrefix.trim(),
                    orderPrefix: genPrefixes.orderPrefix.trim(),
                    invoicePrefix: genPrefixes.invoicePrefix.trim(),
                    clientPrefix: genPrefixes.clientPrefix.trim(),
                    stockDocumentPrefix: genPrefixes.stockDocumentPrefix.trim(),
                    productPrefix: genPrefixes.productPrefix.trim(),
                  } as any)
                }
                onReset={() =>
                  setGenPrefixes({
                    ticketPrefix: settings.ticketPrefix || "",
                    orderPrefix: String((settings as any).orderPrefix || ""),
                    invoicePrefix: String((settings as any).invoicePrefix || ""),
                    clientPrefix: String((settings as any).clientPrefix || ""),
                    stockDocumentPrefix: String(
                      (settings as any).stockDocumentPrefix || "",
                    ),
                    productPrefix: String((settings as any).productPrefix || ""),
                  })
                }
              >
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block ml-2">
                    Préfixe Ticket
                  </label>
                  <input
                    type="text"
                    value={genPrefixes.ticketPrefix}
                    onChange={(e) =>
                      setGenPrefixes((p) => ({
                        ...p,
                        ticketPrefix: e.target.value,
                      }))
                    }
                    className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold outline-none border border-transparent focus:border-indigo-500"
                    placeholder="ex: TK-"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block ml-2">
                    Préfixe Commande
                  </label>
                  <input
                    type="text"
                    value={genPrefixes.orderPrefix}
                    onChange={(e) =>
                      setGenPrefixes((p) => ({
                        ...p,
                        orderPrefix: e.target.value,
                      }))
                    }
                    className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold outline-none border border-transparent focus:border-indigo-500"
                    placeholder="ex: ORD-"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block ml-2">
                      Préfixe Facture
                    </label>
                    <input
                      type="text"
                      value={genPrefixes.invoicePrefix}
                      onChange={(e) =>
                        setGenPrefixes((p) => ({
                          ...p,
                          invoicePrefix: e.target.value,
                        }))
                      }
                      className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold outline-none border border-transparent focus:border-indigo-500"
                      placeholder="ex: INV-"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block ml-2">
                      Préfixe Client
                    </label>
                    <input
                      type="text"
                      value={genPrefixes.clientPrefix}
                      onChange={(e) =>
                        setGenPrefixes((p) => ({
                          ...p,
                          clientPrefix: e.target.value,
                        }))
                      }
                      className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold outline-none border border-transparent focus:border-indigo-500"
                      placeholder="ex: CLI-"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block ml-2">
                      Préfixe Document Stock
                    </label>
                    <input
                      type="text"
                      value={genPrefixes.stockDocumentPrefix}
                      onChange={(e) =>
                        setGenPrefixes((p) => ({
                          ...p,
                          stockDocumentPrefix: e.target.value,
                        }))
                      }
                      className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold outline-none border border-transparent focus:border-indigo-500"
                      placeholder="ex: SD-"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block ml-2">
                      Préfixe Produit
                    </label>
                    <input
                      type="text"
                      value={genPrefixes.productPrefix}
                      onChange={(e) =>
                        setGenPrefixes((p) => ({
                          ...p,
                          productPrefix: e.target.value,
                        }))
                      }
                      className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold outline-none border border-transparent focus:border-indigo-500"
                      placeholder="ex: ART-"
                    />
                  </div>
                </div>
              </GeneralSettingsSection>

              <GeneralSettingsSection
                title="Fiscalité & options d’impression"
                description="Matricule fiscal, TVA, timbre et application sur tickets / factures."
                onSave={() => {
                  const normalizedFiscalCategoryCatalog = genFiscal.fiscalCategoryCatalog
                    .map((entry) => ({
                      articleCategory: String(entry.articleCategory || "").trim(),
                      familyCode: String(entry.familyCode || "")
                        .trim()
                        .toUpperCase(),
                      label: String(entry.label || "").trim(),
                    }))
                    .filter(
                      (entry) =>
                        entry.articleCategory.length > 0 &&
                        entry.familyCode.length > 0,
                    );
                  const invalidFamilyCodeEntry = normalizedFiscalCategoryCatalog.find(
                    (entry) => !isValidFiscalFamilyCode(entry.familyCode),
                  );
                  if (invalidFamilyCodeEntry) {
                    window.alert(
                      `Code famille fiscal invalide: "${invalidFamilyCodeEntry.familyCode}". Format attendu: A-Z, 0-9, _, longueur 2-32.`,
                    );
                    return;
                  }
                  return updateSettings({
                    taxId: genFiscal.taxId.trim() || null,
                    tvaRate: genFiscal.tvaRate,
                    tvaCatalog: genFiscal.tvaCatalog
                      .map((entry) => ({
                        code: String(entry.code || "").trim().toUpperCase(),
                        label: String(entry.label || "").trim(),
                        rate: Math.max(0, Number(entry.rate || 0)),
                      }))
                      .filter((entry) => entry.code.length > 0),
                    fiscalCategoryCatalog: normalizedFiscalCategoryCatalog,
                    timbreValue: genFiscal.timbreValue,
                    applyTvaToTicket: genFiscal.applyTvaToTicket,
                    applyTvaToInvoice: genFiscal.applyTvaToInvoice,
                    applyTimbreToTicket: genFiscal.applyTimbreToTicket,
                    applyTimbreToInvoice: genFiscal.applyTimbreToInvoice,
                    printPreviewOnValidate: genFiscal.printPreviewOnValidate,
                    printAutoOnPreview: genFiscal.printAutoOnPreview,
                  } as any)
                }}
                onReset={() =>
                  setGenFiscal({
                    taxId: settings.taxId ?? "",
                    tvaRate: settings.tvaRate ?? 0,
                    tvaCatalog: normalizeTvaCatalogFromSettings((settings as any).tvaCatalog, settings.tvaRate ?? 0),
                    fiscalCategoryCatalog: normalizeFiscalCategoryCatalogFromSettings(
                      (settings as any).fiscalCategoryCatalog,
                    ),
                    timbreValue: settings.timbreValue ?? 0,
                    applyTvaToTicket: Boolean(settings.applyTvaToTicket),
                    applyTvaToInvoice: Boolean(settings.applyTvaToInvoice),
                    applyTimbreToTicket: Boolean(settings.applyTimbreToTicket),
                    applyTimbreToInvoice: Boolean(settings.applyTimbreToInvoice),
                    printPreviewOnValidate: Boolean(
                      settings.printPreviewOnValidate,
                    ),
                    printAutoOnPreview:
                      (settings as any).printAutoOnPreview !== false,
                  })
                }
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block ml-2">
                      Matricule Fiscal
                    </label>
                    <input
                      type="text"
                      value={genFiscal.taxId}
                      onChange={(e) =>
                        setGenFiscal((p) => ({ ...p, taxId: e.target.value }))
                      }
                      className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold outline-none border border-transparent focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block ml-2">
                      TVA (%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={genFiscal.tvaRate}
                      onChange={(e) =>
                        setGenFiscal((p) => ({
                          ...p,
                          tvaRate: parseFloat(e.target.value) || 0,
                        }))
                      }
                      className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold outline-none border border-transparent focus:border-indigo-500"
                    />
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Catalogue TVA (compatible A4 / A5)
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setGenFiscal((p) => ({
                          ...p,
                          tvaCatalog: [
                            ...p.tvaCatalog,
                            { code: "", label: "", rate: Number(p.tvaRate || 0) },
                          ],
                        }))
                      }
                      className="px-3 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase"
                    >
                      + Ajouter taux
                    </button>
                  </div>
                  <div className="space-y-2">
                    {genFiscal.tvaCatalog.map((entry, index) => (
                      <div key={`tva-row-${index}`} className="grid grid-cols-1 md:grid-cols-12 gap-2">
                        <input
                          type="text"
                          value={entry.code}
                          onChange={(e) =>
                            setGenFiscal((p) => ({
                              ...p,
                              tvaCatalog: p.tvaCatalog.map((row, i) =>
                                i === index ? { ...row, code: e.target.value.toUpperCase() } : row,
                              ),
                            }))
                          }
                          className="md:col-span-3 px-4 py-3 bg-white rounded-xl font-bold outline-none border border-transparent focus:border-indigo-500"
                          placeholder="Code (ex: TVA_STD)"
                        />
                        <input
                          type="text"
                          value={entry.label}
                          onChange={(e) =>
                            setGenFiscal((p) => ({
                              ...p,
                              tvaCatalog: p.tvaCatalog.map((row, i) =>
                                i === index ? { ...row, label: e.target.value } : row,
                              ),
                            }))
                          }
                          className="md:col-span-5 px-4 py-3 bg-white rounded-xl font-bold outline-none border border-transparent focus:border-indigo-500"
                          placeholder="Libellé"
                        />
                        <input
                          type="number"
                          step="0.01"
                          value={entry.rate}
                          onChange={(e) =>
                            setGenFiscal((p) => ({
                              ...p,
                              tvaCatalog: p.tvaCatalog.map((row, i) =>
                                i === index ? { ...row, rate: Math.max(0, Number(e.target.value || 0)) } : row,
                              ),
                            }))
                          }
                          className="md:col-span-3 px-4 py-3 bg-white rounded-xl font-bold outline-none border border-transparent focus:border-indigo-500"
                          placeholder="%"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setGenFiscal((p) => ({
                              ...p,
                              tvaCatalog:
                                p.tvaCatalog.length <= 1
                                  ? p.tvaCatalog
                                  : p.tvaCatalog.filter((_, i) => i !== index),
                            }))
                          }
                          className="md:col-span-1 px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-black"
                        >
                          X
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Catégories fiscales (mapping)
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setGenFiscal((p) => ({
                          ...p,
                          fiscalCategoryCatalog: [
                            ...p.fiscalCategoryCatalog,
                            { articleCategory: "", familyCode: "", label: "" },
                          ],
                        }))
                      }
                      className="px-3 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase"
                    >
                      + Ajouter ligne
                    </button>
                  </div>
                  <div className="space-y-2">
                    {genFiscal.fiscalCategoryCatalog.map((entry, index) => (
                      <div key={`fiscal-cat-${index}`} className="grid grid-cols-1 md:grid-cols-12 gap-2">
                        <select
                          value={entry.articleCategory}
                          onChange={(e) =>
                            setGenFiscal((p) => ({
                              ...p,
                              fiscalCategoryCatalog: p.fiscalCategoryCatalog.map((row, i) =>
                                i === index
                                  ? { ...row, articleCategory: e.target.value }
                                  : row,
                              ),
                            }))
                          }
                          className="md:col-span-4 px-4 py-3 bg-white rounded-xl font-bold outline-none border border-transparent focus:border-indigo-500"
                        >
                          <option value="">Choisir une catégorie article</option>
                          {articleCategoryOptions.map((categoryName) => (
                            <option key={categoryName} value={categoryName}>
                              {categoryName}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={entry.familyCode}
                          onChange={(e) =>
                            setGenFiscal((p) => ({
                              ...p,
                              fiscalCategoryCatalog: p.fiscalCategoryCatalog.map((row, i) =>
                                i === index
                                  ? { ...row, familyCode: e.target.value.toUpperCase() }
                                  : row,
                              ),
                            }))
                          }
                          className={`md:col-span-3 px-4 py-3 bg-white rounded-xl font-bold outline-none border focus:border-indigo-500 ${
                            entry.familyCode &&
                            !isValidFiscalFamilyCode(entry.familyCode)
                              ? "border-rose-300"
                              : "border-transparent"
                          }`}
                          placeholder="Code famille (ex: FAM_BOISSONS)"
                        />
                        <input
                          type="text"
                          value={entry.label || ""}
                          onChange={(e) =>
                            setGenFiscal((p) => ({
                              ...p,
                              fiscalCategoryCatalog: p.fiscalCategoryCatalog.map((row, i) =>
                                i === index ? { ...row, label: e.target.value } : row,
                              ),
                            }))
                          }
                          className="md:col-span-4 px-4 py-3 bg-white rounded-xl font-bold outline-none border border-transparent focus:border-indigo-500"
                          placeholder="Libellé fiscal (optionnel)"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setGenFiscal((p) => ({
                              ...p,
                              fiscalCategoryCatalog: p.fiscalCategoryCatalog.filter(
                                (_, i) => i !== index,
                              ),
                            }))
                          }
                          className="md:col-span-1 px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-black"
                        >
                          X
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-500 font-bold">
                    Ce mapping est fiscal uniquement (NACEF) et n’impacte pas la
                    structure métier des catégories articles.
                  </p>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block ml-2">
                    Timbre fiscal (montant)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    value={genFiscal.timbreValue}
                    onChange={(e) =>
                      setGenFiscal((p) => ({
                        ...p,
                        timbreValue: parseFloat(e.target.value) || 0,
                      }))
                    }
                    className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold outline-none border border-transparent focus:border-indigo-500"
                  />
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-3">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Application TVA / Timbre
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="flex items-center justify-between bg-white border border-slate-100 rounded-xl px-4 py-3">
                      <span className="text-[10px] font-black text-slate-600 uppercase">
                        TVA sur Ticket
                      </span>
                      <input
                        type="checkbox"
                        checked={genFiscal.applyTvaToTicket}
                        onChange={(e) =>
                          setGenFiscal((p) => ({
                            ...p,
                            applyTvaToTicket: e.target.checked,
                          }))
                        }
                      />
                    </label>
                    <label className="flex items-center justify-between bg-white border border-slate-100 rounded-xl px-4 py-3">
                      <span className="text-[10px] font-black text-slate-600 uppercase">
                        TVA sur Facture
                      </span>
                      <input
                        type="checkbox"
                        checked={genFiscal.applyTvaToInvoice}
                        onChange={(e) =>
                          setGenFiscal((p) => ({
                            ...p,
                            applyTvaToInvoice: e.target.checked,
                          }))
                        }
                      />
                    </label>
                    <label className="flex items-center justify-between bg-white border border-slate-100 rounded-xl px-4 py-3">
                      <span className="text-[10px] font-black text-slate-600 uppercase">
                        Timbre sur Ticket
                      </span>
                      <input
                        type="checkbox"
                        checked={genFiscal.applyTimbreToTicket}
                        onChange={(e) =>
                          setGenFiscal((p) => ({
                            ...p,
                            applyTimbreToTicket: e.target.checked,
                          }))
                        }
                      />
                    </label>
                    <label className="flex items-center justify-between bg-white border border-slate-100 rounded-xl px-4 py-3">
                      <span className="text-[10px] font-black text-slate-600 uppercase">
                        Timbre sur Facture
                      </span>
                      <input
                        type="checkbox"
                        checked={genFiscal.applyTimbreToInvoice}
                        onChange={(e) =>
                          setGenFiscal((p) => ({
                            ...p,
                            applyTimbreToInvoice: e.target.checked,
                          }))
                        }
                      />
                    </label>
                  </div>
                  <div className="mt-3 flex items-center justify-between bg-white border border-slate-100 rounded-xl px-4 py-3">
                    <span className="text-[10px] font-black text-slate-600 uppercase">
                      Prévisualiser impression après validation
                    </span>
                    <input
                      type="checkbox"
                      checked={genFiscal.printPreviewOnValidate}
                      onChange={(e) =>
                        setGenFiscal((p) => ({
                          ...p,
                          printPreviewOnValidate: e.target.checked,
                        }))
                      }
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between bg-white border border-slate-100 rounded-xl px-4 py-3">
                    <span className="text-[10px] font-black text-slate-600 uppercase">
                      Impression auto quand l'aperçu est ouvert
                    </span>
                    <input
                      type="checkbox"
                      checked={genFiscal.printAutoOnPreview}
                      onChange={(e) =>
                        setGenFiscal((p) => ({
                          ...p,
                          printAutoOnPreview: e.target.checked,
                        }))
                      }
                    />
                  </div>
                </div>
              </GeneralSettingsSection>

              <GeneralSettingsSection
                title="Tactile, KDS client & archives PDF"
                description="Interface tactile, affichage écran client, copies ticket, dossier PDF et consultation des archives."
                onSave={() =>
                  updateSettings({
                    touchUiMode: genTouch.touchUiMode,
                    clientKdsDisplayMode: genTouch.clientKdsDisplayMode,
                    clientKdsWallboardMinWidthPx: genTouch.clientKdsWallboardMinWidthPx,
                    clientTicketPrintCopies: genTouch.clientTicketPrintCopies,
                    receiptPdfDirectory: genTouch.receiptPdfDirectory.trim(),
                    autoDownloadReceiptPdfOnClient:
                      genTouch.autoDownloadReceiptPdfOnClient,
                  } as any)
                }
                onReset={() =>
                  setGenTouch({
                    touchUiMode: Boolean(settings.touchUiMode),
                    clientKdsDisplayMode: (settings.clientKdsDisplayMode ||
                      "STANDARD") as ClientKdsModeUi,
                    clientKdsWallboardMinWidthPx:
                      settings.clientKdsWallboardMinWidthPx ?? 1920,
                    clientTicketPrintCopies: Math.max(
                      1,
                      Math.min(10, Number(settings.clientTicketPrintCopies) || 1),
                    ),
                    receiptPdfDirectory: settings.receiptPdfDirectory || "",
                    autoDownloadReceiptPdfOnClient: Boolean(
                      settings.autoDownloadReceiptPdfOnClient,
                    ),
                  })
                }
              >
                <div
                  id="settings-touch-client-kds"
                  className="pt-1 border-t border-slate-100 -mt-1"
                >
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-wide mb-2">
                    Tactile & écran client (KDS)
                  </h3>
                  <p className="text-[10px] text-slate-500 font-bold mb-3 leading-relaxed">
                    Interface POS agrandie et affichage du KDS client (standard,
                    wallboard ou auto selon la largeur).
                  </p>
                </div>
                <div className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
                  <span className="text-[10px] font-black text-slate-600 uppercase">
                    Mode tablette tactile (UI agrandie)
                  </span>
                  <input
                    type="checkbox"
                    checked={genTouch.touchUiMode}
                    onChange={(e) =>
                      setGenTouch((p) => ({
                        ...p,
                        touchUiMode: e.target.checked,
                      }))
                    }
                  />
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 space-y-2">
                  <span className="text-[10px] font-black text-slate-600 uppercase block">
                    KDS client - mode affichage
                  </span>
                  <select
                    value={genTouch.clientKdsDisplayMode}
                    onChange={(e) =>
                      setGenTouch((p) => ({
                        ...p,
                        clientKdsDisplayMode: (e.target.value ||
                          "STANDARD") as ClientKdsModeUi,
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-black text-xs"
                  >
                    <option value="STANDARD">Standard</option>
                    <option value="WALLBOARD">Wallboard (32&quot;-50&quot;)</option>
                    <option value="AUTO">Auto wallboard (grand écran)</option>
                  </select>
                </div>
                {genTouch.clientKdsDisplayMode === "AUTO" && (
                  <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 space-y-2">
                    <span className="text-[10px] font-black text-slate-600 uppercase block">
                      Seuil largeur wallboard (px)
                    </span>
                    <input
                      type="number"
                      min={800}
                      max={3840}
                      value={genTouch.clientKdsWallboardMinWidthPx}
                      onChange={(e) =>
                        setGenTouch((p) => ({
                          ...p,
                          clientKdsWallboardMinWidthPx: Math.max(
                            800,
                            Math.min(
                              3840,
                              parseInt(e.target.value || "1920", 10) || 1920,
                            ),
                          ),
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-black text-sm"
                    />
                    <p className="text-[10px] text-slate-500 font-bold">
                      Au-dessus de cette largeur, l’écran client passe en mode
                      wallboard (ex. 1920 pour Full HD+).
                    </p>
                  </div>
                )}
                <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 space-y-2">
                  <span className="text-[10px] font-black text-slate-600 uppercase block">
                    Nombre d&apos;impressions ticket client
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={genTouch.clientTicketPrintCopies}
                    onChange={(e) =>
                      setGenTouch((p) => ({
                        ...p,
                        clientTicketPrintCopies: Math.max(
                          1,
                          Math.min(
                            10,
                            parseInt(e.target.value || "1", 10) || 1,
                          ),
                        ),
                      }))
                    }
                    className="w-28 px-3 py-2 rounded-xl border border-slate-200 bg-white font-black text-sm text-center"
                  />
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 space-y-2">
                  <span className="text-[10px] font-black text-slate-600 uppercase block">
                    Dossier d&apos;enregistrement PDF des reçus
                  </span>
                  <input
                    type="text"
                    placeholder="Ex: D:\\Receipts\\PDF (vide = Backend/tmp)"
                    value={genTouch.receiptPdfDirectory}
                    onChange={(e) =>
                      setGenTouch((p) => ({
                        ...p,
                        receiptPdfDirectory: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold text-xs"
                  />
                  <p className="text-[10px] text-slate-500 font-bold">
                    Le reçu PDF est sauvegardé automatiquement à chaque ticket.
                  </p>
                  <label className="inline-flex items-center gap-2 text-[11px] font-bold text-slate-700 pt-1">
                    <input
                      type="checkbox"
                      checked={genTouch.autoDownloadReceiptPdfOnClient}
                      onChange={(e) =>
                        setGenTouch((p) => ({
                          ...p,
                          autoDownloadReceiptPdfOnClient: e.target.checked,
                        }))
                      }
                    />
                    Télécharger aussi automatiquement le PDF sur la caisse
                  </label>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] font-black text-slate-600 uppercase block">
                      Archives PDF
                    </span>
                    <button
                      type="button"
                      onClick={refreshPdfArchives}
                      disabled={pdfArchivesLoading}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-[10px] font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {pdfArchivesLoading ? "Chargement..." : "Actualiser"}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 font-bold">
                    Dossier base:{" "}
                    {pdfArchives?.baseDir ||
                      genTouch.receiptPdfDirectory ||
                      "Backend/tmp/pdf-archives"}
                  </p>
                  <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                    {(pdfArchives?.categories || []).map((cat) => (
                      <div
                        key={cat.category}
                        className="border border-slate-100 rounded-lg p-2 bg-white"
                      >
                        <p className="text-[10px] font-black text-indigo-700 uppercase">
                          {cat.category}
                        </p>
                        <div className="mt-1 space-y-1">
                          {cat.files.slice(0, 12).map((f) => (
                            <div
                              key={f.relativePath}
                              className="flex items-center justify-between gap-2 text-[10px]"
                            >
                              <span className="font-bold text-slate-700 truncate">
                                {f.name}
                              </span>
                              <span className="text-slate-400 shrink-0">
                                {formatFileSize(f.size)}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  downloadPdfArchiveFile(f.relativePath).catch(
                                    (e) =>
                                      notifyError(
                                        e?.message ||
                                          "Téléchargement archive PDF impossible.",
                                      ),
                                  )
                                }
                                className="text-indigo-600 font-black hover:underline shrink-0"
                              >
                                Télécharger
                              </button>
                            </div>
                          ))}
                          {cat.files.length === 0 ? (
                            <p className="text-[10px] text-slate-400">
                              Aucun PDF.
                            </p>
                          ) : null}
                        </div>
                      </div>
                    ))}
                    {!pdfArchivesLoading &&
                    (!pdfArchives?.categories ||
                      pdfArchives.categories.length === 0) ? (
                      <p className="text-[10px] text-slate-400">
                        Aucune archive détectée pour le moment.
                      </p>
                    ) : null}
                  </div>
                </div>
              </GeneralSettingsSection>

              <GeneralSettingsSection
                title="Pilotage des sources d'impression"
                description="Un seul endroit pour choisir la source d'impression de chaque flux (client/cuisine/bar)."
                onSave={() =>
                  updateSettings({
                    printTemplateSource: {
                      client: printTemplateSource.client,
                      kitchen: printTemplateSource.kitchen,
                      bar: printTemplateSource.bar,
                    } as any,
                  } as any)
                }
                onReset={() => {
                  const s = ((settings as any).printTemplateSource || {}) as any;
                  setPrintTemplateSource({
                    client:  (String(s?.client  || "").toUpperCase() === "DESIGNER" ? "DESIGNER" : "BUILTIN") as "BUILTIN" | "DESIGNER",
                    kitchen: (String(s?.kitchen || "").toUpperCase() === "DESIGNER" ? "DESIGNER" : "BUILTIN") as "BUILTIN" | "DESIGNER",
                    bar:     (String(s?.bar     || "").toUpperCase() === "DESIGNER" ? "DESIGNER" : "BUILTIN") as "BUILTIN" | "DESIGNER",
                  });
                }}
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setPrintTemplateSource({
                          client: "DESIGNER",
                          kitchen: "DESIGNER",
                          bar: "DESIGNER",
                        })
                      }
                      className="px-3 py-2 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-black uppercase tracking-wider hover:bg-indigo-100"
                    >
                      Appliquer Designer partout
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setPrintTemplateSource({
                          client: "BUILTIN",
                          kitchen: "BUILTIN",
                          bar: "BUILTIN",
                        })
                      }
                      className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-black uppercase tracking-wider hover:bg-emerald-100"
                    >
                      Appliquer Modèle partout
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {printTemplateKinds.map((kind) => {
                    const isDesigner = printTemplateSource[kind] === "DESIGNER";
                    return (
                      <div
                        key={kind}
                        className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2"
                      >
                        <p className="text-[10px] font-black uppercase text-slate-700">
                          {printTemplateKindLabels[kind]}
                        </p>
                        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-full p-0.5 w-max">
                          <button
                            type="button"
                            onClick={() =>
                              setPrintTemplateSource((p) => ({
                                ...p,
                                [kind]: "BUILTIN",
                              }))
                            }
                            className={`px-3 py-1 rounded-full text-[10px] font-black uppercase transition-all ${
                              !isDesigner
                                ? "bg-indigo-600 text-white shadow"
                                : "text-slate-500 hover:text-slate-700"
                            }`}
                          >
                            Modèle
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setPrintTemplateSource((p) => ({
                                ...p,
                                [kind]: "DESIGNER",
                              }))
                            }
                            className={`px-3 py-1 rounded-full text-[10px] font-black uppercase transition-all ${
                              isDesigner
                                ? "bg-indigo-600 text-white shadow"
                                : "text-slate-500 hover:text-slate-700"
                            }`}
                          >
                            Designer
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-500 font-bold">
                          Actif: {isDesigner ? "Designer visuel" : "Modèle ticket"}
                        </p>
                      </div>
                    );
                  })}
                </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-black uppercase text-amber-700">
                        Diagnostic impression (runtime)
                      </p>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(
                              printDiagnosticSnapshot,
                            );
                            notifySuccess("Diagnostic copié.");
                          } catch {
                            notifyError("Copie impossible.");
                          }
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-white border border-amber-200 text-amber-700 text-[10px] font-black uppercase"
                      >
                        Copier JSON
                      </button>
                    </div>
                    <pre className="text-[10px] leading-relaxed text-slate-700 bg-white border border-amber-100 rounded-lg p-2 overflow-x-auto max-h-52">
{printDiagnosticSnapshot}
                    </pre>
                  </div>
                </div>
              </GeneralSettingsSection>

              <GeneralSettingsSection
                title="Modèle ticket client"
                description="Style du ticket, zones affichées, export / import JSON et aperçu."
                headerBadge={
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                    ((settings as any)?.printTemplateSource?.client === "DESIGNER")
                      ? "bg-indigo-100 text-indigo-700 border border-indigo-200"
                      : "bg-emerald-100 text-emerald-700 border border-emerald-200"
                  }`}>
                    <span className="w-1.5 h-1.5 rounded-full inline-block bg-current" />
                    {((settings as any)?.printTemplateSource?.client === "DESIGNER") ? "Designer visuel actif" : "Modèle ticket actif"}
                  </span>
                }
                onSave={() => {
                  if (isNacefTicketTemplateLocked) return Promise.resolve();
                  return updateSettings({
                    clientTicketTemplate: genTicket.clientTicketTemplate,
                    clientTicketLayout: {
                      ...(genTicket.clientTicketLayout || {}),
                    } as any,
                  } as any);
                }}
                onReset={() =>
                  isNacefTicketTemplateLocked
                    ? undefined
                    :
                  setGenTicket({
                    clientTicketTemplate: (settings.clientTicketTemplate ||
                      "CLASSIC") as ClientTicketTemplateUi,
                    clientTicketLayout: JSON.parse(
                      JSON.stringify(settings.clientTicketLayout || {}),
                    ),
                  })
                }
              >
                {isNacefTicketTemplateLocked ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800">
                    NACEF activé: le format ticket fiscal est imposé. Les options de personnalisation du ticket client sont verrouillées.
                  </div>
                ) : null}
                <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 space-y-2">
                  <span className="text-[10px] font-black text-slate-600 uppercase block">
                    Modèle ticket client
                  </span>
                  <select
                    value={genTicket.clientTicketTemplate}
                    onChange={(e) =>
                      setGenTicket((p) => ({
                        ...p,
                        clientTicketTemplate: (e.target.value ||
                          "CLASSIC") as ClientTicketTemplateUi,
                      }))
                    }
                    disabled={isNacefTicketTemplateLocked}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-black text-xs"
                  >
                    <option value="CLASSIC">Classic</option>
                    <option value="COMPACT">Compact</option>
                    <option value="MODERN">Modern</option>
                  </select>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 space-y-3">
                  <span className="text-[10px] font-black text-slate-600 uppercase block">
                    Création modèle impression (ticket client)
                  </span>
                  <input
                    type="text"
                    placeholder="Texte d'en-tête (optionnel)"
                    value={String(genTicket.clientTicketLayout?.headerText || "")}
                    onChange={(e) =>
                      setGenTicket((p) => ({
                        ...p,
                        clientTicketLayout: {
                          ...p.clientTicketLayout,
                          headerText: e.target.value,
                        },
                      }))
                    }
                    disabled={isNacefTicketTemplateLocked}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold text-xs"
                  />
                  <textarea
                    placeholder="Texte pied de ticket (ex: merci de votre visite)"
                    value={String(genTicket.clientTicketLayout?.footerText || "")}
                    onChange={(e) =>
                      setGenTicket((p) => ({
                        ...p,
                        clientTicketLayout: {
                          ...p.clientTicketLayout,
                          footerText: e.target.value,
                        },
                      }))
                    }
                    rows={2}
                    disabled={isNacefTicketTemplateLocked}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold text-xs resize-none"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ["showLogo", "Afficher logo"],
                      ["showDate", "Afficher date"],
                      ["showTicketNumber", "Afficher num ticket"],
                      ["showAddress", "Afficher adresse"],
                      ["showPhone", "Afficher téléphone"],
                      ["showTaxId", "Afficher matricule fiscal"],
                      ["showServer", "Afficher serveur"],
                      ["showTable", "Afficher table"],
                      ["showPriceHt", "Afficher prix HT"],
                      ["showTicketDiscount", "Afficher remise ticket"],
                      ["showTimbre", "Afficher timbre"],
                      ["showTva", "Afficher TVA"],
                      ["showPriceTtc", "Afficher prix TTC"],
                      ["showQrCode", "Afficher QR code"],
                      ["showItemUnitPrice", "Afficher PU article"],
                      ["showPaymentMethod", "Afficher mode paiement"],
                      ["showTerminal", "Afficher terminal/caisse"],
                      ["showClientName", "Afficher nom client"],
                      ["showFiscalQrCode", "Afficher QR fiscal"],
                    ].map(([key, label]) => (
                      <label
                        key={key}
                        className="flex items-center justify-between text-[10px] font-black text-slate-600 uppercase bg-white border border-slate-100 rounded-lg px-3 py-2"
                      >
                        <span>{label}</span>
                        <input
                          type="checkbox"
                          checked={Boolean(
                            (genTicket.clientTicketLayout as any)?.[key],
                          )}
                          onChange={(e) =>
                            setGenTicket((p) => ({
                              ...p,
                              clientTicketLayout: {
                                ...p.clientTicketLayout,
                                [key]: e.target.checked,
                              },
                            }))
                          }
                          disabled={isNacefTicketTemplateLocked}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleExportTicketTemplate}
                      disabled={isNacefTicketTemplateLocked}
                      className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-black uppercase tracking-wider hover:bg-indigo-100"
                    >
                      <Download size={12} />
                      Exporter modèle
                    </button>
                    <button
                      type="button"
                      onClick={() => ticketTemplateImportRef.current?.click()}
                      disabled={isNacefTicketTemplateLocked}
                      className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-black uppercase tracking-wider hover:bg-emerald-100"
                    >
                      <Upload size={12} />
                      Importer modèle
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadExternalTicketTemplateSample}
                      className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-sky-50 text-sky-700 border border-sky-100 text-[10px] font-black uppercase tracking-wider hover:bg-sky-100"
                    >
                      <Download size={12} />
                      Modèle C:
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadExternalClientHtmlTemplateSample}
                      className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-100 text-[10px] font-black uppercase tracking-wider hover:bg-blue-100"
                    >
                      <Download size={12} />
                      HTML client
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadNacefHtmlTemplateSample}
                      className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-amber-50 text-amber-700 border border-amber-100 text-[10px] font-black uppercase tracking-wider hover:bg-amber-100"
                    >
                      <Download size={12} />
                      HTML NACEF
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleTemplatePreviewOrDownload("client", "pdf", "download")
                      }
                      className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-violet-50 text-violet-700 border border-violet-100 text-[10px] font-black uppercase tracking-wider hover:bg-violet-100"
                    >
                      <Download size={12} />
                      PDF client
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleTemplatePreviewOrDownload("client", "pdf", "preview")
                      }
                      className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-100 text-[10px] font-black uppercase tracking-wider hover:bg-fuchsia-100"
                    >
                      <FileText size={12} />
                      Aperçu client
                    </button>
                    <input
                      ref={ticketTemplateImportRef}
                      type="file"
                      accept="application/json,.json"
                      onChange={handleImportTicketTemplate}
                      className="hidden"
                    />
                  </div>
                </div>
                <div className="mt-3 bg-white border border-slate-100 rounded-xl px-4 py-4">
                  <p className="text-[10px] font-black text-slate-600 uppercase mb-3">
                    Aperçu live ticket client
                  </p>
                  <div className="bg-slate-100 rounded-2xl p-3 flex justify-center">
                    <div className={previewShellClass}>
                      <div className="text-center border-b border-dashed border-slate-200 pb-3">
                        {ticketLayout.showLogo ? (
                          resolvedLogoUrl ? (
                            <img
                              src={resolvedLogoUrl}
                              alt="Logo"
                              className="w-10 h-10 rounded-full object-cover mx-auto mb-2 border border-slate-200"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-600 mx-auto mb-2 flex items-center justify-center text-[10px] font-black">
                              LOGO
                            </div>
                          )
                        ) : null}
                        <p className="text-sm font-black text-slate-800">
                          {genIdentity.restaurantName || "Mon Restaurant"}
                        </p>
                        {ticketLayout.headerText ? (
                          <p className="text-[10px] text-slate-500 mt-1">
                            {ticketLayout.headerText}
                          </p>
                        ) : null}
                        <div className="mt-1 text-[9px] text-slate-500 space-y-0.5">
                          {ticketLayout.showDate ? (
                            <p>{new Date().toLocaleString()}</p>
                          ) : null}
                          {ticketLayout.showTicketNumber ? <p>Ticket: TK-000123</p> : null}
                          {ticketLayout.showAddress && genIdentity.address ? (
                            <p>{genIdentity.address}</p>
                          ) : null}
                          {ticketLayout.showPhone && genIdentity.phone ? (
                            <p>Tel: {genIdentity.phone}</p>
                          ) : null}
                          {ticketLayout.showTaxId && genFiscal.taxId ? (
                            <p>MF: {genFiscal.taxId}</p>
                          ) : null}
                          {ticketLayout.showServer ? <p>Serveur: Ahmed</p> : null}
                          {ticketLayout.showTable ? <p>Table: A3</p> : null}
                          {ticketLayout.showClientName ? <p>Client: Walk-in</p> : null}
                          {ticketLayout.showPaymentMethod ? <p>Paiement: Carte</p> : null}
                          {ticketLayout.showTerminal ? (
                            <p>Terminal: {genStation.terminalId || "T1"}</p>
                          ) : null}
                        </div>
                      </div>
                      <div className="py-3 space-y-1 text-[10px] font-bold text-slate-700 border-b border-dashed border-slate-200">
                        {previewItems.map((row) => (
                          <div key={row.id} className="flex justify-between gap-2">
                            <span>
                              {row.name} x{row.quantity}
                              {ticketLayout.showItemUnitPrice
                                ? ` (${Number(row.price).toFixed(3)} DT)`
                                : ""}
                            </span>
                            <span>{(row.quantity * row.price).toFixed(3)} DT</span>
                          </div>
                        ))}
                      </div>
                      <div className="pt-3 space-y-1 text-[10px] font-black text-slate-800">
                        {ticketLayout.showPriceHt ? (
                          <div className="flex justify-between">
                            <span>Prix HT</span>
                            <span>{previewHt.toFixed(3)} DT</span>
                          </div>
                        ) : null}
                        {ticketLayout.showTicketDiscount ? (
                          <div className="flex justify-between text-amber-600">
                            <span>Remise ticket</span>
                            <span>-{previewDiscount.toFixed(3)} DT</span>
                          </div>
                        ) : null}
                        {ticketLayout.showTva ? (
                          <div className="flex justify-between">
                            <span>TVA</span>
                            <span>{previewTva.toFixed(3)} DT</span>
                          </div>
                        ) : null}
                        {ticketLayout.showTimbre ? (
                          <div className="flex justify-between">
                            <span>Timbre</span>
                            <span>{previewTimbre.toFixed(3)} DT</span>
                          </div>
                        ) : null}
                        {ticketLayout.showPriceTtc ? (
                          <div className="flex justify-between text-indigo-700">
                            <span>Prix TTC</span>
                            <span>{previewTtc.toFixed(3)} DT</span>
                          </div>
                        ) : null}
                      </div>
                      {ticketLayout.showQrCode ? (
                        <div className="mt-3 text-center">
                          <img
                            src={`https://quickchart.io/qr?text=${encodeURIComponent("TK-000123|TOTAL:" + previewTtc.toFixed(3))}&size=90`}
                            alt="QR Ticket"
                            className="w-[90px] h-[90px] mx-auto border border-slate-200 rounded"
                          />
                        </div>
                      ) : null}
                      {ticketLayout.showFiscalQrCode ? (
                        <div className="mt-3 text-center">
                          <img
                            src={`https://quickchart.io/qr?text=${encodeURIComponent("MF:" + (genFiscal.taxId || "N/A") + "|TTC:" + previewTtc.toFixed(3))}&size=90`}
                            alt="QR Fiscal"
                            className="w-[90px] h-[90px] mx-auto border border-slate-200 rounded"
                          />
                        </div>
                      ) : null}
                      {ticketLayout.footerText ? (
                        <p className="text-[10px] text-center text-slate-500 font-bold mt-3">
                          {ticketLayout.footerText}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </GeneralSettingsSection>

              <GeneralSettingsSection
                title="Designer gratuit v1 (HTML)"
                description="Crée tes designs client/cuisine/bar sans licence. Les placeholders {{...}} sont remplacés à l’impression."
                headerBadge={
                  <div className="flex items-center gap-2 flex-wrap">
                    {(["client", "kitchen", "bar"] as const).map((kind) => {
                      const labels: Record<string, string> = { client: "Client", kitchen: "Cuisine", bar: "Bar" };
                      const isDesigner = ((settings as any)?.printTemplateSource?.[kind]) === "DESIGNER";
                      return (
                        <span key={kind} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${isDesigner ? "bg-indigo-100 text-indigo-700 border border-indigo-200" : "bg-slate-100 text-slate-500 border border-slate-200"}`}>
                          <span className="w-1.5 h-1.5 rounded-full inline-block bg-current" />
                          {labels[kind]}: {isDesigner ? "Designer" : "Modèle"}
                        </span>
                      );
                    })}
                  </div>
                }
                onSave={() =>
                  updateSettings({
                    designerPrintTemplates: {
                      clientHtml: String(designerTemplates.clientHtml || ""),
                      kitchenHtml: String(designerTemplates.kitchenHtml || ""),
                      barHtml: String(designerTemplates.barHtml || ""),
                    },
                  } as any)
                }
                onReset={() => {
                  const d = ((settings as any).designerPrintTemplates || {}) as any;
                  setDesignerTemplates({
                    clientHtml: String(d?.clientHtml || ""),
                    kitchenHtml: String(d?.kitchenHtml || ""),
                    barHtml: String(d?.barHtml || ""),
                  });
                  const s = ((settings as any).printTemplateSource || {}) as any;
                  setPrintTemplateSource({
                    client:  (String(s?.client  || "").toUpperCase() === "DESIGNER" ? "DESIGNER" : "BUILTIN") as "BUILTIN" | "DESIGNER",
                    kitchen: (String(s?.kitchen || "").toUpperCase() === "DESIGNER" ? "DESIGNER" : "BUILTIN") as "BUILTIN" | "DESIGNER",
                    bar:     (String(s?.bar     || "").toUpperCase() === "DESIGNER" ? "DESIGNER" : "BUILTIN") as "BUILTIN" | "DESIGNER",
                  });
                }}
              >
                <div className="space-y-4">
                  <p className="text-[10px] font-black text-slate-600 uppercase">
                    Placeholders utiles: {"{{restaurantName}}"} {"{{ticketCode}}"} {"{{itemsLines}}"} {"{{total}}"} {"{{currency}}"}
                  </p>
                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-black uppercase text-slate-600">
                          Client HTML
                        </p>
                        <button
                          type="button"
                          onClick={() => setDesignerModalKind("client")}
                          className="px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-black uppercase"
                        >
                          Designer
                        </button>
                      </div>
                      <textarea
                        value={designerTemplates.clientHtml}
                        onChange={(e) =>
                          setDesignerTemplates((p) => ({ ...p, clientHtml: e.target.value }))
                        }
                        rows={12}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono"
                        placeholder="<html>...{{ticketCode}}...</html>"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-black uppercase text-slate-600">
                          Cuisine HTML
                        </p>
                        <button
                          type="button"
                          onClick={() => setDesignerModalKind("kitchen")}
                          className="px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-black uppercase"
                        >
                          Designer
                        </button>
                      </div>
                      <textarea
                        value={designerTemplates.kitchenHtml}
                        onChange={(e) =>
                          setDesignerTemplates((p) => ({ ...p, kitchenHtml: e.target.value }))
                        }
                        rows={12}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono"
                        placeholder="<html>...{{title}}...</html>"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-black uppercase text-slate-600">
                          Bar HTML
                        </p>
                        <button
                          type="button"
                          onClick={() => setDesignerModalKind("bar")}
                          className="px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-black uppercase"
                        >
                          Designer
                        </button>
                      </div>
                      <textarea
                        value={designerTemplates.barHtml}
                        onChange={(e) =>
                          setDesignerTemplates((p) => ({ ...p, barHtml: e.target.value }))
                        }
                        rows={12}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono"
                        placeholder="<html>...{{title}}...</html>"
                      />
                    </div>
                  </div>
                </div>
              </GeneralSettingsSection>

              <GeneralSettingsSection
                title="Impression production (cuisine / bar)"
                description="Workflow unifié : choisis la cible (Cuisine/Bar), règle le modèle, puis teste l’impression."
                headerBadge={
                  <div className="flex items-center gap-2">
                    {(["kitchen", "bar"] as const).map((kind) => {
                      const labels: Record<string, string> = { kitchen: "Cuisine", bar: "Bar" };
                      const isDesigner = ((settings as any)?.printTemplateSource?.[kind]) === "DESIGNER";
                      return (
                        <span key={kind} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${isDesigner ? "bg-indigo-100 text-indigo-700 border border-indigo-200" : "bg-emerald-100 text-emerald-700 border border-emerald-200"}`}>
                          <span className="w-1.5 h-1.5 rounded-full inline-block bg-current" />
                          {labels[kind]}: {isDesigner ? "Designer" : "Modèle"}
                        </span>
                      );
                    })}
                  </div>
                }
                onSave={() =>
                  updateSettings({
                    kitchenBarPrintTemplates: JSON.parse(
                      JSON.stringify(genKitchen.kitchenBarPrintTemplates || {}),
                    ) as any,
                    paymentSoundEnabled: genKitchen.paymentSoundEnabled,
                  } as any)
                }
                onReset={() =>
                  setGenKitchen({
                    kitchenBarPrintTemplates: JSON.parse(
                      JSON.stringify(settings.kitchenBarPrintTemplates || {}),
                    ),
                    paymentSoundEnabled: Boolean(settings.paymentSoundEnabled),
                  })
                }
              >
                <div className="space-y-4">
                  <p className="text-[10px] font-black text-slate-600 uppercase">
                    Modèle impression production (Cuisine / Bar)
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-2">
                    <button
                      type="button"
                      onClick={handleDownloadExternalKitchenTemplateSample}
                      className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-sky-50 text-sky-700 border border-sky-100 text-[10px] font-black uppercase tracking-wider hover:bg-sky-100"
                    >
                      <Download size={12} />
                      Modèle C: Cuisine
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadExternalKitchenHtmlTemplateSample}
                      className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-100 text-[10px] font-black uppercase tracking-wider hover:bg-blue-100"
                    >
                      <Download size={12} />
                      HTML Cuisine
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleTemplatePreviewOrDownload("kitchen", "pdf", "download")
                      }
                      className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-violet-50 text-violet-700 border border-violet-100 text-[10px] font-black uppercase tracking-wider hover:bg-violet-100"
                    >
                      <Download size={12} />
                      PDF Cuisine
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleTemplatePreviewOrDownload("kitchen", "pdf", "preview")
                      }
                      className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-100 text-[10px] font-black uppercase tracking-wider hover:bg-fuchsia-100"
                    >
                      <FileText size={12} />
                      Aperçu Cuisine
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadExternalBarTemplateSample}
                      className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-cyan-50 text-cyan-700 border border-cyan-100 text-[10px] font-black uppercase tracking-wider hover:bg-cyan-100"
                    >
                      <Download size={12} />
                      Modèle C: Bar
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadExternalBarHtmlTemplateSample}
                      className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-100 text-[10px] font-black uppercase tracking-wider hover:bg-blue-100"
                    >
                      <Download size={12} />
                      HTML Bar
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleTemplatePreviewOrDownload("bar", "pdf", "download")
                      }
                      className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-violet-50 text-violet-700 border border-violet-100 text-[10px] font-black uppercase tracking-wider hover:bg-violet-100"
                    >
                      <Download size={12} />
                      PDF Bar
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleTemplatePreviewOrDownload("bar", "pdf", "preview")
                      }
                      className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-100 text-[10px] font-black uppercase tracking-wider hover:bg-fuchsia-100"
                    >
                      <FileText size={12} />
                      Aperçu Bar
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-slate-200 p-3 space-y-3 md:col-span-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1 bg-slate-100 rounded-full p-0.5">
                          <button
                            type="button"
                            onClick={() => setProductionEditorKind("kitchen")}
                            className={`px-3 py-1 rounded-full text-[10px] font-black uppercase transition-all ${
                              productionEditorKind === "kitchen"
                                ? "bg-indigo-600 text-white shadow"
                                : "text-slate-500 hover:text-slate-700"
                            }`}
                          >
                            Cuisine
                          </button>
                          <button
                            type="button"
                            onClick={() => setProductionEditorKind("bar")}
                            className={`px-3 py-1 rounded-full text-[10px] font-black uppercase transition-all ${
                              productionEditorKind === "bar"
                                ? "bg-indigo-600 text-white shadow"
                                : "text-slate-500 hover:text-slate-700"
                            }`}
                          >
                            Bar
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            duplicateProductionTemplate(
                              productionEditorKind,
                              productionEditorKind === "kitchen"
                                ? "bar"
                                : "kitchen",
                            )
                          }
                          className="px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase"
                        >
                          Copier vers{" "}
                          {productionEditorKind === "kitchen"
                            ? "Bar"
                            : "Cuisine"}
                        </button>
                      </div>
                      <input
                        type="text"
                        value={activeProductionTpl.title}
                        onChange={(e) =>
                          updateProductionTemplate(productionEditorKind, {
                            title: e.target.value,
                          })
                        }
                        placeholder={
                          productionEditorKind === "kitchen"
                            ? "Titre bon cuisine"
                            : "Titre bon bar"
                        }
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold"
                      />
                      <textarea
                        value={activeProductionTpl.footerText}
                        onChange={(e) =>
                          updateProductionTemplate(productionEditorKind, {
                            footerText: e.target.value,
                          })
                        }
                        placeholder="Pied bon (optionnel)"
                        rows={2}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold resize-none"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[
                      ["showOrderRef", "Afficher référence commande"],
                      ["showTime", "Afficher heure"],
                      ["showTable", "Afficher table"],
                      ["showServer", "Afficher serveur"],
                      ["showItemQty", "Afficher quantité"],
                      ["showItemNotes", "Afficher notes article"],
                    ].map(([key, label]) => (
                      <div
                        key={key}
                        className="rounded-xl border border-slate-200 p-2 text-[10px] font-black uppercase text-slate-600"
                      >
                        <div className="flex items-center justify-between bg-slate-50 rounded-lg px-2 py-1.5">
                          <span>
                            {productionEditorKind === "kitchen"
                              ? "Cuisine"
                              : "Bar"}
                            : {label}
                          </span>
                          <input
                            type="checkbox"
                            checked={Boolean((activeProductionTpl as any)[key])}
                            onChange={(e) =>
                              updateProductionTemplate(productionEditorKind, {
                                [key]: e.target.checked,
                              })
                            }
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-slate-200 p-3 bg-slate-50">
                      <p className="text-[10px] font-black text-slate-600 uppercase mb-2">
                        Aperçu live bon cuisine
                      </p>
                      <div className="bg-white border border-slate-200 rounded-lg p-3 text-[10px] font-bold text-slate-700">
                        <p className="text-center font-black text-slate-900">
                          {kitchenTpl.title || "BON CUISINE"}
                        </p>
                        <div className="mt-2 space-y-0.5 text-slate-500">
                          {kitchenTpl.showOrderRef ? <p>Commande #A1B2C3</p> : null}
                          {kitchenTpl.showTime ? (
                            <p>{new Date().toLocaleString()}</p>
                          ) : null}
                          {kitchenTpl.showTable ? <p>Table: A3</p> : null}
                          {kitchenTpl.showServer ? <p>Serveur: Ahmed</p> : null}
                        </div>
                        <div className="my-2 border-t border-dashed border-slate-200" />
                        <div className="space-y-1">
                          <p>
                            - Pizza Margherita
                            {kitchenTpl.showItemQty ? " x1" : ""}
                            {kitchenTpl.showItemNotes ? " (Sans oignon)" : ""}
                          </p>
                          <p>
                            - Pasta Arrabiata
                            {kitchenTpl.showItemQty ? " x2" : ""}
                            {kitchenTpl.showItemNotes ? " (Très épicé)" : ""}
                          </p>
                        </div>
                        {kitchenTpl.footerText ? (
                          <>
                            <div className="my-2 border-t border-dashed border-slate-200" />
                            <p className="text-center text-slate-500">
                              {kitchenTpl.footerText}
                            </p>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 p-3 bg-slate-50">
                      <p className="text-[10px] font-black text-slate-600 uppercase mb-2">
                        Aperçu live bon bar
                      </p>
                      <div className="bg-white border border-slate-200 rounded-lg p-3 text-[10px] font-bold text-slate-700">
                        <p className="text-center font-black text-slate-900">
                          {barTpl.title || "BON BAR"}
                        </p>
                        <div className="mt-2 space-y-0.5 text-slate-500">
                          {barTpl.showOrderRef ? <p>Commande #A1B2C3</p> : null}
                          {barTpl.showTime ? <p>{new Date().toLocaleString()}</p> : null}
                          {barTpl.showTable ? <p>Table: A3</p> : null}
                          {barTpl.showServer ? <p>Serveur: Ahmed</p> : null}
                        </div>
                        <div className="my-2 border-t border-dashed border-slate-200" />
                        <div className="space-y-1">
                          <p>
                            - Mojito
                            {barTpl.showItemQty ? " x2" : ""}
                            {barTpl.showItemNotes ? " (Sans glace)" : ""}
                          </p>
                          <p>
                            - Espresso
                            {barTpl.showItemQty ? " x1" : ""}
                            {barTpl.showItemNotes ? " (Serré)" : ""}
                          </p>
                        </div>
                        {barTpl.footerText ? (
                          <>
                            <div className="my-2 border-t border-dashed border-slate-200" />
                            <p className="text-center text-slate-500">
                              {barTpl.footerText}
                            </p>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handlePrintKitchenBarTest("KITCHEN")}
                      className="px-3 py-2 rounded-xl bg-amber-50 text-amber-700 border border-amber-100 text-[10px] font-black uppercase tracking-wider hover:bg-amber-100"
                    >
                      Imprimer test cuisine
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePrintKitchenBarTest("BAR")}
                      className="px-3 py-2 rounded-xl bg-cyan-50 text-cyan-700 border border-cyan-100 text-[10px] font-black uppercase tracking-wider hover:bg-cyan-100"
                    >
                      Imprimer test bar
                    </button>
                  </div>
                  <div className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
                    <span className="text-[10px] font-black text-slate-600 uppercase flex items-center gap-2">
                      <Bell size={12} className="text-amber-500" /> Son demande
                      addition client
                    </span>
                    <input
                      type="checkbox"
                      checked={genKitchen.paymentSoundEnabled}
                      onChange={(e) =>
                        setGenKitchen((g) => ({
                          ...g,
                          paymentSoundEnabled: e.target.checked,
                        }))
                      }
                    />
                  </div>
                </div>
              </GeneralSettingsSection>
            </div>
          </div>
        )}
        {activeTab === "adminLogs" && (
          <div className="w-full bg-white p-4 sm:p-10 rounded-[1.5rem] sm:rounded-[3rem] shadow-sm border border-slate-100 space-y-5 sm:space-y-8">
            <h3 className="text-2xl font-black text-slate-800 flex items-center gap-3">
              <FileText className="text-indigo-600 shrink-0" />
              Journal administrateur
            </h3>
            {currentUser?.role !== Role.ADMIN ? (
              <p className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm font-bold text-amber-800">
                Cette section est réservée aux utilisateurs administrateurs.
              </p>
            ) : (
              <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="mt-1 text-xs font-medium text-slate-500 leading-relaxed max-w-2xl">
                      Utilisez l&apos;onglet <strong>Lecture simple</strong> pour des phrases en français ;
                      l&apos;onglet <strong>Données techniques</strong> affiche le JSON brut (pour le
                      support / développement). Chaque action est enregistrée avec l&apos;utilisateur et
                      la date. Fichiers sur le serveur :{" "}
                      <code className="text-[10px] bg-slate-100 rounded px-1">
                        data/audit-logs/app-admin/AAAA-MM-JJ/HH-mm/events.jsonl
                      </code>
                      . À chaque <strong>clôture de caisse</strong>, une sauvegarde
                      JSON est aussi créée sous{" "}
                      <code className="text-[10px] bg-slate-100 rounded px-1">
                        data/audit-logs/cash-closing/AAAA-MM-JJ/HH-mm-ss_×/closing.json
                      </code>
                      .
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!currentUser) return;
                      void (async () => {
                        try {
                          const r = await fetch(
                            `${SETTINGS_LOG_API_BASE}/pos/admin/logs?userId=${encodeURIComponent(currentUser.id)}`,
                          );
                          const j = (await r.json().catch(() => ({}))) as {
                            days?: string[];
                            error?: string;
                          };
                          if (!r.ok)
                            throw new Error(j.error || "Erreur chargement");
                          const days = Array.isArray(j.days) ? j.days : [];
                          setAdminLogDays(days);
                          setAdminLogDate((prev) =>
                            prev && days.includes(prev)
                              ? prev
                              : days[0] || "",
                          );
                          notifySuccess("Journal actualisé.");
                        } catch (e: unknown) {
                          notifyError(
                            e instanceof Error
                              ? e.message
                              : "Rafraîchissement impossible.",
                          );
                        }
                      })();
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-700"
                  >
                    Rafraîchir
                  </button>
                  <button
                    type="button"
                    disabled={adminIntegrityReportBusy || !currentUser}
                    onClick={() => {
                      if (!currentUser) return;
                      setAdminIntegrityReportBusy(true);
                      void (async () => {
                        try {
                          const r = await fetch(
                            `${SETTINGS_LOG_API_BASE}/pos/admin/logs/integrity-report?userId=${encodeURIComponent(currentUser.id)}&kind=app-admin`,
                          );
                          const j = (await r.json().catch(() => ({}))) as {
                            error?: string;
                            ok?: boolean;
                            kind?: string;
                            totalDays?: number;
                            totalEntries?: number;
                            signedEntries?: number;
                            missingProofEntries?: number;
                            brokenEntries?: number;
                            days?: Array<{
                              dateKey?: string;
                              ok?: boolean;
                              totalEntries?: number;
                              signedEntries?: number;
                              missingProofEntries?: number;
                              brokenEntries?: number;
                            }>;
                          };
                          if (!r.ok) throw new Error(j.error || "Erreur vérification intégrité");
                          setAdminIntegrityReport({
                            ok: Boolean(j.ok),
                            kind: String(j.kind || "app-admin"),
                            totalDays: Number(j.totalDays || 0),
                            totalEntries: Number(j.totalEntries || 0),
                            signedEntries: Number(j.signedEntries || 0),
                            missingProofEntries: Number(j.missingProofEntries || 0),
                            brokenEntries: Number(j.brokenEntries || 0),
                            days: Array.isArray(j.days)
                              ? j.days.map((d) => ({
                                  dateKey: String(d.dateKey || ""),
                                  ok: Boolean(d.ok),
                                  totalEntries: Number(d.totalEntries || 0),
                                  signedEntries: Number(d.signedEntries || 0),
                                  missingProofEntries: Number(d.missingProofEntries || 0),
                                  brokenEntries: Number(d.brokenEntries || 0),
                                }))
                              : [],
                          });
                          notifySuccess("Rapport d'intégrité généré.");
                        } catch (e: unknown) {
                          notifyError(e instanceof Error ? e.message : "Vérification impossible.");
                        } finally {
                          setAdminIntegrityReportBusy(false);
                        }
                      })();
                    }}
                    className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                  >
                    Vérifier intégrité complète
                  </button>
                </div>
                <div className="flex flex-wrap gap-3 items-center">
                  <label className="text-[10px] font-black uppercase text-slate-500">
                    Jour
                  </label>
                  <select
                    value={adminLogDate}
                    onChange={(e) => setAdminLogDate(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-bold min-w-[9rem]"
                  >
                    {adminLogDays.length === 0 ? (
                      <option value="">—</option>
                    ) : (
                      adminLogDays.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input
                    value={adminLogSearch}
                    onChange={(e) => setAdminLogSearch(e.target.value)}
                    placeholder="Recherche: utilisateur, commande, article..."
                    className="md:col-span-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-bold"
                  />
                  <select
                    value={adminLogActionFilter}
                    onChange={(e) => setAdminLogActionFilter(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-bold"
                  >
                    <option value="all">Toutes les actions</option>
                    <option value="insert">Ajouts</option>
                    <option value="update">Modifications</option>
                    <option value="delete">Suppressions</option>
                    <option value="confirm">Confirmations</option>
                    <option value="cancel">Annulations</option>
                  </select>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px] font-black">
                  <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Ajouts: {adminLogStats.insert}</span>
                  <span className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">Modifs: {adminLogStats.update}</span>
                  <span className="px-3 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200">Suppressions: {adminLogStats.delete}</span>
                  <span className="px-3 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-200">Confirmations: {adminLogStats.confirm}</span>
                  <span className="px-3 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">Annulations: {adminLogStats.cancel}</span>
                </div>
                {adminLogIntegrity ? (
                  <div
                    className={`rounded-xl border px-4 py-3 text-xs font-bold ${
                      adminLogIntegrity.ok
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-rose-200 bg-rose-50 text-rose-800"
                    }`}
                  >
                    <div>
                      Intégrité du journal:{" "}
                      {adminLogIntegrity.ok ? "OK (chaîne intacte)" : "ALERTE (chaîne altérée/incomplète)"}
                    </div>
                    <div className="mt-1 text-[11px]">
                      entrées: {adminLogIntegrity.totalEntries} | signées:{" "}
                      {adminLogIntegrity.signedEntries} | sans preuve:{" "}
                      {adminLogIntegrity.missingProofEntries} | cassées:{" "}
                      {adminLogIntegrity.brokenEntries}
                    </div>
                  </div>
                ) : null}
                {adminIntegrityReport ? (
                  <div
                    className={`rounded-xl border px-4 py-3 text-xs font-bold ${
                      adminIntegrityReport.ok
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-rose-200 bg-rose-50 text-rose-800"
                    }`}
                  >
                    <div>
                      Rapport global ({adminIntegrityReport.kind}):{" "}
                      {adminIntegrityReport.ok ? "OK" : "ALERTE"}
                    </div>
                    <div className="mt-1 text-[11px]">
                      jours: {adminIntegrityReport.totalDays} | entrées:{" "}
                      {adminIntegrityReport.totalEntries} | signées:{" "}
                      {adminIntegrityReport.signedEntries} | sans preuve:{" "}
                      {adminIntegrityReport.missingProofEntries} | cassées:{" "}
                      {adminIntegrityReport.brokenEntries}
                    </div>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {adminLogViewTab === "simple" ? (
                    <>
                      <button
                        type="button"
                        onClick={exportSimplePdfNative}
                        className="px-4 py-2 rounded-xl bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest"
                      >
                        Export PDF natif
                      </button>
                      <button
                        type="button"
                        onClick={exportSimpleCsv}
                        className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest"
                      >
                        Export Excel (CSV)
                      </button>
                      <button
                        type="button"
                        onClick={exportBundleZip}
                        className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest"
                      >
                        Export ZIP complet
                      </button>
                      <button
                        type="button"
                        disabled={!adminLogDate || !currentUser}
                        onClick={() => {
                          if (!currentUser || !adminLogDate) return;
                          void (async () => {
                            try {
                              const r = await fetch(
                                `${SETTINGS_LOG_API_BASE}/pos/admin/logs/day-proof?userId=${encodeURIComponent(currentUser.id)}&kind=app-admin&date=${encodeURIComponent(adminLogDate)}`,
                              );
                              const j = await r.json().catch(() => ({}));
                              if (!r.ok) throw new Error(String((j as any)?.error || "Export preuve impossible"));
                              const blob = new Blob([JSON.stringify(j, null, 2)], {
                                type: "application/json;charset=utf-8;",
                              });
                              downloadBlob(blob, `preuve-audit-signee-${adminLogDate}.json`);
                              notifySuccess("Preuve audit signée exportée.");
                            } catch (e: unknown) {
                              notifyError(e instanceof Error ? e.message : "Export preuve impossible.");
                            }
                          })();
                        }}
                        className="px-4 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                      >
                        Export preuve audit signée
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={exportTechnicalJson}
                        className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest"
                      >
                        Export JSON technique
                      </button>
                      <button
                        type="button"
                        onClick={exportBundleZip}
                        className="px-4 py-2 rounded-xl bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest"
                      >
                        Export ZIP complet
                      </button>
                      <button
                        type="button"
                        disabled={!adminLogDate || !currentUser}
                        onClick={() => {
                          if (!currentUser || !adminLogDate) return;
                          void (async () => {
                            try {
                              const r = await fetch(
                                `${SETTINGS_LOG_API_BASE}/pos/admin/logs/day-proof?userId=${encodeURIComponent(currentUser.id)}&kind=app-admin&date=${encodeURIComponent(adminLogDate)}`,
                              );
                              const j = await r.json().catch(() => ({}));
                              if (!r.ok) throw new Error(String((j as any)?.error || "Export preuve impossible"));
                              const blob = new Blob([JSON.stringify(j, null, 2)], {
                                type: "application/json;charset=utf-8;",
                              });
                              downloadBlob(blob, `preuve-audit-signee-${adminLogDate}.json`);
                              notifySuccess("Preuve audit signée exportée.");
                            } catch (e: unknown) {
                              notifyError(e instanceof Error ? e.message : "Export preuve impossible.");
                            }
                          })();
                        }}
                        className="px-4 py-2 rounded-xl bg-indigo-700 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                      >
                        Export preuve audit signée
                      </button>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 p-1 bg-slate-50 w-full sm:w-max">
                  <button
                    type="button"
                    onClick={() => setAdminLogViewTab("simple")}
                    className={`flex-1 sm:flex-none px-4 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                      adminLogViewTab === "simple"
                        ? "bg-indigo-600 text-white shadow-md"
                        : "text-slate-600 hover:bg-white"
                    }`}
                  >
                    Lecture simple
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminLogViewTab("technical")}
                    className={`flex-1 sm:flex-none px-4 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                      adminLogViewTab === "technical"
                        ? "bg-slate-800 text-white shadow-md"
                        : "text-slate-600 hover:bg-white"
                    }`}
                  >
                    Données techniques (JSON)
                  </button>
                </div>
                {adminLogViewTab === "simple" ? (
                  <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-4 space-y-4 shadow-inner">
                    {adminLogFiltered.length === 0 ? (
                      <p className="text-sm font-bold text-slate-500">
                        — Aucune entrée pour ce jour —
                      </p>
                    ) : (
                      adminLogFiltered.map((entry) => (
                        <p
                          key={`${adminLogDate}-${entry.idx}`}
                          className="text-sm font-medium text-slate-800 leading-relaxed border-b border-slate-100 pb-3 last:border-b-0 last:pb-0"
                        >
                          {entry.sentence}
                        </p>
                      ))
                    )}
                  </div>
                ) : (
                  <pre className="max-h-64 overflow-auto rounded-xl bg-slate-900 text-emerald-100 text-[11px] p-4 font-mono whitespace-pre-wrap border border-slate-800">
                    {JSON.stringify(
                      adminLogFiltered.map((r) => r.raw),
                      null,
                      2,
                    ) ||
                      "— Aucune entrée pour ce jour —"}
                  </pre>
                )}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-500">
                    Ajouter une note
                  </label>
                  <textarea
                    value={adminLogNote}
                    onChange={(e) => setAdminLogNote(e.target.value)}
                    rows={2}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold"
                    placeholder="Annotation interne…"
                  />
                  <button
                    type="button"
                    disabled={adminLogBusy || !adminLogNote.trim()}
                    onClick={() => {
                      if (!currentUser || !adminLogNote.trim()) return;
                      setAdminLogBusy(true);
                      void (async () => {
                        try {
                          const r = await fetch(
                            `${SETTINGS_LOG_API_BASE}/pos/admin/logs`,
                            {
                              method: "POST",
                              headers: {
                                "Content-Type": "application/json",
                              },
                              body: JSON.stringify({
                                userId: currentUser.id,
                                message: adminLogNote.trim(),
                              }),
                            },
                          );
                          const j = (await r.json().catch(() => ({}))) as {
                            error?: string;
                          };
                          if (!r.ok)
                            throw new Error(j.error || "Échec enregistrement");
                          setAdminLogNote("");
                          notifySuccess("Note enregistrée dans le journal.");
                          const day =
                            adminLogDate ||
                            new Date().toISOString().slice(0, 10);
                          if (!adminLogDate && day) setAdminLogDate(day);
                          const r2 = await fetch(
                            `${SETTINGS_LOG_API_BASE}/pos/admin/logs?userId=${encodeURIComponent(currentUser.id)}&date=${encodeURIComponent(day)}`,
                          );
                          const j2 = (await r2.json().catch(() => ({}))) as {
                            content?: string;
                            integrity?: {
                              ok?: boolean;
                              totalEntries?: number;
                              signedEntries?: number;
                              missingProofEntries?: number;
                              brokenEntries?: number;
                            };
                          };
                          if (r2.ok)
                            setAdminLogContent(
                              typeof j2.content === "string"
                                ? j2.content
                                : "",
                            );
                          if (r2.ok) {
                            setAdminLogIntegrity(
                              j2.integrity
                                ? {
                                    ok: Boolean(j2.integrity.ok),
                                    totalEntries: Number(j2.integrity.totalEntries || 0),
                                    signedEntries: Number(j2.integrity.signedEntries || 0),
                                    missingProofEntries: Number(j2.integrity.missingProofEntries || 0),
                                    brokenEntries: Number(j2.integrity.brokenEntries || 0),
                                  }
                                : null,
                            );
                          }
                        } catch (e: unknown) {
                          notifyError(
                            e instanceof Error ? e.message : "Échec.",
                          );
                        } finally {
                          setAdminLogBusy(false);
                        }
                      })();
                    }}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                  >
                    Enregistrer la note
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "users" && (
          <div className="space-y-6">
            <div className="bg-indigo-50/80 border border-indigo-100 rounded-2xl px-5 py-4 text-xs text-indigo-900 font-bold leading-relaxed">
              <span className="font-black uppercase tracking-widest text-[10px] text-indigo-700 block mb-1">
                Rôles, claims et caisse
              </span>
              Le{" "}
              <strong>rôle</strong> définit les écrans accessibles par défaut (barre
              latérale). Les <strong>claims</strong> ajoutent un accès ciblé à un
              menu sans changer le rôle (ex. ouvrir « Rapports » pour un serveur).
              Le droit <strong>caisse</strong> précise si l’utilisateur peut ouvrir
              / clôturer une caisse en plus des règles par rôle.
            </div>
            <div className="flex justify-between items-center bg-white p-6 rounded-3xl border border-slate-100">
              <div>
                <h3 className="text-xl font-black text-slate-800">Équipe</h3>
                <p className="text-xs text-slate-400">
                  Utilisateurs, rôles, claims et droits caisse
                </p>
              </div>
              <button
                onClick={() => setShowAddUserModal(true)}
                className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black text-sm flex items-center gap-2"
              >
                <UserPlus size={18} /> Ajouter
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {allUsers.map((user) => (
                <div
                  key={user.id}
                  className="bg-white p-8 rounded-[3rem] border border-slate-100 flex flex-col group transition-all hover:shadow-xl"
                >
                  <div className="flex justify-between items-start mb-6">
                    <div
                      className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-lg ${getRoleColor(user.role)}`}
                    >
                      {getRoleIcon(user.role)}
                    </div>
                    <span
                      className={`text-[9px] font-black text-white px-3 py-1 rounded-full uppercase ${getRoleColor(user.role)}`}
                    >
                      {user.role}
                    </span>
                  </div>
                  <h4 className="text-lg font-black text-slate-800">
                    {user.name}
                  </h4>
                  <p className="text-xs font-bold text-slate-400 mt-1 flex items-center gap-2">
                    <Key size={12} /> PIN: {user.pin}
                  </p>
                  <p className="text-[10px] font-bold text-slate-500 mt-2">
                    Claims menu :{" "}
                    <span className="text-indigo-600">
                      {(user.claims || []).length}
                    </span>{" "}
                    · Caisse :{" "}
                    <span className="text-slate-700">
                      {getFundPermissionLabel(user.canManageFund)}
                    </span>
                  </p>
                  <p className="text-[10px] font-bold text-slate-500 mt-1">
                    Dépôts :{" "}
                    <span className="text-slate-700">
                      {(user.assignedWarehouseIds || []).length}
                    </span>{" "}
                    · Vente :{" "}
                    <span className="text-slate-700">
                      {user.salesWarehouseId ? "Oui" : "Non"}
                    </span>
                  </p>
                  <div className="mt-6 pt-6 border-t border-slate-50 flex gap-2">
                    <button
                      onClick={() => openEditUserModal(user)}
                      className="flex-1 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all flex items-center justify-center gap-2"
                    >
                      <Pencil size={12} /> Modifier
                    </button>
                    {isRestrictedRole(user.role) && (
                      <button
                        onClick={() => setShowAssignmentModal(user)}
                        className="flex-1 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all"
                      >
                        Affecter Zone
                      </button>
                    )}
                    <button
                      onClick={() => deleteUser(user.id)}
                      className="p-2 rounded-xl bg-rose-50 text-rose-300 hover:text-rose-600"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {showAddUserModal && (
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[150] flex items-center justify-center p-2 sm:p-6">
                <div className="bg-white w-[98vw] sm:w-full max-w-4xl rounded-[2rem] sm:rounded-[3rem] p-4 sm:p-8 lg:p-10 shadow-2xl space-y-6 max-h-[95vh] overflow-y-auto scrollbar-hide">
                  <h3 className="text-2xl font-black text-slate-800 text-center">
                    Nouvel Utilisateur
                  </h3>
                  <div className="flex bg-slate-100 p-1 rounded-2xl">
                    <button
                      onClick={() => setAddUserModalTab("info")}
                      className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${addUserModalTab === "info" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                    >
                      Informations
                    </button>
                    <button
                      onClick={() => setAddUserModalTab("claims")}
                      className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${addUserModalTab === "claims" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                    >
                      Claims
                    </button>
                  </div>
                  <div className="space-y-4">
                    {addUserModalTab === "info" && (
                      <>
                        <input
                          type="text"
                          placeholder="Nom Complet"
                          value={newUserName}
                          onChange={(e) => setNewUserName(e.target.value)}
                          className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold outline-none"
                        />
                        <select
                          value={newUserRole}
                          onChange={(e) => setNewUserRole(e.target.value as Role)}
                          className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold outline-none appearance-none bg-white border border-slate-100"
                        >
                          <option value={Role.SERVER}>Serveur</option>
                          <option value={Role.CASHIER}>Caissier</option>
                          <option value={Role.BARTENDER}>Barman</option>
                          <option value={Role.CHEF}>Chef</option>
                          <option value={Role.MANAGER}>Manager</option>
                          <option value={Role.STOCK_MANAGER}>
                            Gestionnaire stock
                          </option>
                          <option value={Role.ADMIN}>Admin</option>
                        </select>
                        <input
                          type="password"
                          maxLength={4}
                          placeholder="PIN (4 chiffres)"
                          value={newUserPin}
                          onChange={(e) =>
                            setNewUserPin(e.target.value.replace(/\D/g, ""))
                          }
                          className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-black text-center text-xl tracking-[1em]"
                        />
                        <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 space-y-3">
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                            Dépôts affectés
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {warehouses.map((w) => (
                              <label
                                key={w.id}
                                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2"
                              >
                                <input
                                  type="checkbox"
                                  checked={newUserWarehouseIds.includes(w.id)}
                                  onChange={() => toggleNewUserWarehouse(w.id)}
                                  className="h-5 w-5 rounded border-slate-300 accent-indigo-600"
                                />
                                <span className="text-xs font-bold text-slate-700">
                                  {w.code} - {w.name}
                                </span>
                              </label>
                            ))}
                          </div>
                          <select
                            value={newUserSalesWarehouseId}
                            onChange={(e) => setNewUserSalesWarehouseId(e.target.value)}
                            className="w-full px-4 py-3 bg-white rounded-xl font-bold outline-none border border-slate-200 text-xs"
                          >
                            <option value="">Dépôt de vente (optionnel)</option>
                            {warehouses
                              .filter((w) => newUserWarehouseIds.includes(w.id))
                              .map((w) => (
                                <option key={w.id} value={w.id}>
                                  {w.code} - {w.name}
                                </option>
                              ))}
                          </select>
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 space-y-2">
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                            Imprimante ticket client
                          </p>
                          <p className="text-[10px] font-bold text-slate-500 leading-snug">
                            Quand cet utilisateur est le serveur de la commande,
                            les reçus (paiement ou prévisualisation) partent sur
                            cette file Windows (ex. imprimante sans fil). Sinon,
                            l’imprimante caisse globale est utilisée.
                          </p>
                          <select
                            value={newUserAssignedPrinterId}
                            onChange={(e) =>
                              setNewUserAssignedPrinterId(e.target.value)
                            }
                            className="w-full px-4 py-3 bg-white rounded-xl font-bold outline-none border border-slate-200 text-xs"
                          >
                            <option value="">
                              Défaut — imprimante caisse (param. Matériel)
                            </option>
                            {(printers || []).map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                                {isReceiptPrinter(p)
                                  ? " · caisse"
                                  : ` · ${p.type}`}
                              </option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}
                    {addUserModalTab === "claims" && (
                      <div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                          Claims (droits supplementaires)
                        </p>
                        <div className="max-h-[65vh] sm:max-h-72 overflow-y-auto space-y-2 pr-1 border border-slate-100 rounded-2xl p-3 bg-slate-50/50">
                          {USER_CLAIM_OPTIONS.map((opt) => (
                            <label
                              key={opt.id}
                              className="flex items-start gap-3 cursor-pointer rounded-xl p-2 hover:bg-white"
                            >
                              <input
                                type="checkbox"
                                checked={newUserClaims.includes(opt.id)}
                                onChange={() => toggleNewUserClaim(opt.id)}
                                className="mt-0.5 h-6 w-6 sm:h-5 sm:w-5 rounded border-slate-300 accent-indigo-600"
                              />
                              <span>
                                <span className="block text-xs font-black text-slate-800">
                                  {opt.label}
                                </span>
                                <span className="block text-[10px] font-bold text-slate-500 leading-snug">
                                  {opt.description}
                                </span>
                                <code className="text-[9px] text-indigo-600 font-bold">
                                  {opt.id}
                                </code>
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handleAddUser}
                    className="w-full bg-indigo-600 text-white font-black py-5 rounded-[2rem]"
                  >
                    Enregistrer
                  </button>
                  <button
                    onClick={() => setShowAddUserModal(false)}
                    className="w-full py-2 text-slate-400 font-bold uppercase text-[10px]"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}

            {showEditUserModal && (
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[150] flex items-center justify-center p-2 sm:p-6 overflow-y-auto">
                <div className="bg-white w-[98vw] sm:w-full max-w-4xl rounded-[2rem] sm:rounded-[3rem] p-4 sm:p-8 lg:p-10 shadow-2xl space-y-5 my-3 sm:my-6 max-h-[95vh] overflow-y-auto scrollbar-hide">
                  <h3 className="text-xl sm:text-2xl font-black text-slate-800 text-center">
                    Modifier utilisateur
                  </h3>
                  <div className="flex bg-slate-100 p-1 rounded-2xl">
                    <button
                      onClick={() => setEditUserModalTab("info")}
                      className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${editUserModalTab === "info" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                    >
                      Informations
                    </button>
                    <button
                      onClick={() => setEditUserModalTab("claims")}
                      className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${editUserModalTab === "claims" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                    >
                      Claims
                    </button>
                  </div>
                  <div className="space-y-4">
                    {editUserModalTab === "info" && (
                      <>
                        <input
                          type="text"
                          placeholder="Nom complet"
                          value={editUserName}
                          onChange={(e) => setEditUserName(e.target.value)}
                          className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold outline-none"
                        />
                        <select
                          value={editUserRole}
                          onChange={(e) =>
                            setEditUserRole(e.target.value as Role)
                          }
                          className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold outline-none appearance-none bg-white border border-slate-100"
                        >
                          <option value={Role.SERVER}>Serveur</option>
                          <option value={Role.CASHIER}>Caissier</option>
                          <option value={Role.BARTENDER}>Barman</option>
                          <option value={Role.CHEF}>Chef</option>
                          <option value={Role.MANAGER}>Manager</option>
                          <option value={Role.STOCK_MANAGER}>
                            Gestionnaire stock
                          </option>
                          <option value={Role.ADMIN}>Admin</option>
                        </select>
                        <div>
                          <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block ml-1">
                            Gestion de caisse (override)
                          </label>
                          <select
                            value={editFundPermission}
                            onChange={(e) =>
                              setEditFundPermission(
                                e.target.value as "default" | "allow" | "deny",
                              )
                            }
                            className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold outline-none appearance-none bg-white border border-slate-100 text-xs"
                          >
                            <option value="default">Par rôle (défaut)</option>
                            <option value="allow">
                              Autoriser ouverture / clôture
                            </option>
                            <option value="deny">Refuser</option>
                          </select>
                        </div>
                        <input
                          type="password"
                          maxLength={4}
                          placeholder="PIN (4 chiffres)"
                          value={editUserPin}
                          onChange={(e) =>
                            setEditUserPin(e.target.value.replace(/\D/g, ""))
                          }
                          className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-black text-center text-xl tracking-[1em]"
                        />
                        <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 space-y-3">
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                            Dépôts affectés
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {warehouses.map((w) => (
                              <label
                                key={w.id}
                                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2"
                              >
                                <input
                                  type="checkbox"
                                  checked={editUserWarehouseIds.includes(w.id)}
                                  onChange={() => toggleEditUserWarehouse(w.id)}
                                  className="h-5 w-5 rounded border-slate-300 accent-indigo-600"
                                />
                                <span className="text-xs font-bold text-slate-700">
                                  {w.code} - {w.name}
                                </span>
                              </label>
                            ))}
                          </div>
                          <select
                            value={editUserSalesWarehouseId}
                            onChange={(e) => setEditUserSalesWarehouseId(e.target.value)}
                            className="w-full px-4 py-3 bg-white rounded-xl font-bold outline-none border border-slate-200 text-xs"
                          >
                            <option value="">Dépôt de vente (optionnel)</option>
                            {warehouses
                              .filter((w) => editUserWarehouseIds.includes(w.id))
                              .map((w) => (
                                <option key={w.id} value={w.id}>
                                  {w.code} - {w.name}
                                </option>
                              ))}
                          </select>
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 space-y-2">
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                            Imprimante ticket client
                          </p>
                          <p className="text-[10px] font-bold text-slate-500 leading-snug">
                            Reçus client imprimés sur cette file lorsque
                            l’utilisateur est serveur sur la commande.
                          </p>
                          <select
                            value={editUserAssignedPrinterId}
                            onChange={(e) =>
                              setEditUserAssignedPrinterId(e.target.value)
                            }
                            className="w-full px-4 py-3 bg-white rounded-xl font-bold outline-none border border-slate-200 text-xs"
                          >
                            <option value="">
                              Défaut — imprimante caisse (param. Matériel)
                            </option>
                            {(printers || []).map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                                {isReceiptPrinter(p)
                                  ? " · caisse"
                                  : ` · ${p.type}`}
                              </option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}
                    {editUserModalTab === "claims" && (
                      <div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                          Claims (accès menu supplémentaire)
                        </p>
                        <div className="max-h-[65vh] sm:max-h-72 overflow-y-auto space-y-2 pr-1 border border-slate-100 rounded-2xl p-3 bg-slate-50/50">
                          {USER_CLAIM_OPTIONS.map((opt) => (
                            <label
                              key={opt.id}
                              className="flex items-start gap-3 cursor-pointer rounded-xl p-2 hover:bg-white"
                            >
                              <input
                                type="checkbox"
                                checked={editUserClaims.includes(opt.id)}
                                onChange={() => toggleEditClaim(opt.id)}
                                className="mt-0.5 h-6 w-6 sm:h-5 sm:w-5 rounded border-slate-300 accent-indigo-600"
                              />
                              <span>
                                <span className="block text-xs font-black text-slate-800">
                                  {opt.label}
                                </span>
                                <span className="block text-[10px] font-bold text-slate-500 leading-snug">
                                  {opt.description}
                                </span>
                                <code className="text-[9px] text-indigo-600 font-bold">
                                  {opt.id}
                                </code>
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handleUpdateUser}
                    className="w-full bg-indigo-600 text-white font-black py-5 rounded-[2rem]"
                  >
                    Mettre à jour
                  </button>
                  <button
                    onClick={() => setShowEditUserModal(null)}
                    className="w-full py-2 text-slate-400 font-bold uppercase text-[10px]"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}

            {showAssignmentModal && (
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[150] flex items-center justify-center p-8">
                <div className="bg-white w-full max-w-md rounded-[3rem] p-10 shadow-2xl space-y-6">
                  <h3 className="text-xl font-black text-slate-800 text-center">
                    Zones : {showAssignmentModal.name}
                  </h3>
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-2 scrollbar-hide">
                    {zones.map((zone) => {
                      const isAssigned =
                        showAssignmentModal.assignedZoneIds?.includes(zone.id);
                      return (
                        <button
                          key={zone.id}
                          onClick={() =>
                            toggleZoneAssignment(showAssignmentModal, zone.id)
                          }
                          className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${isAssigned ? "bg-indigo-600 border-indigo-500 text-white" : "bg-slate-50 border-slate-100"}`}
                        >
                          <span className="font-bold">{zone.name}</span>
                          {isAssigned && <Check size={18} />}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => setShowAssignmentModal(null)}
                    className="w-full bg-slate-900 text-white font-black py-4 rounded-[2rem]"
                  >
                    Fermer
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "warehouses" && (
          <div className="space-y-6">
            <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 space-y-6">
              <div>
                <h3 className="text-2xl font-black text-slate-800">
                  Dépôts
                </h3>
                <p className="text-xs text-slate-400">
                  Gérer les dépôts de stock. Chaque utilisateur peut avoir plusieurs
                  dépôts affectés, avec un seul dépôt de vente.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="text"
                  value={newWarehouseCode}
                  onChange={(e) => setNewWarehouseCode(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-bold text-slate-700"
                  placeholder="Code dépôt (ex: DEP-01)"
                />
                <input
                  type="text"
                  value={newWarehouseName}
                  onChange={(e) => setNewWarehouseName(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-bold text-slate-700"
                  placeholder="Nom dépôt"
                />
                <button
                  onClick={handleCreateWarehouse}
                  className="rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest"
                >
                  Ajouter dépôt
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {warehouses.map((warehouse) => (
                <div
                  key={warehouse.id}
                  className="bg-white border border-slate-100 rounded-2xl p-4 flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-black text-slate-800">
                      {warehouse.code} - {warehouse.name}
                    </p>
                    <p className="text-[10px] font-bold text-slate-500 mt-1">
                      Statut : {warehouse.isActive ? "Actif" : "Inactif"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        handleToggleWarehouseActive(
                          warehouse.id,
                          Boolean(warehouse.isActive),
                        )
                      }
                      className="px-3 py-2 rounded-xl bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-widest"
                    >
                      {warehouse.isActive ? "Désactiver" : "Activer"}
                    </button>
                    <button
                      onClick={() => deleteWarehouse(warehouse.id)}
                      className="p-2 rounded-xl bg-rose-50 text-rose-400 hover:text-rose-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "permissions" && (
          <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 space-y-6">
            <div>
              <h3 className="text-2xl font-black text-slate-800">
                Fonds de caisse
              </h3>
              <p className="text-xs text-slate-400">
                Enregistrez les caisses (nom, devise, terminal). Les droits
                d’ouverture / clôture par personne se règlent dans l’onglet{" "}
                <strong>Utilisateurs</strong>.
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6 space-y-4">
              <h4 className="text-sm font-black text-slate-700">Caisses</h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <input
                  type="text"
                  value={newFundName}
                  onChange={(e) => setNewFundName(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
                  placeholder="Nom caisse"
                />
                <input
                  type="text"
                  value={newFundCurrency}
                  onChange={(e) => setNewFundCurrency(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
                  placeholder="Devise"
                />
                <input
                  type="text"
                  value={newFundTerminalId}
                  onChange={(e) => setNewFundTerminalId(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
                  placeholder="Terminal ID"
                />
                <button
                  onClick={() => {
                    if (!newFundName.trim()) return;
                    addFund({
                      name: newFundName.trim(),
                      currency: newFundCurrency.trim() || "DT",
                      terminalId: newFundTerminalId.trim() || null,
                    });
                    setNewFundName("");
                    setNewFundTerminalId("");
                  }}
                  className="rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest"
                >
                  Ajouter
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {funds.map((fund) => (
                  <div
                    key={fund.id}
                    className="flex items-center justify-between bg-white border border-slate-100 rounded-2xl px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-black text-slate-800">
                        {fund.name}
                      </p>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        {fund.currency}{" "}
                        {fund.terminalId ? `• ${fund.terminalId}` : ""}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteFund(fund.id)}
                      className="text-rose-300 hover:text-rose-600"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "nacef" && (
          <div className="bg-white p-8 rounded-[2rem] border border-slate-100 space-y-6">
            <h3 className="text-xl font-black text-slate-800">
              Intégration NACEF (Sprint 1)
            </h3>
            <p className="text-xs font-bold text-slate-500">
              Panneau de pilotage S-MDF pour tester le cycle: manifest, certificat,
              synchronisation et signature ticket.
            </p>
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-indigo-800">
                  <HelpCircle size={14} />
                  <span className="text-xs font-black">Aide guidée NACEF</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowNacefGuide((v) => !v)}
                  className="px-3 py-1.5 rounded-lg border border-indigo-200 bg-white text-[11px] font-black text-indigo-700"
                >
                  {showNacefGuide ? "Masquer" : "Afficher"}
                </button>
              </div>
              {showNacefGuide && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                    {nacefGuideSteps.map((step, index) => (
                      (() => {
                        const priorStepsDone =
                          index === 0 ||
                          nacefGuideStepCompleted
                            .slice(0, index)
                            .every((isDone) => Boolean(isDone));
                        const isLocked = !priorStepsDone;
                        const isDone = Boolean(nacefGuideStepCompleted[index]);
                        const statusLabel = isLocked
                          ? "🔒 verrouillé"
                          : isDone
                            ? "✅ validé"
                            : "⛔ à faire";
                        return (
                      <button
                        key={step.title}
                        type="button"
                        onClick={() => setNacefGuideStep(index)}
                        disabled={isLocked}
                        className={`text-left rounded-xl border px-3 py-2 transition ${
                          nacefGuideStep === index
                            ? "border-amber-300 bg-amber-50"
                            : "border-indigo-100 bg-white hover:bg-indigo-50"
                        } disabled:opacity-45 disabled:cursor-not-allowed`}
                      >
                        <p className="text-[10px] font-black text-slate-700">{step.title}</p>
                        <p className="text-[10px] font-semibold text-slate-500 mt-1">
                          {statusLabel}
                        </p>
                      </button>
                        );
                      })()
                    ))}
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                    <p className="text-[11px] font-black text-amber-800">
                      Étape {nacefGuideStep + 1}/{nacefGuideSteps.length}
                    </p>
                    <p className="text-[11px] font-semibold text-amber-700 mt-1">
                      {nacefCurrentGuide.hint}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setNacefGuideStep((s) => Math.max(0, s - 1))}
                      disabled={nacefGuideStep <= 0}
                      className="px-3 py-1.5 rounded-lg border border-indigo-200 bg-white text-[11px] font-black text-indigo-700 disabled:opacity-40"
                    >
                      Précédent
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        runNacefAction(
                          nacefCurrentGuide.run,
                          nacefCurrentGuide.successMessage,
                        )
                      }
                      disabled={nacefBusy}
                      className="px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-600 text-[11px] font-black text-white disabled:opacity-50"
                    >
                      {nacefCurrentGuide.actionLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setNacefGuideStep((s) => Math.min(nacefGuideSteps.length - 1, s + 1))
                      }
                      disabled={
                        nacefGuideStep >= nacefGuideSteps.length - 1 ||
                        !nacefGuideCurrentStepDone
                      }
                      className="px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-[11px] font-black text-indigo-700 disabled:opacity-40"
                    >
                      Suivant
                    </button>
                  </div>
                </div>
              )}
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-black text-slate-700">
              <input
                type="checkbox"
                checked={Boolean((settings as any)?.nacefEnabled)}
                onChange={(e) =>
                  void updateSettings({ nacefEnabled: e.target.checked } as any)
                }
              />
              Activer la fiscalisation NACEF pour les nouveaux tickets (Sprint 2)
            </label>
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                Politique de blocage
              </label>
              <select
                value={String((settings as any)?.nacefEnforcementMode || "SOFT")}
                onChange={(e) =>
                  void updateSettings({
                    nacefEnforcementMode:
                      String(e.target.value).toUpperCase() === "HARD"
                        ? "HARD"
                        : "SOFT",
                  } as any)
                }
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold"
              >
                <option value="SOFT">SOFT (ne bloque pas la vente)</option>
                <option value="HARD">HARD (bloque en cas d'échec NACEF)</option>
              </select>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                  Mode backend NACEF
                </label>
                <select
                  value={nacefRuntimeMode}
                  onChange={(e) =>
                    setNacefRuntimeMode(
                      String(e.target.value).toUpperCase() === "REMOTE"
                        ? "REMOTE"
                        : "SIMULATED",
                    )
                  }
                  className="mt-1 w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-bold"
                >
                  <option value="SIMULATED">SIMULATED</option>
                  <option value="REMOTE">REMOTE</option>
                </select>
              </div>
              <div className="lg:col-span-2">
                <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                  Base URL S-MDF (mode REMOTE)
                </label>
                <input
                  type="text"
                  value={nacefRuntimeBaseUrl}
                  onChange={(e) => setNacefRuntimeBaseUrl(e.target.value)}
                  placeholder="http://127.0.0.1:10006"
                  className="mt-1 w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-bold"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div className="lg:col-span-2">
                <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                  IMDF
                </label>
                <input
                  type="text"
                  value={nacefImdf}
                  onChange={(e) => setNacefImdf(e.target.value.toUpperCase())}
                  placeholder="IMDF-001"
                  className="mt-1 w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-bold"
                />
              </div>
              <div>
                <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                  Mode
                </label>
                <select
                  value={nacefMode}
                  onChange={(e) =>
                    setNacefMode(
                      String(e.target.value).toUpperCase() === "OFFLINE"
                        ? "OFFLINE"
                        : "ONLINE",
                    )
                  }
                  className="mt-1 w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-bold"
                >
                  <option value="ONLINE">ONLINE</option>
                  <option value="OFFLINE">OFFLINE</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={nacefBusy}
                onClick={() =>
                  runNacefAction(async () => {
                    await updateSettings({
                      nacefImdf: String(nacefImdf || "").trim(),
                      nacefMode: nacefRuntimeMode,
                      nacefBaseUrl: String(nacefRuntimeBaseUrl || "").trim(),
                    } as any);
                    await refreshNacefManifest();
                  }, "Configuration NACEF enregistrée.")
                }
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
              >
                Enregistrer config NACEF
              </button>
              <button
                type="button"
                disabled={nacefBusy || !nacefGuideStepCompleted[0]}
                onClick={() =>
                  runNacefAction(() => refreshNacefManifest(), "Manifest récupéré.")
                }
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
              >
                Rafraîchir état
              </button>
              <button
                type="button"
                disabled={
                  nacefBusy ||
                  !nacefGuideStepCompleted[1] ||
                  (nacefManifestLoaded && !nacefCanSign)
                }
                onClick={() =>
                  runNacefAction(
                    async () => {
                      const imdf = String(nacefImdf || "").trim().toUpperCase();
                      await callNacef(`/pos/nacef/certificate/request`, {
                        method: "POST",
                        body: JSON.stringify({ imdf }),
                      });
                      await refreshNacefManifest();
                    },
                    "Demande certificat envoyée.",
                  )
                }
                className="px-4 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
              >
                Demander certificat
              </button>
              <button
                type="button"
                disabled={nacefBusy || !nacefGuideStepCompleted[2]}
                onClick={() =>
                  runNacefAction(
                    async () => {
                      const imdf = String(nacefImdf || "").trim().toUpperCase();
                      await callNacef(`/pos/nacef/certificate/simulate-generated`, {
                        method: "POST",
                        body: JSON.stringify({ imdf, expiresInDays: 365 }),
                      });
                      await refreshNacefManifest();
                    },
                    "Certificat simulé généré.",
                  )
                }
                className="px-4 py-2 rounded-xl border border-indigo-200 bg-white text-indigo-700 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
              >
                Simuler certificat OK
              </button>
              <button
                type="button"
                disabled={nacefBusy || !nacefGuideStepCompleted[3]}
                onClick={() =>
                  runNacefAction(
                    async () => {
                      const imdf = String(nacefImdf || "").trim().toUpperCase();
                      await callNacef(`/pos/nacef/certificate/simulate-expired`, {
                        method: "POST",
                        body: JSON.stringify({ imdf }),
                      });
                      await refreshNacefManifest();
                    },
                    "Certificat simulé expiré.",
                  )
                }
                className="px-4 py-2 rounded-xl border border-amber-200 bg-white text-amber-700 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
              >
                Simuler certificat expiré
              </button>
              <button
                type="button"
                disabled={nacefBusy}
                onClick={() =>
                  runNacefAction(
                    async () => {
                      const imdf = String(nacefImdf || "").trim().toUpperCase();
                      await callNacef(`/pos/nacef/status`, {
                        method: "POST",
                        body: JSON.stringify({ imdf, status: "SUSPENDED" }),
                      });
                      await refreshNacefManifest();
                    },
                    "S-MDF suspendu (simulation).",
                  )
                }
                className="px-4 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
              >
                Simuler suspension
              </button>
              <button
                type="button"
                disabled={nacefBusy}
                onClick={() =>
                  runNacefAction(
                    async () => {
                      const imdf = String(nacefImdf || "").trim().toUpperCase();
                      await callNacef(`/pos/nacef/status`, {
                        method: "POST",
                        body: JSON.stringify({ imdf, status: "REVOKED" }),
                      });
                      await refreshNacefManifest();
                    },
                    "Certificat révoqué (simulation).",
                  )
                }
                className="px-4 py-2 rounded-xl border border-rose-200 bg-white text-rose-700 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
              >
                Simuler révocation
              </button>
              <button
                type="button"
                disabled={nacefBusy}
                onClick={() =>
                  runNacefAction(
                    async () => {
                      const imdf = String(nacefImdf || "").trim().toUpperCase();
                      await callNacef(`/pos/nacef/status`, {
                        method: "POST",
                        body: JSON.stringify({ imdf, status: "ACTIVE" }),
                      });
                      await refreshNacefManifest();
                    },
                    "Réactivation demandée.",
                  )
                }
                className="px-4 py-2 rounded-xl border border-slate-200 bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
              >
                Réactiver S-MDF
              </button>
              <button
                type="button"
                disabled={nacefBusy}
                onClick={() =>
                  runNacefAction(
                    async () => {
                      const imdf = String(nacefImdf || "").trim().toUpperCase();
                      await callNacef(`/pos/nacef/sync`, {
                        method: "POST",
                        body: JSON.stringify({ imdf, mode: nacefMode }),
                      });
                      await refreshNacefManifest();
                    },
                    "Synchronisation NACEF réussie.",
                  )
                }
                className="px-4 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
              >
                Synchroniser
              </button>
              <button
                type="button"
                disabled={nacefBusy}
                onClick={() =>
                  runNacefAction(
                    async () => {
                      const imdf = String(nacefImdf || "").trim().toUpperCase();
                      await callNacef(`/pos/nacef/sign`, {
                        method: "POST",
                        body: JSON.stringify({
                          imdf,
                          ticket: {
                            id: `TEST-${Date.now()}`,
                            operationType: "SALE",
                            transactionType: "NORMAL",
                            totalHt: "10.000",
                            taxTotal: "0.700",
                          },
                        }),
                      });
                      setNacefGuideSignDone(true);
                      await refreshNacefManifest();
                    },
                    "Ticket test signé.",
                  )
                }
                className="px-4 py-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
              >
                Signer ticket test
              </button>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-black text-slate-700">Statut S-MDF:</span>
                <span className="px-2 py-1 rounded-lg bg-white border border-slate-200 font-black text-slate-800">
                  {String(nacefManifest?.status || "—")}
                </span>
                <span className="font-black text-slate-700">Mode:</span>
                <span className="px-2 py-1 rounded-lg bg-white border border-slate-200 font-black text-slate-800">
                  {String(nacefManifest?.state || "—")}
                </span>
                <span className="font-black text-slate-700">Certificat:</span>
                <span className="px-2 py-1 rounded-lg bg-white border border-slate-200 font-black text-slate-800">
                  {String(nacefManifest?.certificateInfo?.certRequestStatus || "—")}
                </span>
                <span className="font-black text-slate-700">Offline dispo:</span>
                <span className="px-2 py-1 rounded-lg bg-white border border-slate-200 font-black text-slate-800">
                  {String(nacefManifest?.availableOfflineTickets ?? "—")}
                </span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-black text-slate-700">Blocage transaction:</span>
                  <span
                    className={`px-2 py-1 rounded-lg font-black border ${
                      nacefCanSign
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-rose-50 text-rose-700 border-rose-200"
                    }`}
                  >
                    {nacefCanSign ? "AUCUN (vente autorisée)" : "ACTIF (vente bloquée)"}
                  </span>
                  {!nacefCanSign && nacefBlockingCode && (
                    <span className="px-2 py-1 rounded-lg bg-rose-100 text-rose-800 border border-rose-200 font-black">
                      {nacefBlockingCode}
                    </span>
                  )}
                </div>
                {!nacefCanSign && (
                  <div className="text-[11px] text-slate-700 font-bold space-y-1">
                    <div>
                      <span className="text-slate-500">Cause:</span>{" "}
                      {nacefBlockingMessage || "Blocage fiscal NACEF détecté."}
                    </div>
                    <div>
                      <span className="text-slate-500">Action recommandée:</span>{" "}
                      {nacefRecommendation}
                    </div>
                    {nacefQuickAction && (
                      <div className="pt-1">
                        <button
                          type="button"
                          disabled={nacefBusy}
                          onClick={() =>
                            runNacefAction(
                              runNacefQuickAction,
                              `${nacefQuickAction.label} exécutée.`,
                            )
                          }
                          className="px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                        >
                          {nacefQuickAction.label}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <pre className="text-[11px] text-slate-700 bg-white border border-slate-200 rounded-xl p-3 overflow-auto max-h-72">
                {JSON.stringify(nacefManifest || {}, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {activeTab === "hardware" && (
          <div className="grid grid-cols-1 gap-8">
            <div className="bg-white p-8 rounded-[2rem] border border-slate-100 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-black text-slate-800">
                  Observabilité sécurité (Sprint 6)
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleLoadSecurityStatus}
                    disabled={securityStatusBusy}
                    className="px-4 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest"
                  >
                    {securityStatusBusy ? "Vérification..." : "Vérifier"}
                  </button>
                  <button
                    type="button"
                    onClick={handleExportSecurityStatus}
                    className="px-4 py-2 rounded-xl bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-widest"
                  >
                    Export JSON
                  </button>
                  <button
                    type="button"
                    onClick={handleExportSecurityStatusPdf}
                    className="px-4 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-widest"
                  >
                    Export PDF
                  </button>
                  <button
                    type="button"
                    onClick={handleCopySecurityDiagnostic}
                    className="px-4 py-2 rounded-xl bg-amber-50 text-amber-700 text-[10px] font-black uppercase tracking-widest"
                  >
                    Copier diagnostic
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyCriticalSecurityChecks}
                    className="px-4 py-2 rounded-xl bg-rose-50 text-rose-700 text-[10px] font-black uppercase tracking-widest"
                  >
                    Copier critiques
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadCriticalSecurityChecks}
                    className="px-4 py-2 rounded-xl bg-fuchsia-50 text-fuchsia-700 text-[10px] font-black uppercase tracking-widest"
                  >
                    Télécharger critiques
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadSecurityDiagnostic}
                    className="px-4 py-2 rounded-xl bg-sky-50 text-sky-700 text-[10px] font-black uppercase tracking-widest"
                  >
                    Télécharger diagnostic
                  </button>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                <p className="text-[11px] font-black text-slate-700 uppercase tracking-widest">
                  Vérification locale SHA-256
                </p>
                <div className="grid md:grid-cols-2 gap-2">
                  <label className="text-[11px] text-slate-600 font-bold space-y-1">
                    <span>Fichier exporté (JSON/PDF)</span>
                    <input
                      type="file"
                      onChange={(e) => {
                        setSecurityExportFile(e.target.files?.[0] || null);
                        setSecurityVerifyResult(null);
                      }}
                      className="block w-full text-[11px] text-slate-600 file:mr-2 file:px-2 file:py-1 file:rounded-lg file:border-0 file:bg-white file:text-slate-700"
                    />
                  </label>
                  <label className="text-[11px] text-slate-600 font-bold space-y-1">
                    <span>Preuve SHA-256 (.sha256.txt)</span>
                    <input
                      type="file"
                      accept=".txt,.sha256"
                      onChange={(e) => {
                        setSecurityProofFile(e.target.files?.[0] || null);
                        setSecurityVerifyResult(null);
                      }}
                      className="block w-full text-[11px] text-slate-600 file:mr-2 file:px-2 file:py-1 file:rounded-lg file:border-0 file:bg-white file:text-slate-700"
                    />
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleVerifySecuritySha256}
                    className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 text-[10px] font-black uppercase tracking-widest"
                  >
                    Vérifier .sha256.txt
                  </button>
                  {securityVerifyResult && (
                    <span
                      className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                        securityVerifyResult.ok
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-rose-100 text-rose-700"
                      }`}
                    >
                      {securityVerifyResult.ok ? "Valide" : "Invalide"}
                    </span>
                  )}
                </div>
                {securityVerifyResult && (
                  <p className="text-[11px] font-bold text-slate-600">{securityVerifyResult.message}</p>
                )}
                <div className="pt-1 space-y-1">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    Historique (8 derniers)
                  </p>
                  {securityVerifyHistory.length === 0 ? (
                    <p className="text-[11px] text-slate-500 font-bold">
                      Aucune vérification enregistrée.
                    </p>
                  ) : (
                    securityVerifyHistory.map((entry, idx) => (
                      <div
                        key={`${entry.at}-${idx}`}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1.5"
                      >
                        <p className="text-[10px] font-black text-slate-700">
                          {new Date(entry.at).toLocaleString()} -{" "}
                          {entry.ok ? "VALIDE" : "INVALIDE"}
                        </p>
                        <p className="text-[10px] text-slate-600 font-bold">
                          Export: {entry.exportFileName}
                        </p>
                        <p className="text-[10px] text-slate-600 font-bold">
                          Preuve: {entry.proofFileName}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
              {securityOperationalStatus ? (
                <div className="space-y-3">
                  {securityStatusStaleLevel !== "none" && (
                    <div
                      className={`rounded-xl px-3 py-2 border ${
                        securityStatusStaleLevel === "critical"
                          ? "border-rose-200 bg-rose-50"
                          : "border-amber-200 bg-amber-50"
                      }`}
                    >
                      <p
                        className={`text-[11px] font-black uppercase tracking-widest ${
                          securityStatusStaleLevel === "critical"
                            ? "text-rose-700"
                            : "text-amber-700"
                        }`}
                      >
                        {securityStatusStaleLevel === "critical"
                          ? "Statut potentiellement obsolète (critique)"
                          : "Statut à rafraîchir"}
                      </p>
                      <p
                        className={`text-[11px] font-bold ${
                          securityStatusStaleLevel === "critical"
                            ? "text-rose-700"
                            : "text-amber-700"
                        }`}
                      >
                        Dernière génération il y a {securityStatusAgeMinutes} min.
                      </p>
                    </div>
                  )}
                  {securityOperationalStatus.overall === "critical" && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
                      <p className="text-[11px] font-black text-rose-700 uppercase tracking-widest">
                        Alerte critique
                      </p>
                      <p className="text-[11px] text-rose-700 font-bold">
                        Des points bloquants sécurité sont détectés. Corrige les checks critiques avant exploitation.
                      </p>
                    </div>
                  )}
                  <div
                    className={`inline-flex px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                      securityOperationalStatus.overall === "critical"
                        ? "bg-rose-100 text-rose-700"
                        : securityOperationalStatus.overall === "warning"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    Statut global: {securityOperationalStatus.overall}
                  </div>
                  <p className="text-[11px] text-slate-500 font-bold">
                    Généré le{" "}
                    {new Date(securityOperationalStatus.generatedAt).toLocaleString()}
                  </p>
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Résumé opérationnel
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-1 rounded-lg bg-rose-100 text-rose-700 text-[10px] font-black uppercase">
                        Critiques: {securityChecksSummary.critical}
                      </span>
                      <span className="px-2 py-1 rounded-lg bg-amber-100 text-amber-700 text-[10px] font-black uppercase">
                        Warnings: {securityChecksSummary.warning}
                      </span>
                      <span className="px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase">
                        OK: {securityChecksSummary.ok}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 font-bold">
                      {securityChecksSummary.recommendation}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {[
                        { id: "all", label: "Tous" },
                        { id: "critical", label: "Critiques" },
                        { id: "warning", label: "Warnings" },
                        { id: "ok", label: "OK" },
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() =>
                            setSecurityCheckFilter(
                              item.id as "all" | "critical" | "warning" | "ok",
                            )
                          }
                          className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${
                            securityCheckFilter === item.id
                              ? "bg-slate-900 text-white border-slate-900"
                              : "bg-white text-slate-600 border-slate-200"
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                    {filteredSecurityChecks.map((check, idx) => (
                      <div
                        key={`${check.key}-${idx}`}
                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                      >
                        <p className="text-[11px] font-black text-slate-700">
                          {check.key}
                        </p>
                        <p
                          className={`text-[10px] font-black uppercase ${
                            check.level === "critical"
                              ? "text-rose-700"
                              : check.level === "warning"
                                ? "text-amber-700"
                                : "text-emerald-700"
                          }`}
                        >
                          {check.level}
                        </p>
                        <p className="text-[11px] text-slate-600 font-bold">
                          {check.message}
                        </p>
                      </div>
                    ))}
                    {filteredSecurityChecks.length === 0 && (
                      <p className="text-[11px] text-slate-500 font-bold">
                        Aucun check pour ce filtre.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-xs font-bold text-slate-500">
                  Lance une vérification pour afficher l&apos;état sécurité opérationnel.
                </p>
              )}
            </div>
            <div className="bg-white p-8 rounded-[2rem] border border-slate-100 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-black text-slate-800">
                  Mode d&apos;impression
                </h3>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  {printRoutingMode === "CLOUD"
                    ? "Cloud (agent)"
                    : printRoutingMode === "DESKTOP_BRIDGE"
                      ? "Desktop Bridge"
                      : "Local (serveur)"}
                </span>
              </div>
              <p className="text-xs font-bold text-slate-500">
                Local garde le comportement historique (impression depuis le
                serveur). Cloud utilise les terminaux agents AppWin. Desktop
                Bridge envoie les jobs à une application locale en
                arrière-plan.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => updateSettings({ printRoutingMode: "LOCAL" } as any)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${
                    printRoutingMode === "LOCAL"
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  Local (serveur)
                </button>
                <button
                  type="button"
                  onClick={() => updateSettings({ printRoutingMode: "CLOUD" } as any)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${
                    printRoutingMode === "CLOUD"
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  Cloud (agent)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateSettings({ printRoutingMode: "DESKTOP_BRIDGE" } as any)
                  }
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${
                    printRoutingMode === "DESKTOP_BRIDGE"
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  Desktop Bridge
                </button>
              </div>
            </div>

            {printRoutingMode === "DESKTOP_BRIDGE" ? (
              <div className="bg-white p-8 rounded-[2rem] border border-slate-100 space-y-4">
                <h3 className="text-lg font-black text-slate-800">
                  Bridge local (service arrière-plan)
                </h3>
                <p className="text-xs font-bold text-slate-500">
                  Ton application desktop doit écouter en local (ex:
                  http://127.0.0.1:17888). POS lui envoie les jobs d&apos;impression.
                </p>
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
                    <input
                      type="checkbox"
                      checked={Boolean(desktopBridgeCfg?.enabled)}
                      onChange={(e) =>
                        updateSettings({
                          desktopPrintBridge: {
                            ...desktopBridgeCfg,
                            enabled: e.target.checked,
                          },
                        } as any)
                      }
                    />
                    Activé
                  </label>
                  <input
                    type="text"
                    value={String(desktopBridgeCfg?.url || "http://127.0.0.1:17888")}
                    onChange={(e) =>
                      updateSettings({
                        desktopPrintBridge: {
                          ...desktopBridgeCfg,
                          url: e.target.value,
                        },
                      } as any)
                    }
                    placeholder="http://127.0.0.1:17888"
                    className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold lg:col-span-2"
                  />
                  <input
                    type="password"
                    value={String(desktopBridgeCfg?.token || "")}
                    onChange={(e) =>
                      updateSettings({
                        desktopPrintBridge: {
                          ...desktopBridgeCfg,
                          token: e.target.value,
                        },
                      } as any)
                    }
                    placeholder="Token (optionnel)"
                    className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="number"
                    min={500}
                    max={30000}
                    value={Number(desktopBridgeCfg?.timeoutMs || 4000)}
                    onChange={(e) =>
                      updateSettings({
                        desktopPrintBridge: {
                          ...desktopBridgeCfg,
                          timeoutMs: Number(e.target.value || 4000),
                        },
                      } as any)
                    }
                    className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold w-[10rem]"
                  />
                  <button
                    type="button"
                    onClick={handleTestDesktopBridge}
                    className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest"
                  >
                    Tester connexion
                  </button>
                </div>
              </div>
            ) : null}

            {printRoutingMode === "CLOUD" ? (
            <div className="bg-white p-8 rounded-[2rem] border border-slate-100 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-black text-slate-800">
                  Terminaux connectés
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    {terminalNodes.length} terminal
                    {terminalNodes.length > 1 ? "s" : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      void refreshCloudTerminalsAndPrinters(true);
                    }}
                    disabled={terminalCloudBusy}
                    className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-60"
                  >
                    {terminalCloudBusy ? "..." : "Rafraîchir"}
                  </button>
                </div>
              </div>
              {terminalNodes.length === 0 ? (
                <p className="text-sm font-bold text-slate-500">
                  Aucun terminal agent détecté pour le moment.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {terminalNodes.map((t) => (
                    <div
                      key={t.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-black text-slate-800 truncate">
                          {t.alias}
                        </p>
                        <span
                          className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                            t.online
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-rose-100 text-rose-700"
                          }`}
                        >
                          {t.online ? "online" : "offline"}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 font-bold truncate">
                        Site: {t.siteName || "—"}
                      </p>
                      <p className="text-[11px] text-slate-500 font-bold truncate">
                        Dernière activité:{" "}
                        {t.lastSeenAt
                          ? new Date(Number(t.lastSeenAt)).toLocaleString()
                          : "—"}
                      </p>
                      <p className="text-[11px] text-slate-500 font-bold truncate">
                        Fingerprint: {String(t.fingerprintHash || "").slice(0, 12)}
                        ...
                      </p>
                      <p className="text-[11px] text-indigo-600 font-black truncate">
                        Imprimantes détectées:{" "}
                        {Array.isArray(t.printers) ? t.printers.length : 0}
                      </p>
                      {Array.isArray(t.printers) && t.printers.length > 0 ? (
                        <div className="space-y-1">
                          {t.printers.map((lp) => (
                            <p
                              key={lp.id}
                              className="text-[10px] text-slate-500 font-bold truncate"
                            >
                              • {lp.name} ({lp.transport})
                            </p>
                          ))}
                        </div>
                      ) : null}
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={async () => {
                            const uid = String(currentUser?.id || "").trim();
                            if (!uid) {
                              notifyError("Utilisateur requis pour supprimer un terminal.");
                              return;
                            }
                            const ok = window.confirm(
                              `Supprimer le terminal "${t.alias}" ?`,
                            );
                            if (!ok) return;
                            try {
                              const out = await deleteTerminalNode({
                                userId: uid,
                                terminalNodeId: t.id,
                              });
                              notifySuccess(
                                `Terminal supprimé. ${Number(
                                  out?.unboundPrinters || 0,
                                )} imprimante(s) locale(s) déliée(s).`,
                              );
                              await refreshCloudTerminalsAndPrinters(false);
                            } catch (e: any) {
                              notifyError(
                                e?.message || "Suppression terminal impossible.",
                              );
                            }
                          }}
                          className="px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 text-[10px] font-black uppercase tracking-widest"
                        >
                          Supprimer
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            ) : null}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white p-10 rounded-[3rem] border border-slate-100 space-y-6">
              <h3 className="text-xl font-black text-slate-800">Imprimantes</h3>
              <div className="space-y-4">
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      if (printRoutingMode === "CLOUD") {
                        await refreshCloudTerminalsAndPrinters(true);
                      } else {
                        const list = await getDetectedPrinters();
                        setDetectedPrinters(Array.isArray(list) ? list : []);
                      }
                    }}
                    className="flex-1 bg-slate-900 text-white font-black py-3 rounded-2xl"
                  >
                    {printRoutingMode === "CLOUD"
                      ? "Charger Imprimantes Cloud"
                      : "Détecter Imprimantes"}
                  </button>
                  <button
                    onClick={() => {
                      const p = detectedPrinters.find(
                        (d) => d.Name === selectedDetected,
                      );
                      if (p) {
                        setNewPrinterName(p.Name);
                        if (!bonProfileTouched) {
                          setNewPrinterBonProfile(guessBonProfileFromName(p.Name));
                        }
                      }
                    }}
                    className="flex-1 bg-indigo-50 text-indigo-600 font-black py-3 rounded-2xl"
                  >
                    Utiliser Sélection
                  </button>
                </div>
                <select
                  value={selectedDetected}
                  onChange={(e) => setSelectedDetected(e.target.value)}
                  className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold appearance-none bg-white"
                >
                  <option value="">
                    {printRoutingMode === "CLOUD"
                      ? "Imprimantes cloud détectées..."
                      : "Imprimantes détectées..."}
                  </option>
                  {detectedPrinters.map((p) => (
                    <option key={p.Name} value={p.Name}>
                      {p.Name}
                    </option>
                  ))}
                </select>
                <p className="text-xs font-bold text-slate-500">
                  {printRoutingMode === "CLOUD"
                    ? "Nom remonté par l'agent AppWin (terminal distant)."
                    : "Nom Windows / file d'attente (tel qu'affiché dans le système)."}
                </p>
                <input
                  type="text"
                  placeholder="Nom imprimante (système)"
                  value={newPrinterName}
                  onChange={(e) => {
                    const value = e.target.value;
                    setNewPrinterName(value);
                    if (!bonProfileTouched) {
                      setNewPrinterBonProfile(guessBonProfileFromName(value));
                    }
                  }}
                  className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold border border-transparent focus:border-indigo-500 outline-none"
                />
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase text-slate-500">
                    Rôle
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setNewPrinterIsReceipt(false);
                        setBonProfileTouched(false);
                      }}
                      className={`flex-1 min-w-[8rem] py-3 rounded-2xl text-[10px] font-black uppercase tracking-wide ${
                        !newPrinterIsReceipt
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      Bon préparation
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNewPrinterIsReceipt(true);
                        setBonProfileTouched(false);
                      }}
                      className={`flex-1 min-w-[8rem] py-3 rounded-2xl text-[10px] font-black uppercase tracking-wide ${
                        newPrinterIsReceipt
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      Ticket client (caisse)
                    </button>
                  </div>
                </div>
                {!newPrinterIsReceipt ? (
                  <>
                    <input
                      type="text"
                      placeholder="Libellé du poste (ex. Cuisine, Terrasse, Chicha…)"
                      value={newPrinterStationLabel}
                      onChange={(e) =>
                        setNewPrinterStationLabel(e.target.value)
                      }
                      className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold border border-transparent focus:border-indigo-500 outline-none"
                    />
                    <select
                      value={newPrinterBonProfile}
                      onChange={(e) => {
                        setNewPrinterBonProfile(
                          e.target.value === "bar" ? "bar" : "kitchen",
                        );
                        setBonProfileTouched(true);
                      }}
                      className="w-full px-6 py-4 bg-slate-50 rounded-2xl font-bold appearance-none bg-white"
                    >
                      <option value="kitchen">
                        Modèle du bon : comme cuisine
                      </option>
                      <option value="bar">Modèle du bon : comme bar</option>
                    </select>
                    <p className="text-xs text-slate-500">
                      Vous pouvez ajouter plusieurs imprimantes avec le même
                      libellé de poste (ex. deux « Cuisine » sur deux files
                      différentes).
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-slate-500">
                    Impression des tickets / reçus clients (encaissement).
                    Aucun libellé de poste requis.
                  </p>
                )}
                <button
                  onClick={async () => {
                    if (!newPrinterName.trim()) return;
                    const isEditing = Boolean(editingPrinterId);
                    try {
                      if (newPrinterIsReceipt) {
                        if (isEditing && editingPrinterId) {
                          await updatePrinter(editingPrinterId, {
                            name: newPrinterName.trim(),
                            type: "RECEIPT",
                            bonProfile: null,
                          });
                        } else {
                          await addPrinter(newPrinterName.trim(), "RECEIPT", null);
                        }
                      } else {
                        const label = newPrinterStationLabel.trim();
                        if (!label) {
                          notifyError(
                            "Indiquez un libellé de poste (ex. Bar, Terrasse).",
                          );
                          return;
                        }
                        if (isEditing && editingPrinterId) {
                          await updatePrinter(editingPrinterId, {
                            name: newPrinterName.trim(),
                            type: label,
                            bonProfile: newPrinterBonProfile,
                          });
                        } else {
                          await addPrinter(
                            newPrinterName.trim(),
                            label,
                            newPrinterBonProfile,
                          );
                        }
                      }
                      notifySuccess(
                        isEditing
                          ? "Imprimante modifiée."
                          : "Imprimante connectée.",
                      );
                      resetPrinterForm();
                    } catch (e: any) {
                      notifyError(e?.message || "Impossible d'enregistrer l'imprimante.");
                    }
                  }}
                  className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl"
                >
                  {editingPrinterId ? "Enregistrer modification" : "Connecter"}
                </button>
                {editingPrinterId ? (
                  <button
                    type="button"
                    onClick={resetPrinterForm}
                    className="w-full bg-slate-100 text-slate-700 font-black py-3 rounded-2xl"
                  >
                    Annuler modification
                  </button>
                ) : null}
              </div>
            </div>
            <div className="bg-white p-10 rounded-[3rem] border border-slate-100">
              <div className="space-y-3">
                {printers.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-2 p-4 bg-slate-50 rounded-2xl"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <PrinterIcon className="text-slate-400 shrink-0" size={18} />
                      <div className="min-w-0">
                        <p className="font-bold text-sm truncate">{p.name}</p>
                        <p className="text-[10px] font-black text-indigo-500 truncate">
                          {isReceiptPrinter(p)
                            ? "Caisse · ticket client"
                            : `${p.type} · bon ${
                                printerBonProfile(p) === "bar"
                                  ? "style bar"
                                  : "style cuisine"
                              }`}
                        </p>
                        <p className="text-[10px] text-slate-500 truncate">
                          {printRoutingMode === "CLOUD"
                            ? `Terminal agent: ${
                                String((p as any).terminalNodeId || "").trim()
                                  ? terminalNodes.find(
                                      (t) =>
                                        t.id ===
                                        String((p as any).terminalNodeId || "").trim(),
                                    )?.alias || "lié"
                                  : "non lié"
                              }`
                            : "Mode local actif (serveur)."}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => startEditPrinter(p)}
                        className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-[10px] font-black uppercase text-slate-600"
                      >
                        Modifier
                      </button>
                      {!isReceiptPrinter(p) ? (
                        <button
                          type="button"
                          onClick={() => handlePrintOnePrinterTest(p.id)}
                          className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-[10px] font-black uppercase text-slate-600"
                        >
                          Test
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handlePrintReceiptPrinterTest(p.id)}
                          className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-[10px] font-black uppercase text-slate-600"
                        >
                          Test ticket
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => deletePrinter(p.id)}
                        className="text-rose-300 hover:text-rose-500 p-2"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))}
                {printRoutingMode === "CLOUD" ? (
                <div className="rounded-2xl border border-slate-100 p-4 bg-white">
                  <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">
                    Liaisons Cloud - Terminaux agents
                  </p>
                  <div className="space-y-3">
                    {printers.map((p) => {
                      const draft = bindingDrafts[p.id] || {
                        terminalNodeId: String((p as any).terminalNodeId || ""),
                        terminalPrinterLocalId: String(
                          (p as any).terminalPrinterLocalId || "",
                        ),
                      };
                      const node = terminalNodes.find(
                        (t) => t.id === draft.terminalNodeId,
                      );
                      const availablePrinters = Array.isArray(node?.printers)
                        ? node!.printers
                        : [];
                      return (
                        <div
                          key={`bind-${p.id}`}
                          className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center"
                        >
                          <p className="md:col-span-3 text-xs font-bold text-slate-700 truncate">
                            {p.name}
                          </p>
                          <select
                            value={draft.terminalNodeId}
                            onChange={(e) =>
                              setBindingDrafts((prev) => ({
                                ...prev,
                                [p.id]: {
                                  terminalNodeId: e.target.value,
                                  terminalPrinterLocalId: "",
                                },
                              }))
                            }
                            className="md:col-span-3 px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold"
                          >
                            <option value="">Mode local</option>
                            {terminalNodes.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.alias} {t.online ? "• online" : "• offline"}
                              </option>
                            ))}
                          </select>
                          <select
                            value={draft.terminalPrinterLocalId}
                            disabled={!draft.terminalNodeId}
                            onChange={(e) =>
                              setBindingDrafts((prev) => ({
                                ...prev,
                                [p.id]: {
                                  ...draft,
                                  terminalPrinterLocalId: e.target.value,
                                },
                              }))
                            }
                            className="md:col-span-4 px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold disabled:opacity-50"
                          >
                            <option value="">Imprimante locale agent</option>
                            {availablePrinters.map((lp) => (
                              <option key={lp.id} value={lp.printerLocalId}>
                                {lp.name} ({lp.transport})
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await bindPrinterTerminal({
                                  userId: String(currentUser?.id || ""),
                                  printerId: p.id,
                                  terminalNodeId: draft.terminalNodeId || null,
                                  terminalPrinterLocalId:
                                    draft.terminalPrinterLocalId || null,
                                });
                                notifySuccess("Liaison imprimante enregistrée.");
                              } catch (e: any) {
                                notifyError(
                                  e?.message || "Impossible d'enregistrer la liaison.",
                                );
                              }
                            }}
                            className="md:col-span-2 px-3 py-2 rounded-xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest"
                          >
                            Lier
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
                ) : null}
              </div>
            </div>
          </div>
          </div>
        )}

        {activeTab === "zones" && (
          <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="bg-white p-10 rounded-[3rem] border border-slate-100 space-y-6">
              <h3 className="text-xl font-black text-slate-800">Zones</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Nouvelle zone..."
                  value={newZoneName}
                  onChange={(e) => setNewZoneName(e.target.value)}
                  className="flex-1 px-4 py-3 bg-slate-50 rounded-xl font-bold outline-none"
                />
                <button
                  onClick={() => {
                    if (newZoneName) {
                      addZone(newZoneName);
                      setNewZoneName("");
                    }
                  }}
                  className="bg-indigo-600 text-white p-3 rounded-xl"
                >
                  <Plus size={20} />
                </button>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-hide">
                {zones.map((z) => (
                  <div
                    key={z.id}
                    className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl"
                  >
                    <span className="font-bold text-sm">{z.name}</span>
                    <button
                      onClick={() => deleteZone(z.id)}
                      className="text-rose-300 hover:text-rose-500"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-2 bg-white p-10 rounded-[3rem] border border-slate-100 space-y-8">
              <h3 className="text-xl font-black text-slate-800">
                Plan des Tables
              </h3>
              <div className="flex gap-3 bg-slate-50 p-3 rounded-[2rem]">
                <input
                  type="text"
                  placeholder="N°"
                  value={newTableNum}
                  onChange={(e) => setNewTableNum(e.target.value)}
                  className="w-16 px-4 py-2 rounded-xl font-bold text-center"
                />
                <select
                  value={newTableZone}
                  onChange={(e) => setNewTableZone(e.target.value)}
                  className="flex-1 px-4 py-2 rounded-xl font-bold bg-white"
                >
                  <option value="">Choisir Zone...</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  placeholder="Pers."
                  value={newTableCap}
                  onChange={(e) => setNewTableCap(e.target.value)}
                  className="w-16 px-4 py-2 rounded-xl font-bold text-center"
                />
                <button
                  onClick={() => {
                    if (newTableNum && newTableZone) {
                      const cap = parseInt(newTableCap, 10) || 4;
                      const plan =
                        settings.companyType === CompanyType.RESTAURANT_CAFE
                          ? suggestTablePlanLayout(
                              tables,
                              newTableZone,
                              cap,
                            )
                          : undefined;
                      addTable(newTableNum, newTableZone, cap, plan);
                      setNewTableNum("");
                    }
                  }}
                  className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-black text-xs"
                >
                  Ajouter
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-h-[400px] overflow-y-auto pr-2 scrollbar-hide">
                {tables.map((table) => (
                  <div
                    key={table.id}
                    className="bg-slate-50 border border-slate-100 p-6 rounded-[2rem] relative group"
                  >
                    <div className="flex justify-between items-center mb-4">
                      <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black">
                        {table.number}
                      </div>
                      <button
                        onClick={() => deleteTable(table.id)}
                        className="text-rose-200 hover:text-rose-500 opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase">
                      {zones.find((z) => z.id === table.zoneId)?.name}
                    </p>
                    <p className="text-xs font-bold text-slate-600 mt-1">
                      {table.capacity} Pers.
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {settings.companyType === CompanyType.RESTAURANT_CAFE && (
            <div className="overflow-hidden rounded-[3rem] border border-slate-200/90 bg-gradient-to-br from-white via-slate-50/50 to-violet-50/40 p-10 shadow-[0_12px_40px_rgba(15,23,42,0.08)] space-y-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-2xl font-black tracking-tight text-slate-900">
                    Éditeur visuel du plan
                  </h3>
                  <p className="mt-2 text-sm font-medium leading-relaxed text-slate-600 max-w-2xl">
                    Déplacement par boutons (et flèches clavier), tailles en un
                    clic, couleurs prêtes à l&apos;emploi pour les zones. Le POS
                    affiche le même plan ; les positions s&apos;adaptent à
                    l&apos;écran.
                  </p>
                </div>
                <span className="shrink-0 rounded-2xl border border-violet-200/80 bg-violet-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-violet-800">
                  Restaurant & café
                </span>
              </div>
              <RestaurantFloorPlanEditor
                zones={zones}
                tables={tables}
                selectedZoneId={newTableZone || zones[0]?.id || ""}
                patchTableLayout={patchTableLayout}
                patchZoneLayout={patchZoneLayout}
                deleteTable={deleteTable}
              />
            </div>
          )}
          </div>
        )}

        {activeTab === "notes" && (
          <div className="max-w-4xl bg-white p-10 rounded-[3rem] border border-slate-100 space-y-8">
            <h3 className="text-2xl font-black text-slate-800">
              Notes Cuisine Rapides
            </h3>
            <div className="flex gap-4">
              <input
                type="text"
                placeholder="ex: Sans Piment..."
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                className="flex-1 px-6 py-4 bg-slate-50 rounded-2xl font-bold outline-none"
              />
              <button
                onClick={handleAddNote}
                className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black"
              >
                Ajouter
              </button>
            </div>
            <div className="flex flex-wrap gap-3">
              {settings.predefinedNotes.map((note) => (
                <div
                  key={note}
                  className="group relative bg-slate-50 border border-slate-100 p-4 rounded-2xl flex items-center gap-4"
                >
                  <span className="text-xs font-black text-slate-600">
                    {note}
                  </span>
                  <button
                    onClick={() => handleRemoveNote(note)}
                    className="text-rose-200 hover:text-rose-500"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "posDiscounts" && (
          <div className="max-w-4xl bg-white p-10 rounded-[3rem] border border-slate-100 space-y-8">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-600 border border-rose-100 shrink-0">
                <Percent size={22} />
              </div>
              <div>
                <h3 className="text-2xl font-black text-slate-800">
                  Remises rapides au point de vente
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-xl">
                  Mêmes raccourcis pour une ligne du panier et pour la remise sur
                  tout le ticket. Pourcentage : 0 à 100. Montant : en{" "}
                  {settings.currency}.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={addPosPreset}
              className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-black text-sm"
            >
              Ajouter une remise
            </button>
            <div className="space-y-4">
              {posDiscountList.map((preset, index) => (
                <div
                  key={preset.id}
                  className="flex flex-wrap gap-3 items-center p-4 rounded-2xl bg-slate-50 border border-slate-100"
                >
                  <input
                    type="text"
                    value={preset.label}
                    onChange={(e) =>
                      updatePosPresetAt(index, { label: e.target.value })
                    }
                    className="flex-1 min-w-[140px] px-4 py-2 rounded-xl font-bold bg-white border border-slate-200 outline-none focus:border-indigo-400"
                    placeholder="Libellé"
                  />
                  <select
                    value={preset.type}
                    onChange={(e) =>
                      updatePosPresetAt(index, {
                        type:
                          e.target.value === "AMOUNT" ? "AMOUNT" : "PERCENT",
                      })
                    }
                    className="px-4 py-2 rounded-xl font-black text-xs bg-white border border-slate-200"
                  >
                    <option value="PERCENT">Pourcentage %</option>
                    <option value="AMOUNT">Montant</option>
                  </select>
                  <input
                    type="number"
                    min={0}
                    max={preset.type === "PERCENT" ? 100 : undefined}
                    step="any"
                    value={preset.value}
                    onChange={(e) =>
                      updatePosPresetAt(index, {
                        value: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-28 px-4 py-2 rounded-xl font-black text-sm bg-white border border-slate-200 text-center outline-none focus:border-indigo-400"
                  />
                  <button
                    type="button"
                    onClick={() => removePosPreset(index)}
                    className="p-2 text-rose-300 hover:text-rose-500"
                    title="Supprimer"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "paymentInstruments" && (
          <div className="max-w-6xl bg-white p-10 rounded-[3rem] border border-slate-100 space-y-8">
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-6 space-y-3">
              <h3 className="text-lg font-black text-slate-800">
                API externe carte restaurant
              </h3>
              <p className="text-xs text-slate-500 font-bold">
                Si une carte n'existe pas localement, le système appelle cet
                endpoint pour débiter le montant. Le endpoint doit retourner
                <span className="font-black"> {"{ ok: true }"} </span>.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                <label className="md:col-span-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-black text-slate-700">
                  <input
                    type="checkbox"
                    checked={externalCardApiEnabled}
                    onChange={(e) => setExternalCardApiEnabled(e.target.checked)}
                  />
                  Activer
                </label>
                <input
                  type="text"
                  placeholder="https://api.externe.tld/cards/debit"
                  value={externalCardApiUrl}
                  onChange={(e) => setExternalCardApiUrl(e.target.value)}
                  className="md:col-span-2 px-4 py-2 rounded-xl border border-slate-200 bg-white font-bold text-sm"
                />
                <input
                  type="text"
                  placeholder="Token Bearer (optionnel)"
                  value={externalCardApiToken}
                  onChange={(e) => setExternalCardApiToken(e.target.value)}
                  className="md:col-span-1 px-4 py-2 rounded-xl border border-slate-200 bg-white font-bold text-sm"
                />
                <input
                  type="number"
                  min={1000}
                  step={500}
                  placeholder="Timeout ms"
                  value={externalCardApiTimeout}
                  onChange={(e) => setExternalCardApiTimeout(e.target.value)}
                  className="md:col-span-1 px-4 py-2 rounded-xl border border-slate-200 bg-white font-black text-center text-sm"
                />
              </div>
              <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-[10px] font-black text-slate-600 uppercase mb-2">
                  Méthodes de paiement activées au POS
                </p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: "CASH", label: "Espèces" },
                    { id: "BANK_CARD", label: "Carte bancaire" },
                    { id: "RESTAURANT_CARD", label: "Carte restaurant" },
                    { id: "RESTAURANT_TICKET", label: "Ticket restaurant" },
                  ].map((m) => {
                    const selected = Array.isArray(settings.paymentEnabledMethods)
                      ? settings.paymentEnabledMethods.includes(m.id as any)
                      : true;
                    return (
                      <label
                        key={m.id}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-700"
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(e) => {
                            const current = Array.isArray(settings.paymentEnabledMethods)
                              ? [...settings.paymentEnabledMethods]
                              : [
                                  "CASH",
                                  "BANK_CARD",
                                  "RESTAURANT_CARD",
                                  "RESTAURANT_TICKET",
                                ];
                            const next = e.target.checked
                              ? Array.from(new Set([...current, m.id as any]))
                              : current.filter((x) => x !== (m.id as any));
                            updateSettings({
                              paymentEnabledMethods:
                                next.length > 0
                                  ? (next as any)
                                  : (["CASH"] as any),
                            });
                          }}
                        />
                        {m.label}
                      </label>
                    );
                  })}
                </div>
              </div>
              <button
                type="button"
                onClick={handleSaveExternalCardApi}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-black uppercase tracking-widest"
              >
                Enregistrer API externe
              </button>
              <button
                type="button"
                onClick={handleTestExternalCardApi}
                className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-black uppercase tracking-widest ml-2"
              >
                Tester endpoint
              </button>
              {externalApiTestResult && (
                <div
                  className={`mt-3 rounded-xl border p-3 text-xs ${
                    externalApiTestResult.ok
                      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                      : "bg-rose-50 border-rose-200 text-rose-800"
                  }`}
                >
                  <p className="font-black">
                    Test: {externalApiTestResult.ok ? "OK" : "KO"}
                    {externalApiTestResult.status
                      ? ` (HTTP ${externalApiTestResult.status})`
                      : ""}
                  </p>
                  {externalApiTestResult.message && (
                    <p className="mt-1 font-bold">
                      {externalApiTestResult.message}
                    </p>
                  )}
                  <pre className="mt-2 max-h-48 overflow-auto bg-white/70 rounded-lg p-2 text-[10px] leading-relaxed">
                    {JSON.stringify(
                      externalApiTestResult.response ?? externalApiTestResult,
                      null,
                      2,
                    )}
                  </pre>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Ticket size={18} className="text-indigo-600" />
                  <h3 className="text-lg font-black text-slate-800">
                    Ticket restaurant
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="Code ticket"
                    value={voucherCode}
                    onChange={(e) => setVoucherCode(e.target.value)}
                    className="md:col-span-2 px-4 py-2 rounded-xl border border-slate-200 bg-white font-bold text-sm"
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.001"
                    placeholder="Montant"
                    value={voucherAmount}
                    onChange={(e) => setVoucherAmount(e.target.value)}
                    className="px-4 py-2 rounded-xl border border-slate-200 bg-white font-black text-center text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCreateVoucher}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-black uppercase tracking-widest"
                >
                  Créer ticket resto
                </button>
                <div className="pt-2 border-t border-slate-200 space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Scanner/rechercher code ticket"
                      value={voucherLookupCode}
                      onChange={(e) => setVoucherLookupCode(e.target.value)}
                      className="flex-1 px-4 py-2 rounded-xl border border-slate-200 bg-white font-bold text-sm"
                    />
                    <button
                      type="button"
                      onClick={handleLookupVoucher}
                      className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-black"
                    >
                      <ScanLine size={16} />
                    </button>
                  </div>
                  {voucherLookupResult && (
                    <div className="rounded-xl bg-white border border-slate-200 px-4 py-3 text-xs font-bold text-slate-700">
                      <p>Code: {voucherLookupResult.code}</p>
                      <p>
                        Solde: {formatAmount(voucherLookupResult.remainingAmount)}{" "}
                        {settings.currency}
                      </p>
                      <p>Statut: {voucherLookupResult.status}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <CreditCard size={18} className="text-emerald-600" />
                  <h3 className="text-lg font-black text-slate-800">
                    Carte restaurant
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="Code carte"
                    value={cardCode}
                    onChange={(e) => setCardCode(e.target.value)}
                    className="px-4 py-2 rounded-xl border border-slate-200 bg-white font-bold text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Porteur (optionnel)"
                    value={cardHolderName}
                    onChange={(e) => setCardHolderName(e.target.value)}
                    className="px-4 py-2 rounded-xl border border-slate-200 bg-white font-bold text-sm"
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.001"
                    placeholder="Solde initial"
                    value={cardInitialBalance}
                    onChange={(e) => setCardInitialBalance(e.target.value)}
                    className="px-4 py-2 rounded-xl border border-slate-200 bg-white font-black text-center text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCreateCard}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase tracking-widest"
                >
                  Créer carte resto
                </button>
                <div className="pt-2 border-t border-slate-200 space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Scanner/rechercher code carte"
                      value={cardLookupCode}
                      onChange={(e) => setCardLookupCode(e.target.value)}
                      className="flex-1 px-4 py-2 rounded-xl border border-slate-200 bg-white font-bold text-sm"
                    />
                    <button
                      type="button"
                      onClick={handleLookupCard}
                      className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-black"
                    >
                      <ScanLine size={16} />
                    </button>
                  </div>
                  {cardLookupResult && (
                    <div className="space-y-2">
                      <div className="rounded-xl bg-white border border-slate-200 px-4 py-3 text-xs font-bold text-slate-700">
                        <p>Code: {cardLookupResult.code}</p>
                        <p>Porteur: {cardLookupResult.holderName || "-"}</p>
                        <p>
                          Solde: {formatAmount(cardLookupResult.balance)}{" "}
                          {settings.currency}
                        </p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <input
                          type="number"
                          min={0}
                          step="0.001"
                          placeholder="Montant recharge"
                          value={cardTopupAmount}
                          onChange={(e) => setCardTopupAmount(e.target.value)}
                          className="px-4 py-2 rounded-xl border border-slate-200 bg-white font-black text-center text-sm"
                        />
                        <input
                          type="text"
                          placeholder="Référence"
                          value={cardTopupReference}
                          onChange={(e) => setCardTopupReference(e.target.value)}
                          className="md:col-span-2 px-4 py-2 rounded-xl border border-slate-200 bg-white font-bold text-sm"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleTopupCard}
                        className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-black uppercase tracking-widest"
                      >
                        Recharger carte
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <div className="xl:col-span-1 rounded-2xl border border-slate-100 p-5">
                <h4 className="text-sm font-black text-slate-800 mb-3">
                  Tickets restos récents
                </h4>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1 scrollbar-hide">
                  {vouchers.map((v) => (
                    <div
                      key={v.id}
                      className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 text-xs font-bold"
                    >
                      <p className="text-slate-700">{v.code}</p>
                      <p className="text-slate-500">
                        {formatAmount(v.remainingAmount)} / {formatAmount(v.amount)}{" "}
                        {settings.currency}
                      </p>
                    </div>
                  ))}
                  {vouchers.length === 0 && (
                    <p className="text-xs text-slate-400 font-bold">
                      Aucun ticket.
                    </p>
                  )}
                </div>
              </div>
              <div className="xl:col-span-1 rounded-2xl border border-slate-100 p-5">
                <h4 className="text-sm font-black text-slate-800 mb-3">
                  Cartes restos récentes
                </h4>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1 scrollbar-hide">
                  {cards.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 text-xs font-bold"
                    >
                      <p className="text-slate-700">{c.code}</p>
                      <p className="text-slate-500">
                        Solde: {formatAmount(c.balance)} {settings.currency}
                      </p>
                    </div>
                  ))}
                  {cards.length === 0 && (
                    <p className="text-xs text-slate-400 font-bold">
                      Aucune carte.
                    </p>
                  )}
                </div>
              </div>
              <div className="xl:col-span-1 rounded-2xl border border-slate-100 p-5">
                <h4 className="text-sm font-black text-slate-800 mb-3">
                  Historique carte (code recherché)
                </h4>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1 scrollbar-hide">
                  {cardMovements.map((m) => (
                    <div
                      key={m.id}
                      className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 text-xs font-bold"
                    >
                      <p className="text-slate-700">
                        {m.type} {formatAmount(m.amount)} {settings.currency}
                      </p>
                      <p className="text-slate-500">
                        {formatDateTime(m.createdAt)} • {m.reference || "-"}
                      </p>
                    </div>
                  ))}
                  {cardMovements.length === 0 && (
                    <p className="text-xs text-slate-400 font-bold">
                      Aucun mouvement.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "reservations" && (
          <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-black text-slate-800">
                  Historique des reservations
                </h3>
                <p className="text-xs text-slate-400">
                  Suivi des tables reservees et liberees
                </p>
              </div>
              <button
                onClick={refreshReservations}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest"
              >
                Rafraichir
              </button>
            </div>

            {reservationLoading && (
              <p className="text-slate-400 text-sm font-bold">Chargement...</p>
            )}

            {!reservationLoading && reservationHistory.length === 0 && (
              <p className="text-slate-400 text-sm font-bold">
                Aucune reservation trouvee
              </p>
            )}

            {!reservationLoading && reservationHistory.length > 0 && (
              <div className="grid grid-cols-1 gap-3">
                {reservationHistory.map((reservation) => (
                  <div
                    key={reservation.id}
                    className="rounded-2xl border border-slate-100 bg-slate-50 px-5 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                  >
                    <div>
                      <p className="text-sm font-black text-slate-800">
                        Table {reservation.tableNumber}
                        <span className="text-[10px] font-bold text-slate-400 ml-2">
                          {zones.find((z) => z.id === reservation.zoneId)
                            ?.name || ""}
                        </span>
                      </p>
                      <p className="text-[10px] font-black text-sky-700">
                        Par: {reservation.reservedBy || "-"}
                      </p>
                    </div>
                    <div className="text-[10px] font-black text-slate-500">
                      <p>Debut: {formatDateTime(reservation.reservedAt)}</p>
                      <p>Fin: {formatDateTime(reservation.reservedUntil)}</p>
                      <p>Liberee: {formatDateTime(reservation.releasedAt)}</p>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                        reservation.releasedAt
                          ? "bg-slate-200 text-slate-600"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {reservation.releasedAt ? "Terminee" : "Active"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "shifts" && (
          <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-black text-slate-800">
                  Historique des shifts
                </h3>
                <p className="text-xs text-slate-400">
                  Totaux par serveur et par shift
                </p>
              </div>
              <button
                onClick={refreshShifts}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest"
              >
                Rafraichir
              </button>
            </div>

            {shiftLoading && (
              <p className="text-slate-400 text-sm font-bold">Chargement...</p>
            )}

            {!shiftLoading && shiftSummaries.length === 0 && (
              <p className="text-slate-400 text-sm font-bold">
                Aucun shift trouve
              </p>
            )}

            {!shiftLoading && shiftSummaries.length > 0 && (
              <>
                <div className="flex flex-wrap gap-3 items-end mb-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                      Date
                    </label>
                    <input
                      type="date"
                      value={shiftFilterDate}
                      onChange={(e) => setShiftFilterDate(e.target.value)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                      Serveur
                    </label>
                    <select
                      value={shiftFilterUserId}
                      onChange={(e) => setShiftFilterUserId(e.target.value)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 min-w-[140px]"
                    >
                      <option value="">Tous</option>
                      {allUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.role})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                      Heure de début
                    </label>
                    <input
                      type="time"
                      value={shiftFilterFromTime}
                      onChange={(e) => setShiftFilterFromTime(e.target.value)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                      Heure de fin
                    </label>
                    <input
                      type="time"
                      value={shiftFilterToTime}
                      onChange={(e) => setShiftFilterToTime(e.target.value)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {shiftSummaries
                    .filter((summary) => {
                      const s = summary.shift;
                      const openedAt = Number(s.openedAt || 0);
                      if (!Number.isFinite(openedAt)) return false;

                      if (shiftFilterDate) {
                        const d = new Date(openedAt);
                        const iso = d.toISOString().slice(0, 10);
                        if (iso !== shiftFilterDate) return false;
                      }

                      if (shiftFilterUserId && s.userId !== shiftFilterUserId) {
                        return false;
                      }

                      if (shiftFilterFromTime) {
                        const [h, m] = shiftFilterFromTime.split(":");
                        const fromMinutes = Number(h) * 60 + Number(m || 0);
                        const d = new Date(openedAt);
                        const minutes = d.getHours() * 60 + d.getMinutes();
                        if (minutes < fromMinutes) return false;
                      }

                      if (shiftFilterToTime) {
                        const [h, m] = shiftFilterToTime.split(":");
                        const toMinutes = Number(h) * 60 + Number(m || 0);
                        const d = new Date(openedAt);
                        const minutes = d.getHours() * 60 + d.getMinutes();
                        if (minutes > toMinutes) return false;
                      }

                      return true;
                    })
                    .map((summary) => (
                      <div
                        key={summary.shift.id}
                        className="rounded-2xl border border-slate-100 bg-slate-50 px-5 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                      >
                        <div>
                          <p className="text-sm font-black text-slate-800">
                            {summary.shift.userName}
                            <span className="text-[10px] font-bold text-slate-400 ml-2">
                              {summary.shift.role}
                            </span>
                          </p>
                          <p className="text-[10px] font-black text-slate-500">
                            Debut: {formatDateTime(summary.shift.openedAt)}
                          </p>
                          <p className="text-[10px] font-black text-slate-500">
                            Fin:{" "}
                            {formatDateTime(summary.shift.closedAt || null)}
                          </p>
                        </div>
                        <div className="text-[10px] font-black text-slate-500">
                          <p>
                            Ouverture: {formatAmount(summary.shift.openingFund)}{" "}
                            {settings.currency}
                          </p>
                          <p>
                            Cloture: {formatAmount(summary.shift.closingFund)}{" "}
                            {settings.currency}
                          </p>
                          <p>
                            Ventes: {formatAmount(summary.totals.totalSales)}{" "}
                            {settings.currency}
                          </p>
                          <p>
                            Net:{" "}
                            {formatAmount(
                              Number(summary.shift.closingFund || 0) -
                                Number(summary.shift.openingFund || 0),
                            )}{" "}
                            {settings.currency}
                          </p>
                          <p>Cash: {formatAmount(summary.totals.cashSales)}</p>
                          <p>Carte: {formatAmount(summary.totals.cardSales)}</p>
                          <p>Commandes: {summary.totals.orderCount}</p>
                          <p>Payees: {summary.totals.paidOrders}</p>
                          <p>Non payees: {summary.totals.unpaidOrders}</p>
                          <p>Tables servies: {summary.totals.tableCount}</p>
                        </div>
                        <span
                          className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                            summary.shift.status === "OPEN"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {summary.shift.status === "OPEN"
                            ? "En cours"
                            : "Ferme"}
                        </span>
                      </div>
                    ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
      <HtmlTemplateDesigner
        open={designerModalKind !== null}
        title={
          designerModalKind === "client"
            ? "Designer visuel - Ticket client"
            : designerModalKind === "kitchen"
              ? "Designer visuel - Bon cuisine"
              : "Designer visuel - Bon bar"
        }
        initialHtml={
          designerModalKind === "client"
            ? designerTemplates.clientHtml
            : designerModalKind === "kitchen"
              ? designerTemplates.kitchenHtml
              : designerTemplates.barHtml
        }
        logoPreviewUrl={
          genIdentity.logoUrl
            ? `${genIdentity.logoUrl.startsWith("http") ? "" : (window.location.protocol + "//" + window.location.hostname + ":3001")}${genIdentity.logoUrl}`
            : ""
        }
        onClose={() => setDesignerModalKind(null)}
        onSave={async (html, css) => {
          const full = `<style>${css || ""}</style>\n${html || ""}`;
          const next = {
            clientHtml:
              designerModalKind === "client" ? full : String(designerTemplates.clientHtml || ""),
            kitchenHtml:
              designerModalKind === "kitchen" ? full : String(designerTemplates.kitchenHtml || ""),
            barHtml:
              designerModalKind === "bar" ? full : String(designerTemplates.barHtml || ""),
          };
          if (designerModalKind === "client") {
            setDesignerTemplates((p) => ({ ...p, clientHtml: full }));
          } else if (designerModalKind === "kitchen") {
            setDesignerTemplates((p) => ({ ...p, kitchenHtml: full }));
          } else if (designerModalKind === "bar") {
            setDesignerTemplates((p) => ({ ...p, barHtml: full }));
          }
          try {
            await updateSettings({
              designerPrintTemplates: {
                clientHtml: String(next.clientHtml || ""),
                kitchenHtml: String(next.kitchenHtml || ""),
                barHtml: String(next.barHtml || ""),
              },
            } as any);
            notifySuccess("Template designer enregistré et appliqué.");
          } catch (e: any) {
            notifyError(
              e?.message || "Impossible d'enregistrer le template designer.",
            );
          }
          setDesignerModalKind(null);
        }}
      />
    </div>
  );
};

export default SettingsManager;
