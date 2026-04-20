import React from "react";
import { usePOS } from "../store/POSContext";
import { OrderType, OrderStatus } from "../types";
import {
  Plus,
  Clock,
  User,
  Package,
  ChevronRight,
  ShoppingBag,
  Truck,
  ChefHat,
  CheckCircle2,
  Ban,
  Check,
  AlertCircle,
} from "lucide-react";

const formatAmount = (value: unknown, digits = 3) =>
  Number(value ?? 0).toFixed(digits);
const formatTimeSafe = (value: unknown) => {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString();
  }
  if (typeof value === "string") {
    const asNumber = Number(value);
    const date = !Number.isNaN(asNumber)
      ? new Date(asNumber)
      : new Date(Date.parse(value));
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString();
  }
  return "—";
};

interface OrderListViewProps {
  type: OrderType;
  onSelectOrder: (id: string) => void;
  onCreateNew: () => void;
  onBack: () => void;
}

const OrderListView: React.FC<OrderListViewProps> = ({
  type,
  onSelectOrder,
  onCreateNew,
  onBack,
}) => {
  const { orders, settings } = usePOS();

  const activeOrders = orders.filter(
    (o) =>
      o.type === type &&
      o.status !== OrderStatus.COMPLETED &&
      o.status !== OrderStatus.CANCELLED,
  );

  const getStatusConfig = (status: OrderStatus) => {
    switch (status) {
      case OrderStatus.PENDING:
        return {
          label: "En attente",
          color: "bg-amber-100 text-amber-600 border-amber-200",
          icon: <Clock size={10} />,
          bg: "bg-amber-50/30",
        };
      case OrderStatus.PREPARING:
        return {
          label: "Préparation",
          color: "bg-blue-100 text-blue-600 border-blue-200",
          icon: <ChefHat size={10} />,
          bg: "bg-blue-50/30",
        };
      case OrderStatus.READY:
        return {
          label: "Prêt",
          color: "bg-emerald-100 text-emerald-600 border-emerald-200",
          icon: <CheckCircle2 size={10} />,
          bg: "bg-emerald-50/30",
        };
      case OrderStatus.DELIVERED:
        return {
          label: "Livré",
          color: "bg-indigo-100 text-indigo-600 border-indigo-200",
          icon: <Truck size={10} />,
          bg: "bg-indigo-50/30",
        };
      case OrderStatus.CANCELLED:
        return {
          label: "Annulé",
          color: "bg-rose-100 text-rose-600 border-rose-200",
          icon: <Ban size={10} />,
          bg: "bg-rose-50/30",
        };
      default:
        return {
          label: status,
          color: "bg-slate-100 text-slate-600 border-slate-200",
          icon: <AlertCircle size={10} />,
          bg: "bg-slate-50/30",
        };
    }
  };

  return (
    <div className="h-full flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm gap-4">
        <div className="flex items-center gap-4">
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner ${type === OrderType.DELIVERY ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}
          >
            {type === OrderType.DELIVERY ? (
              <Truck size={28} />
            ) : (
              <ShoppingBag size={28} />
            )}
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tighter">
              {type === OrderType.DELIVERY
                ? "Commandes Livraison"
                : "Commandes A Emporter"}
            </h2>
            <p className="text-slate-400 font-bold text-[10px] uppercase tracking-[0.2em]">
              {activeOrders.length} Transactions Actives
            </p>
          </div>
        </div>
        <button
          onClick={onCreateNew}
          className="bg-slate-900 text-white px-10 py-4 rounded-[1.5rem] font-black text-xs uppercase tracking-widest flex items-center gap-3 shadow-2xl shadow-slate-200 hover:bg-indigo-600 hover:shadow-indigo-100 transition-all active:scale-95 group"
        >
          <Plus
            size={18}
            className="group-hover:rotate-90 transition-transform duration-300"
          />{" "}
          Nouvelle Commande
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 pb-10 scrollbar-hide">
        {activeOrders.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-200 border-4 border-dashed border-slate-100 rounded-[4rem] py-24 bg-white/50">
            <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mb-6">
              <Package size={48} className="text-slate-200" />
            </div>
            <p className="font-black uppercase tracking-[0.3em] text-[10px] text-slate-400">
              Aucune commande active
            </p>
            <button
              onClick={onCreateNew}
              className="mt-6 bg-white border border-slate-200 px-6 py-2.5 rounded-xl text-[10px] font-black text-indigo-600 hover:bg-indigo-50 transition-all shadow-sm"
            >
              Créer la première commande
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
            {activeOrders.map((order) => {
              const statusConfig = getStatusConfig(order.status);
              return (
                <button
                  key={order.id}
                  onClick={() => onSelectOrder(order.id)}
                  className={`bg-white p-7 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-2xl hover:border-indigo-200 transition-all text-left flex flex-col group relative overflow-hidden ${statusConfig.bg}`}
                >
                  <div className="flex justify-between items-start mb-6 relative z-10">
                    <span className="text-[9px] font-black bg-white/80 backdrop-blur-sm border border-slate-100 px-3 py-1 rounded-lg text-slate-500 uppercase tracking-widest shadow-sm">
                      #{order.id.slice(-4)}
                    </span>
                    <span
                      className={`text-[9px] font-black px-3 py-1.5 rounded-lg uppercase tracking-widest flex items-center gap-1.5 border shadow-sm ${statusConfig.color}`}
                    >
                      {statusConfig.icon}
                      {statusConfig.label}
                    </span>
                  </div>

                  <div className="space-y-1 mb-8 relative z-10">
                    <h3 className="text-3xl font-black text-slate-900 tracking-tighter italic">
                      {formatAmount(order.total)}
                      <span className="text-xs ml-1 font-bold text-slate-400 opacity-60 uppercase tracking-widest not-italic">
                        {settings.currency}
                      </span>
                    </h3>
                    <div className="flex items-center gap-2 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                      <Clock size={12} className="text-slate-300" />
                      <span>{formatTimeSafe(order.createdAt)}</span>
                    </div>
                  </div>

                  <div className="mt-auto pt-6 border-t border-slate-100/50 flex items-center justify-between text-slate-400 relative z-10">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-500 transition-colors">
                        <User size={14} />
                      </div>
                      <div>
                        <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest">
                          Serveur
                        </p>
                        <p className="text-[10px] font-black text-slate-600 uppercase truncate max-w-[100px]">
                          {order.serverName}
                        </p>
                      </div>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-indigo-600 group-hover:text-white group-hover:translate-x-1 transition-all shadow-sm">
                      <ChevronRight size={18} />
                    </div>
                  </div>

                  {/* Decorative background element */}
                  <div
                    className={`absolute top-0 right-0 w-32 h-32 -mr-16 -mt-16 rounded-full opacity-[0.03] pointer-events-none ${statusConfig.color.split(" ")[0]}`}
                  ></div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderListView;
