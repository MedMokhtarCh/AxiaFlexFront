import React, { useState, useMemo, useEffect } from "react";
import QRCode from "qrcode";
import { TableStatus, Order, OrderStatus, Role, TableConfig } from "../types";
import {
  Users,
  Plus,
  MapPin,
  ShieldAlert,
  Printer,
  X,
  Edit3,
  Receipt,
  LogOut,
  QrCode,
  Copy,
  LayoutGrid,
  MapPinned,
} from "lucide-react";
import { usePOS } from "../store/POSContext";
import { notifyError } from "../utils/notify";
import {
  getRoomDisplayMode,
  setRoomDisplayMode as persistRoomDisplayMode,
  subscribeRoomDisplayMode,
  type RoomDisplayMode,
} from "../utils/roomDisplayPreference";
import {
  floorRoomInnerClassName,
  floorRoomOuterClassName,
  floorVignetteClassName,
  floorWoodBackgroundStyle,
  FloorPlanChairHints,
} from "./floorPlanTheme";

interface TableLayoutProps {
  onSelectTable: (
    tableNum: string,
    existingOrderId?: string,
    zoneId?: string,
    options?: { openPayment?: boolean },
  ) => void;
  enableReservations?: boolean;
}

const formatAmount = (value: unknown, digits = 3) =>
  Number(value ?? 0).toFixed(digits);

const DEFAULT_RESERVATION_MINUTES = 60;

