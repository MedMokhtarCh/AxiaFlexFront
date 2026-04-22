import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { usePOS } from "../store/POSContext";
import {
  OrderItem,
  OrderType,
  Product,
  PaymentMethod,
  OrderPayment,
  ProductVariant,
  OrderStatus,
  Role,
  PosDiscountPreset,
  DEFAULT_POS_DISCOUNT_PRESETS,
  Printer,
} from "../types";
import { notifySuccess, notifyError, notifyInfo } from "../utils/notify";
import { resolveItemStation } from "../utils/kdsStation";
import { isReceiptPrinter, printerBonProfile } from "../utils/printerUtils";
import { resolveAssetUrl } from "../utils/resolveAssetUrl";
import {
  Trash2,
  Plus,
  Minus,
  ChevronLeft,
  CreditCard,
  X,
  Banknote,
  Tag,
  Percent,
  Gift,
  ChevronRight,
  Calculator,
  ShoppingCart,
  User,
  Sparkles,
  StickyNote,
  Edit3,
  CheckCircle2,
  Info,
  Check,
  Loader2,
} from "lucide-react";

const safeNumber = (value: unknown) =>
  Number.isFinite(Number(value)) ? Number(value) : 0;
const formatAmount = (value: unknown, digits = 3) =>
  safeNumber(value).toFixed(digits);
const parseNumber = (value: string) => parseFloat(value.replace(",", ".")) || 0;

type MixedPaymentLine = {
  id: string;
  method: PaymentMethod;
  amount: string;
  reference: string;
};
type RestaurantTicketCodeLine = {
  id: string;
  code: string;
  amount: string;
};
type TicketInputTarget = { lineId: string; field: "code" | "amount" } | null;

/** Articles proposés au caissier : cohérent avec « Visible dans POS » en gestion produits (false = masqué). */
const isProductVisibleInPos = (p: Product) => p.visibleInPos !== false;

interface OrderScreenProps {
  initialTable?: string;
  initialMode?: OrderType;
  existingOrderId?: string;
  /** Depuis le plan de salle : ouvrir directement le même modal « Règlement » que la caisse. */
  initialOpenPayment?: boolean;
  onConsumedInitialOpenPayment?: () => void;
  onBack: () => void;
}

