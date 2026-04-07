import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import {
  Order,
  OrderStatus,
  OrderType,
  TableStatus,
  PosSession,
  Product,
  ApiResponseMap,
  Client,
  Invoice,
  User,
  Printer,
  Category,
  Promotion,
  PaymentMethod,
  PaymentRequest,
  Zone,
  TableConfig,
  TableReservation,
  Shift,
  ShiftSummary,
  Role,
  CompanyType,
  CashMovement,
  StockMovement,
  CogsByOrderRow,
  CogsByDayRow,
  ProductProfitabilityRow,
  ProductMovementRow,
  StockDocument,
  Supplier,
  Fund,
  FundSession,
  FundMovement,
  PosDiscountPreset,
  DEFAULT_POS_DISCOUNT_PRESETS,
  SalesSummaryRow,
  SalesByProductRow,
  SalesByCategoryRow,
  SalesByServerRow,
  SalesByPaymentMethodRow,
  SalesByTimeslotRow,
  CashClosingRow,
  TopCustomerRow,
  RestaurantVoucher,
  RestaurantCard,
  RestaurantCardMovement,
  Warehouse,
} from "../types";
import { postPartialPayment } from "../api/api";
import { normalizeOrderFromApi } from "../utils/normalizeOrderFromApi";
import { notifyError } from "../utils/notify";

/** Portée des rapports : poste courant, agrégation, ou terminal explicite (admin). */
export type ReportTerminalFilter = "poste" | "all" | string;

function appendReportTerminalToSearchParams(
  query: URLSearchParams,
  terminalFilter: ReportTerminalFilter | undefined,
  settingsTerminalId: string | undefined,
): void {
  const tf = terminalFilter ?? "poste";
  if (tf === "all") return;
  if (tf === "poste") {
    const tid = settingsTerminalId?.trim();
    if (tid) query.set("terminalId", tid);
    return;
  }
  query.set("terminalId", String(tf));
}

// Derive API base URL.
// In local dev, keep same-origin to use Vite proxy (/pos, /ws).
// In production, require VITE_API_URL when backend is hosted elsewhere.
const RAW_API_URL = String((import.meta as any).env?.VITE_API_URL ?? "").trim();
const IS_PROD = String((import.meta as any).env?.PROD ?? "false") === "true";
let API_BASE_URL = RAW_API_URL.replace(/\/+$/, "");
if (!API_BASE_URL && !IS_PROD) {
  API_BASE_URL = "";
}
// Default to simulated backend when no API_URL is configured or explicitly set to true
const USE_SIMULATED_BACKEND =
  String((import.meta as any).env?.VITE_USE_SIMULATED_BACKEND ?? "false")
    .toLowerCase()
    .trim() === "true";
const UUID_LIKE_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuidLike = (value: unknown) => UUID_LIKE_RE.test(String(value || "").trim());

/**
 * GET /pos/session renvoie une ligne fund_sessions (spread) + isOpen + movements.
 * On en déduit activeFundSession pour l’UI (sinon la caisse reste « verrouillée »).
 */
function fundSessionFromPosApiSession(s: unknown): FundSession | null {
  if (!s || typeof s !== "object") return null;
  const o = s as Record<string, unknown>;
  if (!o.isOpen || !o.id) return null;
  if (!o.shiftId || !o.fundId) return null;
  const statusRaw = String(o.status ?? "OPEN").toUpperCase();
  if (statusRaw === "CLOSED") return null;
  return {
    id: String(o.id),
    fundId: String(o.fundId),
    shiftId: String(o.shiftId),
    cashierId: String(o.cashierId ?? ""),
    cashierName: String(o.cashierName ?? ""),
    openedAt: Number(o.openedAt ?? 0),
    closedAt: (o.closedAt as number | null | undefined) ?? null,
    openingBalance: Number(o.openingBalance ?? 0),
    closingBalance: Number(o.closingBalance ?? 0),
    totalSales: Number(o.totalSales ?? 0),
    cashSales: Number(o.cashSales ?? 0),
    cardSales: Number(o.cardSales ?? 0),
    status: "OPEN",
    notes: o.notes != null ? String(o.notes) : null,
  };
}

/** Données licence SaaS (fusionnées dans GET /pos/settings). */
export interface SaasLicenseSnapshot {
  maxUsers: number | null;
  maxProducts: number | null;
  maxOrders: number | null;
  usage: { users: number; products: number; orders: number };
  enabledModules: string[];
  companyTypeManagedBySaas: boolean;
  forcedCompanyType: string | null;
  licenseKey: string | null;
  licenseExpiresAt: number | null;
  licenseExpired: boolean;
  /** Abonnement / quotas synchronisés depuis une app externe (sans secrets). */
  externalSubscription?: {
    enabled: boolean;
    lastSyncAt: number | null;
    lastStatus: string | null;
    lastMessage: string | null;
  };
}

interface AppSettings {
  companyType?: CompanyType;
  saasLicense?: SaasLicenseSnapshot;
  /**
   * Résolu côté API : INDEPENDENT = clôturer la station à tout moment ;
   * SHIFT_HANDOVER = tous les shifts serveur du poste doivent être fermés avant la station.
   */
  cashClosingMode?: "INDEPENDENT" | "SHIFT_HANDOVER";
  /** Préférence enregistrée : AUTO suit le type de société (restaurant = équipes d'abord). */
  cashClosingModePreference?: "AUTO" | "INDEPENDENT" | "SHIFT_HANDOVER";
  timbreValue: number;
  tvaRate: number;
  applyTvaToTicket: boolean;
  applyTvaToInvoice: boolean;
  applyTimbreToTicket: boolean;
  applyTimbreToInvoice: boolean;
  printPreviewOnValidate: boolean;
  touchUiMode?: boolean;
  clientKdsDisplayMode?: "STANDARD" | "WALLBOARD" | "AUTO";
  /** Largeur min (px) pour wallboard en mode AUTO (défaut 1920). */
  clientKdsWallboardMinWidthPx?: number;
  clientTicketPrintCopies: number;
  clientTicketTemplate: "CLASSIC" | "COMPACT" | "MODERN";
  /** Dossier d'export automatique des reçus PDF (backend). */
  receiptPdfDirectory?: string;
  /** Téléchargement auto du ticket PDF sur le poste caisse. */
  autoDownloadReceiptPdfOnClient?: boolean;
  clientTicketLayout?: {
    headerText?: string;
    footerText?: string;
    showLogo?: boolean;
    showAddress?: boolean;
    showPhone?: boolean;
    showTaxId?: boolean;
    showServer?: boolean;
    showTable?: boolean;
    showDate?: boolean;
    showTicketNumber?: boolean;
    showPriceHt?: boolean;
    showTicketDiscount?: boolean;
    showTimbre?: boolean;
    showTva?: boolean;
    showPriceTtc?: boolean;
    showQrCode?: boolean;
    showItemUnitPrice?: boolean;
    showPaymentMethod?: boolean;
    showTerminal?: boolean;
    showClientName?: boolean;
    showFiscalQrCode?: boolean;
  };
  paymentSoundEnabled: boolean;
  currency: string;
  restaurantName: string;
  logoUrl: string;
  phone: string;
  email: string;
  taxId: string;
  address: string;
  predefinedNotes: string[];
  terminalId?: string;
  ticketPrefix?: string;
  orderPrefix?: string;
  invoicePrefix?: string;
  clientPrefix?: string;
  stockDocumentPrefix?: string;
  productPrefix?: string;
  /** Raccourcis remise (ligne + ticket) au point de vente. */
  posDiscountPresets?: PosDiscountPreset[];
  /** API externe de débit carte restaurant (si la carte n'existe pas localement). */
  externalRestaurantCardApi?: {
    enabled: boolean;
    url: string;
    token?: string;
    timeoutMs?: number;
  };
  paymentEnabledMethods?: PaymentMethod[];
  kitchenBarPrintTemplates?: {
    kitchen?: {
      title?: string;
      footerText?: string;
      showOrderRef?: boolean;
      showTime?: boolean;
      showTable?: boolean;
      showServer?: boolean;
      showItemQty?: boolean;
      showItemNotes?: boolean;
    };
    bar?: {
      title?: string;
      footerText?: string;
      showOrderRef?: boolean;
      showTime?: boolean;
      showTable?: boolean;
      showServer?: boolean;
      showItemQty?: boolean;
      showItemNotes?: boolean;
    };
  };
  // Suppliers stored separately in context, not in settings
}

