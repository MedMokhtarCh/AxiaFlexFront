export enum Role {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  CASHIER = 'CASHIER',
  SERVER = 'SERVER',
  STOCK_MANAGER = 'STOCK_MANAGER',
  CHEF = 'CHEF',
  BARTENDER = 'BARTENDER'
}

export enum CompanyType {
  FAST_FOOD = 'FAST_FOOD',
  RESTAURANT_CAFE = 'RESTAURANT_CAFE',
  SHOP_SINGLE = 'SHOP_SINGLE',
  SHOP_MULTI = 'SHOP_MULTI',
}

/** Raccourcis remise au POS (ligne ou ticket), configurables dans Paramètres. */
export interface PosDiscountPreset {
  id: string;
  label: string;
  type: 'PERCENT' | 'AMOUNT';
  value: number;
}

export const DEFAULT_POS_DISCOUNT_PRESETS: PosDiscountPreset[] = [
  { id: 'preset-fidelite', label: 'Fidélité', type: 'PERCENT', value: 10 },
  { id: 'preset-staff', label: 'Staff', type: 'PERCENT', value: 50 },
  { id: 'preset-vip', label: 'Offert VIP', type: 'PERCENT', value: 100 },
];

export interface User {
  id: string;
  name: string;
  role: Role;
  pin: string;
  avatarUrl?: string;
  assignedZoneIds?: string[];
  assignedWarehouseIds?: string[] | null;
  salesWarehouseId?: string | null;
  canManageFund?: boolean | null;
  /** Claims optionnels (ex. `nav:reports` pour ouvrir Rapports sans le rôle admin). */
  claims?: string[] | null;
  /**
   * Imprimante (id `printers`) pour les tickets / reçus clients imprimés par le backend
   * lorsque cette personne est le serveur (`serverId`) de la commande (ex. portable sans fil).
   */
  assignedPrinterId?: string | null;
}

