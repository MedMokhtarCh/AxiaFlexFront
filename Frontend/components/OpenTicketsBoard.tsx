import React, { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { usePOS } from "../store/POSContext";
import {
  Order,
  OrderItem,
  OrderStatus,
  OrderType,
  Printer,
  Product,
  Role,
} from "../types";
import { ChevronLeft, RefreshCw, Receipt } from "lucide-react";
import {
  formatPrepSummaryLine,
  prepOfItem,
  getItemKdsPosteKeys,
  canStaffActOnKdsItem,
  summarizePrepByPrimaryPoste,
  bonProfileForPosteKey,
  listKdsPostesForRole,
} from "../utils/kdsStation";

const formatAmount = (value: unknown, digits = 3) =>
  Number(value ?? 0).toFixed(digits);

function lineTotal(item: OrderItem) {
  const disc = Number(item.discount || 0);
  return item.price * item.quantity - disc;
}

const statusLabel: Partial<Record<OrderStatus, string>> = {
  [OrderStatus.PENDING]: "En attente",
  [OrderStatus.PREPARING]: "Préparation",
  [OrderStatus.READY]: "Prêt",
  [OrderStatus.DELIVERED]: "Livré",
  [OrderStatus.PARTIAL]: "Partiel",
  [OrderStatus.COMPLETED]: "Payé",
  [OrderStatus.INVOICED]: "Facturé",
  [OrderStatus.CANCELLED]: "Annulé",
};

function isOrderOpenForSettlement(order: Order): boolean {
  const status = String(order.status || "").toUpperCase();
  if (
    status === OrderStatus.COMPLETED ||
    status === OrderStatus.CANCELLED ||
    status === OrderStatus.INVOICED
  ) {
    return false;
  }
  const total = Number(order.total || 0);
  const paidAmount = Number(order.paidAmount || 0);
  const paymentsTotal = Array.isArray(order.payments)
    ? order.payments.reduce((s, p: any) => s + Number(p?.amount || 0), 0)
    : 0;
  const paid = Math.max(paidAmount, paymentsTotal);
  if (total > 0 && paid >= total) return false;
  return true;
}

const prepShort: Record<string, string> = {
  PENDING: "À faire",
  PREPARING: "Cours",
  READY: "Prêt",
};

function PrepCell({
  item,
  productsById,
  printersById,
  printersList,
  role,
}: {
  item: OrderItem;
  productsById: Map<string, Product>;
  printersById: Map<string, Printer>;
  printersList: Printer[];
  role: Role | undefined;
}) {
  const p = prepOfItem(item);
  const showBothStationsSummary =
    role === Role.ADMIN ||
    role === Role.MANAGER ||
    role === Role.CASHIER ||
    role === Role.SERVER;
  const showCell =
    showBothStationsSummary ||
    canStaffActOnKdsItem(
      item,
      role,
      showBothStationsSummary,
      printersList,
      productsById,
      printersById,
    );
  if (!showCell) {
    return (
      <span className="w-8 shrink-0 text-center text-slate-300">—</span>
    );
  }
  const keys = getItemKdsPosteKeys(item, productsById, printersById);
  const short =
    keys.length <= 1
      ? (keys[0] || "?").slice(0, 3)
      : `${keys[0]?.slice(0, 1) ?? "?"}+`;
  const dot =
    p === OrderStatus.READY
      ? "bg-emerald-500"
      : p === OrderStatus.PREPARING
        ? "bg-amber-500"
        : "bg-rose-500";
  return (
    <span
      className="w-8 shrink-0 flex flex-col items-center gap-0.5"
      title={`${keys.join(", ")} · ${prepShort[String(p)] || p}`}
    >
      <span className={`w-2 h-2 rounded-full ${dot}`} />
      {showBothStationsSummary && (
        <span className="text-[6px] font-black text-slate-400 max-w-[1.5rem] truncate">
          {short}
        </span>
      )}
    </span>
  );
}

const TicketQr: React.FC<{ value: string }> = ({ value }) => {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { width: 112, margin: 1, errorCorrectionLevel: "M" })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);
  if (!src) {
    return (
      <div className="w-14 h-14 bg-slate-100 rounded mx-auto animate-pulse" />
    );
  }
  return (
    <img src={src} alt="" className="w-14 h-14 mx-auto object-contain" />
  );
};

interface OpenTicketsBoardProps {
  onOpenOrder: (order: Order) => void;
  onBack?: () => void;
}