const toLocalInputValue = (value?: number | string | null) => {
  if (!value) return "";
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return "";
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const formatDateTime = (value?: number | string | null) => {
  if (!value) return "-";
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
};

const formatTimeLeft = (
  reservedUntil: number | null | undefined,
  now: number,
) => {
  if (!reservedUntil) return "-";
  const diff = Number(reservedUntil) - now;
  if (diff <= 0) return "Expiree";
  const totalMinutes = Math.ceil(diff / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h${minutes}m`;
};

const TicketPaperPreview: React.FC<{
  order: Order;
  onClose: () => void;
  onEdit: () => void;
  settings: any;
  onOpenPayment: () => void;
  tickets: any[];
  onPrintTicket: (id: string) => void;
  /** Impression ticket client (backend, modèle Paramètres) — dernier ticket émis. */
  onPrintClientTicket: () => void | Promise<void>;
}> = ({
  order,
  onClose,
  onEdit,
  settings,
  onOpenPayment,
  tickets,
  onPrintTicket,
  onPrintClientTicket,
}) => {
  // Ensure order.items is always a defined array
  const safeItems = Array.isArray(order.items) ? order.items : [];
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-300 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-300">
      <div className="flex flex-col gap-4 sm:gap-6 max-w-3xl w-full max-h-[92vh] overflow-y-auto pr-1">
        {/* The Paper Ticket */}
        <div className="bg-[#fdfdfd] shadow-2xl p-5 sm:p-8 rounded-2xl sm:rounded-sm relative overflow-hidden flex flex-col font-mono text-slate-800 border-t-8 border-indigo-600">
          {/* Jagged edge effect (top/bottom) */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-[radial-gradient(circle,transparent_4px,#fff_4px)] bg-size-[12px_12px] opacity-10"></div>

          <div className="text-center space-y-2 mb-8">
            <h2 className="text-lg font-bold uppercase tracking-tighter">
              {settings.restaurantName}
            </h2>
            <p className="text-[10px] opacity-60">Tunis, Tunisie</p>
            <p className="text-[10px] opacity-60">Tél: +216 71 000 000</p>
            <div className="border-b border-dashed border-slate-300 my-4"></div>
            <div className="flex justify-between text-[10px] uppercase font-bold">
              <span>Ticket: #{order.id.slice(-6)}</span>
              <span>Table: {order.tableNumber}</span>
            </div>
            <div className="flex justify-between text-[10px] opacity-60">
              <span>{new Date(order.createdAt).toLocaleDateString()}</span>
              <span>{new Date(order.createdAt).toLocaleTimeString()}</span>
            </div>
          </div>

          <div className="space-y-4 flex-1">
            <div className="flex justify-between text-[10px] border-b border-slate-200 pb-1 font-bold">
              <span className="w-1/2">ARTICLE</span>
              <span className="w-1/4 text-center">QTÉ</span>
              <span className="w-1/4 text-right">PRIX</span>
            </div>
            {safeItems.map((item, idx) => (
              <div key={idx} className="flex flex-col gap-0.5 mb-2">
                <div className="flex justify-between text-[11px] leading-tight">
                  <span className="w-1/2 uppercase">{item.name}</span>
                  <span className="w-1/4 text-center">x{item.quantity}</span>
                  <span className="w-1/4 text-right">
                    {formatAmount(
                      (Number(item.price) || 0) * (Number(item.quantity) || 0),
                    )}
                  </span>
                </div>
                {item.notes && (
                  <p className="text-[9px] italic opacity-50 pl-2">
                    - {item.notes}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="mt-8 space-y-2 pt-4 border-t border-dashed border-slate-300">
            <div className="flex justify-between text-[10px]">
              <span>Sous-total</span>
              <span>
                {formatAmount(
                  (Number(order.total) || 0) - (Number(order.timbre) || 0),
                )}{" "}
                DT
              </span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span>Timbre Fiscal</span>
              <span>{formatAmount(order.timbre)} DT</span>
            </div>
            <div className="flex justify-between text-lg font-bold border-t border-slate-800 pt-2 mt-2">
              <span>TOTAL</span>
              <span>{formatAmount(order.total)} DT</span>
            </div>
          </div>

          <div className="mt-10 text-center space-y-4">
            <p className="text-[9px] uppercase tracking-widest opacity-40">
              Serveur: {order.serverName}
            </p>
            <p className="text-[10px] font-bold">MERCI DE VOTRE VISITE !</p>
            <div className="flex justify-center py-4">
              <div className="w-32 h-8 bg-slate-100 rounded opacity-20 flex items-center justify-center text-[8px] font-black tracking-[0.5em] text-slate-400">
                BARCODE
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <button
            onClick={onClose}
            className="min-h-14 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white border border-white/20 px-3 py-3 rounded-2xl font-black text-sm uppercase tracking-wide transition-all"
          >
            Fermer
          </button>
          <button
            onClick={onEdit}
            className="min-h-14 bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl shadow-indigo-900/40 px-3 py-3 rounded-2xl font-black text-sm uppercase tracking-wide flex items-center justify-center gap-2 transition-all"
          >
            <Edit3 size={18} /> Modifier
          </button>
          <button
            onClick={onEdit}
            className="min-h-14 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-3 py-3 rounded-2xl font-black text-sm uppercase tracking-wide flex items-center justify-center gap-2 transition-all"
          >
            <Plus size={18} /> Ajouter
          </button>
          <button
            onClick={onOpenPayment}
            className="min-h-14 bg-rose-600 hover:bg-rose-700 text-white shadow-xl shadow-rose-900/40 px-3 py-3 rounded-2xl font-black text-sm uppercase tracking-wide flex items-center justify-center gap-2 transition-all"
          >
            Paiement
          </button>
          <button
            type="button"
            onClick={() => void onPrintClientTicket()}
            className="min-h-14 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xl shadow-emerald-900/40 rounded-2xl flex items-center justify-center gap-2 text-sm font-black uppercase tracking-wide transition-all"
          >
            <Printer size={18} />
            <span className="lg:hidden">Imprimer</span>
          </button>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-100">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
            Tickets émis
          </p>
          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {(Array.isArray(tickets) ? tickets : []).map((tk: any) => (
              <div key={tk.id} className="flex items-center justify-between text-sm">
                <div>
                  <div className="font-bold">{String(tk.code || '').toUpperCase()}</div>
                  <div className="text-[10px] text-slate-500">
                    {new Date(Number(tk.createdAt || Date.now())).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="font-black">{formatAmount(Number(tk.total || 0))} DT</div>
                  <button
                    onClick={() => onPrintTicket(String(tk.id))}
                    className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center"
                  >
                    <Printer size={14} />
                  </button>
                </div>
              </div>
            ))}
            {(!tickets || tickets.length === 0) && (
              <div className="text-[10px] text-slate-400">Aucun ticket pour cette commande</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const TableLayout: React.FC<TableLayoutProps> = ({
  onSelectTable,
  enableReservations = true,
}) => {
  const { orders, settings, zones, tables, currentUser, logout, updateTable, printTicket, printOrderClientReceiptProvisional, getTicketsByOrder, refreshOrders } =
    usePOS();
  const [previewOrder, setPreviewOrder] = useState<Order | null>(null);
  const [previewTickets, setPreviewTickets] = useState<any[]>([]);
  const [reservedTable, setReservedTable] = useState<TableConfig | null>(null);
  const [managedTable, setManagedTable] = useState<TableConfig | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [showReservedList, setShowReservedList] = useState(false);
  const [reservationName, setReservationName] = useState("");
  const [reservationStart, setReservationStart] = useState("");
  const [reservationDuration, setReservationDuration] = useState("60");
  const [reservationError, setReservationError] = useState("");
  const [reservationSaving, setReservationSaving] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [roomDisplayMode, setRoomDisplayMode] = useState<RoomDisplayMode>(() =>
    getRoomDisplayMode(),
  );

  useEffect(() => {
    return subscribeRoomDisplayMode((mode) => setRoomDisplayMode(mode));
  }, []);

  const canManageTables = useMemo(() => {
    if (!currentUser) return false;
    return [Role.ADMIN, Role.MANAGER, Role.CASHIER].includes(currentUser.role);
  }, [currentUser]);

  const canEditReservations = enableReservations && canManageTables;

  const visibleZones = useMemo(() => {
    if (!currentUser) return [];
    if ([Role.ADMIN, Role.MANAGER, Role.CASHIER].includes(currentUser.role))
      return zones;
    if (currentUser.role === Role.SERVER) {
      return zones.filter((z) => currentUser.assignedZoneIds?.includes(z.id));
    }
    return [];
  }, [zones, currentUser]);

  const [activeZoneId, setActiveZoneId] = useState<string>("");

  useEffect(() => {
    if (
      visibleZones.length > 0 &&
      !visibleZones.some((z) => z.id === activeZoneId)
    ) {
      setActiveZoneId(visibleZones[0].id);
    }
  }, [visibleZones, activeZoneId]);

  const buildClientLink = (token?: string) => {
    if (!token) return "";
    return `${window.location.origin}/?t=${token}`;
  };

  useEffect(() => {
    let cancelled = false;
    if (!managedTable?.token) {
      setQrDataUrl("");
      return;
    }
    const link = buildClientLink(managedTable.token);
    QRCode.toDataURL(link, { margin: 1, width: 220 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl("");
      });
    return () => {
      cancelled = true;
    };
  }, [managedTable?.token]);

  useEffect(() => {
    if (!managedTable) return;
    setReservationError("");
    setReservationName(managedTable.reservedBy || "");
    setReservationStart(toLocalInputValue(managedTable.reservedAt));
    if (managedTable.reservedAt && managedTable.reservedUntil) {
      const minutes = Math.max(
        1,
        Math.round(
          (Number(managedTable.reservedUntil) -
            Number(managedTable.reservedAt)) /
            60000,
        ),
      );
      setReservationDuration(String(minutes));
    } else {
      setReservationDuration(String(DEFAULT_RESERVATION_MINUTES));
    }
  }, [managedTable?.id]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 30000);
    return () => window.clearInterval(interval);
  }, []);

  const handleReserveTable = async () => {
    if (!managedTable) return;
    const activeOrder = getActiveOrderForTable(
      managedTable.number,
      managedTable.zoneId,
    );
    if (activeOrder) {
      setReservationError("Table occupee, reservation impossible.");
      return;
    }
    if (managedTable.status === TableStatus.RESERVED) return;
    const trimmed = reservationName.trim();
    if (!trimmed) {
      setReservationError("Nom de reservation requis.");
      return;
    }
    const durationMinutes = Math.max(
      1,
      Number.parseInt(reservationDuration || "", 10) ||
        DEFAULT_RESERVATION_MINUTES,
    );
    const startMs = reservationStart
      ? new Date(reservationStart).getTime()
      : Date.now();
    if (Number.isNaN(startMs)) {
      setReservationError("Heure de reservation invalide.");
      return;
    }
    const reservedUntil = startMs + durationMinutes * 60 * 1000;
    setReservationSaving(true);
    setReservationError("");
    try {
      const updated = await updateTable(managedTable.id, {
        status: TableStatus.RESERVED,
        reservedBy: trimmed,
        reservedAt: startMs,
        reservedUntil,
      });
      if (updated) {
        setManagedTable(updated);
      } else {
        setReservationError("Reservation echouee. Reessayez.");
      }
    } catch {
      setReservationError("Reservation echouee. Reessayez.");
    } finally {
      setReservationSaving(false);
    }
  };

  const handleUnlockTable = async (table: TableConfig) => {
    const updated = await updateTable(table.id, {
      status: TableStatus.AVAILABLE,
      reservedBy: null,
    });
    if (updated && managedTable?.id === table.id) setManagedTable(updated);
    if (reservedTable?.id === table.id) setReservedTable(null);
  };

  const handleCopyLink = async () => {
    if (!managedTable?.token) return;
    const link = buildClientLink(managedTable.token);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  };

  const handlePrintQr = () => {
    if (!managedTable?.token || !qrDataUrl) return;
    const link = buildClientLink(managedTable.token);
    const title = `Table ${managedTable.number} QR`;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 32px; text-align: center; }
      h1 { font-size: 20px; margin: 0 0 8px; }
      p { font-size: 12px; color: #555; margin: 0 0 16px; }
      img { width: 220px; height: 220px; }
    </style>
  </head>
  <body>
    <h1>Table ${managedTable.number}</h1>
    <p>${link}</p>
    <img src="${qrDataUrl}" alt="QR" />
  </body>
</html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  /** Commande qui occupe encore la table (plan de salle). */
  const getActiveOrderForTable = (tableNum: string, zoneId?: string) => {
    const num = String(tableNum ?? "").trim();
    const z = zoneId ?? activeZoneId;
    return orders.find((o) => {
      const st = String(o.status ?? "").toUpperCase();
      if (
        st === OrderStatus.COMPLETED ||
        st === OrderStatus.CANCELLED ||
        st === OrderStatus.INVOICED
      ) {
        return false;
      }
      if (String(o.tableNumber ?? "").trim() !== num) return false;
      if (o.zoneId) return String(o.zoneId) === String(z);
      return String(z) === String(activeZoneId);
    });
  };

  const filteredTables = useMemo(() => {
    return tables.filter((t) => t.zoneId === activeZoneId);
  }, [tables, activeZoneId]);

  const floorDims = (t: TableConfig) => {
    const cap = Number(t.capacity || 4);
    const shape =
      t.planShape === "rect" || t.planShape === "square"
        ? t.planShape
        : cap > 4
          ? "rect"
          : "square";
    const w =
      t.planW != null && t.planW > 0
        ? t.planW
        : shape === "rect"
          ? 16
          : 10;
    const h =
      t.planH != null && t.planH > 0
        ? t.planH
        : shape === "rect"
          ? 9
          : 10;
    return { w, h, shape };
  };

  const placedFloorTables = useMemo(
    () =>
      filteredTables.filter(
        (t) =>
          t.planX != null &&
          t.planY != null &&
          t.planW != null &&
          t.planH != null,
      ),
    [filteredTables],
  );

  const gridOnlyTables = useMemo(
    () =>
      filteredTables.filter(
        (t) =>
          !(
            t.planX != null &&
            t.planY != null &&
            t.planW != null &&
            t.planH != null
          ),
      ),
    [filteredTables],
  );

  const activeZoneLayout = useMemo(
    () => zones.find((z) => z.id === activeZoneId),
    [zones, activeZoneId],
  );

  const showFloorCanvas =
    roomDisplayMode === "plan" && placedFloorTables.length > 0;

  const tablesForCardGrid =
    roomDisplayMode === "simple" ? filteredTables : gridOnlyTables;

  const reservedTables = useMemo(() => {
    return tables.filter((t) => t.status === TableStatus.RESERVED);
  }, [tables]);

  const handleTableClick = async (tableNum: string, zoneId?: string) => {
    const activeOrder = getActiveOrderForTable(tableNum, zoneId);
    const table = tables.find(
      (t) => t.number === tableNum && (!zoneId || t.zoneId === zoneId),
    );
    if (activeOrder) {
      setPreviewOrder(activeOrder);
      try {
        const tks = await getTicketsByOrder(activeOrder.id);
        setPreviewTickets(Array.isArray(tks) ? tks : []);
      } catch {
        setPreviewTickets([]);
      }
      return;
    }
    if (table?.status === TableStatus.RESERVED) {
      setReservedTable(table);
      return;
    }
    if (canEditReservations && table) {
      setManagedTable(table);
      return;
    }
    // Si libre -> Ouvrir direct le POS
    onSelectTable(tableNum, undefined, zoneId);
  };

  return (
    <div className="h-full flex flex-col gap-6">
      {/* Header */}
      <div className="flex justify-between items-center bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm">
        <div className="flex items-center gap-6">
          <div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tighter">
              Plan de Salle
            </h2>
            <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">
              Temps Réel •{" "}
              {visibleZones.find((z) => z.id === activeZoneId)?.name ||
                "Sélectionnez une zone"}
            </p>
          </div>

          {canEditReservations && (
            <button
              onClick={() => setShowReservedList(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-amber-50 text-amber-700 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-amber-100 hover:bg-amber-600 hover:text-white transition-all shadow-sm"
            >
              Tables reservees
            </button>
          )}

          <button
            onClick={logout}
            className="flex items-center gap-2 px-5 py-2.5 bg-rose-50 text-rose-600 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-rose-100 hover:bg-rose-600 hover:text-white transition-all shadow-sm"
          >
            <LogOut size={16} />
            Déconnexion
          </button>
        </div>

        <div className="flex flex-col items-stretch gap-3 sm:items-end">
          <div
            className="flex w-full max-w-md items-center gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1 sm:w-auto"
            role="group"
            aria-label="Mode d'affichage du plan de salle"
          >
            <button
              type="button"
              onClick={() => persistRoomDisplayMode("simple")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all sm:flex-initial ${
                roomDisplayMode === "simple"
                  ? "bg-white text-indigo-700 shadow-md ring-1 ring-indigo-100"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <LayoutGrid size={16} className="shrink-0" />
              Grille simple
            </button>
            <button
              type="button"
              onClick={() => persistRoomDisplayMode("plan")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all sm:flex-initial ${
                roomDisplayMode === "plan"
                  ? "bg-white text-indigo-700 shadow-md ring-1 ring-indigo-100"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <MapPinned size={16} className="shrink-0" />
              Plan
            </button>
          </div>
          <div className="flex max-w-full gap-2 overflow-x-auto rounded-2xl border border-slate-100 bg-slate-50 p-1.5 scrollbar-hide sm:max-w-md">
            {visibleZones.map((zone) => (
              <button
                key={zone.id}
                type="button"
                onClick={() => setActiveZoneId(zone.id)}
                className={`whitespace-nowrap rounded-xl px-6 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                  activeZoneId === zone.id
                    ? "bg-indigo-600 text-white shadow-lg"
                    : "bg-white text-slate-500 hover:bg-slate-50"
                }`}
              >
                {zone.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tables Grid + plan perso */}
      <div className="flex-1 space-y-6 overflow-y-auto pb-10 pr-2 scrollbar-hide">
        {showFloorCanvas && (
          <div className={`${floorRoomOuterClassName} w-full`}>
            <div
              className={`${floorRoomInnerClassName} min-h-[min(70vh,600px)] w-full`}
              style={floorWoodBackgroundStyle}
            >
              <div className={floorVignetteClassName} aria-hidden />
              {activeZoneLayout &&
                activeZoneLayout.planX != null &&
                activeZoneLayout.planY != null &&
                activeZoneLayout.planW != null &&
                activeZoneLayout.planH != null && (
                  <div
                    className="pointer-events-none absolute overflow-hidden rounded-2xl border border-white/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_8px_28px_rgba(0,0,0,0.15)] ring-1 ring-black/10"
                    style={{
                      left: `${activeZoneLayout.planX}%`,
                      top: `${activeZoneLayout.planY}%`,
                      width: `${activeZoneLayout.planW}%`,
                      height: `${activeZoneLayout.planH}%`,
                      background:
                        activeZoneLayout.planFill || "rgba(255,255,255,0.18)",
                    }}
                  >
                    <span className="absolute left-3 top-2 max-w-[calc(100%-0.75rem)] truncate rounded-lg bg-white/92 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-slate-700 shadow-sm">
                      {activeZoneLayout.name}
                    </span>
                  </div>
                )}
              {placedFloorTables.map((table) => {
                const activeOrder = getActiveOrderForTable(
                  table.number,
                  table.zoneId,
                );
                const status = activeOrder
                  ? TableStatus.OCCUPIED
                  : table.status === TableStatus.RESERVED
                    ? TableStatus.RESERVED
                    : TableStatus.AVAILABLE;
                const { w, h, shape } = floorDims(table);
                const borderFree =
                  "border-emerald-500/95 shadow-[0_14px_32px_rgba(16,185,129,0.22)] hover:border-emerald-400";
                const borderRes =
                  "border-amber-400 shadow-[0_14px_32px_rgba(245,158,11,0.2)]";
                const borderOcc =
                  "border-rose-500 shadow-[0_14px_32px_rgba(244,63,94,0.22)]";
                return (
                  <div
                    key={table.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleTableClick(table.number, table.zoneId)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleTableClick(table.number, table.zoneId);
                      }
                    }}
                    className={`group absolute flex cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border-[3px] p-2 transition-all duration-200 hover:z-20 hover:scale-[1.04] min-h-[3.5rem] ${
                      status === TableStatus.AVAILABLE
                        ? `bg-gradient-to-b from-white to-stone-50 ${borderFree}`
                        : status === TableStatus.RESERVED
                          ? `bg-gradient-to-b from-amber-50 to-orange-50/90 ${borderRes}`
                          : `bg-gradient-to-b from-rose-50 to-white ${borderOcc}`
                    } ring-1 ring-black/5`}
                    style={{
                      left: `${table.planX}%`,
                      top: `${table.planY}%`,
                      width: `${w}%`,
                      height: `${h}%`,
                    }}
                  >
                    <div className="pointer-events-none absolute inset-x-[10%] top-[14%] bottom-[22%] rounded-lg bg-gradient-to-b from-amber-50/95 via-orange-50/60 to-amber-100/70 opacity-[0.85] shadow-inner ring-1 ring-amber-900/8" />
                    <FloorPlanChairHints
                      shape={shape === "rect" ? "rect" : "square"}
                      capacity={table.capacity}
                    />
                    {status === TableStatus.RESERVED && (
                      <div className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center">
                        <span className="text-amber-600/30 text-xs font-black uppercase tracking-[0.3em] rotate-[-28deg]">
                          Reservee
                        </span>
                      </div>
                    )}
                    <div className="relative z-[3] flex justify-between items-start gap-1">
                      <div
                        className={`flex min-h-8 min-w-[2rem] items-center justify-center rounded-xl px-2 text-lg font-black shadow-inner ${
                          status === TableStatus.AVAILABLE
                            ? "bg-gradient-to-br from-slate-100 to-slate-50 text-slate-800"
                            : status === TableStatus.RESERVED
                              ? "bg-gradient-to-br from-amber-500 to-amber-600 text-white"
                              : "bg-gradient-to-br from-rose-600 to-rose-700 text-white"
                        }`}
                      >
                        {table.number}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <div className="flex items-center gap-1 font-black text-[9px] text-slate-600">
                          <Users size={10} />
                          {table.capacity}
                        </div>
                        {status === TableStatus.RESERVED && (
                          <span className="rounded-full bg-amber-100/95 px-1.5 py-0.5 text-[8px] font-black uppercase text-amber-900 shadow-sm">
                            {formatTimeLeft(table.reservedUntil, now)}
                          </span>
                        )}
                        {canEditReservations && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setManagedTable(table);
                            }}
                            className="flex h-6 w-6 items-center justify-center rounded-lg border border-white/80 bg-white/95 text-slate-500 shadow-sm hover:border-indigo-200 hover:text-indigo-600"
                            title="QR / Reservation"
                          >
                            <QrCode size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="relative z-[3] mt-auto text-left">
                      <p
                        className={`text-[8px] font-black uppercase tracking-widest ${
                          status === TableStatus.AVAILABLE
                            ? "text-emerald-800/80"
                            : status === TableStatus.RESERVED
                              ? "text-amber-900"
                              : "text-rose-800"
                        }`}
                      >
                        {status === TableStatus.AVAILABLE
                          ? "Libre"
                          : status === TableStatus.RESERVED
                            ? "Reservee"
                            : "Occupee"}
                      </p>
                      {status === TableStatus.RESERVED && (
                        <p className="max-w-full truncate text-[9px] font-bold text-amber-900">
                          {table.reservedBy || "-"}
                        </p>
                      )}
                      {activeOrder && (
                        <p className="text-sm font-black leading-tight text-slate-900">
                          {formatAmount(activeOrder.total)}{" "}
                          <span className="text-[9px] opacity-40">DT</span>
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tablesForCardGrid.length > 0 && (
          <>
            {showFloorCanvas && (
              <p className="px-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                Tables sans position sur le plan
              </p>
            )}
            <div className="grid grid-cols-2 gap-6 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {tablesForCardGrid.map((table) => {
            const activeOrder = getActiveOrderForTable(
              table.number,
              table.zoneId,
            );
            const status = activeOrder
              ? TableStatus.OCCUPIED
              : table.status === TableStatus.RESERVED
                ? TableStatus.RESERVED
                : TableStatus.AVAILABLE;

            return (
              <div
                key={table.id}
                role="button"
                tabIndex={0}
                onClick={() => handleTableClick(table.number, table.zoneId)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleTableClick(table.number, table.zoneId);
                  }
                }}
                className={`aspect-[4/5] rounded-[3rem] p-6 flex flex-col justify-between cursor-pointer transition-all border-4 shadow-sm group hover:scale-[1.03] relative overflow-hidden ${
                  status === TableStatus.AVAILABLE
                    ? "bg-white border-slate-100 hover:border-indigo-600/30"
                    : status === TableStatus.RESERVED
                      ? "bg-amber-50 border-amber-200 hover:border-amber-400 shadow-amber-100"
                      : "bg-rose-50 border-rose-200 hover:border-rose-400 shadow-rose-100"
                }`}
              >
                {status === TableStatus.RESERVED && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span className="text-amber-600/40 text-xl font-black uppercase tracking-[0.4em] rotate-[-35deg]">
                      Reservee
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-start">
                  <div
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black ${
                      status === TableStatus.AVAILABLE
                        ? "bg-slate-100 text-slate-600"
                        : status === TableStatus.RESERVED
                          ? "bg-amber-500 text-white shadow-lg shadow-amber-200"
                          : "bg-rose-600 text-white shadow-lg shadow-rose-200"
                    }`}
                  >
                    {table.number}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 font-black text-[10px] text-slate-400">
                      <Users size={12} />
                      {table.capacity}
                    </div>
                    {status === TableStatus.RESERVED && (
                      <span className="rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest">
                        {formatTimeLeft(table.reservedUntil, now)}
                      </span>
                    )}
                    {canEditReservations && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setManagedTable(table);
                        }}
                        className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-200 flex items-center justify-center"
                        title="QR / Reservation"
                      >
                        <QrCode size={14} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="text-left">
                  <p
                    className={`text-[9px] font-black uppercase tracking-widest mb-1 ${
                      status === TableStatus.AVAILABLE
                        ? "text-slate-400"
                        : status === TableStatus.RESERVED
                          ? "text-amber-700"
                          : "text-rose-600"
                    }`}
                  >
                    {status === TableStatus.AVAILABLE
                      ? "Libre"
                      : status === TableStatus.RESERVED
                        ? "Reservee"
                        : "Occupee"}
                  </p>

                  {status === TableStatus.RESERVED && (
                    <p className="text-[10px] font-black text-amber-700 truncate">
                      Par: {table.reservedBy || "-"}
                    </p>
                  )}

                  {activeOrder ? (
                    <div className="space-y-1">
                      <p className="text-base font-black text-slate-800 tracking-tight">
                        {formatAmount(activeOrder.total)}{" "}
                        <span className="text-[10px] opacity-40">DT</span>
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <div className="w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center">
                          <Receipt size={10} className="text-rose-500" />
                        </div>
                        <p className="text-[8px] font-black text-slate-400 uppercase truncate">
                          {activeOrder.serverName}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Plus size={14} />
                      <span className="text-[9px] font-black uppercase tracking-widest">
                        Ouvrir
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {visibleZones.length === 0 && (
            <div className="col-span-full py-20 text-center border-4 border-dashed border-slate-100 rounded-[4rem]">
              <ShieldAlert className="mx-auto text-slate-200 mb-4" size={48} />
              <p className="text-slate-300 font-black uppercase tracking-widest text-sm">
                Accès Restreint
              </p>
            </div>
          )}
            </div>
          </>
        )}

        {filteredTables.length === 0 && visibleZones.length > 0 && (
          <div className="py-20 text-center border-4 border-dashed border-slate-100 rounded-[4rem]">
            <p className="text-slate-400 font-bold text-sm">
              Aucune table dans cette zone.
            </p>
          </div>
        )}
      </div>

      {/* Ticket Paper Modal Preview */}
      {previewOrder && (
        <TicketPaperPreview
          order={previewOrder}
          settings={settings}
          onClose={() => setPreviewOrder(null)}
          onEdit={() => {
            onSelectTable(
              previewOrder.tableNumber!,
              previewOrder.id,
              previewOrder.zoneId || activeZoneId,
            );
            setPreviewOrder(null);
          }}
          onOpenPayment={async () => {
            if (!previewOrder?.tableNumber || !previewOrder.id) return;
            try {
              await refreshOrders();
            } catch {
              /* ignore */
            }
            onSelectTable(
              previewOrder.tableNumber,
              previewOrder.id,
              previewOrder.zoneId || activeZoneId,
              { openPayment: true },
            );
            setPreviewOrder(null);
          }}
          tickets={previewTickets}
          onPrintTicket={(id: string) => {
            printTicket(id);
          }}
          onPrintClientTicket={async () => {
            const list = Array.isArray(previewTickets) ? [...previewTickets] : [];
            try {
              if (list.length > 0) {
                list.sort(
                  (a: any, b: any) =>
                    Number(b?.createdAt || 0) - Number(a?.createdAt || 0),
                );
                await printTicket(String(list[0].id));
                return;
              }
              await printOrderClientReceiptProvisional(previewOrder.id);
            } catch (e: any) {
              notifyError(
                e?.message
                  ? `Impression: ${String(e.message)}`
                  : "Impression du ticket impossible.",
              );
            }
          }}
        />
      )}

      {reservedTable && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-300 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-4xl p-8 max-w-sm w-full text-center shadow-2xl border border-sky-100">
            <p className="text-[10px] font-black uppercase tracking-widest text-sky-500">
              Reservation
            </p>
            <h3 className="text-2xl font-black text-slate-800 mt-2">
              Table {reservedTable.number}
            </h3>
            <p className="text-slate-500 text-sm mt-3">
              Cette table est reservee
              {reservedTable.reservedBy
                ? ` par ${reservedTable.reservedBy}`
                : ""}
              . Contactez le responsable pour liberer la table.
            </p>
            <div className="mt-4 text-[10px] font-black text-slate-400">
              <p>Debut: {formatDateTime(reservedTable.reservedAt)}</p>
              <p>Fin: {formatDateTime(reservedTable.reservedUntil)}</p>
            </div>
            <button
              onClick={() => setReservedTable(null)}
              className="mt-6 px-6 py-3 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {showReservedList && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-320 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-4xl p-6 max-w-lg w-full shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Tables reservees
                </p>
                <h3 className="text-2xl font-black text-slate-800 mt-1">
                  Gestion des reservations
                </h3>
              </div>
              <button
                onClick={() => setShowReservedList(false)}
                className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-6 space-y-3">
              {reservedTables.length === 0 && (
                <div className="text-center text-slate-400 text-sm font-bold">
                  Aucune table reservee
                </div>
              )}
              {reservedTables.map((table) => (
                <div
                  key={table.id}
                  className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-black text-slate-800">
                      Table {table.number || "-"}
                      <span className="text-[10px] font-bold text-slate-400 ml-2">
                        {zones.find((z) => z.id === table.zoneId)?.name || ""}
                      </span>
                    </p>
                    <p className="text-[10px] font-black text-sky-700">
                      Par: {table.reservedBy || "-"}
                    </p>
                    <p className="text-[10px] font-black text-slate-500">
                      Debut: {formatDateTime(table.reservedAt)}
                    </p>
                    <p className="text-[10px] font-black text-slate-500">
                      Fin: {formatDateTime(table.reservedUntil)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleUnlockTable(table)}
                    className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest"
                  >
                    Liberer
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {managedTable && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-310 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-4xl p-6 max-w-lg w-full shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Gestion Table
                </p>
                <h3 className="text-2xl font-black text-slate-800 mt-1">
                  Table {managedTable.number}
                </h3>
              </div>
              <button
                onClick={() => setManagedTable(null)}
                className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-50 rounded-2xl p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Statut
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <span
                    className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                      managedTable.status === TableStatus.RESERVED
                        ? "bg-amber-100 text-amber-700"
                        : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {managedTable.status === TableStatus.RESERVED
                      ? "Reservee"
                      : "Disponible"}
                  </span>
                  {managedTable.status === TableStatus.AVAILABLE && (
                    <button
                      onClick={handleReserveTable}
                      disabled={reservationSaving}
                      className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-sky-600 text-white ${reservationSaving ? "opacity-60 cursor-not-allowed" : ""}`}
                    >
                      Reserver
                    </button>
                  )}
                </div>
                {managedTable.status === TableStatus.AVAILABLE && (
                  <div className="mt-4 space-y-3">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Nom reservation
                      </label>
                      <input
                        value={reservationName}
                        onChange={(event) =>
                          setReservationName(event.target.value)
                        }
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
                        placeholder="Nom client"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Heure reservation
                      </label>
                      <input
                        type="datetime-local"
                        value={reservationStart}
                        onChange={(event) =>
                          setReservationStart(event.target.value)
                        }
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Duree (minutes)
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={reservationDuration}
                        onChange={(event) =>
                          setReservationDuration(event.target.value)
                        }
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
                      />
                    </div>
                    {reservationError && (
                      <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest">
                        {reservationError}
                      </p>
                    )}
                  </div>
                )}
                {managedTable.status === TableStatus.AVAILABLE &&
                  getActiveOrderForTable(
                    managedTable.number,
                    managedTable.zoneId,
                  ) && (
                    <p className="mt-3 text-[10px] font-black text-rose-600 uppercase tracking-widest">
                      Table occupee, reservation impossible
                    </p>
                  )}
                {managedTable.status === TableStatus.RESERVED && (
                  <div className="mt-3">
                    <p className="text-[10px] font-black text-amber-700">
                      Par: {managedTable.reservedBy || "-"}
                    </p>
                    <p className="mt-1 text-[10px] font-black text-slate-500">
                      Debut: {formatDateTime(managedTable.reservedAt)}
                    </p>
                    <p className="text-[10px] font-black text-slate-500">
                      Fin: {formatDateTime(managedTable.reservedUntil)}
                    </p>
                    <button
                      onClick={() => {
                        setShowReservedList(true);
                        setManagedTable(null);
                      }}
                      className="mt-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-slate-900 text-white"
                    >
                      Aller aux tables reservees
                    </button>
                  </div>
                )}
                <div className="mt-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Token
                  </p>
                  <p className="mt-1 text-xs font-bold text-slate-700 break-all">
                    {managedTable.token || "-"}
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl p-4 flex flex-col items-center">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  QR Client
                </p>
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="QR Table"
                    className="w-40 h-40 mt-3"
                  />
                ) : (
                  <div className="w-40 h-40 mt-3 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-300">
                    <QrCode size={28} />
                  </div>
                )}
                <div className="mt-4 flex items-center gap-2">
                  <button
                    onClick={handleCopyLink}
                    className="px-4 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2"
                  >
                    <Copy size={14} /> {copied ? "Copie" : "Copier lien"}
                  </button>
                  <button
                    onClick={handlePrintQr}
                    className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2"
                  >
                    <Printer size={14} /> Imprimer
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TableLayout;
