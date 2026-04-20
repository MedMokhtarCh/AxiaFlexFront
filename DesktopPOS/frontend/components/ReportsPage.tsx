import React, { useEffect, useMemo, useState } from "react";
import { usePOS } from "../store/POSContext";
import {
  SalesByProductRow,
  SalesByCategoryRow,
  SalesByServerRow,
  SalesByPaymentMethodRow,
  SalesByTimeslotRow,
  CashClosingRow,
  TopCustomerRow,
  Order,
  Invoice,
  Role,
} from "../types";
import { Calendar, Download, FileText } from "lucide-react";

const formatAmount = (value: unknown, digits = 3) =>
  Number(value ?? 0).toFixed(digits);

const formatDateInput = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDateTime = (ts: number | null | undefined) => {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month} ${hours}:${minutes}`;
};

const parseDateToTs = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const d = new Date(value + "T00:00:00");
  if (Number.isNaN(d.getTime())) return undefined;
  return d.getTime();
};

const PAGE_SIZE = 25;

const ReportsPage: React.FC = () => {
  const {
    orders,
    zones,
    clients,
    invoices,
    categories,
    settings,
    funds,
    currentUser,
    fetchOrdersForReports,
    getSalesByProductReport,
    getSalesByCategoryReport,
    getSalesByServerReport,
    getSalesByPaymentMethodReport,
    getSalesByTimeslotReport,
    getCashClosingReport,
    getTopCustomersReport,
    getTicketsByOrder,
  } = usePOS();

  const isAdmin = currentUser?.role === Role.ADMIN;
  const [reportTerminalFilter, setReportTerminalFilter] = useState<
    "poste" | "all" | string
  >("poste");
  const [reportOrders, setReportOrders] = useState<Order[]>([]);

  const effectiveTerminalFilter = useMemo(
    () => (isAdmin ? reportTerminalFilter : "poste"),
    [isAdmin, reportTerminalFilter],
  );

  const terminalIdsFromFunds = useMemo(() => {
    const set = new Set<string>();
    funds.forEach((f) => {
      const t = f.terminalId?.trim();
      if (t) set.add(t);
    });
    return Array.from(set).sort();
  }, [funds]);

  const terminalScopeLabel = useMemo(() => {
    const tf = effectiveTerminalFilter;
    if (tf === "all") return "Tous les terminaux";
    if (tf === "poste") {
      const tid = settings.terminalId?.trim();
      return tid
        ? `Terminal : ${tid}`
        : "Terminal du poste (non défini dans les paramètres)";
    }
    return `Terminal : ${tf}`;
  }, [effectiveTerminalFilter, settings.terminalId]);

  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [productRows, setProductRows] = useState<SalesByProductRow[]>([]);
  const [categoryRows, setCategoryRows] = useState<SalesByCategoryRow[]>([]);
  const [serverRows, setServerRows] = useState<SalesByServerRow[]>([]);
  const [paymentRows, setPaymentRows] = useState<SalesByPaymentMethodRow[]>([]);
  const [timeslotRows, setTimeslotRows] = useState<SalesByTimeslotRow[]>([]);
  const [cashRows, setCashRows] = useState<CashClosingRow[]>([]);
  const [customerRows, setCustomerRows] = useState<TopCustomerRow[]>([]);

  const [ordersPage, setOrdersPage] = useState(1);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [orderStatusFilter, setOrderStatusFilter] = useState<
    "all" | "paid" | "unpaid" | "toInvoice"
  >("all");
  const [orderItemsPage, setOrderItemsPage] = useState(1);
  const [ticketsForOrder, setTicketsForOrder] = useState<any[]>([]);
  const [loadingOrderTickets, setLoadingOrderTickets] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [invoicePage, setInvoicePage] = useState(1);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(
    null,
  );
  const [invoiceClientFilter, setInvoiceClientFilter] = useState<string>("all");
  const [nacefStatusFilter, setNacefStatusFilter] = useState<
    "all" | "signed" | "rejected"
  >("all");
  const [nacefTimelineDays, setNacefTimelineDays] = useState<7 | 30>(7);
  const [nacefTimelineRejectOnly, setNacefTimelineRejectOnly] = useState(false);

  const [productPage, setProductPage] = useState(1);
  const [categoryPage, setCategoryPage] = useState(1);
  const [serverPage, setServerPage] = useState(1);
  const [paymentPage, setPaymentPage] = useState(1);
  const [timeslotPage, setTimeslotPage] = useState(1);
  const [cashPage, setCashPage] = useState(1);
  const [customerPage, setCustomerPage] = useState(1);
  const [activeReportTab, setActiveReportTab] = useState<
    | "products"
    | "categories"
    | "servers"
    | "payments"
    | "timeslots"
    | "customers"
    | "nacef"
    | "orders"
    | "invoices"
    | "cash"
  >("products");

  useEffect(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - 30);
    setDateTo(formatDateInput(to));
    setDateFrom(formatDateInput(from));
  }, []);

  const loadReports = async () => {
    const fromTs = parseDateToTs(dateFrom);
    const toTs = parseDateToTs(dateTo);
    const tf = isAdmin ? reportTerminalFilter : "poste";
    setLoading(true);
    setError(null);
    try {
      const [
        byProduct,
        byCategory,
        byServer,
        byPayment,
        byTimeslot,
        cashClosing,
        topCustomers,
      ] = await Promise.all([
        getSalesByProductReport({
          ...(fromTs !== undefined ? { from: fromTs } : {}),
          ...(toTs !== undefined ? { to: toTs + 24 * 60 * 60 * 1000 - 1 } : {}),
          ...(selectedCategoryId !== "all"
            ? { categoryId: selectedCategoryId }
            : {}),
          terminalFilter: tf,
        }),
        getSalesByCategoryReport({
          ...(fromTs !== undefined ? { from: fromTs } : {}),
          ...(toTs !== undefined ? { to: toTs + 24 * 60 * 60 * 1000 - 1 } : {}),
          terminalFilter: tf,
        }),
        getSalesByServerReport({
          ...(fromTs !== undefined ? { from: fromTs } : {}),
          ...(toTs !== undefined ? { to: toTs + 24 * 60 * 60 * 1000 - 1 } : {}),
          terminalFilter: tf,
        }),
        getSalesByPaymentMethodReport({
          ...(fromTs !== undefined ? { from: fromTs } : {}),
          ...(toTs !== undefined ? { to: toTs + 24 * 60 * 60 * 1000 - 1 } : {}),
          terminalFilter: tf,
        }),
        getSalesByTimeslotReport({
          ...(fromTs !== undefined ? { from: fromTs } : {}),
          ...(toTs !== undefined ? { to: toTs + 24 * 60 * 60 * 1000 - 1 } : {}),
          intervalMinutes: 60,
          terminalFilter: tf,
        }),
        getCashClosingReport({
          ...(fromTs !== undefined ? { from: fromTs } : {}),
          ...(toTs !== undefined ? { to: toTs + 24 * 60 * 60 * 1000 - 1 } : {}),
          terminalFilter: tf,
        }),
        getTopCustomersReport({
          ...(fromTs !== undefined ? { from: fromTs } : {}),
          ...(toTs !== undefined ? { to: toTs + 24 * 60 * 60 * 1000 - 1 } : {}),
          limit: 50,
          terminalFilter: tf,
        }),
      ]);
      setProductRows(Array.isArray(byProduct.items) ? byProduct.items : []);
      setCategoryRows(Array.isArray(byCategory.items) ? byCategory.items : []);
      setServerRows(Array.isArray(byServer.items) ? byServer.items : []);
      setPaymentRows(Array.isArray(byPayment.items) ? byPayment.items : []);
      setTimeslotRows(Array.isArray(byTimeslot.items) ? byTimeslot.items : []);
      setCashRows(Array.isArray(cashClosing.items) ? cashClosing.items : []);
      setCustomerRows(
        Array.isArray(topCustomers.items) ? topCustomers.items : [],
      );
      if (isAdmin) {
        const ordersList = await fetchOrdersForReports(tf);
        setReportOrders(ordersList);
      } else {
        setReportOrders([]);
      }
      setProductPage(1);
      setCategoryPage(1);
      setServerPage(1);
      setPaymentPage(1);
      setTimeslotPage(1);
      setCashPage(1);
      setCustomerPage(1);
      setOrdersPage(1);
    } catch (e: any) {
      setError(e?.message || "Erreur lors du chargement des rapports");
      setProductRows([]);
      setCategoryRows([]);
      setServerRows([]);
      setPaymentRows([]);
      setTimeslotRows([]);
      setCashRows([]);
      setCustomerRows([]);
      if (isAdmin) setReportOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (dateFrom && dateTo) {
      loadReports();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, selectedCategoryId, reportTerminalFilter, isAdmin]);

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((c) => {
      map.set(c.id, c.name);
    });
    return map;
  }, [categories]);

  const pagedProductRows = useMemo(() => {
    const start = (productPage - 1) * PAGE_SIZE;
    return productRows.slice(start, start + PAGE_SIZE);
  }, [productRows, productPage]);

  const pagedCategoryRows = useMemo(() => {
    const start = (categoryPage - 1) * PAGE_SIZE;
    return categoryRows.slice(start, start + PAGE_SIZE);
  }, [categoryRows, categoryPage]);

  const pagedServerRows = useMemo(() => {
    const start = (serverPage - 1) * PAGE_SIZE;
    return serverRows.slice(start, start + PAGE_SIZE);
  }, [serverRows, serverPage]);

  const pagedPaymentRows = useMemo(() => {
    const start = (paymentPage - 1) * PAGE_SIZE;
    return paymentRows.slice(start, start + PAGE_SIZE);
  }, [paymentRows, paymentPage]);

  const pagedTimeslotRows = useMemo(() => {
    const start = (timeslotPage - 1) * PAGE_SIZE;
    return timeslotRows.slice(start, start + PAGE_SIZE);
  }, [timeslotRows, timeslotPage]);

  const pagedCashRows = useMemo(() => {
    const start = (cashPage - 1) * PAGE_SIZE;
    return cashRows.slice(start, start + PAGE_SIZE);
  }, [cashRows, cashPage]);

  const pagedCustomerRows = useMemo(() => {
    const start = (customerPage - 1) * PAGE_SIZE;
    return customerRows.slice(start, start + PAGE_SIZE);
  }, [customerRows, customerPage]);

  const productPageCount = Math.max(
    1,
    Math.ceil(productRows.length / PAGE_SIZE),
  );
  const categoryPageCount = Math.max(
    1,
    Math.ceil(categoryRows.length / PAGE_SIZE),
  );

  const serverPageCount = Math.max(1, Math.ceil(serverRows.length / PAGE_SIZE));
  const paymentPageCount = Math.max(
    1,
    Math.ceil(paymentRows.length / PAGE_SIZE),
  );

  const timeslotPageCount = Math.max(
    1,
    Math.ceil(timeslotRows.length / PAGE_SIZE),
  );
  const cashPageCount = Math.max(1, Math.ceil(cashRows.length / PAGE_SIZE));
  const customerPageCount = Math.max(
    1,
    Math.ceil(customerRows.length / PAGE_SIZE),
  );
  const invoicePageCount = Math.max(1, Math.ceil(invoices.length / PAGE_SIZE));

  const exportCsv = (
    filename: string,
    headers: string[],
    rows: (string | number)[][],
  ) => {
    const csvLines = [headers.join(";")].concat(
      rows.map((r) => r.map((v) => String(v).replace(/"/g, '""')).join(";")),
    );
    const blob = new Blob([csvLines.join("\r\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const onExportProductsCsv = () => {
    exportCsv(
      "ventes_par_produit.csv",
      ["Produit", "Catégorie", "Quantité", "CA"],
      productRows.map((r) => [
        r.productName,
        r.categoryId ? categoryNameById.get(r.categoryId) || r.categoryId : "",
        r.quantity,
        formatAmount(r.revenue, 2),
      ]),
    );
  };

  const onExportCategoriesCsv = () => {
    exportCsv(
      "ventes_par_categorie.csv",
      ["Catégorie", "Quantité", "CA"],
      categoryRows.map((r) => [
        r.categoryLabel,
        r.quantity,
        formatAmount(r.revenue, 2),
      ]),
    );
  };

  const onExportServersCsv = () => {
    exportCsv(
      "ventes_par_serveur.csv",
      ["Serveur", "Tickets", "CA"],
      serverRows.map((r) => [
        r.serverName,
        r.ticketCount,
        formatAmount(r.revenue, 2),
      ]),
    );
  };

  const onExportPaymentsCsv = () => {
    exportCsv(
      "ventes_par_mode_paiement.csv",
      ["Mode de paiement", "Tickets", "CA"],
      paymentRows.map((r) => [
        r.method,
        r.ticketCount,
        formatAmount(r.revenue, 2),
      ]),
    );
  };

  const printTable = (
    title: string,
    headers: string[],
    rows: (string | number)[][],
  ) => {
    const win = window.open("", "_blank");
    if (!win) return;
    const head = `<!DOCTYPE html><html><head><meta charSet="utf-8" /><title>${title}</title>
