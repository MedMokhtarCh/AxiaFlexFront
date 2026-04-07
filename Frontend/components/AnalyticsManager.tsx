import React, { useState, useMemo, useEffect } from "react";
import { usePOS } from "../store/POSContext";
import {
  SalesSummaryRow,
  SalesByProductRow,
  SalesByPaymentMethodRow,
} from "../types";
// Fix: Import Users instead of User from lucide-react to match the component usage in the JSX
import {
  Users,
  ShoppingBag,
  Package,
  Layers,
  TrendingUp,
  Search,
  Calendar,
  ChevronRight,
} from "lucide-react";

const formatAmount = (value: unknown, digits = 3) =>
  Number(value ?? 0).toFixed(digits);
const formatDateTimeSafe = (value: unknown) => {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
  }
  if (typeof value === "string") {
    const asNumber = Number(value);
    const date = !Number.isNaN(asNumber)
      ? new Date(asNumber)
      : new Date(Date.parse(value));
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
  }
  return "—";
};

const AnalyticsManager: React.FC = () => {
  const {
    orders,
    products,
    categories,
    settings,
    getCogsByDayReport,
    getProductProfitabilityReport,
    getSalesSummaryReport,
    getSalesByProductReport,
    getSalesByPaymentMethodReport,
  } = usePOS();
  const [activeTab, setActiveTab] = useState<"sales" | "staff">("sales");
  const [searchTerm, setSearchTerm] = useState("");
  const [cogsByDay, setCogsByDay] = useState<any[]>([]);
  const [profitabilityRows, setProfitabilityRows] = useState<any[]>([]);
  const [salesSummary, setSalesSummary] = useState<{
    items: SalesSummaryRow[];
    totals: { ticketCount: number; revenue: number; averageTicket: number };
  } | null>(null);
  const [salesByProduct, setSalesByProduct] = useState<SalesByProductRow[]>([]);
  const [salesByPayment, setSalesByPayment] = useState<
    SalesByPaymentMethodRow[]
  >([]);
  const [periodDays, setPeriodDays] = useState<number>(30);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all");

  const totalPaymentRevenue = useMemo(
    () =>
      salesByPayment.reduce((sum, row) => sum + Number(row.revenue || 0), 0),
    [salesByPayment],
  );

  // Analytics Calculations
  const completedOrders = orders.filter((o) => o.status === "COMPLETED");

  const stats = useMemo(() => {
    const productMap = new Map<string, number>();
    const packMap = new Map<string, number>();
    const categoryMap = new Map<string, number>();
    const staffMap = new Map<string, { count: number; revenue: number }>();

    completedOrders.forEach((order) => {
      // Staff Stats
      const s = staffMap.get(order.serverName) || { count: 0, revenue: 0 };
      const orderTotal =
        typeof order.total === "number"
          ? order.total
          : Number(order.total) || 0;
      staffMap.set(order.serverName, {
        count: s.count + 1,
        revenue: s.revenue + orderTotal,
      });

      // Item Stats
      order.items.forEach((item) => {
        const product = products.find((p) => p.id === item.productId);
        if (!product) return;

        // Group by product
        productMap.set(
          product.name,
          (productMap.get(product.name) || 0) + item.quantity,
        );

        // Group by Category (use human-readable category name when possible)
        const categoryLabel = (() => {
          const match = categories.find(
            (c) => c.id === product.category || c.name === product.category,
          );
          return match?.name || product.category || "Sans catégorie";
        })();
        categoryMap.set(
          categoryLabel,
          (categoryMap.get(categoryLabel) || 0) + item.quantity,
        );

        // Group by Packs
        if (product.isPack) {
          packMap.set(
            product.name,
            (packMap.get(product.name) || 0) + item.quantity,
          );
        }
      });
    });

    const sortMap = (map: Map<string, any>) =>
      Array.from(map.entries()).sort((a, b) => b[1] - a[1]);

    return {
      topProducts: sortMap(productMap).slice(0, 5),
      topPacks: sortMap(packMap).slice(0, 5),
      topCategories: sortMap(categoryMap).slice(0, 5),
      staffPerformance: Array.from(staffMap.entries()).sort(
        (a, b) => b[1].count - a[1].count,
      ),
    };
  }, [completedOrders, products, categories]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const to = Date.now();
        const from = to - periodDays * 24 * 60 * 60 * 1000;
        const [daily, profitability, sales, byProduct, byPayment] =
          await Promise.all([
            getCogsByDayReport({ from, to }),
            getProductProfitabilityReport({ from, to }),
            getSalesSummaryReport({ from, to }),
            getSalesByProductReport({
              from,
              to,
              ...(selectedCategoryId !== "all"
                ? { categoryId: selectedCategoryId }
                : {}),
            }),
            getSalesByPaymentMethodReport({ from, to }),
          ]);
        if (!active) return;
        setCogsByDay(Array.isArray(daily) ? daily : []);
        setProfitabilityRows(Array.isArray(profitability) ? profitability : []);
        if (sales && Array.isArray(sales.items) && sales.totals) {
          setSalesSummary({ items: sales.items, totals: sales.totals });
        } else {
          setSalesSummary(null);
        }
        setSalesByProduct(
          byProduct && Array.isArray(byProduct.items) ? byProduct.items : [],
        );
        setSalesByPayment(
          byPayment && Array.isArray(byPayment.items) ? byPayment.items : [],
        );
      } catch {
        if (!active) return;
        setCogsByDay([]);
        setProfitabilityRows([]);
        setSalesSummary(null);
        setSalesByProduct([]);
        setSalesByPayment([]);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [
    getCogsByDayReport,
    getProductProfitabilityReport,
    getSalesSummaryReport,
    getSalesByProductReport,
    getSalesByPaymentMethodReport,
    periodDays,
    selectedCategoryId,
  ]);

  return (
    <div className="flex flex-col h-full gap-8">
      {/* Tab Switcher */}
      <div className="flex gap-4 shrink-0">
        <button
          onClick={() => setActiveTab("sales")}
          className={`px-8 py-3 rounded-2xl font-black text-sm transition-all flex items-center gap-3 ${activeTab === "sales" ? "bg-indigo-600 text-white shadow-xl shadow-indigo-600/20" : "bg-white text-slate-500 border border-slate-100"}`}
        >
          <TrendingUp size={18} /> Analyses des ventes
        </button>
        <button
          onClick={() => setActiveTab("staff")}
          className={`px-8 py-3 rounded-2xl font-black text-sm transition-all flex items-center gap-3 ${activeTab === "staff" ? "bg-indigo-600 text-white shadow-xl shadow-indigo-600/20" : "bg-white text-slate-500 border border-slate-100"}`}
        >
          <Users size={18} /> Activité du personnel
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 pb-6 space-y-8">
        {activeTab === "sales" ? (
          <div className="space-y-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <Calendar size={14} className="text-slate-400" />
                <span>Période</span>
                <div className="flex gap-2 ml-2">
                  {[7, 30, 90].map((d) => (
                    <button
                      key={d}
                      onClick={() => setPeriodDays(d)}
                      className={`px-3 py-1 rounded-xl text-xs font-black border transition-colors ${
                        periodDays === d
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-white text-slate-500 border-slate-200"
                      }`}
                    >
                      {d} j
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <span>Département</span>
                <select
                  value={selectedCategoryId}
                  onChange={(e) => setSelectedCategoryId(e.target.value)}
                  className="ml-2 px-3 py-1 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 min-w-[160px]"
                >
                  <option value="all">Tous les départements</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {salesSummary && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white rounded-[2rem] p-6 border border-slate-100 shadow-sm">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                    CA (30 derniers jours)
                  </p>
                  <p className="text-2xl font-black text-slate-800">
                    {formatAmount(salesSummary.totals.revenue, 2)}{" "}
                    {settings.currency}
                  </p>
                </div>
                <div className="bg-white rounded-[2rem] p-6 border border-slate-100 shadow-sm">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                    Tickets (30 jours)
                  </p>
                  <p className="text-2xl font-black text-slate-800">
                    {salesSummary.totals.ticketCount}
                  </p>
                </div>
                <div className="bg-white rounded-[2rem] p-6 border border-slate-100 shadow-sm">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                    Panier moyen (30 jours)
                  </p>
                  <p className="text-2xl font-black text-slate-800">
                    {formatAmount(salesSummary.totals.averageTicket, 2)}{" "}
                    {settings.currency}
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
              {/* Top Products */}
              <div className="bg-white rounded-[3rem] p-8 border border-slate-100 shadow-sm flex flex-col">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <ShoppingBag size={24} />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800">Top Articles</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Par quantité vendue
                    </p>
                  </div>
                </div>
                <div className="space-y-6 flex-1">
                  {stats.topProducts.map(([name, qty], i) => (
                    <div
                      key={name}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <span className="w-6 text-xs font-black text-slate-300">
                          0{i + 1}
                        </span>
                        <p className="font-bold text-slate-700">{name}</p>
                      </div>
                      <span className="bg-slate-50 px-3 py-1 rounded-lg text-xs font-black text-indigo-600">
                        {qty} vendus
                      </span>
                    </div>
                  ))}
                  {stats.topProducts.length === 0 && (
                    <p className="text-center text-slate-300 italic text-sm py-10">
                      No data available yet
                    </p>
                  )}
                </div>
              </div>

              {/* Top Packs */}
              <div className="bg-white rounded-[3rem] p-8 border border-slate-100 shadow-sm flex flex-col">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                    <Package size={24} />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800">
                      Packs les plus vendus
                    </h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Performances des promotions
                    </p>
                  </div>
                </div>
                <div className="space-y-6 flex-1">
                  {stats.topPacks.map(([name, qty], i) => (
                    <div
                      key={name}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <span className="w-6 text-xs font-black text-slate-300">
                          0{i + 1}
                        </span>
                        <p className="font-bold text-slate-700">{name}</p>
                      </div>
                      <span className="bg-amber-50 px-3 py-1 rounded-lg text-xs font-black text-amber-600">
                        {qty} vendus
                      </span>
                    </div>
                  ))}
                  {stats.topPacks.length === 0 && (
                    <p className="text-center text-slate-300 italic text-sm py-10">
                      No packs sold today
                    </p>
                  )}
                </div>
              </div>

              {/* Top Categories */}
              <div className="bg-white rounded-[3rem] p-8 border border-slate-100 shadow-sm flex flex-col">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Layers size={24} />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800">
                      Classement des départements
                    </h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Moteurs de chiffre d'affaires
                    </p>
                  </div>
                </div>
                <div className="space-y-6 flex-1">
                  {stats.topCategories.map(([name, qty], i) => (
                    <div key={name} className="flex flex-col gap-2">
                      <div className="flex justify-between items-center">
                        <p className="font-bold text-slate-700">{name}</p>
                        <span className="text-xs font-black text-emerald-600">
                          {qty} articles
                        </span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{
                            width: `${Math.min(100, (qty / (stats.topCategories[0]?.[1] || 1)) * 100)}%`,
                          }}
                        ></div>
                      </div>
                    </div>
                  ))}
                  {stats.topCategories.length === 0 && (
                    <p className="text-center text-slate-300 italic text-sm py-10">
                      En attente des premières ventes
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
              <div className="bg-white rounded-[3rem] p-8 border border-slate-100 shadow-sm flex flex-col">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <TrendingUp size={24} />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800">
                      Rentabilité produits (30 j)
                    </h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Chiffre d'affaires vs COGS par produit
                    </p>
                  </div>
                </div>
                <div className="space-y-4 flex-1">
                  {profitabilityRows.slice(0, 6).map((row) => (
                    <div
                      key={row.productId}
                      className="flex items-center justify-between"
                    >
                      <div>
                        <p className="font-bold text-slate-700">
                          {row.productName}
                        </p>
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                          Qty {row.quantitySold}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-emerald-600">
                          {formatAmount(row.grossProfit)} {settings.currency}
                        </p>
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                          Margin {formatAmount(row.grossMarginPct, 1)}%
                        </p>
                      </div>
                    </div>
                  ))}
                  {profitabilityRows.length === 0 && (
                    <p className="text-center text-slate-300 italic text-sm py-10">
                      Aucune donnée de rentabilité pour l'instant
                    </p>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-[3rem] p-8 border border-slate-100 shadow-sm flex flex-col">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                    <Calendar size={24} />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800">
                      COGS quotidien (30 j)
                    </h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Chiffre d'affaires, coût et marge brute journalière
                    </p>
                  </div>
                </div>
                <div className="space-y-4 flex-1">
                  {cogsByDay
                    .slice(-7)
                    .reverse()
                    .map((row) => (
                      <div
                        key={row.day}
                        className="flex items-center justify-between"
                      >
                        <div>
                          <p className="font-bold text-slate-700">{row.day}</p>
                          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                            {row.orderCount} commandes
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-slate-800">
                            COGS {formatAmount(row.cogs)} {settings.currency}
                          </p>
                          <p className="text-[10px] text-emerald-600 font-black uppercase tracking-widest">
                            GP {formatAmount(row.grossProfit)}{" "}
                            {settings.currency}
                          </p>
                        </div>
                      </div>
                    ))}
                  {cogsByDay.length === 0 && (
                    <p className="text-center text-slate-300 italic text-sm py-10">
                      Aucune donnée COGS pour l'instant
                    </p>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-[3rem] p-8 border border-slate-100 shadow-sm flex flex-col">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-600 flex items-center justify-center">
                    <ShoppingBag size={24} />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800">
                      Ventes par produit (30 j)
                    </h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Quantité et chiffre d'affaires par article
                    </p>
                  </div>
                </div>
                <div className="overflow-x-auto -mx-4 px-4">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      <tr>
                        <th className="py-2 pr-4">Article</th>
                        <th className="py-2 pr-4 text-right">Quantité</th>
                        <th className="py-2 pr-4 text-right">CA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesByProduct
                        .slice()
                        .sort((a, b) => b.revenue - a.revenue)
                        .slice(0, 10)
                        .map((row) => (
                          <tr
                            key={row.productId}
                            className="border-b border-slate-50 last:border-0"
                          >
                            <td className="py-2 pr-4 font-bold text-slate-700">
                              {row.productName}
                            </td>
                            <td className="py-2 pr-4 text-right font-bold text-slate-500">
                              {row.quantity}
                            </td>
                            <td className="py-2 pr-4 text-right font-black text-slate-800">
                              {formatAmount(row.revenue, 2)} {settings.currency}
                            </td>
                          </tr>
                        ))}
                      {salesByProduct.length === 0 && (
                        <tr>
                          <td
                            colSpan={3}
                            className="py-8 text-center text-slate-300 italic text-sm"
                          >
                            Aucune donnée de ventes consolidée pour l'instant
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white rounded-[3rem] p-8 border border-slate-100 shadow-sm flex flex-col">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-600 flex items-center justify-center">
                    <Layers size={24} />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800">
                      Répartition CA par mode de paiement
                    </h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Mix encaissements sur la période
                    </p>
                  </div>
                </div>
                <div className="overflow-x-auto -mx-4 px-4">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      <tr>
                        <th className="py-2 pr-4">Méthode</th>
                        <th className="py-2 pr-4 text-right">Tickets</th>
                        <th className="py-2 pr-4 text-right">CA</th>
                        <th className="py-2 pr-4 text-right">Part</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesByPayment
                        .slice()
                        .sort((a, b) => b.revenue - a.revenue)
                        .map((row) => {
                          const share =
                            totalPaymentRevenue > 0
                              ? (Number(row.revenue || 0) /
                                  totalPaymentRevenue) *
                                100
                              : 0;
                          return (
                            <tr
                              key={row.method}
                              className="border-b border-slate-50 last:border-0"
                            >
                              <td className="py-2 pr-4 font-bold text-slate-700">
                                {row.method}
                              </td>
                              <td className="py-2 pr-4 text-right font-bold text-slate-500">
                                {row.ticketCount}
                              </td>
                              <td className="py-2 pr-4 text-right font-black text-slate-800">
                                {formatAmount(row.revenue, 2)}{" "}
                                {settings.currency}
                              </td>
                              <td className="py-2 pr-4 text-right text-xs font-black text-slate-500">
                                {formatAmount(share, 1)}%
                              </td>
                            </tr>
                          );
                        })}
                      {salesByPayment.length === 0 && (
                        <tr>
                          <td
                            colSpan={4}
                            className="py-8 text-center text-slate-300 italic text-sm"
                          >
                            Aucune donnée de paiement pour l'instant
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {stats.staffPerformance.slice(0, 4).map(([name, data], i) => (
                <div
                  key={name}
                  className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-xl transition-all"
                >
                  <div
                    className={`absolute top-0 right-0 w-24 h-24 rounded-full -mr-12 -mt-12 transition-all ${i === 0 ? "bg-indigo-500/10" : "bg-slate-50"}`}
                  ></div>
                  <div className="relative z-10">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                      {i === 0 ? "Meilleur serveur" : `Rang #0${i + 1}`}
                    </p>
                    <h4 className="text-2xl font-black text-slate-800 mb-6">
                      {name}
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">
                          Commandes
                        </p>
                        <p className="font-black text-indigo-600">
                          {data.count}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">
                          Chiffre d'affaires
                        </p>
                        <p className="font-black text-slate-800">
                          {formatAmount(data.revenue)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col">
              <div className="p-8 border-b border-slate-50 flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                  <h3 className="text-xl font-black text-slate-800">
                    Historique des commandes
                  </h3>
                  <p className="text-sm text-slate-400 font-bold">
                    Journal de toutes les additions servies par le personnel
                  </p>
                </div>
                <div className="relative w-full md:w-80">
                  <Search
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                    size={18}
                  />
                  <input
                    type="text"
                    placeholder="Rechercher par nom de serveur..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-12 pr-6 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-sm"
                  />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50/50">
                    <tr className="border-b border-slate-100">
                      <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Commande
                      </th>
                      <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Serveur
                      </th>
                      <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Montant
                      </th>
                      <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Méthode
                      </th>
                      <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Date / Heure
                      </th>
                      <th className="px-8 py-5 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {orders
                      .filter((o) =>
                        o.serverName
                          .toLowerCase()
                          .includes(searchTerm.toLowerCase()),
                      )
                      .slice()
                      .reverse()
                      .map((order) => (
                        <tr
                          key={order.id}
                          className="hover:bg-slate-50/50 transition-colors"
                        >
                          <td className="px-8 py-5">
                            <span className="font-mono text-xs font-bold text-slate-400">
                              #{order.id.slice(-6)}
                            </span>
                          </td>
                          <td className="px-8 py-5">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-[10px]">
                                {order.serverName.charAt(0)}
                              </div>
                              <span className="font-bold text-slate-700">
                                {order.serverName}
                              </span>
                            </div>
                          </td>
                          <td className="px-8 py-5 font-black text-slate-800">
                            {formatAmount(order.total)} {settings.currency}
                          </td>
                          <td className="px-8 py-5">
                            <span className="text-[10px] font-black bg-slate-100 px-2 py-1 rounded text-slate-500 uppercase">
                              {order.paymentMethod || "PENDING"}
                            </span>
                          </td>
                          <td className="px-8 py-5 text-xs text-slate-400 font-bold">
                            {formatDateTimeSafe(order.createdAt)}
                          </td>
                          <td className="px-8 py-5 text-right">
                            <ChevronRight
                              size={18}
                              className="text-slate-200 inline"
                            />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalyticsManager;
