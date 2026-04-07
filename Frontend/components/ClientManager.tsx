import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { usePOS } from "../store/POSContext";
import {
  User,
  FileText,
  Check,
  Pencil,
  Trash2,
  Printer,
  Search,
  ListChecks,
  ScrollText,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Client, Order } from "../types";
import { notifyError, notifySuccess } from "../utils/notify";
import { askConfirm } from "../utils/confirm";

const formatAmount = (value: unknown, digits = 3) =>
  Number(value ?? 0).toFixed(digits);

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatTicketLabel = (order: { id: string; ticketNumber?: string }) =>
  order.ticketNumber || `ORD-${order.id.slice(-6).toUpperCase()}`;

const uniq = <T,>(values: T[]) => Array.from(new Set(values));

const isOrderPaid = (order: Order) => {
  if (String(order.status || "").toUpperCase() === "COMPLETED") return true;

  const total = Number(order.total || 0);
  if (total <= 0) return false;

  const paidAmount = Number(order.paidAmount || 0);
  if (paidAmount >= total) return true;

  const paymentsTotal = Array.isArray(order.payments)
    ? order.payments.reduce(
        (sum, payment) => sum + Number(payment?.amount || 0),
        0,
      )
    : 0;

  return paymentsTotal >= total;
};

const ClientManager: React.FC = () => {
  const [receiptModalOrder, setReceiptModalOrder] = useState<Order | null>(
    null,
  );
  const {
    clients,
    orders,
    generateInvoice,
    updateInvoice,
    deleteInvoice,
    invoices,
    settings,
    addClient,
    updateClient,
    deleteClient,
  } = usePOS();
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [workspaceView, setWorkspaceView] = useState<
    "create" | "tickets" | "invoices"
  >("create");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(
    null,
  );
  const [invoiceEditOrders, setInvoiceEditOrders] = useState<string[]>([]);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [serverFilter, setServerFilter] = useState("");
  const [historyFromDate, setHistoryFromDate] = useState("");
  const [historyToDate, setHistoryToDate] = useState("");
  const [historyServerFilter, setHistoryServerFilter] = useState("");
  const [historyPaymentFilter, setHistoryPaymentFilter] = useState<
    "ALL" | "PAID" | "UNPAID"
  >("ALL");
  const [clientQuery, setClientQuery] = useState("");
  const [showClientExtraFields, setShowClientExtraFields] = useState(false);
  const [datesPreset, setDatesPreset] = useState(false);
  const [clientType, setClientType] = useState<"PERSON" | "COMPANY">("PERSON");
  const [clientName, setClientName] = useState("");
  const [clientCin, setClientCin] = useState("");
  const [clientBirthDate, setClientBirthDate] = useState("");
  const [clientTaxId, setClientTaxId] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientAddress, setClientAddress] = useState("");

  const selectedClientData = useMemo(
    () => clients.find((client) => client.id === selectedClient) || null,
    [clients, selectedClient],
  );

  const selectedInvoice = useMemo(
    () => invoices.find((invoice) => invoice.id === selectedInvoiceId) || null,
    [invoices, selectedInvoiceId],
  );

  const mapClientById = useMemo(
    () => new Map(clients.map((client) => [client.id, client])),
    [clients],
  );

  const filteredClientsList = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => {
      const hay = [
        c.name,
        c.phone,
        c.email,
        c.code,
        c.taxId,
        c.cin,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [clients, clientQuery]);

  useEffect(() => {
    if (datesPreset) return;
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 30);
    const toS = to.toISOString().slice(0, 10);
    const fromS = from.toISOString().slice(0, 10);
    setFromDate(fromS);
    setToDate(toS);
    setHistoryFromDate(fromS);
    setHistoryToDate(toS);
    setDatesPreset(true);
  }, [datesPreset]);

  const mapOrderById = useMemo(
    () => new Map(orders.map((order) => [order.id, order])),
    [orders],
  );

  const serverList = useMemo(
    () =>
      Array.from(
        new Set(
          orders
            .map((order) => String(order.serverName || "").trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [orders],
  );

  const toDayStart = (value: string) => {
    if (!value) return null;
    const date = new Date(`${value}T00:00:00`);
    const time = date.getTime();
    return Number.isFinite(time) ? time : null;
  };

  const toDayEnd = (value: string) => {
    if (!value) return null;
    const date = new Date(`${value}T23:59:59.999`);
    const time = date.getTime();
    return Number.isFinite(time) ? time : null;
  };

  const filteredOrders = useMemo(() => {
    const from = toDayStart(fromDate);
    const to = toDayEnd(toDate);

    return orders
      .filter((order) => order.status !== "CANCELLED")
      .filter((order) => !order.invoiceId)
      .filter((order) => isOrderPaid(order))
      .filter((order) => {
        if (!selectedClient) return true;
        if (selectedClient === "unassigned") return !order.clientId;
        return order.clientId === selectedClient;
      })
      .filter((order) => {
        if (!serverFilter) return true;
        return String(order.serverName || "") === serverFilter;
      })
      .filter((order) => {
        const createdAt = Number(order.createdAt || 0);
        if (from !== null && createdAt < from) return false;
        if (to !== null && createdAt > to) return false;
        return true;
      })
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  }, [orders, selectedClient, serverFilter, fromDate, toDate]);

  const allTicketsByDateOrServer = useMemo(() => {
    const from = toDayStart(historyFromDate);
    const to = toDayEnd(historyToDate);

    return [...orders]
      .filter((order) => order.status !== "CANCELLED")
      .filter((order) => {
        if (!historyServerFilter) return true;
        return String(order.serverName || "") === historyServerFilter;
      })
      .filter((order) => {
        const createdAt = Number(order.createdAt || 0);
        if (from !== null && createdAt < from) return false;
        if (to !== null && createdAt > to) return false;
        return true;
      })
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  }, [orders, historyFromDate, historyToDate, historyServerFilter]);

  const paidTicketsByDateOrServer = useMemo(
    () => allTicketsByDateOrServer.filter((order) => isOrderPaid(order)),
    [allTicketsByDateOrServer],
  );

  const unpaidTicketsByDateOrServer = useMemo(
    () => allTicketsByDateOrServer.filter((order) => !isOrderPaid(order)),
    [allTicketsByDateOrServer],
  );

  const visibleTicketsCount = useMemo(() => {
    if (historyPaymentFilter === "PAID")
      return paidTicketsByDateOrServer.length;
    if (historyPaymentFilter === "UNPAID")
      return unpaidTicketsByDateOrServer.length;
    return allTicketsByDateOrServer.length;
  }, [
    historyPaymentFilter,
    allTicketsByDateOrServer.length,
    paidTicketsByDateOrServer.length,
    unpaidTicketsByDateOrServer.length,
  ]);

  const invoiceEditableTickets = useMemo(() => {
    if (!selectedInvoice) return [] as Order[];
    const currentIds = Array.isArray(selectedInvoice.orderIds)
      ? selectedInvoice.orderIds
      : [];
    return orders
      .filter((order) => order.status !== "CANCELLED")
      .filter(
        (order) => !order.invoiceId || order.invoiceId === selectedInvoice.id,
      )
      .filter((order) => isOrderPaid(order) || currentIds.includes(order.id))
      .filter((order) => {
        const from = toDayStart(fromDate);
        const to = toDayEnd(toDate);
        const createdAt = Number(order.createdAt || 0);
        if (from !== null && createdAt < from) return false;
        if (to !== null && createdAt > to) return false;
        if (serverFilter && String(order.serverName || "") !== serverFilter)
          return false;
        return true;
      })
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
      .map(
        (order) =>
          ({ ...order, _selected: currentIds.includes(order.id) }) as any,
      );
  }, [orders, selectedInvoice, fromDate, toDate, serverFilter]);

  const selectedTotal = useMemo(
    () =>
      selectedOrders.reduce((sum, id) => {
        const order = orders.find((o) => o.id === id);
        return sum + Number(order?.total || 0);
      }, 0),
    [orders, selectedOrders],
  );

  const toggleOrderSelection = (id: string) => {
    setSelectedOrders((prev) =>
      prev.includes(id) ? prev.filter((oid) => oid !== id) : [...prev, id],
    );
  };

  const selectAllFilteredOrders = () => {
    setSelectedOrders(filteredOrders.map((o) => o.id));
  };

  const clearTicketSelection = () => setSelectedOrders([]);

  const toggleInvoiceOrderSelection = (id: string) => {
    setInvoiceEditOrders((prev) =>
      prev.includes(id) ? prev.filter((oid) => oid !== id) : [...prev, id],
    );
  };

  const validateClientInput = () => {
    const name = clientName.trim();
    if (!name) return "Le nom ou la raison sociale est obligatoire.";
    return null;
  };

  const createClientFromForm = async () => {
    const validationError = validateClientInput();
    if (validationError) {
      notifyError(validationError);
      return null;
    }

    const newClient: Omit<Client, "id"> = {
      type: clientType,
      name: clientName.trim(),
      phone: clientPhone.trim(),
      email: clientEmail.trim(),
      address: clientAddress.trim(),
      cin: clientType === "PERSON" ? clientCin.trim() : undefined,
      birthDate: clientType === "PERSON" ? clientBirthDate : undefined,
      taxId: clientType === "COMPANY" ? clientTaxId.trim() : undefined,
    };

    if (editingClientId) {
      const updated = await updateClient(editingClientId, newClient);
      if (!updated) return null;
      setSelectedClient(updated.id);
      setEditingClientId(null);
      return updated.id;
    }

    const saved = await addClient(newClient);
    setSelectedClient(saved.id);
    return saved.id;
  };

  const beginEditClient = (client: Client) => {
    setEditingClientId(client.id);
    setClientType(client.type === "COMPANY" ? "COMPANY" : "PERSON");
    setClientName(client.name || "");
    setClientCin(client.cin || "");
    setClientBirthDate(client.birthDate || "");
    setClientTaxId(client.taxId || "");
    setClientPhone(client.phone || "");
    setClientEmail(client.email || "");
    setClientAddress(client.address || "");
    const hasExtra = Boolean(
      client.cin ||
        client.birthDate ||
        client.taxId ||
        (client.address && client.address.trim()),
    );
    setShowClientExtraFields(hasExtra);
  };

  const resetClientForm = () => {
    setEditingClientId(null);
    setClientType("PERSON");
    setClientName("");
    setClientCin("");
    setClientBirthDate("");
    setClientTaxId("");
    setClientPhone("");
    setClientEmail("");
    setClientAddress("");
    setShowClientExtraFields(false);
  };

  const handleInvoiceCreate = async () => {
    if (selectedOrders.length === 0) {
      notifyError("Sélectionnez au moins un ticket payé.");
      return;
    }

    let clientId = selectedClientData?.id || selectedClient;
    if (!clientId || clientId === "unassigned") {
      const createdId = await createClientFromForm();
      if (!createdId) return;
      clientId = createdId;
    }

    await generateInvoice(clientId, selectedOrders);
    setSelectedOrders([]);
    notifySuccess("Facture créée.");
  };

  const openInvoice = (invoiceId: string) => {
    const invoice = invoices.find((inv) => inv.id === invoiceId);
    if (!invoice) return;
    setWorkspaceView("invoices");
    setSelectedInvoiceId(invoiceId);
    setInvoiceEditOrders(
      Array.isArray(invoice.orderIds) ? [...invoice.orderIds] : [],
    );
  };

  const saveInvoiceChanges = async () => {
    if (!selectedInvoice) return;
    const targetClientId =
      selectedInvoice.clientId || selectedClient || undefined;
    if (!targetClientId) {
      notifyError("Associez un client à cette facture.");
      return;
    }
    if (invoiceEditOrders.length === 0) {
      notifyError("La facture doit contenir au moins un ticket.");
      return;
    }
    await updateInvoice(selectedInvoice.id, {
      clientId: targetClientId,
      orderIds: uniq(invoiceEditOrders),
    });
    notifySuccess("Facture mise à jour.");
  };

  const groupedInvoiceRows = useMemo(() => {
    if (!selectedInvoice) return [] as Array<{ order: Order; items: any[] }>;
    const orderIds = Array.isArray(selectedInvoice.orderIds)
      ? selectedInvoice.orderIds
      : [];
    return orderIds
      .map((id) => mapOrderById.get(id))
      .filter(Boolean)
      .map((order) => {
        const typed = order as Order;
        const items = Array.isArray(typed.items) ? typed.items : [];
        return { order: typed, items };
      });
  }, [selectedInvoice, mapOrderById]);

  const invoiceSummary = useMemo(() => {
    const rows = groupedInvoiceRows.map(({ order, items }) => {
      const lines = items.map((item: any) => ({
        name: item.name,
        quantity: Number(item.quantity || 0),
        unitPrice: Number(item.price || 0),
        total: Number(item.quantity || 0) * Number(item.price || 0),
      }));
      const subtotal = lines.reduce((sum, line) => sum + line.total, 0);
      return { order, lines, subtotal };
    });

    const grandTotal = rows.reduce((sum, row) => sum + row.subtotal, 0);
    return { rows, grandTotal };
  }, [groupedInvoiceRows]);

  const printInvoice = () => {
    if (!selectedInvoice) return;
    const client = mapClientById.get(selectedInvoice.clientId);
    const invoiceCode = selectedInvoice.code || selectedInvoice.id;

    const rows = invoiceSummary.rows
      .map((row) => {
        const ticketHead = `
          <tr class="ticket-row">
            <td colspan="5">Ticket ${escapeHtml(formatTicketLabel(row.order))} • ${escapeHtml(new Date(row.order.createdAt).toLocaleString())} • Server: ${escapeHtml(row.order.serverName || "-")}</td>
          </tr>`;
        const itemLines = row.lines
          .map(
            (line) => `
              <tr>
                <td>${escapeHtml(line.name)}</td>
                <td class="right">${line.quantity}</td>
                <td class="right">${formatAmount(line.unitPrice)}</td>
                <td class="right">${formatAmount(line.total)}</td>
                <td class="right">${escapeHtml(settings.currency)}</td>
              </tr>`,
          )
          .join("");
        const subtotal = `
          <tr class="subtotal-row">
            <td colspan="3" class="right">Ticket subtotal</td>
            <td class="right">${formatAmount(row.subtotal)}</td>
            <td class="right">${escapeHtml(settings.currency)}</td>
          </tr>`;
        return `${ticketHead}${itemLines}${subtotal}`;
      })
      .join("");

    const html = `
      <html>
        <head>
          <title>${escapeHtml(invoiceCode)}</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; margin: 28px; color: #0f172a; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 14px; margin-bottom: 18px; }
            .title { font-size: 24px; font-weight: 700; letter-spacing: 0.04em; }
            .muted { color: #475569; font-size: 12px; margin: 2px 0; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 18px; }
            .box { border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; }
            .box h4 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: #334155; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; }
            th, td { border: 1px solid #cbd5e1; padding: 7px 8px; font-size: 12px; }
            th { background: #f8fafc; text-align: left; }
            .right { text-align: right; }
            .ticket-row td { background: #f1f5f9; font-weight: 700; }
            .subtotal-row td { background: #f8fafc; font-weight: 700; }
            .totals { margin-top: 14px; width: 280px; margin-left: auto; }
            .totals td { border: 1px solid #cbd5e1; padding: 8px; font-size: 13px; }
            .grand td { font-size: 15px; font-weight: 700; }
            .footer { margin-top: 24px; border-top: 1px solid #cbd5e1; padding-top: 10px; font-size: 11px; color: #475569; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="title">INVOICE</div>
              <p class="muted">${escapeHtml(settings.restaurantName || "Restaurant")}</p>
              <p class="muted">${escapeHtml(settings.address || "")}</p>
              <p class="muted">Tel: ${escapeHtml(settings.phone || "-")} • Email: ${escapeHtml(settings.email || "-")}</p>
              <p class="muted">Tax ID: ${escapeHtml(settings.taxId || "-")}</p>
            </div>
            <div>
              <p class="muted"><strong>No:</strong> ${escapeHtml(invoiceCode)}</p>
              <p class="muted"><strong>Date:</strong> ${escapeHtml(new Date(selectedInvoice.createdAt).toLocaleString())}</p>
              <p class="muted"><strong>Ticket count:</strong> ${invoiceSummary.rows.length}</p>
            </div>
          </div>

          <div class="grid">
            <div class="box">
              <h4>Billed To</h4>
              <p class="muted">${escapeHtml(client?.name || "-")}</p>
              <p class="muted">${escapeHtml(client?.address || "")}</p>
              <p class="muted">${escapeHtml(client?.phone || "-")}</p>
              <p class="muted">${escapeHtml(client?.email || "-")}</p>
            </div>
            <div class="box">
              <h4>Invoice Summary</h4>
              <p class="muted">Currency: ${escapeHtml(settings.currency)}</p>
              <p class="muted">Source: POS Tickets</p>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th class="right">Qty</th>
                <th class="right">Unit price</th>
                <th class="right">Line total</th>
                <th class="right">Cur.</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>

          <table class="totals">
            <tbody>
              <tr class="grand">
                <td>Total</td>
                <td class="right">${formatAmount(invoiceSummary.grandTotal)}</td>
              </tr>
            </tbody>
          </table>

          <div class="footer">
            Generated from POS ticket history. Thank you for your business.
          </div>
        </body>
      </html>`;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  };

  const printTicketFromExplorer = (order: Order) => {
    setReceiptModalOrder(order);
  };

  const handleDeleteInvoice = async (invoiceId: string) => {
    const confirmed = await askConfirm({
      title: "Supprimer la facture",
      message:
        "Les tickets liés redeviendront disponibles pour une nouvelle facture.",
      confirmText: "Supprimer",
      cancelText: "Annuler",
      tone: "danger",
    });
    if (!confirmed) {
      return;
    }

    try {
      await deleteInvoice(invoiceId);
      if (selectedInvoiceId === invoiceId) {
        setSelectedInvoiceId(null);
        setInvoiceEditOrders([]);
      }
      notifySuccess("Facture supprimée.");
    } catch (e: any) {
      notifyError(String(e?.message || "Suppression impossible."));
    }
  };

  return (
    <div className="touch-client-page flex h-full flex-col gap-4 lg:flex-row lg:gap-6">
      {receiptModalOrder &&
        createPortal(
          <div className="touch-client-modal fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="touch-client-modal-panel w-[350px] max-w-full rounded-2xl bg-white p-6 font-mono shadow-2xl">
              <div className="mb-4 text-center">
                <h2 className="text-lg font-bold">{settings.restaurantName}</h2>
                <p className="text-xs text-gray-500">{settings.address}</p>
                <p className="text-xs text-gray-500">Tél. {settings.phone}</p>
                <div className="my-2 border-b border-dashed border-gray-300" />
                <span className="text-xs font-bold">
                  Ticket {formatTicketLabel(receiptModalOrder)}
                </span>
                <span className="ml-2 text-xs">
                  {new Date(receiptModalOrder.createdAt).toLocaleString()}
                </span>
              </div>
              <table className="mb-2 w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left">Article</th>
                    <th className="text-right">Qté</th>
                    <th className="text-right">P.U.</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {receiptModalOrder.items.map((item, idx) => (
                    <tr key={idx}>
                      <td>{item.name}</td>
                      <td className="text-right">{item.quantity}</td>
                      <td className="text-right">{formatAmount(item.price)}</td>
                      <td className="text-right">
                        {formatAmount(
                          Number(item.price) * Number(item.quantity),
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="my-2 border-t border-dashed border-gray-300" />
              <div className="flex justify-between text-xs font-bold">
                <span>Total</span>
                <span>
                  {formatAmount(receiptModalOrder.total)} {settings.currency}
                </span>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  className="flex-1 rounded-xl bg-indigo-600 py-2 font-bold text-white"
                  onClick={() => {
                    window.print();
                  }}
                >
                  Imprimer
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-xl bg-gray-200 py-2 font-bold"
                  onClick={() => setReceiptModalOrder(null)}
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
      {/* Clients — colonne gauche */}
      <div className="flex w-full max-h-[40vh] flex-col gap-3 overflow-y-auto rounded-3xl border border-slate-100 bg-white p-4 shadow-sm lg:max-h-none lg:w-80 lg:shrink-0">
        <div>
          <h3 className="px-1 text-xs font-black uppercase tracking-widest text-slate-500">
            Clients
          </h3>
          <p className="mt-1 px-1 text-[11px] text-slate-400">
            Recherchez, sélectionnez, puis regroupez des tickets en facture.
          </p>
        </div>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={16}
          />
          <input
            type="search"
            value={clientQuery}
            onChange={(e) => setClientQuery(e.target.value)}
            placeholder="Nom, téléphone, code…"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={async () => {
              const id = await createClientFromForm();
              if (id) {
                notifySuccess(
                  editingClientId ? "Client enregistré." : "Client ajouté.",
                );
                resetClientForm();
              }
            }}
            className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-xs font-black text-white shadow-md shadow-indigo-200/50"
          >
            {editingClientId ? "Enregistrer" : "Enregistrer le client"}
          </button>
          {editingClientId && (
            <button
              type="button"
              onClick={resetClientForm}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-black text-slate-600"
            >
              Annuler
            </button>
          )}
        </div>
        <div className="-mx-1 max-h-[min(280px,40vh)] space-y-2 overflow-y-auto pr-1 lg:max-h-[calc(100vh-320px)]">
        {filteredClientsList.map((client) => (
          <div
            key={client.id}
            className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all border ${
              selectedClient === client.id
                ? "bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-100"
                : "bg-white text-slate-700 border-slate-100 hover:border-indigo-200"
            }`}
          >
            <button
              type="button"
              onClick={() => setSelectedClient(client.id)}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center ${selectedClient === client.id ? "bg-indigo-500" : "bg-slate-100 text-slate-500"}`}
              >
                <User size={20} />
              </div>
              <div className="text-left min-w-0">
                <p className="font-bold text-sm truncate">{client.name}</p>
                <p
                  className={`text-xs ${selectedClient === client.id ? "text-indigo-200" : "text-slate-400"}`}
                >
                  {client.code ||
                    client.phone ||
                    client.email ||
                    client.taxId ||
                    "-"}
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => beginEditClient(client)}
              className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-indigo-700 hover:bg-indigo-100"
              title="Modifier"
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              onClick={async () => {
                const confirmed = await askConfirm({
                  title: "Supprimer le client",
                  message:
                    "Possible seulement si aucun ticket ni facture n’est lié.",
                  confirmText: "Supprimer",
                  cancelText: "Annuler",
                  tone: "danger",
                });
                if (!confirmed) return;
                try {
                  const ok = await deleteClient(client.id);
                  if (!ok) notifyError("Suppression impossible.");
                } catch (e: any) {
                  notifyError(String(e?.message || "Suppression impossible."));
                }
              }}
              className="px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
              title="Supprimer"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        </div>
        <button
          type="button"
          onClick={() => setSelectedClient("unassigned")}
          className={`w-full rounded-2xl border p-3 text-xs font-black transition ${
            selectedClient === "unassigned"
              ? "border-indigo-500 bg-indigo-600 text-white"
              : "border-dashed border-slate-300 bg-slate-50 text-slate-500 hover:border-slate-400"
          }`}
        >
          Tickets sans client rattaché
        </button>
      </div>

      {/* Zone principale : facturation */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-wrap gap-2 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-indigo-50/30 p-3 sm:p-4">
          <button
            type="button"
            onClick={() => setWorkspaceView("create")}
            className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-xs font-black transition-all ${
              workspaceView === "create"
                ? "border-indigo-600 bg-indigo-600 text-white shadow-md"
                : "border-slate-200 bg-white text-slate-600 hover:border-indigo-200"
            }`}
          >
            <FileText size={15} />
            Nouvelle facture
          </button>
          <button
            type="button"
            onClick={() => setWorkspaceView("tickets")}
            className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-xs font-black transition-all ${
              workspaceView === "tickets"
                ? "border-indigo-600 bg-indigo-600 text-white shadow-md"
                : "border-slate-200 bg-white text-slate-600 hover:border-indigo-200"
            }`}
          >
            <ListChecks size={15} />
            Tickets
          </button>
          <button
            type="button"
            onClick={() => setWorkspaceView("invoices")}
            className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-xs font-black transition-all ${
              workspaceView === "invoices"
                ? "border-indigo-600 bg-indigo-600 text-white shadow-md"
                : "border-slate-200 bg-white text-slate-600 hover:border-indigo-200"
            }`}
          >
            <ScrollText size={15} />
            Factures
          </button>
        </div>

        {workspaceView === "create" && (
          <>
            <div className="flex items-start gap-3 border-b border-slate-100 bg-indigo-50/40 px-4 py-3 sm:px-6">
              <Info className="mt-0.5 shrink-0 text-indigo-600" size={18} />
              <p className="text-xs font-semibold leading-relaxed text-slate-700">
                <strong className="text-indigo-900">3 étapes :</strong> choisissez
                un client à gauche (ou saisissez la fiche ci-dessous), cochez les
                tickets payés, puis cliquez sur « Créer la facture ».
              </p>
            </div>

            <div className="space-y-4 border-b border-slate-100 bg-white p-4 sm:p-6">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Fiche client (pour nouveau client ou modification)
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <select
                  value={clientType}
                  onChange={(e) =>
                    setClientType(e.target.value as "PERSON" | "COMPANY")
                  }
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-bold"
                >
                  <option value="PERSON">Personne</option>
                  <option value="COMPANY">Société</option>
                </select>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder={
                    clientType === "PERSON"
                      ? "Nom et prénom *"
                      : "Raison sociale *"
                  }
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-bold md:col-span-1"
                />
                <input
                  type="text"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  placeholder="Téléphone"
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-bold"
                />
                <input
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="E-mail"
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-bold"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowClientExtraFields((v) => !v)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 py-2 text-xs font-black uppercase tracking-wide text-slate-500 transition hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-700"
              >
                {showClientExtraFields ? (
                  <ChevronUp size={16} />
                ) : (
                  <ChevronDown size={16} />
                )}
                CIN, matricule fiscal, adresse complète…
              </button>
              {showClientExtraFields && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {clientType === "PERSON" ? (
                    <>
                      <input
                        type="text"
                        value={clientCin}
                        onChange={(e) => setClientCin(e.target.value)}
                        placeholder="CIN"
                        className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-bold"
                      />
                      <input
                        type="date"
                        value={clientBirthDate}
                        onChange={(e) => setClientBirthDate(e.target.value)}
                        className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-bold"
                      />
                    </>
                  ) : (
                    <input
                      type="text"
                      value={clientTaxId}
                      onChange={(e) => setClientTaxId(e.target.value)}
                      placeholder="Matricule fiscal"
                      className="md:col-span-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-bold"
                    />
                  )}
                  <input
                    type="text"
                    value={clientAddress}
                    onChange={(e) => setClientAddress(e.target.value)}
                    placeholder="Adresse"
                    className="md:col-span-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-bold"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 border-b border-slate-100 bg-slate-50/50 p-4 sm:grid-cols-3 sm:p-6">
              <div>
                <label className="mb-1 block text-[10px] font-black uppercase text-slate-400">
                  Du
                </label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-bold"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-black uppercase text-slate-400">
                  Au
                </label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-bold"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-black uppercase text-slate-400">
                  Serveur
                </label>
                <select
                  value={serverFilter}
                  onChange={(e) => setServerFilter(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-bold"
                >
                  <option value="">Tous</option>
                  {serverList.map((server) => (
                    <option key={server} value={server}>
                      {server}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-b border-slate-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div>
                <h3 className="font-bold text-slate-800">
                  Tickets disponibles pour facture
                </h3>
                <p className="text-xs text-slate-500">
                  Payés, sans facture — période et filtre ci-dessus (
                  {filteredOrders.length} ticket
                  {filteredOrders.length !== 1 ? "s" : ""})
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {filteredOrders.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={selectAllFilteredOrders}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase text-slate-600 hover:bg-white"
                    >
                      Tout cocher
                    </button>
                    <button
                      type="button"
                      onClick={clearTicketSelection}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase text-slate-600 hover:bg-white"
                    >
                      Tout décocher
                    </button>
                  </>
                )}
                {selectedOrders.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void handleInvoiceCreate()}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-black text-white shadow-md shadow-emerald-200 transition hover:bg-emerald-700"
                  >
                    <FileText size={16} />
                    Créer la facture ({selectedOrders.length}) —{" "}
                    {formatAmount(selectedTotal)} {settings.currency}
                  </button>
                )}
              </div>
            </div>

            <div className="min-h-[200px] flex-1 space-y-3 overflow-y-auto p-4 sm:p-6">
              {filteredOrders.length === 0 ? (
                <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 text-slate-400">
                  <FileText size={44} className="opacity-40" />
                  <p className="text-center text-sm font-semibold">
                    Aucun ticket payé à facturer pour ce filtre.
                  </p>
                  <p className="max-w-sm text-center text-xs">
                    Élargissez les dates ou vérifiez qu&apos;un client est bien
                    sélectionné si le ticket lui est rattaché.
                  </p>
                </div>
              ) : (
                filteredOrders.map((order) => (
                  <div
                    key={order.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleOrderSelection(order.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleOrderSelection(order.id);
                      }
                    }}
                    className={`flex cursor-pointer items-center justify-between rounded-2xl border p-4 transition-all ${
                      selectedOrders.includes(order.id)
                        ? "border-emerald-500 bg-emerald-50 shadow-sm"
                        : "border-slate-100 bg-slate-50 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`flex h-7 w-7 items-center justify-center rounded-full ${selectedOrders.includes(order.id) ? "bg-emerald-500 text-white" : "border-2 border-slate-200 bg-white"}`}
                      >
                        {selectedOrders.includes(order.id) && (
                          <Check size={14} />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">
                          Ticket {formatTicketLabel(order)}
                        </p>
                        <p className="text-[10px] font-bold uppercase tracking-tight text-slate-500">
                          {new Date(order.createdAt).toLocaleDateString()} •{" "}
                          {order.type} • {order.serverName || "—"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-800">
                        {formatAmount(order.total)} {settings.currency}
                      </p>
                      <p className="text-[10px] font-bold text-emerald-600">
                        À inclure
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {workspaceView === "tickets" && (
          <div className="flex flex-1 flex-col space-y-4 overflow-y-auto bg-white p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-bold text-slate-800">Historique des tickets</h3>
                <p className="text-xs text-slate-500">
                  Consulter, filtrer et imprimer un ticket
                </p>
              </div>
              <p className="text-xs font-bold text-slate-500">
                {visibleTicketsCount} affiché
                {visibleTicketsCount !== 1 ? "s" : ""}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setHistoryPaymentFilter("ALL")}
                className={`rounded-xl border px-4 py-2 text-[11px] font-black transition-all ${
                  historyPaymentFilter === "ALL"
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                Tous
              </button>
              <button
                type="button"
                onClick={() => setHistoryPaymentFilter("PAID")}
                className={`rounded-xl border px-4 py-2 text-[11px] font-black transition-all ${
                  historyPaymentFilter === "PAID"
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                Payés
              </button>
              <button
                type="button"
                onClick={() => setHistoryPaymentFilter("UNPAID")}
                className={`rounded-xl border px-4 py-2 text-[11px] font-black transition-all ${
                  historyPaymentFilter === "UNPAID"
                    ? "border-amber-600 bg-amber-600 text-white"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                Non payés
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <input
                type="date"
                value={historyFromDate}
                onChange={(e) => setHistoryFromDate(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-bold"
              />
              <input
                type="date"
                value={historyToDate}
                onChange={(e) => setHistoryToDate(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-bold"
              />
              <select
                value={historyServerFilter}
                onChange={(e) => setHistoryServerFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-bold"
              >
                <option value="">Tous les serveurs</option>
                {serverList.map((server) => (
                  <option key={server} value={server}>
                    {server}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-4 pr-1">
              {allTicketsByDateOrServer.length === 0 ? (
                <p className="text-xs italic text-slate-400">
                  Aucun ticket pour ces critères
                </p>
              ) : (
                <>
                  {(historyPaymentFilter === "ALL" ||
                    historyPaymentFilter === "PAID") && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-black uppercase tracking-wide text-emerald-600">
                          Payés
                        </h4>
                        <p className="text-[10px] font-bold text-emerald-600">
                          {paidTicketsByDateOrServer.length}
                        </p>
                      </div>
                      {paidTicketsByDateOrServer.length === 0 ? (
                        <p className="text-xs italic text-slate-400">
                          Aucun ticket payé
                        </p>
                      ) : (
                        paidTicketsByDateOrServer.map((order) => (
                          <div
                            key={`history-paid-${order.id}`}
                            className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/40 p-3"
                          >
                            <div>
                              <p className="text-xs font-bold text-slate-800">
                                Ticket {formatTicketLabel(order)}
                              </p>
                              <p className="text-[10px] text-slate-500">
                                {new Date(order.createdAt).toLocaleString()} •{" "}
                                {order.serverName || "-"} • {order.type}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-right">
                                <p className="text-xs font-bold text-slate-800">
                                  {formatAmount(order.total)}{" "}
                                  {settings.currency}
                                </p>
                                <p className="text-[10px] font-bold text-emerald-600">
                                  {order.status}
                                  {order.invoiceId
                                    ? ` • INV-${order.invoiceId.slice(-5)}`
                                    : ""}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => printTicketFromExplorer(order)}
                                className="flex items-center gap-1 rounded-lg bg-slate-900 px-2 py-1 text-[10px] font-black text-white"
                                title="Imprimer"
                              >
                                <Printer size={11} /> Imprimer
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {(historyPaymentFilter === "ALL" ||
                    historyPaymentFilter === "UNPAID") && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-black uppercase tracking-wide text-amber-600">
                          Non payés
                        </h4>
                        <p className="text-[10px] font-bold text-amber-600">
                          {unpaidTicketsByDateOrServer.length}
                        </p>
                      </div>
                      {unpaidTicketsByDateOrServer.length === 0 ? (
                        <p className="text-xs italic text-slate-400">
                          Aucun ticket non payé
                        </p>
                      ) : (
                        unpaidTicketsByDateOrServer.map((order) => (
                          <div
                            key={`history-unpaid-${order.id}`}
                            className="p-3 rounded-xl border border-amber-200 bg-amber-50/40 flex items-center justify-between"
                          >
                            <div>
                              <p className="text-xs font-bold text-slate-800">
                                Ticket {formatTicketLabel(order)}
                              </p>
                              <p className="text-[10px] text-slate-500">
                                {new Date(order.createdAt).toLocaleString()} •{" "}
                                {order.serverName || "-"} • {order.type}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-right">
                                <p className="text-xs font-bold text-slate-800">
                                  {formatAmount(order.total)}{" "}
                                  {settings.currency}
                                </p>
                                <p className="text-[10px] font-bold text-amber-600">
                                  {order.status}
                                  {order.invoiceId
                                    ? ` • INV-${order.invoiceId.slice(-5)}`
                                    : ""}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => printTicketFromExplorer(order)}
                                className="flex items-center gap-1 rounded-lg bg-slate-900 px-2 py-1 text-[10px] font-black text-white"
                                title="Imprimer"
                              >
                                <Printer size={11} /> Imprimer
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {historyPaymentFilter !== "ALL" &&
                    visibleTicketsCount === 0 && (
                      <p className="text-xs italic text-slate-400">
                        Aucun ticket{" "}
                        {historyPaymentFilter === "PAID" ? "payé" : "non payé"}{" "}
                        pour ces filtres
                      </p>
                    )}
                </>
              )}
            </div>
          </div>
        )}

        {workspaceView === "invoices" && (
          <div className="flex flex-1 flex-col overflow-y-auto bg-slate-50 p-4 sm:p-6">
            <h4 className="mb-4 text-xs font-black uppercase tracking-widest text-slate-400">
              Factures émises
            </h4>
            <div className="pb-2">
              {invoices.length === 0 ? (
                <p className="text-sm font-semibold text-slate-400">
                  Aucune facture pour le moment. Créez-en depuis l’onglet «
                  Nouvelle facture ».
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {invoices.map((inv) => (
                    <div
                      key={inv.id}
                      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-200 hover:shadow-md"
                    >
                      <p className="text-[10px] font-bold text-slate-400">
                        {inv.code || `FAC-${inv.id.slice(-5)}`}
                      </p>
                      <p className="mt-1 text-lg font-black text-indigo-600">
                        {formatAmount(inv.total)} {settings.currency}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {new Date(inv.createdAt).toLocaleDateString()}
                      </p>
                      <p className="mt-2 truncate text-xs font-semibold text-slate-700">
                        {mapClientById.get(inv.clientId)?.name || "Client"}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openInvoice(inv.id)}
                          className="flex-1 rounded-xl bg-indigo-600 px-3 py-2 text-[10px] font-black text-white"
                        >
                          Ouvrir
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteInvoice(inv.id)}
                          className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-black text-rose-700"
                        >
                          Suppr.
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selectedInvoice && (
              <div className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h5 className="font-black text-slate-800">
                    Facture{" "}
                    {selectedInvoice.code ||
                      selectedInvoice.id.slice(0, 8).toUpperCase()}
                  </h5>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={printInvoice}
                      className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white"
                    >
                      <Printer size={12} /> Imprimer PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveInvoiceChanges()}
                      className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white"
                    >
                      Enregistrer
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteInvoice(selectedInvoice.id)}
                      className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-black text-white"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  Cochez ou décochez les tickets à inclure, puis enregistrez.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {invoiceEditableTickets.map((order: any) => (
                    <button
                      key={order.id}
                      onClick={() => toggleInvoiceOrderSelection(order.id)}
                      className={`text-left p-3 rounded-xl border ${invoiceEditOrders.includes(order.id) ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}
                    >
                      <p className="font-bold text-xs">
                        Ticket {formatTicketLabel(order)}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {order.serverName || "-"} • {formatAmount(order.total)}{" "}
                        {settings.currency}
                      </p>
                    </button>
                  ))}
                </div>

                <div className="space-y-3">
                  {groupedInvoiceRows.map(({ order, items }) => (
                    <div
                      key={order.id}
                      className="border border-slate-200 rounded-xl p-3"
                    >
                      <p className="text-xs font-black text-indigo-600">
                        Ticket {formatTicketLabel(order)}
                      </p>
                      <div className="mt-2 space-y-1">
                        {items.length === 0 ? (
                          <p className="text-xs text-slate-400">Aucune ligne</p>
                        ) : (
                          items.map((item: any, index: number) => (
                            <div
                              key={`${order.id}-${index}`}
                              className="flex justify-between text-xs"
                            >
                              <span>
                                {item.quantity} × {item.name}
                              </span>
                              <span>
                                {formatAmount(item.price)} {settings.currency}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClientManager;
