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