const SimulatedBackend = {
  getStorage: (key: string, fallback: any) => {
    const data = localStorage.getItem(`axiaflex_${key}`);
    return data ? JSON.parse(data) : fallback;
  },
  setStorage: (key: string, data: any) => {
    localStorage.setItem(`axiaflex_${key}`, JSON.stringify(data));
  },

  handleRequest: async (path: string, options?: any) => {
    await new Promise((r) => setTimeout(r, 150));

    const products = SimulatedBackend.getStorage("products", [
      {
        id: "1",
        name: "Pizza Margherita",
        price: 12.5,
        category: "cat-1",
        imageUrl: "https://picsum.photos/seed/pizza/200",
        isPack: false,
        manageStock: true,
        stock: 50,
        printerIds: ["p1"],
      },
      {
        id: "2",
        name: "Burger Classic",
        price: 14.0,
        category: "cat-1",
        imageUrl: "https://picsum.photos/seed/burger/200",
        isPack: false,
        manageStock: true,
        stock: 20,
        printerIds: ["p1"],
      },
    ]);
    const categories = SimulatedBackend.getStorage("categories", [
      { id: "cat-1", name: "Cuisine Principale" },
    ]);
    const orders = SimulatedBackend.getStorage("orders", []);
    const session = SimulatedBackend.getStorage("session", {
      isOpen: false,
      movements: [],
    });
    const shifts = SimulatedBackend.getStorage("shifts", []);
    const stockMovements = SimulatedBackend.getStorage("stock_movements", []);
    const clients = SimulatedBackend.getStorage("clients", []);
    const invoices = SimulatedBackend.getStorage("invoices", []);
    const settings = SimulatedBackend.getStorage("settings", {
      companyType: CompanyType.FAST_FOOD,
      cashClosingModePreference: "AUTO",
      cashClosingMode: "INDEPENDENT",
      timbreValue: 1.0,
      tvaRate: 19,
      applyTvaToTicket: true,
      applyTvaToInvoice: true,
      applyTimbreToTicket: true,
      applyTimbreToInvoice: true,
      printPreviewOnValidate: false,
      touchUiMode: false,
      clientKdsDisplayMode: "STANDARD",
      clientKdsWallboardMinWidthPx: 1920,
      clientTicketPrintCopies: 1,
      clientTicketTemplate: "CLASSIC",
      receiptPdfDirectory: "",
      autoDownloadReceiptPdfOnClient: false,
      clientTicketLayout: {
        headerText: "",
        footerText: "Merci et à bientôt !",
        showLogo: true,
        showAddress: true,
        showPhone: true,
        showTaxId: true,
        showServer: true,
        showTable: true,
        showDate: true,
        showTicketNumber: true,
        showPriceHt: true,
        showTicketDiscount: true,
        showTimbre: true,
        showTva: true,
        showPriceTtc: true,
        showQrCode: false,
        showItemUnitPrice: true,
        showPaymentMethod: true,
        showTerminal: false,
        showClientName: false,
        showFiscalQrCode: false,
      },
      paymentSoundEnabled: true,
      currency: "DT",
      restaurantName: "AxiaFlex",
      logoUrl: "",
      phone: "",
      email: "",
      taxId: "",
      address: "",
      predefinedNotes: [
        "Sans Oignon",
        "Trés Épicé",
        "Bien Cuit",
        "Sans Sel",
        "Extra Sauce",
        "Allergie",
      ],
      terminalId: "",
      ticketPrefix: "TK-",
      orderPrefix: "ORD-",
      invoicePrefix: "INV-",
      clientPrefix: "CLI-",
      stockDocumentPrefix: "SD-",
      productPrefix: "ART-",
      posDiscountPresets: DEFAULT_POS_DISCOUNT_PRESETS.map((p) => ({ ...p })),
      externalRestaurantCardApi: {
        enabled: false,
        url: "",
        token: "",
        timeoutMs: 8000,
      },
      paymentEnabledMethods: [
        PaymentMethod.CASH,
        PaymentMethod.BANK_CARD,
        PaymentMethod.RESTAURANT_CARD,
        PaymentMethod.RESTAURANT_TICKET,
      ],
      kitchenBarPrintTemplates: {
        kitchen: {
          title: "BON CUISINE",
          footerText: "",
          showOrderRef: true,
          showTime: true,
          showTable: true,
          showServer: true,
          showItemQty: true,
          showItemNotes: true,
        },
        bar: {
          title: "BON BAR",
          footerText: "",
          showOrderRef: true,
          showTime: true,
          showTable: true,
          showServer: true,
          showItemQty: true,
          showItemNotes: true,
        },
      },
      ticketSequence: 0,
      orderSequence: 0,
      invoiceSequence: 0,
      clientSequence: 0,
      stockDocumentSequence: 0,
      productSequence: 0,
    });
    const zones = SimulatedBackend.getStorage("zones", [
      { id: "z1", name: "Salle Principale" },
    ]);
    const tables = SimulatedBackend.getStorage("tables", [
      {
        id: "t1",
        number: "1",
        zoneId: "z1",
        capacity: 4,
        status: TableStatus.AVAILABLE,
        token: "token-t1",
        reservedBy: null,
        reservedAt: null,
        reservedUntil: null,
      },
    ]);
    const tableReservations = SimulatedBackend.getStorage(
      "table_reservations",
      [],
    );

    const DEFAULT_RESERVATION_MINUTES = 60;

    const normalizedTables = tables.map((t: any) => ({
      ...t,
      status: t.status || TableStatus.AVAILABLE,
      token: t.token || `token-${t.id || t.number}`,
      reservedBy: t.reservedBy || null,
      reservedAt: t.reservedAt ? Number(t.reservedAt) : null,
      reservedUntil: t.reservedUntil ? Number(t.reservedUntil) : null,
    }));

    const now = Date.now();
    const expired = normalizedTables.filter(
      (t: any) =>
        t.status === TableStatus.RESERVED &&
        t.reservedUntil &&
        Number(t.reservedUntil) <= now,
    );
    let currentTables = normalizedTables;
    if (expired.length > 0) {
      const updated = normalizedTables.map((t: any) =>
        expired.some((e: any) => e.id === t.id)
          ? {
              ...t,
              status: TableStatus.AVAILABLE,
              reservedBy: null,
              reservedAt: null,
              reservedUntil: null,
            }
          : t,
      );
      SimulatedBackend.setStorage("tables", updated);
      const updatedReservations = tableReservations.map((r: any) =>
        expired.some((e: any) => e.id === r.tableId) && !r.releasedAt
          ? { ...r, releasedAt: now }
          : r,
      );
      SimulatedBackend.setStorage("table_reservations", updatedReservations);
      currentTables = updated;
    }

    if (path === "/pos/products") {
      if (options?.method === "POST") {
        const body = JSON.parse(options.body);
        const productPrefix = String(settings.productPrefix || "ART-").trim();
        const productSequence = Number(settings.productSequence || 0) + 1;
        const newProduct = {
          ...body,
          id: body.id || `art-${Date.now()}`,
          code:
            body.code ||
            `${productPrefix}${String(productSequence).padStart(6, "0")}`,
        };
        const updated = [...products, newProduct];
        SimulatedBackend.setStorage("products", updated);
        SimulatedBackend.setStorage("settings", {
          ...settings,
          productSequence,
        });
        return newProduct;
      }
      return products;
    }
    if (path === "/pos/categories") return categories;
    if (path === "/pos/zones") {
      if (options?.method === "POST") {
        const body = JSON.parse(options.body || "{}");
        const z = {
          id: `z-${Date.now()}`,
          name: String(body.name || "Zone"),
        };
        SimulatedBackend.setStorage("zones", [...zones, z]);
        return z;
      }
      return zones;
    }
    const zoneIdPatch = path.match(/^\/pos\/zones\/([^/]+)$/);
    if (zoneIdPatch && options?.method === "PATCH") {
      const zid = zoneIdPatch[1];
      const body = JSON.parse(options.body || "{}");
      const zlist = SimulatedBackend.getStorage("zones", zones);
      const next = zlist.map((z: any) =>
        z.id === zid ? { ...z, ...body } : z,
      );
      SimulatedBackend.setStorage("zones", next);
      return next.find((z: any) => z.id === zid) || null;
    }
    if (path === "/pos/tables") {
      if (options?.method === "POST") {
        const body = JSON.parse(options.body || "{}");
        const row = {
          id: `tbl-${Date.now()}`,
          number: String(body.number ?? ""),
          zoneId: String(body.zoneId ?? ""),
          capacity: Number(body.capacity ?? 4),
          status: TableStatus.AVAILABLE,
          token: `tok-${Date.now()}`,
          reservedBy: null,
          reservedAt: null,
          reservedUntil: null,
          planX: body.planX ?? null,
          planY: body.planY ?? null,
          planW: body.planW ?? null,
          planH: body.planH ?? null,
          planShape: body.planShape ?? null,
        };
        const next = [...currentTables, row];
        SimulatedBackend.setStorage("tables", next);
        return row;
      }
      return currentTables;
    }
    if (path === "/pos/tables/reservations") {
      return [...tableReservations].sort(
        (a: any, b: any) => Number(b.reservedAt) - Number(a.reservedAt),
      );
    }
    if (path.startsWith("/pos/tables/") && options?.method === "PATCH") {
      const id = path.split("/pos/tables/")[1];
      const body = JSON.parse(options.body || "{}");
      const existing = currentTables.find((t: any) => t.id === id);
      const wasReserved = existing?.status === TableStatus.RESERVED;
      const willBeReserved = body.status === TableStatus.RESERVED;
      const nowMs = Date.now();
      if (willBeReserved && !wasReserved) {
        const reservedAt = Number(body.reservedAt || nowMs);
        const reservedUntil = Number(
          body.reservedUntil ||
            reservedAt + DEFAULT_RESERVATION_MINUTES * 60 * 1000,
        );
        const entry = {
          id: `res-${nowMs}`,
          tableId: existing?.id || id,
          tableNumber: existing?.number || "-",
          zoneId: existing?.zoneId || "",
          reservedBy: body.reservedBy || null,
          reservedAt,
          reservedUntil,
          releasedAt: null,
        };
        SimulatedBackend.setStorage("table_reservations", [
          entry,
          ...tableReservations,
        ]);
      }
      if (!willBeReserved && wasReserved) {
        const updatedReservations = tableReservations.map((r: any) =>
          r.tableId === id && !r.releasedAt ? { ...r, releasedAt: nowMs } : r,
        );
        SimulatedBackend.setStorage("table_reservations", updatedReservations);
      }
      const updated = currentTables.map((t: any) =>
        t.id === id ? { ...t, ...body } : t,
      );
      SimulatedBackend.setStorage("tables", updated);
      return updated.find((t: any) => t.id === id);
    }
    if (path === "/pos/session") return session;
    if (path === "/pos/settings") {
      if (options?.method === "PATCH") {
        const update = JSON.parse(options.body || "{}");
        const next = { ...settings, ...update };
        SimulatedBackend.setStorage("settings", next);
        return next;
      }
      return settings;
    }

    if (path === "/pos/payment-instruments/vouchers") {
      const vouchers = SimulatedBackend.getStorage("restaurant_vouchers", []);
      if (options?.method === "POST") {
        const body = JSON.parse(options.body || "{}");
        const code = String(body.code || "").trim();
        const amount = Number(body.amount || 0);
        if (!code || amount <= 0) throw new Error("Invalid voucher payload");
        if (vouchers.some((v: any) => String(v.code) === code)) {
          throw new Error("Voucher code already exists");
        }
        const row = {
          id: `rv-${Date.now()}`,
          code,
          amount,
          remainingAmount: amount,
          status: "ACTIVE",
          issuedAt: Date.now(),
          usedAt: null,
        };
        const next = [row, ...vouchers];
        SimulatedBackend.setStorage("restaurant_vouchers", next);
        return row;
      }
      return vouchers;
    }

    if (path.startsWith("/pos/payment-instruments/vouchers/")) {
      const code = decodeURIComponent(path.split("/vouchers/")[1] || "");
      const vouchers = SimulatedBackend.getStorage("restaurant_vouchers", []);
      return vouchers.find((v: any) => String(v.code) === code) || null;
    }

    if (path === "/pos/payment-instruments/cards") {
      const cards = SimulatedBackend.getStorage("restaurant_cards", []);
      if (options?.method === "POST") {
        const body = JSON.parse(options.body || "{}");
        const code = String(body.code || "").trim();
        if (!code) throw new Error("Card code required");
        if (cards.some((c: any) => String(c.code) === code)) {
          throw new Error("Card code already exists");
        }
        const row = {
          id: `rc-${Date.now()}`,
          code,
          holderName: body.holderName ? String(body.holderName).trim() : null,
          balance: Number(body.initialBalance || 0),
          active: true,
          createdAt: Date.now(),
        };
        const next = [row, ...cards];
        SimulatedBackend.setStorage("restaurant_cards", next);
        if (Number(body.initialBalance || 0) > 0) {
          const moves = SimulatedBackend.getStorage("restaurant_card_movements", []);
          moves.unshift({
            id: `rcm-${Date.now()}`,
            cardCode: code,
            type: "CREDIT",
            amount: Number(body.initialBalance || 0),
            reference: "INITIAL_LOAD",
            createdAt: Date.now(),
          });
          SimulatedBackend.setStorage("restaurant_card_movements", moves);
        }
        return row;
      }
      return cards;
    }

    if (path.startsWith("/pos/payment-instruments/cards/")) {
      const tail = path.split("/cards/")[1] || "";
      const [rawCode, action] = tail.split("/");
      const code = decodeURIComponent(rawCode || "");
      const cards = SimulatedBackend.getStorage("restaurant_cards", []);
      const card = cards.find((c: any) => String(c.code) === code) || null;
      if (!action) return card;
      if (action === "topup" && options?.method === "POST") {
        if (!card) throw new Error("Card not found");
        const body = JSON.parse(options.body || "{}");
        const amount = Number(body.amount || 0);
        if (amount <= 0) throw new Error("Invalid topup amount");
        const updated = cards.map((c: any) =>
          String(c.code) === code ? { ...c, balance: Number(c.balance || 0) + amount } : c,
        );
        SimulatedBackend.setStorage("restaurant_cards", updated);
        const moves = SimulatedBackend.getStorage("restaurant_card_movements", []);
        moves.unshift({
          id: `rcm-${Date.now()}`,
          cardCode: code,
          type: "CREDIT",
          amount,
          reference: body.reference ? String(body.reference) : "TOPUP",
          createdAt: Date.now(),
        });
        SimulatedBackend.setStorage("restaurant_card_movements", moves);
        return updated.find((c: any) => String(c.code) === code) || null;
      }
      if (action === "movements") {
        const moves = SimulatedBackend.getStorage("restaurant_card_movements", []);
        return moves.filter((m: any) => String(m.cardCode) === code);
      }
    }

    if (path === "/pos/clients") {
      if (options?.method === "POST") {
        const body = JSON.parse(options.body || "{}");
        const clientPrefix = String(settings.clientPrefix || "CLI-").trim();
        const clientSequence = Number(settings.clientSequence || 0) + 1;
        const client = {
          id: `cli-${Date.now()}`,
          code: `${clientPrefix}${String(clientSequence).padStart(6, "0")}`,
          type: body.type === "COMPANY" ? "COMPANY" : "PERSON",
          name: String(body.name || "").trim(),
          email: body.email ? String(body.email).trim() : "",
          phone: body.phone ? String(body.phone).trim() : "",
          address: body.address ? String(body.address).trim() : "",
          cin: body.cin ? String(body.cin).trim() : undefined,
          birthDate: body.birthDate ? String(body.birthDate).trim() : undefined,
          taxId: body.taxId ? String(body.taxId).trim() : undefined,
        };
        const nextClients = [client, ...clients];
        SimulatedBackend.setStorage("clients", nextClients);
        SimulatedBackend.setStorage("settings", {
          ...settings,
          clientSequence,
        });
        return client;
      }
      return clients;
    }

    if (path === "/pos/suppliers" || path.startsWith("/pos/suppliers/")) {
      if (options?.method === "POST") {
        const body = JSON.parse(options.body || "{}");
        const supplierPrefix = "SUP-";
        const suppliers = SimulatedBackend.getStorage("suppliers", []);
        const supplier = {
          id: `sup-${Date.now()}`,
          code: `${supplierPrefix}${String(suppliers.length + 1).padStart(6, "0")}`,
          name: String(body.name || "").trim() || "Nouveau Fournisseur",
          contactName: body.contactName
            ? String(body.contactName).trim()
            : null,
          email: body.email ? String(body.email).trim() : null,
          phone: body.phone ? String(body.phone).trim() : null,
          address: body.address ? String(body.address).trim() : null,
          taxId: body.taxId ? String(body.taxId).trim() : null,
          createdAt: Date.now(),
        };
        const updated = [supplier, ...suppliers];
        SimulatedBackend.setStorage("suppliers", updated);
        return supplier;
      }

      if (options?.method === "PATCH") {
        const id = String((options?.url || path).split("/suppliers/")[1] || "");
        const body = JSON.parse(options.body || "{}");
        const suppliers = SimulatedBackend.getStorage("suppliers", []);
        const updated = suppliers.map((s: any) =>
          s.id === id
            ? {
                ...s,
                ...body,
                name: String(body.name || s.name || "").trim() || "Fournisseur",
              }
            : s,
        );
        SimulatedBackend.setStorage("suppliers", updated);
        return updated.find((s: any) => s.id === id);
      }

      if (options?.method === "DELETE") {
        const id = String((options?.url || path).split("/suppliers/")[1] || "");
        const suppliers = SimulatedBackend.getStorage("suppliers", []);
        const updated = suppliers.filter((s: any) => s.id !== id);
        SimulatedBackend.setStorage("suppliers", updated);
        return { ok: true };
      }

      return SimulatedBackend.getStorage("suppliers", []);
    }

    if (path.startsWith("/pos/clients/") && options?.method === "PATCH") {
      const id = path.split("/pos/clients/")[1];
      const body = JSON.parse(options.body || "{}");
      const nextClients = clients.map((client: any) =>
        client.id === id ? { ...client, ...body } : client,
      );
      SimulatedBackend.setStorage("clients", nextClients);
      return nextClients.find((client: any) => client.id === id) || null;
    }

    if (path.startsWith("/pos/clients/") && options?.method === "DELETE") {
      const id = path.split("/pos/clients/")[1];
      const used =
        orders.some((order: any) => order.clientId === id) ||
        invoices.some((invoice: any) => invoice.clientId === id);
      if (used)
        throw new Error(
          "Client linked to orders/invoices and cannot be deleted",
        );
      const nextClients = clients.filter((client: any) => client.id !== id);
      SimulatedBackend.setStorage("clients", nextClients);
      return { ok: true };
    }

    if (path === "/pos/invoices") {
      if (options?.method === "POST") {
        const body = JSON.parse(options.body || "{}");
        const orderIds = Array.isArray(body.orderIds)
          ? body.orderIds.map((id: any) => String(id))
          : [];
        if (orderIds.length === 0) throw new Error("No tickets selected");

        const isOrderPaid = (order: any) => {
          const status = String(order?.status || "").toUpperCase();
          if (status === OrderStatus.COMPLETED) return true;

          const total = Number(order?.total || 0);
          if (total <= 0) return false;

          const paidAmount = Number(order?.paidAmount || 0);
          if (paidAmount >= total) return true;

          const paymentsTotal = Array.isArray(order?.payments)
            ? order.payments.reduce(
                (sum: number, payment: any) =>
                  sum + Number(payment?.amount || 0),
                0,
              )
            : 0;
          return paymentsTotal >= total;
        };

        let clientId = body.clientId ? String(body.clientId) : "";
        let workingClients = [...clients];
        if (!clientId) {
          const c = body.client || {};
          if (!c.name) throw new Error("Client info required");
          const clientPrefix = String(settings.clientPrefix || "CLI-").trim();
          const clientSequence = Number(settings.clientSequence || 0) + 1;
          const createdClient = {
            id: `cli-${Date.now()}`,
            code: `${clientPrefix}${String(clientSequence).padStart(6, "0")}`,
            type: c.type === "COMPANY" ? "COMPANY" : "PERSON",
            name: String(c.name || "").trim(),
            email: c.email ? String(c.email).trim() : "",
            phone: c.phone ? String(c.phone).trim() : "",
            address: c.address ? String(c.address).trim() : "",
            cin: c.cin ? String(c.cin).trim() : undefined,
            birthDate: c.birthDate ? String(c.birthDate).trim() : undefined,
            taxId: c.taxId ? String(c.taxId).trim() : undefined,
          };
          clientId = createdClient.id;
          workingClients = [createdClient, ...workingClients];
          SimulatedBackend.setStorage("clients", workingClients);
          SimulatedBackend.setStorage("settings", {
            ...settings,
            clientSequence,
          });
        }

        const selectedOrders = orders.filter((order: any) =>
          orderIds.includes(order.id),
        );
        const unpaid = selectedOrders.find((order: any) => !isOrderPaid(order));
        if (unpaid)
          throw new Error("Only paid tickets can be transformed into invoice");
        const total = selectedOrders.reduce(
          (sum: number, order: any) => sum + Number(order.total || 0),
          0,
        );

        const invoicePrefix = String(settings.invoicePrefix || "INV-").trim();
        const invoiceSequence = Number(settings.invoiceSequence || 0) + 1;
        const invoice = {
          id: `inv-${Date.now()}`,
          code: `${invoicePrefix}${String(invoiceSequence).padStart(6, "0")}`,
          clientId,
          orderIds,
          total,
          createdAt: Date.now(),
        };

        const nextInvoices = [invoice, ...invoices];
        const updatedOrders = orders.map((order: any) =>
          orderIds.includes(order.id)
            ? {
                ...order,
                clientId,
                invoiceId: invoice.id,
                status: OrderStatus.INVOICED,
              }
            : order,
        );

        SimulatedBackend.setStorage("invoices", nextInvoices);
        SimulatedBackend.setStorage("orders", updatedOrders);
        SimulatedBackend.setStorage("settings", {
          ...settings,
          invoiceSequence,
        });

        return {
          invoice,
          orders: updatedOrders.filter((o: any) => orderIds.includes(o.id)),
        };
      }
      return invoices;
    }

    if (path.startsWith("/pos/invoices/") && options?.method === "PATCH") {
      const invoiceId = path.split("/pos/invoices/")[1];
      const body = JSON.parse(options.body || "{}");
      const existingInvoice = invoices.find(
        (invoice: any) => invoice.id === invoiceId,
      );
      if (!existingInvoice) throw new Error("Invoice not found");

      const isOrderPaid = (order: any) => {
        const status = String(order?.status || "").toUpperCase();
        if (status === OrderStatus.COMPLETED) return true;

        const total = Number(order?.total || 0);
        if (total <= 0) return false;

        const paidAmount = Number(order?.paidAmount || 0);
        if (paidAmount >= total) return true;

        const paymentsTotal = Array.isArray(order?.payments)
          ? order.payments.reduce(
              (sum: number, payment: any) => sum + Number(payment?.amount || 0),
              0,
            )
          : 0;
        return paymentsTotal >= total;
      };

      const nextOrderIds = Array.isArray(body.orderIds)
        ? body.orderIds.map((id: any) => String(id))
        : existingInvoice.orderIds;
      const clientId = body.clientId || existingInvoice.clientId;

      const selectedOrders = orders.filter((order: any) =>
        nextOrderIds.includes(order.id),
      );
      const unpaid = selectedOrders.find((order: any) => !isOrderPaid(order));
      if (unpaid)
        throw new Error("Only paid tickets can be transformed into invoice");
      const total = selectedOrders.reduce(
        (sum: number, order: any) => sum + Number(order.total || 0),
        0,
      );

      const oldOrderIds = Array.isArray(existingInvoice.orderIds)
        ? existingInvoice.orderIds
        : [];

      const nextOrders = orders.map((order: any) => {
        if (nextOrderIds.includes(order.id)) {
          return {
            ...order,
            clientId,
            invoiceId,
            status: OrderStatus.INVOICED,
          };
        }

        if (oldOrderIds.includes(order.id) && order.invoiceId === invoiceId) {
          return {
            ...order,
            invoiceId: null,
            status:
              String(order.status || "").toUpperCase() === OrderStatus.INVOICED
                ? OrderStatus.COMPLETED
                : order.status,
          };
        }

        return order;
      });

      const nextInvoices = invoices.map((invoice: any) =>
        invoice.id === invoiceId
          ? { ...invoice, clientId, orderIds: nextOrderIds, total }
          : invoice,
      );

      SimulatedBackend.setStorage("orders", nextOrders);
      SimulatedBackend.setStorage("invoices", nextInvoices);

      return {
        invoice: nextInvoices.find((invoice: any) => invoice.id === invoiceId),
        orders: nextOrders.filter((order: any) =>
          nextOrderIds.includes(order.id),
        ),
      };
    }

    if (path.startsWith("/pos/invoices/") && options?.method === "DELETE") {
      const invoiceId = path.split("/pos/invoices/")[1];
      const existingInvoice = invoices.find(
        (invoice: any) => invoice.id === invoiceId,
      );
      if (!existingInvoice) throw new Error("Invoice not found");

      const orderIds = Array.isArray(existingInvoice.orderIds)
        ? existingInvoice.orderIds
        : [];

      const nextOrders = orders.map((order: any) => {
        if (order.invoiceId !== invoiceId || !orderIds.includes(order.id)) {
          return order;
        }

        const status = String(order.status || "").toUpperCase();
        const total = Number(order.total || 0);
        const paidAmount = Number(order.paidAmount || 0);
        const paymentsTotal = Array.isArray(order.payments)
          ? order.payments.reduce(
              (sum: number, payment: any) => sum + Number(payment?.amount || 0),
              0,
            )
          : 0;

        let restoredStatus = order.status;
        if (status === OrderStatus.INVOICED) {
          if (total > 0 && (paidAmount >= total || paymentsTotal >= total)) {
            restoredStatus = OrderStatus.COMPLETED;
          } else if (paidAmount > 0 || paymentsTotal > 0) {
            restoredStatus = OrderStatus.PARTIAL;
          } else {
            restoredStatus = OrderStatus.PENDING;
          }
        }

        return {
          ...order,
          invoiceId: null,
          status: restoredStatus,
        };
      });

      const nextInvoices = invoices.filter(
        (invoice: any) => invoice.id !== invoiceId,
      );

      SimulatedBackend.setStorage("orders", nextOrders);
      SimulatedBackend.setStorage("invoices", nextInvoices);

      return {
        ok: true,
        invoiceId,
        orders: nextOrders.filter((order: any) => orderIds.includes(order.id)),
      };
    }

    if (path === "/pos/orders") {
      if (options?.method === "POST") {
        const body = JSON.parse(options.body);
        const prefix = String(
          settings.orderPrefix || settings.ticketPrefix || "",
        ).trim();
        const nextSequence = Number(settings.orderSequence || 0) + 1;
        const ticketNumber = `${prefix}${String(nextSequence).padStart(6, "0")}`;
        const newOrder = {
          ...body,
          id: `ord-${Date.now()}`,
          ticketNumber,
          status: OrderStatus.PENDING,
          createdAt: Date.now(),
          total: body.total || 0,
          discount: body.discount || 0,
          timbre: 1.0,
          serverName: body.serverName || null,
          serverId: body.serverId || null,
          shiftId: body.shiftId || null,
        };
        const updatedOrders = [...orders, newOrder];
        SimulatedBackend.setStorage("orders", updatedOrders);
        SimulatedBackend.setStorage("settings", {
          ...settings,
          orderSequence: nextSequence,
        });
        return newOrder;
      }
      return orders;
    }

    if (path.startsWith("/pos/shifts/active/")) {
      const userId = path.split("/pos/shifts/active/")[1];
      return (
        shifts
          .filter((s: any) => s.userId === userId && s.status === "OPEN")
          .sort(
            (a: any, b: any) => Number(b.openedAt) - Number(a.openedAt),
          )[0] || null
      );
    }

    if (path === "/pos/shifts/open" && options?.method === "POST") {
      const body = JSON.parse(options.body || "{}");
      if (String(body.role || "").toUpperCase() !== "SERVER") {
        throw new Error("Shift allowed for servers only");
      }
      const existing = shifts.find(
        (s: any) => s.userId === body.cashierId && s.status === "OPEN",
      );
      if (existing) return existing;
      const nowMs = Date.now();
      const shift = {
        id: `shift-${nowMs}`,
        userId: body.cashierId,
        userName: body.cashierName,
        role: body.role,
        openedAt: nowMs,
        closedAt: null,
        openingFund: Number(body.openingFund || 0),
        closingFund: 0,
        notes: body.notes || null,
        status: "OPEN",
      };
      SimulatedBackend.setStorage("shifts", [shift, ...shifts]);
      return shift;
    }

    if (path === "/pos/shifts/close" && options?.method === "POST") {
      const body = JSON.parse(options.body || "{}");
      const activeShift = body.shiftId
        ? shifts.find((s: any) => s.id === body.shiftId)
        : shifts.find(
            (s: any) => s.userId === body.userId && s.status === "OPEN",
          );
      if (!activeShift) return null;
      const activeOrders = orders.filter((o: any) => {
        const matchesShift = body.shiftId ? o.shiftId === body.shiftId : true;
        const matchesServer = body.userId ? o.serverId === body.userId : true;
        return (
          matchesShift &&
          matchesServer &&
          ![OrderStatus.COMPLETED, OrderStatus.CANCELLED].includes(o.status)
        );
      });
      if (activeOrders.length > 0) {
        throw new Error("Active orders still open");
      }
      const closed = {
        ...activeShift,
        status: "CLOSED",
        closedAt: Date.now(),
        closingFund: Number(body.closingFund || 0),
        notes: body.notes || activeShift.notes || null,
      };
      const updated = shifts.map((s: any) => (s.id === closed.id ? closed : s));
      SimulatedBackend.setStorage("shifts", updated);
      return closed;
    }

    if (path === "/pos/shifts") {
      return [...shifts].sort(
        (a: any, b: any) => Number(b.openedAt) - Number(a.openedAt),
      );
    }

    if (path === "/pos/shifts/summary") {
      return shifts
        .sort((a: any, b: any) => Number(b.openedAt) - Number(a.openedAt))
        .map((shift: any) => {
          const shiftOrders = orders.filter((o: any) => o.shiftId === shift.id);
          let totalSales = 0;
          let cashSales = 0;
          let cardSales = 0;
          let paidOrders = 0;
          let unpaidOrders = 0;
          const tableSet = new Set<string>();
          shiftOrders.forEach((order: any) => {
            const payments = Array.isArray(order.payments)
              ? order.payments
              : [];
            let paymentsTotal = 0;
            payments.forEach((payment: any) => {
              const amount = Number(payment.amount || 0);
              paymentsTotal += amount;
              totalSales += amount;
              if (payment.method === "CASH") cashSales += amount;
              if (payment.method === "BANK_CARD") cardSales += amount;
            });
            if (order.tableNumber) tableSet.add(String(order.tableNumber));
            const orderTotal = Number(order.total || 0);
            const isPaid =
              String(order.status || "").toUpperCase() === "COMPLETED" ||
              (orderTotal > 0 && paymentsTotal >= orderTotal);
            if (isPaid) paidOrders += 1;
            else unpaidOrders += 1;
          });
          return {
            shift,
            totals: {
              totalSales,
              cashSales,
              cardSales,
              orderCount: shiftOrders.length,
              paidOrders,
              unpaidOrders,
              tableCount: tableSet.size,
            },
          };
        });
    }

    if (path === "/pos/stock/movements") {
      if (options?.method === "POST") {
        const body = JSON.parse(options.body || "{}");
        const quantity = Number(body.quantity || 0);
        if (!body.productId || !body.type || quantity <= 0) return null;
        const productIndex = products.findIndex(
          (p: any) => p.id === body.productId,
        );
        if (productIndex < 0) return null;
        const product = products[productIndex];
        if (product.manageStock) {
          const delta = body.type === "IN" ? quantity : -quantity;
          if (body.variantId) {
            const variants = Array.isArray(product.variants)
              ? product.variants
              : [];
            const idx = variants.findIndex((v: any) => v.id === body.variantId);
            if (idx < 0) return null;
            const current = Number(variants[idx]?.stock || 0);
            const next = current + delta;
            if (next < 0) return null;
            variants[idx] = { ...variants[idx], stock: next };
            products[productIndex] = { ...product, variants };
          } else {
            const nextStock = Number(product.stock || 0) + delta;
            if (nextStock < 0) return null;
            products[productIndex] = { ...product, stock: nextStock };
          }
          SimulatedBackend.setStorage("products", products);
        }
        const movement = {
          id: `mov-${Date.now()}`,
          productId: body.productId,
          variantId: body.variantId || null,
          type: body.type,
          quantity,
          note: body.note || null,
          userName: body.userName || null,
          createdAt: Date.now(),
        };
        const updated = [movement, ...stockMovements];
        SimulatedBackend.setStorage("stock_movements", updated);
        return { movement, product: products[productIndex] };
      }
      return stockMovements;
    }

    if (path.startsWith("/pos/client/table/")) {
      const token = path.split("/pos/client/table/")[1];
      const table = currentTables.find((t: any) => t.token === token);
      if (!table) return null;
      const activeOrder = orders.find(
        (o: any) =>
          o.tableNumber === table.number &&
          o.zoneId === table.zoneId &&
          o.status !== OrderStatus.COMPLETED &&
          o.status !== OrderStatus.CANCELLED,
      );
      return {
        table: {
          id: table.id,
          number: table.number,
          zoneId: table.zoneId,
          capacity: table.capacity,
          status: table.status,
        },
        activeOrder: activeOrder || null,
      };
    }

    if (path.startsWith("/pos/client/orders")) {
      const queryIndex = path.indexOf("?");
      const query = queryIndex >= 0 ? path.slice(queryIndex + 1) : "";
      const params = new URLSearchParams(query);
      const token = params.get("token") || "";
      const table = currentTables.find((t: any) => t.token === token);
      if (!table) return [];
      if (options?.method === "POST") {
        const body = JSON.parse(options.body || "{}");
        const existing = orders.find(
          (o: any) =>
            o.tableNumber === table.number &&
            o.zoneId === table.zoneId &&
            o.status !== OrderStatus.COMPLETED &&
            o.status !== OrderStatus.CANCELLED,
        );
        if (existing) return existing;
        const newOrder = {
          ...body,
          id: `ord-${Date.now()}`,
          status: OrderStatus.PENDING,
          createdAt: Date.now(),
          total: body.total || 0,
          discount: body.discount || 0,
          timbre: 1.0,
          tableNumber: table.number,
          zoneId: table.zoneId,
          type: OrderType.DINE_IN,
          serverName: "CLIENT",
        };
        const updatedOrders = [...orders, newOrder];
        SimulatedBackend.setStorage("orders", updatedOrders);
        return newOrder;
      }
      return orders.filter(
        (o: any) =>
          o.tableNumber === table.number &&
          o.zoneId === table.zoneId &&
          o.status !== OrderStatus.COMPLETED &&
          o.status !== OrderStatus.CANCELLED,
      );
    }

    if (path.startsWith("/pos/client/orders/") && options?.method === "PATCH") {
      const id = path.split("/pos/client/orders/")[1];
      const body = JSON.parse(options.body || "{}");
      const table = currentTables.find((t: any) => t.token === body.token);
      if (!table) return null;
      const updatedOrders = orders.map((o: any) =>
        o.id === id &&
        o.tableNumber === table.number &&
        o.zoneId === table.zoneId
          ? { ...o, ...body }
          : o,
      );
      SimulatedBackend.setStorage("orders", updatedOrders);
      return updatedOrders.find((o: any) => o.id === id);
    }

    if (path.endsWith("/cancel") && path.startsWith("/pos/client/orders/")) {
      const id = path.split("/pos/client/orders/")[1].replace("/cancel", "");
      const body = JSON.parse(options.body || "{}");
      const table = currentTables.find((t: any) => t.token === body.token);
      if (!table) return null;
      const updatedOrders = orders.map((o: any) =>
        o.id === id &&
        o.tableNumber === table.number &&
        o.zoneId === table.zoneId
          ? { ...o, status: OrderStatus.CANCELLED }
          : o,
      );
      SimulatedBackend.setStorage("orders", updatedOrders);
      return updatedOrders.find((o: any) => o.id === id);
    }

    if (
      path.endsWith("/request-payment") &&
      path.startsWith("/pos/client/orders/")
    ) {
      return { ok: true };
    }

    if (path === "/pos/session/movement") {
      const movement = JSON.parse(options.body);
      session.movements = [
        ...(session.movements || []),
        { ...movement, id: `mv-${Date.now()}`, createdAt: Date.now() },
      ];
      SimulatedBackend.setStorage("session", session);
      return session;
    }

    if (path.startsWith("/pos/orders/")) {
      const id = path.split("/").pop();
      if (options?.method === "PATCH") {
        const update = JSON.parse(options.body);
        const updatedOrders = orders.map((o: any) =>
          o.id === id
            ? {
                ...o,
                ...update,
              }
            : o,
        );
        SimulatedBackend.setStorage("orders", updatedOrders);
        return updatedOrders.find((o: any) => o.id === id);
      }
    }

    if (path.startsWith("/pos/orders/") && path.endsWith("/payments")) {
      const id = path.split("/").slice(-2, -1)[0];
      if (options?.method === "POST") {
        const payment = JSON.parse(options.body || "{}");
        const vouchers = SimulatedBackend.getStorage("restaurant_vouchers", []);
        const cards = SimulatedBackend.getStorage("restaurant_cards", []);
        const cardMovements = SimulatedBackend.getStorage(
          "restaurant_card_movements",
          [],
        );

        // DEBUG: persist payment request payloads for troubleshooting
        try {
          const dbg = SimulatedBackend.getStorage("debug_payments", []);
          dbg.unshift({
            path,
            payload: payment,
            ts: Date.now(),
            stack: new Error().stack,
          });
          // keep only recent 200 entries
          SimulatedBackend.setStorage("debug_payments", dbg.slice(0, 200));
        } catch (e) {
          // don't break the simulated backend on logging failures
          try {
            console.error("Failed saving debug payment", e);
          } catch {}
        }

        // Helper to sum items by price*quantity
        const sumItems = (itemsArr: any[] = []) =>
          itemsArr.reduce(
            (s: number, it: any) =>
              s + Number((it.quantity || 0) * (it.price || it.unitPrice || 0)),
            0,
          );

        const updatedOrders = orders.map((o: any) => {
          if (o.id !== id) return o;

          const payments = Array.isArray(o.payments) ? [...o.payments] : [];

          // If items selected in payment, move those quantities into a ticket
          if (Array.isArray(payment.items) && payment.items.length > 0) {
            const existingItems = Array.isArray(o.items) ? [...o.items] : [];
            const paidItems: any[] = [];

            payment.items.forEach((sel: any) => {
              const idx = existingItems.findIndex(
                (ei: any) => String(ei.id) === String(sel.id),
              );
              if (idx < 0) return;
              const availQty = Number(existingItems[idx].quantity || 0);
              const payQty = Math.max(
                0,
                Math.min(availQty, Number(sel.quantity || 0)),
              );
              if (payQty <= 0) return;
              paidItems.push({ ...existingItems[idx], quantity: payQty });
              const remaining = availQty - payQty;
              if (remaining <= 0) existingItems.splice(idx, 1);
              else
                existingItems[idx] = {
                  ...existingItems[idx],
                  quantity: remaining,
                };
            });

            const itemsTotal = sumItems(paidItems);
            payments.push({
              method: payment.method,
              amount: itemsTotal,
              createdAt: payment.createdAt || Date.now(),
            });
            const paidAmount = Number(o.paidAmount || 0) + itemsTotal;
            const remainingTotal = sumItems(existingItems);

            // create ticket record for paid items
            try {
              const ticketPrefix = String(
                settings.ticketPrefix || "TK-",
              ).trim();
              const ticketSeq = Number(settings.ticketSequence || 0) + 1;
              const ticketCode = `${ticketPrefix}${String(ticketSeq).padStart(6, "0")}`;
              const ticket = {
                id: `tkt-${Date.now()}`,
                code: ticketCode,
                orderId: id,
                items: paidItems,
                total: itemsTotal,
                discount: 0,
                timbre: 0,
                createdAt: Date.now(),
              };
              const allTickets = [
                ticket,
                ...SimulatedBackend.getStorage("tickets", []),
              ];
              SimulatedBackend.setStorage("tickets", allTickets);
              SimulatedBackend.setStorage("settings", {
                ...settings,
                ticketSequence: ticketSeq,
              });
            } catch (err) {
              // ignore simulated ticket errors
            }

            return {
              ...o,
              items: existingItems,
              payments,
              paidAmount,
              total: remainingTotal,
              status:
                remainingTotal <= 0 || paidAmount >= Number(o.total || 0)
                  ? OrderStatus.COMPLETED
                  : OrderStatus.PARTIAL,
              paymentMethod:
                payments.length === 1 ? payment.method : PaymentMethod.SPLIT,
            };
          }

          // Fallback: pay by amount (no selected items)
          const amount = Number(payment.amount || 0);
          const method = String(payment.method || "").toUpperCase();
          const ref = String(payment.reference || "").trim();
          if (method === "RESTAURANT_TICKET") {
            const code = String(payment?.metadata?.voucherCode || ref || "").trim();
            const idx = vouchers.findIndex((v: any) => String(v.code) === code);
            if (idx < 0) throw new Error("Restaurant voucher not found");
            const remaining = Number(vouchers[idx]?.remainingAmount || 0);
            if (remaining < amount)
              throw new Error("Voucher amount is insufficient");
            vouchers[idx] = {
              ...vouchers[idx],
              remainingAmount: Math.max(0, remaining - amount),
              status:
                Math.max(0, remaining - amount) <= 0 ? "USED" : "ACTIVE",
              usedAt:
                Math.max(0, remaining - amount) <= 0
                  ? Date.now()
                  : vouchers[idx]?.usedAt || null,
            };
          }
          if (method === "RESTAURANT_CARD") {
            const code = String(payment?.metadata?.cardCode || ref || "").trim();
            const idx = cards.findIndex((c: any) => String(c.code) === code);
            if (idx < 0) throw new Error("Restaurant card not found");
            const balance = Number(cards[idx]?.balance || 0);
            if (balance < amount)
              throw new Error("Insufficient restaurant card balance");
            cards[idx] = { ...cards[idx], balance: Math.max(0, balance - amount) };
            cardMovements.unshift({
              id: `rcm-${Date.now()}`,
              cardCode: code,
              type: "DEBIT",
              amount,
              reference: ref || "PAYMENT",
              createdAt: Date.now(),
            });
          }
          payments.push({
            method: payment.method,
            amount,
            createdAt: payment.createdAt || Date.now(),
            reference: ref || undefined,
          });
          const paidAmount = Number(o.paidAmount || 0) + amount;
          const total = Number(o.total || 0);

          // create a ticket record for this payment (uses current order items)
          try {
            const ticketPrefix = String(settings.ticketPrefix || "TK-").trim();
            const ticketSeq = Number(settings.ticketSequence || 0) + 1;
            const ticketCode = `${ticketPrefix}${String(ticketSeq).padStart(6, "0")}`;
            const ticket = {
              id: `tkt-${Date.now()}`,
              code: ticketCode,
              orderId: id,
              items: Array.isArray(o.items) ? o.items : [],
              total: amount,
              discount: 0,
              timbre: 0,
              createdAt: Date.now(),
            };
            const allTickets = [
              ticket,
              ...SimulatedBackend.getStorage("tickets", []),
            ];
            SimulatedBackend.setStorage("tickets", allTickets);
            SimulatedBackend.setStorage("settings", {
              ...settings,
              ticketSequence: ticketSeq,
            });
          } catch (err) {
            // ignore
          }

          return {
            ...o,
            payments,
            paidAmount,
            status:
              paidAmount >= total ? OrderStatus.COMPLETED : OrderStatus.PARTIAL,
            paymentMethod:
              payments.length === 1 ? payment.method : PaymentMethod.SPLIT,
          };
        });

        SimulatedBackend.setStorage("orders", updatedOrders);
        SimulatedBackend.setStorage("restaurant_vouchers", vouchers);
        SimulatedBackend.setStorage("restaurant_cards", cards);
        SimulatedBackend.setStorage("restaurant_card_movements", cardMovements);

        // update session totals
        if (session.isOpen) {
          const amt =
            Array.isArray(payment.items) && payment.items.length > 0
              ? payment.items.reduce((s: number, it: any) => {
                  const ord = orders.find((o: any) => o.id === id);
                  const found = ord
                    ? (ord.items || []).find(
                        (oi: any) => String(oi.id) === String(it.id),
                      )
                    : null;
                  const price = found
                    ? Number(found.price || found.unitPrice || 0)
                    : 0;
                  return s + Number(it.quantity || 0) * price;
                }, 0)
              : Number(payment.amount || 0);
          session.totalSales += amt;
          if (payment.method === "CASH") session.cashSales += amt;
          else session.cardSales += amt;
          SimulatedBackend.setStorage("session", session);
        }

        return updatedOrders.find((o: any) => o.id === id);
      }
    }

    // Tickets endpoints (simulated)
    if (path.startsWith("/pos/orders/") && path.endsWith("/tickets")) {
      const orderId = path.split("/pos/orders/")[1].replace("/tickets", "");
      if (options?.method === "GET") {
        const all = SimulatedBackend.getStorage("tickets", []);
        return all.filter((t: any) => t.orderId === orderId);
      }
      if (options?.method === "POST") {
        const body = JSON.parse(options.body || "{}");
        const prefix = String(settings.ticketPrefix || "TK-").trim();
        const nextSequence = Number(settings.ticketSequence || 0) + 1;
        const code = `${prefix}${String(nextSequence).padStart(6, "0")}`;
        const ticket = {
          id: `tkt-${Date.now()}`,
          code,
          orderId,
          items: Array.isArray(body.items) ? body.items : [],
          total: Number(body.total || 0),
          discount: Number(body.discount || 0),
          timbre: Number(body.timbre || 0),
          createdAt: Date.now(),
        };
        const all = [ticket, ...SimulatedBackend.getStorage("tickets", [])];
        SimulatedBackend.setStorage("tickets", all);
        SimulatedBackend.setStorage("settings", {
          ...settings,
          ticketSequence: nextSequence,
        });
        return ticket;
      }
    }

    if (path === "/pos/session/open") {
      const { initialFund } = JSON.parse(options.body);
      const newSession = {
        id: `sess-${Date.now()}`,
        isOpen: true,
        openedAt: Date.now(),
        openingBalance: initialFund,
        cashSales: 0,
        cardSales: 0,
        totalSales: 0,
        movements: [],
      };
      SimulatedBackend.setStorage("session", newSession);
      return newSession;
    }

    if (path === "/pos/session/close") {
      const body = options?.body ? JSON.parse(options.body) : {};
      const closingBalance = Number(body.closingBalance ?? 0);
      const sess = SimulatedBackend.getStorage("session", null);
      if (sess && sess.isOpen) {
        SimulatedBackend.setStorage("session", {
          ...sess,
          isOpen: false,
          closedAt: Date.now(),
          closingBalance: Number.isFinite(closingBalance) ? closingBalance : 0,
          notes: body.notes ?? null,
        });
      } else {
        SimulatedBackend.setStorage("session", { isOpen: false });
      }
      return {
        isOpen: false,
        closingBalance: Number.isFinite(closingBalance) ? closingBalance : 0,
      };
    }

    if (path === "/pos/auth/login") {
      const { pin } = JSON.parse(options.body);
      if (pin === "1234")
        return {
          id: "u1",
          name: "Ahmed (Admin)",
          role: Role.ADMIN,
          pin: "1234",
        };
      if (pin === "0000")
        return {
          id: "u2",
          name: "Sami (Serveur)",
          role: Role.SERVER,
          pin: "0000",
          assignedZoneIds: ["z1"],
        };
      return null;
    }

    return [];
  },
};