/** Liste des claims configurables (préfixe menu : `nav:<id>` comme dans la barre latérale). */
export const USER_CLAIM_OPTIONS: readonly {
  id: string;
  label: string;
  description: string;
}[] = [
  {
    id: 'nav:dashboard',
    label: 'Tableau de bord',
    description: "Accès à l'écran Tableau de bord.",
  },
  {
    id: 'nav:tables',
    label: 'Plan de salle',
    description: 'Accès au plan de salle (selon le type d’établissement).',
  },
  {
    id: 'nav:reports',
    label: 'Rapports',
    description: 'Accès aux rapports de vente et caisse.',
  },
  {
    id: 'nav:pos',
    label: 'Point de vente',
    description: 'Accès au POS.',
  },
  {
    id: 'nav:open-tickets',
    label: 'Tickets en cours',
    description: 'Accès au tableau des tickets ouverts.',
  },
  {
    id: 'nav:kds',
    label: 'Cuisine (KDS)',
    description: "Accès à l'affichage cuisine / bar.",
  },
  {
    id: 'nav:gestion-article',
    label: 'Gestion articles',
    description: 'Catalogue produits.',
  },
  {
    id: 'nav:gestion-categories',
    label: 'Gestion catégories',
    description: 'Arborescence catégories.',
  },
  {
    id: 'nav:gestion-promotion',
    label: 'Gestion promotions',
    description: 'Promotions et offres.',
  },
  {
    id: 'nav:gestion-stock',
    label: 'Gestion stock',
    description: 'Mouvements et niveaux de stock.',
  },
  {
    id: 'nav:achats',
    label: 'Achats',
    description: 'Bons et réceptions.',
  },
  {
    id: 'nav:analytics',
    label: 'Analyses',
    description: 'Statistiques avancées.',
  },
  {
    id: 'nav:clients',
    label: 'Clients & factures',
    description: 'Fichier clients et facturation.',
  },
  {
    id: 'nav:cash',
    label: 'Gestion caisse',
    description: 'Ouverture / clôture et fonds de caisse.',
  },
  {
    id: 'nav:settings',
    label: 'Paramètres',
    description: "Configuration de l'application.",
  },
  {
    id: 'action:pos.order.create',
    label: 'POS - Créer une commande',
    description: 'Autorise la création de nouvelles commandes au POS.',
  },
  {
    id: 'action:pos.discount.apply',
    label: 'POS - Appliquer une remise',
    description: 'Autorise les remises ticket / ligne.',
  },
  {
    id: 'action:pos.order.line.cancel',
    label: 'POS - Annuler une ligne',
    description: 'Autorise la suppression d’une ou plusieurs lignes de commande.',
  },
  {
    id: 'action:pos.order.cancel.full',
    label: 'POS - Annuler la commande complète',
    description: 'Autorise l’annulation totale d’une commande.',
  },
  {
    id: 'action:pos.order.cancel.after_validation',
    label: 'POS - Annuler après validation',
    description: 'Autorise l’annulation après première validation de commande.',
  },
  {
    id: 'action:pos.order.cancel.after_preparation',
    label: 'POS - Annuler après préparation',
    description: 'Autorise l’annulation quand un article est déjà en préparation.',
  },
  {
    id: 'action:client.create',
    label: 'Clients - Ajouter',
    description: 'Autorise la création de clients.',
  },
  {
    id: 'action:client.update',
    label: 'Clients - Modifier',
    description: 'Autorise la modification des fiches clients.',
  },
  {
    id: 'action:client.delete',
    label: 'Clients - Supprimer',
    description: 'Autorise la suppression de clients.',
  },
  {
    id: 'action:stock.manage',
    label: 'Stock - Gérer les mouvements',
    description: 'Autorise les entrées/sorties/ajustements de stock.',
  },
  {
    id: 'action:product.manage',
    label: 'Articles - Gérer',
    description: 'Autorise ajout/modification/suppression des articles.',
  },
  {
    id: 'action:category.manage',
    label: 'Catégories - Gérer',
    description: 'Autorise ajout/modification/suppression des catégories.',
  },
  {
    id: 'action:promotion.manage',
    label: 'Promotions - Gérer',
    description: 'Autorise ajout/modification/suppression des promotions.',
  },
  {
    id: 'action:user.manage',
    label: 'Utilisateurs - Gérer',
    description: 'Autorise création/modification/suppression des utilisateurs.',
  },
  {
    id: 'action:cash.manage',
    label: 'Caisses - Gérer',
    description: 'Autorise la gestion des fonds de caisse.',
  },
  {
    id: 'action:settings.update',
    label: 'Paramètres - Modifier',
    description: 'Autorise la mise à jour des paramètres globaux.',
  },
];

export interface Zone {
  id: string;
  name: string;
  /** Rectangle sur le plan global (% du canevas). */
  planX?: number | null;
  planY?: number | null;
  planW?: number | null;
  planH?: number | null;
  planFill?: string | null;
}

export interface TableConfig {
  id: string;
  number: string;
  zoneId: string;
  capacity: number;
  status?: TableStatus;
  token?: string;
  reservedBy?: string | null;
  reservedAt?: number | null;
  reservedUntil?: number | null;
  /** Plan de salle (%, 0–100). */
  planX?: number | null;
  planY?: number | null;
  planW?: number | null;
  planH?: number | null;
  planShape?: 'square' | 'rect' | string | null;
}

export interface TableReservation {
  id: string;
  tableId: string;
  tableNumber: string;
  zoneId: string;
  reservedBy?: string | null;
  reservedAt: number;
  reservedUntil: number;
  releasedAt?: number | null;
}

export interface Shift {
  id: string;
  userId: string;
  userName: string;
  role: Role;
  openedById?: string | null;
  openedByName?: string | null;
  cashierId?: string | null;
  cashierName?: string | null;
  fundId?: string | null;
  fundName?: string | null;
  openedAt: number;
  closedAt?: number | null;
  openingFund: number;
  closingFund: number;
  notes?: string | null;
  status: "OPEN" | "CLOSED";
}

export interface ShiftSummary {
  shift: Shift;
  totals: {
    totalSales: number;
    cashSales: number;
    cardSales: number;
    orderCount: number;
    paidOrders: number;
    unpaidOrders: number;
    tableCount: number;
  };
}

export interface Category {
  id: string;
  name: string;
  parentId?: string;
  imageUrl?: string;
}

