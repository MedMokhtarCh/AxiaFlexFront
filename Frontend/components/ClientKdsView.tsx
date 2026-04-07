import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import { usePOS } from "../store/POSContext";
import { CompanyType, Order, OrderStatus, OrderType } from "../types";
import { ArrowLeft, Clock, ChefHat, Truck, Flame } from "lucide-react";

const formatElapsed = (createdAt: number) => {
  const diff = Date.now() - createdAt;
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
};

const statusTone = (status: OrderStatus) => {
  if (status === OrderStatus.PENDING) return "border-rose-500 bg-rose-50";
  if (status === OrderStatus.PREPARING) return "border-amber-400 bg-amber-50";
  if (status === OrderStatus.READY) return "border-emerald-500 bg-emerald-50";
  return "border-blue-400 bg-blue-50";
};

const formatOrderReference = (order: Order) => {
  const tn = String(order.ticketNumber || "").trim();
  if (tn) return tn;
  return "Commande";
};

interface ClientKdsViewProps {
  onBack: () => void;
  tableToken?: string;
  tableNumber?: string;
}

const ClientKdsView: React.FC<ClientKdsViewProps> = ({
  onBack,
  tableToken,
  tableNumber,
}) => {
  const { orders, refreshOrders, settings, getClientOrders } = usePOS();
  const [clientOrders, setClientOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<OrderStatus | "ALL">("ALL");
  const [tableFilter, setTableFilter] = useState(tableNumber || "");

  useEffect(() => {
    const run = async () => {
      try {
        if (tableToken) {
          const list = await getClientOrders(tableToken);
          setClientOrders(list || []);
        } else {
          await refreshOrders();
        }
      } catch {
        // ignore
      }
    };
    // Single initial fetch; subsequent updates for shared KDS rely on WebSocket events
    run();
  }, [refreshOrders, tableToken, getClientOrders]);

  useEffect(() => {
    if (!tableToken) return;
    const id = window.setInterval(() => {
      getClientOrders(tableToken)
        .then((list) => setClientOrders(list || []))
        .catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(id);
  }, [tableToken, getClientOrders]);

  const sourceOrders = tableToken ? clientOrders : orders;

  const wallboardMinPx = useMemo(
    () =>
      Math.max(
        800,
        Math.min(
          3840,
          Number(settings?.clientKdsWallboardMinWidthPx) || 1920,
        ),
      ),
    [settings?.clientKdsWallboardMinWidthPx],
  );

  const [autoWallboardWide, setAutoWallboardWide] = useState(false);

  const computeWallboard = useCallback(() => {
    const mode = settings?.clientKdsDisplayMode || "STANDARD";
    if (mode === "WALLBOARD") return true;
    if (mode === "AUTO") return window.innerWidth >= wallboardMinPx;
    return false;
  }, [settings?.clientKdsDisplayMode, wallboardMinPx]);

  useLayoutEffect(() => {
    const update = () => setAutoWallboardWide(computeWallboard());
    update();
    window.addEventListener("resize", update);
    const mq = window.matchMedia(`(min-width: ${wallboardMinPx}px)`);
    const onMq = () => update();
    mq.addEventListener("change", onMq);
    return () => {
      window.removeEventListener("resize", update);
      mq.removeEventListener("change", onMq);
    };
  }, [computeWallboard, wallboardMinPx]);

  const isWallboard = useMemo(() => {
    const mode = settings?.clientKdsDisplayMode || "STANDARD";
    if (mode === "WALLBOARD") return true;
    if (mode === "AUTO") return autoWallboardWide;
    return false;
  }, [settings?.clientKdsDisplayMode, autoWallboardWide]);

  const companyType = settings?.companyType as CompanyType | undefined;

  const activeOrders = useMemo(() => {
    const list = sourceOrders.filter(
      (o) =>
        o.status !== OrderStatus.COMPLETED &&
        o.status !== OrderStatus.CANCELLED,
    );
    if (filter === "ALL") return list;
    return list.filter((o) => o.status === filter);
  }, [sourceOrders, filter]);

  const filteredOrders = useMemo(() => {
    const trimmed = tableFilter.trim();
    if (!trimmed) return activeOrders;
    return activeOrders.filter(
      (o) => String(o.tableNumber || "").trim() === trimmed,
    );
  }, [activeOrders, tableFilter]);

  return (
    <div
      className={`fixed inset-0 bg-slate-50 text-slate-900 overflow-auto ${isWallboard ? "kds-wallboard" : ""}`}
    >
      <div className={`w-full ${isWallboard ? "px-10 py-10" : "px-6 py-10"}`}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">
              {settings?.restaurantName || "Restaurant"}
            </p>
            <h1 className={`${isWallboard ? "text-5xl" : "text-3xl"} font-black text-slate-800`}>
              Suivi Commandes
            </h1>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
              Statut en temps réel
            </p>
          </div>
          <div className="flex items-center gap-3">
            <input
              value={tableFilter}
              onChange={(e) => setTableFilter(e.target.value)}
              placeholder="Table #"
              readOnly={Boolean(tableNumber)}
              className={`px-4 py-3 rounded-2xl border border-slate-200 bg-white ${isWallboard ? "text-xl" : "text-sm"} font-bold text-slate-700 ${tableNumber ? "opacity-60" : ""}`}
            />
            <button
              onClick={onBack}
              className={`px-4 py-3 rounded-2xl bg-slate-900 text-white ${isWallboard ? "text-sm" : "text-[10px]"} font-black uppercase tracking-widest flex items-center gap-2`}
            >
              <ArrowLeft size={14} /> Retour
            </button>
          </div>
        </div>

        <div className="mt-6 flex gap-2 bg-white p-1 rounded-2xl border border-slate-200 w-fit">
          {[
            "ALL",
            OrderStatus.PENDING,
            OrderStatus.PREPARING,
            OrderStatus.READY,
          ].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s as any)}
              className={`px-4 py-2 ${isWallboard ? "text-sm" : "text-[10px]"} rounded-xl font-black uppercase tracking-widest transition-all ${
                filter === s
                  ? "bg-indigo-600 text-white shadow-lg"
                  : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              {s === "ALL" ? "Tous" : s}
            </button>
          ))}
        </div>

        <div
          className={`mt-8 grid grid-cols-1 ${
            isWallboard ? "lg:grid-cols-2 2xl:grid-cols-3 gap-8" : "md:grid-cols-2 xl:grid-cols-3 gap-6"
          }`}
        >
          {filteredOrders.map((order) => (
            <div
              key={order.id}
              className={`rounded-[2rem] border-2 ${isWallboard ? "p-8" : "p-6"} shadow-sm ${statusTone(order.status)}`}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  {companyType === CompanyType.FAST_FOOD ? (
                    <>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Ticket / commande
                      </p>
                      <h3 className={`${isWallboard ? "text-4xl" : "text-xl"} font-black text-slate-800`}>
                        {formatOrderReference(order)}
                      </h3>
                      {order.clientDisplayName ? (
                        <p
                          className={`mt-1 ${isWallboard ? "text-2xl" : "text-base"} font-black text-indigo-700`}
                        >
                          {order.clientDisplayName}
                        </p>
                      ) : null}
                      {order.type === OrderType.DINE_IN ? (
                        <p className="text-[10px] text-slate-400 font-bold mt-1">
                          Table {order.tableNumber || "—"}
                        </p>
                      ) : (
                        <p className="text-[10px] text-slate-400 font-bold mt-1">
                          {order.type === OrderType.DELIVERY
                            ? "Livraison"
                            : "Emporter"}
                        </p>
                      )}
                    </>
                  ) : companyType === CompanyType.RESTAURANT_CAFE ? (
                    <>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        N° commande
                      </p>
                      <h3 className={`${isWallboard ? "text-4xl" : "text-xl"} font-black text-slate-800`}>
                        {formatOrderReference(order)}
                      </h3>
                      {order.type === OrderType.DINE_IN ? (
                        <p className={`mt-2 ${isWallboard ? "text-3xl" : "text-lg"} font-black text-indigo-700`}>
                          Table {order.tableNumber || "—"}
                        </p>
                      ) : (
                        <p className="text-[10px] text-slate-400 font-bold mt-1">
                          {order.type === OrderType.DELIVERY
                            ? "Livraison"
                            : "Emporter"}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Commande
                      </p>
                      <h3 className={`${isWallboard ? "text-4xl" : "text-xl"} font-black text-slate-800`}>
                        {formatOrderReference(order)}
                      </h3>
                      {order.type === OrderType.DINE_IN ? (
                        <p className={`mt-2 ${isWallboard ? "text-3xl" : "text-lg"} font-black text-indigo-700`}>
                          Table {order.tableNumber || "—"}
                        </p>
                      ) : (
                        <p className="text-[10px] text-slate-400 font-bold mt-1">
                          {order.type === OrderType.DELIVERY
                            ? "Livraison"
                            : "Emporter"}
                        </p>
                      )}
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2 text-slate-500">
                  <Clock size={14} />
                  <span className={`${isWallboard ? "text-lg" : "text-[10px]"} font-black`}>
                    {formatElapsed(order.createdAt)}
                  </span>
                </div>
              </div>

              <div className={`${isWallboard ? "space-y-3 mb-6" : "space-y-2 mb-4"}`}>
                {(order.items || []).map((item: any, idx: number) => (
                  <div
                    key={`${item.id}-${idx}`}
                    className="flex items-start justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <p className={`${isWallboard ? "text-2xl" : "text-sm"} font-bold text-slate-800 truncate`}>
                        {item.name}
                      </p>
                      {item.notes && (
                        <p className="text-[10px] text-rose-500 font-bold truncate">
                          {item.notes}
                        </p>
                      )}
                    </div>
                    <span className={`${isWallboard ? "text-2xl" : "text-sm"} font-black text-slate-700`}>
                      x{item.quantity}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {order.type === OrderType.DELIVERY ? (
                    <Truck size={16} className="text-slate-400" />
                  ) : (
                    <ChefHat size={16} className="text-slate-400" />
                  )}
                  <span className={`${isWallboard ? "text-sm" : "text-[10px]"} font-black text-slate-400 uppercase tracking-widest`}>
                    {order.status}
                  </span>
                </div>
              </div>
            </div>
          ))}

          {filteredOrders.length === 0 && (
            <div className="col-span-full border-2 border-dashed border-slate-200 rounded-[2rem] p-10 text-center text-slate-300">
              <Flame className="mx-auto mb-3" size={32} />
              Aucune commande en cours
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClientKdsView;