interface POSContextType {
  products: Product[];
  categories: Category[];
  orders: Order[];
  zones: Zone[];
  tables: TableConfig[];
  promotions: Promotion[];
  allUsers: User[];
  warehouses: Warehouse[];
  session: PosSession | null;
  clients: Client[];
  invoices: Invoice[];
  printers: Printer[];
  funds: Fund[];
  stockMovements: StockMovement[];
  settings: AppSettings;
  currentUser: User | null;
  activeShift: Shift | null;
  activeFundSession: FundSession | null;
  activeOrder: Order | null;
  paymentRequests: PaymentRequest[];
  loading: boolean;
  isOffline: boolean;
  getActiveShift: (userId: string) => Promise<Shift | null>;
  getLatestOpenShift: () => Promise<Shift | null>;
  openShift: (data: {
    cashierId: string;
    cashierName: string;
    fundId?: string;
    fundName?: string;
    openedById?: string;
    openedByName?: string;
    role?: Role;
    notes?: string;
    openingFund?: number;
  }) => Promise<Shift | null>;
  closeShift: (data: {
    shiftId?: string;
    userId?: string;
    closingFund?: number;
    notes?: string;
  }) => Promise<Shift | null>;
  listShifts: () => Promise<Shift[]>;
  getShiftSummaries: () => Promise<ShiftSummary[]>;
  openSession: (initialFund: number) => Promise<void>;
  closeSession: (
    closingBalance: number,
    notes?: string | null,
  ) => Promise<void>;
  addCashMovement: (
    movement: Omit<CashMovement, "id" | "createdAt" | "userName">,
  ) => Promise<void>;
  createOrder: (order: Partial<Order>) => Promise<string>;
  updateOrder: (
    orderId: string,
    items: any[],
    total: number,
    discount?: number,
    print?: boolean,
    status?: OrderStatus,
    extras?: {
      timbre?: number;
      paymentMethod?: PaymentMethod;
      clientDisplayName?: string | null;
    },
  ) => Promise<void>;
  addOrderPayment: (
    orderId: string,
    method: PaymentMethod,
    amount: number,
    items?: { id: string; quantity: number }[],
    extras?: { reference?: string; metadata?: Record<string, unknown> },
  ) => Promise<Order | null>;
  addOrderPaymentsBatch: (
    orderId: string,
    lines: Array<{
      method: PaymentMethod;
      amount: number;
      items?: { id: string; quantity: number }[];
      reference?: string;
      metadata?: Record<string, unknown>;
    }>,
  ) => Promise<Order | null>;
  createRestaurantVoucher: (payload: {
    code: string;
    amount: number;
  }) => Promise<RestaurantVoucher>;
  getRestaurantVoucherByCode: (code: string) => Promise<RestaurantVoucher | null>;
  listRestaurantVouchers: () => Promise<RestaurantVoucher[]>;
  createRestaurantCard: (payload: {
    code: string;
    holderName?: string;
    initialBalance?: number;
  }) => Promise<RestaurantCard>;
  getRestaurantCardByCode: (code: string) => Promise<RestaurantCard | null>;
  listRestaurantCards: () => Promise<RestaurantCard[]>;
  topupRestaurantCard: (
    code: string,
    payload: { amount: number; reference?: string },
  ) => Promise<RestaurantCard>;
  listRestaurantCardMovements: (code: string) => Promise<RestaurantCardMovement[]>;
  testExternalRestaurantCardApi: (payload?: {
    enabled?: boolean;
    url?: string;
    token?: string;
    timeoutMs?: number;
    cardCode?: string;
    amount?: number;
  }) => Promise<{ ok: boolean; status: number; message?: string; response?: any }>;
  updateOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  refreshOrders: () => Promise<void>;
  /** Commandes pour les rapports (même règle terminal que les endpoints rapports). */
  fetchOrdersForReports: (
    terminalFilter: ReportTerminalFilter,
  ) => Promise<Order[]>;
  refreshStockMovements: () => Promise<void>;
  getCogsByOrderReport: (params?: {
    from?: number;
    to?: number;
  }) => Promise<CogsByOrderRow[]>;
  getCogsByDayReport: (params?: {
    from?: number;
    to?: number;
  }) => Promise<CogsByDayRow[]>;
  getProductProfitabilityReport: (params?: {
    from?: number;
    to?: number;
  }) => Promise<ProductProfitabilityRow[]>;
  getSalesSummaryReport: (params?: {
    from?: number;
    to?: number;
    serverId?: string;
    paymentMethod?: string;
    terminalFilter?: ReportTerminalFilter;
  }) => Promise<{
    period: { from: number | null; to: number | null };
    items: SalesSummaryRow[];
    totals: { ticketCount: number; revenue: number; averageTicket: number };
  }>;
  getSalesByProductReport: (params?: {
    from?: number;
    to?: number;
    categoryId?: string;
    serverId?: string;
    terminalFilter?: ReportTerminalFilter;
  }) => Promise<{
    period: { from: number | null; to: number | null };
    items: SalesByProductRow[];
    totals: { quantity: number; revenue: number };
  }>;
  getSalesByCategoryReport: (params?: {
    from?: number;
    to?: number;
    serverId?: string;
    terminalFilter?: ReportTerminalFilter;
  }) => Promise<{
    period: { from: number | null; to: number | null };
    items: SalesByCategoryRow[];
    totals: { quantity: number; revenue: number };
  }>;
  getSalesByServerReport: (params?: {
    from?: number;
    to?: number;
    terminalFilter?: ReportTerminalFilter;
  }) => Promise<{
    period: { from: number | null; to: number | null };
    items: SalesByServerRow[];
    totals: { ticketCount: number; revenue: number };
  }>;
  getSalesByPaymentMethodReport: (params?: {
    from?: number;
    to?: number;
    terminalFilter?: ReportTerminalFilter;
  }) => Promise<{
    period: { from: number | null; to: number | null };
    items: SalesByPaymentMethodRow[];
    totals: { ticketCount: number; revenue: number };
  }>;
  getSalesByTimeslotReport: (params?: {
    from?: number;
    to?: number;
    intervalMinutes?: number;
    terminalFilter?: ReportTerminalFilter;
  }) => Promise<{
    period: { from: number | null; to: number | null };
    intervalMinutes: number;
    items: SalesByTimeslotRow[];
    totals: { ticketCount: number; revenue: number };
  }>;
  getCashClosingReport: (params?: {
    from?: number;
    to?: number;
    fundId?: string;
    cashierId?: string;
    terminalFilter?: ReportTerminalFilter;
  }) => Promise<{
    period: { from: number | null; to: number | null };
    items: CashClosingRow[];
  }>;
  getTopCustomersReport: (params?: {
    from?: number;
    to?: number;
    limit?: number;
    terminalFilter?: ReportTerminalFilter;
  }) => Promise<{
    period: { from: number | null; to: number | null };
    items: TopCustomerRow[];
  }>;
  // Tickets
  createTicket: (orderId: string, payload: any) => Promise<any>;
  getTicketsByOrder: (orderId: string) => Promise<any>;
  printTicket: (ticketId: string) => Promise<void>;
  /** Ticket client (modèle Paramètres) sans ticket de paiement en base — commande en cours. */
  printOrderClientReceiptProvisional: (orderId: string) => Promise<void>;
  downloadTicketPdf: (ticketId: string) => Promise<void>;
  getClientTable: (
    token: string,
  ) => Promise<{ table: TableConfig; activeOrder: Order | null } | null>;
  getClientOrders: (token: string) => Promise<Order[]>;
  createClientOrder: (
    token: string,
    order: Partial<Order>,
  ) => Promise<Order | null>;
  updateClientOrder: (
    orderId: string,
    token: string,
    items: any[],
    total: number,
    discount?: number,
  ) => Promise<Order | null>;
  cancelClientOrder: (orderId: string, token: string) => Promise<Order | null>;
  requestClientPayment: (orderId: string, token: string) => Promise<boolean>;
  dismissPaymentRequest: (id: string) => void;
  addClient: (client: Omit<Client, "id">) => Promise<Client>;
  updateClient: (
    id: string,
    updates: Partial<Client>,
  ) => Promise<Client | null>;
  deleteClient: (id: string) => Promise<boolean>;
  generateInvoice: (clientId: string, orderIds: string[]) => Promise<void>;
  updateInvoice: (
    invoiceId: string,
    payload: { clientId?: string; orderIds: string[] },
  ) => Promise<void>;
  deleteInvoice: (invoiceId: string) => Promise<void>;
  loginByPin: (pin: string) => Promise<boolean>;
  logout: () => void;
  setActiveOrderById: (id: string | null) => void;
  addProduct: (product: Partial<Product>) => Promise<void>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  addCategory: (name: string, parentId?: string) => Promise<void>;
  updateCategory: (id: string, updates: Partial<Category>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  addPromotion: (promotion: Partial<Promotion>) => Promise<void>;
  updatePromotion: (id: string, updates: Partial<Promotion>) => Promise<void>;
  deletePromotion: (id: string) => Promise<void>;
  addUser: (user: Omit<User, "id">) => Promise<void>;
  updateUser: (id: string, updates: Partial<User>) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  listWarehouses: () => Promise<Warehouse[]>;
  createWarehouse: (payload: {
    code: string;
    name: string;
    branchId?: string | null;
  }) => Promise<Warehouse | null>;
  updateWarehouse: (
    id: string,
    payload: Partial<Pick<Warehouse, "code" | "name" | "branchId" | "isActive">>,
  ) => Promise<Warehouse | null>;
  deleteWarehouse: (id: string) => Promise<boolean>;
  addZone: (name: string) => Promise<void>;
  deleteZone: (id: string) => Promise<void>;
  patchZoneLayout: (
    id: string,
    updates: Partial<
      Pick<Zone, "planX" | "planY" | "planW" | "planH" | "planFill">
    >,
  ) => Promise<Zone | null>;
  addTable: (
    number: string,
    zoneId: string,
    capacity: number,
    plan?: Partial<
      Pick<
        TableConfig,
        "planX" | "planY" | "planW" | "planH" | "planShape"
      >
    >,
  ) => Promise<void>;
  patchTableLayout: (
    id: string,
    updates: Partial<
      Pick<
        TableConfig,
        "planX" | "planY" | "planW" | "planH" | "planShape"
      >
    >,
  ) => Promise<TableConfig | null>;
  updateTable: (
    id: string,
    updates: Partial<TableConfig>,
  ) => Promise<TableConfig | null>;
  getTableReservations: () => Promise<TableReservation[]>;
  deleteTable: (id: string) => Promise<void>;
  getFunds: () => Promise<Fund[]>;
  addFund: (fund: Partial<Fund>) => Promise<void>;
  updateFund: (id: string, updates: Partial<Fund>) => Promise<void>;
  deleteFund: (id: string) => Promise<void>;
  listFundSessions: (params?: {
    from?: number;
    to?: number;
    fundId?: string;
    cashierId?: string;
    status?: "OPEN" | "CLOSED";
  }) => Promise<FundSession[]>;
  getActiveFundSession: (params: {
    shiftId?: string;
    fundId?: string;
  }) => Promise<FundSession | null>;
  openFundSession: (data: {
    fundId: string;
    shiftId: string;
    cashierId: string;
    cashierName: string;
    openingBalance: number;
    notes?: string;
  }) => Promise<FundSession | null>;
  closeFundSession: (data: {
    sessionId: string;
    cashierId: string;
    closingBalance: number;
    notes?: string;
  }) => Promise<FundSession | null>;
  addFundMovement: (movement: {
    sessionId: string;
    type: "IN" | "OUT";
    amount: number;
    reason: string;
  }) => Promise<FundMovement | null>;
  getFundMovements: (sessionId: string) => Promise<FundMovement[]>;
  addPrinter: (
    name: string,
    type: string,
    bonProfile?: "kitchen" | "bar" | null,
  ) => Promise<void>;
  deletePrinter: (id: string) => Promise<void>;
  getDetectedPrinters: () => Promise<any[]>;
  printProductionTest: (opts: {
    station?: "KITCHEN" | "BAR";
    printerId?: string;
  }) => Promise<void>;
  addStockMovement: (movement: {
    productId: string;
    variantId?: string | null;
    type: "IN" | "OUT";
    quantity: number;
    note?: string;
  }) => Promise<boolean>;
  createStockDocument: (payload: {
    type: "ENTRY" | "OUT" | "TRANSFER" | "INVENTORY";
    supplierId?: string | null;
    externalRef?: string | null;
    documentDate?: number | null;
    note?: string;
    lines: {
      productId: string;
      quantity: number;
      movementType?: "IN" | "OUT";
      note?: string;
      unitCost?: number | null;
    }[];
  }) => Promise<StockDocument | null>;
  listStockDocuments: (params?: {
    from?: number;
    to?: number;
    type?: string;
  }) => Promise<StockDocument[]>;
  updateStockDocument: (
    id: string,
    payload: {
      type?: "ENTRY" | "OUT" | "TRANSFER" | "INVENTORY";
      note?: string;
      documentDate?: number | null;
      lines: {
        productId: string;
        quantity: number;
        movementType?: "IN" | "OUT";
        note?: string;
        unitCost?: number | null;
      }[];
    },
  ) => Promise<StockDocument | null>;
  deleteStockDocumentLine: (
    documentId: string,
    lineId: string,
  ) => Promise<StockDocument | null>;
  getProductMovementReport: (params?: {
    productId?: string;
    from?: number;
    to?: number;
  }) => Promise<ProductMovementRow[]>;
  updateSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
  uploadLogo: (file: File) => Promise<void>;
  uploadProductImage: (file: File) => Promise<string | null>;
  getPdfArchives: () => Promise<{
    baseDir: string;
    categories: Array<{
      category: string;
      path: string;
      files: Array<{
        name: string;
        relativePath: string;
        size: number;
        updatedAt: number;
      }>;
    }>;
  } | null>;
  downloadPdfArchiveFile: (relativePath: string) => Promise<void>;
  suppliers: Supplier[];
  refreshSuppliers: () => Promise<void>;
  createSupplier: (payload: Partial<Supplier>) => Promise<Supplier | null>;
  updateSupplier: (
    id: string,
    payload: Partial<Supplier>,
  ) => Promise<Supplier | null>;
  deleteSupplier: (id: string) => Promise<boolean>;
}

export const POSContext = createContext<POSContextType | undefined>(undefined);

export const POSProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [tables, setTables] = useState<TableConfig[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [session, setSession] = useState<PosSession | null>(null);
  const [activeFundSession, setActiveFundSession] =
    useState<FundSession | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const confirmResolverRef = useRef<((ok: boolean) => void) | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    label: string;
  }>({ open: false, label: "" });