export enum OrderType {
  DINE_IN = 'DINE_IN',
  DELIVERY = 'DELIVERY',
  TAKE_OUT = 'TAKE_OUT'
}

export enum PaymentMethod {
  CASH = 'CASH',
  BANK_CARD = 'BANK_CARD',
  FIDELITY_CARD = 'FIDELITY_CARD',
  RESTAURANT_TICKET = 'RESTAURANT_TICKET',
  RESTAURANT_CARD = 'RESTAURANT_CARD',
  SPLIT = 'SPLIT'
}

export enum OrderStatus {
  PENDING = 'PENDING',
  PREPARING = 'PREPARING',
  READY = 'READY',
  DELIVERED = 'DELIVERED',
  PARTIAL = 'PARTIAL',
  COMPLETED = 'COMPLETED',
  INVOICED = 'INVOICED',
  CANCELLED = 'CANCELLED'
}

export interface OrderPayment {
  method: PaymentMethod;
  amount: number;
  createdAt: number;
  reference?: string;
  note?: string;
}

export interface RestaurantVoucher {
  id: string;
  code: string;
  amount: number;
  remainingAmount: number;
  status: "ACTIVE" | "USED" | "CANCELLED";
  issuedAt: number;
  usedAt?: number | null;
}

export interface RestaurantCard {
  id: string;
  code: string;
  holderName?: string | null;
  balance: number;
  active: boolean;
  createdAt: number;
}

export interface RestaurantCardMovement {
  id: string;
  type: "CREDIT" | "DEBIT";
  amount: number;
  reference?: string | null;
  createdAt: number;
  payment?: { id: string; code?: string } | null;
}

export interface PaymentRequest {
  id: string;
  tableNumber?: string;
  zoneId?: string;
  createdAt: number;
}

export enum TableStatus {
  AVAILABLE = 'AVAILABLE',
  OCCUPIED = 'OCCUPIED',
  RESERVED = 'RESERVED',
  DIRTY = 'DIRTY'
}

export interface Printer {
  id: string;
  name: string;
  /** RECEIPT = caisse ; autre = libellé du poste (Cuisine, Terrasse, Chicha, …). */
  type: string;
  /** Style du bon de préparation (modèles cuisine / bar). */
  bonProfile?: "kitchen" | "bar" | null;
  terminalNodeId?: string | null;
  terminalPrinterLocalId?: string | null;
}

export interface DetectedPrinter {
  Name: string;
  DriverName?: string;
  PortName?: string;
  Shared?: boolean;
  ShareName?: string;
}

export interface TerminalNodePrinter {
  id: string;
  terminalNodeId: string;
  printerLocalId: string;
  name: string;
  transport: "USB" | "TCP" | "SHARED" | "UNKNOWN";
  driverName?: string | null;
  portName?: string | null;
  isOnline: boolean;
  updatedAt: number;
}

export interface TerminalNodeInfo {
  id: string;
  alias: string;
  fingerprintHash: string;
  siteName?: string | null;
  osInfo?: string | null;
  agentVersion?: string | null;
  online: boolean;
  lastSeenAt?: number | null;
  updatedAt: number;
  printers: TerminalNodePrinter[];
}

export interface ProductVariant {
  id: string;
  name: string;
  price: number;
  stock?: number;
}

export interface RecipeItem {
  ingredientProductId: string;
  ingredientName?: string;
  quantity: number;
  unit: string;
}

export type ProductStockType = 'AUCUN' | 'SIMPLE' | 'FIFO' | 'SERIAL' | 'LOT';

export interface Product {
  id: string;
  code?: string;
  name: string;
  price: number;
  category: string;
  taxRate?: number | null;
  taxCode?: string | null;
  imageUrl: string;
  isPack: boolean;
  subItemIds?: string[];
  stock?: number;
  manageStock: boolean;
  visibleInPos?: boolean;
  favorite?: boolean;
  promotionPrice?: number;
  promoStart?: number;
  promoEnd?: number;
  printerIds: string[];
  variants?: ProductVariant[];
  unit?: string;
  alertLevel?: number | null;
  recipe?: RecipeItem[]; // Composition (nomenclature): choose products and quantities
  baseUnit?: string;
  stockType?: ProductStockType; // AUCUN, SIMPLE, FIFO, SERIAL, LOT
}