<style>
body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 24px; }
table { border-collapse: collapse; width: 100%; font-size: 12px; }
th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
th { background: #f3f4f6; }
</style>
</head><body>`;
    const headerHtml = `<h2>${title}</h2>`;
    const tableHead = `<thead><tr>${headers
      .map((h) => `<th>${h}</th>`)
      .join("")}</tr></thead>`;
    const tableBody = `<tbody>${rows
      .map((r) => `<tr>${r.map((v) => `<td>${String(v)}</td>`).join("")}</tr>`)
      .join("")}</tbody>`;
    const html = `${head}${headerHtml}<table>${tableHead}${tableBody}</table></body></html>`;
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.print();
  };

  const onPrintProducts = () => {
    printTable(
      "Rapport ventes par produit",
      ["Produit", "Catégorie", "Quantité", "CA"],
      productRows.map((r) => [
        r.productName,
        r.categoryId ? categoryNameById.get(r.categoryId) || r.categoryId : "",
        r.quantity,
        `${formatAmount(r.revenue, 2)} ${settings.currency}`,
      ]),
    );
  };

  const onPrintCategories = () => {
    printTable(
      "Rapport ventes par catégorie",
      ["Catégorie", "Quantité", "CA"],
      categoryRows.map((r) => [
        r.categoryLabel,
        r.quantity,
        `${formatAmount(r.revenue, 2)} ${settings.currency}`,
      ]),
    );
  };

  const onPrintServers = () => {
    printTable(
      "Rapport ventes par serveur",
      ["Serveur", "Tickets", "CA"],
      serverRows.map((r) => [
        r.serverName,
        r.ticketCount,
        `${formatAmount(r.revenue, 2)} ${settings.currency}`,
      ]),
    );
  };

  const onPrintPayments = () => {
    printTable(
      "Rapport ventes par mode de paiement",
      ["Mode de paiement", "Tickets", "CA"],
      paymentRows.map((r) => [
        r.method,
        r.ticketCount,
        `${formatAmount(r.revenue, 2)} ${settings.currency}`,
      ]),
    );
  };

  const clientNameById = useMemo(() => {
    const map = new Map<string, string>();
    clients.forEach((c) => {
      map.set(c.id, c.name);
    });
    return map;
  }, [clients]);

  const zoneNameById = useMemo(() => {
    const map = new Map<string, string>();
    zones.forEach((z) => {
      map.set(z.id, z.name);
    });
    return map;
  }, [zones]);

  const isOrderPaid = (order: Order) => {
    const total = Number(order.total ?? 0);
    const paid = Number(order.paidAmount ?? 0);
    if (!Number.isFinite(total) || total <= 0) return false;
    if (!Number.isFinite(paid)) return false;
    return paid + 0.0001 >= total;
  };

  const getOrderUiStatus = (order: Order): "INVOICED" | "PAID" | "UNPAID" => {
    if (order.invoiceId) return "INVOICED";
    if (isOrderPaid(order)) return "PAID";
    return "UNPAID";
  };

  const ordersSource = useMemo(
    () => (isAdmin ? reportOrders : orders),
    [isAdmin, reportOrders, orders],
  );

  const filteredOrders = useMemo(() => {
    const fromTs = parseDateToTs(dateFrom);
    const toTs = parseDateToTs(dateTo);
    const toEnd =
      toTs !== undefined ? toTs + 24 * 60 * 60 * 1000 - 1 : undefined;
    return ordersSource
      .filter((o) => {
        const created = o.createdAt || 0;
        if (fromTs !== undefined && created < fromTs) return false;
        if (toEnd !== undefined && created > toEnd) return false;

        if (orderStatusFilter === "paid") {
          return getOrderUiStatus(o) === "PAID";
        }
        if (orderStatusFilter === "unpaid") {
          return getOrderUiStatus(o) === "UNPAID";
        }
        if (orderStatusFilter === "toInvoice") {
          return !o.invoiceId && isOrderPaid(o);
        }
        return true;
      })
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [ordersSource, dateFrom, dateTo, orderStatusFilter]);

  const pagedOrders = useMemo(() => {
    const start = (ordersPage - 1) * PAGE_SIZE;
    return filteredOrders.slice(start, start + PAGE_SIZE);
  }, [filteredOrders, ordersPage]);

  const summarizeNacef = (list: Order[]) => {
    const summary = {
      total: 0,
      signed: 0,
      rejected: 0,
      online: 0,
      offline: 0,
      topErrors: [] as Array<{ code: string; count: number }>,
    };
    const errorCounts = new Map<string, number>();

    for (const order of list) {
      const status = String((order as any).fiscalStatus || "")
        .trim()
        .toUpperCase();
      if (status !== "SIGNED" && status !== "REJECTED") continue;
      if (nacefStatusFilter === "signed" && status !== "SIGNED") continue;
      if (nacefStatusFilter === "rejected" && status !== "REJECTED") continue;
      summary.total += 1;
      if (status === "SIGNED") summary.signed += 1;
      if (status === "REJECTED") summary.rejected += 1;
      if (status === "SIGNED") {
        const mode = String((order as any).fiscalMode || "")
          .trim()
          .toUpperCase();
        if (mode === "ONLINE") summary.online += 1;
        if (mode === "OFFLINE") summary.offline += 1;
      }
      if (status === "REJECTED") {
        const code =
          String((order as any).fiscalErrorCode || "")
            .trim()
            .toUpperCase() || "UNKNOWN";
        errorCounts.set(code, (errorCounts.get(code) || 0) + 1);
      }
    }

    summary.topErrors = Array.from(errorCounts.entries())
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return summary;
  };

  const nacefOverview = useMemo(() => {
    return summarizeNacef(filteredOrders);
  }, [filteredOrders, nacefStatusFilter]);

  const nacefRejectRate =
    nacefOverview.total > 0
      ? (nacefOverview.rejected / nacefOverview.total) * 100
      : 0;
  const nacefSignedRate =
    nacefOverview.total > 0 ? (nacefOverview.signed / nacefOverview.total) * 100 : 0;

  const previousNacefOverview = useMemo(() => {
    const fromTs = parseDateToTs(dateFrom);
    const toTs = parseDateToTs(dateTo);
    if (fromTs === undefined || toTs === undefined) return null;
    const toEnd = toTs + 24 * 60 * 60 * 1000 - 1;
    const span = Math.max(1, toEnd - fromTs + 1);
    const prevFrom = fromTs - span;
    const prevTo = fromTs - 1;
    const previousOrders = ordersSource.filter((o) => {
      const created = Number(o.createdAt || 0);
      return created >= prevFrom && created <= prevTo;
    });
    return summarizeNacef(previousOrders);
  }, [ordersSource, dateFrom, dateTo, nacefStatusFilter]);

  const previousRejectRate =
    previousNacefOverview && previousNacefOverview.total > 0
      ? (previousNacefOverview.rejected / previousNacefOverview.total) * 100
      : 0;

  const formatTrend = (current: number, previous: number | null) => {
    if (previous === null) return "N/A";
    const delta = current - previous;
    const sign = delta > 0 ? "+" : "";
    return `${sign}${delta.toFixed(1)}`;
  };

  const trendTone = (
    current: number,
    previous: number | null,
    betterWhenLower = false,
  ) => {
    if (previous === null) return "text-slate-500";
    const delta = current - previous;
    if (Math.abs(delta) < 0.0001) return "text-slate-500";
    if (betterWhenLower) {
      return delta < 0 ? "text-emerald-600" : "text-rose-600";
    }
    return delta > 0 ? "text-emerald-600" : "text-rose-600";
  };

  const nacefRows = useMemo(() => {
    return filteredOrders
      .map((order) => {
        const status = String((order as any).fiscalStatus || "")
          .trim()
          .toUpperCase();
        if (status !== "SIGNED" && status !== "REJECTED") return null;
        const mode = String((order as any).fiscalMode || "")
          .trim()
          .toUpperCase();
        const errorCode = String((order as any).fiscalErrorCode || "")
          .trim()
          .toUpperCase();
        return {
          id: String(order.id || ""),
          ticket: String(order.ticketNumber || order.id || ""),
          date: Number(order.createdAt || 0),
          status,
          mode: mode === "ONLINE" || mode === "OFFLINE" ? mode : "",
          errorCode: errorCode || "",
          total: Number(order.total || 0),
        };
      })
      .filter(Boolean)
      .filter((row) => {
        if (!row) return false;
        if (nacefStatusFilter === "signed") return row.status === "SIGNED";
        if (nacefStatusFilter === "rejected") return row.status === "REJECTED";
        return true;
      })
      .sort((a, b) => (b?.date || 0) - (a?.date || 0)) as Array<{
      id: string;
      ticket: string;
      date: number;
      status: "SIGNED" | "REJECTED";
      mode: string;
      errorCode: string;
      total: number;
    }>;
  }, [filteredOrders, nacefStatusFilter]);

  const onExportNacefCsv = () => {
    exportCsv(
      "rapport_nacef.csv",
      ["Date", "Ticket", "Statut", "Mode", "Erreur", "Total"],
      nacefRows.map((row) => [
        formatDateTime(row.date),
        row.ticket,
        row.status,
        row.mode,
        row.errorCode,
        formatAmount(row.total, 3),
      ]),
    );
  };

  const onPrintNacef = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    const summaryHtml = `
      <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:10px 0 14px;">
        <div style="border:1px solid #e2e8f0;border-radius:8px;padding:8px;"><strong>Tickets fiscalisés</strong><div>${nacefOverview.total}</div></div>
        <div style="border:1px solid #dcfce7;border-radius:8px;padding:8px;"><strong>SIGNED</strong><div>${nacefOverview.signed}</div></div>
        <div style="border:1px solid #ffe4e6;border-radius:8px;padding:8px;"><strong>REJECTED</strong><div>${nacefOverview.rejected}</div></div>
        <div style="border:1px solid #fef3c7;border-radius:8px;padding:8px;"><strong>Taux rejet</strong><div>${nacefRejectRate.toFixed(1)}%</div></div>
      </div>
      <div style="font-size:12px;margin-bottom:10px;">
        <strong>Tendance vs période précédente:</strong>
        Tickets ${formatTrend(nacefOverview.total, previousNacefOverview?.total ?? null)} |
        SIGNED ${formatTrend(nacefOverview.signed, previousNacefOverview?.signed ?? null)} |
        Rejet ${formatTrend(nacefRejectRate, previousNacefOverview ? previousRejectRate : null)}
      </div>
    `;
    const head = `<!DOCTYPE html><html><head><meta charSet="utf-8" /><title>Rapport NACEF</title>
<style>
body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 24px; }
table { border-collapse: collapse; width: 100%; font-size: 12px; }
th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
th { background: #f3f4f6; }
</style>
</head><body>`;
    const headerHtml = `<h2>Rapport NACEF</h2>${summaryHtml}`;
    const tableHead = `<thead><tr><th>Date</th><th>Ticket</th><th>Statut</th><th>Mode</th><th>Erreur</th><th>Total</th></tr></thead>`;
    const tableBody = `<tbody>${nacefRows
      .map(
        (row) =>
          `<tr><td>${formatDateTime(row.date)}</td><td>${row.ticket}</td><td>${row.status}</td><td>${row.mode || "-"}</td><td>${row.errorCode || "-"}</td><td>${formatAmount(row.total, 3)} ${settings.currency}</td></tr>`,
      )
      .join("")}</tbody>`;
    const html = `${head}${headerHtml}<table>${tableHead}${tableBody}</table></body></html>`;
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.print();
  };

  const nacefDailySeries = useMemo(() => {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const toTsRaw = parseDateToTs(dateTo);
    const fromTsRaw = parseDateToTs(dateFrom);
    const rangeEnd = (toTsRaw !== undefined ? toTsRaw : now) + dayMs - 1;
    const rangeStart =
      fromTsRaw !== undefined
        ? fromTsRaw
        : rangeEnd - (nacefTimelineDays - 1) * dayMs;
    const startAt = Math.max(rangeStart, rangeEnd - (nacefTimelineDays - 1) * dayMs);

    const buckets = new Map<
      string,
      { label: string; signed: number; rejected: number; total: number }
    >();
    for (let i = 0; i < nacefTimelineDays; i += 1) {
      const ts = startAt + i * dayMs;
      const d = new Date(ts);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate(),
      ).padStart(2, "0")}`;
      const label = `${String(d.getDate()).padStart(2, "0")}/${String(
        d.getMonth() + 1,
      ).padStart(2, "0")}`;
      buckets.set(key, { label, signed: 0, rejected: 0, total: 0 });
    }

    for (const row of nacefRows) {
      const d = new Date(row.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate(),
      ).padStart(2, "0")}`;
      const current = buckets.get(key);
      if (!current) continue;
      if (row.status === "SIGNED") current.signed += 1;
      if (row.status === "REJECTED") current.rejected += 1;
      current.total += 1;
    }

    const list = Array.from(buckets.values());
    const maxTotal = Math.max(
      1,
      ...list.map((x) => (nacefTimelineRejectOnly ? x.rejected : x.total)),
    );
    return list.map((x) => ({
      ...x,
      signedPct: (x.signed / maxTotal) * 100,
      rejectedPct: (x.rejected / maxTotal) * 100,
    }));
  }, [nacefRows, dateFrom, dateTo, nacefTimelineDays, nacefTimelineRejectOnly]);

  const onExportNacefChartPng = async () => {
    const width = Math.max(720, nacefDailySeries.length * 26 + 80);
    const height = 320;
    const chartTop = 30;
    const chartBottom = 250;
    const chartHeight = chartBottom - chartTop;
    const barWidth = 12;
    const gap = 14;
    const left = 40;

    const bars = nacefDailySeries
      .map((d, idx) => {
        const x = left + idx * (barWidth + gap);
        const signedH = (d.signedPct / 100) * chartHeight;
        const rejectedH = (d.rejectedPct / 100) * chartHeight;
        const signedY = chartBottom - signedH;
        const rejectedY = chartBottom - rejectedH;
        const signedRect = nacefTimelineRejectOnly
          ? ""
          : `<rect x="${x}" y="${signedY}" width="${barWidth}" height="${Math.max(
              0,
              signedH,
            )}" fill="#86efac" rx="2" />`;
        const rejectedRect = `<rect x="${x}" y="${rejectedY}" width="${barWidth}" height="${Math.max(
          0,
          rejectedH,
        )}" fill="#f43f5e" fill-opacity="0.92" rx="2" />`;
        const label = `<text x="${x + barWidth / 2}" y="${
          chartBottom + 16
        }" font-size="9" text-anchor="middle" fill="#64748b">${d.label}</text>`;
        return `${signedRect}${rejectedRect}${label}`;
      })
      .join("");

    const legend = nacefTimelineRejectOnly
      ? `<rect x="40" y="272" width="10" height="10" fill="#f43f5e" fill-opacity="0.92" rx="2" />
         <text x="56" y="281" font-size="11" fill="#475569">REJECTED</text>`
      : `<rect x="40" y="272" width="10" height="10" fill="#86efac" rx="2" />
         <text x="56" y="281" font-size="11" fill="#475569">SIGNED</text>
         <rect x="130" y="272" width="10" height="10" fill="#f43f5e" fill-opacity="0.92" rx="2" />
         <text x="146" y="281" font-size="11" fill="#475569">REJECTED</text>`;

    const exportedAt = new Date();
    const watermarkDate = `${String(exportedAt.getDate()).padStart(2, "0")}/${String(
      exportedAt.getMonth() + 1,
    ).padStart(2, "0")}/${exportedAt.getFullYear()} ${String(
      exportedAt.getHours(),
    ).padStart(2, "0")}:${String(exportedAt.getMinutes()).padStart(2, "0")}`;
    const terminalLabel = String(settings.terminalId || "").trim() || "N/A";
    const userLabel =
      String((currentUser as any)?.username || (currentUser as any)?.name || "")
        .trim() || "N/A";
    const watermark = `Export: ${watermarkDate} | Terminal: ${terminalLabel} | User: ${userLabel}`;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" />
      <text x="40" y="18" font-size="14" font-weight="700" fill="#0f172a">NACEF - Rejets par jour (${nacefTimelineDays}j)</text>
      <line x1="40" y1="${chartBottom}" x2="${width - 20}" y2="${chartBottom}" stroke="#cbd5e1" stroke-width="1" />
      ${bars}
      ${legend}
      <text x="${width - 20}" y="${height - 14}" font-size="10" text-anchor="end" fill="#94a3b8">${watermark}</text>
    </svg>`;

    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0);
      const pngUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = pngUrl;
      a.download = `nacef-chart-${nacefTimelineDays}j.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const ordersPageCount = Math.max(
    1,
    Math.ceil(filteredOrders.length / PAGE_SIZE),
  );

  const selectedOrder: Order | null = useMemo(() => {
    if (!selectedOrderId) return null;
    return (
      filteredOrders.find((o) => o.id === selectedOrderId) ||
      ordersSource.find((o) => o.id === selectedOrderId) ||
      orders.find((o) => o.id === selectedOrderId) ||
      null
    );
  }, [filteredOrders, ordersSource, orders, selectedOrderId]);

  const pagedSelectedOrderItems = useMemo(() => {
    if (!selectedOrder) return [] as Order["items"];
    const items = Array.isArray(selectedOrder.items) ? selectedOrder.items : [];
    const start = (orderItemsPage - 1) * PAGE_SIZE;
    return items.slice(start, start + PAGE_SIZE);
  }, [selectedOrder, orderItemsPage]);

  const selectedOrderItemsPageCount = useMemo(() => {
    if (!selectedOrder) return 1;
    const items = Array.isArray(selectedOrder.items) ? selectedOrder.items : [];
    return Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  }, [selectedOrder]);

  const pagedTickets = useMemo(() => {
    const start = (orderItemsPage - 1) * PAGE_SIZE;
    return ticketsForOrder.slice(start, start + PAGE_SIZE);
  }, [ticketsForOrder, orderItemsPage]);

  const ticketsPageCount = Math.max(
    1,
    Math.ceil(ticketsForOrder.length / PAGE_SIZE),
  );

  const printTicket = (ticket: any) => {
    const win = window.open("", "_blank");
    if (!win) return;
    const head = `<!DOCTYPE html><html><head><meta charSet="utf-8" /><title>Ticket ${ticket.code || ticket.id}</title>
<style>body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 24px; } table { border-collapse: collapse; width: 100%; font-size: 12px; } th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; } th { background: #f3f4f6; }</style>
</head><body>`;
    const headerHtml = `<h1>Ticket ${ticket.code || ticket.id}</h1><div><strong>Date :</strong> ${formatDateTime(ticket.createdAt)}</div>`;
    const items = Array.isArray(ticket.items) ? ticket.items : [];
    const rows = items.map((it: any) => [
      String(it?.name || ""),
      Number(it?.quantity || 0),
      Number(it?.price || 0),
      Number((it?.quantity || 0) * (it?.price || 0)),
    ]);
    const tableHead = `<thead><tr><th>Produit</th><th>Quantité</th><th>Prix</th><th>Total</th></tr></thead>`;
    const tableBody = `<tbody>${rows.map((r) => `<tr>${r.map((v) => `<td>${String(v)}</td>`).join("")}</tr>`).join("")}</tbody>`;
    const totals = `<div style="margin-top:12px"><strong>Total:</strong> ${formatAmount(ticket.total, 3)} ${settings.currency}</div>`;
    const html = `${head}${headerHtml}<table>${tableHead}${tableBody}</table>${totals}</body></html>`;
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.print();
  };

  const showTicketDetails = (ticket: any) => {
    setSelectedTicket(ticket);
  };

  const closeTicketDetails = () => setSelectedTicket(null);

  const onShowOrderTickets = (orderId: string) => {
    setSelectedOrderId(orderId);
    setOrderItemsPage(1);
  };

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!selectedOrderId) return setTicketsForOrder([]);
      if (!getTicketsByOrder) return setTicketsForOrder([]);
      setLoadingOrderTickets(true);
      try {
        const res = await getTicketsByOrder(selectedOrderId);
        if (!mounted) return;
        setTicketsForOrder(Array.isArray(res) ? res : []);
        setOrderItemsPage(1);
      } catch (e) {
        setTicketsForOrder([]);
      } finally {
        setLoadingOrderTickets(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [selectedOrderId, getTicketsByOrder]);

  const onCloseOrderTickets = () => {
    setSelectedOrderId(null);
    setOrderItemsPage(1);
  };

  const printOrderDetails = (order: Order) => {
    const zoneName = order.zoneId ? zoneNameById.get(order.zoneId) : "";
    const win = window.open("", "_blank");
    if (!win) return;
    const head = `<!DOCTYPE html><html><head><meta charSet="utf-8" /><title>Détail commande ${
      order.ticketNumber || order.id
    }</title>
<style>
body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 24px; }
h1 { font-size: 18px; margin-bottom: 4px; }
h2 { font-size: 14px; margin: 12px 0 4px; }
table { border-collapse: collapse; width: 100%; font-size: 12px; margin-top: 8px; }
th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
th { background: #f3f4f6; }
.meta { font-size: 12px; margin-bottom: 8px; }
</style>
</head><body>`;
    const headerHtml = `
  <h1>Commande ${order.ticketNumber || order.id}</h1>
<div class="meta">
  <div><strong>Date :</strong> ${formatDateTime(order.createdAt)}</div>
  <div><strong>Table :</strong> ${order.tableNumber || "-"}</div>
  <div><strong>Zone :</strong> ${zoneName || "-"}</div>
  <div><strong>Serveur :</strong> ${order.serverName || "-"}</div>
</div>`;

    const items = Array.isArray(order.items) ? order.items : [];
    const rows = items.map((it) => {
      const qty = Number((it as any).quantity ?? 0);
      const price = Number((it as any).price ?? 0);
      const lineTotal = qty * price;
      return [
        String((it as any).name || ""),
        qty,
        formatAmount(price, 3),
        formatAmount(lineTotal, 3),
      ];
    });

    const tableHead = `<thead><tr><th>Produit</th><th>Quantité</th><th>Prix</th><th>Total</th></tr></thead>`;
    const tableBody = `<tbody>${rows
      .map(
        (r) =>
          `<tr>${r.map((v) => `<td>${String(v ?? "")}</td>`).join("")}</tr>`,
      )
      .join("")}</tbody>`;

    const totalsHtml = `
<h2>Récapitulatif</h2>
<div class="meta">
  <div><strong>Total :</strong> ${formatAmount(order.total, 3)} ${settings.currency}</div>
  <div><strong>Remise :</strong> ${formatAmount(order.discount, 3)} ${settings.currency}</div>
  <div><strong>Timbre :</strong> ${formatAmount(order.timbre, 3)} ${settings.currency}</div>
</div>`;

    const html = `${head}${headerHtml}<h2>Lignes du ticket</h2><table>${tableHead}${tableBody}</table>${totalsHtml}</body></html>`;
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.print();
  };

  const filteredInvoices = useMemo(() => {
    const fromTs = parseDateToTs(dateFrom);
    const toTs = parseDateToTs(dateTo);
    const toEnd =
      toTs !== undefined ? toTs + 24 * 60 * 60 * 1000 - 1 : undefined;
    return invoices
      .filter((inv) => {
        const created = inv.createdAt || 0;
        if (fromTs !== undefined && created < fromTs) return false;
        if (toEnd !== undefined && created > toEnd) return false;
        if (
          invoiceClientFilter !== "all" &&
          inv.clientId &&
          inv.clientId !== invoiceClientFilter
        ) {
          return false;
        }
        return true;
      })
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [invoices, dateFrom, dateTo, invoiceClientFilter]);

  const filteredInvoicePageCount = Math.max(
    1,
    Math.ceil(filteredInvoices.length / PAGE_SIZE),
  );

  const pagedInvoices = useMemo(() => {
    const start = (invoicePage - 1) * PAGE_SIZE;
    return filteredInvoices.slice(start, start + PAGE_SIZE);
  }, [filteredInvoices, invoicePage]);

  const selectedInvoice: Invoice | null = useMemo(() => {
    if (!selectedInvoiceId) return null;
    return (
      filteredInvoices.find((inv) => inv.id === selectedInvoiceId) ||
      invoices.find((inv) => inv.id === selectedInvoiceId) ||
      null
    );
  }, [filteredInvoices, invoices, selectedInvoiceId]);

  const getInvoiceOrders = (invoice: Invoice): Order[] => {
    const ids = Array.isArray(invoice.orderIds) ? invoice.orderIds : [];
    if (!ids.length) return [];
    const byId = new Map<string, Order>();
    orders.forEach((o) => byId.set(o.id, o));
    reportOrders.forEach((o) => byId.set(o.id, o));
    return ids.map((id) => byId.get(id)).filter((o): o is Order => Boolean(o));
  };

  const printInvoiceDetails = (invoice: Invoice) => {
    const win = window.open("", "_blank");
    if (!win) return;

    const invoiceClientName =
      clients.find((c) => c.id === invoice.clientId)?.name ||
      invoice.clientId ||
      "";

    const relatedOrders = getInvoiceOrders(invoice);
    const allLines: {
      ticket: string;
      product: string;
      qty: number;
      price: number;
      total: number;
      createdAt: number | null;
    }[] = [];

    relatedOrders.forEach((order) => {
      const items = Array.isArray(order.items) ? order.items : [];
      items.forEach((it: any) => {
        const qty = Number(it?.quantity ?? 0);
        const price = Number(it?.price ?? 0);
        if (!qty || !price) return;
        allLines.push({
          ticket: order.ticketNumber || order.id,
          product: String(it?.name || ""),
          qty,
          price,
          total: qty * price,
          createdAt: order.createdAt ?? null,
        });
      });
    });

    const head = `<!DOCTYPE html><html><head><meta charSet="utf-8" /><title>Facture ${
      invoice.code || invoice.id
    }</title>
<style>
body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 24px; }
h1 { font-size: 18px; margin-bottom: 4px; }
h2 { font-size: 14px; margin: 12px 0 4px; }
table { border-collapse: collapse; width: 100%; font-size: 12px; margin-top: 8px; }
th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
th { background: #f3f4f6; }
.meta { font-size: 12px; margin-bottom: 8px; }
</style>
</head><body>`;

    const headerHtml = `
  <h1>Facture ${invoice.code || invoice.id}</h1>
<div class="meta">
  <div><strong>Date :</strong> ${formatDateTime(invoice.createdAt)}</div>
  <div><strong>Client :</strong> ${invoiceClientName}</div>
  <div><strong>Nombre de tickets :</strong> ${
    Array.isArray(invoice.orderIds) ? invoice.orderIds.length : 0
  }</div>
</div>`;

    const tableHead = `<thead><tr><th>Date</th><th>Ticket</th><th>Produit</th><th>Quantité</th><th>Prix</th><th>Total</th></tr></thead>`;
    const tableBody = `<tbody>${allLines
      .map(
        (l) =>
          `<tr><td>${formatDateTime(l.createdAt)}</td><td>${l.ticket}</td><td>${l.product}</td><td>${l.qty}</td><td>${formatAmount(l.price, 3)}</td><td>${formatAmount(l.total, 3)}</td></tr>`,
      )
      .join("")}</tbody>`;

    const totalsHtml = `
<h2>Récapitulatif</h2>
<div class="meta">
  <div><strong>Total facture :</strong> ${formatAmount(invoice.total, 3)} ${settings.currency}</div>
</div>`;

    const html = `${head}${headerHtml}<h2>Détail des tickets</h2><table>${tableHead}${tableBody}</table>${totalsHtml}</body></html>`;
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.print();
  };

  return (
    <div className="touch-reports-page space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-black">Rapports de ventes</h2>
          <p className="text-sm text-slate-500">
            Ventes par produit et par catégorie avec export Excel / impression
          </p>
          <div className="mt-2 inline-flex items-center rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
            {terminalScopeLabel}
          </div>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col text-[10px] font-black text-slate-400 uppercase tracking-widest">
            <span className="mb-1 flex items-center gap-1">
              <Calendar size={14} /> Période
            </span>
            <div className="flex gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-white"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-white"
              />
            </div>
          </div>
          <div className="flex flex-col text-[10px] font-black text-slate-400 uppercase tracking-widest">
            <span className="mb-1">Département</span>
            <select
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 min-w-[160px]"
            >
              <option value="all">Tous les départements</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {isAdmin && (
            <div className="flex flex-col text-[10px] font-black text-slate-400 uppercase tracking-widest">
              <span className="mb-1">Terminal (rapports)</span>
              <select
                value={reportTerminalFilter}
                onChange={(e) => setReportTerminalFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 min-w-[200px]"
              >
                <option value="poste">
                  Ce poste
                  {settings.terminalId?.trim()
                    ? ` (${settings.terminalId.trim()})`
                    : ""}
                </option>
                <option value="all">Tous les terminaux</option>
                {terminalIdsFromFunds.map((id) => (
                  <option key={id} value={id}>
                    Terminal {id}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            type="button"
            onClick={loadReports}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-black uppercase tracking-widest shadow-sm disabled:opacity-60"
            disabled={loading}
          >
            <FileText size={14} /> {loading ? "Chargement..." : "Actualiser"}
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-bold">
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 p-2">
        <div className="flex flex-wrap gap-2">
          {[
            { id: "products", label: "Par produit" },
            { id: "categories", label: "Par catégorie" },
            { id: "servers", label: "Par serveur" },
            { id: "payments", label: "Par paiement" },
            { id: "timeslots", label: "Par créneau" },
            { id: "customers", label: "Top clients" },
            { id: "nacef", label: "NACEF" },
            { id: "orders", label: "Commandes / tickets" },
            { id: "invoices", label: "Factures" },
            { id: "cash", label: "Clôtures caisse" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveReportTab(tab.id as typeof activeReportTab)}
              className={`px-3 py-2 rounded-xl text-xs font-black transition-all ${
                activeReportTab === tab.id
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-6">
        {/* Ventes par produit */}
        {activeReportTab === "products" && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-col min-h-[320px]">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-black text-slate-800 text-sm">
                Ventes par produit
              </h3>
              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">
                Détail complet, tri par CA
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onExportProductsCsv}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 text-[10px] font-black text-slate-600 bg-slate-50 hover:bg-slate-100"
              >
                <Download size={12} /> Excel
              </button>
              <button
                type="button"
                onClick={onPrintProducts}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 text-[10px] font-black text-slate-600 bg-slate-50 hover:bg-slate-100"
              >
                <FileText size={12} /> PDF / Imprimer
              </button>
            </div>
          </div>
          <div className="overflow-x-auto -mx-2 px-2 flex-1">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="py-2 pr-3">Produit</th>
                  <th className="py-2 pr-3">Catégorie</th>
                  <th className="py-2 pr-3 text-right">Quantité</th>
                  <th className="py-2 pr-3 text-right">CA</th>
                </tr>
              </thead>
              <tbody>
                {pagedProductRows
                  .slice()
                  .sort((a, b) => b.revenue - a.revenue)
                  .map((row) => (
                    <tr
                      key={row.productId}
                      className="border-b border-slate-50"
                    >
                      <td className="py-1.5 pr-3 font-bold text-slate-700">
                        {row.productName}
                      </td>
                      <td className="py-1.5 pr-3 text-slate-500">
                        {row.categoryId
                          ? categoryNameById.get(row.categoryId) ||
                            row.categoryId
                          : ""}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-bold text-slate-600">
                        {row.quantity}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-black text-slate-800">
                        {formatAmount(row.revenue, 2)} {settings.currency}
                      </td>
                    </tr>
                  ))}
                {pagedProductRows.length === 0 && !loading && (
                  <tr>
                    <td
                      colSpan={4}
                      className="py-8 text-center text-slate-300 italic text-sm"
                    >
                      Aucune donnée pour cette période
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
            <span>
              {productRows.length} lignes • Page {productPage} /{" "}
              {productPageCount}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setProductPage((p) => Math.max(1, p - 1))}
                disabled={productPage <= 1}
                className="px-2 py-1 rounded-lg border border-slate-200 bg-white disabled:opacity-40 font-bold"
              >
                Préc.
              </button>
              <button
                type="button"
                onClick={() =>
                  setProductPage((p) => Math.min(productPageCount, p + 1))
                }
                disabled={productPage >= productPageCount}
                className="px-2 py-1 rounded-lg border border-slate-200 bg-white disabled:opacity-40 font-bold"
              >
                Suiv.
              </button>
            </div>
          </div>
        </div>
        )}

        {/* Ventes par catégorie */}
        {activeReportTab === "categories" && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-col min-h-[320px]">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-black text-slate-800 text-sm">
                Ventes par catégorie
              </h3>
              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">
                Vue consolidée par département
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onExportCategoriesCsv}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 text-[10px] font-black text-slate-600 bg-slate-50 hover:bg-slate-100"
              >
                <Download size={12} /> Excel
              </button>
              <button
                type="button"
                onClick={onPrintCategories}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 text-[10px] font-black text-slate-600 bg-slate-50 hover:bg-slate-100"
              >
                <FileText size={12} /> PDF / Imprimer
              </button>
            </div>
          </div>
          <div className="overflow-x-auto -mx-2 px-2 flex-1">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="py-2 pr-3">Catégorie</th>
                  <th className="py-2 pr-3 text-right">Quantité</th>
                  <th className="py-2 pr-3 text-right">CA</th>
                </tr>
              </thead>
              <tbody>
                {pagedCategoryRows
                  .slice()
                  .sort((a, b) => b.revenue - a.revenue)
                  .map((row, idx) => (
                    <tr
                      key={`${row.categoryId || ""}-${idx}`}
                      className="border-b border-slate-50"
                    >
                      <td className="py-1.5 pr-3 font-bold text-slate-700">
                        {row.categoryLabel}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-bold text-slate-600">
                        {row.quantity}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-black text-slate-800">
                        {formatAmount(row.revenue, 2)} {settings.currency}
                      </td>
                    </tr>
                  ))}
                {pagedCategoryRows.length === 0 && !loading && (
                  <tr>
                    <td
                      colSpan={3}
                      className="py-8 text-center text-slate-300 italic text-sm"
                    >
                      Aucune donnée pour cette période
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
            <span>
              {categoryRows.length} lignes • Page {categoryPage} /{" "}
              {categoryPageCount}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCategoryPage((p) => Math.max(1, p - 1))}
                disabled={categoryPage <= 1}
                className="px-2 py-1 rounded-lg border border-slate-200 bg-white disabled:opacity-40 font-bold"
              >
                Préc.
              </button>
              <button
                type="button"
                onClick={() =>
                  setCategoryPage((p) => Math.min(categoryPageCount, p + 1))
                }
                disabled={categoryPage >= categoryPageCount}
                className="px-2 py-1 rounded-lg border border-slate-200 bg-white disabled:opacity-40 font-bold"
              >
                Suiv.
              </button>
            </div>
          </div>
        </div>
        )}
      </div>

      <div className="space-y-6">
        {/* Ventes par serveur */}
        {activeReportTab === "servers" && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-col min-h-[320px]">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-black text-slate-800 text-sm">
                Ventes par serveur
              </h3>
              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">
                Tickets et CA par membre du staff
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onExportServersCsv}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 text-[10px] font-black text-slate-600 bg-slate-50 hover:bg-slate-100"
              >
                <Download size={12} /> Excel
              </button>
              <button
                type="button"
                onClick={onPrintServers}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 text-[10px] font-black text-slate-600 bg-slate-50 hover:bg-slate-100"
              >
                <FileText size={12} /> PDF / Imprimer
              </button>
            </div>
          </div>
          <div className="overflow-x-auto -mx-2 px-2 flex-1">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="py-2 pr-3">Serveur</th>
                  <th className="py-2 pr-3 text-right">Tickets</th>
                  <th className="py-2 pr-3 text-right">CA</th>
                </tr>
              </thead>
              <tbody>
                {pagedServerRows
                  .slice()
                  .sort((a, b) => b.revenue - a.revenue)
                  .map((row, idx) => (
                    <tr
                      key={`${row.serverId || ""}-${idx}`}
                      className="border-b border-slate-50"
                    >
                      <td className="py-1.5 pr-3 font-bold text-slate-700">
                        {row.serverName}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-bold text-slate-600">
                        {row.ticketCount}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-black text-slate-800">
                        {formatAmount(row.revenue, 2)} {settings.currency}
                      </td>
                    </tr>
                  ))}
                {pagedServerRows.length === 0 && !loading && (
                  <tr>
                    <td
                      colSpan={3}
                      className="py-8 text-center text-slate-300 italic text-sm"
                    >
                      Aucune donnée pour cette période
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
            <span>
              {serverRows.length} lignes • Page {serverPage} / {serverPageCount}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setServerPage((p) => Math.max(1, p - 1))}
                disabled={serverPage <= 1}
                className="px-2 py-1 rounded-lg border border-slate-200 bg-white disabled:opacity-40 font-bold"
              >
                Préc.
              </button>
              <button
                type="button"
                onClick={() =>
                  setServerPage((p) => Math.min(serverPageCount, p + 1))
                }
                disabled={serverPage >= serverPageCount}
                className="px-2 py-1 rounded-lg border border-slate-200 bg-white disabled:opacity-40 font-bold"
              >
                Suiv.
              </button>
            </div>
          </div>
        </div>
        )}

        {/* Ventes par mode de paiement */}
        {activeReportTab === "payments" && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-col min-h-[320px]">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-black text-slate-800 text-sm">
                Ventes par mode de paiement
              </h3>
              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">
                Répartition des tickets et du CA
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onExportPaymentsCsv}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 text-[10px] font-black text-slate-600 bg-slate-50 hover:bg-slate-100"
              >
                <Download size={12} /> Excel
              </button>
              <button
                type="button"
                onClick={onPrintPayments}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 text-[10px] font-black text-slate-600 bg-slate-50 hover:bg-slate-100"
              >
                <FileText size={12} /> PDF / Imprimer
              </button>
            </div>
          </div>
          <div className="overflow-x-auto -mx-2 px-2 flex-1">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="py-2 pr-3">Mode de paiement</th>
                  <th className="py-2 pr-3 text-right">Tickets</th>
                  <th className="py-2 pr-3 text-right">CA</th>
                </tr>
              </thead>
              <tbody>
                {pagedPaymentRows
                  .slice()
                  .sort((a, b) => b.revenue - a.revenue)
                  .map((row, idx) => (
                    <tr
                      key={`${row.method}-${idx}`}
                      className="border-b border-slate-50"
                    >
                      <td className="py-1.5 pr-3 font-bold text-slate-700">
                        {row.method}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-bold text-slate-600">
                        {row.ticketCount}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-black text-slate-800">
                        {formatAmount(row.revenue, 2)} {settings.currency}
                      </td>
                    </tr>
                  ))}
                {pagedPaymentRows.length === 0 && !loading && (
                  <tr>
                    <td
                      colSpan={3}
                      className="py-8 text-center text-slate-300 italic text-sm"
                    >
                      Aucune donnée pour cette période
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify_between text-[11px] text-slate-500">
            <span>
              {paymentRows.length} lignes • Page {paymentPage} /{" "}
              {paymentPageCount}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPaymentPage((p) => Math.max(1, p - 1))}
                disabled={paymentPage <= 1}
                className="px-2 py-1 rounded-lg border border-slate-200 bg-white disabled:opacity-40 font-bold"
              >
                Préc.
              </button>
              <button
                type="button"
                onClick={() =>
                  setPaymentPage((p) => Math.min(paymentPageCount, p + 1))
                }
                disabled={paymentPage >= paymentPageCount}
                className="px-2 py-1 rounded-lg border border-slate-200 bg-white disabled:opacity-40 font-bold"
              >
                Suiv.
              </button>
            </div>
          </div>
        </div>
        )}
      </div>

      <div className="space-y-6">
        {/* Ventes par créneau horaire */}
        {activeReportTab === "timeslots" && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-col min-h-[320px]">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-black text-slate-800 text-sm">
                Ventes par créneau horaire
              </h3>
              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">
                Distribution des ventes par heure
              </p>
            </div>
          </div>
          <div className="overflow-x-auto -mx-2 px-2 flex-1">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="py-2 pr-3">Créneau</th>
                  <th className="py-2 pr-3 text-right">Tickets</th>
                  <th className="py-2 pr-3 text-right">CA</th>
                </tr>
              </thead>
              <tbody>
                {pagedTimeslotRows
                  .slice()
                  .sort((a, b) => a.start - b.start)
                  .map((row, idx) => (
                    <tr
                      key={`${row.slot}-${idx}`}
                      className="border-b border-slate-50"
                    >
                      <td className="py-1.5 pr-3 font-bold text-slate-700">
                        {row.slot}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-bold text-slate-600">
                        {row.ticketCount}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-black text-slate-800">
                        {formatAmount(row.revenue, 2)} {settings.currency}
                      </td>
                    </tr>
                  ))}
                {pagedTimeslotRows.length === 0 && !loading && (
                  <tr>
                    <td
                      colSpan={3}
                      className="py-8 text-center text-slate-300 italic text-sm"
                    >
                      Aucune donnée pour cette période
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
            <span>
              {timeslotRows.length} lignes • Page {timeslotPage} /{" "}
              {timeslotPageCount}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTimeslotPage((p) => Math.max(1, p - 1))}
                disabled={timeslotPage <= 1}
                className="px-2 py-1 rounded-lg border border-slate-200 bg-white disabled:opacity-40 font-bold"
              >
                Préc.
              </button>
              <button
                type="button"
                onClick={() =>
                  setTimeslotPage((p) => Math.min(timeslotPageCount, p + 1))
                }
                disabled={timeslotPage >= timeslotPageCount}
                className="px-2 py-1 rounded-lg border border-slate-200 bg-white disabled:opacity-40 font-bold"
              >
                Suiv.
              </button>
            </div>
          </div>
        </div>
        )}

        {/* Top clients */}
        {activeReportTab === "customers" && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-col min-h-[320px]">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-black text-slate-800 text-sm">Top clients</h3>
              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">
                Classement par CA sur la période
              </p>
            </div>
          </div>
          <div className="overflow-x-auto -mx-2 px-2 flex-1">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="py-2 pr-3">Client</th>
                  <th className="py-2 pr-3 text-right">Tickets</th>
                  <th className="py-2 pr-3 text-right">CA</th>
                </tr>
              </thead>
              <tbody>
                {pagedCustomerRows
                  .slice()
                  .sort((a, b) => b.revenue - a.revenue)
                  .map((row, idx) => (
                    <tr
                      key={`${row.clientId}-${idx}`}
                      className="border-b border-slate-50"
                    >
                      <td className="py-1.5 pr-3 font-bold text-slate-700">
                        {clientNameById.get(row.clientId) || row.clientId}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-bold text-slate-600">
                        {row.orderCount}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-black text-slate-800">
                        {formatAmount(row.revenue, 2)} {settings.currency}
                      </td>
                    </tr>
                  ))}
                {pagedCustomerRows.length === 0 && !loading && (
                  <tr>
                    <td
                      colSpan={3}
                      className="py-8 text-center text-slate-300 italic text-sm"
                    >
                      Aucune donnée pour cette période
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items_center justify-between text-[11px] text-slate-500">
            <span>
              {customerRows.length} lignes • Page {customerPage} /{" "}
              {customerPageCount}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCustomerPage((p) => Math.max(1, p - 1))}
                disabled={customerPage <= 1}
                className="px-2 py-1 rounded-lg border border-slate-200 bg-white disabled:opacity-40 font-bold"
              >
                Préc.
              </button>
              <button
                type="button"
                onClick={() =>
                  setCustomerPage((p) => Math.min(customerPageCount, p + 1))
                }
                disabled={customerPage >= customerPageCount}
                className="px-2 py-1 rounded-lg border border-slate-200 bg-white disabled:opacity-40 font-bold"
              >
                Suiv.
              </button>
            </div>
          </div>
        </div>
        )}
      </div>

      {activeReportTab === "nacef" && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 space-y-4">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
            <div>
            <h3 className="font-black text-slate-800 text-sm">Synthèse NACEF</h3>
            <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">
              Suivi fiscal sur la période filtrée
            </p>
          </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <span className="mb-1">Statut fiscal</span>
                <select
                  value={nacefStatusFilter}
                  onChange={(e) =>
                    setNacefStatusFilter(
                      e.target.value as "all" | "signed" | "rejected",
                    )
                  }
                  className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 min-w-[160px]"
                >
                  <option value="all">Tous</option>
                  <option value="signed">SIGNED</option>
                  <option value="rejected">REJECTED</option>
                </select>
              </div>
              <button
                type="button"
                onClick={onExportNacefCsv}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 text-[10px] font-black text-slate-600 bg-slate-50 hover:bg-slate-100"
              >
                <Download size={12} /> Export CSV
              </button>
              <button
                type="button"
                onClick={onPrintNacef}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 text-[10px] font-black text-slate-600 bg-slate-50 hover:bg-slate-100"
              >
                <FileText size={12} /> PDF / Imprimer
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[10px] uppercase font-black text-slate-400">
                Tickets fiscalisés
              </div>
              <div className="mt-1 text-xl font-black text-slate-800">
                {nacefOverview.total}
              </div>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <div className="text-[10px] uppercase font-black text-emerald-600">
                SIGNED
              </div>
              <div className="mt-1 text-xl font-black text-emerald-700">
                {nacefOverview.signed}
              </div>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
              <div className="text-[10px] uppercase font-black text-rose-600">
                REJECTED
              </div>
              <div className="mt-1 text-xl font-black text-rose-700">
                {nacefOverview.rejected}
              </div>
            </div>
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
              <div className="text-[10px] uppercase font-black text-indigo-600">
                Online / Offline
              </div>
              <div className="mt-1 text-sm font-black text-indigo-700">
                {nacefOverview.online} / {nacefOverview.offline}
              </div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="text-[10px] uppercase font-black text-amber-600">
                Taux de rejet
              </div>
              <div className="mt-1 text-xl font-black text-amber-700">
                {nacefRejectRate.toFixed(1)}%
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-[11px] uppercase tracking-widest font-black text-slate-500 mb-3">
              Répartition SIGNED / REJECTED
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                  <span className="text-emerald-700">SIGNED</span>
                  <span className="text-slate-600">
                    {nacefOverview.signed} ({nacefSignedRate.toFixed(1)}%)
                  </span>
                </div>
                <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${nacefSignedRate.toFixed(2)}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                  <span className="text-rose-700">REJECTED</span>
                  <span className="text-slate-600">
                    {nacefOverview.rejected} ({nacefRejectRate.toFixed(1)}%)
                  </span>
                </div>
                <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full bg-rose-500"
                    style={{ width: `${nacefRejectRate.toFixed(2)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-widest font-black text-slate-500">
              Top erreurs NACEF
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-white border-b border-slate-100">
                <tr>
                  <th className="py-2 px-3">Code erreur</th>
                  <th className="py-2 px-3 text-right">Occurrences</th>
                </tr>
              </thead>
              <tbody>
                {nacefOverview.topErrors.map((row) => (
                  <tr key={row.code} className="border-b border-slate-50">
                    <td className="py-2 px-3 font-black text-slate-700">
                      {row.code}
                    </td>
                    <td className="py-2 px-3 text-right font-black text-rose-700">
                      {row.count}
                    </td>
                  </tr>
                ))}
                {nacefOverview.topErrors.length === 0 && (
                  <tr>
                    <td
                      colSpan={2}
                      className="py-6 text-center text-slate-400 italic"
                    >
                      Aucune erreur NACEF sur cette période
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-[11px] uppercase tracking-widest font-black text-slate-500 mb-2">
              Tendance vs période précédente
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <div className="text-slate-500 font-bold">Tickets fiscalisés</div>
                <div className="font-black text-slate-800">
                  {nacefOverview.total}{" "}
                  <span
                    className={trendTone(
                      nacefOverview.total,
                      previousNacefOverview?.total ?? null,
                    )}
                  >
                    ({formatTrend(nacefOverview.total, previousNacefOverview?.total ?? null)})
                  </span>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <div className="text-slate-500 font-bold">SIGNED</div>
                <div className="font-black text-emerald-700">
                  {nacefOverview.signed}{" "}
                  <span
                    className={trendTone(
                      nacefOverview.signed,
                      previousNacefOverview?.signed ?? null,
                    )}
                  >
                    ({formatTrend(nacefOverview.signed, previousNacefOverview?.signed ?? null)})
                  </span>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <div className="text-slate-500 font-bold">Taux rejet (%)</div>
                <div className="font-black text-rose-700">
                  {nacefRejectRate.toFixed(1)}%{" "}
                  <span
                    className={trendTone(
                      nacefRejectRate,
                      previousNacefOverview ? previousRejectRate : null,
                      true,
                    )}
                  >
                    ({formatTrend(nacefRejectRate, previousNacefOverview ? previousRejectRate : null)})
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-widest font-black text-slate-500">
              Détail des tickets fiscalisés
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-white border-b border-slate-100">
                  <tr>
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3">Ticket</th>
                    <th className="py-2 px-3">Statut</th>
                    <th className="py-2 px-3">Mode</th>
                    <th className="py-2 px-3">Code erreur</th>
                    <th className="py-2 px-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {nacefRows.map((row) => (
                    <tr key={row.id} className="border-b border-slate-50">
                      <td className="py-2 px-3 text-slate-600">
                        {formatDateTime(row.date)}
                      </td>
                      <td className="py-2 px-3 font-black text-slate-700">
                        {row.ticket}
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-black ${
                            row.status === "SIGNED"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-rose-100 text-rose-700"
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-bold text-slate-600">
                        {row.mode || "-"}
                      </td>
                      <td className="py-2 px-3 font-bold text-rose-700">
                        {row.errorCode || "-"}
                      </td>
                      <td className="py-2 px-3 text-right font-black text-slate-800">
                        {formatAmount(row.total, 3)} {settings.currency}
                      </td>
                    </tr>
                  ))}
                  {nacefRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="py-6 text-center text-slate-400 italic"
                      >
                        Aucun ticket pour ce filtre
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="text-[11px] uppercase tracking-widest font-black text-slate-500">
                Rejets par jour
              </div>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 text-[10px] font-black text-slate-600">
                  <input
                    type="checkbox"
                    checked={nacefTimelineRejectOnly}
                    onChange={(e) => setNacefTimelineRejectOnly(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Uniquement rejets
                </label>
                <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setNacefTimelineDays(7)}
                    className={`px-2 py-1 text-[10px] font-black ${
                      nacefTimelineDays === 7
                        ? "bg-indigo-600 text-white"
                        : "bg-white text-slate-600"
                    }`}
                  >
                    7j
                  </button>
                  <button
                    type="button"
                    onClick={() => setNacefTimelineDays(30)}
                    className={`px-2 py-1 text-[10px] font-black border-l border-slate-200 ${
                      nacefTimelineDays === 30
                        ? "bg-indigo-600 text-white"
                        : "bg-white text-slate-600"
                    }`}
                  >
                    30j
                  </button>
                </div>
                <button
                  type="button"
                  onClick={onExportNacefChartPng}
                  className="px-2 py-1 text-[10px] font-black rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                >
                  Export PNG
                </button>
              </div>
            </div>
            <div className="flex items-end gap-1.5 h-36 overflow-x-auto">
              {nacefDailySeries.map((d, idx) => (
                <div
                  key={`${d.label}-${idx}`}
                  className="min-w-[20px] flex flex-col items-center gap-1"
                  title={`${d.label} • SIGNED ${d.signed} • REJECTED ${d.rejected}`}
                >
                  {!nacefTimelineRejectOnly && (
                    <div className="w-4 h-28 rounded bg-slate-100 flex items-end overflow-hidden">
                      <div
                        className="w-full bg-emerald-300"
                        style={{ height: `${d.signedPct.toFixed(2)}%` }}
                      />
                    </div>
                  )}
                  <div
                    className={`w-4 h-28 ${
                      nacefTimelineRejectOnly ? "" : "-mt-28"
                    } rounded ${nacefTimelineRejectOnly ? "bg-slate-100" : "bg-transparent"} flex items-end overflow-hidden`}
                  >
                    <div
                      className="w-full bg-rose-500/90"
                      style={{ height: `${d.rejectedPct.toFixed(2)}%` }}
                    />
                  </div>
                  <div className="text-[9px] font-bold text-slate-500">{d.label}</div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-3 text-[10px] font-bold text-slate-500">
              {!nacefTimelineRejectOnly && (
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded bg-emerald-300" />
                  SIGNED
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded bg-rose-500/90" />
                REJECTED
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Liste des commandes / tickets */}
      {activeReportTab === "orders" && (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-col min-h-[320px]">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-black text-slate-800 text-sm">
              Liste des commandes / tickets
            </h3>
            <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">
              Détail par ticket avec actions
            </p>
          </div>
          <div className="flex flex-col text-[10px] font-black text-slate-400 uppercase tracking-widest">
            <span className="mb-1">Statut</span>
            <select
              value={orderStatusFilter}
              onChange={(e) =>
                setOrderStatusFilter(
                  e.target.value as "all" | "paid" | "unpaid" | "toInvoice",
                )
              }
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 min-w-[160px]"
            >
              <option value="all">Tous</option>
              <option value="paid">Payés</option>
              <option value="unpaid">Non payés</option>
              <option value="toInvoice">À facturer</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto -mx-2 px-2 flex-1">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Ticket</th>
                <th className="py-2 pr-3">Table</th>
                <th className="py-2 pr-3">Zone</th>
                <th className="py-2 pr-3">Serveur</th>
                <th className="py-2 pr-3">Statut</th>
                <th className="py-2 pr-3 text-right">Total</th>
                <th className="py-2 pr-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedOrders.map((order) => (
                <tr key={order.id} className="border-b border-slate-50">
                  <td className="py-1.5 pr-3 text-slate-600">
                    {formatDateTime(order.createdAt)}
                  </td>
                  <td className="py-1.5 pr-3 font-bold text-slate-700">
                    {order.ticketNumber || order.id}
                  </td>
                  <td className="py-1.5 pr-3 text-slate-600">
                    {order.tableNumber || "-"}
                  </td>
                  <td className="py-1.5 pr-3 text-slate-600">
                    {order.zoneId
                      ? zoneNameById.get(order.zoneId) || order.zoneId
                      : "-"}
                  </td>
                  <td className="py-1.5 pr-3 text-slate-600">
                    {order.serverName || "-"}
                  </td>
                  <td className="py-1.5 pr-3 text-slate-600">
                    {(() => {
                      const status = getOrderUiStatus(order);
                      if (status === "INVOICED") return "Transformé en facture";
                      if (status === "PAID") return "Payé";
                      return "Non payé";
                    })()}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-black text-slate-800">
                    {formatAmount(order.total, 2)} {settings.currency}
                  </td>
                  <td className="py-1.5 pr-3 text-right">
                    <div className="inline-flex gap-2">
                      <button
                        type="button"
                        onClick={() => onShowOrderTickets(order.id)}
                        className="px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-[10px] font-black text-slate-600 hover:bg-slate-100"
                      >
                        Tickets
                      </button>
                      <button
                        type="button"
                        onClick={() => printOrderDetails(order)}
                        className="px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-[10px] font-black text-slate-600 hover:bg-slate-100"
                      >
                        <FileText size={11} className="inline mr-1" />
                        Imprimer
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {pagedOrders.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={8}
                    className="py-8 text-center text-slate-300 italic text-sm"
                  >
                    Aucune commande pour cette période
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
          <span>
            {filteredOrders.length} lignes • Page {ordersPage} /{" "}
            {ordersPageCount}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOrdersPage((p) => Math.max(1, p - 1))}
              disabled={ordersPage <= 1}
              className="px-2 py-1 rounded-lg border border-slate-200 bg-white disabled:opacity-40 font-bold"
            >
              Préc.
            </button>
            <button
              type="button"
              onClick={() =>
                setOrdersPage((p) => Math.min(ordersPageCount, p + 1))
              }
              disabled={ordersPage >= ordersPageCount}
              className="px-2 py-1 rounded-lg border border-slate-200 bg-white disabled:opacity-40 font-bold"
            >
              Suiv.
            </button>
          </div>
        </div>
      </div>
      )}

      {/* Factures / tickets */}
      {activeReportTab === "invoices" && (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-col min-h-[320px]">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-black text-slate-800 text-sm">
              Factures / tickets
            </h3>
            <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">
              Une ligne par facture, avec ses tickets
            </p>
          </div>
          <div className="flex flex-col text-[10px] font-black text-slate-400 uppercase tracking-widest">
            <span className="mb-1">Client</span>
            <select
              value={invoiceClientFilter}
              onChange={(e) => setInvoiceClientFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 min-w-[160px]"
            >
              <option value="all">Tous les clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto -mx-2 px-2 flex-1">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Facture</th>
                <th className="py-2 pr-3">Client</th>
                <th className="py-2 pr-3 text-right">Tickets</th>
                <th className="py-2 pr-3 text-right">Total</th>
                <th className="py-2 pr-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedInvoices.map((invoice) => {
                const invoiceClientName =
                  clients.find((c) => c.id === invoice.clientId)?.name ||
                  invoice.clientId ||
                  "";
                const ticketCount = Array.isArray(invoice.orderIds)
                  ? invoice.orderIds.length
                  : 0;
                return (
                  <tr key={invoice.id} className="border-b border-slate-50">
                    <td className="py-1.5 pr-3 text-slate-600">
                      {formatDateTime(invoice.createdAt)}
                    </td>
                    <td className="py-1.5 pr-3 font-bold text-slate-700">
                      {invoice.code || invoice.id}
                    </td>
                    <td className="py-1.5 pr-3 text-slate-600">
                      {invoiceClientName || "-"}
                    </td>
                    <td className="py-1.5 pr-3 text-right text-slate-600">
                      {ticketCount}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-black text-slate-800">
                      {formatAmount(invoice.total, 2)} {settings.currency}
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      <div className="inline-flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedInvoiceId((current) =>
                              current === invoice.id ? null : invoice.id,
                            )
                          }
                          className="px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-[10px] font-black text-slate-600 hover:bg-slate-100"
                        >
                          Tickets
                        </button>
                        <button
                          type="button"
                          onClick={() => printInvoiceDetails(invoice)}
                          className="px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-[10px] font-black text-slate-600 hover:bg-slate-100"
                        >
                          <FileText size={11} className="inline mr-1" />
                          Imprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {pagedInvoices.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={6}
                    className="py-8 text-center text-slate-300 italic text-sm"
                  >
                    Aucune facture pour cette période
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
          <span>
            {filteredInvoices.length} lignes • Page {invoicePage} /{" "}
            {filteredInvoicePageCount}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setInvoicePage((p) => Math.max(1, p - 1))}
              disabled={invoicePage <= 1}
              className="px-2 py-1 rounded-lg border border-slate-200 bg-white disabled:opacity-40 font-bold"
            >
              Préc.
            </button>
            <button
              type="button"
              onClick={() =>
                setInvoicePage((p) => Math.min(filteredInvoicePageCount, p + 1))
              }
              disabled={invoicePage >= filteredInvoicePageCount}
              className="px-2 py-1 rounded-lg border border-slate-200 bg-white disabled:opacity-40 font-bold"
            >
              Suiv.
            </button>
          </div>
        </div>

        {selectedInvoice && (
          <div className="mt-4 pt-3 border-t border-slate-100">
            <h4 className="text-xs font-black text-slate-800 mb-2 uppercase tracking-widest">
              Tickets de la facture {selectedInvoice.code || selectedInvoice.id}
            </h4>
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Ticket</th>
                  <th className="py-2 pr-3">Table</th>
                  <th className="py-2 pr-3">Zone</th>
                  <th className="py-2 pr-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {getInvoiceOrders(selectedInvoice).map((order) => (
                  <tr key={order.id} className="border-b border-slate-50">
                    <td className="py-1.5 pr-3 text-slate-600">
                      {formatDateTime(order.createdAt)}
                    </td>
                    <td className="py-1.5 pr-3 font-bold text-slate-700">
                      {order.ticketNumber || order.id}
                    </td>
                    <td className="py-1.5 pr-3 text-slate-600">
                      {order.tableNumber || "-"}
                    </td>
                    <td className="py-1.5 pr-3 text-slate-600">
                      {order.zoneId
                        ? zoneNameById.get(order.zoneId) || order.zoneId
                        : "-"}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-black text-slate-800">
                      {formatAmount(order.total, 2)} {settings.currency}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* Clôtures de caisse */}
      {activeReportTab === "cash" && (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-col min-h-[320px]">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-black text-slate-800 text-sm">
              Clôtures de caisse
            </h3>
            <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">
              Sessions de caisse sur la période
            </p>
          </div>
        </div>
        <div className="overflow-x-auto -mx-2 px-2 flex-1">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="py-2 pr-3">Caisse</th>
                <th className="py-2 pr-3">Caissier</th>
                <th className="py-2 pr-3">Ouverture</th>
                <th className="py-2 pr-3">Fermeture</th>
                <th className="py-2 pr-3 text-right">Ventes</th>
                <th className="py-2 pr-3 text-right">Attendu</th>
                <th className="py-2 pr-3 text-right">Écart</th>
              </tr>
            </thead>
            <tbody>
              {pagedCashRows
                .slice()
                .sort((a, b) => (a.openedAt || 0) - (b.openedAt || 0))
                .map((row) => (
                  <tr key={row.sessionId} className="border-b border-slate-50">
                    <td className="py-1.5 pr-3 font-bold text-slate-700">
                      {row.fundName}
                    </td>
                    <td className="py-1.5 pr-3 text-slate-600">
                      {row.cashierName || ""}
                    </td>
                    <td className="py-1.5 pr-3 text-slate-500">
                      {formatDateTime(row.openedAt)}
                    </td>
                    <td className="py-1.5 pr-3 text-slate-500">
                      {formatDateTime(row.closedAt || null)}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-bold text-slate-700">
                      {formatAmount(row.totalSales, 2)} {row.currency}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-bold text-slate-700">
                      {formatAmount(row.expectedClosing, 2)} {row.currency}
                    </td>
                    <td
                      className={`py-1.5 pr-3 text-right font-black ${
                        row.difference === 0
                          ? "text-slate-700"
                          : row.difference > 0
                            ? "text-emerald-600"
                            : "text-rose-600"
                      }`}
                    >
                      {formatAmount(row.difference, 2)} {row.currency}
                    </td>
                  </tr>
                ))}
              {pagedCashRows.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={7}
                    className="py-8 text-center text-slate-300 italic text-sm"
                  >
                    Aucune donnée pour cette période
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
          <span>
            {cashRows.length} lignes • Page {cashPage} / {cashPageCount}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCashPage((p) => Math.max(1, p - 1))}
              disabled={cashPage <= 1}
              className="px-2 py-1 rounded-lg border border-slate-200 bg-white disabled:opacity-40 font-bold"
            >
              Préc.
            </button>
            <button
              type="button"
              onClick={() => setCashPage((p) => Math.min(cashPageCount, p + 1))}
              disabled={cashPage >= cashPageCount}
              className="px-2 py-1 rounded-lg border border-slate-200 bg-white disabled:opacity-40 font-bold"
            >
              Suiv.
            </button>
          </div>
        </div>
      </div>
      )}

      {selectedOrder && (
        <div className="touch-reports-modal fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="touch-reports-modal-panel bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">
                Tickets de la commande{" "}
                {selectedOrder.ticketNumber || selectedOrder.id}
              </h4>
              <button
                type="button"
                onClick={onCloseOrderTickets}
                className="px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-[11px] font-black text-slate-600 hover:bg-slate-100"
              >
                Fermer
              </button>
            </div>
            <div className="px-4 pt-3 pb-2 text-xs text-slate-600 space-y-1">
              <div>
                <span className="font-bold">Date :</span>{" "}
                {formatDateTime(selectedOrder.createdAt)}
              </div>
              <div>
                <span className="font-bold">Table :</span>{" "}
                {selectedOrder.tableNumber || "-"}
              </div>
              <div>
                <span className="font-bold">Zone :</span>{" "}
                {selectedOrder.zoneId
                  ? zoneNameById.get(selectedOrder.zoneId) ||
                    selectedOrder.zoneId
                  : "-"}
              </div>
              <div>
                <span className="font-bold">Serveur :</span>{" "}
                {selectedOrder.serverName || "-"}
              </div>
              <div>
                <span className="font-bold">Total :</span>{" "}
                {formatAmount(selectedOrder.total, 3)} {settings.currency}
              </div>
            </div>
            <div className="px-4 pb-3 flex-1 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    {ticketsForOrder && ticketsForOrder.length > 0 ? (
                      <>
                        <th className="py-2 pr-3">Ticket</th>
                        <th className="py-2 pr-3">Date</th>
                        <th className="py-2 pr-3 text-right">Total</th>
                        <th className="py-2 pr-3"></th>
                      </>
                    ) : (
                      <>
                        <th className="py-2 pr-3">Produit</th>
                        <th className="py-2 pr-3 text-right">Quantité</th>
                        <th className="py-2 pr-3 text-right">Prix</th>
                        <th className="py-2 pr-3 text-right">Total</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {loadingOrderTickets ? (
                    <tr>
                      <td colSpan={4} className="py-4 text-center">
                        Chargement...
                      </td>
                    </tr>
                  ) : ticketsForOrder && ticketsForOrder.length > 0 ? (
                    pagedTickets.map((t: any) => (
                      <tr key={t.id} className="border-b border-slate-50">
                        <td className="py-1.5 pr-3 font-bold text-slate-700">
                          {t.code || t.id}
                        </td>
                        <td className="py-1.5 pr-3 text-slate-600">
                          {formatDateTime(t.createdAt)}
                        </td>
                        <td className="py-1.5 pr-3 text-right font-black text-slate-800">
                          {formatAmount(t.total, 3)} {settings.currency}
                        </td>
                        <td className="py-1.5 pr-3 text-right">
                          <button
                            onClick={() => printTicket(t)}
                            className="px-2 py-1 mr-2 rounded-lg border text-[11px]"
                          >
                            Imprimer
                          </button>
                          <button
                            onClick={() => showTicketDetails(t)}
                            className="px-2 py-1 rounded-lg border text-[11px]"
                          >
                            Détails
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    pagedSelectedOrderItems.map((it: any, idx: number) => {
                      const qty = Number(it?.quantity ?? 0);
                      const price = Number(it?.price ?? 0);
                      const lineTotal = qty * price;
                      return (
                        <tr
                          key={`${it?.id || idx}`}
                          className="border-b border-slate-50"
                        >
                          <td className="py-1.5 pr-3 font-bold text-slate-700">
                            {it?.name || ""}
                          </td>
                          <td className="py-1.5 pr-3 text-right text-slate-600">
                            {qty}
                          </td>
                          <td className="py-1.5 pr-3 text-right text-slate-600">
                            {formatAmount(price, 3)} {settings.currency}
                          </td>
                          <td className="py-1.5 pr-3 text-right font-black text-slate-800">
                            {formatAmount(lineTotal, 3)} {settings.currency}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-4 pb-3 flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-100">
              <span>
                {ticketsForOrder && ticketsForOrder.length > 0
                  ? ticketsForOrder.length
                  : Array.isArray(selectedOrder.items)
                    ? selectedOrder.items.length
                    : 0}{" "}
                lignes • Page {orderItemsPage} /{" "}
                {ticketsForOrder && ticketsForOrder.length > 0
                  ? ticketsPageCount
                  : selectedOrderItemsPageCount}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOrderItemsPage((p) => Math.max(1, p - 1))}
                  disabled={orderItemsPage <= 1}
                  className="px-2 py-1 rounded-lg border border-slate-200 bg-white disabled:opacity-40 font-bold"
                >
                  Préc.
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setOrderItemsPage((p) =>
                      Math.min(
                        ticketsForOrder && ticketsForOrder.length > 0
                          ? ticketsPageCount
                          : selectedOrderItemsPageCount,
                        p + 1,
                      ),
                    )
                  }
                  disabled={
                    orderItemsPage >=
                    (ticketsForOrder && ticketsForOrder.length > 0
                      ? ticketsPageCount
                      : selectedOrderItemsPageCount)
                  }
                  className="px-2 py-1 rounded-lg border border-slate-200 bg-white disabled:opacity-40 font-bold"
                >
                  Suiv.
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedTicket && (
        <div className="fixed inset-0 z-60 flex">
          <div className="flex-1" onClick={closeTicketDetails} />
          <div className="w-[420px] bg-white shadow-xl border-l border-slate-100 max-h-full overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h4 className="font-black text-sm">
                Détails Ticket {selectedTicket.code || selectedTicket.id}
              </h4>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => printTicket(selectedTicket)}
                  className="px-3 py-1 rounded-lg border text-[12px]"
                >
                  Imprimer
                </button>
                <button
                  onClick={closeTicketDetails}
                  className="px-3 py-1 rounded-lg border text-[12px]"
                >
                  Fermer
                </button>
              </div>
            </div>
            <div className="p-4 text-xs">
              <div className="mb-3 text-[12px] text-slate-600">
                <div>
                  <strong>Date:</strong>{" "}
                  {formatDateTime(selectedTicket.createdAt)}
                </div>
                <div>
                  <strong>Total:</strong>{" "}
                  {formatAmount(selectedTicket.total, 3)} {settings.currency}
                </div>
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="py-2 pr-3">Produit</th>
                    <th className="py-2 pr-3 text-right">Quantité</th>
                    <th className="py-2 pr-3 text-right">Prix</th>
                    <th className="py-2 pr-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(Array.isArray(selectedTicket.items)
                    ? selectedTicket.items
                    : []
                  ).map((it: any, idx: number) => (
                    <tr key={it.id || idx} className="border-b">
                      <td className="py-2 pr-3 font-bold text-slate-700">
                        {it.name}
                      </td>
                      <td className="py-2 pr-3 text-right text-slate-600">
                        {Number(it.quantity || 0)}
                      </td>
                      <td className="py-2 pr-3 text-right text-slate-600">
                        {formatAmount(it.price, 3)} {settings.currency}
                      </td>
                      <td className="py-2 pr-3 text-right font-black text-slate-800">
                        {formatAmount(
                          Number(it.quantity || 0) * Number(it.price || 0),
                          3,
                        )}{" "}
                        {settings.currency}
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
  );
};

export default ReportsPage;
