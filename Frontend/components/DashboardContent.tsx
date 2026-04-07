import React, { useMemo } from "react";
import { Bell } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { usePOS } from "../store/POSContext";
import { Role, OrderType, OrderStatus, Order } from "../types";

const formatAmount = (value: unknown, digits = 3) =>
  Number(value ?? 0).toFixed(digits);

/** Horodatage commande (ms) — gère number, chaîne ISO, valeurs invalides. */
function orderCreatedAtMs(createdAt: unknown): number | null {
  if (createdAt == null) return null;
  const d =
    typeof createdAt === "number"
      ? new Date(createdAt)
      : typeof createdAt === "string"
        ? new Date(createdAt)
        : new Date(Number(createdAt));
  const t = d.getTime();
  return Number.isFinite(t) ? t : null;
}

const TYPE_LABELS: Record<OrderType, string> = {
  [OrderType.DINE_IN]: "Sur place",
  [OrderType.DELIVERY]: "Livraison",
  [OrderType.TAKE_OUT]: "À emporter",
};

const STATUS_LABELS: Record<string, string> = {
  [OrderStatus.PENDING]: "En attente",
  [OrderStatus.PREPARING]: "Préparation",
  [OrderStatus.READY]: "Prêt",
  [OrderStatus.DELIVERED]: "Servi",
  [OrderStatus.PARTIAL]: "Partiel",
  [OrderStatus.COMPLETED]: "Terminé",
  [OrderStatus.INVOICED]: "Facturé",
  [OrderStatus.CANCELLED]: "Annulé",
};

const CHART_COLORS = [
  "#4f46e5",
  "#059669",
  "#d97706",
  "#db2777",
  "#7c3aed",
  "#0d9488",
  "#ea580c",
  "#64748b",
];

function aggregateRevenueByDay(orders: Order[], days: number) {
  const now = Date.now();
  const dayMs = 86400000;
  const start = now - (days - 1) * dayMs;
  const keys: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start + i * dayMs);
    keys.push(d.toISOString().slice(0, 10));
  }
  const map = new Map(keys.map((k) => [k, 0]));
  orders.forEach((o) => {
    const t = orderCreatedAtMs(o.createdAt);
    if (t == null || t < start - dayMs) return;
    const key = new Date(t).toISOString().slice(0, 10);
    if (!map.has(key)) return;
    map.set(key, (map.get(key) || 0) + Number(o.total || 0));
  });
  return keys.map((date) => {
    const d = new Date(date + "T12:00:00");
    return {
      date,
      label: d.toLocaleDateString("fr-FR", {
        weekday: "short",
        day: "numeric",
        month: "short",
      }),
      montant: Math.round((map.get(date) || 0) * 1000) / 1000,
    };
  });
}

function trendPercent(current: number, previous: number): string {
  if (previous <= 0 && current <= 0) return "—";
  if (previous <= 0) return "+100%";
  const p = ((current - previous) / previous) * 100;
  const s = p >= 0 ? "+" : "";
  return `${s}${p.toFixed(1)}%`;
}

