/**
 * Transforme une ligne du journal administrateur (JSON) en phrase lisible pour les non-développeurs.
 */

function d(entry: Record<string, unknown>, key: string): Record<string, unknown> {
  const v = entry[key];
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function itemsSummaryLine(detail: Record<string, unknown>): string {
  const raw = detail.itemsSummary;
  if (!Array.isArray(raw) || raw.length === 0) return "";
  const parts = raw.map((it) => {
    if (!it || typeof it !== "object") return "";
    const o = it as Record<string, unknown>;
    const name = String(o.name ?? "Article").trim() || "Article";
    const qty = Number(o.qty ?? o.quantity ?? 1);
    return `${name} (×${qty})`;
  });
  return parts.filter(Boolean).join(", ");
}

const ORDER_STATUS_FR: Record<string, string> = {
  PENDING: "en attente",
  PREPARING: "en préparation",
  READY: "prête",
  DELIVERED: "livrée",
  PARTIAL: "partiellement payée",
  COMPLETED: "terminée",
  CANCELLED: "annulée",
  INVOICED: "facturée",
};

function statusFr(code: string): string {
  const u = String(code || "").toUpperCase();
  return ORDER_STATUS_FR[u] || code || "—";
}

function readableValue(key: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (key === "status") return statusFr(String(v));
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "—";
  return String(v);
}

const RESOURCE_PHRASE: Record<string, { noun: string; feminine?: boolean }> = {
  order: { noun: "une commande" },
  order_status: { noun: "le statut d'une commande" },
  order_payment: { noun: "un paiement sur commande" },
  order_payments_batch: { noun: "des paiements groupés sur commande" },
  print_client_receipt: { noun: "une impression ticket client" },
  ticket: { noun: "un ticket de caisse" },
  ticket_print: { noun: "une impression de ticket" },
  client: { noun: "un client" },
  invoice: { noun: "une facture" },
  supplier: { noun: "un fournisseur" },
  product: { noun: "un produit" },
  category: { noun: "une catégorie" },
  user: { noun: "un utilisateur" },
  zone: { noun: "une zone" },
  table: { noun: "une table" },
  printer: { noun: "une imprimante" },
  printer_test_print: { noun: "un test d'impression" },
  promotion: { noun: "une promotion" },
  fund: { noun: "une caisse (fond)" },
  fund_session_open: { noun: "une ouverture de session de caisse", feminine: true },
  fund_session_close: { noun: "une clôture de session de caisse", feminine: true },
  fund_movement: { noun: "un mouvement de caisse" },
  shift_open: { noun: "une ouverture de shift", feminine: true },
  shift_close: { noun: "une clôture de shift", feminine: true },
  pos_session_open: { noun: "une ouverture de session POS", feminine: true },
  pos_session_close: { noun: "une clôture de session POS", feminine: true },
  pos_session_movement: { noun: "un mouvement de session" },
  settings: { noun: "les paramètres", feminine: true },
  settings_logo: { noun: "le logo de l'établissement" },
  partial_payment: { noun: "un paiement partiel" },
  restaurant_voucher: { noun: "un ticket restaurant" },
  restaurant_card: { noun: "une carte restaurant" },
  restaurant_card_topup: { noun: "une recharge de carte restaurant", feminine: true },
  product_recipe: { noun: "la recette d'un produit", feminine: true },
  stock_movement: { noun: "un mouvement de stock" },
  warehouse: { noun: "un entrepôt" },
  stock_transfer_request: { noun: "une demande de transfert de stock", feminine: true },
  stock_transfer: { noun: "un transfert de stock" },
  stock_adjustment_request: { noun: "une demande d'ajustement de stock", feminine: true },
  stock_adjustment: { noun: "un ajustement de stock" },
  stock_document: { noun: "un document de stock" },
  stock_document_line: { noun: "une ligne de document de stock", feminine: true },
  client_portal_order: { noun: "une commande (client via QR)", feminine: true },
  client_portal_payment_request: {
    noun: "une demande de paiement (client via QR)",
    feminine: true,
  },
  admin_journal_note: { noun: "une note dans le journal" },
};

function verbForAction(
  action: string,
  opts: { feminine: boolean },
): string {
  const f = opts.feminine;
  switch (action) {
    case "insert":
      return f ? "a ajouté" : "a ajouté";
    case "update":
      return f ? "a modifié" : "a modifié";
    case "delete":
      return f ? "a supprimé" : "a supprimé";
    case "confirm":
      return f ? "a confirmé" : "a confirmé";
    case "cancel":
      return f ? "a annulé" : "a annulé";
    default:
      return "a enregistré une action sur";
  }
}

export function formatAdminLogEntryFriendly(entry: Record<string, unknown>): string {
  if (entry._parseError && entry._raw != null) {
    return `Entrée illisible : ${String(entry._raw).slice(0, 200)}`;
  }

  const userName = String(entry.userName ?? "Utilisateur inconnu").trim();
  const action = String(entry.action ?? "");
  const resource = String(entry.resource ?? "");
  const resourceId = entry.resourceId != null ? String(entry.resourceId) : "";
  const date = String(entry.dateLocal ?? "").trim() || "—";
  const time = String(entry.timeLocal ?? "").trim() || "—";
  const detail = d(entry, "detail");
  const ticketLabel = detail.ticketNumber != null ? String(detail.ticketNumber) : "";

  if (resource === "admin_journal_note" || detail.message != null) {
    const msg = String(detail.message ?? entry.message ?? "").trim();
    return `L'utilisateur ${userName} a ajouté une note au journal : « ${msg || "—"} ». Date : ${date}, heure : ${time}.`;
  }

  /* Anciennes lignes sans champ resource structuré */
  if (String(entry.action) === "manual_note" || String(entry.type) === "manual_note") {
    const msg = String(detail.message ?? (entry as any).message ?? "").trim();
    return `L'utilisateur ${userName} a laissé une note : « ${msg || "—"} ». Date : ${date}, heure : ${time}.`;
  }
  if (String(entry.action) === "settings_patch") {
    const keys = Array.isArray((entry as any).keysChanged)
      ? (entry as any).keysChanged.join(", ")
      : "";
    return `L'utilisateur ${userName} a modifié les paramètres${keys ? ` (${keys})` : ""}. Date : ${date}, heure : ${time}.`;
  }

  if (resource === "order" && action === "insert") {
    const ticket = ticketLabel || "—";
    const articles = itemsSummaryLine(detail);
    const articlesPart = articles
      ? `avec les articles suivants : ${articles}`
      : "avec les articles enregistrés sur le ticket";
    return `L'utilisateur ${userName} a ajouté une commande n° ${ticket} ${articlesPart}. Date : ${date}, heure : ${time}.`;
  }

  if (resource === "order" && action === "update") {
    const ticket = ticketLabel || "—";
    const articles = itemsSummaryLine(detail);
    const keys = Array.isArray(detail.keys)
      ? (detail.keys as string[]).join(", ")
      : "";
    const before = d(detail, "before");
    const after = d(detail, "after");
    const keyLabels: Record<string, string> = {
      total: "total",
      discount: "remise",
      status: "statut",
      terminalId: "terminal",
      timbre: "timbre",
      paymentMethod: "mode paiement",
    };
    const changedParts = Object.keys(keyLabels)
      .filter((k) => before[k] !== after[k])
      .map(
        (k) =>
          `${keyLabels[k]}: ${readableValue(k, before[k])} -> ${readableValue(
            k,
            after[k],
          )}`,
      );
    const articlesPart = articles ? ` Articles : ${articles}.` : "";
    const keysPart = keys ? ` Champs modifiés : ${keys}.` : "";
    const detailsPart =
      changedParts.length > 0
        ? ` Détail des modifications : ${changedParts.join(" ; ")}.`
        : "";
    return `L'utilisateur ${userName} a modifié la commande n° ${ticket}.${keysPart}${detailsPart}${articlesPart} Date : ${date}, heure : ${time}.`;
  }

  if (resource === "order_status") {
    const st = statusFr(String(detail.status ?? ""));
    const phrase =
      action === "cancel"
        ? "a annulé une commande (statut annulé)"
        : `a mis à jour le statut d'une commande (${st})`;
    return `L'utilisateur ${userName} ${phrase}${ticketLabel ? ` n° ${ticketLabel}` : ""}. Date : ${date}, heure : ${time}.`;
  }

  if (resource === "order_payment" || resource === "order_payments_batch") {
    const method = detail.method != null ? String(detail.method) : "";
    const amount = detail.amount != null ? String(detail.amount) : "";
    const mPart = method ? ` Méthode : ${method}.` : "";
    const aPart = amount ? ` Montant : ${amount}.` : "";
    return `L'utilisateur ${userName} a enregistré un paiement sur la commande${ticketLabel ? ` n° ${ticketLabel}` : ""}.${mPart}${aPart} Date : ${date}, heure : ${time}.`;
  }

  if (resource === "partial_payment") {
    const amt = detail.amount != null ? String(detail.amount) : "";
    return `L'utilisateur ${userName} a enregistré un paiement partiel${amt ? ` (${amt})` : ""}${ticketLabel ? ` sur la commande n° ${ticketLabel}` : " sur une commande"}. Date : ${date}, heure : ${time}.`;
  }

  if (resource === "product") {
    const before = d(detail, "before");
    const after = d(detail, "after");
    const currentName = String(after.name ?? detail.name ?? before.name ?? "Article").trim();
    const currentCategory = String(after.category ?? detail.category ?? before.category ?? "").trim();
    if (action === "insert") {
      return `L'utilisateur ${userName} a ajouté l'article « ${currentName} »${currentCategory ? ` (catégorie : ${currentCategory})` : ""}. Date : ${date}, heure : ${time}.`;
    }
    if (action === "update") {
      const beforeName = String(before.name ?? "").trim();
      const beforeCategory = String(before.category ?? "").trim();
      const beforePrice =
        before.price != null && before.price !== ""
          ? String(before.price)
          : "";
      const afterPrice =
        after.price != null && after.price !== ""
          ? String(after.price)
          : "";
      return `L'utilisateur ${userName} a modifié l'article « ${currentName} ». Avant : nom ${beforeName || "—"}, catégorie ${beforeCategory || "—"}, prix ${beforePrice || "—"}. Après : nom ${currentName || "—"}, catégorie ${currentCategory || "—"}, prix ${afterPrice || "—"}. Date : ${date}, heure : ${time}.`;
    }
    if (action === "delete") {
      return `L'utilisateur ${userName} a supprimé l'article « ${String(detail.name ?? "—")} »${detail.category ? ` (catégorie : ${String(detail.category)})` : ""}. Date : ${date}, heure : ${time}.`;
    }
  }

  if (resource === "category") {
    const name = String(detail.name ?? d(detail, "after").name ?? "Catégorie").trim();
    return `L'utilisateur ${userName} ${
      action === "insert"
        ? "a ajouté"
        : action === "update"
          ? "a modifié"
          : action === "delete"
            ? "a supprimé"
            : "a mis à jour"
    } la catégorie « ${name} ». Date : ${date}, heure : ${time}.`;
  }

  const meta = RESOURCE_PHRASE[resource];
  const noun = meta?.noun ?? `l'élément « ${resource || "activité"} »`;
  const feminine = Boolean(meta?.feminine);
  const verb = verbForAction(action, { feminine });
  let extra = "";
  if (detail.name != null) extra += ` Nom : ${String(detail.name)}.`;
  if (detail.code != null) extra += ` Code : ${String(detail.code)}.`;
  if (detail.status != null && resource !== "order_status")
    extra += ` Détail : ${String(detail.status)}.`;
  if (detail.method != null) extra += ` Méthode : ${String(detail.method)}.`;
  if (detail.amount != null) extra += ` Montant : ${String(detail.amount)}.`;
  if (detail.type != null && resource.includes("fund"))
    extra += ` Type : ${String(detail.type)}.`;
  if (detail.closingBalance != null)
    extra += ` Solde clôture : ${String(detail.closingBalance)}.`;
  if (detail.category != null) extra += ` Catégorie : ${String(detail.category)}.`;
  if (detail.ticketNumber != null) extra += ` N° ticket/commande : ${String(detail.ticketNumber)}.`;
  if (Array.isArray(detail.keysChanged))
    extra += ` Champs : ${(detail.keysChanged as string[]).join(", ")}.`;
  if (!extra && resourceId) extra += " Référence interne enregistrée.";
  return `L'utilisateur ${userName} ${verb} ${noun}.${extra} Date : ${date}, heure : ${time}.`;
}

export function parseAdminLogJsonl(content: string): Record<string, unknown>[] {
  const text = content.trim();
  if (!text) return [];
  return text.split("\n").map((line) => {
    try {
      return JSON.parse(line) as Record<string, unknown>;
    } catch {
      return { _parseError: true, _raw: line };
    }
  });
}
