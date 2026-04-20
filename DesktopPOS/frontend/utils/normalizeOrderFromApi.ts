import type { Order, OrderItem } from "../types";
import { OrderStatus } from "../types";

/** Harmonise une ligne API (unitPrice, etc.) avec le modèle OrderItem du POS. */
export function normalizeOrderItemFromApi(raw: any): OrderItem {
  const qty = Number(raw?.quantity ?? 0);
  const paid = Number(raw?.paidQuantity ?? 0);
  const rem = raw?.remainingQuantity;
  return {
    id: String(raw?.id ?? ""),
    productId: String(raw?.productId ?? ""),
    variantId: raw?.variantId,
    name: String(raw?.name ?? ""),
    price: Number(raw?.price ?? raw?.unitPrice ?? 0),
    quantity: qty,
    paidQuantity: paid,
    remainingQuantity: Math.max(
      0,
      rem != null ? Number(rem) : qty - paid,
    ),
    isLocked: Boolean(raw?.isLocked),
    status: (raw?.status || "UNPAID") as OrderItem["status"],
    notes: raw?.notes,
    discount: raw?.discount != null ? Number(raw.discount) : undefined,
    prepStatus: raw?.prepStatus as OrderStatus | undefined,
    station:
      raw?.station != null && raw?.station !== ""
        ? String(raw.station)
        : undefined,
  };
}

function normalizeOrderStatus(raw: unknown): OrderStatus {
  const s = String(raw ?? "PENDING").trim().toUpperCase();
  const values = Object.values(OrderStatus) as string[];
  if (values.includes(s)) return s as OrderStatus;
  if (!s) return OrderStatus.PENDING;
  return s as OrderStatus;
}

export function normalizeOrderFromApi(raw: any): Order {
  if (!raw || typeof raw !== "object") return raw as Order;
  const items = Array.isArray(raw.items)
    ? raw.items.map(normalizeOrderItemFromApi)
    : [];
  return {
    ...raw,
    items,
    status: normalizeOrderStatus(raw?.status),
  } as Order;
}