export interface StockMovement {
  id: string;
  productId: string;
  variantId?: string | null;
  type: 'IN' | 'OUT';
  quantity: number;
  warehouseId?: string | null;
  branchId?: string | null;
  note?: string | null;
  userName?: string | null;
  createdAt: number;
}

export interface ProductMovementRow {
  id: string;
  productId: string;
  productName: string;
  createdAt: number;
  ticketNumber?: string | null;
  referenceType?: string | null;
  quantity: number;
  type: 'IN' | 'OUT';
  reason?: string | null;
}

export interface StockDocumentLine {
  id: string;
  documentId: string;
  productId: string;
  variantId?: string | null;
  movementType: 'IN' | 'OUT';
  quantity: number;
  note?: string | null;
  createdAt: number;
}

export interface StockDocument {
  id: string;
  code: string;
  type: 'ENTRY' | 'OUT' | 'TRANSFER' | 'INVENTORY';
  status: 'POSTED' | 'DRAFT';
  warehouseId?: string | null;
  targetWarehouseId?: string | null;
  branchId?: string | null;
  note?: string | null;
  userName?: string | null;
   supplierId?: string | null;
   externalRef?: string | null;
   documentDate?: number | null;
  createdAt: number;
  lines: StockDocumentLine[];
}

export interface RealtimeStockStateRow {
  productId: string;
  productName: string;
  variantId?: string | null;
  variantName?: string;
  stock: number;
  unit: string;
  mode: 'SIMPLE' | 'VARIANT' | 'LOT' | 'FIFO' | 'SERIE';
  lotsCount: number;
}

export interface RealtimeStockDetails {
  productId: string;
  productName: string;
  stockType: ProductStockType | string;
  globalStock: number;
  unit: string;
  variants: Array<{ id: string; name: string; stock: number }>;
  lots: Array<{
    lotId: string;
    batchNo: string;
    variantId?: string | null;
    variantName?: string;
    quantity: number;
    expiryAt?: number | null;
  }>;
  serials: Array<{
    serialNo: string;
    variantId?: string | null;
    variantName?: string;
    quantity: number;
  }>;
  movements: Array<{
    id: string;
    createdAt: number;
    type: string;
    quantity: number;
    reason: string;
    referenceType: string;
    referenceId: string;
    variantId?: string | null;
    variantName?: string;
    batchNo?: string;
    quantityBefore: number;
    quantityAfter: number;
  }>;
}

export interface CogsByOrderRow {
  orderId: string;
  createdAt?: number | null;
  status?: string | null;
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number;
}

export interface CogsByDayRow {
  day: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number;
  orderCount: number;
}

export interface ProductProfitabilityRow {
  productId: string;
  productName: string;
  quantitySold: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number;
}

export interface Supplier {
  id: string;
  code?: string | null;
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  taxId?: string | null;
  createdAt: number;
}

export interface PreorderMenuItem {
  id: string;
  name: string;
  price: number;
  category?: string;
  imageUrl?: string;
  available?: boolean;
}

export interface PreorderItemInput {
  productId: string;
  quantity: number;
  note?: string | null;
}

export interface PreorderRow {
  id: string;
  code: string;
  preorderUserId?: string | null;
  customerName: string;
  customerPhone?: string | null;
  mode: "DELIVERY" | "PICKUP" | "DINE_LATER";
  status: "PENDING" | "CONFIRMED" | "READY" | "COMPLETED" | "CANCELLED";
  scheduledAt?: number | null;
  total: number;
  note?: string | null;
  createdAt: number;
  items?: Array<{
    id: string;
    preorderId: string;
    productId: string;
    name: string;
    unitPrice: number;
    quantity: number;
    total: number;
    note?: string | null;
    createdAt: number;
  }>;
}

export interface PreorderMobileUser {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
  token?: string;
}

