import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePOS } from "../store/POSContext";
import {
  Order,
  OrderItem,
  OrderStatus,
  OrderType,
  Role,
} from "../types";
import {
  ChefHat,
  Clock,
  GlassWater,
  RefreshCw,
  Truck,
  UtensilsCrossed,
} from "lucide-react";
import {
  prepOfItem,
  resolveItemStation,
  getItemKdsPosteKeys,
  itemMatchesKdsFilter,
  canStaffActOnKdsItem,
  listKdsTabIds,
  listKdsPostesForRole,
} from "../utils/kdsStation";

const formatElapsed = (createdAt: number) => {
  const diff = Date.now() - createdAt;
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
};

const prepLabel: Record<string, string> = {
  PENDING: "À faire",
  PREPARING: "En cours",
  READY: "Prêt",
  DELIVERED: "Servi",
};

const prepBadgeClass: Record<string, string> = {
  PENDING: "bg-rose-100 text-rose-800 border-rose-200",
  PREPARING: "bg-amber-100 text-amber-900 border-amber-200",
  READY: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

function computeOrderPrepStatus(items: OrderItem[]): OrderStatus {
  if (!items.length) return OrderStatus.PENDING;
  const statuses = items.map((item) => prepOfItem(item));
  if (statuses.every((s) => s === OrderStatus.DELIVERED))
    return OrderStatus.DELIVERED;
  if (statuses.every((s) => s === OrderStatus.READY))
    return OrderStatus.READY;
  if (statuses.every((s) => s === OrderStatus.READY || s === OrderStatus.DELIVERED))
    return OrderStatus.READY;
  if (
    statuses.every(
      (s) =>
        s === OrderStatus.PREPARING ||
        s === OrderStatus.READY ||
        s === OrderStatus.DELIVERED,
    )
  ) {
    return OrderStatus.PREPARING;
  }
  return OrderStatus.PENDING;
}

function nextPrepStatus(current: OrderStatus): OrderStatus | null {
  if (current === OrderStatus.PENDING) return OrderStatus.PREPARING;
  if (current === OrderStatus.PREPARING) return OrderStatus.READY;
  return null;
}

const KitchenDisplay: React.FC = () => {
  const {
    orders,
    updateOrder,
    refreshOrders,
    products,
    printers,
    currentUser,
  } = usePOS();

  const [kdsFilter, setKdsFilter] = useState<string>("ALL");
  const [refreshing, setRefreshing] = useState(false);
  const [hasIncomingAlert, setHasIncomingAlert] = useState(false);
  const baselineRef = useRef<Map<string, string>>(new Map());

  const role = currentUser?.role;

  const isFullTicketRole =
    role === Role.ADMIN ||
    role === Role.MANAGER ||
    role === Role.CASHIER ||
    role === Role.SERVER;

  useEffect(() => {
    setKdsFilter("ALL");
  }, [role]);

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

  const productsById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );
  const printersById = useMemo(
    () => new Map(printers.map((p) => [p.id, p])),
    [printers],
  );

  const rolePostes = useMemo(
    () => listKdsPostesForRole(printers, role, isFullTicketRole),
    [printers, role, isFullTicketRole],
  );

  const tabIds = useMemo(
    () => listKdsTabIds(printers, role, isFullTicketRole),
    [printers, role, isFullTicketRole],
  );

  const effectiveFilter = tabIds.includes(kdsFilter)
    ? kdsFilter
    : (tabIds[0] ?? "ALL");

  useEffect(() => {
    if (!tabIds.includes(kdsFilter)) {
      setKdsFilter(tabIds[0] ?? "ALL");
    }
  }, [tabIds, kdsFilter]);

  const normalizeItem = useCallback(
    (item: OrderItem): OrderItem => {
      const station = resolveItemStation(item, productsById, printersById);
      const prepStatus = item.prepStatus ?? OrderStatus.PENDING;
      return { ...item, station, prepStatus };
    },
    [productsById, printersById],
  );

  const normalizedOrders = useMemo(
    () =>
      orders.map((order) => ({
        ...order,
        items: (order.items || []).map((i) => normalizeItem(i)),
      })),
    [orders, normalizeItem],
  );

  const activeOrders = useMemo(
    () =>
      normalizedOrders.filter(
        (o) =>
          o.status !== OrderStatus.COMPLETED &&
          o.status !== OrderStatus.CANCELLED &&
          o.status !== OrderStatus.INVOICED,
      ),
    [normalizedOrders],
  );

  const filteredEntries = useMemo(() => {
    return activeOrders
      .map((order) => {
        const allItems = order.items || [];
        const items = allItems.filter((item) => {
          if (
            (role === Role.CHEF || role === Role.BARTENDER) &&
            (prepOfItem(item) === OrderStatus.READY ||
              prepOfItem(item) === OrderStatus.DELIVERED)
          ) {
            return false;
          }
          return itemMatchesKdsFilter(
            item,
            effectiveFilter,
            rolePostes,
            productsById,
            printersById,
          );
        });
        return { order, items, allItems };
      })
      .filter((e) => e.items.length > 0);
  }, [
    activeOrders,
    effectiveFilter,
    rolePostes,
    role,
    productsById,
    printersById,
  ]);

  const sortedEntries = useMemo(() => {
    const rank = (items: OrderItem[]) => {
      if (items.some((i) => prepOfItem(i) === OrderStatus.PENDING)) return 0;
      if (items.some((i) => prepOfItem(i) === OrderStatus.PREPARING))
        return 1;
      return 2;
    };
    return [...filteredEntries].sort((a, b) => {
      const dr = rank(a.items) - rank(b.items);
      if (dr !== 0) return dr;
      return Number(a.order.createdAt) - Number(b.order.createdAt);
    });
  }, [filteredEntries]);

  useEffect(() => {
    const snapshot = new Map<string, string>();
    for (const { order, items } of sortedEntries) {
      const sig = items
        .map((it) => `${it.id}|${it.quantity}|${it.notes || ""}|${prepOfItem(it)}`)
        .join(";");
      snapshot.set(order.id, sig);
    }
    const baseline = baselineRef.current;
    const initialized = baseline.size > 0;
    let changed = false;
    if (initialized) {
      for (const [oid, sig] of snapshot.entries()) {
        if (baseline.get(oid) !== sig) {
          changed = true;
          break;
        }
      }
      if (!changed) {
        for (const key of baseline.keys()) {
          if (!snapshot.has(key)) {
            changed = true;
            break;
          }
        }
      }
    }
    baselineRef.current = snapshot;
    if (!initialized || !changed) return;

    setHasIncomingAlert(true);
    const alertTitle = "🔔 NOUVELLE MISE A JOUR KDS";
    const originalTitle = document.title;
    let tick = false;
    const interval = window.setInterval(() => {
      tick = !tick;
      document.title = tick ? alertTitle : originalTitle;
    }, 700);

    try {
      const AC =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AC) {
        const ctx = new AC();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.value = 880;
        gain.gain.value = 0.03;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        window.setTimeout(() => {
          osc.stop();
          ctx.close?.();
        }, 180);
      }
    } catch {
      // beep non disponible selon navigateur/politiques autoplay
    }

    const stop = window.setTimeout(() => {
      window.clearInterval(interval);
      document.title = originalTitle;
      setHasIncomingAlert(false);
    }, 7000);

    return () => {
      window.clearTimeout(stop);
      window.clearInterval(interval);
      document.title = originalTitle;
      setHasIncomingAlert(false);
    };
  }, [sortedEntries]);

  const applyItemPrepStep = useCallback(
    async (order: Order, allItems: OrderItem[], itemId: string) => {
      const target = allItems.find((i) => i.id === itemId);
      if (!target) return;
      const station = resolveItemStation(target, productsById, printersById);
      if (
        !canStaffActOnKdsItem(
          target,
          role,
          isFullTicketRole,
          printers,
          productsById,
          printersById,
        )
      )
        return;
      const current = prepOfItem(target);
      const next =
        role === Role.SERVER && current === OrderStatus.READY
          ? OrderStatus.DELIVERED
          : nextPrepStatus(current);
      if (!next) return;

      const updatedItems = allItems.map((it) => {
        if (it.id !== itemId) return it;
        return {
          ...it,
          prepStatus: next,
          station: it.station ?? station,
        };
      });
      const nextOrderStatus = computeOrderPrepStatus(updatedItems);
      await updateOrder(
        order.id,
        updatedItems as any[],
        order.total,
        order.discount,
        false,
        nextOrderStatus,
        undefined,
        { skipConfirmation: true },
      );
    },
    [
      isFullTicketRole,
      printers,
      productsById,
      printersById,
      role,
      updateOrder,
    ],
  );

  const stationTitle =
    effectiveFilter === "ALL"
      ? isFullTicketRole
        ? "Tous les postes"
        : role === Role.BARTENDER
          ? "Tous les postes (bar)"
          : "Tous les postes (cuisine)"
      : effectiveFilter;

  return (
    <div className="touch-kds-page h-full flex flex-col gap-3 sm:gap-5 min-h-0">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 sm:gap-4 shrink-0">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">
            Écran cuisine (KDS)
          </h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
            {stationTitle} · synchro liste tickets & WebSocket
          </p>
          {effectiveFilter === "ALL" && (
            <p className="text-[10px] text-indigo-600 font-bold mt-2 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-1.5 inline-block">
              Vue agrégée : toutes les lignes des postes visibles pour votre
              rôle.
            </p>
          )}
          {hasIncomingAlert ? (
            <p className="text-[10px] text-rose-600 font-black mt-2 animate-pulse bg-rose-50 border border-rose-200 rounded-lg px-3 py-1.5 inline-block">
              Nouvelle mise à jour commande (impression envoyée).
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {tabIds.length > 1 && (
            <div className="flex flex-wrap rounded-xl border border-slate-200 bg-white p-1 shadow-sm gap-0.5 max-w-full overflow-x-auto scrollbar-hide">
              {tabIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setKdsFilter(id)}
                  className={`px-3 sm:px-4 py-2.5 rounded-lg text-[11px] sm:text-[10px] font-black uppercase tracking-widest transition-colors min-h-11 shrink-0 ${
                    effectiveFilter === id
                      ? "bg-slate-900 text-white"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {id === "ALL" ? "Tout" : id}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-white border border-slate-200 text-[11px] sm:text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50 shadow-sm min-h-12"
          >
            <RefreshCw
              size={14}
              className={refreshing ? "animate-spin" : ""}
            />
            Actualiser
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-1 pb-8 scrollbar-hide">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-5">
          {sortedEntries.map(({ order, items, allItems }) => (
            <div
              key={order.id}
              className="rounded-[1.25rem] sm:rounded-[1.75rem] border-2 border-slate-200 bg-white p-4 sm:p-5 shadow-sm flex flex-col"
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="min-w-0">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    Commande
                  </p>
                  <h3 className="text-lg font-black text-slate-900 truncate">
                    {order.ticketNumber?.trim() ||
                      `#${order.id.slice(-6).toUpperCase()}`}
                  </h3>
                  <p className="text-[10px] text-slate-500 font-bold mt-1">
                    {order.type === OrderType.DINE_IN
                      ? `Table ${order.tableNumber || "—"}`
                      : order.type === OrderType.DELIVERY
                        ? "Livraison"
                        : "À emporter"}
                    {order.serverName ? ` · ${order.serverName}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-slate-400 shrink-0">
                  <Clock size={14} />
                  <span className="text-[10px] font-black tabular-nums">
                    {formatElapsed(order.createdAt)}
                  </span>
                </div>
              </div>

              <div className="space-y-2 flex-1 mb-4">
                {items.map((item) => {
                  const posteKeys = getItemKdsPosteKeys(
                    item,
                    productsById,
                    printersById,
                  );
                  const p = prepOfItem(item);
                  const next =
                    role === Role.SERVER && p === OrderStatus.READY
                      ? OrderStatus.DELIVERED
                      : nextPrepStatus(p);
                  const canTap =
                    canStaffActOnKdsItem(
                      item,
                      role,
                      isFullTicketRole,
                      printers,
                      productsById,
                      printersById,
                    ) && next !== null;
                  const actionLabel =
                    p === OrderStatus.PENDING
                      ? "Démarrer"
                      : p === OrderStatus.PREPARING
                        ? "Marquer prêt"
                        : role === Role.SERVER && p === OrderStatus.READY
                          ? "Servi"
                        : "—";

                  return (
                    <div
                      key={item.id}
                      className={`rounded-xl border p-3 flex gap-3 items-start ${
                        p === OrderStatus.PENDING
                          ? "border-rose-200 bg-rose-50/40"
                          : p === OrderStatus.PREPARING
                            ? "border-amber-200 bg-amber-50/40"
                            : "border-emerald-200 bg-emerald-50/30"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-slate-800 truncate">
                            {item.name}
                          </p>
                          <span
                            className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-md border ${prepBadgeClass[p] || "bg-slate-100 text-slate-600"}`}
                          >
                            {prepLabel[p] || p}
                          </span>
                          {effectiveFilter === "ALL" && (
                            <span
                              className="text-[8px] font-black uppercase text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md max-w-[10rem] truncate"
                              title={posteKeys.join(", ")}
                            >
                              {posteKeys.join(" · ")}
                            </span>
                          )}
                        </div>
                        {item.notes ? (
                          <p className="text-[10px] text-rose-600 font-bold mt-1 line-clamp-2">
                            {item.notes}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <span className="text-sm font-black text-slate-700 tabular-nums">
                          ×{item.quantity}
                        </span>
                        <button
                          type="button"
                          disabled={!canTap}
                          onClick={() =>
                            applyItemPrepStep(order, allItems, item.id)
                          }
                          className={`px-3 py-2.5 rounded-lg text-[10px] sm:text-[9px] font-black uppercase tracking-wide whitespace-nowrap transition-colors min-h-11 ${
                            canTap
                              ? "bg-slate-900 text-white hover:bg-indigo-600"
                              : "bg-slate-200 text-slate-400 cursor-not-allowed"
                          }`}
                        >
                          {actionLabel}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-slate-400">
                {order.type === OrderType.DELIVERY ? (
                  <Truck size={16} />
                ) : (
                  <UtensilsCrossed size={16} />
                )}
                <span className="text-[9px] font-black uppercase tracking-widest">
                  Statut commande :{" "}
                  <span className="text-slate-600">{order.status}</span>
                </span>
              </div>
            </div>
          ))}

          {sortedEntries.length === 0 && (
            <div className="col-span-full border-2 border-dashed border-slate-200 rounded-[1.5rem] sm:rounded-[2rem] p-8 sm:p-12 text-center text-slate-400">
              <div className="flex justify-center gap-4 mb-4 text-slate-300">
                <ChefHat size={36} />
                <GlassWater size={36} />
              </div>
              <p className="font-black text-sm text-slate-500">
                Aucune ligne à préparer pour ce poste
              </p>
              <p className="text-xs mt-2 text-slate-400">
                Les nouvelles commandes apparaissent ici automatiquement.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default KitchenDisplay;
