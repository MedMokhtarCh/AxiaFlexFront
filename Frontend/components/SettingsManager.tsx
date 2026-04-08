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
} from "lucide-react";

type ClientTicketTemplateUi = "CLASSIC" | "COMPACT" | "MODERN";
type ClientKdsModeUi = "STANDARD" | "WALLBOARD" | "AUTO";

const GeneralSettingsSection: React.FC<{
  title: string;
  description?: string;
  onSave: () => void | Promise<void>;
  onReset: () => void;
  children: React.ReactNode;
}> = ({ title, description, onSave, onReset, children }) => {
  const [busy, setBusy] = useState(false);
  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-white shadow-sm p-6 sm:p-8 space-y-5">
      <div>
        <h4 className="text-lg sm:text-xl font-black text-slate-800 tracking-tight">
          {title}
        </h4>
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
    deletePrinter,
    getDetectedPrinters,
    getTerminalNodes,
    bindPrinterTerminal,
    settings,
    updateSettings,
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
    getPdfArchives,
    downloadPdfArchiveFile,
  } = usePOS();

  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

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
  const [bindingDrafts, setBindingDrafts] = useState<
    Record<string, { terminalNodeId: string; terminalPrinterLocalId: string }>
  >({});

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

  useEffect(() => {
    if (activeTab !== "hardware") return;
    const uid = String(currentUser?.id || "").trim();
    if (!uid) return;
    void getTerminalNodes(uid)
      .then((res) => {
        const terminals = Array.isArray(res?.terminals) ? res.terminals : [];
        setTerminalNodes(terminals);
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
      })
      .catch(() => setTerminalNodes([]));
  }, [activeTab, currentUser?.id, getTerminalNodes, printers]);

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

  const adminLogEntries = useMemo(
    () => parseAdminLogJsonl(adminLogContent),
    [adminLogContent],
  );

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
        };
        if (!r.ok || cancelled) return;
        setAdminLogContent(typeof j.content === "string" ? j.content : "");
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
    timbreValue: 0,
    applyTvaToTicket: false,
    applyTvaToInvoice: false,
    applyTimbreToTicket: false,
    applyTimbreToInvoice: false,
    printPreviewOnValidate: false,
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
      timbreValue: settings.timbreValue ?? 0,
      applyTvaToTicket: Boolean(settings.applyTvaToTicket),
      applyTvaToInvoice: Boolean(settings.applyTvaToInvoice),
      applyTimbreToTicket: Boolean(settings.applyTimbreToTicket),
      applyTimbreToInvoice: Boolean(settings.applyTimbreToInvoice),
      printPreviewOnValidate: Boolean(settings.printPreviewOnValidate),
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

  const activeTabMeta =
    SETTINGS_TAB_ITEMS.find((tab) => tab.id === activeTab) ||
    SETTINGS_TAB_ITEMS[0];

  return (
    <div className="flex flex-col h-full gap-4 sm:gap-8">
      <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm shrink-0 w-max overflow-x-auto max-w-full scrollbar-hide">
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

      <div className="bg-white border border-slate-100 rounded-2xl px-4 sm:px-5 py-4">
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

      <div className="flex-1 overflow-y-auto pr-1 sm:pr-2 pb-20 space-y-5 sm:space-y-8 scrollbar-hide">
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
                onSave={() =>
                  updateSettings({
                    taxId: genFiscal.taxId.trim() || null,
                    tvaRate: genFiscal.tvaRate,
                    timbreValue: genFiscal.timbreValue,
                    applyTvaToTicket: genFiscal.applyTvaToTicket,
                    applyTvaToInvoice: genFiscal.applyTvaToInvoice,
                    applyTimbreToTicket: genFiscal.applyTimbreToTicket,
                    applyTimbreToInvoice: genFiscal.applyTimbreToInvoice,
                    printPreviewOnValidate: genFiscal.printPreviewOnValidate,
                  } as any)
                }
                onReset={() =>
                  setGenFiscal({
                    taxId: settings.taxId ?? "",
                    tvaRate: settings.tvaRate ?? 0,
                    timbreValue: settings.timbreValue ?? 0,
                    applyTvaToTicket: Boolean(settings.applyTvaToTicket),
                    applyTvaToInvoice: Boolean(settings.applyTvaToInvoice),
                    applyTimbreToTicket: Boolean(settings.applyTimbreToTicket),
                    applyTimbreToInvoice: Boolean(settings.applyTimbreToInvoice),
                    printPreviewOnValidate: Boolean(
                      settings.printPreviewOnValidate,
                    ),
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
                title="Modèle ticket client"
                description="Style du ticket, zones affichées, export / import JSON et aperçu."
                onSave={() =>
                  updateSettings({
                    clientTicketTemplate: genTicket.clientTicketTemplate,
                    clientTicketLayout: {
                      ...(genTicket.clientTicketLayout || {}),
                    } as any,
                  } as any)
                }
                onReset={() =>
                  setGenTicket({
                    clientTicketTemplate: (settings.clientTicketTemplate ||
                      "CLASSIC") as ClientTicketTemplateUi,
                    clientTicketLayout: JSON.parse(
                      JSON.stringify(settings.clientTicketLayout || {}),
                    ),
                  })
                }
              >
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
                        />
                      </label>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleExportTicketTemplate}
                      className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-black uppercase tracking-wider hover:bg-indigo-100"
                    >
                      <Download size={12} />
                      Exporter modèle
                    </button>
                    <button
                      type="button"
                      onClick={() => ticketTemplateImportRef.current?.click()}
                      className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-black uppercase tracking-wider hover:bg-emerald-100"
                    >
                      <Upload size={12} />
                      Importer modèle
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
                title="Impression production (cuisine / bar)"
                description="Bons cuisine et bar : en-têtes, options d’affichage et tests d’impression. Son de demande d’addition."
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-slate-200 p-3 space-y-2">
                      <p className="text-[10px] font-black text-slate-700 uppercase">
                        Cuisine
                      </p>
                      <input
                        type="text"
                        value={kitchenTpl.title}
                        onChange={(e) =>
                          setGenKitchen((g) => ({
                            ...g,
                            kitchenBarPrintTemplates: {
                              ...(g.kitchenBarPrintTemplates as object),
                              kitchen: {
                                ...((g.kitchenBarPrintTemplates as any)?.kitchen ||
                                  {}),
                                title: e.target.value,
                              },
                            },
                          }))
                        }
                        placeholder="Titre bon cuisine"
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold"
                      />
                      <textarea
                        value={kitchenTpl.footerText}
                        onChange={(e) =>
                          setGenKitchen((g) => ({
                            ...g,
                            kitchenBarPrintTemplates: {
                              ...(g.kitchenBarPrintTemplates as object),
                              kitchen: {
                                ...((g.kitchenBarPrintTemplates as any)?.kitchen ||
                                  {}),
                                footerText: e.target.value,
                              },
                            },
                          }))
                        }
                        placeholder="Pied bon cuisine (optionnel)"
                        rows={2}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold resize-none"
                      />
                    </div>
                    <div className="rounded-xl border border-slate-200 p-3 space-y-2">
                      <p className="text-[10px] font-black text-slate-700 uppercase">
                        Bar / Barman
                      </p>
                      <input
                        type="text"
                        value={barTpl.title}
                        onChange={(e) =>
                          setGenKitchen((g) => ({
                            ...g,
                            kitchenBarPrintTemplates: {
                              ...(g.kitchenBarPrintTemplates as object),
                              bar: {
                                ...((g.kitchenBarPrintTemplates as any)?.bar || {}),
                                title: e.target.value,
                              },
                            },
                          }))
                        }
                        placeholder="Titre bon bar"
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold"
                      />
                      <textarea
                        value={barTpl.footerText}
                        onChange={(e) =>
                          setGenKitchen((g) => ({
                            ...g,
                            kitchenBarPrintTemplates: {
                              ...(g.kitchenBarPrintTemplates as object),
                              bar: {
                                ...((g.kitchenBarPrintTemplates as any)?.bar || {}),
                                footerText: e.target.value,
                              },
                            },
                          }))
                        }
                        placeholder="Pied bon bar (optionnel)"
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
                          <span>Cuisine: {label}</span>
                          <input
                            type="checkbox"
                            checked={Boolean((kitchenTpl as any)[key])}
                            onChange={(e) =>
                              setGenKitchen((g) => ({
                                ...g,
                                kitchenBarPrintTemplates: {
                                  ...(g.kitchenBarPrintTemplates as object),
                                  kitchen: {
                                    ...((g.kitchenBarPrintTemplates as any)
                                      ?.kitchen || {}),
                                    [key]: e.target.checked,
                                  },
                                },
                              }))
                            }
                          />
                        </div>
                        <div className="flex items-center justify-between bg-slate-50 rounded-lg px-2 py-1.5 mt-1.5">
                          <span>Bar: {label}</span>
                          <input
                            type="checkbox"
                            checked={Boolean((barTpl as any)[key])}
                            onChange={(e) =>
                              setGenKitchen((g) => ({
                                ...g,
                                kitchenBarPrintTemplates: {
                                  ...(g.kitchenBarPrintTemplates as object),
                                  bar: {
                                    ...((g.kitchenBarPrintTemplates as any)?.bar ||
                                      {}),
                                    [key]: e.target.checked,
                                  },
                                },
                              }))
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
                          };
                          if (r2.ok)
                            setAdminLogContent(
                              typeof j2.content === "string"
                                ? j2.content
                                : "",
                            );
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

        {activeTab === "hardware" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white p-10 rounded-[3rem] border border-slate-100 space-y-6">
              <h3 className="text-xl font-black text-slate-800">Imprimantes</h3>
              <div className="space-y-4">
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      const list = await getDetectedPrinters();
                      setDetectedPrinters(Array.isArray(list) ? list : []);
                    }}
                    className="flex-1 bg-slate-900 text-white font-black py-3 rounded-2xl"
                  >
                    Détecter Imprimantes
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
                  <option value="">Imprimantes détectées...</option>
                  {detectedPrinters.map((p) => (
                    <option key={p.Name} value={p.Name}>
                      {p.Name}
                    </option>
                  ))}
                </select>
                <p className="text-xs font-bold text-slate-500">
                  Nom Windows / file d&apos;attente (tel qu&apos;affiché dans le
                  système).
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
                  onClick={() => {
                    if (!newPrinterName.trim()) return;
                    if (newPrinterIsReceipt) {
                      void addPrinter(newPrinterName.trim(), "RECEIPT", null);
                    } else {
                      const label = newPrinterStationLabel.trim();
                      if (!label) {
                        notifyError(
                          "Indiquez un libellé de poste (ex. Bar, Terrasse).",
                        );
                        return;
                      }
                      void addPrinter(
                        newPrinterName.trim(),
                        label,
                        newPrinterBonProfile,
                      );
                    }
                    setNewPrinterName("");
                    setNewPrinterStationLabel("");
                    setSelectedDetected("");
                    setBonProfileTouched(false);
                    setNewPrinterBonProfile("kitchen");
                    setNewPrinterIsReceipt(false);
                  }}
                  className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl"
                >
                  Connecter
                </button>
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
                          Terminal agent:{" "}
                          {String((p as any).terminalNodeId || "").trim()
                            ? (terminalNodes.find(
                                (t) =>
                                  t.id ===
                                  String((p as any).terminalNodeId || "").trim(),
                              )?.alias || "lié")
                            : "non lié (mode local)"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!isReceiptPrinter(p) ? (
                        <button
                          type="button"
                          onClick={() => handlePrintOnePrinterTest(p.id)}
                          className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-[10px] font-black uppercase text-slate-600"
                        >
                          Test
                        </button>
                      ) : null}
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
    </div>
  );
};

export default SettingsManager;