export interface Promotion {
  id: string;
  name: string;
  type: 'PERIOD_PRICE' | 'BUY_X_GET_Y';
  active: boolean;
  startAt?: number | null;
  endAt?: number | null;
  productId?: string | null;
  promoPrice?: number | null;
  buyProductId?: string | null;
  buyQty?: number | null;
  freeProductId?: string | null;
  freeQty?: number | null;
}

export type OrderItemStatus = 'UNPAID' | 'PARTIAL' | 'PAID';
export interface OrderItem {
  id: string;
  productId: string;
  variantId?: string;
  name: string;
  price: number;
  quantity: number;
  paidQuantity: number;
  remainingQuantity: number;
  isLocked: boolean;
  status: OrderItemStatus;
  notes?: string;
  discount?: number;
  discountType?: 'PERCENT' | 'AMOUNT' | 'FREE';
  discountValue?: number;
  isPromo?: boolean;
  promoSourceId?: string;
  prepStatus?: OrderStatus;
  /** Poste de préparation (souvent KITCHEN / BAR pour le KDS ; peut refléter le libellé imprimante). */
  station?: string;
  stockBatchNo?: string;
}

export interface Client {
  id: string;
  code?: string;
  type?: 'PERSON' | 'COMPANY';
  name: string;
  email: string;
  phone: string;
  address?: string;
  cin?: string;
  birthDate?: string;
  taxId?: string;
}

export interface Order {
  id: string;
  ticketNumber?: string;
  /** Nom client (comptoir / appel) — surtout fast food. */
  clientDisplayName?: string | null;
  tableNumber?: string;
  zoneId?: string;
  /** Caisse / poste (multi-caisses). */
  terminalId?: string | null;
  type: OrderType;
  status: OrderStatus;
  items: OrderItem[];
  clientId?: string;
  serverName?: string;
  serverId?: string;
  shiftId?: string;
  invoiceId?: string;
  paymentMethod?: PaymentMethod;
  payments?: Payment[];
  paidAmount?: number;
  fiscalImdf?: string | null;
  fiscalStatus?: "SIGNED" | "REJECTED" | null;
  fiscalMode?: "ONLINE" | "OFFLINE" | null;
  fiscalErrorCode?: string | null;
  total: number;
  discount: number;
  timbre: number;
  createdAt: number;
  sessionDay: string;
}

export interface CashMovement {
  id: string;
  type: 'IN' | 'OUT';
  amount: number;
  reason: string;
  createdAt: number;
  userName: string;
}

export interface Fund {
  id: string;
  name: string;
  currency: string;
  terminalId?: string | null;
  isActive: boolean;
}

export interface FundSession {
  id: string;
  fundId: string;
  shiftId: string;
  cashierId: string;
  cashierName: string;
  openedAt: number;
  closedAt?: number | null;
  openingBalance: number;
  closingBalance: number;
  totalSales: number;
  cashSales: number;
  cardSales: number;
  status: 'OPEN' | 'CLOSED';
  notes?: string | null;
}

export interface FundMovement {
  id: string;
  fundSessionId: string;
  type: 'IN' | 'OUT';
  amount: number;
  reason: string;
  createdAt: number;
  userId?: string | null;
  userName?: string | null;
}

export interface PosSession {
  id: string;
  isOpen: boolean;
  openedAt: number;
  closedAt?: number;
  openingBalance: number;
  closingBalance?: number;
  cashSales: number;
  cardSales: number;
  totalSales: number;
  movements?: CashMovement[];
}

export interface Invoice {
  id: string;
  code?: string;
  clientId: string;
  orderIds: string[];
  total: number;
  createdAt: number;
  orders?: any[];
}

export interface Ticket {
  id: string;
  code?: string;
  orderId: string;
  items?: OrderItem[];
  total: number;
  discount: number;
  timbre: number;
  fiscalImdf?: string | null;
  fiscalStatus?: "SIGNED" | "REJECTED" | null;
  fiscalMode?: "ONLINE" | "OFFLINE" | null;
  fiscalQrPayload?: string | null;
  fiscalSignature?: string | null;
  fiscalErrorCode?: string | null;
  createdAt: number;
}

export interface Payment {
  id: string;
  code: string;
  orderId: string;
  totalPaid: number;
  paymentMethod: string;
  createdAt: number;
  items: PaymentItem[];
}