  const hasClaim = useCallback(
    (claimId: string, fallbackRoles: Role[] = []) => {
      if (!currentUser) return false;
      if (currentUser.role === Role.ADMIN) return true;
      if (fallbackRoles.includes(currentUser.role)) return true;
      const claims = Array.isArray(currentUser.claims) ? currentUser.claims : [];
      return claims.includes(claimId);
    },
    [currentUser],
  );

  const requireClaim = useCallback(
    (claimId: string, fallbackRoles: Role[], deniedMessage: string) => {
      if (hasClaim(claimId, fallbackRoles)) return;
      notifyError(deniedMessage);
      throw new Error(deniedMessage);
    },
    [hasClaim],
  );

  const requireUserConfirmation = useCallback((label: string) => {
    return new Promise<void>((resolve, reject) => {
      setConfirmDialog({ open: true, label });
      confirmResolverRef.current = (ok: boolean) => {
        setConfirmDialog({ open: false, label: "" });
        if (ok) resolve();
        else reject(new Error("Action annulée"));
      };
    });
  }, []);

  const [settings, setSettings] = useState<AppSettings>(() => {
    const defaults: AppSettings = {
      companyType: CompanyType.FAST_FOOD,
      cashClosingModePreference: "AUTO",
      cashClosingMode: "INDEPENDENT",
      timbreValue: 1.0,
      tvaRate: 19,
      applyTvaToTicket: true,
      applyTvaToInvoice: true,
      applyTimbreToTicket: true,
      applyTimbreToInvoice: true,
      printPreviewOnValidate: false,
      touchUiMode: false,
      clientKdsDisplayMode: "STANDARD",
      clientKdsWallboardMinWidthPx: 1920,
      clientTicketPrintCopies: 1,
      clientTicketTemplate: "CLASSIC",
      receiptPdfDirectory: "",
      autoDownloadReceiptPdfOnClient: false,
      clientTicketLayout: {
        headerText: "",
        footerText: "Merci et à bientôt !",
        showLogo: true,
        showAddress: true,
        showPhone: true,
        showTaxId: true,
        showServer: true,
        showTable: true,
        showDate: true,
        showTicketNumber: true,
        showPriceHt: true,
        showTicketDiscount: true,
        showTimbre: true,
        showTva: true,
        showPriceTtc: true,
        showQrCode: false,
        showItemUnitPrice: true,
        showPaymentMethod: true,
        showTerminal: false,
        showClientName: false,
        showFiscalQrCode: false,
      },
      paymentSoundEnabled: true,
      currency: "DT",
      restaurantName: "AxiaFlex",
      logoUrl: "",
      phone: "",
      email: "",
      taxId: "",
      address: "",
      predefinedNotes: [
        "Sans Oignon",
        "Trés Épicé",
        "Bien Cuit",
        "Sans Sel",
        "Extra Sauce",
        "Allergie",
      ],
      terminalId: "",
      ticketPrefix: "TK-",
      invoicePrefix: "INV-",
      clientPrefix: "CLI-",
      stockDocumentPrefix: "SD-",
      productPrefix: "ART-",
      posDiscountPresets: [...DEFAULT_POS_DISCOUNT_PRESETS],
      externalRestaurantCardApi: {
        enabled: false,
        url: "",
        token: "",
        timeoutMs: 8000,
      },
      paymentEnabledMethods: [
        PaymentMethod.CASH,
        PaymentMethod.BANK_CARD,
        PaymentMethod.RESTAURANT_CARD,
        PaymentMethod.RESTAURANT_TICKET,
      ],
      kitchenBarPrintTemplates: {
        kitchen: {
          title: "BON CUISINE",
          footerText: "",
          showOrderRef: true,
          showTime: true,
          showTable: true,
          showServer: true,
          showItemQty: true,
          showItemNotes: true,
        },
        bar: {
          title: "BON BAR",
          footerText: "",
          showOrderRef: true,
          showTime: true,
          showTable: true,
          showServer: true,
          showItemQty: true,
          showItemNotes: true,
        },
      },
    };
    try {
      const raw = localStorage.getItem("axiaflex_settings");
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      const merged = { ...defaults, ...parsed };
      if (
        !Array.isArray(merged.posDiscountPresets) ||
        merged.posDiscountPresets.length === 0
      ) {
        merged.posDiscountPresets = [...DEFAULT_POS_DISCOUNT_PRESETS];
      }
      if (!merged.externalRestaurantCardApi) {
        merged.externalRestaurantCardApi = {
          enabled: false,
          url: "",
          token: "",
          timeoutMs: 8000,
        };
      }
      return merged;
    } catch {
      return defaults;
    }
  });

