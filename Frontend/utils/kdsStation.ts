import type { OrderItem, Printer, Product } from "../types";
import { OrderStatus, Role } from "../types";
import { isReceiptPrinter, printerBonProfile } from "./printerUtils";

/** Poste de préparation d’une ligne (aligné KDS / imprimantes produit). */
export function resolveItemStation(
  item: Pick<OrderItem, "station" | "productId">,
  productsById: Map<string, Product>,
  printersById: Map<string, Printer>,
): "KITCHEN" | "BAR" {
  if (item.station === "BAR") return "BAR";
  if (item.station === "KITCHEN") return "KITCHEN";
  const product = productsById.get(item.productId);
  if (!product?.printerIds?.length) return "KITCHEN";
  const hasBar = product.printerIds.some((pid) => {
    const pr = printersById.get(pid);
    return pr && !isReceiptPrinter(pr) && printerBonProfile(pr) === "bar";
  });
  return hasBar ? "BAR" : "KITCHEN";
}

/** Libellés de poste (types d’imprimantes production) pour une ligne. */
export function getItemKdsPosteKeys(
  item: Pick<OrderItem, "station" | "productId">,
  productsById: Map<string, Product>,
  printersById: Map<string, Printer>,
): string[] {
  const product = productsById.get(item.productId);
  const ids = Array.isArray(product?.printerIds) ? product.printerIds : [];
  const keys = new Set<string>();
  for (const pid of ids) {
    const pr = printersById.get(pid);
    if (!pr || isReceiptPrinter(pr)) continue;
    const label = String(pr.type || "").trim();
    if (label) keys.add(label);
  }
  if (keys.size === 0) {
    keys.add(
      resolveItemStation(item, productsById, printersById) === "BAR"
        ? "Bar"
        : "Cuisine",
    );
  }
  return Array.from(keys);
}

/** Premier poste (pour résumés : une ligne = un comptage). */
export function getItemPrimaryKdsPosteKey(
  item: Pick<OrderItem, "station" | "productId">,
  productsById: Map<string, Product>,
  printersById: Map<string, Printer>,
): string {
  const keys = getItemKdsPosteKeys(item, productsById, printersById);
  return keys[0] || "Cuisine";
}

type StationCounts = {
  total: number;
  pending: number;
  preparing: number;
  ready: number;
};

export function prepOfItem(item: OrderItem): OrderStatus {
  return item.prepStatus || OrderStatus.PENDING;
}

export function bonProfileForPosteKey(
  posteKey: string,
  printers: Printer[],
): "kitchen" | "bar" {
  const m = printers.find(
    (pr) => !isReceiptPrinter(pr) && String(pr.type) === posteKey,
  );
  if (m) return printerBonProfile(m);
  if (String(posteKey).trim().toLowerCase() === "bar") return "bar";
  return "kitchen";
}

/** Postes distincts configurés (hors caisse). */
export function listKdsPostes(printers: Printer[]): string[] {
  const s = new Set<string>();
  for (const p of printers) {
    if (isReceiptPrinter(p)) continue;
    const t = String(p.type || "").trim();
    if (t) s.add(t);
  }
  return Array.from(s).sort((a, b) => a.localeCompare(b, "fr"));
}

export function listKdsPostesForRole(
  printers: Printer[],
  role: Role | undefined,
  fullTicketRole: boolean,
): string[] {
  const all = listKdsPostes(printers);
  if (fullTicketRole) {
    const s = new Set(all);
    s.add("Cuisine");
    s.add("Bar");
    return Array.from(s).sort((a, b) => a.localeCompare(b, "fr"));
  }
  if (role === Role.CHEF) {
    const f = all.filter(
      (k) => bonProfileForPosteKey(k, printers) === "kitchen",
    );
    return f.length ? f : ["Cuisine"];
  }
  if (role === Role.BARTENDER) {
    const f = all.filter((k) => bonProfileForPosteKey(k, printers) === "bar");
    return f.length ? f : ["Bar"];
  }
  const s = new Set(all);
  s.add("Cuisine");
  s.add("Bar");
  return Array.from(s).sort((a, b) => a.localeCompare(b, "fr"));
}

/** Onglets KDS : ALL + postes visibles pour le rôle. */
export function listKdsTabIds(
  printers: Printer[],
  role: Role | undefined,
  fullTicketRole: boolean,
): string[] {
  const postes = listKdsPostesForRole(printers, role, fullTicketRole);
  return ["ALL", ...postes];
}

/** Une ligne est visible pour le filtre courant (ALL ou poste précis). */
export function itemMatchesKdsFilter(
  item: OrderItem,
  filter: string,
  rolePostes: string[],
  productsById: Map<string, Product>,
  printersById: Map<string, Printer>,
): boolean {
  const keys = getItemKdsPosteKeys(item, productsById, printersById);
  const inScope = keys.filter((k) => rolePostes.includes(k));
  if (inScope.length === 0) return false;
  if (filter === "ALL") return true;
  return inScope.includes(filter);
}

export function canStaffActOnKdsItem(
  item: OrderItem,
  role: Role | undefined,
  isFullTicketRole: boolean,
  printers: Printer[],
  productsById: Map<string, Product>,
  printersById: Map<string, Printer>,
): boolean {
  if (isFullTicketRole) return true;
  const keys = getItemKdsPosteKeys(item, productsById, printersById);
  if (role === Role.CHEF) {
    return keys.some((k) => bonProfileForPosteKey(k, printers) === "kitchen");
  }
  if (role === Role.BARTENDER) {
    return keys.some((k) => bonProfileForPosteKey(k, printers) === "bar");
  }
  return false;
}

export function summarizePrepByPrimaryPoste(
  items: OrderItem[],
  productsById: Map<string, Product>,
  printersById: Map<string, Printer>,
): Map<string, StationCounts> {
  const m = new Map<string, StationCounts>();
  const bump = (key: string, item: OrderItem) => {
    if (!m.has(key)) {
      m.set(key, {
        total: 0,
        pending: 0,
        preparing: 0,
        ready: 0,
      });
    }
    const bucket = m.get(key)!;
    bucket.total += 1;
    const p = prepOfItem(item);
    if (p === OrderStatus.READY) bucket.ready += 1;
    else if (p === OrderStatus.PREPARING) bucket.preparing += 1;
    else bucket.pending += 1;
  };
  for (const item of items) {
    bump(getItemPrimaryKdsPosteKey(item, productsById, printersById), item);
  }
  return m;
}

export function summarizePrepByStation(
  items: OrderItem[],
  productsById: Map<string, Product>,
  printersById: Map<string, Printer>,
): { kitchen: StationCounts; bar: StationCounts } {
  const kitchen: StationCounts = {
    total: 0,
    pending: 0,
    preparing: 0,
    ready: 0,
  };
  const bar: StationCounts = { ...kitchen };
  for (const item of items) {
    const st = resolveItemStation(item, productsById, printersById);
    const bucket = st === "BAR" ? bar : kitchen;
    bucket.total += 1;
    const p = prepOfItem(item);
    if (p === OrderStatus.READY) bucket.ready += 1;
    else if (p === OrderStatus.PREPARING) bucket.preparing += 1;
    else bucket.pending += 1;
  }
  return { kitchen, bar };
}

export function formatPrepSummaryLine(
  c: StationCounts,
  label: string,
): string {
  if (c.total === 0) return "";
  return `${label} ${c.ready}/${c.total} prêt${c.total > 1 ? "s" : ""}`;
}