export interface PaymentItem {
  id: string;
  paymentId: string;
  orderItemId: string;
  quantityPaid: number;
  unitPrice: number;
  total: number;
}

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  branchId?: string | null;
  isActive: boolean;
  createdAt: number;
}

export interface StockLot {
  id: string;
  productId: string;
  variantId?: string | null;
  batchNo?: string | null;
  receivedAt?: number | null;
  expiryAt?: number | null;
  unitCost?: number | null;
  quantity: number;
  remainingQuantity: number;
  warehouseId?: string | null;
  branchId?: string | null;
  createdAt: number;
}

export interface StockTransferItem {
  productId: string;
  variantId?: string | null;
  quantity: number;
  note?: string | null;
}

export interface StockTransfer {
  id: string;
  status: 'REQUESTED' | 'COMPLETED' | 'REJECTED';
  sourceWarehouseId?: string | null;
  sourceBranchId?: string | null;
  destinationWarehouseId?: string | null;
  destinationBranchId?: string | null;
  items: StockTransferItem[];
  note?: string | null;
  requestedBy?: string | null;
  approvedBy?: string | null;
  requestedAt: number;
  approvedAt?: number | null;
  completedAt?: number | null;
}

export interface StockAdjustment {
  id: string;
  productId: string;
  variantId?: string | null;
  kind: 'WASTAGE' | 'EXPIRED' | 'DAMAGE' | 'CORRECTION';
  type: 'IN' | 'OUT';
  quantity: number;
  warehouseId?: string | null;
  branchId?: string | null;
  reason?: string | null;
  note?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedBy?: string | null;
  approvedBy?: string | null;
  createdAt: number;
  decidedAt?: number | null;
}

export interface SalesSummaryRow {
  date: string;
  ticketCount: number;
  revenue: number;
}

export interface SalesByProductRow {
  productId: string;
  productName: string;
  categoryId?: string | null;
  quantity: number;
  revenue: number;
}

export interface SalesByCategoryRow {
  categoryId: string | null;
  categoryLabel: string;
  quantity: number;
  revenue: number;
}

export interface SalesByServerRow {
  serverId: string | null;
  serverName: string;
  ticketCount: number;
  revenue: number;
}

export interface SalesByPaymentMethodRow {
  method: string;
  revenue: number;
  ticketCount: number;
}

export interface SalesByTimeslotRow {
  slot: string;
  start: number;
  end: number;
  ticketCount: number;
  revenue: number;
}

export interface CashClosingRow {
  sessionId: string;
  fundId: string;
  fundName: string;
  currency: string;
  cashierId?: string | null;
  cashierName?: string | null;
  openedAt: number;
  closedAt?: number | null;
  openingBalance: number;
  closingBalance: number;
  cashSales: number;
  cardSales: number;
  totalSales: number;
  movementsIn: number;
  movementsOut: number;
  expectedClosing: number;
  difference: number;
  status: string;
}

export interface TopCustomerRow {
  clientId: string;
  orderCount: number;
  revenue: number;
}

