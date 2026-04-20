import type { Printer } from "../types";

export function isReceiptPrinter(p: Pick<Printer, "type"> | undefined): boolean {
  return String(p?.type || "").toUpperCase() === "RECEIPT";
}

/** Modèle de bon production : en-tête / options cuisine vs bar. */
export function printerBonProfile(p: Printer | undefined): "kitchen" | "bar" {
  if (!p || isReceiptPrinter(p)) return "kitchen";
  const bp = String(p.bonProfile || "").toLowerCase();
  if (bp === "bar") return "bar";
  if (bp === "kitchen") return "kitchen";
  const t = String(p.type || "").toUpperCase();
  if (t === "BAR") return "bar";
  return "kitchen";
}
