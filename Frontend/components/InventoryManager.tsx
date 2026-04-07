import React, { useState, useEffect, useMemo } from "react";
import { usePOS } from "../hooks/usePOS";
import { Product, Category, Promotion, ProductVariant } from "../types";
import ProductManagement from "./ProductManagement.tsx";
import PromotionManagement from "./PromotionManagement";
import StockManagement from "./StockManagement";
import CategoryManagement from "./CategoryManagement";
import {
  Search,
  Plus,
  X,
  Edit2,
  Trash2,
  Package,
  Tag,
  FolderTree,
  Boxes,
  Loader2,
  AlertCircle,
  CheckCircle,
  Info,
  Upload,
  Image,
} from "lucide-react";

const formatAmount = (value: unknown, digits = 3) =>
  Number(value ?? 0).toFixed(digits);

const formatDateTimeSafe = (value: unknown) => {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num) || num <= 0) return "—";
  const date = new Date(num);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
};

interface InventoryManagerProps {
  initialView?: string;
}

const InventoryManager: React.FC<InventoryManagerProps> = ({ initialView }) => {
  // Serial numbers modal state (must be inside component)
  const [showSerialModal, setShowSerialModal] = useState(false);
  const [serialModalCount, setSerialModalCount] = useState(0);
  const [serialModalNumbers, setSerialModalNumbers] = useState<string[]>([]);
  const {
    products,
    categories,
    settings,
    promotions,
    stockMovements,
    warehouses,
    addProduct,
    updateProduct,
    deleteProduct,
    addCategory,
    updateCategory,
    deleteCategory,
    addPromotion,
    updatePromotion,
    deletePromotion,
    addStockMovement,
    updateStockMovement,
    deleteStockMovement,
    uploadProductImage,
    printers,
    createStockDocument,
    updateStockDocument,
    deleteStockDocumentLine,
    listStockDocuments,
    loading,
  } = usePOS();

  // Toast state
  type Toast = {
    id: number;
    message: string;
    kind: "success" | "error" | "info";
  };
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = (message: string, kind: Toast["kind"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, kind }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  // View state
  const [activeView, setActiveView] = useState<string>(initialView || "items");
  useEffect(() => {
    if (initialView && initialView !== activeView) setActiveView(initialView);
  }, [initialView]);

  const viewConfig = useMemo(() => {
    switch (activeView) {
      case "items":
        return {
          title: "Gestion des Articles",
          icon: Package,
          description: "Gérez vos produits et articles",
        };
      case "categories":
        return {
          title: "Gestion des Catégories",
          icon: FolderTree,
          description: "Organisez vos catégories de produits",
        };
      case "promotions":
        return {
          title: "Gestion des Promotions",
          icon: Tag,
          description: "Créez et gérez vos promotions",
        };
      case "stock":
        return {
          title: "Gestion du Stock",
          icon: Boxes,
          description: "Suivez les mouvements de stock",
        };
      default:
        return { title: "Inventaire", icon: Package, description: "" };
    }
  }, [activeView]);

  // Search state
  const [searchTerm, setSearchTerm] = useState("");

  // Product ID map
  const productsById = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((p) => map.set(p.id, p));
    return map;
  }, [products]);

  // Removed product modal/image upload state and handlers (now handled in ProductManagement)

  // Stock helpers
  const isLowStock = (product: Product) =>
    product.manageStock &&
    product.stock !== undefined &&
    product.stock <= (product.alertLevel ?? 2);

  const getCategoryPath = (catId: string): string => {
    if (!catId) return "—";
    const cat = categories.find((c) => c.id === catId);
    if (!cat) return "—";
    const parent = cat.parentId ? getCategoryPath(cat.parentId) : "";
    return parent ? `${parent} > ${cat.name}` : cat.name;
  };

  const filteredProducts = useMemo(() => {
    if (!searchTerm) return products;
    const term = searchTerm.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.code?.toLowerCase().includes(term) ||
        getCategoryPath(p.category || "")
          .toLowerCase()
          .includes(term),
    );
  }, [products, searchTerm, categories]);

  // ==================== INVENTORY DOCUMENT MODAL ====================
  const [showStockModal, setShowStockModal] = useState(false);
  const [stockModalTab, setStockModalTab] = useState<
    "info" | "lines" | "summary"
  >("info");
  const [editingStockDocumentId, setEditingStockDocumentId] = useState<
    string | null
  >(null);
  const [stockReloadToken, setStockReloadToken] = useState(0);
  const [stockForm, setStockForm] = useState({
    type: "ENTRY" as "ENTRY" | "OUT" | "TRANSFER" | "INVENTORY",
    date: new Date().toISOString().slice(0, 10),
    note: "",
    lines: [
      {
        productId: "",
        quantity: 1,
        lineNote: "",
      },
    ],
  });

  const openCreateStockMovement = () => {
    setEditingStockDocumentId(null);
    setStockForm({
      type: "ENTRY",
      date: new Date().toISOString().slice(0, 10),
      note: "",
      lines: [
        {
          productId: "",
          quantity: 1,
          lineNote: "",
        },
      ],
    });
    setStockModalTab("info");
    setShowStockModal(true);
  };

  const openEditStockDocument = (doc: any) => {
    setEditingStockDocumentId(doc.id || null);
    setStockForm({
      type: (doc.type || "ENTRY") as any,
      date: doc.documentDate
        ? new Date(Number(doc.documentDate)).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10),
      note: String(doc.note || ""),
      lines: (Array.isArray(doc.lines) ? doc.lines : []).map((line: any) => ({
        productId: String(line.productId || ""),
        quantity: Number(line.quantity || 0),
        lineNote: String(line.note || ""),
      })),
    });
    setStockModalTab("info");
    setShowStockModal(true);
  };

  const handleSaveStockDocument = async () => {
    const cleanedLines = stockForm.lines.filter(
      (l) => l.productId && l.quantity > 0,
    );
    if (!cleanedLines.length) {
      showToast("Ajoutez au moins une ligne valide", "error");
      return;
    }

    const movementType =
      stockForm.type === "ENTRY" || stockForm.type === "INVENTORY"
        ? "IN"
        : "OUT";

    try {
      const payload = {
        type: stockForm.type,
        note: stockForm.note || undefined,
        documentDate: stockForm.date
          ? new Date(`${stockForm.date}T00:00:00`).getTime()
          : undefined,
        lines: cleanedLines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          movementType,
          note: l.lineNote || undefined,
        })),
      };
      if (editingStockDocumentId) {
        await updateStockDocument(editingStockDocumentId, payload as any);
        showToast("Document de stock modifié", "success");
      } else {
        await createStockDocument(payload as any);
        showToast("Document d'inventaire créé", "success");
      }
      setShowStockModal(false);
      setEditingStockDocumentId(null);
      setStockReloadToken((prev) => prev + 1);
    } catch (error) {
      showToast("Erreur lors de la création du document", "error");
    }
  };

  // ==================== RENDER ====================
  const renderTabs = () => (
    <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
      {[
        { id: "items", label: "Articles", icon: Package },
        { id: "categories", label: "Catégories", icon: FolderTree },
        { id: "promotions", label: "Promotions", icon: Tag },
        { id: "stock", label: "Stock", icon: Boxes },
      ].map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => setActiveView(id)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all whitespace-nowrap ${
            activeView === id
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200"
              : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200"
          }`}
        >
          <Icon size={18} />
          {label}
        </button>
      ))}
    </div>
  );

  const renderStockModal = () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-linear-to-r from-indigo-50 to-white">
          <div>
            <h3 className="text-xl md:text-2xl font-bold text-slate-800">
              {editingStockDocumentId
                ? "Modification document de stock"
                : "Création document de stock"}
            </h3>
            <p className="text-xs text-slate-500 font-semibold mt-1">
              Workflow guidé : informations, lignes, puis récapitulatif
            </p>
          </div>
          <button
            onClick={() => setShowStockModal(false)}
            className="w-10 h-10 rounded-full bg-white shadow flex items-center justify-center hover:bg-slate-100 transition"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-4 md:px-6 pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Type
              </p>
              <p className="text-sm font-black text-slate-700 mt-1">
                {stockForm.type}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Lignes valides
              </p>
              <p className="text-sm font-black text-slate-700 mt-1">
                {
                  stockForm.lines.filter((l) => l.productId && l.quantity > 0)
                    .length
                }
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Quantité totale
              </p>
              <p className="text-sm font-black text-slate-700 mt-1">
                {stockForm.lines.reduce((s, l) => s + Number(l.quantity || 0), 0)}
              </p>
            </div>
          </div>
        </div>

        <div className="px-4 md:px-6 pt-4">
          <div className="flex bg-slate-100 p-1 rounded-2xl">
            <button
              type="button"
              onClick={() => setStockModalTab("info")}
              className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${stockModalTab === "info" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
            >
              Informations
            </button>
            <button
              type="button"
              onClick={() => setStockModalTab("lines")}
              className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${stockModalTab === "lines" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
            >
              Lignes
            </button>
            <button
              type="button"
              onClick={() => setStockModalTab("summary")}
              className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${stockModalTab === "summary" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
            >
              Récapitulatif
            </button>
          </div>
        </div>

        <div className="p-4 md:p-6 space-y-4 overflow-auto">
          {stockModalTab === "info" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Type de document
                </label>
                <select
                  value={stockForm.type}
                  onChange={(e) =>
                    setStockForm({
                      ...stockForm,
                      type: e.target.value as any,
                    })
                  }
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="ENTRY">Entrée (Achat / Réception)</option>
                  <option value="OUT">Sortie (Consommation / Perte)</option>
                  <option value="TRANSFER">Transfert</option>
                  <option value="INVENTORY">Inventaire</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={stockForm.date}
                  onChange={(e) =>
                    setStockForm({ ...stockForm, date: e.target.value })
                  }
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Note / Référence
                </label>
                <input
                  type="text"
                  value={stockForm.note}
                  onChange={(e) =>
                    setStockForm({ ...stockForm, note: e.target.value })
                  }
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Ex: Facture fournisseur, Inventaire salle, etc."
                />
              </div>
            </div>
          )}

          {stockModalTab === "lines" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-800">
                  Lignes du document
                </h4>
                <button
                  type="button"
                  onClick={() =>
                    setStockForm({
                      ...stockForm,
                      lines: [
                        ...stockForm.lines,
                        {
                          productId: "",
                          quantity: 1,
                          lineNote: "",
                        },
                      ],
                    })
                  }
                  className="px-3 py-2 rounded-2xl bg-slate-900 text-white text-xs font-semibold active:scale-[0.97] transition"
                >
                  + Ajouter une ligne
                </button>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full text-xs md:text-sm">
                  <thead className="bg-slate-100 text-slate-600 uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="px-3 py-2 text-left">Produit</th>
                      <th className="px-3 py-2 text-right w-[140px]">Quantité</th>
                      <th className="px-3 py-2 text-left">Note ligne</th>
                      <th className="px-3 py-2 text-right w-[110px]">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockForm.lines.map((line, idx) => (
                      <tr key={idx} className="border-t border-slate-100 bg-white">
                        <td className="px-3 py-2">
                          <select
                            value={line.productId}
                            onChange={(e) => {
                              const value = e.target.value;
                              setStockForm({
                                ...stockForm,
                                lines: stockForm.lines.map((l, i) =>
                                  i === idx ? { ...l, productId: value } : l,
                                ),
                              });
                            }}
                            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                          >
                            <option value="">Sélectionner un produit...</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={1}
                            value={line.quantity}
                            onChange={(e) => {
                              const value = Number(e.target.value) || 0;
                              setStockForm({
                                ...stockForm,
                                lines: stockForm.lines.map((l, i) =>
                                  i === idx ? { ...l, quantity: value } : l,
                                ),
                              });
                            }}
                            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-right font-bold"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={line.lineNote}
                            onChange={(e) => {
                              const value = e.target.value;
                              setStockForm({
                                ...stockForm,
                                lines: stockForm.lines.map((l, i) =>
                                  i === idx ? { ...l, lineNote: value } : l,
                                ),
                              });
                            }}
                            placeholder="Optionnel"
                            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              setStockForm({
                                ...stockForm,
                                lines: stockForm.lines.filter((_, i) => i !== idx),
                              })
                            }
                            className="px-3 py-1.5 rounded-lg border border-rose-200 text-rose-600 font-bold hover:bg-rose-50"
                          >
                            Retirer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {stockModalTab === "summary" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <h4 className="text-sm font-black text-slate-800 mb-3">
                  Contrôle de validité
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Type renseigné</span>
                    <span className="font-black text-emerald-600">OK</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Date renseignée</span>
                    <span
                      className={`font-black ${stockForm.date ? "text-emerald-600" : "text-rose-600"}`}
                    >
                      {stockForm.date ? "OK" : "À corriger"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Lignes valides</span>
                    <span
                      className={`font-black ${stockForm.lines.some((l) => l.productId && l.quantity > 0) ? "text-emerald-600" : "text-rose-600"}`}
                    >
                      {stockForm.lines.some((l) => l.productId && l.quantity > 0)
                        ? "OK"
                        : "Aucune ligne valide"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h4 className="text-sm font-black text-slate-800 mb-3">
                  Résumé lignes
                </h4>
                <div className="max-h-56 overflow-auto space-y-2">
                  {stockForm.lines
                    .filter((l) => l.productId && l.quantity > 0)
                    .map((l, i) => (
                      <div
                        key={`${l.productId}-${i}`}
                        className="flex items-center justify-between rounded-xl bg-white border border-slate-100 px-3 py-2"
                      >
                        <div>
                          <p className="text-xs font-black text-slate-700">
                            {productsById.get(l.productId)?.name || l.productId}
                          </p>
                          <p className="text-[10px] text-slate-500">{l.lineNote || "-"}</p>
                        </div>
                        <span className="text-sm font-black text-indigo-700">
                          {l.quantity}
                        </span>
                      </div>
                    ))}
                  {!stockForm.lines.some((l) => l.productId && l.quantity > 0) && (
                    <p className="text-xs text-slate-400 italic">
                      Aucune ligne valide pour le moment.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-between items-center gap-3 px-4 md:px-6 py-4 border-t bg-slate-50">
          <div className="text-xs text-slate-500 font-bold">
            Raccourci conseillé: compléter <span className="text-slate-800">Informations</span>,
            puis <span className="text-slate-800">Lignes</span>, puis confirmer.
          </div>
          <div className="flex gap-3">
          <button
            onClick={() => setShowStockModal(false)}
            className="px-5 py-2.5 rounded-xl font-semibold text-slate-600 hover:bg-slate-200 active:scale-[0.98] transition"
          >
            Annuler
          </button>
          <button
            onClick={handleSaveStockDocument}
            className="px-5 py-2.5 rounded-xl font-semibold bg-indigo-600 text-white hover:bg-indigo-700 active:scale-[0.98] transition shadow-lg shadow-indigo-200"
          >
            {editingStockDocumentId ? "Enregistrer les modifications" : "Confirmer le document"}
          </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderToast = () => (
    <div className="fixed top-4 right-4 z-100 space-y-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`px-4 py-3 rounded-xl shadow-lg border text-sm font-semibold flex items-center gap-2 animate-in slide-in-from-right duration-300 ${
            toast.kind === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : toast.kind === "error"
                ? "bg-rose-50 border-rose-200 text-rose-700"
                : "bg-indigo-50 border-indigo-200 text-indigo-700"
          }`}
        >
          {toast.kind === "success" && <CheckCircle size={18} />}
          {toast.kind === "error" && <AlertCircle size={18} />}
          {toast.kind === "info" && <Info size={18} />}
          {toast.message}
        </div>
      ))}
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      {renderToast()}

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
            {React.createElement(viewConfig.icon, {
              size: 20,
              className: "text-indigo-600",
            })}
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">
              {viewConfig.title}
            </h2>
            <p className="text-sm text-slate-500">{viewConfig.description}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      {renderTabs()}

      {/* Content */}
      <div className="flex-1 overflow-auto bg-white rounded-4xl border border-slate-100 shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={32} className="text-indigo-600 animate-spin" />
              <p className="text-slate-500 font-medium">Chargement...</p>
            </div>
          </div>
        ) : (
          <>
            {activeView === "items" && (
              <ProductManagement
                products={filteredProducts}
                categories={categories}
                warehouses={warehouses}
                stockMovements={stockMovements}
                settings={settings}
                printers={printers}
                addProduct={addProduct}
                updateProduct={updateProduct}
                deleteProduct={deleteProduct}
                uploadProductImage={uploadProductImage}
                showToast={showToast}
              />
            )}
            {activeView === "categories" && (
              <CategoryManagement
                categories={categories}
                addCategory={addCategory}
                updateCategory={updateCategory}
                deleteCategory={deleteCategory}
                uploadCategoryImage={uploadProductImage}
                showToast={showToast}
              />
            )}
            {activeView === "promotions" && (
              <PromotionManagement
                promotions={promotions}
                products={products}
                addPromotion={addPromotion}
                updatePromotion={updatePromotion}
                deletePromotion={deletePromotion}
                showToast={showToast}
              />
            )}
            {activeView === "stock" && (
              <StockManagement
                stockMovements={stockMovements}
                productsById={productsById}
                formatDateTimeSafe={formatDateTimeSafe}
                openCreateStockMovement={openCreateStockMovement}
                onEditDocument={openEditStockDocument}
                onDeleteDocumentLine={deleteStockDocumentLine}
                listStockDocuments={listStockDocuments}
                reloadToken={stockReloadToken}
              />
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {showStockModal && renderStockModal()}
    </div>
  );
};
export default InventoryManager;
