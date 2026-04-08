import React, { useMemo, useState } from "react";
import { usePOS } from "../store/POSContext";
import { Supplier, Product } from "../types";
import {
  Truck,
  Plus,
  Edit2,
  Trash2,
  Package,
  FileText,
  Calendar,
  Check,
  X,
} from "lucide-react";
import { askConfirm } from "../utils/confirm";

const formatAmount = (value: unknown, digits = 3) =>
  Number(value ?? 0).toFixed(digits);

type ReceiptLine = {
  productId: string;
  variantId?: string;
  quantity: number;
  unitCost: number;
  note?: string;
};

const PurchaseManagement: React.FC = () => {
  const {
    suppliers,
    products,
    settings,
    createSupplier,
    updateSupplier,
    deleteSupplier,
    createStockDocument,
  } = usePOS();

  const currency = settings?.currency || "DT";

  const [activeTab, setActiveTab] = useState<"suppliers" | "receipts">(
    "suppliers",
  );

  // Supplier modal state
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [supplierContact, setSupplierContact] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");
  const [supplierEmail, setSupplierEmail] = useState("");
  const [supplierAddress, setSupplierAddress] = useState("");
  const [supplierTaxId, setSupplierTaxId] = useState("");
  const [savingSupplier, setSavingSupplier] = useState(false);

  const resetSupplierForm = () => {
    setEditingSupplier(null);
    setSupplierName("");
    setSupplierContact("");
    setSupplierPhone("");
    setSupplierEmail("");
    setSupplierAddress("");
    setSupplierTaxId("");
  };

  const openCreateSupplier = () => {
    resetSupplierForm();
    setSupplierModalOpen(true);
  };

  const openEditSupplier = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setSupplierName(supplier.name || "");
    setSupplierContact(supplier.contactName || "");
    setSupplierPhone(supplier.phone || "");
    setSupplierEmail(supplier.email || "");
    setSupplierAddress(supplier.address || "");
    setSupplierTaxId(supplier.taxId || "");
    setSupplierModalOpen(true);
  };

  const handleSaveSupplier = async () => {
    if (savingSupplier) return;
    const name = supplierName.trim();
    if (!name) return;
    setSavingSupplier(true);
    try {
      if (editingSupplier) {
        await updateSupplier(editingSupplier.id, {
          name,
          contactName: supplierContact || null,
          phone: supplierPhone || null,
          email: supplierEmail || null,
          address: supplierAddress || null,
          taxId: supplierTaxId || null,
        });
      } else {
        await createSupplier({
          name,
          contactName: supplierContact || null,
          phone: supplierPhone || null,
          email: supplierEmail || null,
          address: supplierAddress || null,
          taxId: supplierTaxId || null,
        });
      }

      setSupplierModalOpen(false);
      resetSupplierForm();
    } finally {
      setSavingSupplier(false);
    }
  };

  const handleDeleteSupplier = async (supplier: Supplier) => {
    const confirmed = await askConfirm({
      title: "Supprimer fournisseur",
      message: `Supprimer le fournisseur ${supplier.name} ?`,
      confirmText: "Supprimer",
      cancelText: "Annuler",
      tone: "danger",
    });
    if (!confirmed) return;
    await deleteSupplier(supplier.id);
  };

  // Receipt state
  const [receiptSupplierId, setReceiptSupplierId] = useState<string>("");
  const [receiptInvoiceNumber, setReceiptInvoiceNumber] = useState("");
  const [receiptDate, setReceiptDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [receiptNote, setReceiptNote] = useState("");
  const [receiptLines, setReceiptLines] = useState<ReceiptLine[]>([
    { productId: "", variantId: "", quantity: 1, unitCost: 0 },
  ]);
  const [savingReceipt, setSavingReceipt] = useState(false);

  const totalAmount = useMemo(
    () =>
      receiptLines.reduce(
        (sum, line) =>
          sum + Number(line.quantity || 0) * Number(line.unitCost || 0),
        0,
      ),
    [receiptLines],
  );

  const handleAddLine = () => {
    setReceiptLines((prev) => [
      ...prev,
      { productId: "", variantId: "", quantity: 1, unitCost: 0 },
    ]);
  };

  const handleRemoveLine = (index: number) => {
    setReceiptLines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveReceipt = async () => {
    if (!receiptSupplierId) return;
    const docDate = receiptDate
      ? new Date(`${receiptDate}T00:00:00`).getTime()
      : Date.now();

    const validLines = receiptLines.filter(
      (l) => l.productId && l.quantity > 0,
    );
    if (!validLines.length) return;

    setSavingReceipt(true);
    try {
      await createStockDocument({
        type: "ENTRY",
        supplierId: receiptSupplierId,
        externalRef: receiptInvoiceNumber || null,
        documentDate: docDate,
        note: receiptNote || undefined,
        lines: validLines.map((l) => ({
          productId: l.productId,
          variantId: l.variantId || undefined,
          quantity: l.quantity,
          movementType: "IN",
          note: l.note,
          unitCost: l.unitCost || null,
        })),
      });

      setReceiptInvoiceNumber("");
      setReceiptNote("");
      setReceiptLines([{ productId: "", variantId: "", quantity: 1, unitCost: 0 }]);
    } finally {
      setSavingReceipt(false);
    }
  };

  const supplierById = useMemo(
    () => new Map(suppliers.map((s) => [s.id, s])),
    [suppliers],
  );

  const productById = useMemo(
    () => new Map(products.map((p: Product) => [p.id, p])),
    [products],
  );

  const renderSupplierTab = () => (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Truck className="text-indigo-600" size={20} /> Fournisseurs
          </h3>
          <p className="text-xs text-slate-500">
            Gérez vos partenaires fournisseurs (coordonnées, NIF, etc.).
          </p>
        </div>
        <button
          onClick={openCreateSupplier}
          className="inline-flex items-center justify-center px-4 py-2.5 rounded-2xl bg-indigo-600 text-white text-sm font-semibold shadow-lg shadow-indigo-500/20 active:scale-[0.97]"
        >
          <Plus size={16} className="mr-2" /> Nouveau fournisseur
        </button>
      </div>

      {suppliers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-slate-200 rounded-3xl bg-slate-50/60">
          <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center mb-3">
            <Truck size={28} className="text-indigo-500" />
          </div>
          <p className="text-sm font-semibold text-slate-600 mb-2">
            Aucun fournisseur enregistré
          </p>
          <p className="text-xs text-slate-500 mb-4">
            Ajoutez votre premier fournisseur pour suivre vos achats.
          </p>
          <button
            onClick={openCreateSupplier}
            className="px-4 py-2 rounded-2xl bg-slate-900 text-white text-xs font-semibold"
          >
            Ajouter un fournisseur
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="hidden md:block overflow-x-auto rounded-3xl border border-slate-100 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-4 py-3 text-slate-500 font-semibold">
                    Fournisseur
                  </th>
                  <th className="text-left px-4 py-3 text-slate-500 font-semibold">
                    Contact
                  </th>
                  <th className="text-left px-4 py-3 text-slate-500 font-semibold">
                    Téléphone
                  </th>
                  <th className="text-left px-4 py-3 text-slate-500 font-semibold">
                    NIF
                  </th>
                  <th className="text-right px-4 py-3 text-slate-500 font-semibold">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr
                    key={s.id}
                    className="border-t border-slate-100 hover:bg-slate-50/80"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-[11px] font-bold text-indigo-700">
                          {s.name?.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-slate-800">
                            {s.name}
                          </div>
                          {s.code && (
                            <div className="text-[11px] uppercase tracking-wide text-slate-400">
                              {s.code}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-sm">
                      {s.contactName || "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-sm">
                      {s.phone || "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-sm">
                      {s.taxId || "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => openEditSupplier(s)}
                          className="px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-black hover:bg-indigo-100 inline-flex items-center gap-1"
                        >
                          <Edit2 size={14} />
                          Modifier
                        </button>
                        <button
                          onClick={() => handleDeleteSupplier(s)}
                          className="px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-black hover:bg-rose-100 inline-flex items-center gap-1"
                        >
                          <Trash2 size={14} />
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="grid grid-cols-1 md:hidden gap-3">
            {suppliers.map((s) => (
              <div
                key={s.id}
                className="w-full text-left rounded-3xl border border-slate-100 bg-white px-4 py-3 flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-[11px] font-bold text-indigo-700">
                  {s.name?.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-800 truncate">
                    {s.name}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {s.phone || s.email || "Aucun contact"}
                  </div>
                </div>
                <div className="inline-flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openEditSupplier(s)}
                    className="px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-black"
                  >
                    Modifier
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteSupplier(s)}
                    className="px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-black"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderReceiptTab = () => (
    <div className="relative space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <FileText className="text-indigo-600" size={20} /> Réception de
            marchandises
          </h3>
          <p className="text-xs text-slate-500">
            Créez un document d'entrée de stock lié à un fournisseur.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-slate-600">
            Fournisseur
          </label>
          <select
            value={receiptSupplierId}
            onChange={(e) => setReceiptSupplierId(e.target.value)}
            className="w-full px-3 py-2.5 rounded-2xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
          >
            <option value="">Sélectionner un fournisseur...</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-slate-600">
            N° facture / bon
          </label>
          <input
            type="text"
            value={receiptInvoiceNumber}
            onChange={(e) => setReceiptInvoiceNumber(e.target.value)}
            className="w-full px-3 py-2.5 rounded-2xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="Référence fournisseur"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-slate-600">
            Date de réception
          </label>
          <div className="relative">
            <input
              type="date"
              value={receiptDate}
              onChange={(e) => setReceiptDate(e.target.value)}
              className="w-full pl-3 pr-10 py-2.5 rounded-2xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <Calendar
              size={16}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-800">
            Lignes de réception
          </h4>
          <button
            type="button"
            onClick={handleAddLine}
            disabled={savingReceipt}
            className="px-3 py-1.5 rounded-2xl bg-slate-900 text-white text-xs font-semibold active:scale-[0.97]"
          >
            + Ajouter une ligne
          </button>
        </div>

        <div className="space-y-2">
          {receiptLines.map((line, idx) => (
            <div
              key={idx}
              className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center bg-slate-50 border border-slate-200 rounded-3xl px-3 py-3"
            >
              <div className="md:col-span-5">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Produit
                </label>
                <select
                  value={line.productId}
                  onChange={(e) => {
                    const value = e.target.value;
                                const product = productById.get(value);
                                const hasVariants =
                                  Array.isArray(product?.variants) &&
                                  product.variants.length > 0;
                    setReceiptLines((prev) =>
                      prev.map((l, i) =>
                                    i === idx
                                      ? {
                                          ...l,
                                          productId: value,
                                          variantId: hasVariants ? "" : "",
                                        }
                                      : l,
                      ),
                    );
                  }}
                  className="w-full px-3 py-2.5 rounded-2xl border border-slate-200 text-xs md:text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="">Choisir un produit...</option>
                  {products.map((p: Product) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                                {line.productId ? (
                                  <div className="mt-2 space-y-1">
                                    {(() => {
                                      const product = productById.get(line.productId);
                                      const variants = Array.isArray(product?.variants)
                                        ? product.variants
                                        : [];
                                      if (!variants.length) {
                                        return (
                                          <p className="text-[11px] text-slate-500">
                                            Stock actuel article:{" "}
                                            <span className="font-bold text-slate-700">
                                              {Number(product?.stock || 0)}
                                            </span>
                                          </p>
                                        );
                                      }
                                      return (
                                        <>
                                          <select
                                            value={line.variantId || ""}
                                            onChange={(e) => {
                                              const value = e.target.value;
                                              setReceiptLines((prev) =>
                                                prev.map((l, i) =>
                                                  i === idx
                                                    ? { ...l, variantId: value }
                                                    : l,
                                                ),
                                              );
                                            }}
                                            className="w-full px-3 py-2 rounded-2xl border border-slate-200 text-xs outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                          >
                                            <option value="">Article principal (sans variante)</option>
                                            {variants.map((v: any) => (
                                              <option key={v.id} value={v.id}>
                                                {v.name} (stock: {Number(v.stock || 0)})
                                              </option>
                                            ))}
                                          </select>
                                          <p className="text-[11px] text-slate-500">
                                            Stock variantes:{" "}
                                            {variants
                                              .map(
                                                (v: any) =>
                                                  `${v.name}: ${Number(v.stock || 0)}`,
                                              )
                                              .join(" · ")}
                                          </p>
                                        </>
                                      );
                                    })()}
                                  </div>
                                ) : null}
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Qté
                </label>
                <input
                  type="number"
                  min={0.001}
                  step={0.001}
                  value={line.quantity}
                  onChange={(e) => {
                    const value = Number(e.target.value) || 0;
                    setReceiptLines((prev) =>
                      prev.map((l, i) =>
                        i === idx ? { ...l, quantity: value } : l,
                      ),
                    );
                  }}
                  className="w-full px-3 py-2.5 rounded-2xl border border-slate-200 text-xs md:text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-right"
                />
              </div>
              <div className="md:col-span-3">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Coût unitaire ({currency})
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.001}
                  value={line.unitCost}
                  onChange={(e) => {
                    const value = Number(e.target.value) || 0;
                    setReceiptLines((prev) =>
                      prev.map((l, i) =>
                        i === idx ? { ...l, unitCost: value } : l,
                      ),
                    );
                  }}
                  className="w-full px-3 py-2.5 rounded-2xl border border-slate-200 text-xs md:text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-right"
                />
              </div>
              <div className="md:col-span-2 flex items-end justify-between gap-2 mt-2 md:mt-5">
                <div className="text-xs font-semibold text-slate-700">
                  Total ligne
                  <div className="text-sm text-slate-900">
                    {formatAmount(line.quantity * line.unitCost, 3)} {currency}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveLine(idx)}
                  disabled={savingReceipt}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-rose-500 hover:bg-rose-50"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
        <div className="md:col-span-2 space-y-1">
          <label className="text-[11px] font-semibold text-slate-600">
            Note interne (optionnel)
          </label>
          <textarea
            value={receiptNote}
            onChange={(e) => setReceiptNote(e.target.value)}
            rows={3}
            className="w-full px-3 py-2.5 rounded-2xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            placeholder="Ex: Réception partielle, remise spéciale, conditions..."
          />
        </div>
        <div className="space-y-3 bg-slate-900 text-slate-50 rounded-3xl p-4 flex flex-col justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-slate-400 font-semibold mb-1">
              Récapitulatif
            </p>
            <p className="text-2xl font-bold">
              {formatAmount(totalAmount, 3)} {currency}
            </p>
            {receiptSupplierId && (
              <p className="mt-1 text-xs text-slate-300">
                Fournisseur : {supplierById.get(receiptSupplierId)?.name}
              </p>
            )}
          </div>
          <button
            type="button"
            disabled={
              !receiptSupplierId ||
              !receiptLines.some((l) => l.productId && l.quantity > 0) ||
              savingReceipt
            }
            onClick={handleSaveReceipt}
            className="mt-3 inline-flex items-center justify-center app-modal-btn app-modal-btn-primary disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.97]"
          >
            <Check size={16} className="mr-2" />
            {savingReceipt ? "Enregistrement..." : "Enregistrer la réception"}
          </button>
        </div>
      </div>
      {savingReceipt ? (
        <div className="absolute inset-0 z-10 bg-white/55 backdrop-blur-[1px] pointer-events-auto rounded-2xl" />
      ) : null}
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setActiveTab("suppliers")}
          className={`px-4 py-2.5 rounded-2xl text-sm font-semibold flex items-center gap-2 active:scale-[0.98] transition ${activeTab === "suppliers" ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" : "bg-white text-slate-600 border border-slate-200"}`}
        >
          <Truck size={18} /> Fournisseurs
        </button>
        <button
          onClick={() => setActiveTab("receipts")}
          className={`px-4 py-2.5 rounded-2xl text-sm font-semibold flex items-center gap-2 active:scale-[0.98] transition ${activeTab === "receipts" ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" : "bg-white text-slate-600 border border-slate-200"}`}
        >
          <FileText size={18} /> Réceptions
        </button>
      </div>

      <div className="flex-1 overflow-auto bg-white rounded-4xl border border-slate-100 p-4 md:p-6">
        {activeTab === "suppliers" ? renderSupplierTab() : renderReceiptTab()}
      </div>

      {supplierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="app-modal-header px-5 py-4">
              <h3 className="app-modal-title">
                {editingSupplier
                  ? "Modifier le fournisseur"
                  : "Nouveau fournisseur"}
              </h3>
              <button
                onClick={() => {
                  if (savingSupplier) return;
                  setSupplierModalOpen(false);
                  resetSupplierForm();
                }}
                disabled={savingSupplier}
                className="app-modal-close"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Nom du fournisseur
                </label>
                <input
                  type="text"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-2xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Ex: ABC Distribution"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Contact
                  </label>
                  <input
                    type="text"
                    value={supplierContact}
                    onChange={(e) => setSupplierContact(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-2xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="Nom du commercial"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Téléphone
                  </label>
                  <input
                    type="tel"
                    value={supplierPhone}
                    onChange={(e) => setSupplierPhone(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-2xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="Ex: 20 000 000"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={supplierEmail}
                    onChange={(e) => setSupplierEmail(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-2xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="contact@fournisseur.tn"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Identifiant Fiscal (NIF)
                  </label>
                  <input
                    type="text"
                    value={supplierTaxId}
                    onChange={(e) => setSupplierTaxId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-2xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="Ex: 0000000M/A/N/000"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Adresse
                </label>
                <textarea
                  value={supplierAddress}
                  onChange={(e) => setSupplierAddress(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2.5 rounded-2xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                  placeholder="Adresse du fournisseur"
                />
              </div>
            </div>
            <div className="app-modal-footer px-5 py-4">
              <button
                onClick={() => {
                  if (savingSupplier) return;
                  setSupplierModalOpen(false);
                  resetSupplierForm();
                }}
                disabled={savingSupplier}
                className="app-modal-btn app-modal-btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Annuler
              </button>
              <button
                onClick={handleSaveSupplier}
                disabled={!supplierName.trim() || savingSupplier}
                className="app-modal-btn app-modal-btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {savingSupplier ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseManagement;