  const useSimulatedBackend = USE_SIMULATED_BACKEND;

  const apiFetch = useCallback(
    async (path: string, options?: any) => {
      // If using simulated backend, skip real API entirely
      if (useSimulatedBackend) {
        setIsOffline(true);
        return await SimulatedBackend.handleRequest(path, options);
      }

      try {
        const method = String(options?.method || "GET").toUpperCase();
        let fetchOptions = options || {};
        if (
          currentUser &&
          method !== "GET" &&
          method !== "HEAD" &&
          options?.body &&
          typeof options.body === "string"
        ) {
          try {
            const obj = JSON.parse(options.body) as Record<string, unknown>;
            if (obj && typeof obj === "object" && !Array.isArray(obj)) {
              if (obj.auditUserId == null && obj.auditUserName == null) {
                obj.auditUserId = currentUser.id;
                obj.auditUserName = currentUser.name;
                fetchOptions = { ...options, body: JSON.stringify(obj) };
              }
            }
          } catch {
            /* corps non JSON */
          }
        }
        const response = await fetch(`${API_BASE_URL}${path}`, {
          ...(fetchOptions || {}),
          ...(method === "GET" ? { cache: "no-store" as RequestCache } : {}),
        });
        if (!response.ok) {
          let errorMessage = `API Error (${response.status})`;
          try {
            const contentType = response.headers.get("content-type") || "";
            if (contentType.includes("application/json")) {
              const payload = await response.json();
              if (payload?.error) errorMessage = String(payload.error);
            } else {
              const text = await response.text();
              if (text) errorMessage = text;
            }
          } catch {
            // keep default message
          }
          throw new Error(errorMessage);
        }
        setIsOffline(false);
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          const text = await response.text().catch(() => "");
          if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
            throw new Error(
              "Réponse HTML reçue au lieu de JSON. Configurez VITE_API_URL vers l'URL backend (ex: https://api.example.com).",
            );
          }
          throw new Error(
            `Réponse API non JSON (${response.status}). Vérifiez VITE_API_URL et les routes backend.`,
          );
        }
        return await response.json();
      } catch (e) {
        setIsOffline(true);
        // If configured to use simulated backend, fallback; otherwise propagate error
        if (useSimulatedBackend) {
          return await SimulatedBackend.handleRequest(path, options);
        }
        throw e;
      }
    },
    [useSimulatedBackend, currentUser],
  );

  async function apiFetchTyped<Path extends keyof ApiResponseMap>(
    path: Path,
    options?: any,
  ): Promise<ApiResponseMap[Path]> {
    return (await apiFetch(String(path), options)) as ApiResponseMap[Path];
  }

  function buildPath(
    template: string,
    params?: Record<string, string | number>,
  ) {
    if (!params) return template;
    return template.replace(/:([a-zA-Z0-9_]+)/g, (_, key) =>
      String(params[key] ?? ""),
    );
  }

  async function apiFetchTypedPath<Path extends keyof ApiResponseMap>(
    template: Path,
    params?: Record<string, string | number>,
    options?: any,
  ): Promise<ApiResponseMap[Path]> {
    const path = buildPath(String(template), params);
    return (await apiFetch(path, options)) as ApiResponseMap[Path];
  }

  // Tickets
  async function getTicketsByOrder(orderId: string) {
    return await apiFetchTypedPath("/pos/orders/:orderId/tickets" as any, {
      orderId,
    });
  }
  async function createTicket(orderId: string, payload: any) {
    return await apiFetchTypedPath(
      "/pos/orders/:id/tickets" as any,
      { id: orderId },
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {}),
      },
    );
  }
  async function printTicket(ticketId: string) {
    await apiFetchTypedPath("/pos/tickets/:id/print" as any, { id: ticketId }, {
      method: "POST",
    });
  }
  async function printOrderClientReceiptProvisional(orderId: string) {
    if (useSimulatedBackend) return;
    await apiFetchTypedPath(
      "/pos/orders/:id/print-client-receipt" as any,
      { id: orderId },
      { method: "POST" },
    );
  }
  async function downloadTicketPdf(ticketId: string) {
    const path = buildPath("/pos/tickets/:id/pdf", { id: ticketId });
    if (useSimulatedBackend) {
      const blob = new Blob(
        [
          `%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\nTicket: ${ticketId}\nDate: ${new Date().toISOString()}\n`,
        ],
        { type: "application/pdf" },
      );
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ticket-${ticketId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      return;
    }
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: "GET",
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Téléchargement PDF impossible (${response.status})`);
    }
    const blob = await response.blob();
    const disposition = response.headers.get("content-disposition") || "";
    const match = disposition.match(/filename="([^"]+)"/i);
    const fileName = match?.[1] || `ticket-${ticketId}.pdf`;
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }
  async function getPdfArchives() {
    return (await apiFetch("/pos/settings/pdf-archives")) as {
      baseDir: string;
      categories: Array<{
        category: string;
        path: string;
        files: Array<{
          name: string;
          relativePath: string;
          size: number;
          updatedAt: number;
        }>;
      }>;
    };
  }
  async function downloadPdfArchiveFile(relativePath: string) {
    const safePath = String(relativePath || "").trim();
    if (!safePath) return;
    const response = await fetch(
      `${API_BASE_URL}/pos/settings/pdf-archives/download?path=${encodeURIComponent(safePath)}`,
      {
        method: "GET",
        cache: "no-store",
      },
    );
    if (!response.ok) throw new Error(`Téléchargement impossible (${response.status})`);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = safePath.split(/[\\/]/).pop() || "archive.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }

  async function getOrderById(id: string) {
    return await apiFetchTypedPath("/pos/orders/:id", { id });
  }

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [p, c, z, t, o, s, u, promo, setts, pr, sm, f, cl, inv, sup, wh] =
          await Promise.all([
            apiFetchTyped("/pos/products"),
            apiFetchTyped("/pos/categories"),
            apiFetchTyped("/pos/zones"),
            apiFetchTyped("/pos/tables"),
            apiFetchTyped("/pos/orders"),
            apiFetchTyped("/pos/session"),
            apiFetchTyped("/pos/users"),
            apiFetchTyped("/pos/promotions"),
            apiFetchTyped("/pos/settings"),
            apiFetchTyped("/pos/printers"),
            apiFetchTyped("/pos/stock/movements"),
            apiFetchTyped("/pos/funds"),
            apiFetchTyped("/pos/clients"),
            apiFetchTyped("/pos/invoices"),
            apiFetchTyped("/pos/suppliers"),
            apiFetchTyped("/pos/stock/warehouses" as any),
          ]);
        setProducts(p || []);
        setCategories(c || []);
        setZones(z || []);
        setTables(t || []);
        setOrders((o || []).map(normalizeOrderFromApi));
        setSession(s?.isOpen ? s : null);
        setActiveFundSession(fundSessionFromPosApiSession(s));
        setAllUsers(u || []);
        setPromotions(promo || []);
        setSettings((prev) => {
          const next = { ...prev, ...setts } as AppSettings;
          if (
            !Array.isArray(next.posDiscountPresets) ||
            next.posDiscountPresets.length === 0
          ) {
            next.posDiscountPresets = [...DEFAULT_POS_DISCOUNT_PRESETS];
          }
          if (!next.externalRestaurantCardApi) {
            next.externalRestaurantCardApi = {
              enabled: false,
              url: "",
              token: "",
              timeoutMs: 8000,
            };
          }
          const pref = next.cashClosingModePreference ?? "AUTO";
          const resolvedEffective: "INDEPENDENT" | "SHIFT_HANDOVER" =
            pref === "INDEPENDENT"
              ? "INDEPENDENT"
              : pref === "SHIFT_HANDOVER"
                ? "SHIFT_HANDOVER"
                : next.companyType === CompanyType.RESTAURANT_CAFE
                  ? "SHIFT_HANDOVER"
                  : "INDEPENDENT";
          if (!next.cashClosingMode) {
            next.cashClosingMode = resolvedEffective;
          }
          return next;
        });
        setPrinters(pr || []);
        setStockMovements(sm || []);
        setFunds(f || []);
        setClients(cl || []);
        setInvoices(inv || []);
        setSuppliers(sup || []);
        setWarehouses(wh || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const loginByPin = async (pin: string): Promise<boolean> => {
    const user = await apiFetchTypedPath("/pos/auth/login", undefined, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    if (!user) return false;
    setCurrentUser(user as User);
    const u = user as User;
    try {
      const shift =
        u.role === Role.SERVER
          ? await getActiveShift(u.id)
          : await getLatestOpenShift();
      setActiveShift(shift || null);
      const sess = await apiFetchTyped("/pos/session");
      let fund = fundSessionFromPosApiSession(sess);
      let nextSession: PosSession | null = sess?.isOpen ? sess : null;

      // Repli si /pos/session est resté fermé alors qu’une session caisse existe (ex. décalage terminalId).
      if (!fund && shift?.id) {
        try {
          const fs = (await apiFetch(
            `/pos/fund-sessions/active?shiftId=${encodeURIComponent(shift.id)}`,
          )) as any;
          if (fs?.id && String(fs.status ?? "").toUpperCase() === "OPEN") {
            fund = fundSessionFromPosApiSession({
              ...fs,
              isOpen: true,
            });
            const retry = await apiFetchTyped("/pos/session");
            if (retry?.isOpen) {
              nextSession = retry;
              fund = fundSessionFromPosApiSession(retry) ?? fund;
            } else {
              nextSession = { ...fs, isOpen: true, movements: [] } as PosSession;
            }
          }
        } catch {
          /* ignore */
        }
      }

      setSession(nextSession);
      setActiveFundSession(fund);
    } catch {
      setActiveShift(null);
      setActiveFundSession(null);
    }
    return true;
  };

  // helper: insert or replace single order in state (dedupe by id)
  const upsertOrder = (order: Order) => {
    const normalized = normalizeOrderFromApi(order);
    setOrders((prev) => {
      const idx = prev.findIndex((o) => o.id === normalized.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = normalized;
        return copy;
      }
      return [...prev, normalized];
    });
  };

  const createOrder = async (order: Partial<Order>) => {
    requireClaim(
      "action:pos.order.create",
      [Role.MANAGER, Role.CASHIER, Role.SERVER],
      "Acces refuse: vous ne pouvez pas creer une commande.",
    );
    // On retire les ids temporaires des items (cart-...) pour laisser le backend générer les UUID
    const cleanItems = Array.isArray(order.items)
      ? order.items.map(({ id, ...rest }) => rest)
      : undefined;
    const orderData = {
      ...order,
      items: cleanItems,
      terminalId: settings.terminalId || null,
      serverId: order.serverId || currentUser?.id,
      serverName: order.serverName || currentUser?.name || null,
      shiftId: order.shiftId || activeShift?.id || null,
    } as any;
    const saved = (await apiFetchTyped("/pos/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderData),
    })) as any;
    if (!saved) throw new Error("Failed to create order");
    upsertOrder(saved as Order);
    return (saved.id as string) || "";
  };

  const updateOrder = async (
    orderId: string,
    items: any[],
    total: number,
    discount: number = 0,
    print: boolean = false,
    status?: OrderStatus,
    extras?: {
      timbre?: number;
      paymentMethod?: PaymentMethod;
      clientDisplayName?: string | null;
    },
  ) => {
    await requireUserConfirmation("Modifier la commande");
    const existingOrder = orders.find((o) => o.id === orderId);
    const nextItems = Array.isArray(items) ? items : [];
    if (Number(discount || 0) > 0) {
      requireClaim(
        "action:pos.discount.apply",
        [Role.MANAGER, Role.CASHIER],
        "Acces refuse: vous ne pouvez pas appliquer une remise.",
      );
    }
    if (existingOrder && nextItems.length < (existingOrder.items || []).length) {
      requireClaim(
        "action:pos.order.line.cancel",
        [Role.MANAGER, Role.CASHIER],
        "Acces refuse: vous ne pouvez pas annuler une ligne.",
      );
    }
    if (
      status === OrderStatus.CANCELLED ||
      (existingOrder && Number(total || 0) <= 0)
    ) {
      requireClaim(
        "action:pos.order.cancel.full",
        [Role.MANAGER, Role.CASHIER],
        "Acces refuse: vous ne pouvez pas annuler la commande complete.",
      );
      if (existingOrder && existingOrder.status !== OrderStatus.PENDING) {
        requireClaim(
          "action:pos.order.cancel.after_validation",
          [Role.MANAGER],
          "Acces refuse: annulation apres validation interdite.",
        );
      }
      const hasPreparedItem = (existingOrder?.items || []).some((it: any) => {
        const prep = String(it?.prepStatus || "").toUpperCase();
        return prep && prep !== "PENDING";
      });
      if (hasPreparedItem) {
        requireClaim(
          "action:pos.order.cancel.after_preparation",
          [Role.MANAGER],
          "Acces refuse: annulation apres preparation interdite.",
        );
      }
    }
    const body: Record<string, unknown> = {
      items,
      total,
      discount,
      print,
      status,
      terminalId: settings.terminalId || null,
    };
    if (extras?.timbre !== undefined) body.timbre = extras.timbre;
    if (extras?.paymentMethod !== undefined)
      body.paymentMethod = extras.paymentMethod;
    if (extras?.clientDisplayName !== undefined)
      body.clientDisplayName = extras.clientDisplayName;

    const updated = await apiFetchTypedPath(
      "/pos/orders/:id",
      { id: orderId },
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const normalized = normalizeOrderFromApi(updated);
    setOrders((prev) => prev.map((o) => (o.id === orderId ? normalized : o)));
  };

  const addOrderPayment = async (
    orderId: string,
    method: PaymentMethod,
    amount: number,
    items?: { id: string; quantity: number }[],
    extras?: { reference?: string; metadata?: Record<string, unknown> },
  ): Promise<Order | null> => {
    const normalizedReference = String(extras?.reference || "").trim();
    const normalizedMetadata: Record<string, unknown> = {
      ...(extras?.metadata || {}),
    };
    if (method === PaymentMethod.RESTAURANT_CARD && normalizedReference) {
      normalizedMetadata.cardCode = normalizedReference;
    }
    if (method === PaymentMethod.RESTAURANT_TICKET && normalizedReference) {
      normalizedMetadata.voucherCode = normalizedReference;
    }
    // Si items est fourni, utiliser le endpoint paiement partiel
    if (Array.isArray(items) && items.length > 0) {
      const sanitizedItems = items
        .map(({ id, quantity }) => ({
          id: String(id || "").trim(),
          quantity: Number(quantity || 0),
        }))
        .filter((row) => isUuidLike(row.id) && row.quantity > 0);

      // Les ids temporaires frontend (ex: cart-...) ne doivent jamais partir vers l'API SQL.
      if (sanitizedItems.length === 0) {
        items = undefined;
      } else {
        items = sanitizedItems;
      }
    }
    if (Array.isArray(items) && items.length > 0) {
      const payload = {
        orderId,
        items: items.map(({ id, quantity }) => ({ orderItemId: id, quantity })),
        paymentMethod: method,
      };
      const result = await postPartialPayment(payload);
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? normalizeOrderFromApi({
                ...o,
                items: result.updatedItems,
              })
            : o,
        ),
      );
      return { ...result, id: orderId } as Order;
    }
    // Sinon, fallback sur l'ancien endpoint
    const payload: any = {
      method,
      amount,
      createdAt: Date.now(),
      reference: normalizedReference || undefined,
      metadata: normalizedMetadata,
    };
    const updated = await apiFetchTypedPath(
      "/pos/orders/:id/payments",
      { id: orderId },
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    if (!updated) return null;
    const paidNorm = normalizeOrderFromApi(updated);
    setOrders((prev) => prev.map((o) => (o.id === orderId ? paidNorm : o)));
    const s = await apiFetchTyped("/pos/session");
    setSession(s?.isOpen ? s : null);
    setActiveFundSession(fundSessionFromPosApiSession(s));
    const paidSt = String(paidNorm.status ?? "").toUpperCase();
    if (paidSt === "COMPLETED" || paidSt === "INVOICED") {
      try {
        const t = await apiFetchTyped("/pos/tables");
        setTables(t || []);
      } catch {
        /* ignore */
      }
    }
    return paidNorm;
  };

  const addOrderPaymentsBatch = async (
    orderId: string,
    lines: Array<{
      method: PaymentMethod;
      amount: number;
      items?: { id: string; quantity: number }[];
      reference?: string;
      metadata?: Record<string, unknown>;
    }>,
  ): Promise<Order | null> => {
    const payloadLines = (Array.isArray(lines) ? lines : [])
      .map((line) => {
        const normalizedReference = String(line.reference || "").trim();
        const normalizedMetadata: Record<string, unknown> = {
          ...(line.metadata || {}),
        };
        if (line.method === PaymentMethod.RESTAURANT_CARD && normalizedReference) {
          normalizedMetadata.cardCode = normalizedReference;
        }
        if (line.method === PaymentMethod.RESTAURANT_TICKET && normalizedReference) {
          normalizedMetadata.voucherCode = normalizedReference;
        }
        let sanitizedItems = Array.isArray(line.items) ? line.items : undefined;
        if (Array.isArray(sanitizedItems) && sanitizedItems.length > 0) {
          const cleaned = sanitizedItems
            .map(({ id, quantity }) => ({
              id: String(id || "").trim(),
              quantity: Number(quantity || 0),
            }))
            .filter((row) => isUuidLike(row.id) && row.quantity > 0);
          sanitizedItems = cleaned.length > 0 ? cleaned : undefined;
        }
        return {
          method: line.method,
          amount: Number(line.amount || 0),
          createdAt: Date.now(),
          items: sanitizedItems,
          reference: normalizedReference || undefined,
          metadata: normalizedMetadata,
        };
      })
      .filter((line) => Number.isFinite(line.amount) && line.amount > 0);

    if (payloadLines.length === 0) return null;
    const updated = await apiFetchTypedPath(
      "/pos/orders/:id/payments/batch",
      { id: orderId },
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: payloadLines }),
      },
    );
    if (!updated) return null;
    const paidNorm = normalizeOrderFromApi(updated);
    setOrders((prev) => prev.map((o) => (o.id === orderId ? paidNorm : o)));
    const s = await apiFetchTyped("/pos/session");
    setSession(s?.isOpen ? s : null);
    setActiveFundSession(fundSessionFromPosApiSession(s));
    const paidSt = String(paidNorm.status ?? "").toUpperCase();
    if (paidSt === "COMPLETED" || paidSt === "INVOICED") {
      try {
        const t = await apiFetchTyped("/pos/tables");
        setTables(t || []);
      } catch {
        /* ignore */
      }
    }
    return paidNorm;
  };

  const createRestaurantVoucher = async (payload: {
    code: string;
    amount: number;
  }) => {
    return (await apiFetchTyped("/pos/payment-instruments/vouchers" as any, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })) as RestaurantVoucher;
  };

  const getRestaurantVoucherByCode = async (code: string) => {
    if (!String(code || "").trim()) return null;
    return (await apiFetchTypedPath(
      "/pos/payment-instruments/vouchers/:code" as any,
      { code: String(code).trim() },
    )) as RestaurantVoucher | null;
  };

  const listRestaurantVouchers = async () => {
    const rows = (await apiFetchTyped(
      "/pos/payment-instruments/vouchers" as any,
    )) as RestaurantVoucher[];
    return rows || [];
  };

  const createRestaurantCard = async (payload: {
    code: string;
    holderName?: string;
    initialBalance?: number;
  }) => {
    return (await apiFetchTyped("/pos/payment-instruments/cards" as any, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })) as RestaurantCard;
  };

  const getRestaurantCardByCode = async (code: string) => {
    if (!String(code || "").trim()) return null;
    return (await apiFetchTypedPath(
      "/pos/payment-instruments/cards/:code" as any,
      { code: String(code).trim() },
    )) as RestaurantCard | null;
  };

  const listRestaurantCards = async () => {
    const rows = (await apiFetchTyped(
      "/pos/payment-instruments/cards" as any,
    )) as RestaurantCard[];
    return rows || [];
  };

  const topupRestaurantCard = async (
    code: string,
    payload: { amount: number; reference?: string },
  ) => {
    return (await apiFetchTypedPath(
      "/pos/payment-instruments/cards/:code/topup" as any,
      { code: String(code).trim() },
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    )) as RestaurantCard;
  };

  const listRestaurantCardMovements = async (code: string) => {
    if (!String(code || "").trim()) return [];
    const rows = (await apiFetchTypedPath(
      "/pos/payment-instruments/cards/:code/movements" as any,
      { code: String(code).trim() },
    )) as RestaurantCardMovement[];
    return rows || [];
  };

  const testExternalRestaurantCardApi = async (payload?: {
    enabled?: boolean;
    url?: string;
    token?: string;
    timeoutMs?: number;
    cardCode?: string;
    amount?: number;
  }) => {
    return (await apiFetchTyped(
      "/pos/payment-instruments/external-card/test" as any,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {}),
      },
    )) as { ok: boolean; status: number; message?: string; response?: any };
  };

  const openSession = async (initialFund: number) => {
    const s = await apiFetchTyped("/pos/session/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initialFund }),
    });
    setSession(s?.isOpen ? s : null);
    setActiveFundSession(fundSessionFromPosApiSession(s));
  };

  const closeSession = async (
    closingBalance: number,
    notes?: string | null,
  ) => {
    await apiFetchTyped("/pos/session/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        closingBalance,
        ...(notes != null && String(notes).trim() !== ""
          ? { notes: String(notes).trim() }
          : {}),
      }),
    });
    setSession(null);
    setActiveFundSession(null);
  };

  const addCashMovement = async (
    movement: Omit<CashMovement, "id" | "createdAt" | "userName">,
  ) => {
    try {
      const payload = {
        ...movement,
        userName: currentUser?.name || null,
      } as any;
      const saved = await apiFetchTyped("/pos/session/movement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (saved) {
        const sess = await apiFetchTyped("/pos/session");
        setSession(sess?.isOpen ? sess : null);
        setActiveFundSession(fundSessionFromPosApiSession(sess));
      }
    } catch (err) {
      // ignore errors here; caller may show notification
      console.error(err);
    }
  };

  const getActiveShift = async (userId: string) => {
    return (
      (await apiFetchTypedPath("/pos/shifts/active/:userId", { userId })) ||
      null
    );
  };

  const getLatestOpenShift = async () => {
    return (await apiFetchTyped("/pos/shifts/active")) || null;
  };

  const openShift = async (data: {
    cashierId: string;
    cashierName: string;
    fundId?: string;
    fundName?: string;
    openedById?: string;
    openedByName?: string;
    role?: Role;
    notes?: string;
    openingFund?: number;
  }) => {
    const shift = await apiFetchTyped("/pos/shifts/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (currentUser && data.cashierId === currentUser.id) {
      setActiveShift(shift || null);
    }
    return shift as Shift | null;
  };

  const closeShift = async (data: {
    shiftId?: string;
    userId?: string;
    closingFund?: number;
    notes?: string;
  }) => {
    const shift = await apiFetchTyped("/pos/shifts/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const isCurrentUserShift = Boolean(
      (data.shiftId && activeShift?.id === data.shiftId) ||
      (data.userId && currentUser?.id === data.userId),
    );
    if (isCurrentUserShift) {
      setActiveShift(null);
    }
    try {
      const sess = await apiFetchTyped("/pos/session");
      setSession(sess?.isOpen ? sess : null);
      setActiveFundSession(fundSessionFromPosApiSession(sess));
    } catch {
      setSession(null);
      setActiveFundSession(null);
    }
    return shift as Shift | null;
  };

  const getShiftSummaries = useCallback(async () => {
    return (await apiFetchTyped("/pos/shifts/summary")) || [];
  }, [apiFetch]);

  const listShifts = useCallback(async () => {
    return (await apiFetchTyped("/pos/shifts")) || [];
  }, [apiFetch]);

  const getFunds = useCallback(async () => {
    const list = (await apiFetchTyped("/pos/funds")) || [];
    setFunds(list);
    return list as Fund[];
  }, [apiFetch]);

  const addFund = async (fund: Partial<Fund>) => {
    requireClaim(
      "action:cash.manage",
      [Role.MANAGER, Role.CASHIER],
      "Acces refuse: gestion des caisses interdite.",
    );
    const saved = await apiFetchTyped("/pos/funds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fund),
    });
    if (saved) setFunds((prev) => [...prev, saved]);
  };

  const updateFund = async (id: string, updates: Partial<Fund>) => {
    await requireUserConfirmation("Modifier la caisse");
    requireClaim(
      "action:cash.manage",
      [Role.MANAGER, Role.CASHIER],
      "Acces refuse: gestion des caisses interdite.",
    );
    const saved = await apiFetchTypedPath(
      "/pos/funds/:id",
      { id },
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      },
    );
    if (!saved) return;
    setFunds((prev) => prev.map((f) => (f.id === id ? saved : f)));
  };

  const deleteFund = async (id: string) => {
    await requireUserConfirmation("Supprimer la caisse");
    requireClaim(
      "action:cash.manage",
      [Role.MANAGER, Role.CASHIER],
      "Acces refuse: gestion des caisses interdite.",
    );
    await apiFetchTypedPath("/pos/funds/:id", { id }, { method: "DELETE" });
    setFunds((prev) => prev.filter((f) => f.id !== id));
  };

  const listFundSessions = useCallback(
    async (params?: {
      from?: number;
      to?: number;
      fundId?: string;
      cashierId?: string;
      status?: "OPEN" | "CLOSED";
    }) => {
      const query = new URLSearchParams();
      if (params?.from) query.set("from", String(params.from));
      if (params?.to) query.set("to", String(params.to));
      if (params?.fundId) query.set("fundId", params.fundId);
      if (params?.cashierId) query.set("cashierId", params.cashierId);
      if (params?.status) query.set("status", params.status);
      const suffix = query.toString();
      return (
        ((await apiFetch(
          `/pos/fund-sessions${suffix ? `?${suffix}` : ""}`,
        )) as FundSession[]) || []
      );
    },
    [apiFetch],
  );

  const getActiveFundSession = async (params: {
    shiftId?: string;
    fundId?: string;
  }) => {
    const query = new URLSearchParams();
    if (params.shiftId) query.set("shiftId", params.shiftId);
    if (params.fundId) query.set("fundId", params.fundId);
    const suffix = query.toString();
    return (
      ((await apiFetch(
        `/pos/fund-sessions/active${suffix ? `?${suffix}` : ""}`,
      )) as FundSession) || null
    );
  };

  const openFundSession = async (data: {
    fundId: string;
    shiftId: string;
    cashierId: string;
    cashierName: string;
    openingBalance: number;
    notes?: string;
  }) => {
    const saved = await apiFetchTyped("/pos/fund-sessions/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    try {
      const sess = await apiFetchTyped("/pos/session");
      setSession(sess?.isOpen ? sess : null);
      setActiveFundSession(
        fundSessionFromPosApiSession(sess) ?? (saved as FundSession | null),
      );
    } catch {
      setActiveFundSession((saved as FundSession | null) || null);
    }
    return saved as FundSession | null;
  };

  const closeFundSession = async (data: {
    sessionId: string;
    cashierId: string;
    closingBalance: number;
    notes?: string;
  }) => {
    const saved = await apiFetchTyped("/pos/fund-sessions/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    try {
      const sess = await apiFetchTyped("/pos/session");
      setSession(sess?.isOpen ? sess : null);
      setActiveFundSession(fundSessionFromPosApiSession(sess));
    } catch {
      setSession(null);
      setActiveFundSession(null);
    }
    return saved as FundSession | null;
  };

  const addFundMovement = async (movement: {
    sessionId: string;
    type: "IN" | "OUT";
    amount: number;
    reason: string;
  }) => {
    const saved = await apiFetchTyped("/pos/fund-sessions/movement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...movement,
        userId: currentUser?.id,
        userName: currentUser?.name,
      }),
    });
    return saved as FundMovement | null;
  };

  const getFundMovements = useCallback(
    async (sessionId: string) => {
      return (
        ((await apiFetch(
          `/pos/fund-sessions/movements?sessionId=${encodeURIComponent(sessionId)}`,
        )) as FundMovement[]) || []
      );
    },
    [apiFetch],
  );

  const addProduct = async (p: Partial<Product>) => {
    requireClaim(
      "action:product.manage",
      [Role.STOCK_MANAGER, Role.MANAGER],
      "Acces refuse: gestion des articles interdite.",
    );
    const s = await apiFetchTyped("/pos/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
    if (!s || typeof s !== "object" || !("id" in s)) return;
    setProducts((prev) => [...prev, s]);
  };
  const updateProduct = async (id: string, updates: Partial<Product>) => {
    await requireUserConfirmation("Modifier l'article");
    requireClaim(
      "action:product.manage",
      [Role.STOCK_MANAGER, Role.MANAGER],
      "Acces refuse: gestion des articles interdite.",
    );
    const s = await apiFetchTypedPath(
      "/pos/products/:id",
      { id },
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      },
    );
    setProducts((prev) => prev.map((p) => (p.id === id ? s : p)));
  };
  const deleteProduct = async (id: string) => {
    await requireUserConfirmation("Supprimer l'article");
    requireClaim(
      "action:product.manage",
      [Role.STOCK_MANAGER, Role.MANAGER],
      "Acces refuse: gestion des articles interdite.",
    );
    await apiFetchTypedPath("/pos/products/:id", { id }, { method: "DELETE" });
    setProducts((prev) => prev.filter((p) => p.id !== id));
  };
  const addCategory = async (name: string, parentId?: string) => {
    requireClaim(
      "action:category.manage",
      [Role.STOCK_MANAGER, Role.MANAGER],
      "Acces refuse: gestion des categories interdite.",
    );
    const s = await apiFetchTyped("/pos/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parentId }),
    });
    setCategories((prev) => [...prev, s]);
  };
  const updateCategory = async (id: string, updates: Partial<Category>) => {
    await requireUserConfirmation("Modifier la catégorie");
    requireClaim(
      "action:category.manage",
      [Role.STOCK_MANAGER, Role.MANAGER],
      "Acces refuse: gestion des categories interdite.",
    );
    const s = await apiFetchTypedPath(
      "/pos/categories/:id",
      { id },
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      },
    );
    setCategories((prev) => prev.map((c) => (c.id === id ? s : c)));
  };
  const deleteCategory = async (id: string) => {
    await requireUserConfirmation("Supprimer la catégorie");
    requireClaim(
      "action:category.manage",
      [Role.STOCK_MANAGER, Role.MANAGER],
      "Acces refuse: gestion des categories interdite.",
    );
    await apiFetchTypedPath(
      "/pos/categories/:id",
      { id },
      { method: "DELETE" },
    );
    setCategories((prev) => prev.filter((c) => c.id !== id));
  };
  const addPromotion = async (promotion: Partial<Promotion>) => {
    requireClaim(
      "action:promotion.manage",
      [Role.STOCK_MANAGER, Role.MANAGER],
      "Acces refuse: gestion des promotions interdite.",
    );
    const s = await apiFetchTyped("/pos/promotions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(promotion),
    });
    setPromotions((prev) => [...prev, s]);
  };
  const updatePromotion = async (id: string, updates: Partial<Promotion>) => {
    await requireUserConfirmation("Modifier la promotion");
    requireClaim(
      "action:promotion.manage",
      [Role.STOCK_MANAGER, Role.MANAGER],
      "Acces refuse: gestion des promotions interdite.",
    );
    const s = await apiFetchTypedPath(
      "/pos/promotions/:id",
      { id },
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      },
    );
    setPromotions((prev) => prev.map((p) => (p.id === id ? s : p)));
  };
  const deletePromotion = async (id: string) => {
    await requireUserConfirmation("Supprimer la promotion");
    requireClaim(
      "action:promotion.manage",
      [Role.STOCK_MANAGER, Role.MANAGER],
      "Acces refuse: gestion des promotions interdite.",
    );
    await apiFetchTypedPath(
      "/pos/promotions/:id",
      { id },
      { method: "DELETE" },
    );
    setPromotions((prev) => prev.filter((p) => p.id !== id));
  };
  const addUser = async (u: Omit<User, "id">) => {
    requireClaim(
      "action:user.manage",
      [Role.MANAGER],
      "Acces refuse: gestion des utilisateurs interdite.",
    );
    const s = await apiFetchTyped("/pos/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(u),
    });
    setAllUsers((prev) => [...prev, s]);
  };
  const updateUser = async (id: string, updates: Partial<User>) => {
    await requireUserConfirmation("Modifier l'utilisateur");
    requireClaim(
      "action:user.manage",
      [Role.MANAGER],
      "Acces refuse: gestion des utilisateurs interdite.",
    );
    const s = await apiFetchTypedPath(
      "/pos/users/:id",
      { id },
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      },
    );
    setAllUsers((prev) => prev.map((u) => (u.id === id ? s : u)));
    if (currentUser?.id === id) setCurrentUser(s);
  };
  const deleteUser = async (id: string) => {
    await requireUserConfirmation("Supprimer l'utilisateur");
    requireClaim(
      "action:user.manage",
      [Role.MANAGER],
      "Acces refuse: gestion des utilisateurs interdite.",
    );
    await apiFetchTypedPath("/pos/users/:id", { id }, { method: "DELETE" });
    setAllUsers((prev) => prev.filter((u) => u.id !== id));
  };
  const listWarehouses = async (): Promise<Warehouse[]> => {
    const rows = ((await apiFetchTyped("/pos/stock/warehouses" as any)) || []) as Warehouse[];
    setWarehouses(rows);
    return rows;
  };
  const createWarehouse = async (payload: {
    code: string;
    name: string;
    branchId?: string | null;
  }): Promise<Warehouse | null> => {
    const saved = (await apiFetchTyped("/pos/stock/warehouses" as any, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })) as Warehouse | null;
    if (saved) {
      setWarehouses((prev) => {
        if (prev.some((w) => w.id === saved.id)) {
          return prev.map((w) => (w.id === saved.id ? saved : w));
        }
        return [saved, ...prev];
      });
    }
    return saved;
  };
  const updateWarehouse = async (
    id: string,
    payload: Partial<Pick<Warehouse, "code" | "name" | "branchId" | "isActive">>,
  ): Promise<Warehouse | null> => {
    await requireUserConfirmation("Modifier le dépôt");
    const saved = (await apiFetchTypedPath(
      "/pos/stock/warehouses/:id" as any,
      { id },
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    )) as Warehouse | null;
    if (saved) {
      setWarehouses((prev) => prev.map((w) => (w.id === id ? saved : w)));
    }
    return saved;
  };
  const deleteWarehouse = async (id: string): Promise<boolean> => {
    await requireUserConfirmation("Supprimer le dépôt");
    await apiFetchTypedPath("/pos/stock/warehouses/:id" as any, { id }, { method: "DELETE" });
    setWarehouses((prev) => prev.filter((w) => w.id !== id));
    return true;
  };
  const addZone = async (name: string) => {
    const s = await apiFetchTyped("/pos/zones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setZones((prev) => [...prev, s]);
  };
  const deleteZone = async (id: string) => {
    await requireUserConfirmation("Supprimer la zone");
    await apiFetchTypedPath("/pos/zones/:id", { id }, { method: "DELETE" });
    setZones((prev) => prev.filter((z) => z.id !== id));
  };
  const patchZoneLayout = async (
    id: string,
    updates: Partial<
      Pick<Zone, "planX" | "planY" | "planW" | "planH" | "planFill">
    >,
  ): Promise<Zone | null> => {
    const s = (await apiFetchTypedPath(
      "/pos/zones/:id" as any,
      { id },
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      },
    )) as Zone | null;
    if (s && (s as Zone).id)
      setZones((prev) =>
        prev.map((z) => (z.id === id ? (s as Zone) : z)),
      );
    return s && (s as Zone).id ? (s as Zone) : null;
  };
  const addTable = async (
    number: string,
    zoneId: string,
    capacity: number,
    plan?: Partial<
      Pick<
        TableConfig,
        "planX" | "planY" | "planW" | "planH" | "planShape"
      >
    >,
  ) => {
    const s = await apiFetchTyped("/pos/tables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        number,
        zoneId,
        capacity,
        ...(plan && Object.keys(plan).length > 0 ? plan : {}),
      }),
    });
    // Le backend envoie aussi `tables:updated` en WebSocket : sans fusion par id,
    // la table peut apparaître deux fois selon l’ordre des setState.
    setTables((prev) => {
      const id = String((s as TableConfig)?.id ?? "");
      if (!id) return [...prev, s as TableConfig];
      const i = prev.findIndex((t) => String(t.id) === id);
      if (i === -1) return [...prev, s as TableConfig];
      const next = [...prev];
      next[i] = s as TableConfig;
      return next;
    });
  };
  const patchTableLayout = async (
    id: string,
    updates: Partial<
      Pick<
        TableConfig,
        "planX" | "planY" | "planW" | "planH" | "planShape"
      >
    >,
  ): Promise<TableConfig | null> => {
    const s = await apiFetchTypedPath(
      "/pos/tables/:id",
      { id },
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      },
    );
    if (!s) return null;
    setTables((prev) => prev.map((t) => (t.id === id ? s : t)));
    return s as TableConfig;
  };
  const updateTable = async (id: string, updates: Partial<TableConfig>) => {
    await requireUserConfirmation("Modifier la table");
    const s = await apiFetchTypedPath(
      "/pos/tables/:id",
      { id },
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      },
    );
    if (!s) return null;
    setTables((prev) => prev.map((t) => (t.id === id ? s : t)));
    return s as TableConfig;
  };
  const getTableReservations = async () => {
    return (await apiFetchTyped("/pos/tables/reservations")) || [];
  };
  const deleteTable = async (id: string) => {
    await requireUserConfirmation("Supprimer la table");
    await apiFetchTypedPath("/pos/tables/:id", { id }, { method: "DELETE" });
    setTables((prev) => prev.filter((t) => t.id !== id));
  };
  const addPrinter = async (
    name: string,
    type: string,
    bonProfile?: "kitchen" | "bar" | null,
  ) => {
    const s = await apiFetchTyped("/pos/printers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        type,
        bonProfile: bonProfile ?? undefined,
      }),
    });
    setPrinters((prev) => [...prev, s]);
  };
  const deletePrinter = async (id: string) => {
    await requireUserConfirmation("Supprimer l'imprimante");
    await apiFetchTypedPath("/pos/printers/:id", { id }, { method: "DELETE" });
    setPrinters((prev) => prev.filter((p) => p.id !== id));
  };
  const printProductionTest = async (opts: {
    station?: "KITCHEN" | "BAR";
    printerId?: string;
  }) => {
    await apiFetchTyped("/pos/printers/test-print", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        station: opts.station ?? "KITCHEN",
        printerId: opts.printerId,
      }),
    });
  };

  const addStockMovement = async (movement: {
    productId: string;
    variantId?: string | null;
    type: "IN" | "OUT";
    quantity: number;
    note?: string;
  }) => {
    requireClaim(
      "action:stock.manage",
      [Role.STOCK_MANAGER, Role.MANAGER],
      "Acces refuse: gestion du stock interdite.",
    );
    try {
      const result: any = await apiFetchTyped("/pos/stock/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...movement,
          userName: currentUser?.name || null,
        }),
      });
      if (result?.movement) {
        setStockMovements((prev) => {
          if (prev.some((m) => m.id === result.movement.id)) return prev;
          return [result.movement, ...prev];
        });
      }
      if (result?.product) {
        setProducts((prev) =>
          prev.map((p) => (p.id === result.product.id ? result.product : p)),
        );
      }
      return true;
    } catch {
      return false;
    }
  };

  const updateStockMovement = async (
    id: string,
    updates: Partial<{
      note?: string;
      approvedBy?: string;
      userName?: string;
      unitCost?: number;
    }>,
  ) => {
    await requireUserConfirmation("Modifier le mouvement de stock");
    requireClaim(
      "action:stock.manage",
      [Role.STOCK_MANAGER, Role.MANAGER],
      "Acces refuse: gestion du stock interdite.",
    );
    try {
      const s = await apiFetchTypedPath(
        `/pos/stock/movements/:id`,
        { id },
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        },
      );
      if (!s) return null;
      setStockMovements((prev) => prev.map((m) => (m.id === id ? s : m)));
      return s as any;
    } catch (err) {
      return null;
    }
  };

  const deleteStockMovement = async (id: string) => {
    await requireUserConfirmation("Supprimer le mouvement de stock");
    requireClaim(
      "action:stock.manage",
      [Role.STOCK_MANAGER, Role.MANAGER],
      "Acces refuse: gestion du stock interdite.",
    );
    try {
      await apiFetchTypedPath(
        `/pos/stock/movements/:id`,
        { id },
        { method: "DELETE" },
      );
      setStockMovements((prev) => prev.filter((m) => m.id !== id));
      return true;
    } catch (err) {
      return false;
    }
  };

  const createStockDocument = async (payload: {
    type: "ENTRY" | "OUT" | "TRANSFER" | "INVENTORY";
    supplierId?: string | null;
    externalRef?: string | null;
    documentDate?: number | null;
    note?: string;
    lines: {
      productId: string;
      quantity: number;
      movementType?: "IN" | "OUT";
      note?: string;
      unitCost?: number | null;
    }[];
  }) => {
    requireClaim(
      "action:stock.manage",
      [Role.STOCK_MANAGER, Role.MANAGER],
      "Acces refuse: gestion du stock interdite.",
    );
    const saved: any = await apiFetchTyped("/pos/stock/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        userName: currentUser?.name || null,
      }),
    });
    await refreshStockMovements();
    const freshProducts = await apiFetchTyped("/pos/products");
    setProducts(freshProducts || []);
    return (saved || null) as StockDocument | null;
  };

  const listStockDocuments = async (params?: {
    from?: number;
    to?: number;
    type?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.from !== undefined) query.set("from", String(params.from));
    if (params?.to !== undefined) query.set("to", String(params.to));
    if (params?.type) query.set("type", params.type);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const rows = (await apiFetch(
      `/pos/stock/documents${suffix}`,
    )) as StockDocument[];
    return rows || [];
  };

  const updateStockDocument = async (
    id: string,
    payload: {
      type?: "ENTRY" | "OUT" | "TRANSFER" | "INVENTORY";
      note?: string;
      documentDate?: number | null;
      lines: {
        productId: string;
        quantity: number;
        movementType?: "IN" | "OUT";
        note?: string;
        unitCost?: number | null;
      }[];
    },
  ) => {
    await requireUserConfirmation("Modifier le document de stock");
    requireClaim(
      "action:stock.manage",
      [Role.STOCK_MANAGER, Role.MANAGER],
      "Acces refuse: gestion du stock interdite.",
    );
    const saved = (await apiFetchTypedPath(
      "/pos/stock/documents/:id" as any,
      { id },
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          userName: currentUser?.name || null,
        }),
      },
    )) as StockDocument | null;
    await refreshStockMovements();
    const freshProducts = await apiFetchTyped("/pos/products");
    setProducts(freshProducts || []);
    return saved || null;
  };

  const deleteStockDocumentLine = async (documentId: string, lineId: string) => {
    await requireUserConfirmation("Supprimer la ligne du document de stock");
    requireClaim(
      "action:stock.manage",
      [Role.STOCK_MANAGER, Role.MANAGER],
      "Acces refuse: gestion du stock interdite.",
    );
    const saved = (await apiFetchTypedPath(
      "/pos/stock/documents/:id/lines/:lineId" as any,
      { id: documentId, lineId },
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userName: currentUser?.name || null }),
      },
    )) as StockDocument | null;
    await refreshStockMovements();
    const freshProducts = await apiFetchTyped("/pos/products");
    setProducts(freshProducts || []);
    return saved || null;
  };

  const getProductMovementReport = async (params?: {
    productId?: string;
    from?: number;
    to?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.productId) query.set("productId", params.productId);
    if (params?.from !== undefined) query.set("from", String(params.from));
    if (params?.to !== undefined) query.set("to", String(params.to));
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const rows = (await apiFetch(
      `/pos/stock/product-movements${suffix}`,
    )) as ProductMovementRow[];
    return rows || [];
  };

  const getDetectedPrinters = async () => {
    return await apiFetchTyped("/pos/printers/detected");
  };
  const updateSettings = async (newSettings: Partial<AppSettings>) => {
    await requireUserConfirmation("Modifier les paramètres");
    requireClaim(
      "action:settings.update",
      [Role.MANAGER],
      "Acces refuse: modification des parametres interdite.",
    );
    setSettings((prev) => {
      const next = { ...prev, ...newSettings } as AppSettings;
      if (
        newSettings.cashClosingModePreference !== undefined ||
        newSettings.companyType !== undefined
      ) {
        const pref = next.cashClosingModePreference ?? "AUTO";
        next.cashClosingMode =
          pref === "INDEPENDENT"
            ? "INDEPENDENT"
            : pref === "SHIFT_HANDOVER"
              ? "SHIFT_HANDOVER"
              : next.companyType === CompanyType.RESTAURANT_CAFE
                ? "SHIFT_HANDOVER"
                : "INDEPENDENT";
      }
      localStorage.setItem("axiaflex_settings", JSON.stringify(next));
      return next;
    });
    await apiFetchTyped("/pos/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newSettings),
    });
  };

  const uploadLogo = async (file: File) => {
    if (useSimulatedBackend) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          updateSettings({ logoUrl: reader.result });
        }
      };
      reader.readAsDataURL(file);
      return;
    }

    const formData = new FormData();
    formData.append("logo", file);
    const response = await fetch(`${API_BASE_URL}/pos/settings/logo`, {
      method: "POST",
      body: formData,
    });
    if (!response.ok) throw new Error("Upload failed");
    const saved = await response.json();
    if (saved) setSettings((prev) => ({ ...prev, ...saved }));
  };
  const uploadProductImage = async (file: File): Promise<string | null> => {
    if (useSimulatedBackend) {
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") resolve(reader.result);
          else resolve(null);
        };
        reader.readAsDataURL(file);
      });
    }

    const formData = new FormData();
    formData.append("image", file);
    const resp = await fetch(`${API_BASE_URL}/pos/products/upload-image`, {
      method: "POST",
      body: formData,
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const msg =
        (payload && typeof payload.error === "string" && payload.error) ||
        `Upload échoué (${resp.status})`;
      throw new Error(msg);
    }
    return payload?.imageUrl || null;
  };
  const updateOrderStatus = async (id: string, status: OrderStatus) => {
    await requireUserConfirmation("Modifier le statut de la commande");
    if (status === OrderStatus.CANCELLED) {
      requireClaim(
        "action:pos.order.cancel.full",
        [Role.MANAGER, Role.CASHIER],
        "Acces refuse: vous ne pouvez pas annuler la commande complete.",
      );
      const existingOrder = orders.find((o) => o.id === id);
      if (existingOrder && existingOrder.status !== OrderStatus.PENDING) {
        requireClaim(
          "action:pos.order.cancel.after_validation",
          [Role.MANAGER],
          "Acces refuse: annulation apres validation interdite.",
        );
      }
      const hasPreparedItem = (existingOrder?.items || []).some((it: any) => {
        const prep = String(it?.prepStatus || "").toUpperCase();
        return prep && prep !== "PENDING";
      });
      if (hasPreparedItem) {
        requireClaim(
          "action:pos.order.cancel.after_preparation",
          [Role.MANAGER],
          "Acces refuse: annulation apres preparation interdite.",
        );
      }
    }
    await apiFetchTypedPath(
      "/pos/orders/:id/status",
      { id },
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      },
    );
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
  };

  const getClientTable = async (token: string) => {
    if (!token) return null;
    const response = await apiFetchTypedPath("/pos/client/table/:token", {
      token,
    });
    if (!response) return null;
    return response as { table: TableConfig; activeOrder: Order | null };
  };

  const getClientOrders = async (token: string) => {
    if (!token) return [];
    const response = (await apiFetch(
      `/pos/client/orders?token=${encodeURIComponent(token)}`,
    )) as Order[];
    return response || [];
  };

  const createClientOrder = async (token: string, order: Partial<Order>) => {
    if (!token) return null;
    const response: any = await apiFetchTyped("/pos/client/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, ...order }),
    });
    if (!response) return null;
    return response as Order;
  };

  const updateClientOrder = async (
    orderId: string,
    token: string,
    items: any[],
    total: number,
    discount: number = 0,
  ) => {
    if (!token) return null;
    const response = await apiFetchTypedPath(
      "/pos/client/orders/:orderId",
      { orderId },
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, items, total, discount }),
      },
    );
    return response || null;
  };

  const cancelClientOrder = async (orderId: string, token: string) => {
    if (!token) return null;
    const response = await apiFetchTypedPath(
      "/pos/client/orders/:orderId/cancel",
      { orderId },
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      },
    );
    return response || null;
  };

  const requestClientPayment = async (orderId: string, token: string) => {
    if (!token) return false;
    const response = await apiFetchTypedPath(
      "/pos/client/orders/:orderId/request-payment",
      { orderId },
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      },
    );
    return Boolean(response?.ok);
  };

  const dismissPaymentRequest = (id: string) => {
    setPaymentRequests((prev) => prev.filter((req) => req.id !== id));
  };

  const playPaymentSound = () => {
    if (!settings.paymentSoundEnabled) return;
    try {
      const AudioCtx =
        window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioCtx();
      }
      const ctx = audioContextRef.current;
      if (!ctx) return;
      if (ctx.state === "suspended") {
        ctx.resume();
      }
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 880;
      gain.gain.value = 0.12;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.25);
    } catch {
      // ignore audio failures
    }
  };

  const refreshOrders = useCallback(async () => {
    const terminalId = settings.terminalId ? String(settings.terminalId) : "";
    const suffix = terminalId ? `?terminalId=${encodeURIComponent(terminalId)}` : "";
    const o = await apiFetchTyped(`/pos/orders${suffix}` as any);
    setOrders((o || []).map(normalizeOrderFromApi));
  }, [apiFetch, settings.terminalId]);

  const fetchOrdersForReports = useCallback(
    async (terminalFilter: ReportTerminalFilter) => {
      const tf = terminalFilter ?? "poste";
      let path = "/pos/orders";
      if (tf === "all") {
        // pas de terminalId
      } else if (tf === "poste") {
        const tid = settings.terminalId?.trim();
        if (tid)
          path += `?terminalId=${encodeURIComponent(tid)}`;
      } else {
        path += `?terminalId=${encodeURIComponent(String(tf))}`;
      }
      const list = await apiFetch(path);
      return Array.isArray(list) ? (list as Order[]) : [];
    },
    [apiFetch, settings.terminalId],
  );

  const refreshStockMovements = useCallback(async () => {
    const list = await apiFetchTyped("/pos/stock/movements");
    setStockMovements(list || []);
  }, [apiFetch]);

  const refreshSuppliers = useCallback(async () => {
    const rows = await apiFetchTyped("/pos/suppliers");
    setSuppliers(rows || []);
  }, [apiFetch]);

  const toReportQuery = (params?: { from?: number; to?: number }) => {
    const query = new URLSearchParams();
    if (params?.from !== undefined) query.set("from", String(params.from));
    if (params?.to !== undefined) query.set("to", String(params.to));
    const suffix = query.toString();
    return suffix ? `?${suffix}` : "";
  };

  const getCogsByOrderReport = useCallback(
    async (params?: { from?: number; to?: number }) => {
      const suffix = toReportQuery(params);
      const rows = (await apiFetch(
        `/pos/stock/reports/cogs-by-order${suffix}`,
      )) as CogsByOrderRow[];
      return rows || [];
    },
    [apiFetch],
  );

  const getCogsByDayReport = useCallback(
    async (params?: { from?: number; to?: number }) => {
      const suffix = toReportQuery(params);
      const rows = (await apiFetch(
        `/pos/stock/reports/cogs-by-day${suffix}`,
      )) as CogsByDayRow[];
      return rows || [];
    },
    [apiFetch],
  );

  const getProductProfitabilityReport = useCallback(
    async (params?: { from?: number; to?: number }) => {
      const suffix = toReportQuery(params);
      const rows = (await apiFetch(
        `/pos/stock/reports/product-profitability${suffix}`,
      )) as ProductProfitabilityRow[];
      return rows || [];
    },
    [apiFetch],
  );

  const getSalesSummaryReport = useCallback(
    async (params?: {
      from?: number;
      to?: number;
      serverId?: string;
      paymentMethod?: string;
      terminalFilter?: ReportTerminalFilter;
    }) => {
      const query = new URLSearchParams();
      if (params?.from !== undefined) query.set("from", String(params.from));
      if (params?.to !== undefined) query.set("to", String(params.to));
      if (params?.serverId) query.set("serverId", params.serverId);
      if (params?.paymentMethod)
        query.set("paymentMethod", params.paymentMethod);
      appendReportTerminalToSearchParams(
        query,
        params?.terminalFilter,
        settings.terminalId,
      );
      const suffix = query.toString() ? `?${query.toString()}` : "";
      return (await apiFetch(
        `/pos/reports/sales/summary${suffix}`,
      )) as ApiResponseMap["/pos/reports/sales/summary"];
    },
    [apiFetch, settings.terminalId],
  );

  const getSalesByProductReport = useCallback(
    async (params?: {
      from?: number;
      to?: number;
      categoryId?: string;
      serverId?: string;
      terminalFilter?: ReportTerminalFilter;
    }) => {
      const query = new URLSearchParams();
      if (params?.from !== undefined) query.set("from", String(params.from));
      if (params?.to !== undefined) query.set("to", String(params.to));
      if (params?.categoryId) query.set("categoryId", params.categoryId);
      if (params?.serverId) query.set("serverId", params.serverId);
      appendReportTerminalToSearchParams(
        query,
        params?.terminalFilter,
        settings.terminalId,
      );
      const suffix = query.toString() ? `?${query.toString()}` : "";
      return (await apiFetch(
        `/pos/reports/sales/by-product${suffix}`,
      )) as ApiResponseMap["/pos/reports/sales/by-product"];
    },
    [apiFetch, settings.terminalId],
  );

  const getSalesByCategoryReport = useCallback(
    async (params?: {
      from?: number;
      to?: number;
      serverId?: string;
      terminalFilter?: ReportTerminalFilter;
    }) => {
      const query = new URLSearchParams();
      if (params?.from !== undefined) query.set("from", String(params.from));
      if (params?.to !== undefined) query.set("to", String(params.to));
      if (params?.serverId) query.set("serverId", params.serverId);
      appendReportTerminalToSearchParams(
        query,
        params?.terminalFilter,
        settings.terminalId,
      );
      const suffix = query.toString() ? `?${query.toString()}` : "";
      return (await apiFetch(
        `/pos/reports/sales/by-category${suffix}`,
      )) as ApiResponseMap["/pos/reports/sales/by-category"];
    },
    [apiFetch, settings.terminalId],
  );

  const getSalesByServerReport = useCallback(
    async (params?: {
      from?: number;
      to?: number;
      terminalFilter?: ReportTerminalFilter;
    }) => {
      const query = new URLSearchParams();
      if (params?.from !== undefined) query.set("from", String(params.from));
      if (params?.to !== undefined) query.set("to", String(params.to));
      appendReportTerminalToSearchParams(
        query,
        params?.terminalFilter,
        settings.terminalId,
      );
      const suffix = query.toString() ? `?${query.toString()}` : "";
      return (await apiFetch(
        `/pos/reports/sales/by-server${suffix}`,
      )) as ApiResponseMap["/pos/reports/sales/by-server"];
    },
    [apiFetch, settings.terminalId],
  );

  const getSalesByPaymentMethodReport = useCallback(
    async (params?: {
      from?: number;
      to?: number;
      terminalFilter?: ReportTerminalFilter;
    }) => {
      const query = new URLSearchParams();
      if (params?.from !== undefined) query.set("from", String(params.from));
      if (params?.to !== undefined) query.set("to", String(params.to));
      appendReportTerminalToSearchParams(
        query,
        params?.terminalFilter,
        settings.terminalId,
      );
      const suffix = query.toString() ? `?${query.toString()}` : "";
      return (await apiFetch(
        `/pos/reports/sales/by-payment-method${suffix}`,
      )) as ApiResponseMap["/pos/reports/sales/by-payment-method"];
    },
    [apiFetch, settings.terminalId],
  );

  const getSalesByTimeslotReport = useCallback(
    async (params?: {
      from?: number;
      to?: number;
      intervalMinutes?: number;
      terminalFilter?: ReportTerminalFilter;
    }) => {
      const query = new URLSearchParams();
      if (params?.from !== undefined) query.set("from", String(params.from));
      if (params?.to !== undefined) query.set("to", String(params.to));
      if (params?.intervalMinutes !== undefined)
        query.set("intervalMinutes", String(params.intervalMinutes));
      appendReportTerminalToSearchParams(
        query,
        params?.terminalFilter,
        settings.terminalId,
      );
      const suffix = query.toString() ? `?${query.toString()}` : "";
      return (await apiFetch(
        `/pos/reports/sales/by-timeslot${suffix}`,
      )) as ApiResponseMap["/pos/reports/sales/by-timeslot"];
    },
    [apiFetch, settings.terminalId],
  );

  const getCashClosingReport = useCallback(
    async (params?: {
      from?: number;
      to?: number;
      fundId?: string;
      cashierId?: string;
      terminalFilter?: ReportTerminalFilter;
    }) => {
      const query = new URLSearchParams();
      if (params?.from !== undefined) query.set("from", String(params.from));
      if (params?.to !== undefined) query.set("to", String(params.to));
      if (params?.fundId) query.set("fundId", params.fundId);
      if (params?.cashierId) query.set("cashierId", params.cashierId);
      appendReportTerminalToSearchParams(
        query,
        params?.terminalFilter,
        settings.terminalId,
      );
      const suffix = query.toString() ? `?${query.toString()}` : "";
      return (await apiFetch(
        `/pos/reports/cash/closing${suffix}`,
      )) as ApiResponseMap["/pos/reports/cash/closing"];
    },
    [apiFetch, settings.terminalId],
  );

  const getTopCustomersReport = useCallback(
    async (params?: {
      from?: number;
      to?: number;
      limit?: number;
      terminalFilter?: ReportTerminalFilter;
    }) => {
      const query = new URLSearchParams();
      if (params?.from !== undefined) query.set("from", String(params.from));
      if (params?.to !== undefined) query.set("to", String(params.to));
      if (params?.limit !== undefined) query.set("limit", String(params.limit));
      appendReportTerminalToSearchParams(
        query,
        params?.terminalFilter,
        settings.terminalId,
      );
      const suffix = query.toString() ? `?${query.toString()}` : "";
      return (await apiFetch(
        `/pos/reports/customers/top${suffix}`,
      )) as ApiResponseMap["/pos/reports/customers/top"];
    },
    [apiFetch, settings.terminalId],
  );

  const createSupplier = useCallback(
    async (payload: Partial<Supplier>): Promise<Supplier | null> => {
      const body = {
        name: String(payload.name || "").trim(),
        contactName: payload.contactName ?? null,
        email: payload.email ?? null,
        phone: payload.phone ?? null,
        address: payload.address ?? null,
        taxId: payload.taxId ?? null,
      };
      if (!body.name) return null;
      const created: any = await apiFetchTyped("/pos/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await refreshSuppliers();
      return created as Supplier;
    },
    [apiFetchTyped, refreshSuppliers],
  );

  const updateSupplier = useCallback(
    async (
      id: string,
      payload: Partial<Supplier>,
    ): Promise<Supplier | null> => {
      await requireUserConfirmation("Modifier le fournisseur");
      if (!id) return null;
      const body = {
        name: payload.name,
        contactName: payload.contactName,
        email: payload.email,
        phone: payload.phone,
        address: payload.address,
        taxId: payload.taxId,
      };
      const updated = await apiFetchTypedPath(
        "/pos/suppliers/:id",
        { id },
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      await refreshSuppliers();
      return updated as Supplier;
    },
    [apiFetchTypedPath, refreshSuppliers],
  );

  const deleteSupplier = useCallback(
    async (id: string): Promise<boolean> => {
      await requireUserConfirmation("Supprimer le fournisseur");
      if (!id) return false;
      await apiFetchTypedPath(
        "/pos/suppliers/:id",
        { id },
        {
          method: "DELETE",
        },
      );
      await refreshSuppliers();
      return true;
    },
    [apiFetchTypedPath, refreshSuppliers],
  );
  useEffect(() => {
    if (useSimulatedBackend) return;
    const run = async () => {
      try {
        await refreshOrders();
      } catch {
        // ignore
      }
    };
    // Single initial fetch; subsequent order updates come from WebSocket events
    run();
  }, [refreshOrders, useSimulatedBackend]);

  useEffect(() => {
    if (useSimulatedBackend) return;
    if (!API_BASE_URL && IS_PROD) return;
    let ws: WebSocket | null = null;
    let retryTimer: number | undefined;
    let shouldReconnect = true;

    const connect = () => {
      const wsUrl = API_BASE_URL
        ? API_BASE_URL.replace(/^http/i, "ws")
        : `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`;
      ws = new WebSocket(`${wsUrl}/ws`);

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (!msg?.event || !msg?.data) return;
          if (msg.event.startsWith("orders:")) {
            const updated = msg.data as Order;
            setOrders((prev) => {
              const normalized = normalizeOrderFromApi(updated);
              const exists = prev.find((o) => o.id === normalized.id);
              const merged =
                normalized.items?.length || !exists
                  ? normalized
                  : { ...normalized, items: exists.items };
              if (!exists) return [...prev, merged];
              return prev.map((o) => (o.id === merged.id ? merged : o));
            });
          }
          if (msg.event === "products:updated") {
            const updated = msg.data as Product;
            setProducts((prev) => {
              const exists = prev.find((p) => p.id === updated.id);
              if (!exists) return [...prev, updated];
              return prev.map((p) => (p.id === updated.id ? updated : p));
            });
          }
          if (msg.event === "tables:updated") {
            const updated = msg.data as TableConfig;
            if (!updated?.id) return;
            const uid = String(updated.id);
            setTables((prev) => {
              const exists = prev.some((t) => String(t.id) === uid);
              if (!exists) return [...prev, updated];
              return prev.map((t) =>
                String(t.id) === uid ? updated : t,
              );
            });
          }
          if (msg.event === "tables:deleted") {
            const payload = msg.data as { id?: string };
            if (!payload?.id) return;
            setTables((prev) => prev.filter((t) => t.id !== payload.id));
          }
          if (msg.event === "stock:movement") {
            const payload = msg.data as {
              movement: StockMovement;
              product?: Product;
            };
            if (payload?.movement) {
              setStockMovements((prev) => {
                if (prev.some((m) => m.id === payload.movement.id)) return prev;
                return [payload.movement, ...prev];
              });
            }
            if (payload?.product) {
              setProducts((prev) =>
                prev.map((p) =>
                  p.id === payload.product!.id ? payload.product! : p,
                ),
              );
            }
          }
          if (msg.event === "orders:payment-request") {
            const payload = msg.data as {
              id: string;
              tableNumber?: string;
              zoneId?: string;
              at?: number;
            };
            if (!payload?.id) return;
            let shouldNotify = false;
            setPaymentRequests((prev) => {
              if (prev.some((req) => req.id === payload.id)) return prev;
              shouldNotify = true;
              return [
                {
                  id: payload.id,
                  tableNumber: payload.tableNumber,
                  zoneId: payload.zoneId,
                  createdAt: payload.at || Date.now(),
                },
                ...prev,
              ];
            });
            if (shouldNotify) playPaymentSound();
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (!shouldReconnect) return;
        retryTimer = window.setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        // Let onclose handle retries; avoid forcing close while CONNECTING.
      };
    };

    connect();

    return () => {
      shouldReconnect = false;
      if (retryTimer) window.clearTimeout(retryTimer);
      if (!ws) return;
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
        return;
      }
      if (ws.readyState === WebSocket.CONNECTING) {
        ws.onopen = () => ws?.close();
      }
    };
  }, [useSimulatedBackend]);
  const addClient = async (c: Omit<Client, "id">): Promise<Client> => {
    requireClaim(
      "action:client.create",
      [Role.MANAGER, Role.CASHIER, Role.SERVER],
      "Acces refuse: ajout client interdit.",
    );
    const saved: any = await apiFetchTyped("/pos/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(c),
    });

    setClients((prev) => {
      if (prev.some((client) => client.id === saved.id)) return prev;
      return [saved, ...prev];
    });

    return saved as Client;
  };
  const updateClient = async (
    id: string,
    updates: Partial<Client>,
  ): Promise<Client | null> => {
    await requireUserConfirmation("Modifier le client");
    requireClaim(
      "action:client.update",
      [Role.MANAGER, Role.CASHIER, Role.SERVER],
      "Acces refuse: modification client interdite.",
    );
    const saved = await apiFetchTypedPath(
      "/pos/clients/:id",
      { id },
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      },
    );
    if (!saved) return null;
    setClients((prev) =>
      prev.map((client) => (client.id === id ? saved : client)),
    );
    return saved as Client;
  };
  const deleteClient = async (id: string): Promise<boolean> => {
    await requireUserConfirmation("Supprimer le client");
    requireClaim(
      "action:client.delete",
      [Role.MANAGER, Role.CASHIER],
      "Acces refuse: suppression client interdite.",
    );
    const response: any = await apiFetchTypedPath(
      "/pos/clients/:id",
      { id },
      {
        method: "DELETE",
      },
    );
    if (!response?.ok) return false;
    setClients((prev) => prev.filter((client) => client.id !== id));
    return true;
  };
  const generateInvoice = async (clientId: string, orderIds: string[]) => {
    const payload: any = await apiFetchTyped("/pos/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, orderIds }),
    });

    const invoice = payload?.invoice;
    const updatedOrders = Array.isArray(payload?.orders) ? payload.orders : [];

    if (invoice) {
      setInvoices((prev) => {
        if (prev.some((item) => item.id === invoice.id)) return prev;
        return [invoice, ...prev];
      });
    }

    if (updatedOrders.length > 0) {
      const byId = new Map(
        updatedOrders.map((order: any) => [order.id, order]),
      );
      setOrders((prev) => prev.map((order) => byId.get(order.id) || order));
    }
  };
  const updateInvoice = async (
    invoiceId: string,
    payload: { clientId?: string; orderIds: string[] },
  ) => {
    await requireUserConfirmation("Modifier la facture");
    const response: any = await apiFetchTypedPath(
      "/pos/invoices/:id",
      { id: invoiceId },
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    const invoice = response?.invoice;
    const updatedOrders = Array.isArray(response?.orders)
      ? response.orders
      : [];

    if (invoice) {
      setInvoices((prev) =>
        prev.map((item) => (item.id === invoice.id ? invoice : item)),
      );
    }

    if (updatedOrders.length > 0) {
      const byId = new Map(
        updatedOrders.map((order: any) => [order.id, order]),
      );
      setOrders((prev) =>
        prev.map((order) => {
          if (byId.has(order.id)) return byId.get(order.id);
          const wasInInvoice =
            order.invoiceId === invoiceId &&
            !payload.orderIds.includes(order.id);
          if (wasInInvoice) {
            return {
              ...order,
              invoiceId: undefined,
              status:
                String(order.status || "").toUpperCase() ===
                OrderStatus.INVOICED
                  ? OrderStatus.COMPLETED
                  : order.status,
            };
          }
          return order;
        }),
      );
    }
  };
  const deleteInvoice = async (invoiceId: string) => {
    await requireUserConfirmation("Supprimer la facture");
    const response = await apiFetchTypedPath(
      "/pos/invoices/:id",
      { id: invoiceId },
      {
        method: "DELETE",
      },
    );

    const updatedOrders = Array.isArray(response?.orders)
      ? response.orders
      : [];

    setInvoices((prev) => prev.filter((item) => item.id !== invoiceId));

    if (updatedOrders.length > 0) {
      const byId = new Map(
        updatedOrders.map((order: any) => [order.id, order]),
      );
      setOrders((prev) => prev.map((order) => byId.get(order.id) || order));
    }
  };
  const setActiveOrderById = (id: string | null) => {
    setActiveOrder(orders.find((o) => o.id === id) || null);
  };

  const logout = () => {
    setCurrentUser(null);
    setActiveShift(null);
    setActiveFundSession(null);
  };

  const handleConfirmDialog = (ok: boolean) => {
    const resolver = confirmResolverRef.current;
    confirmResolverRef.current = null;
    if (resolver) resolver(ok);
    else setConfirmDialog({ open: false, label: "" });
  };

  const isDeleteConfirm = /^supprimer/i.test(confirmDialog.label || "");

  return (
    <POSContext.Provider
      value={{
        products,
        categories,
        orders,
        zones,
        tables,
        promotions,
        allUsers,
        warehouses,
        session,
        clients,
        invoices,
        printers,
        funds,
        stockMovements,
        settings,
        currentUser,
        activeShift,
        activeFundSession,
        activeOrder,
        paymentRequests,
        loading,
        isOffline,
        getActiveShift,
        getLatestOpenShift,
        openShift,
        closeShift,
        getShiftSummaries,
        listShifts,
        openSession,
        closeSession,
        addCashMovement,
        createOrder,
        updateOrder,
        addOrderPayment,
        addOrderPaymentsBatch,
        createRestaurantVoucher,
        getRestaurantVoucherByCode,
        listRestaurantVouchers,
        createRestaurantCard,
        getRestaurantCardByCode,
        listRestaurantCards,
        topupRestaurantCard,
        listRestaurantCardMovements,
        testExternalRestaurantCardApi,
        updateOrderStatus,
        refreshOrders,
        fetchOrdersForReports,
        refreshStockMovements,
        getCogsByOrderReport,
        getCogsByDayReport,
        getProductProfitabilityReport,
        getSalesSummaryReport,
        getSalesByProductReport,
        getSalesByCategoryReport,
        getSalesByServerReport,
        getSalesByPaymentMethodReport,
        getSalesByTimeslotReport,
        getCashClosingReport,
        getTopCustomersReport,
        createTicket,
        getTicketsByOrder,
        printTicket,
        printOrderClientReceiptProvisional,
        downloadTicketPdf,
        getPdfArchives,
        downloadPdfArchiveFile,
        getOrderById,
        getClientTable,
        getClientOrders,
        createClientOrder,
        updateClientOrder,
        cancelClientOrder,
        requestClientPayment,
        dismissPaymentRequest,
        addClient,
        updateClient,
        deleteClient,
        generateInvoice,
        updateInvoice,
        deleteInvoice,
        loginByPin,
        logout,
        setActiveOrderById,
        addProduct,
        updateProduct,
        deleteProduct,
        addCategory,
        updateCategory,
        deleteCategory,
        addPromotion,
        updatePromotion,
        deletePromotion,
        addUser,
        updateUser,
        deleteUser,
        listWarehouses,
        createWarehouse,
        updateWarehouse,
        deleteWarehouse,
        addZone,
        deleteZone,
        patchZoneLayout,
        addTable,
        patchTableLayout,
        updateTable,
        getTableReservations,
        deleteTable,
        getFunds,
        addFund,
        updateFund,
        deleteFund,
        listFundSessions,
        getActiveFundSession,
        openFundSession,
        closeFundSession,
        addFundMovement,
        getFundMovements,
        addPrinter,
        deletePrinter,
        getDetectedPrinters,
        printProductionTest,
        addStockMovement,
        updateStockMovement,
        deleteStockMovement,
        createStockDocument,
        listStockDocuments,
        updateStockDocument,
        deleteStockDocumentLine,
        getProductMovementReport,
        updateSettings,
        uploadLogo,
        uploadProductImage,
        suppliers,
        refreshSuppliers,
        createSupplier,
        updateSupplier,
        deleteSupplier,
      }}
    >
      {children}
      {confirmDialog.open && (
        <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
            <div
              className={`px-5 py-4 border-b ${
                isDeleteConfirm
                  ? "border-rose-100 bg-rose-50"
                  : "border-slate-100 bg-slate-50"
              }`}
            >
              <h3 className="text-base font-black text-slate-800">
                Confirmer l'action
              </h3>
              <p
                className={`text-xs mt-1 ${
                  isDeleteConfirm ? "text-rose-500" : "text-slate-500"
                }`}
              >
                {isDeleteConfirm
                  ? "Cette opération est destructive."
                  : "Cette opération va modifier les données."}
              </p>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm font-semibold text-slate-700">
                {confirmDialog.label}
              </p>
            </div>
            <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => handleConfirmDialog(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-black text-slate-600 hover:bg-slate-100"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => handleConfirmDialog(true)}
                className={`px-4 py-2 rounded-xl text-white text-sm font-black ${
                  isDeleteConfirm
                    ? "bg-rose-600 hover:bg-rose-700"
                    : "bg-indigo-600 hover:bg-indigo-700"
                }`}
              >
                {isDeleteConfirm ? "Supprimer" : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </POSContext.Provider>
  );
};

export const usePOS = () => {
  const context = useContext(POSContext);
  if (!context) throw new Error("usePOS must be used within a POSProvider");
  return context;
};