export type ApiResponseMap = {
  '/pos/products': Product[];
  '/pos/categories': Category[];
  '/pos/promotions': Promotion[];
  '/pos/stock/movements': StockMovement[];
  '/pos/stock/movements/:id': StockMovement;
  '/pos/stock/documents': StockDocument[];
  '/pos/stock/realtime-state': RealtimeStockStateRow[];
  '/pos/stock/realtime-state/details': RealtimeStockDetails;
  '/pos/preorders/menu': PreorderMenuItem[];
  '/pos/preorders': PreorderRow[];
  '/pos/stock/product-movements': ProductMovementRow[];
  '/pos/stock/warehouses': Warehouse[];
  '/pos/stock/transfers': StockTransfer[];
  '/pos/stock/adjustments': StockAdjustment[];
  '/pos/stock/reports/product-profitability': ProductProfitabilityRow[];
  '/pos/stock/reports/cogs-by-order': CogsByOrderRow[];
  '/pos/stock/reports/cogs-by-day': CogsByDayRow[];
  '/pos/reports/sales/summary': {
    period: { from: number | null; to: number | null };
    items: SalesSummaryRow[];
    totals: { ticketCount: number; revenue: number; averageTicket: number };
  };
  '/pos/reports/sales/by-product': {
    period: { from: number | null; to: number | null };
    items: SalesByProductRow[];
    totals: { quantity: number; revenue: number };
  };
  '/pos/reports/sales/by-category': {
    period: { from: number | null; to: number | null };
    items: SalesByCategoryRow[];
    totals: { quantity: number; revenue: number };
  };
  '/pos/reports/sales/by-server': {
    period: { from: number | null; to: number | null };
    items: SalesByServerRow[];
    totals: { ticketCount: number; revenue: number };
  };
  '/pos/reports/sales/by-payment-method': {
    period: { from: number | null; to: number | null };
    items: SalesByPaymentMethodRow[];
    totals: { ticketCount: number; revenue: number };
  };
  '/pos/reports/sales/by-timeslot': {
    period: { from: number | null; to: number | null };
    intervalMinutes: number;
    items: SalesByTimeslotRow[];
    totals: { ticketCount: number; revenue: number };
  };
  '/pos/reports/cash/closing': {
    period: { from: number | null; to: number | null };
    items: CashClosingRow[];
  };
  '/pos/reports/customers/top': {
    period: { from: number | null; to: number | null };
    items: TopCustomerRow[];
  };
  '/pos/auth/login': User | null;
  '/pos/session': PosSession | null;
  '/pos/session/movement': PosSession | null;
  '/pos/session/open': PosSession | null;
  '/pos/session/close': FundSession | null;
  '/pos/orders': Order[];
  '/pos/orders/:id': Order;
  '/pos/orders/:id/payments': Order;
  '/pos/shifts/active': Shift | null;
  '/pos/shifts/active/:userId': Shift | null;
  '/pos/shifts/open': Shift | null;
  '/pos/shifts/close': Shift | null;
  '/pos/shifts/summary': ShiftSummary[];
  '/pos/shifts': Shift[];
  '/pos/funds': Fund[];
  '/pos/funds/:id': Fund;
  '/pos/fund-sessions/active': FundSession | null;
  '/pos/fund-sessions/open': FundSession | null;
  '/pos/fund-sessions/close': FundSession | null;
  '/pos/fund-sessions/movement': FundMovement | null;
  '/pos/fund-sessions/movements': FundMovement[];
  '/pos/fund-sessions': FundSession[];
  '/pos/tables/reservations': TableReservation[];
  '/pos/products/:id': Product;
  '/pos/categories/:id': Category;
  '/pos/promotions/:id': Promotion;
  '/pos/users/:id': User;
  '/pos/zones/:id': Zone;
  '/pos/tables/:id': TableConfig;
  '/pos/zones': Zone[];
  '/pos/tables': TableConfig[];
  '/pos/users': User[];
  '/pos/settings': any;
  '/pos/printers': Printer[];
  '/pos/printers/:id': { ok: boolean };
  '/pos/printers/test-print': {
    ok: boolean;
    printer?: string;
    printerId?: string;
    profile?: string;
  };
  '/pos/printers/detected': DetectedPrinter[];
  '/pos/terminals': {
    terminals: TerminalNodeInfo[];
    bindings: Printer[];
  };
  '/pos/printers/:id/bind-terminal': Printer;
  '/pos/clients': Client[];
  '/pos/clients/:id': Client;
  '/pos/invoices': Invoice[];
  '/pos/invoices/:id': Invoice;
  '/pos/suppliers': Supplier[];
  '/pos/suppliers/:id': Supplier;
  '/pos/orders/:orderId/tickets': Ticket[];
  '/pos/tickets/:id': Ticket;

  // support updating order status via a dedicated path
  '/pos/orders/:id/status': Order;
  '/pos/client/table/:token': { table: TableConfig; activeOrder: Order | null } | null;
  '/pos/client/orders': Order[];
  '/pos/client/orders/:orderId': Order;
  '/pos/client/orders/:orderId/cancel': Order | null;
  '/pos/client/orders/:orderId/request-payment': { ok?: boolean };
};