const DashboardContent: React.FC = () => {
  const { orders, session, settings, currentUser } = usePOS();

  const isPrivileged = [Role.ADMIN, Role.MANAGER, Role.CASHIER].includes(
    currentUser?.role!,
  );
  const visibleOrders = useMemo(() => {
    if (isPrivileged) return orders;
    return orders.filter((o) => o.serverId === currentUser?.id);
  }, [orders, currentUser, isPrivileged]);

  const revenueSeries = useMemo(
    () => aggregateRevenueByDay(visibleOrders, 14),
    [visibleOrders],
  );

  const revenueTrend = useMemo(() => {
    const half = Math.floor(revenueSeries.length / 2);
    const first = revenueSeries.slice(0, half).reduce((s, r) => s + r.montant, 0);
    const second = revenueSeries.slice(half).reduce((s, r) => s + r.montant, 0);
    return trendPercent(second, first);
  }, [revenueSeries]);

  const ordersByType = useMemo(() => {
    const acc: Record<string, number> = {
      [OrderType.DINE_IN]: 0,
      [OrderType.DELIVERY]: 0,
      [OrderType.TAKE_OUT]: 0,
    };
    visibleOrders.forEach((o) => {
      acc[o.type] = (acc[o.type] || 0) + 1;
    });
    return (Object.keys(acc) as OrderType[]).map((type) => ({
      name: TYPE_LABELS[type],
      commandes: acc[type],
      type,
    }));
  }, [visibleOrders]);

  const statusSlices = useMemo(() => {
    const acc = new Map<string, number>();
    visibleOrders.forEach((o) => {
      const k = o.status;
      acc.set(k, (acc.get(k) || 0) + 1);
    });
    return Array.from(acc.entries())
      .map(([status, value]) => ({
        name: STATUS_LABELS[status] || status,
        value,
        status,
      }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [visibleOrders]);

  const totalRevenueOrders = useMemo(
    () =>
      visibleOrders.reduce((s, o) => s + Number(o.total || 0), 0),
    [visibleOrders],
  );

  const stats = [
    {
      label: "Chiffre d’affaires (commandes)",
      value: `${formatAmount(totalRevenueOrders)} ${settings.currency}`,
      trend: revenueTrend,
      color: "indigo",
    },
    {
      label: "Commandes (période chargée)",
      value: visibleOrders.length.toString(),
      trend: visibleOrders.length > 0 ? "Actif" : "—",
      color: "emerald",
    },
    {
      label: "Panier moyen",
      value: `${visibleOrders.length > 0 ? formatAmount(totalRevenueOrders / visibleOrders.length) : "0.000"} ${settings.currency}`,
      trend: "—",
      color: "amber",
    },
    {
      label: "Session caisse",
      value: session?.isOpen ? "Ouverte" : "Fermée",
      trend: session?.isOpen ? "Live" : "—",
      color: "rose",
    },
  ];

  const tooltipStyle = {
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    fontSize: 12,
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <div
            key={i}
            className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100"
          >
            <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-2">
              {stat.label}
            </p>
            <div className="flex items-end justify-between">
              <h3 className="text-2xl font-black text-slate-800 tracking-tight">
                {stat.value}
              </h3>
              <span
                className={`text-[10px] font-black px-3 py-1.5 rounded-full ${
                  stat.trend.startsWith("+")
                    ? "bg-emerald-100 text-emerald-600"
                    : stat.trend.startsWith("-")
                      ? "bg-rose-100 text-rose-600"
                      : "bg-slate-100 text-slate-600"
                }`}
              >
                {stat.trend}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 p-6 sm:p-8">
          <div className="mb-4">
            <h3 className="font-black text-lg text-slate-800 tracking-tight">
              Évolution du CA (14 jours)
            </h3>
            <p className="text-xs text-slate-500 font-bold mt-1">
              Somme des totaux des commandes visibles, par jour.
            </p>
          </div>
          <div className="h-[300px] w-full min-w-0">
            {visibleOrders.length === 0 ? (
              <p className="text-center text-slate-400 py-20 text-sm font-medium">
                Aucune donnée pour le graphique.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={revenueSeries}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="dashCaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "#64748b" }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#64748b" }}
                    width={48}
                    tickFormatter={(v) => `${v}`}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: number) => [
                      `${formatAmount(value)} ${settings.currency}`,
                      "CA",
                    ]}
                    labelFormatter={(_, payload) =>
                      payload?.[0]?.payload?.date
                        ? new Date(
                            `${payload[0].payload.date}T12:00:00`,
                          ).toLocaleDateString("fr-FR", {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                          })
                        : ""
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="montant"
                    name="CA"
                    stroke="#4f46e5"
                    strokeWidth={2}
                    fill="url(#dashCaGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 p-6 sm:p-8">
          <div className="mb-4">
            <h3 className="font-black text-lg text-slate-800 tracking-tight">
              Commandes par canal
            </h3>
            <p className="text-xs text-slate-500 font-bold mt-1">
              Nombre de commandes par type (sur place, livraison, à emporter).
            </p>
          </div>
          <div className="h-[300px] w-full min-w-0">
            {visibleOrders.length === 0 ? (
              <p className="text-center text-slate-400 py-20 text-sm font-medium">
                Aucune donnée pour le graphique.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={ordersByType}
                  margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 10, fill: "#64748b" }}
                    width={36}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="commandes" name="Commandes" radius={[8, 8, 0, 0]}>
                    {ordersByType.map((_, i) => (
                      <Cell
                        key={i}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white rounded-[3rem] shadow-sm border border-slate-100 p-8">
          <div className="flex justify-between items-center mb-8">
            <h3 className="font-black text-xl text-slate-800 tracking-tight">
              Activité récente
            </h3>
          </div>
          <div className="space-y-4">
            {visibleOrders
              .slice(-5)
              .reverse()
              .map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between p-5 bg-slate-50 rounded-[2rem] hover:bg-slate-100 transition-all border border-transparent hover:border-slate-200"
                >
                  <div className="flex items-center gap-5">
                    <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-slate-800 font-black border border-slate-200 text-lg shadow-sm">
                      #{order.id.slice(-3)}
                    </div>
                    <div>
                      <p className="font-black text-slate-800 text-sm tracking-tight">
                        {order.type === OrderType.DINE_IN
                          ? "Sur place"
                          : order.type === OrderType.DELIVERY
                            ? "Livraison"
                            : "À emporter"}
                      </p>
                      <p className="text-xs font-bold text-slate-400">
                        {(() => {
                          const t = orderCreatedAtMs(order.createdAt);
                          return t != null
                            ? new Date(t).toLocaleTimeString("fr-FR")
                            : "—";
                        })()}{" "}
                        • {order.serverName}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-indigo-600 text-lg">
                      {formatAmount(order.total)} {settings.currency}
                    </p>
                    <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest bg-emerald-50 px-3 py-1 rounded-full">
                      {order.status}
                    </p>
                  </div>
                </div>
              ))}
            {visibleOrders.length === 0 && (
              <p className="text-center text-slate-400 py-14 font-medium italic">
                Aucune commande enregistrée pour votre compte.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-8">
          <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 p-6 sm:p-8">
            <h3 className="font-black text-lg text-slate-800 tracking-tight mb-1">
              Répartition par statut
            </h3>
            <p className="text-xs text-slate-500 font-bold mb-4">
              Part des commandes selon le statut courant.
            </p>
            <div className="h-[260px] w-full min-w-0">
              {statusSlices.length === 0 ? (
                <p className="text-center text-slate-400 py-16 text-sm">
                  Aucune donnée.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusSlices}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={88}
                      paddingAngle={2}
                      label={({ name, percent }) =>
                        `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                      }
                      labelLine={false}
                    >
                      {statusSlices.map((_, i) => (
                        <Cell
                          key={i}
                          fill={CHART_COLORS[i % CHART_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend
                      wrapperStyle={{ fontSize: 11 }}
                      formatter={(value) => (
                        <span className="text-slate-600 font-bold">{value}</span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="bg-indigo-600 text-white rounded-[3rem] shadow-2xl p-8 relative overflow-hidden flex flex-col">
            <div className="relative z-10">
              <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mb-6">
                <Bell size={24} />
              </div>
              <h3 className="font-black text-2xl mb-4 leading-tight">
                Aperçu activité
              </h3>
              <p className="text-sm text-indigo-100 font-medium leading-relaxed">
                Les graphiques utilisent les commandes chargées dans l&apos;application
                (filtrées par vos droits : tout le salon pour les rôles caisse /
                manager, sinon uniquement vos commandes).
              </p>
              <div className="mt-8 pt-6 border-t border-white/10">
                <p className="text-sm text-indigo-100 font-medium italic">
                  Pour des rapports détaillés et exports, utilisez l&apos;onglet
                  « Rapports » ou « Analyses ».
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardContent;