const OpenTicketsBoard: React.FC<OpenTicketsBoardProps> = ({
  onOpenOrder,
  onBack,
}) => {
  const { orders, settings, zones, currentUser, refreshOrders, products, printers } =
    usePOS();
  const [refreshing, setRefreshing] = useState(false);

  const role = currentUser?.role;
  const isChef = role === Role.CHEF;
  const isBartender = role === Role.BARTENDER;
  const seesAllTicketScope =
    role === Role.ADMIN ||
    role === Role.MANAGER ||
    role === Role.CASHIER ||
    isChef ||
    isBartender;

  const productsById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );
  const printersById = useMemo(
    () => new Map(printers.map((p) => [p.id, p])),
    [printers],
  );

  const chefPostes = useMemo(
    () => listKdsPostesForRole(printers, Role.CHEF, false),
    [printers],
  );
  const barPostes = useMemo(
    () => listKdsPostesForRole(printers, Role.BARTENDER, false),
    [printers],
  );

  const visibleOrders = useMemo(() => {
    let base = seesAllTicketScope
      ? orders
      : orders.filter((o) => o.serverId === currentUser?.id);
    base = base.filter(isOrderOpenForSettlement);
    if (isChef) {
      base = base.filter((o) =>
        (o.items || []).some((it) => {
          const keys = getItemKdsPosteKeys(it, productsById, printersById);
          return keys.some((k) => chefPostes.includes(k));
        }),
      );
    } else if (isBartender) {
      base = base.filter((o) =>
        (o.items || []).some((it) => {
          const keys = getItemKdsPosteKeys(it, productsById, printersById);
          return keys.some((k) => barPostes.includes(k));
        }),
      );
    }
    return base;
  }, [
    orders,
    currentUser?.id,
    seesAllTicketScope,
    isChef,
    isBartender,
    productsById,
    printersById,
    chefPostes,
    barPostes,
  ]);

  const sorted = useMemo(
    () =>
      [...visibleOrders].sort(
        (a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0),
      ),
    [visibleOrders],
  );

  useEffect(() => {
    refreshOrders().catch(() => undefined);
  }, [refreshOrders]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      refreshOrders().catch(() => undefined);
    }, 60000);
    return () => window.clearInterval(id);
  }, [refreshOrders]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshOrders();
    } finally {
      setRefreshing(false);
    }
  };

  const tableLabel = (order: Order) => {
    const zname = order.zoneId
      ? zones.find((z) => z.id === order.zoneId)?.name
      : undefined;
    if (order.tableNumber) {
      const t = String(order.tableNumber);
      return zname ? `${zname} — ${t}` : t;
    }
    if (order.type === OrderType.DELIVERY) return "Livraison";
    if (order.type === OrderType.TAKE_OUT) return "À emporter";
    return "—";
  };

  const formatDateTime = (ts: number) => {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "—";
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  };

  const prepSummaryForCard = (order: Order) => {
    const items = order.items || [];
    const byPoste = summarizePrepByPrimaryPoste(
      items,
      productsById,
      printersById,
    );
    const showBoth =
      role === Role.ADMIN ||
      role === Role.MANAGER ||
      role === Role.CASHIER ||
      role === Role.SERVER;
    const parts = Array.from(byPoste.entries())
      .filter(([, c]) => c.total > 0)
      .filter(([label]) => {
        if (showBoth) return true;
        if (isChef)
          return bonProfileForPosteKey(label, printers) === "kitchen";
        if (isBartender) return bonProfileForPosteKey(label, printers) === "bar";
        return false;
      })
      .map(([label, c]) => formatPrepSummaryLine(c, label))
      .filter(Boolean);
    return parts.join(" · ") || "—";
  };

  const listSubtitle = () => {
    if (isChef)
      return "Tickets avec au moins une ligne sur vos postes « cuisine » · KDS";
    if (isBartender)
      return "Tickets avec au moins une ligne sur vos postes « bar » · KDS";
    return "Préparation par poste (Cuisine, Bar, Terrasse…) · synchro KDS";
  };

  return (
    <div className="touch-tickets-page h-full flex flex-col gap-3 sm:gap-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 bg-white p-4 sm:p-5 rounded-[1.5rem] sm:rounded-[2rem] border border-slate-100 shadow-sm shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="shrink-0 flex items-center gap-2 text-slate-500 font-bold hover:text-indigo-600 text-sm min-h-11 px-2 rounded-lg"
            >
              <ChevronLeft size={18} /> Retour
            </button>
          )}
          <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-700 border border-slate-200 shrink-0">
            <Receipt size={22} />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg sm:text-2xl font-black text-slate-800 tracking-tight truncate">
              Liste des tickets en cours
            </h2>
            <p className="text-slate-400 font-bold text-[10px] uppercase tracking-[0.2em]">
              {sorted.length} ticket{sorted.length !== 1 ? "s" : ""} actif
              {sorted.length !== 1 ? "s" : ""}
            </p>
            <p className="text-slate-500 text-[10px] sm:text-[9px] font-bold mt-1 max-w-md leading-snug">
              {listSubtitle()}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="shrink-0 inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-slate-900 text-white text-[11px] sm:text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 transition-colors disabled:opacity-50 min-h-12"
        >
          <RefreshCw
            size={14}
            className={refreshing ? "animate-spin" : ""}
          />
          Actualiser
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden pb-4 scrollbar-hide">
        {sorted.length === 0 ? (
          <div className="h-full min-h-[320px] flex flex-col items-center justify-center text-slate-300 border-4 border-dashed border-slate-200 rounded-[2.5rem] bg-white/80">
            <Receipt size={48} className="opacity-40 mb-4" />
            <p className="font-black uppercase tracking-[0.2em] text-[10px] text-slate-400">
              Aucun ticket en cours
            </p>
          </div>
        ) : (
          <div className="flex gap-3 sm:gap-5 px-1 h-full items-stretch pb-2">
            {sorted.map((order) => {
              const ticketRef =
                order.ticketNumber?.trim() ||
                `TK-${String(order.id).slice(-8).toUpperCase()}`;
              const qrPayload = ticketRef;
              const st =
                statusLabel[order.status] ?? String(order.status);
              const prepLine = prepSummaryForCard(order);

              return (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => onOpenOrder(order)}
                  className="shrink-0 w-[min(86vw,300px)] sm:w-[272px] max-h-[min(100%,720px)] flex flex-col text-left bg-white rounded-xl border border-slate-200 shadow-md hover:shadow-xl hover:border-indigo-300 transition-all overflow-hidden group min-h-[460px]"
                >
                  <div className="p-3 sm:p-4 flex-1 overflow-y-auto scrollbar-hide font-mono text-[11px] sm:text-[10px] leading-snug text-slate-800">
                    <div className="flex justify-center mb-3">
                      {settings.logoUrl ? (
                        <img
                          src={settings.logoUrl}
                          alt=""
                          className="h-10 max-w-[140px] object-contain"
                        />
                      ) : (
                        <div className="text-center font-black text-sm tracking-tighter text-slate-700">
                          {settings.restaurantName || "AxiaFlex"}
                        </div>
                      )}
                    </div>
                    <div className="text-center text-[9px] text-slate-600 space-y-0.5 mb-2 border-b border-dashed border-slate-200 pb-2">
                      <div>Date/Heure: {formatDateTime(order.createdAt)}</div>
                      <div className="truncate" title={tableLabel(order)}>
                        N° table / lieu: {tableLabel(order)}
                      </div>
                      <div>
                        Serveur:{" "}
                        {order.serverName ||
                          order.serverId?.slice(-6) ||
                          "—"}
                      </div>
                      <div className="font-bold text-slate-800">
                        Ticket: {ticketRef}
                      </div>
                    </div>
                    <div className="mb-2 px-1 py-1.5 rounded-md bg-slate-50 border border-slate-100 text-[8px] font-black text-slate-600 text-center leading-tight">
                      Prép. (KDS) : {prepLine}
                    </div>
                    <div className="text-[9px] sm:text-[8px] font-black text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-0.5 border-b border-slate-800 pb-0.5">
                      <span className="w-7 shrink-0 text-right">Qté</span>
                      <span className="w-8 shrink-0 text-center">Prép</span>
                      <span className="flex-1 min-w-0 px-0.5">Article</span>
                      <span className="w-12 shrink-0 text-right">Mtt</span>
                    </div>
                    <div className="space-y-1 mb-3">
                      {(order.items || []).map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-0.5 text-[10px] sm:text-[9px]"
                        >
                          <span className="w-7 shrink-0 text-right tabular-nums">
                            {formatAmount(item.quantity, 2)}
                          </span>
                          <PrepCell
                            item={item}
                            productsById={productsById}
                            printersById={printersById}
                            printersList={printers}
                            role={role}
                          />
                          <span className="flex-1 min-w-0 truncate px-0.5 uppercase">
                            {item.name}
                          </span>
                          <span className="w-12 shrink-0 text-right tabular-nums">
                            {formatAmount(lineTotal(item))}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="border-t border-dashed border-slate-300 pt-2 flex justify-between font-black text-[11px]">
                      <span>Total</span>
                      <span>
                        {formatAmount(order.total)}{" "}
                        {settings.currency}
                      </span>
                    </div>
                    <div className="mt-2 flex justify-center">
                      <TicketQr value={qrPayload} />
                    </div>
                    <p className="text-center text-[8px] text-slate-500 mt-2 uppercase leading-tight px-1">
                      Merci pour votre visite ! À bientôt
                    </p>
                  </div>
                  <div className="px-3 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between min-h-12">
                    <span className="text-[9px] font-black uppercase text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">
                      {st}
                    </span>
                    <span className="text-[9px] font-black text-indigo-600 group-hover:underline">
                      Ouvrir au POS →
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default OpenTicketsBoard;