const OrderScreen: React.FC<OrderScreenProps> = ({
  initialTable,
  initialMode,
  existingOrderId,
  initialOpenPayment = false,
  onConsumedInitialOpenPayment,
  onBack,
}) => {
  const {
    products,
    categories,
    createOrder,
    updateOrder,
    updateOrderStatus,
    addOrderPayment,
    addOrderPaymentsBatch,
    orders,
    printers,
    settings,
    currentUser,
    allUsers,
    createTicket,
    printTicket,
    printOrderClientReceiptProvisional,
    downloadTicketPdf,
    getAvailableStockLots,
  } = usePOS();
  const [activeCategoryId, setActiveCategoryId] = useState<string>("favorites");
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [orderType, setOrderType] = useState<OrderType>(
    initialMode || OrderType.DINE_IN,
  );
  const [tableNum, setTableNum] = useState(initialTable || "");

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showMixedPaymentModal, setShowMixedPaymentModal] = useState(false);
  const [mixedAmountTargetId, setMixedAmountTargetId] = useState<string | null>(
    null,
  );
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<any>(null);
  const [completedTicketId, setCompletedTicketId] = useState<string | null>(null);
  const [completedFiscalInfo, setCompletedFiscalInfo] = useState<{
    status: "SIGNED" | "REJECTED";
    mode?: "ONLINE" | "OFFLINE";
    errorCode?: string;
    imdf?: string;
  } | null>(null);
  const [ticketPreviewMode, setTicketPreviewMode] = useState<"ORDER_ONLY" | "PAYMENT">("PAYMENT");
  const [ticketPreviewTab, setTicketPreviewTab] = useState<"KITCHEN" | "BAR" | "CLIENT">("CLIENT");
  const [mixedPayments, setMixedPayments] = useState<MixedPaymentLine[]>([]);
  const [showRestaurantCardModal, setShowRestaurantCardModal] = useState(false);
  const [restaurantCardCode, setRestaurantCardCode] = useState("");
  const [showRestaurantTicketModal, setShowRestaurantTicketModal] = useState(false);
  const [restaurantTicketLines, setRestaurantTicketLines] = useState<
    RestaurantTicketCodeLine[]
  >([{ id: `rt-${Date.now()}`, code: "", amount: "0" }]);
  const [ticketInputTarget, setTicketInputTarget] = useState<TicketInputTarget>(
    null,
  );
  const [requirePrintOnPayment, setRequirePrintOnPayment] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const scannerBufferRef = useRef("");
  const scannerLastTsRef = useRef(0);
  const shouldAutoFocusPaymentRef = useRef(false);
  const initialPaymentIntentConsumedRef = useRef(false);
  const autoPrintedTicketRef = useRef<string | null>(null);
  const autoPrintedProvisionalOrderRef = useRef<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelAdminPin, setCancelAdminPin] = useState("");

  const [showVariantModal, setShowVariantModal] = useState(false);
  const [selectedProductForVariant, setSelectedProductForVariant] =
    useState<Product | null>(null);

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [tempDiscountType, setTempDiscountType] = useState<
    "percent" | "amount"
  >("percent");
  const [tempDiscountValue, setTempDiscountValue] = useState("");

  const [ticketDiscount, setTicketDiscount] = useState<{
    type: "PERCENT" | "AMOUNT" | null;
    value: number;
  }>({ type: null, value: 0 });
  const [ticketTempType, setTicketTempType] = useState<"PERCENT" | "AMOUNT">(
    "PERCENT",
  );
  const [ticketTempValue, setTicketTempValue] = useState("");
  const [fastFoodClientName, setFastFoodClientName] = useState("");

  useEffect(() => {
    if (existingOrderId) {
      const order = orders.find((o) => o.id === existingOrderId);
      if (order) {
        setCart(order.items);
        setOrderType(order.type);
        setTableNum(order.tableNumber || "");
        if (settings.companyType === "FAST_FOOD") {
          setFastFoodClientName(String(order.clientDisplayName || "").trim());
        }
      }
    } else {
      setFastFoodClientName("");
    }
  }, [existingOrderId, orders, settings.companyType]);

  useEffect(() => {
    if (!initialOpenPayment) {
      initialPaymentIntentConsumedRef.current = false;
      return;
    }
    if (!existingOrderId || initialPaymentIntentConsumedRef.current) return;
    const order = orders.find((o) => o.id === existingOrderId);
    if (!order || !Array.isArray(order.items) || order.items.length === 0) return;
    initialPaymentIntentConsumedRef.current = true;
    setShowPaymentModal(true);
    onConsumedInitialOpenPayment?.();
  }, [initialOpenPayment, existingOrderId, orders, onConsumedInitialOpenPayment]);

  useEffect(() => {
    if (cart.length === 0) {
      setTicketDiscount({ type: null, value: 0 });
    }
  }, [cart.length]);

  const posDiscountPresets = useMemo(() => {
    const p = settings.posDiscountPresets;
    if (Array.isArray(p) && p.length > 0) return p as PosDiscountPreset[];
    return DEFAULT_POS_DISCOUNT_PRESETS;
  }, [settings.posDiscountPresets]);

  const productsForPos = useMemo(
    () => products.filter(isProductVisibleInPos),
    [products],
  );

  const categoriesById = useMemo(() => {
    const map = new Map<string, (typeof categories)[number]>();
    for (const c of categories) map.set(String(c.id), c);
    return map;
  }, [categories]);

  const childCategoryIdsByParentId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of categories) {
      const pid = c.parentId ? String(c.parentId) : "";
      if (!pid) continue;
      const arr = map.get(pid) || [];
      arr.push(String(c.id));
      map.set(pid, arr);
    }
    return map;
  }, [categories]);

  const categoryIdsWithPosProducts = useMemo(() => {
    const ids = new Set<string>();
    for (const p of productsForPos) {
      const cid = p.category != null ? String(p.category).trim() : "";
      if (!cid) continue;
      ids.add(cid);
      let current = categoriesById.get(cid);
      // Also mark ancestors so parent tabs stay visible when products are in sub-categories.
      while (current?.parentId) {
        const parentId = String(current.parentId);
        ids.add(parentId);
        current = categoriesById.get(parentId);
      }
    }
    return ids;
  }, [productsForPos, categoriesById]);

  const categoryFilterIds = useMemo(() => {
    if (activeCategoryId === "all") return null;
    const ids = new Set<string>([activeCategoryId]);
    const queue = [activeCategoryId];
    while (queue.length > 0) {
      const current = queue.shift() as string;
      const children = childCategoryIdsByParentId.get(current) || [];
      for (const childId of children) {
        if (ids.has(childId)) continue;
        ids.add(childId);
        queue.push(childId);
      }
    }
    return ids;
  }, [activeCategoryId, childCategoryIdsByParentId]);

  const rootCategoryIdForActive = useMemo(() => {
    if (activeCategoryId === "favorites") return null;
    let currentId = activeCategoryId;
    let current = categoriesById.get(currentId);
    while (current?.parentId) {
      currentId = String(current.parentId);
      current = categoriesById.get(currentId);
    }
    return currentId;
  }, [activeCategoryId, categoriesById]);

  const rootCategories = useMemo(
    () =>
      categories
        .filter((c) => !c.parentId)
        .filter((c) => categoryIdsWithPosProducts.has(c.id)),
    [categories, categoryIdsWithPosProducts],
  );

  const activeRootChildren = useMemo(() => {
    if (!rootCategoryIdForActive) return [];
    return categories.filter((c) => String(c.parentId || "") === rootCategoryIdForActive);
  }, [categories, rootCategoryIdForActive]);

  const filteredProducts = useMemo(() => {
    if (activeCategoryId === "favorites") {
      return productsForPos.filter((p) => Boolean((p as any).favorite));
    }
    return productsForPos.filter((p) =>
      categoryFilterIds?.has(String(p.category || "")),
    );
  }, [productsForPos, activeCategoryId, categoryFilterIds]);

  const isVariantOutOfStock = useCallback(
    (variant?: ProductVariant | null) =>
      Boolean(
        variant &&
          (settings as any).preventSaleOnInsufficientStock !== false &&
          Number(variant.stock ?? 0) <= 0,
      ),
    [settings],
  );

  const isProductOutOfStock = useCallback(
    (product: Product) => {
      if ((settings as any).preventSaleOnInsufficientStock === false) return false;
      if (!product.manageStock) return false;
      if (Array.isArray(product.variants) && product.variants.length > 0) {
        return product.variants.every((v) => Number(v.stock ?? 0) <= 0);
      }
      return Number(product.stock ?? 0) <= 0;
    },
    [settings],
  );

  useEffect(() => {
    if (
      activeCategoryId !== "favorites" &&
      !categoryIdsWithPosProducts.has(activeCategoryId)
    ) {
      setActiveCategoryId("favorites");
    }
  }, [activeCategoryId, categoryIdsWithPosProducts]);

  const calculateItemTotal = (item: OrderItem) => {
    return item.price * item.quantity - (item.discount || 0);
  };

  /** Sous-total articles après remises lignes (base avant remise ticket). */
  const cartSubtotalLines = useMemo(
    () => cart.reduce((sum, item) => sum + calculateItemTotal(item), 0),
    [cart],
  );

  const lineDiscountSum = useMemo(
    () => cart.reduce((s, i) => s + (i.discount || 0), 0),
    [cart],
  );

  const ticketDiscountMoney = useMemo(() => {
    if (!ticketDiscount.type || ticketDiscount.value <= 0) return 0;
    const v = Number(ticketDiscount.value);
    if (!Number.isFinite(v) || v <= 0) return 0;
    if (ticketDiscount.type === "PERCENT") {
      const pct = Math.min(100, Math.max(0, v));
      return cartSubtotalLines * (pct / 100);
    }
    return Math.min(v, cartSubtotalLines);
  }, [cartSubtotalLines, ticketDiscount]);

  const netAfterTicketDiscount = Math.max(
    0,
    cartSubtotalLines - ticketDiscountMoney,
  );

  const tvaAmount = useMemo(() => {
    if (!settings.applyTvaToTicket) return 0;
    const rate = Number(settings.tvaRate);
    if (!Number.isFinite(rate) || rate <= 0) return 0;
    return netAfterTicketDiscount * (rate / 100);
  }, [settings.applyTvaToTicket, settings.tvaRate, netAfterTicketDiscount]);

  const timbreAmount = useMemo(() => {
    if (!settings.applyTimbreToTicket) return 0;
    const t = Number(settings.timbreValue);
    return Number.isFinite(t) ? t : 0;
  }, [settings.applyTimbreToTicket, settings.timbreValue]);

  const finalTotal = useMemo(
    () => netAfterTicketDiscount + tvaAmount + timbreAmount,
    [netAfterTicketDiscount, tvaAmount, timbreAmount],
  );

  const totalDiscountSaved = lineDiscountSum + ticketDiscountMoney;
  const isRestaurantCafe =
    settings.companyType === "RESTAURANT_CAFE";
  const isFastFood = settings.companyType === "FAST_FOOD";
  const isRestaurantFlow = isRestaurantCafe || isFastFood;

  const fastFoodClientExtras = useCallback(() => {
    if (!isFastFood) return {} as { clientDisplayName?: string | null };
    return { clientDisplayName: fastFoodClientName.trim() || null };
  }, [isFastFood, fastFoodClientName]);

  const prepLookupMaps = useMemo(
    () => ({
      productsById: new Map(products.map((p) => [p.id, p])),
      printersById: new Map(printers.map((p) => [p.id, p])),
    }),
    [products, printers],
  );

  useEffect(() => {
    if (!showPaymentModal) return;
    setMixedPayments([
      {
        id: `pm-${Date.now()}`,
        method: PaymentMethod.CASH,
        amount: formatAmount(finalTotal),
        reference: "",
      },
    ]);
    shouldAutoFocusPaymentRef.current = true;
  }, [showPaymentModal, finalTotal]);

  useEffect(() => {
    if (!showPaymentModal) return;
    if (!shouldAutoFocusPaymentRef.current) return;
    const target = mixedPayments.find(
      (row) =>
        row.method === PaymentMethod.RESTAURANT_TICKET ||
        row.method === PaymentMethod.RESTAURANT_CARD,
    );
    if (!target) return;
    const timer = window.setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>(
        `input[data-payment-reference-id="${target.id}"]`,
      );
      if (el) {
        el.focus();
        el.select();
      }
      shouldAutoFocusPaymentRef.current = false;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [showPaymentModal, mixedPayments]);

  const applyScannedReference = (scannedCode: string) => {
    const code = String(scannedCode || "").trim();
    if (!code) return;
    setMixedPayments((prev) => {
      const next = [...prev];
      const activeEl = document.activeElement as HTMLInputElement | null;
      const focusedId = activeEl?.dataset?.paymentReferenceId || "";
      if (focusedId) {
        const idx = next.findIndex((r) => r.id === focusedId);
        if (idx >= 0) {
          next[idx] = { ...next[idx], reference: code };
          return next;
        }
      }
      const targetIdx = next.findIndex(
        (r) =>
          (r.method === PaymentMethod.RESTAURANT_TICKET ||
            r.method === PaymentMethod.RESTAURANT_CARD) &&
          !String(r.reference || "").trim(),
      );
      if (targetIdx >= 0) {
        next[targetIdx] = { ...next[targetIdx], reference: code };
        return next;
      }
      next.push({
        id: `pm-${Date.now()}-${next.length}`,
        method: PaymentMethod.RESTAURANT_TICKET,
        amount: "0",
        reference: code,
      });
      return next;
    });
    notifySuccess(`Code scanné: ${code}`);
  };

  useEffect(() => {
    if (!showPaymentModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const now = Date.now();
      if (now - scannerLastTsRef.current > 80) {
        scannerBufferRef.current = "";
      }
      scannerLastTsRef.current = now;

      if (e.key === "Enter") {
        const buf = scannerBufferRef.current.trim();
        scannerBufferRef.current = "";
        if (buf.length >= 3) {
          e.preventDefault();
          applyScannedReference(buf);
        }
        return;
      }
      if (e.key.length === 1) {
        scannerBufferRef.current += e.key;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      scannerBufferRef.current = "";
    };
  }, [showPaymentModal]);

  const addToCart = async (product: Product, variant?: ProductVariant) => {
    if (isProductOutOfStock(product) && !variant) {
      notifyInfo(`Article hors stock: ${product.name}`);
      return;
    }
    if (variant && isVariantOutOfStock(variant)) {
      notifyInfo(`Variation hors stock: ${product.name} - ${variant.name}`);
      return;
    }
    const priceToUse = variant
      ? variant.price
      : product.promotionPrice || product.price;
    const itemName = variant
      ? `${product.name} (${variant.name})`
      : product.name;
    const variantId = variant?.id;
    const stockType = String((product as any)?.stockType || "SIMPLE").toUpperCase();
    let stockBatchNo: string | undefined;
    if (product.manageStock && (stockType === "LOT" || stockType === "SERIAL")) {
      const lots = await getAvailableStockLots({
        productId: product.id,
        variantId: variantId || null,
      });
      const available = (lots || []).filter(
        (l: any) => Number((l as any)?.remainingQuantity || 0) > 0,
      );
      if (!available.length) {
        notifyError(`Aucun ${stockType === "SERIAL" ? "numéro de série" : "lot"} disponible pour ${product.name}`);
        return;
      }
      const options = available
        .map((l: any) => `${String((l as any)?.batchNo || "-")} (qte ${Number((l as any)?.remainingQuantity || 0)})`)
        .join(", ");
      const inputLabel =
        stockType === "SERIAL"
          ? `Choisir numéro de série pour ${itemName}\nDisponibles: ${options}`
          : `Choisir numéro de lot pour ${itemName}\nDisponibles: ${options}`;
      const picked = window.prompt(inputLabel, String((available[0] as any)?.batchNo || ""));
      const pickedTrim = String(picked || "").trim();
      if (!pickedTrim) return;
      const found = available.find(
        (l: any) => String((l as any)?.batchNo || "").trim() === pickedTrim,
      );
      if (!found) {
        notifyError(`${stockType === "SERIAL" ? "Série" : "Lot"} introuvable`);
        return;
      }
      if (
        stockType === "SERIAL" &&
        cart.some(
          (it) =>
            it.productId === product.id &&
            String((it as any).stockBatchNo || "") === pickedTrim,
        )
      ) {
        notifyError("Ce numéro de série est déjà ajouté au panier.");
        return;
      }
      stockBatchNo = pickedTrim;
    }
    const station = resolveItemStation(
      { productId: product.id, station: undefined },
      prepLookupMaps.productsById,
      prepLookupMaps.printersById,
    );

    setCart((prev) => {
      const existing = prev.find(
        (item) =>
          item.productId === product.id &&
          item.variantId === variantId &&
          String((item as any).stockBatchNo || "") === String(stockBatchNo || ""),
      );
      const serialMode = stockType === "SERIAL";
      if (existing) {
        if (serialMode) return prev;
        return prev.map((item) =>
          item.productId === product.id &&
          item.variantId === variantId &&
          String((item as any).stockBatchNo || "") === String(stockBatchNo || "")
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }
      return [
        ...prev,
        {
          id: `cart-${Date.now()}`,
          productId: product.id,
          variantId,
          name: itemName,
          price: priceToUse,
          quantity: 1,
          paidQuantity: 0,
          remainingQuantity: 1,
          isLocked: false,
          status: "UNPAID",
          notes: "",
          discount: 0,
          station,
          stockBatchNo,
        },
      ];
    });

    setShowVariantModal(false);
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.id === itemId
            ? { ...item, quantity: Math.max(0, item.quantity + delta) }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  };

  const updateItemNotes = (itemId: string, newNotes: string) => {
    setCart((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, notes: newNotes } : item,
      ),
    );
  };

  const addQuickNote = (itemId: string, note: string) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          const current = item.notes || "";
          if (current.includes(note)) return item;
          const updated = current ? `${current}, ${note}` : note;
          return { ...item, notes: updated };
        }
        return item;
      }),
    );
  };

  const applyDiscount = (itemId: string) => {
    const val = parseFloat(tempDiscountValue) || 0;
    setCart((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          let disc = 0;
          if (tempDiscountType === "percent") {
            disc = item.price * item.quantity * (val / 100);
          } else {
            disc = val;
          }
          return { ...item, discount: disc };
        }
        return item;
      }),
    );
    setTempDiscountValue("");
  };

  const applyPredefinedOffer = (
    itemId: string,
    offerName: string,
    type: "percent" | "amount",
    value: number,
  ) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          let disc = 0;
          if (type === "percent") {
            disc = item.price * item.quantity * (value / 100);
          } else {
            disc = value;
          }
          return {
            ...item,
            discount: disc,
            notes: item.notes
              ? `${item.notes} (Offre: ${offerName})`
              : `Offre: ${offerName}`,
          };
        }
        return item;
      }),
    );
  };

  const applyPresetToLine = (itemId: string, preset: PosDiscountPreset) => {
    const type = preset.type === "PERCENT" ? "percent" : "amount";
    applyPredefinedOffer(itemId, preset.label, type, preset.value);
  };

  const applyTicketPreset = (preset: PosDiscountPreset) => {
    setTicketDiscount({ type: preset.type, value: preset.value });
  };

  const applyTicketDiscountManual = () => {
    const val = parseFloat(ticketTempValue.replace(",", ".")) || 0;
    if (val <= 0) return;
    setTicketDiscount({ type: ticketTempType, value: val });
    setTicketTempValue("");
  };

  const printTicketCopies = useCallback(
    async (ticketId: string) => {
      const copies = Math.max(1, Number(settings.clientTicketPrintCopies || 1));
      await printTicket(ticketId, { copies });
    },
    [printTicket, settings.clientTicketPrintCopies],
  );

  const toFiscalInfo = useCallback((ticket: any) => {
    const statusRaw = String(ticket?.fiscalStatus || "")
      .trim()
      .toUpperCase();
    if (statusRaw !== "SIGNED" && statusRaw !== "REJECTED") return null;
    const modeRaw = String(ticket?.fiscalMode || "")
      .trim()
      .toUpperCase();
    return {
      status: statusRaw as "SIGNED" | "REJECTED",
      mode:
        modeRaw === "ONLINE" || modeRaw === "OFFLINE"
          ? (modeRaw as "ONLINE" | "OFFLINE")
          : undefined,
      errorCode: ticket?.fiscalErrorCode
        ? String(ticket.fiscalErrorCode)
        : undefined,
      imdf: ticket?.fiscalImdf ? String(ticket.fiscalImdf) : undefined,
      qrPayload: ticket?.fiscalQrPayload
        ? String(ticket.fiscalQrPayload)
        : undefined,
    };
  }, []);

  const handleCompletePayment = async (
    method: PaymentMethod,
    paymentBreakdown?: OrderPayment[],
  ) => {
    if (isProcessingPayment) return;
    setIsProcessingPayment(true);
    const effectiveMethod =
      paymentBreakdown && paymentBreakdown.length > 1
        ? PaymentMethod.SPLIT
        : method;
    const orderData = {
      id: existingOrderId || `ord-${Date.now()}`,
      items: cart,
      total: finalTotal,
      discount: lineDiscountSum + ticketDiscountMoney,
      timbre: timbreAmount,
      /** Pour l’aperçu ticket (non persisté tel quel côté API). */
      vatAmount: tvaAmount,
      ticketDiscountMoney,
      type: orderType,
      tableNumber: tableNum,
      serverName: currentUser?.name || "Inconnu",
      paymentMethod: effectiveMethod,
      payments: paymentBreakdown || [],
      createdAt: Date.now(),
    };

    try {
      let orderId = existingOrderId || "";
      if (orderId) {
        await updateOrder(
          orderId,
          cart,
          finalTotal,
          lineDiscountSum + ticketDiscountMoney,
          true,
          OrderStatus.PENDING,
          {
            timbre: timbreAmount,
            paymentMethod: effectiveMethod,
            ...fastFoodClientExtras(),
          },
        );
      } else {
        orderId = await createOrder({
          ...orderData,
          status: "PENDING" as any,
          print: true,
          ...fastFoodClientExtras(),
        } as any);
      }

      const lines: OrderPayment[] =
        paymentBreakdown && paymentBreakdown.length > 0
          ? paymentBreakdown
          : [
              {
                method,
                amount: finalTotal,
                createdAt: Date.now(),
              },
            ];

      const normalizedLines: Array<
        OrderPayment & { metadata?: Record<string, unknown> }
      > = [];
      for (const line of lines) {
        const ref = line.reference ? String(line.reference).trim() : "";
        if (line.method === PaymentMethod.RESTAURANT_TICKET && !ref) {
          throw new Error("Code ticket restaurant obligatoire.");
        }
        if (line.method === PaymentMethod.RESTAURANT_CARD && !ref) {
          throw new Error("Code carte restaurant obligatoire.");
        }
        const metadata: Record<string, unknown> = {};
        if (line.method === PaymentMethod.RESTAURANT_TICKET && ref) {
          metadata.voucherCode = ref;
        }
        if (line.method === PaymentMethod.RESTAURANT_CARD && ref) {
          metadata.cardCode = ref;
        }
        normalizedLines.push({
          ...line,
          reference: ref || undefined,
          metadata,
        });
      }

      let latestPaidOrder: any = null;
      if (normalizedLines.length > 1) {
        latestPaidOrder = await addOrderPaymentsBatch(
          orderId,
          normalizedLines.map((line) => ({
            method: line.method,
            amount: Number(line.amount || 0),
            reference: line.reference,
            metadata: (line as any).metadata,
          })),
        );
      } else if (normalizedLines.length === 1) {
        const line = normalizedLines[0];
        latestPaidOrder = await addOrderPayment(orderId, line.method, Number(line.amount || 0), undefined, {
          reference: line.reference ? String(line.reference) : undefined,
          metadata: (line as any).metadata,
        });
      }

      const ticketsFromPayment = Array.isArray((latestPaidOrder as any)?.tickets)
        ? (latestPaidOrder as any).tickets
        : [];
      let latestTicketData: any =
        ticketsFromPayment.length > 0
          ? ticketsFromPayment[ticketsFromPayment.length - 1]
          : null;
      let createdTicketId = String(
        ticketsFromPayment.length > 0
          ? ticketsFromPayment[ticketsFromPayment.length - 1]?.id || ""
          : "",
      );
      if (!createdTicketId) {
        const ticket = await createTicket(orderId, {
          items: cart,
          total: finalTotal,
          discount: lineDiscountSum + ticketDiscountMoney,
          timbre: timbreAmount,
        });
        createdTicketId = String(ticket?.id || "");
        latestTicketData = ticket;
      }
      const fiscalInfo = toFiscalInfo(latestTicketData);
      if (createdTicketId && settings.autoDownloadReceiptPdfOnClient) {
        void downloadTicketPdf(createdTicketId).catch(() => undefined);
      }
      const doneOrderData = { ...orderData, id: orderId };
      setCompletedOrder(doneOrderData);
      setCompletedTicketId(createdTicketId || null);
      setCompletedFiscalInfo(fiscalInfo);
      setShowPaymentModal(false);
      setShowMixedPaymentModal(false);
      setCart([]);
      setEditingItemId(null);
      setTicketDiscount({ type: null, value: 0 });
      if (isFastFood) setFastFoodClientName("");
      notifySuccess("Paiement effectué avec succès.");
      if (fiscalInfo?.status === "SIGNED") {
        notifyInfo(
          `Fiscalisation NACEF: SIGNED${fiscalInfo.mode ? ` (${fiscalInfo.mode})` : ""}${fiscalInfo.imdf ? ` • ${fiscalInfo.imdf}` : ""}`,
        );
      } else if (fiscalInfo?.status === "REJECTED") {
        notifyError(
          `Fiscalisation NACEF rejetée${fiscalInfo.errorCode ? ` (${fiscalInfo.errorCode})` : ""}`,
        );
      }

      const shouldPrintPreview =
        settings.printPreviewOnValidate || requirePrintOnPayment;
      if (shouldPrintPreview) {
        setTicketPreviewMode("PAYMENT");
        setShowTicketModal(true);
      } else {
        if (createdTicketId) {
          void printTicketCopies(createdTicketId).catch(() => undefined);
        }
      }
      setRequirePrintOnPayment(false);
    } catch (e: any) {
      notifyError(
        e?.message
          ? `Paiement: ${String(e.message)}`
          : "Impossible de valider le paiement",
      );
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const activeEditingItem = useMemo(
    () => cart.find((i) => i.id === editingItemId),
    [cart, editingItemId],
  );

  const mixedPaidTotal = useMemo(
    () =>
      mixedPayments.reduce(
        (sum, row) => sum + parseNumber(String(row.amount || "0")),
        0,
      ),
    [mixedPayments],
  );
  const mixedRemaining = useMemo(
    () => Number((finalTotal - mixedPaidTotal).toFixed(3)),
    [finalTotal, mixedPaidTotal],
  );
  const ticketPreviewShellClass = useMemo(() => {
    if (Boolean((settings as any)?.nacefEnabled)) {
      return "w-full max-w-[340px] bg-white p-8 rounded-3xl border-2 border-slate-900 shadow-2xl";
    }
    switch (settings.clientTicketTemplate) {
      case "COMPACT":
        return "w-full max-w-[300px] bg-white p-6 rounded-2xl border shadow-2xl";
      case "MODERN":
        return "w-full max-w-[340px] bg-gradient-to-b from-white to-slate-50 p-8 rounded-[2rem] border shadow-2xl";
      case "CLASSIC":
      default:
        return "w-full max-w-[320px] bg-white p-8 rounded-3xl border shadow-2xl";
    }
  }, [settings.clientTicketTemplate, (settings as any)?.nacefEnabled]);
  const enabledPaymentMethods = useMemo(() => {
    const raw = Array.isArray(settings.paymentEnabledMethods)
      ? settings.paymentEnabledMethods
      : [
          PaymentMethod.CASH,
          PaymentMethod.BANK_CARD,
          PaymentMethod.RESTAURANT_CARD,
          PaymentMethod.RESTAURANT_TICKET,
        ];
    const allowed = new Set([
      PaymentMethod.CASH,
      PaymentMethod.BANK_CARD,
      PaymentMethod.RESTAURANT_CARD,
      PaymentMethod.RESTAURANT_TICKET,
    ]);
    const filtered = raw.filter((m) => allowed.has(m));
    return filtered.length > 0 ? filtered : [PaymentMethod.CASH];
  }, [settings.paymentEnabledMethods]);
  const ticketLayout = useMemo(
    () => ({
      headerText: settings.clientTicketLayout?.headerText || "",
      footerText: settings.clientTicketLayout?.footerText || "",
      showLogo: settings.clientTicketLayout?.showLogo ?? true,
      showAddress: settings.clientTicketLayout?.showAddress ?? true,
      showPhone: settings.clientTicketLayout?.showPhone ?? true,
      showTaxId: settings.clientTicketLayout?.showTaxId ?? true,
      showServer: settings.clientTicketLayout?.showServer ?? true,
      showTable: settings.clientTicketLayout?.showTable ?? true,
      showDate: settings.clientTicketLayout?.showDate ?? true,
      showTicketNumber: settings.clientTicketLayout?.showTicketNumber ?? true,
      showPriceHt: settings.clientTicketLayout?.showPriceHt ?? true,
      showTicketDiscount: settings.clientTicketLayout?.showTicketDiscount ?? true,
      showTimbre: settings.clientTicketLayout?.showTimbre ?? true,
      showTva: settings.clientTicketLayout?.showTva ?? true,
      showPriceTtc: settings.clientTicketLayout?.showPriceTtc ?? true,
      showQrCode: settings.clientTicketLayout?.showQrCode ?? false,
      showItemUnitPrice: settings.clientTicketLayout?.showItemUnitPrice ?? true,
      showPaymentMethod: settings.clientTicketLayout?.showPaymentMethod ?? true,
      showTerminal: settings.clientTicketLayout?.showTerminal ?? false,
      showClientName: settings.clientTicketLayout?.showClientName ?? false,
      showFiscalQrCode: settings.clientTicketLayout?.showFiscalQrCode ?? false,
    }),
    [settings.clientTicketLayout],
  );
  const kitchenTpl = useMemo(
    () => ({
      title: settings.kitchenBarPrintTemplates?.kitchen?.title || "BON CUISINE",
      footerText: settings.kitchenBarPrintTemplates?.kitchen?.footerText || "",
      showOrderRef: settings.kitchenBarPrintTemplates?.kitchen?.showOrderRef ?? true,
      showTime: settings.kitchenBarPrintTemplates?.kitchen?.showTime ?? true,
      showTable: settings.kitchenBarPrintTemplates?.kitchen?.showTable ?? true,
      showServer: settings.kitchenBarPrintTemplates?.kitchen?.showServer ?? true,
      showItemQty: settings.kitchenBarPrintTemplates?.kitchen?.showItemQty ?? true,
      showItemNotes: settings.kitchenBarPrintTemplates?.kitchen?.showItemNotes ?? true,
    }),
    [settings.kitchenBarPrintTemplates],
  );
  const barTpl = useMemo(
    () => ({
      title: settings.kitchenBarPrintTemplates?.bar?.title || "BON BAR",
      footerText: settings.kitchenBarPrintTemplates?.bar?.footerText || "",
      showOrderRef: settings.kitchenBarPrintTemplates?.bar?.showOrderRef ?? true,
      showTime: settings.kitchenBarPrintTemplates?.bar?.showTime ?? true,
      showTable: settings.kitchenBarPrintTemplates?.bar?.showTable ?? true,
      showServer: settings.kitchenBarPrintTemplates?.bar?.showServer ?? true,
      showItemQty: settings.kitchenBarPrintTemplates?.bar?.showItemQty ?? true,
      showItemNotes: settings.kitchenBarPrintTemplates?.bar?.showItemNotes ?? true,
    }),
    [settings.kitchenBarPrintTemplates],
  );
  const kitchenBarPreview = useMemo(() => {
    const sourceItems = Array.isArray((completedOrder as any)?.items)
      ? (completedOrder as any).items
      : [];
    const byId = new Map(products.map((p) => [String(p.id), p]));
    const pById = new Map(printers.map((p) => [String(p.id), p]));
    const kitchenItems: any[] = [];
    const barItems: any[] = [];
    for (const row of sourceItems) {
      const prod = byId.get(String((row as any)?.productId || ""));
      const ids = Array.isArray((prod as any)?.printerIds) ? (prod as any).printerIds : [];
      const linked = ids
        .map((id: string) => pById.get(String(id)))
        .filter((x): x is Printer => Boolean(x));
      const prodPrinters = linked.filter((pr) => !isReceiptPrinter(pr));
      const hasKitchenProfile = prodPrinters.some(
        (pr) => printerBonProfile(pr) !== "bar",
      );
      const hasBarProfile = prodPrinters.some(
        (pr) => printerBonProfile(pr) === "bar",
      );
      if (hasKitchenProfile) kitchenItems.push(row);
      if (hasBarProfile) barItems.push(row);
    }
    return { kitchenItems, barItems };
  }, [completedOrder, products, printers]);
  const showClientTicketPreview = ticketPreviewMode === "PAYMENT" || !isRestaurantFlow;

  useEffect(() => {
    if (!showTicketModal) return;
    if (isRestaurantFlow) {
      if (kitchenBarPreview.kitchenItems.length > 0) {
        setTicketPreviewTab("KITCHEN");
        return;
      }
      if (kitchenBarPreview.barItems.length > 0) {
        setTicketPreviewTab("BAR");
        return;
      }
      if (showClientTicketPreview) {
        setTicketPreviewTab("CLIENT");
      }
      return;
    }
    setTicketPreviewTab("CLIENT");
  }, [
    showTicketModal,
    isRestaurantFlow,
    kitchenBarPreview.kitchenItems.length,
    kitchenBarPreview.barItems.length,
    showClientTicketPreview,
  ]);

  // Keep preview in the same window, but trigger printing automatically once.
  useEffect(() => {
    if (!showTicketModal) return;
    if (!showClientTicketPreview) return;
    if ((settings as any)?.printAutoOnPreview === false) return;
    if (completedTicketId) {
      if (autoPrintedTicketRef.current === completedTicketId) return;
      autoPrintedTicketRef.current = completedTicketId;
      void printTicketCopies(completedTicketId)
        .then(() => {
          notifySuccess("Impression automatique envoyee a l'imprimante configuree.");
        })
        .catch((e: any) => {
          notifyError(
            e?.message
              ? `Impression auto: ${String(e.message)}`
              : "Impossible de lancer l'impression automatique",
          );
        });
      return;
    }

    if (ticketPreviewMode !== "ORDER_ONLY") return;
    const provisionalOrderId = String(completedOrder?.id || "").trim();
    if (!provisionalOrderId) return;
    if (autoPrintedProvisionalOrderRef.current === provisionalOrderId) return;
    autoPrintedProvisionalOrderRef.current = provisionalOrderId;
    void printOrderClientReceiptProvisional(provisionalOrderId)
      .then(() => {
        notifySuccess("Impression automatique du ticket provisoire envoyee.");
      })
      .catch((e: any) => {
        notifyError(
          e?.message
            ? `Impression auto: ${String(e.message)}`
            : "Impossible de lancer l'impression automatique",
        );
      });
  }, [
    showTicketModal,
    showClientTicketPreview,
    completedTicketId,
    ticketPreviewMode,
    completedOrder?.id,
    printTicketCopies,
    printOrderClientReceiptProvisional,
    settings,
  ]);

  const updateMixedPayment = (
    id: string,
    patch: Partial<MixedPaymentLine>,
  ) => {
    setMixedPayments((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  };

  const addMixedPaymentLine = () => {
    const defaultMethod =
      enabledPaymentMethods.find((m) => m === PaymentMethod.BANK_CARD) ||
      enabledPaymentMethods[0] ||
      PaymentMethod.CASH;
    const id = `pm-${Date.now()}-${mixedPayments.length}`;
    setMixedPayments((prev) => [
      ...prev,
      {
        id,
        method: defaultMethod,
        amount: "0",
        reference: "",
      },
    ]);
    setMixedAmountTargetId(id);
    shouldAutoFocusPaymentRef.current = true;
  };

  const removeMixedPaymentLine = (id: string) => {
    setMixedPayments((prev) => prev.filter((row) => row.id !== id));
  };
  const duplicateMixedPaymentLine = (id: string) => {
    setMixedPayments((prev) => {
      const src = prev.find((r) => r.id === id);
      if (!src) return prev;
      return [
        ...prev,
        { ...src, id: `pm-${Date.now()}-${prev.length}`, amount: "0" },
      ];
    });
  };
  const setMixedPaymentAmount = (id: string, amount: number) => {
    updateMixedPayment(id, {
      amount: String(Math.max(0, Number(amount || 0)).toFixed(3)),
    });
  };
  const appendMixedAmountDigit = (value: string) => {
    if (!mixedAmountTargetId) return;
    setMixedPayments((prev) =>
      prev.map((row) => {
        if (row.id !== mixedAmountTargetId) return row;
        const current = String(row.amount || "");
        if (value === "." && current.includes(".")) return row;
        if (!/^[0-9.]$/.test(value)) return row;
        return { ...row, amount: `${current}${value}` };
      }),
    );
  };
  const backspaceMixedAmount = () => {
    if (!mixedAmountTargetId) return;
    setMixedPayments((prev) =>
      prev.map((row) =>
        row.id === mixedAmountTargetId
          ? { ...row, amount: String(row.amount || "").slice(0, -1) || "0" }
          : row,
      ),
    );
  };
  const clearMixedAmount = () => {
    if (!mixedAmountTargetId) return;
    setMixedPayments((prev) =>
      prev.map((row) =>
        row.id === mixedAmountTargetId ? { ...row, amount: "0" } : row,
      ),
    );
  };

  const submitMixedPayment = () => {
    if (isProcessingPayment) return;
    const breakdown: OrderPayment[] = mixedPayments
      .map((row) => ({
        method: row.method,
        amount: parseNumber(String(row.amount || "0")),
        createdAt: Date.now(),
        reference: row.reference ? String(row.reference).trim() : undefined,
      }))
      .filter((row) => row.amount > 0);

    if (breakdown.length === 0) {
      notifyError("Ajoutez au moins une ligne de paiement.");
      return;
    }
    const missingCode = breakdown.find(
      (row) =>
        (row.method === PaymentMethod.RESTAURANT_TICKET ||
          row.method === PaymentMethod.RESTAURANT_CARD) &&
        !String(row.reference || "").trim(),
    );
    if (missingCode) {
      notifyError("Code scanné obligatoire pour ticket/carte restaurant.");
      return;
    }
    const paid = breakdown.reduce((s, p) => s + Number(p.amount || 0), 0);
    if (Math.abs(paid - finalTotal) > 0.01) {
      notifyError(
        `Le total des paiements doit être ${formatAmount(finalTotal)} DT.`,
      );
      return;
    }
    handleCompletePayment(PaymentMethod.SPLIT, breakdown);
  };

  const handleRestaurantPaymentWithReference = (method: PaymentMethod) => {
    if (method === PaymentMethod.RESTAURANT_CARD) {
      setRestaurantCardCode("");
      setShowRestaurantCardModal(true);
      return;
    }
    setRestaurantTicketLines([
      { id: `rt-${Date.now()}-0`, code: "", amount: String(finalTotal) },
    ]);
    setShowRestaurantTicketModal(true);
  };
  const confirmRestaurantCardPayment = () => {
    const code = String(restaurantCardCode || "").trim();
    if (!code) {
      notifyError("Code carte restaurant obligatoire.");
      return;
    }
    setShowRestaurantCardModal(false);
    handleCompletePayment(PaymentMethod.RESTAURANT_CARD, [
      {
        method: PaymentMethod.RESTAURANT_CARD,
        amount: finalTotal,
        createdAt: Date.now(),
        reference: code,
      },
    ]);
  };
  const addRestaurantTicketLine = () => {
    const id = `rt-${Date.now()}-${restaurantTicketLines.length}`;
    setRestaurantTicketLines((prev) => [
      ...prev,
      { id, code: "", amount: "0" },
    ]);
    setTicketInputTarget({ lineId: id, field: "code" });
  };
  const setTicketLineAmount = (lineId: string, amount: number) => {
    setRestaurantTicketLines((prev) =>
      prev.map((line) =>
        line.id === lineId
          ? { ...line, amount: String(Math.max(0, Number(amount || 0)).toFixed(3)) }
          : line,
      ),
    );
  };
  const updateRestaurantTicketLine = (
    id: string,
    patch: Partial<RestaurantTicketCodeLine>,
  ) => {
    setRestaurantTicketLines((prev) =>
      prev.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    );
  };
  const removeRestaurantTicketLine = (id: string) => {
    setRestaurantTicketLines((prev) =>
      prev.length <= 1 ? prev : prev.filter((line) => line.id !== id),
    );
  };
  const confirmRestaurantTicketPayment = () => {
    const mapped = restaurantTicketLines.map((line) => ({
      code: String(line.code || "").trim(),
      amount: parseNumber(String(line.amount || "0")),
    }));
    if (mapped.some((x) => !x.code)) {
      notifyError("Chaque ticket restaurant doit avoir un code.");
      return;
    }
    const total = mapped.reduce((s, x) => s + Number(x.amount || 0), 0);
    if (Math.abs(total - finalTotal) > 0.01) {
      notifyError(
        `Le total des tickets restaurant doit être ${formatAmount(finalTotal)} DT.`,
      );
      return;
    }
    setShowRestaurantTicketModal(false);
    handleCompletePayment(
      PaymentMethod.SPLIT,
      mapped.map((x) => ({
        method: PaymentMethod.RESTAURANT_TICKET,
        amount: x.amount,
        createdAt: Date.now(),
        reference: x.code,
      })),
    );
  };
  const appendCardCode = (digit: string) => {
    if (!/^[0-9]$/.test(digit)) return;
    setRestaurantCardCode((prev) => `${prev}${digit}`);
  };
  const backspaceCardCode = () => {
    setRestaurantCardCode((prev) => prev.slice(0, -1));
  };
  const clearCardCode = () => {
    setRestaurantCardCode("");
  };
  const appendTicketValue = (value: string) => {
    if (!ticketInputTarget) return;
    setRestaurantTicketLines((prev) =>
      prev.map((line) => {
        if (line.id !== ticketInputTarget.lineId) return line;
        if (ticketInputTarget.field === "code") {
          if (!/^[0-9]$/.test(value)) return line;
          return { ...line, code: `${line.code}${value}` };
        }
        // amount
        if (value === "." && String(line.amount || "").includes(".")) return line;
        if (!/^[0-9.]$/.test(value)) return line;
        const next = `${line.amount || ""}${value}`;
        return { ...line, amount: next };
      }),
    );
  };
  const backspaceTicketValue = () => {
    if (!ticketInputTarget) return;
    setRestaurantTicketLines((prev) =>
      prev.map((line) => {
        if (line.id !== ticketInputTarget.lineId) return line;
        if (ticketInputTarget.field === "code") {
          return { ...line, code: String(line.code || "").slice(0, -1) };
        }
        return { ...line, amount: String(line.amount || "").slice(0, -1) || "0" };
      }),
    );
  };
  const clearTicketValue = () => {
    if (!ticketInputTarget) return;
    setRestaurantTicketLines((prev) =>
      prev.map((line) => {
        if (line.id !== ticketInputTarget.lineId) return line;
        return ticketInputTarget.field === "code"
          ? { ...line, code: "" }
          : { ...line, amount: "0" };
      }),
    );
  };

  const handleValidateOrderOnly = async () => {
    try {
      const base = {
        items: cart,
        total: finalTotal,
        discount: lineDiscountSum + ticketDiscountMoney,
        timbre: timbreAmount,
        type: orderType,
        tableNumber: tableNum,
        serverName: currentUser?.name || "Inconnu",
        createdAt: Date.now(),
      } as any;
      if (existingOrderId) {
        await updateOrder(
          existingOrderId,
          cart,
          finalTotal,
          base.discount,
          true,
          OrderStatus.PENDING,
          { timbre: timbreAmount, ...fastFoodClientExtras() },
        );
      } else {
        await createOrder({
          ...base,
          status: "PENDING" as any,
          print: true,
          ...fastFoodClientExtras(),
        } as any);
      }
      notifySuccess("Commande validée et envoyée en préparation.");
      if (isRestaurantFlow) {
        setCompletedOrder({
          ...base,
          id: existingOrderId || `preview-${Date.now()}`,
          items: cart,
          paymentMethod: "-",
        });
        setCompletedTicketId(null);
        setTicketPreviewMode("ORDER_ONLY");
        setShowTicketModal(true);
      }
      setCart([]);
      setEditingItemId(null);
      setTicketDiscount({ type: null, value: 0 });
      if (isFastFood) setFastFoodClientName("");
    } catch (e: any) {
      notifyError(e?.message || "Validation de commande impossible.");
    }
  };

  const handleCancelOrderWithAdminCode = async () => {
    const pin = String(cancelAdminPin || "").trim();
    const isAdminPinValid = allUsers.some(
      (u) => u.role === Role.ADMIN && String(u.pin || "").trim() === pin,
    );
    if (!isAdminPinValid) {
      notifyError("Code admin invalide.");
      return;
    }
    try {
      if (existingOrderId) {
        await updateOrderStatus(existingOrderId, OrderStatus.CANCELLED);
      }
      setShowCancelModal(false);
      setCancelAdminPin("");
      setCart([]);
      setEditingItemId(null);
      setTicketDiscount({ type: null, value: 0 });
      notifyInfo("Commande annulée.");
      if (isRestaurantCafe) onBack();
    } catch (e: any) {
      notifyError(e?.message || "Annulation impossible.");
    }
  };
  const appendCancelPinDigit = (digit: string) => {
    if (!/^\d$/.test(digit)) return;
    setCancelAdminPin((prev) => (prev.length >= 6 ? prev : `${prev}${digit}`));
  };
  const backspaceCancelPin = () => {
    setCancelAdminPin((prev) => prev.slice(0, -1));
  };
  const clearCancelPin = () => {
    setCancelAdminPin("");
  };

  return (
    <div className="touch-pos-screen flex h-full gap-2 sm:gap-3 relative overflow-hidden bg-slate-50/50 p-1">
      {/* Product Catalog - Optimized Grid Density */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        <div className="flex items-center justify-between shrink-0 px-2">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="group w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center hover:border-indigo-500 transition-all shadow-sm"
            >
              <ChevronLeft
                size={18}
                className="text-slate-500 group-hover:text-indigo-600"
              />
            </button>
            <div>
              <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                {orderType === OrderType.DINE_IN ? "Sur Place" : "Livraison"}
                {tableNum && (
                  <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-lg text-xs">
                    #{tableNum}
                  </span>
                )}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-xl shadow-sm">
            <User size={14} className="text-slate-400" />
            <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
              {currentUser?.name?.split(" ")[0]}
            </span>
          </div>
        </div>

        {/* Categories - Level 1: favorites + root categories */}
        <div className="flex gap-2 overflow-x-auto px-2 pb-1 scrollbar-hide shrink-0">
          <button
            onClick={() => setActiveCategoryId("favorites")}
            className={`px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all whitespace-nowrap border ${activeCategoryId === "favorites" ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100" : "bg-white text-slate-500 border-slate-200 hover:border-indigo-300"}`}
          >
            Favoris
          </button>
          {rootCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategoryId(cat.id)}
                className={`px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all whitespace-nowrap border ${rootCategoryIdForActive === cat.id ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100" : "bg-white text-slate-500 border-slate-200 hover:border-indigo-300"}`}
              >
                {cat.name}
              </button>
            ))}
        </div>

        {/* Categories - Level 2: children of selected root */}
        {rootCategoryIdForActive && activeRootChildren.length > 0 && (
          <div className="flex gap-2 overflow-x-auto px-2 pb-1 scrollbar-hide shrink-0">
            <button
              onClick={() => setActiveCategoryId(rootCategoryIdForActive)}
              className={`px-3 py-1.5 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all whitespace-nowrap border ${activeCategoryId === rootCategoryIdForActive ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"}`}
            >
              Tous
            </button>
            {activeRootChildren.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategoryId(cat.id)}
                className={`px-3 py-1.5 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all whitespace-nowrap border ${activeCategoryId === cat.id ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"}`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}

        {/* Grid: 13-inch optimized columns */}
        <div className="flex-1 overflow-y-auto px-2 scrollbar-hide pb-10">
          <div className="touch-pos-grid grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
            {filteredProducts.map((product) => (
              (() => {
                const out = isProductOutOfStock(product);
                return (
              <button
                key={product.id}
                onClick={() =>
                  out
                    ? notifyInfo(`Article hors stock: ${product.name}`)
                    : product.variants?.length
                    ? (setSelectedProductForVariant(product),
                      setShowVariantModal(true))
                    : addToCart(product)
                }
                className={`bg-white p-2.5 sm:p-3 rounded-[1.25rem] border group transition-all text-left min-h-24 sm:min-h-28 ${
                  out
                    ? "border-rose-200 bg-rose-50/50 opacity-65 cursor-not-allowed"
                    : "border-slate-200 hover:border-indigo-500 hover:shadow-xl hover:-translate-y-1 active:scale-95"
                }`}
              >
                <div className="aspect-[4/3] rounded-xl overflow-hidden mb-2.5 bg-slate-100 relative">
                  <img
                    src={resolveAssetUrl(product.imageUrl)}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    alt={product.name}
                  />
                  {product.promotionPrice && (
                    <div className="absolute top-1.5 right-1.5 bg-rose-500 text-white px-2 py-0.5 rounded-full text-[8px] font-black shadow-lg">
                      PROMO
                    </div>
                  )}
                  {out && (
                    <div className="absolute bottom-1.5 left-1.5 bg-rose-600 text-white px-2 py-0.5 rounded-full text-[8px] font-black shadow-lg uppercase">
                      Hors stock
                    </div>
                  )}
                </div>
                <h3 className="font-bold text-slate-800 text-[10px] leading-tight mb-1 line-clamp-2 min-h-[2.5em]">
                  {product.name}
                </h3>
                <div className="flex justify-between items-center mt-auto">
                  <p className="font-black text-indigo-600 text-xs">
                    {formatAmount(product.promotionPrice ?? product.price ?? 0)}
                    <span className="text-[8px] ml-0.5 opacity-60">DT</span>
                  </p>
                  {product.variants && (
                    <div className="flex gap-0.5">
                      <div className="w-1 h-1 rounded-full bg-slate-300"></div>
                      <div className="w-1 h-1 rounded-full bg-slate-300"></div>
                    </div>
                  )}
                </div>
              </button>
                );
              })()
            ))}
          </div>
        </div>
      </div>

      {/* Cart Panel - Dense & Information rich */}
      <div className="w-80 lg:w-96 h-full min-h-0 bg-white rounded-[2rem] shadow-2xl border border-slate-200 flex flex-col overflow-hidden shrink-0 animate-in slide-in-from-right duration-300">
        <div className="p-4 border-b bg-slate-50/50 flex justify-between items-center">
          <div>
            <h2 className="text-base font-black text-slate-800">
              Votre Panier
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                {cart.reduce((s, i) => s + i.quantity, 0)} Articles
              </span>
              <div className="w-1 h-1 rounded-full bg-slate-300"></div>
              <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">
                {tableNum ? `Table ${tableNum}` : "Direct"}
              </span>
            </div>
          </div>
          <button
            onClick={() => {
              setCart([]);
              setTicketDiscount({ type: null, value: 0 });
              if (isFastFood && !existingOrderId) setFastFoodClientName("");
            }}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all"
          >
            <Trash2 size={16} />
          </button>
        </div>

        {isFastFood && (
          <div className="px-4 py-3 border-b border-slate-100 bg-white shrink-0">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">
              Nom client (appel)
            </label>
            <input
              type="text"
              value={fastFoodClientName}
              onChange={(e) => setFastFoodClientName(e.target.value)}
              placeholder="Ex. prénom ou n°"
              maxLength={80}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 placeholder:text-slate-300 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 outline-none"
            />
          </div>
        )}

        {/* Dense Cart List */}
        <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1 scrollbar-hide">
          {cart.map((item) => {
            const hasMeta =
              (item.notes && item.notes.length > 0) ||
              (item.discount && item.discount > 0) ||
              Boolean((item as any).stockBatchNo);
            return (
              <div
                key={item.id}
                onClick={() => setEditingItemId(item.id)}
                className={`group relative flex flex-col p-2.5 rounded-xl border transition-all cursor-pointer ${editingItemId === item.id ? "bg-indigo-50 border-indigo-300 shadow-sm" : "bg-white border-transparent hover:border-slate-200 hover:bg-slate-50/50"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-slate-800 truncate leading-tight mb-0.5">
                      {item.name}
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] font-black text-slate-400">
                        {formatAmount(item.price)}
                      </p>
                      {hasMeta && (
                        <div className="flex gap-1">
                          {item.notes && (
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400"></div>
                          )}
                          {item.discount > 0 && (
                            <div className="w-1.5 h-1.5 rounded-full bg-rose-400"></div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div
                      className="flex items-center bg-white border border-slate-200 rounded-lg shadow-sm"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => updateQuantity(item.id, -1)}
                        className="p-1 text-slate-400 hover:text-rose-500 transition-colors"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="text-[10px] font-black min-w-[1.5rem] text-center text-slate-700">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.id, 1)}
                        className="p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                    <p className="text-[11px] font-black text-slate-900 w-16 text-right shrink-0">
                      {formatAmount(calculateItemTotal(item))}
                    </p>
                  </div>
                </div>
                {/* Secondary data - only show if exists */}
                {hasMeta && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {item.notes && (
                      <span className="text-[8px] font-bold text-indigo-600 bg-indigo-100/50 px-1.5 py-0.5 rounded uppercase tracking-tighter truncate max-w-[150px]">
                        {item.notes}
                      </span>
                    )}
                    {item.discount > 0 && (
                      <span className="text-[8px] font-bold text-rose-600 bg-rose-100/50 px-1.5 py-0.5 rounded uppercase tracking-tighter">
                        Remise -{formatAmount(item.discount)}
                      </span>
                    )}
                    {(item as any).stockBatchNo && (
                      <span className="text-[8px] font-bold text-amber-700 bg-amber-100/60 px-1.5 py-0.5 rounded uppercase tracking-tighter">
                        Lot/Série: {String((item as any).stockBatchNo)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {cart.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-slate-200 py-16">
              <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mb-4">
                <ShoppingCart size={32} />
              </div>
              <p className="font-black uppercase tracking-[0.2em] text-[9px]">
                Panier Vide
              </p>
            </div>
          )}
        </div>

        {cart.length > 0 && (
          <div className="px-3 py-2.5 border-t border-slate-100 bg-slate-50/90 space-y-2 shrink-0">
            <div className="flex items-center gap-2">
              <Percent size={11} className="text-rose-500 shrink-0" />
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                Remise sur tout le ticket
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {posDiscountPresets.map((preset) => (
                <button
                  key={`ticket-${preset.id}`}
                  type="button"
                  onClick={() => applyTicketPreset(preset)}
                  className="px-2 py-1 rounded-lg text-[8px] font-black uppercase bg-white border border-slate-200 text-slate-600 hover:border-rose-300 hover:bg-rose-50/50 transition-colors"
                >
                  {preset.label}
                  {preset.type === "PERCENT"
                    ? ` -${preset.value}%`
                    : ` -${formatAmount(preset.value)}`}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5 items-center">
              <div className="flex bg-white rounded-lg p-0.5 text-[7px] font-black border border-slate-200 shrink-0">
                <button
                  type="button"
                  onClick={() => setTicketTempType("PERCENT")}
                  className={`px-2 py-1 rounded-md ${ticketTempType === "PERCENT" ? "bg-rose-500 text-white" : "text-slate-400"}`}
                >
                  %
                </button>
                <button
                  type="button"
                  onClick={() => setTicketTempType("AMOUNT")}
                  className={`px-2 py-1 rounded-md ${ticketTempType === "AMOUNT" ? "bg-rose-500 text-white" : "text-slate-400"}`}
                >
                  DT
                </button>
              </div>
              <input
                type="number"
                placeholder="Valeur"
                value={ticketTempValue}
                onChange={(e) => setTicketTempValue(e.target.value)}
                className="flex-1 min-w-0 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-black outline-none focus:border-rose-400"
              />
              <button
                type="button"
                onClick={applyTicketDiscountManual}
                className="px-2 py-1.5 bg-slate-900 text-white rounded-lg text-[8px] font-black uppercase shrink-0"
              >
                OK
              </button>
              {ticketDiscountMoney > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setTicketDiscount({ type: null, value: 0 })
                  }
                  className="p-1.5 text-slate-400 hover:text-rose-500 shrink-0"
                  title="Retirer la remise ticket"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Footer Area - Fixed with contrast */}
        <div className="p-4 bg-slate-900 text-white rounded-t-[1.5rem] mt-auto">
          <div className="space-y-1.5 mb-4 px-1">
            <div className="flex justify-between items-center text-slate-500 text-[8px] font-black uppercase tracking-[0.2em]">
              <span>
                {settings.applyTvaToTicket
                  ? "Sous-total HT"
                  : "Sous-total articles"}
              </span>
              <span>{formatAmount(cartSubtotalLines)} DT</span>
            </div>
            {ticketDiscountMoney > 0 && (
              <div className="flex justify-between items-center text-amber-400/90 text-[8px] font-black uppercase tracking-[0.2em]">
                <span>Remise ticket</span>
                <span>-{formatAmount(ticketDiscountMoney)} DT</span>
              </div>
            )}
            {tvaAmount > 0 && (
              <div className="flex justify-between items-center text-slate-500 text-[8px] font-black uppercase tracking-[0.2em]">
                <span>
                  TVA ({Number(settings.tvaRate) || 0}%)
                </span>
                <span>{formatAmount(tvaAmount)} DT</span>
              </div>
            )}
            {timbreAmount > 0 && (
              <div className="flex justify-between items-center text-slate-500 text-[8px] font-black uppercase tracking-[0.2em]">
                <span>Timbre fiscal</span>
                <span>{formatAmount(timbreAmount)} DT</span>
              </div>
            )}
            <div className="flex justify-between items-end pt-1">
              <div>
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-400">
                  Total Net
                </span>
                <h3 className="text-2xl font-black tracking-tighter">
                  {formatAmount(finalTotal)}{" "}
                  <span className="text-[10px] opacity-40">DT</span>
                </h3>
              </div>
              {totalDiscountSaved > 0 && (
                <div className="text-right pb-1">
                  <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest bg-emerald-400/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Sparkles size={8} />
                    Gagné: {formatAmount(totalDiscountSaved)}
                  </p>
                </div>
              )}
            </div>
          </div>
          {isRestaurantCafe ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleValidateOrderOnly}
                disabled={cart.length === 0}
                className="bg-amber-500 py-3.5 min-h-12 rounded-xl font-black text-[11px] sm:text-[10px] uppercase tracking-widest hover:bg-amber-400 transition-all disabled:opacity-40"
              >
                {existingOrderId ? "MODIFIER" : "VALIDER"}
              </button>
              {existingOrderId ? (
                <button
                  onClick={() => setShowCancelModal(true)}
                  disabled={cart.length === 0}
                  className="bg-rose-600 py-3.5 min-h-12 rounded-xl font-black text-[11px] sm:text-[10px] uppercase tracking-widest hover:bg-rose-500 transition-all disabled:opacity-40"
                >
                  ANNULER
                </button>
              ) : (
                <button
                  onClick={() => {
                    setCart([]);
                    setEditingItemId(null);
                    setTicketDiscount({ type: null, value: 0 });
                  }}
                  disabled={cart.length === 0}
                  className="bg-slate-200 text-slate-700 py-3.5 min-h-12 rounded-xl font-black text-[11px] sm:text-[10px] uppercase tracking-widest hover:bg-slate-300 transition-all disabled:opacity-40"
                >
                  VIDER PANIER
                </button>
              )}
              <button
                onClick={() => {
                  setRequirePrintOnPayment(false);
                  setShowPaymentModal(true);
                }}
                disabled={cart.length === 0}
                className="col-span-2 bg-indigo-600 py-3.5 min-h-12 rounded-xl font-black text-sm sm:text-xs uppercase tracking-widest shadow-xl shadow-indigo-900/40 hover:bg-indigo-500 active:scale-[0.98] transition-all disabled:opacity-40 disabled:grayscale"
              >
                {existingOrderId ? "MODIFIER & PAYER" : "VALIDER & PAYER"}
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setRequirePrintOnPayment(false);
                setShowPaymentModal(true);
              }}
              disabled={cart.length === 0}
              className="w-full bg-indigo-600 py-3.5 rounded-xl font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-900/40 hover:bg-indigo-500 active:scale-[0.98] transition-all disabled:opacity-40 disabled:grayscale"
            >
              VALIDER & PAYER
            </button>
          )}
        </div>
      </div>

      {/* MODAL: Redesigned Line Item Editor for Density */}
      {editingItemId && activeEditingItem && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[200] flex items-center justify-center p-4 overflow-hidden">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b bg-slate-50 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-lg font-black text-slate-800 tracking-tight">
                  {activeEditingItem.name}
                </h3>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                  Configuration de la ligne
                </p>
              </div>
              <button
                onClick={() => setEditingItemId(null)}
                className="w-8 h-8 rounded-lg bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-400 hover:text-slate-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh] scrollbar-hide">
              {/* Notes Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <StickyNote size={12} className="text-indigo-600" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Instructions Cuisine
                    </span>
                  </div>
                  <button
                    onClick={() => updateItemNotes(activeEditingItem.id, "")}
                    className="text-[8px] font-black text-rose-500 uppercase hover:underline"
                  >
                    Effacer
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {settings.predefinedNotes.map((note) => (
                    <button
                      key={note}
                      onClick={() => addQuickNote(activeEditingItem.id, note)}
                      className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase border transition-all ${activeEditingItem.notes?.includes(note) ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" : "bg-white text-slate-500 border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50"}`}
                    >
                      {note}
                    </button>
                  ))}
                </div>
                <textarea
                  placeholder="Commentaire personnalisé..."
                  value={activeEditingItem.notes}
                  onChange={(e) =>
                    updateItemNotes(activeEditingItem.id, e.target.value)
                  }
                  className="w-full px-4 py-3 bg-slate-50 rounded-xl text-xs font-bold border border-transparent focus:bg-white focus:border-indigo-400 outline-none transition-all resize-none min-h-[80px]"
                />
              </div>

              {/* Discount Section */}
              <div className="space-y-3 pt-5 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <Tag size={12} className="text-rose-600" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Remises & Marketing
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex flex-col gap-2">
                    <div className="flex bg-white rounded-lg p-0.5 text-[8px] font-black border border-slate-100">
                      <button
                        onClick={() => setTempDiscountType("percent")}
                        className={`flex-1 py-1.5 rounded transition-all ${tempDiscountType === "percent" ? "bg-rose-500 text-white" : "text-slate-400"}`}
                      >
                        POURCENTAGE %
                      </button>
                      <button
                        onClick={() => setTempDiscountType("amount")}
                        className={`flex-1 py-1.5 rounded transition-all ${tempDiscountType === "amount" ? "bg-rose-500 text-white" : "text-slate-400"}`}
                      >
                        MONTANT DT
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type="number"
                          placeholder="Valeur"
                          value={tempDiscountValue}
                          onChange={(e) => setTempDiscountValue(e.target.value)}
                          className="w-full pl-3 pr-8 py-2.5 bg-white border border-slate-200 rounded-lg text-xs font-black outline-none focus:border-rose-400"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-300">
                          {tempDiscountType === "percent" ? "%" : "DT"}
                        </span>
                      </div>
                      <button
                        onClick={() => applyDiscount(activeEditingItem.id)}
                        className="bg-slate-900 text-white px-4 rounded-lg hover:bg-black transition-colors"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-1.5 max-h-[200px] overflow-y-auto scrollbar-hide pr-0.5">
                    {posDiscountPresets.map((preset, idx) => {
                      const tone =
                        idx % 3 === 0
                          ? "bg-amber-50 text-amber-700 border-amber-100 hover:bg-amber-100"
                          : idx % 3 === 1
                            ? "bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100"
                            : "bg-indigo-50 text-indigo-700 border-indigo-100 hover:bg-indigo-100";
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() =>
                            applyPresetToLine(activeEditingItem.id, preset)
                          }
                          className={`px-3 py-2 border rounded-lg text-[9px] font-black uppercase text-left flex items-center justify-between transition-colors ${tone}`}
                        >
                          <span className="truncate">{preset.label}</span>
                          <span className="shrink-0 ml-2">
                            {preset.type === "PERCENT"
                              ? `-${preset.value}%`
                              : `-${formatAmount(preset.value)}`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {activeEditingItem.discount > 0 && (
                  <div className="flex justify-between items-center p-3 bg-rose-50 border border-rose-100 rounded-xl">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-rose-500" />
                      <span className="text-[10px] font-black text-rose-700 uppercase">
                        Réduction : -{formatAmount(activeEditingItem.discount)}{" "}
                        DT
                      </span>
                    </div>
                    <button
                      onClick={() =>
                        setCart((prev) =>
                          prev.map((i) =>
                            i.id === activeEditingItem.id
                              ? { ...i, discount: 0 }
                              : i,
                          ),
                        )
                      }
                      className="text-rose-400 hover:text-rose-600 p-1"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="p-5 bg-slate-50 border-t flex gap-3 shrink-0">
              <button
                onClick={() => {
                  updateQuantity(
                    activeEditingItem.id,
                    -activeEditingItem.quantity,
                  );
                  setEditingItemId(null);
                }}
                className="flex-1 py-3.5 bg-white border border-rose-200 text-rose-500 font-black rounded-xl text-[10px] uppercase tracking-[0.2em] hover:bg-rose-50 transition-all flex items-center justify-center gap-2"
              >
                <Trash2 size={14} /> Supprimer
              </button>
              <button
                onClick={() => setEditingItemId(null)}
                className="flex-[2] py-3.5 bg-slate-900 text-white font-black rounded-xl text-[10px] uppercase tracking-[0.2em] shadow-lg hover:bg-black transition-all"
              >
                Appliquer les modifications
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Variant Selection Modal - Dense */}
      {showVariantModal && selectedProductForVariant && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[120] flex items-center justify-center p-8">
          <div className="bg-white w-full max-w-sm rounded-[2rem] p-8 shadow-2xl space-y-6 animate-in zoom-in-95 duration-200">
            <div className="text-center">
              <h3 className="text-lg font-black text-slate-800 tracking-tight">
                {selectedProductForVariant.name}
              </h3>
              <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-widest">
                Sélectionner une variante
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {selectedProductForVariant.variants?.map((v) => (
                <button
                  key={v.id}
                  onClick={() => addToCart(selectedProductForVariant, v)}
                  className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-transparent hover:border-indigo-500 hover:bg-white transition-all group"
                >
                  <span className="font-bold text-slate-700 group-hover:text-indigo-600 text-xs">
                    {v.name}
                  </span>
                  <span className="font-black text-indigo-600 text-xs">
                    {formatAmount(v.price)} DT
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowVariantModal(false)}
              className="w-full text-slate-400 font-bold uppercase text-[9px] tracking-widest pt-2 hover:text-slate-600"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {showCancelModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[180] flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl border border-slate-200 p-4 sm:p-6 space-y-3 sm:space-y-4">
            <h3 className="text-base sm:text-lg font-black text-slate-800 text-center">
              Annuler la commande
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-500 font-bold text-center">
              Entrez le code PIN d'un utilisateur ADMIN pour confirmer.
            </p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={cancelAdminPin}
              onChange={() => undefined}
              readOnly
              className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-center font-black text-xl tracking-[0.35em]"
              placeholder="••••"
            />
            <div className="grid grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => appendCancelPinDigit(digit)}
                  className="h-12 sm:h-14 rounded-xl bg-slate-100 active:bg-slate-200 text-slate-800 text-lg font-black"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                onClick={clearCancelPin}
                className="h-12 sm:h-14 rounded-xl bg-amber-100 text-amber-700 text-xs font-black uppercase tracking-wider"
              >
                Effacer
              </button>
              <button
                type="button"
                onClick={() => appendCancelPinDigit("0")}
                className="h-12 sm:h-14 rounded-xl bg-slate-100 active:bg-slate-200 text-slate-800 text-lg font-black"
              >
                0
              </button>
              <button
                type="button"
                onClick={backspaceCancelPin}
                className="h-12 sm:h-14 rounded-xl bg-slate-200 text-slate-700 text-xs font-black uppercase tracking-wider"
              >
                Corriger
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowCancelModal(false);
                  setCancelAdminPin("");
                }}
                className="py-3 rounded-xl bg-slate-100 text-slate-600 text-xs font-black uppercase tracking-widest"
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={handleCancelOrderWithAdminCode}
                className="py-3 rounded-xl bg-rose-600 text-white text-xs font-black uppercase tracking-widest"
              >
                Confirmer annulation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Selection Modal - Optimized */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[120] flex items-center justify-center p-8">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl space-y-6 animate-in zoom-in-95 duration-200">
            <div className="text-center">
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-widest">
                Règlement
              </h3>
              <div className="mt-4 p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">
                  Net à Payer
                </p>
                <p className="text-indigo-600 font-black text-3xl tracking-tighter">
                  {formatAmount(finalTotal)} DT
                </p>
              </div>
              {isProcessingPayment ? (
                <div className="mt-3 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-indigo-600">
                  <Loader2 size={12} className="animate-spin" />
                  Paiement en cours...
                </div>
              ) : null}
            </div>
            <div className="space-y-2">
              {enabledPaymentMethods.includes(PaymentMethod.CASH) && (
              <button
                disabled={isProcessingPayment}
                onClick={() => handleCompletePayment(PaymentMethod.CASH)}
                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl font-black flex items-center gap-4 hover:bg-indigo-600 hover:text-white transition-all group shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center text-indigo-600 shadow-sm group-hover:bg-indigo-500 group-hover:text-white transition-all">
                  <Banknote size={18} />
                </div>
                <span className="text-sm">ESPÈCES</span>
                <ChevronRight
                  size={14}
                  className="ml-auto opacity-30 group-hover:opacity-100"
                />
              </button>
              )}
              {enabledPaymentMethods.includes(PaymentMethod.BANK_CARD) && (
              <button
                disabled={isProcessingPayment}
                onClick={() => handleCompletePayment(PaymentMethod.BANK_CARD)}
                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl font-black flex items-center gap-4 hover:bg-indigo-600 hover:text-white transition-all group shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center text-indigo-600 shadow-sm group-hover:bg-indigo-500 group-hover:text-white transition-all">
                  <CreditCard size={18} />
                </div>
                <span className="text-sm">CARTE BANCAIRE</span>
                <ChevronRight
                  size={14}
                  className="ml-auto opacity-30 group-hover:opacity-100"
                />
              </button>
              )}
              {enabledPaymentMethods.includes(PaymentMethod.RESTAURANT_CARD) && (
              <button
                disabled={isProcessingPayment}
                onClick={() =>
                  handleRestaurantPaymentWithReference(PaymentMethod.RESTAURANT_CARD)
                }
                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl font-black flex items-center gap-4 hover:bg-indigo-600 hover:text-white transition-all group shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center text-indigo-600 shadow-sm group-hover:bg-indigo-500 group-hover:text-white transition-all">
                  <User size={18} />
                </div>
                <span className="text-sm">CARTE RESTAURANT</span>
                <ChevronRight
                  size={14}
                  className="ml-auto opacity-30 group-hover:opacity-100"
                />
              </button>
              )}
              {enabledPaymentMethods.includes(PaymentMethod.RESTAURANT_TICKET) && (
              <button
                disabled={isProcessingPayment}
                onClick={() =>
                  handleRestaurantPaymentWithReference(PaymentMethod.RESTAURANT_TICKET)
                }
                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl font-black flex items-center gap-4 hover:bg-indigo-600 hover:text-white transition-all group shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center text-indigo-600 shadow-sm group-hover:bg-indigo-500 group-hover:text-white transition-all">
                  <Gift size={18} />
                </div>
                <span className="text-sm">TICKET RESTAURANT</span>
                <ChevronRight
                  size={14}
                  className="ml-auto opacity-30 group-hover:opacity-100"
                />
              </button>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 space-y-2">
              <button
                type="button"
                onClick={() => setShowMixedPaymentModal(true)}
                disabled={isProcessingPayment}
                className="w-full p-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Calculator size={14} />
                PAIEMENT MIXTE
              </button>
            </div>
            <button
              disabled={isProcessingPayment}
              onClick={() => {
                setShowPaymentModal(false);
                setShowMixedPaymentModal(false);
                setRequirePrintOnPayment(false);
              }}
              className="w-full text-slate-400 font-bold uppercase text-[9px] tracking-widest hover:text-slate-600 transition-colors disabled:opacity-50"
            >
              Retour au panier
            </button>
          </div>
        </div>
      )}

      {showMixedPaymentModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[130] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-4xl rounded-3xl p-6 shadow-2xl space-y-3">
            <div className="sticky top-0 z-10 -mx-1 px-1 py-1 bg-white/95 backdrop-blur rounded-xl flex items-center justify-between gap-2">
              <p className="text-[11px] font-black text-slate-600 uppercase tracking-widest">
                Paiement mixte
              </p>
              <button
                type="button"
                onClick={addMixedPaymentLine}
                disabled={isProcessingPayment}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-[12px] font-black uppercase tracking-wide shadow-md hover:bg-indigo-500 disabled:opacity-50"
              >
                + Ajouter ligne
              </button>
            </div>
            <p className="text-[9px] font-bold text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-2 py-1">
              Scan rapide: scannez puis validez avec Entrée pour remplir
              automatiquement la référence ticket/carte resto.
            </p>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
              <div className="xl:col-span-2 max-h-[420px] overflow-y-auto space-y-2 pr-1 scrollbar-hide">
              {mixedPayments.map((row, idx) => (
                <div key={row.id} className="space-y-1.5">
                  <div className="grid grid-cols-12 gap-2">
                    <select
                      disabled={isProcessingPayment}
                      value={row.method}
                      onChange={(e) =>
                        updateMixedPayment(row.id, {
                          method: e.target.value as PaymentMethod,
                        })
                      }
                      className="col-span-4 px-3 py-3 border border-slate-200 rounded-lg text-[11px] font-black bg-white"
                    >
                      {enabledPaymentMethods.includes(PaymentMethod.CASH) ? (
                        <option value={PaymentMethod.CASH}>ESPÈCES</option>
                      ) : null}
                      {enabledPaymentMethods.includes(PaymentMethod.BANK_CARD) ? (
                        <option value={PaymentMethod.BANK_CARD}>CARTE</option>
                      ) : null}
                      {enabledPaymentMethods.includes(PaymentMethod.RESTAURANT_CARD) ? (
                        <option value={PaymentMethod.RESTAURANT_CARD}>CARTE RESTO</option>
                      ) : null}
                      {enabledPaymentMethods.includes(PaymentMethod.RESTAURANT_TICKET) ? (
                        <option value={PaymentMethod.RESTAURANT_TICKET}>TICKET RESTO</option>
                      ) : null}
                    </select>
                    <input
                      disabled={isProcessingPayment}
                      readOnly
                      type="text"
                      value={row.amount}
                      onFocus={() => setMixedAmountTargetId(row.id)}
                      onClick={() => setMixedAmountTargetId(row.id)}
                      placeholder="Montant"
                      className={`col-span-3 px-3 py-3 border rounded-lg text-[12px] font-black text-center ${
                        mixedAmountTargetId === row.id
                          ? "border-indigo-400 bg-indigo-50"
                          : "border-slate-200 bg-white"
                      }`}
                    />
                    <input
                      disabled={isProcessingPayment}
                      type="text"
                      value={row.reference}
                      data-payment-reference-id={row.id}
                      onChange={(e) =>
                        updateMixedPayment(row.id, { reference: e.target.value })
                      }
                      placeholder="Ref"
                      className="col-span-4 px-3 py-3 border border-slate-200 rounded-lg text-[11px] font-bold"
                    />
                    <button
                      type="button"
                      onClick={() => removeMixedPaymentLine(row.id)}
                      disabled={isProcessingPayment || (mixedPayments.length === 1 && idx === 0)}
                      className="col-span-1 text-rose-400 disabled:text-slate-300 text-lg"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {[5, 10, 20].map((quick) => (
                      <button
                        key={`${row.id}-q-${quick}`}
                        type="button"
                        disabled={isProcessingPayment}
                        onClick={() => setMixedPaymentAmount(row.id, quick)}
                        className="px-3 py-2 rounded-md border border-slate-200 text-[11px] font-black text-slate-600 bg-white disabled:opacity-50"
                      >
                        {quick} DT
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={isProcessingPayment}
                      onClick={() =>
                        setMixedPaymentAmount(
                          row.id,
                          parseNumber(String(row.amount || "0")) + Math.max(0, mixedRemaining),
                        )
                      }
                      className="px-3 py-2 rounded-md border border-indigo-200 text-[11px] font-black text-indigo-600 bg-indigo-50 disabled:opacity-50"
                    >
                      + Reste
                    </button>
                    <button
                      type="button"
                      disabled={isProcessingPayment}
                      onClick={() => duplicateMixedPaymentLine(row.id)}
                      className="ml-auto px-3 py-2 rounded-md border border-slate-200 text-[11px] font-black text-slate-500 bg-white disabled:opacity-50"
                    >
                      Dupliquer
                    </button>
                  </div>
                </div>
              ))}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                <p className="text-[11px] font-black text-slate-500 uppercase">
                  Pavé montant {mixedAmountTargetId ? "(ligne active)" : ""}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "."].map(
                    (k) => (
                      <button
                        key={`mix-k-${k}`}
                        type="button"
                        disabled={!mixedAmountTargetId || isProcessingPayment}
                        onClick={() => {
                          if (k === "C") clearMixedAmount();
                          else appendMixedAmountDigit(k);
                        }}
                        className="py-3 rounded-xl border border-slate-200 bg-white text-base font-black text-slate-700 disabled:opacity-40"
                      >
                        {k}
                      </button>
                    ),
                  )}
                </div>
                <button
                  type="button"
                  disabled={!mixedAmountTargetId || isProcessingPayment}
                  onClick={backspaceMixedAmount}
                  className="w-full py-3 rounded-xl border border-slate-200 bg-white text-sm font-black text-slate-700 disabled:opacity-40"
                >
                  ⌫ Retour
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between text-[10px] font-black">
              <span className="text-slate-500">
                Total saisi: {formatAmount(mixedPaidTotal)} DT
              </span>
              <span
                className={
                  Math.abs(mixedRemaining) <= 0.01 ? "text-emerald-600" : "text-rose-600"
                }
              >
                Reste: {formatAmount(mixedRemaining)} DT
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShowMixedPaymentModal(false)}
                disabled={isProcessingPayment}
                className="py-3 rounded-xl border border-slate-200 text-sm font-black text-slate-600 disabled:opacity-50"
              >
                Retour
              </button>
              <button
                type="button"
                onClick={submitMixedPayment}
                disabled={isProcessingPayment}
                className="py-3 rounded-xl bg-slate-900 text-white text-sm font-black uppercase tracking-widest hover:bg-indigo-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isProcessingPayment ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    EN COURS...
                  </>
                ) : (
                  <>
                    <Calculator size={14} />
                    Valider mixte
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRestaurantCardModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[130] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">
              Carte restaurant
            </h3>
            <p className="text-xs text-slate-500 font-bold">
              Scannez ou saisissez le code carte.
            </p>
            <input
              type="text"
              readOnly
              value={restaurantCardCode}
              placeholder="Code carte"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm"
            />
            <div className="grid grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"].map(
                (key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      if (key === "C") clearCardCode();
                      else if (key === "⌫") backspaceCardCode();
                      else appendCardCode(key);
                    }}
                    className="py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-black text-slate-700 active:scale-[0.98]"
                  >
                    {key}
                  </button>
                ),
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShowRestaurantCardModal(false)}
                className="py-2.5 rounded-xl border border-slate-200 text-xs font-black text-slate-600"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmRestaurantCardPayment}
                className="py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-black uppercase"
              >
                Valider paiement
              </button>
            </div>
          </div>
        </div>
      )}

      {showRestaurantTicketModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[130] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-xl rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">
                Tickets restaurant
              </h3>
              <button
                type="button"
                onClick={addRestaurantTicketLine}
                className="text-[10px] font-black text-indigo-600 hover:underline"
              >
                + Ajouter code
              </button>
            </div>
            <p className="text-xs text-slate-500 font-bold">
              Vous pouvez saisir plusieurs codes, chacun avec son montant.
            </p>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {restaurantTicketLines.map((line, idx) => (
                <div key={line.id} className="space-y-1.5">
                  <div className="grid grid-cols-12 gap-2">
                  <input
                    type="text"
                    readOnly
                    value={line.code}
                    onFocus={() => setTicketInputTarget({ lineId: line.id, field: "code" })}
                    onClick={() => setTicketInputTarget({ lineId: line.id, field: "code" })}
                    placeholder="Code ticket"
                    className={`col-span-7 px-3 py-2 rounded-xl border bg-slate-50 font-bold text-xs ${
                      ticketInputTarget?.lineId === line.id &&
                      ticketInputTarget?.field === "code"
                        ? "border-indigo-400"
                        : "border-slate-200"
                    }`}
                  />
                  <input
                    type="number"
                    readOnly
                    value={line.amount}
                    onFocus={() => setTicketInputTarget({ lineId: line.id, field: "amount" })}
                    onClick={() => setTicketInputTarget({ lineId: line.id, field: "amount" })}
                    placeholder="Montant"
                    className={`col-span-4 px-3 py-2 rounded-xl border bg-slate-50 font-black text-xs text-center ${
                      ticketInputTarget?.lineId === line.id &&
                      ticketInputTarget?.field === "amount"
                        ? "border-indigo-400"
                        : "border-slate-200"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => removeRestaurantTicketLine(line.id)}
                    disabled={restaurantTicketLines.length === 1 && idx === 0}
                    className="col-span-1 text-rose-500 disabled:text-slate-300"
                  >
                    <X size={14} />
                  </button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {[5, 10, 20].map((quick) => (
                      <button
                        key={`${line.id}-q-${quick}`}
                        type="button"
                        onClick={() => setTicketLineAmount(line.id, quick)}
                        className="px-2 py-1 rounded-md border border-slate-200 text-[9px] font-black text-slate-600 bg-white"
                      >
                        {quick} DT
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        const current = restaurantTicketLines.reduce(
                          (s, r) => s + parseNumber(String(r.amount || "0")),
                          0,
                        );
                        const remaining = Math.max(0, finalTotal - current);
                        setTicketLineAmount(
                          line.id,
                          parseNumber(String(line.amount || "0")) + remaining,
                        );
                      }}
                      className="px-2 py-1 rounded-md border border-indigo-200 text-[9px] font-black text-indigo-600 bg-indigo-50"
                    >
                      + Reste
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 space-y-2">
              <p className="text-[10px] font-black text-slate-500 uppercase">
                Pavé tactile{" "}
                {ticketInputTarget
                  ? ticketInputTarget.field === "code"
                    ? "(Code)"
                    : "(Montant)"
                  : ""}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  "1",
                  "2",
                  "3",
                  "4",
                  "5",
                  "6",
                  "7",
                  "8",
                  "9",
                  "C",
                  "0",
                  ticketInputTarget?.field === "amount" ? "." : "⌫",
                ].map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      if (key === "C") clearTicketValue();
                      else if (key === "⌫") backspaceTicketValue();
                      else appendTicketValue(key);
                    }}
                    className="py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-black text-slate-700 active:scale-[0.98]"
                  >
                    {key}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between text-[11px] font-black">
              <span className="text-slate-500">
                Total saisi:{" "}
                {formatAmount(
                  restaurantTicketLines.reduce(
                    (s, r) => s + parseNumber(String(r.amount || "0")),
                    0,
                  ),
                )}{" "}
                DT
              </span>
              <span className="text-indigo-600">
                À payer: {formatAmount(finalTotal)} DT
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShowRestaurantTicketModal(false)}
                className="py-2.5 rounded-xl border border-slate-200 text-xs font-black text-slate-600"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmRestaurantTicketPayment}
                className="py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-black uppercase"
              >
                Valider paiement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ticket Modal - Clean Print Preview style */}
      {showTicketModal && completedOrder && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[250] flex items-center justify-center p-8">
          <div
            className={`${ticketPreviewShellClass} animate-in slide-in-from-bottom-10 duration-300`}
          >
            <div className="mb-6 text-center">
              {ticketLayout.showLogo ? (
                settings.logoUrl ? (
                  <img
                    src={settings.logoUrl}
                    alt="Logo"
                    className="w-12 h-12 rounded-full object-cover mx-auto mb-4 border border-emerald-100 shadow-sm"
                  />
                ) : (
                  <div className="w-12 h-12 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-100 shadow-sm">
                    <Check size={24} />
                  </div>
                )
              ) : null}
              <h2 className="text-lg font-black tracking-tight">
                {settings.restaurantName}
              </h2>
              {ticketLayout.headerText ? (
                <p className="text-[9px] text-slate-500 mt-1">{ticketLayout.headerText}</p>
              ) : null}
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                {ticketLayout.showTicketNumber
                  ? `N° ${completedOrder.id.slice(-8)}`
                  : "Ticket client"}
              </p>
              <div className="mt-2 space-y-0.5 text-[9px] text-slate-500">
                {ticketLayout.showDate ? <p>{new Date().toLocaleString()}</p> : null}
                {ticketLayout.showAddress && settings.address ? (
                  <p>{settings.address}</p>
                ) : null}
                {ticketLayout.showPhone && settings.phone ? <p>Tel: {settings.phone}</p> : null}
                {ticketLayout.showTaxId && settings.taxId ? (
                  <p>MF: {settings.taxId}</p>
                ) : null}
                {ticketLayout.showServer ? <p>Serveur: {currentUser?.name || "-"}</p> : null}
                {ticketLayout.showTable && tableNum ? <p>Table: {tableNum}</p> : null}
                {ticketLayout.showClientName ? (
                  <p>Client: {(completedOrder as any)?.clientName || "-"}</p>
                ) : null}
                {ticketLayout.showPaymentMethod ? (
                  <p>Paiement: {String((completedOrder as any)?.paymentMethod || "-")}</p>
                ) : null}
                {ticketLayout.showTerminal ? (
                  <p>Terminal: {settings.terminalId || "-"}</p>
                ) : null}
              </div>
              {completedFiscalInfo ? (
                <div
                  className={`mt-3 rounded-xl border px-3 py-2 text-left text-[10px] ${
                    completedFiscalInfo.status === "SIGNED"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-rose-200 bg-rose-50 text-rose-700"
                  }`}
                >
                  <p className="font-black uppercase tracking-widest">
                    NACEF {completedFiscalInfo.status}
                    {completedFiscalInfo.mode
                      ? ` • ${completedFiscalInfo.mode}`
                      : ""}
                  </p>
                  {completedFiscalInfo.imdf ? (
                    <p className="font-bold">IMDF: {completedFiscalInfo.imdf}</p>
                  ) : null}
                  {completedFiscalInfo.errorCode ? (
                    <p className="font-bold">
                      Code erreur: {completedFiscalInfo.errorCode}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            {(isRestaurantFlow || showClientTicketPreview) ? (
              <div className="mb-4 flex items-center gap-2 overflow-x-auto">
                {isRestaurantFlow && kitchenBarPreview.kitchenItems.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setTicketPreviewTab("KITCHEN")}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border ${
                      ticketPreviewTab === "KITCHEN"
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white text-slate-600 border-slate-200"
                    }`}
                  >
                    Cuisine
                  </button>
                ) : null}
                {isRestaurantFlow && kitchenBarPreview.barItems.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setTicketPreviewTab("BAR")}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border ${
                      ticketPreviewTab === "BAR"
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white text-slate-600 border-slate-200"
                    }`}
                  >
                    Bar
                  </button>
                ) : null}
                {showClientTicketPreview ? (
                  <button
                    type="button"
                    onClick={() => setTicketPreviewTab("CLIENT")}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border ${
                      ticketPreviewTab === "CLIENT"
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white text-slate-600 border-slate-200"
                    }`}
                  >
                    Ticket client
                  </button>
                ) : null}
              </div>
            ) : null}

            {isRestaurantFlow && ticketPreviewTab === "KITCHEN" ? (
              <div className="space-y-4 mb-6">
                {kitchenBarPreview.kitchenItems.length > 0 ? (
                  <div className="border border-slate-200 rounded-xl p-3 text-[10px]">
                    <p className="font-black mb-2">{kitchenTpl.title}</p>
                    {kitchenTpl.showOrderRef ? (
                      <p className="text-slate-500">Commande: {String((completedOrder as any)?.id || "-").slice(-8)}</p>
                    ) : null}
                    {kitchenTpl.showTime ? <p className="text-slate-500">{new Date().toLocaleString()}</p> : null}
                    {kitchenTpl.showTable && tableNum ? <p className="text-slate-500">Table: {tableNum}</p> : null}
                    {kitchenTpl.showServer ? <p className="text-slate-500">Serveur: {currentUser?.name || "-"}</p> : null}
                    <div className="mt-2 space-y-1 border-t border-dashed pt-2">
                      {kitchenBarPreview.kitchenItems.map((it: any, idx: number) => (
                        <p key={`k-${idx}`}>
                          {it.name}
                          {kitchenTpl.showItemQty ? ` x${Number(it.quantity || 0)}` : ""}
                          {kitchenTpl.showItemNotes && String(it.notes || "").trim()
                            ? ` (${String(it.notes).trim()})`
                            : ""}
                        </p>
                      ))}
                    </div>
                    {kitchenTpl.footerText ? <p className="mt-2 text-slate-500">{kitchenTpl.footerText}</p> : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {isRestaurantFlow && ticketPreviewTab === "BAR" ? (
              <div className="space-y-4 mb-6">
                {kitchenBarPreview.barItems.length > 0 ? (
                  <div className="border border-slate-200 rounded-xl p-3 text-[10px]">
                    <p className="font-black mb-2">{barTpl.title}</p>
                    {barTpl.showOrderRef ? (
                      <p className="text-slate-500">Commande: {String((completedOrder as any)?.id || "-").slice(-8)}</p>
                    ) : null}
                    {barTpl.showTime ? <p className="text-slate-500">{new Date().toLocaleString()}</p> : null}
                    {barTpl.showTable && tableNum ? <p className="text-slate-500">Table: {tableNum}</p> : null}
                    {barTpl.showServer ? <p className="text-slate-500">Serveur: {currentUser?.name || "-"}</p> : null}
                    <div className="mt-2 space-y-1 border-t border-dashed pt-2">
                      {kitchenBarPreview.barItems.map((it: any, idx: number) => (
                        <p key={`b-${idx}`}>
                          {it.name}
                          {barTpl.showItemQty ? ` x${Number(it.quantity || 0)}` : ""}
                          {barTpl.showItemNotes && String(it.notes || "").trim()
                            ? ` (${String(it.notes).trim()})`
                            : ""}
                        </p>
                      ))}
                    </div>
                    {barTpl.footerText ? <p className="mt-2 text-slate-500">{barTpl.footerText}</p> : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {(showClientTicketPreview && ticketPreviewTab === "CLIENT") ? (
            <div className="space-y-2 mb-6 text-[10px] font-bold text-slate-600 text-left border-y border-dashed border-slate-100 py-4">
              {completedOrder.items.map((item: any) => (
                <div
                  key={item.id}
                  className="flex justify-between items-start gap-4"
                >
                  <span className="flex-1">
                    {item.name}{" "}
                    <span className="text-slate-300">x{item.quantity}</span>
                    {ticketLayout.showItemUnitPrice ? (
                      <span className="text-slate-300">
                        {" "}
                        ({formatAmount(Number(item.price || 0))})
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0">
                    {formatAmount(calculateItemTotal(item))}
                  </span>
                </div>
              ))}
              {ticketLayout.showTicketDiscount &&
                Number((completedOrder as any).ticketDiscountMoney) > 0 && (
                <div className="flex justify-between text-amber-600 font-black">
                  <span>Remise ticket</span>
                  <span>
                    -{formatAmount((completedOrder as any).ticketDiscountMoney)}
                  </span>
                </div>
              )}
              {ticketLayout.showTva && Number((completedOrder as any).vatAmount) > 0 && (
                <div className="pt-2 flex justify-between text-slate-400 font-black">
                  <span>TVA</span>
                  <span>{formatAmount((completedOrder as any).vatAmount)}</span>
                </div>
              )}
              {ticketLayout.showTimbre && Number(completedOrder.timbre) > 0 && (
                <div className="flex justify-between text-slate-400 font-black">
                  <span>TIMBRE FISCAL</span>
                  <span>{formatAmount(completedOrder.timbre)}</span>
                </div>
              )}
              {ticketLayout.showPriceHt ? (
                <div className="flex justify-between text-slate-500 font-black">
                  <span>Prix HT</span>
                  <span>
                    {formatAmount(
                      Number(completedOrder.total || 0) -
                        Number((completedOrder as any).vatAmount || 0) -
                        Number(completedOrder.timbre || 0),
                    )}
                  </span>
                </div>
              ) : null}
            </div>
            ) : null}

            {(showClientTicketPreview && ticketPreviewTab === "CLIENT") && ticketLayout.showPriceTtc ? (
              <div className="mb-8 flex justify-between items-center bg-slate-900 text-white p-4 rounded-2xl shadow-xl shadow-slate-200">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">
                  Prix TTC
                </span>
                <span className="text-xl font-black">
                  {formatAmount(completedOrder.total)}{" "}
                  <span className="text-[10px]">DT</span>
                </span>
              </div>
            ) : null}
            {(showClientTicketPreview && ticketPreviewTab === "CLIENT") && ticketLayout.showQrCode ? (
              <div className="mb-6 text-center">
                <img
                  src={`https://quickchart.io/qr?text=${encodeURIComponent(`${completedOrder.id}|TOTAL:${formatAmount(completedOrder.total)}`)}&size=100`}
                  alt="QR Ticket"
                  className="w-[100px] h-[100px] mx-auto border border-slate-200 rounded"
                />
              </div>
            ) : null}
            {(showClientTicketPreview && ticketPreviewTab === "CLIENT") &&
            (ticketLayout.showFiscalQrCode || Boolean((settings as any)?.nacefEnabled)) ? (
              <div className="mb-6 text-center">
                <img
                  src={`https://quickchart.io/qr?text=${encodeURIComponent(
                    String(
                      (completedFiscalInfo as any)?.qrPayload ||
                        `MF:${settings.taxId || "N/A"}|TOTAL:${formatAmount(completedOrder.total)}`,
                    ),
                  )}&size=100`}
                  alt="QR Fiscal"
                  className="w-[100px] h-[100px] mx-auto border border-slate-200 rounded"
                />
                {Boolean((settings as any)?.nacefEnabled) ? (
                  <p className="text-[9px] text-slate-500 mt-1 font-black">
                    QR fiscal NACEF
                  </p>
                ) : null}
              </div>
            ) : null}
            {ticketLayout.footerText ? (
              <p className="text-[10px] text-center text-slate-500 font-bold mb-6">
                {ticketLayout.footerText}
              </p>
            ) : null}

            <div className="space-y-2">
              {showClientTicketPreview ? (
              <button
                onClick={async () => {
                  setShowTicketModal(false);
                  try {
                    if (!completedTicketId) {
                      notifyError("Ticket introuvable pour impression.");
                      return;
                    }
                    await printTicketCopies(completedTicketId);
                    notifySuccess("Ticket imprimé.");
                  } catch (e: any) {
                    notifyError(
                      e?.message
                        ? `Ticket: ${String(e.message)}`
                        : "Impossible d'imprimer le ticket",
                    );
                  }
                }}
                className="w-full bg-slate-100 text-slate-900 font-black py-3.5 rounded-xl text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all mb-2"
              >
                Reimprimer Ticket ({Math.max(1, Number(settings.clientTicketPrintCopies || 1))}x)
              </button>
              ) : null}
              <button
                onClick={() => {
                  setShowTicketModal(false);
                  setCompletedTicketId(null);
                  setCompletedOrder(null);
                  if (ticketPreviewMode === "ORDER_ONLY" && isRestaurantCafe) {
                    onBack();
                    return;
                  }
                  notifyInfo("Nouvelle commande prête.");
                }}
                className="w-full bg-indigo-600 text-white font-black py-3.5 rounded-xl text-[10px] uppercase tracking-widest hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all"
              >
                {ticketPreviewMode === "ORDER_ONLY" ? "Fermer" : "Nouvelle Commande"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderScreen;
