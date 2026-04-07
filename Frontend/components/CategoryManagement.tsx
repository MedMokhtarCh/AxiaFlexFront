import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Category } from "../types";

interface CategoryManagementProps {
  categories: Category[];
  addCategory: (name: string, parentId?: string) => Promise<void>;
  updateCategory: (id: string, data: any) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  showToast: (msg: string, kind?: "success" | "error" | "info") => void;
}

const CategoryManagement: React.FC<CategoryManagementProps> = ({
  categories,
  addCategory,
  updateCategory,
  deleteCategory,
  showToast,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (editingCategory) {
      setName(editingCategory.name || "");
      setParentId(editingCategory.parentId || "");
    } else {
      setName("");
      setParentId("");
    }
  }, [editingCategory, showModal]);

  const handleClose = () => {
    if (isSaving) return;
    setShowModal(false);
    setEditingCategory(null);
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      showToast("Le nom de la catégorie est obligatoire", "error");
      return;
    }

    try {
      setIsSaving(true);
      if (editingCategory) {
        await updateCategory(editingCategory.id, {
          name: trimmedName,
          parentId: parentId || undefined,
        });
        showToast("Catégorie mise à jour", "success");
      } else {
        await addCategory(trimmedName, parentId || undefined);
        showToast("Catégorie créée", "success");
      }
      setShowModal(false);
      setEditingCategory(null);
    } catch (err) {
      console.error("Error saving category", err);
      showToast("Erreur lors de l'enregistrement de la catégorie", "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="touch-management-page p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-slate-800">Catégories</h3>
        <button
          className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold shadow hover:bg-indigo-700 transition"
          onClick={() => {
            setEditingCategory(null);
            setShowModal(true);
          }}
        >
          + Nouvelle Catégorie
        </button>
      </div>
      <div className="touch-management-table overflow-x-auto">
        <table className="min-w-full border border-slate-200 rounded-xl">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600">
                Nom
              </th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600">
                Catégorie parente
              </th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 ? (
              <tr>
                <td colSpan={3} className="text-center text-slate-400 py-8">
                  Aucune catégorie trouvée.
                </td>
              </tr>
            ) : (
              categories.map((cat) => (
                <tr
                  key={cat.id}
                  className="border-t border-slate-100 hover:bg-slate-50"
                >
                  <td className="px-4 py-2 font-medium text-slate-700">
                    {cat.name}
                  </td>
                  <td className="px-4 py-2">{cat.parentId || "—"}</td>
                  <td className="px-4 py-2">
                    <div className="inline-flex items-center gap-2">
                      <button
                        className="px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-black hover:bg-indigo-100"
                        onClick={() => {
                          setEditingCategory(cat);
                          setShowModal(true);
                        }}
                      >
                        Modifier
                      </button>
                      <button
                        className="px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-black hover:bg-rose-100"
                        onClick={() => deleteCategory(cat.id)}
                      >
                        Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {/* Category modal UI would be rendered here using showModal and editingCategory */}
      {/* --- Futuristic Category Modal --- */}
      {showModal && (
        <div className="touch-management-modal fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-lg px-3 py-4 sm:p-4">
          <div className="touch-management-modal-panel bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-2xl h-full max-h-[90vh] flex flex-col animate-in slide-in-from-bottom duration-300">
            <div className="app-modal-header px-4 sm:px-6 py-3 sm:py-4">
              <h3 className="app-modal-title">
                <span>📂</span>{" "}
                {editingCategory
                  ? "Modifier la catégorie"
                  : "Nouvelle Catégorie"}
              </h3>
              <button
                onClick={handleClose}
                className="app-modal-close"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 flex flex-col md:flex-row gap-4 sm:gap-6 p-4 sm:p-6 overflow-y-auto">
              {/* Left: Form Sections */}
              <div className="flex-1 space-y-6">
                {/* Basic Info */}
                <div className="space-y-3">
                  <label className="block text-lg font-semibold text-slate-700">
                    Nom *
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                    placeholder="Nom de la catégorie"
                  />
                  <label className="block text-lg font-semibold text-slate-700">
                    Catégorie parente
                  </label>
                  <select
                    value={parentId}
                    onChange={(e) => setParentId(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  >
                    <option value="">Aucune</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                  <label className="block text-lg font-semibold text-slate-700">
                    Description
                  </label>
                  <textarea
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                    placeholder="Description (optionnel)"
                  />
                </div>
                {/* Visual Settings */}
                <div className="space-y-3">
                  <label className="block text-lg font-semibold text-slate-700">
                    Image
                  </label>
                  <input
                    type="file"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-lg"
                  />
                  <label className="block text-lg font-semibold text-slate-700">
                    Couleur de fond
                  </label>
                  <input
                    type="color"
                    className="w-16 h-16 rounded-xl border border-slate-200"
                  />
                  <label className="block text-lg font-semibold text-slate-700">
                    Icône (optionnel)
                  </label>
                  <input
                    type="text"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-lg"
                    placeholder="Icône (ex: 🍕)"
                  />
                </div>
                {/* POS Behavior */}
                <div className="space-y-3">
                  <label className="block text-lg font-semibold text-slate-700">
                    Visible dans POS
                  </label>
                  <input type="checkbox" className="w-6 h-6" />
                  <label className="block text-lg font-semibold text-slate-700">
                    Quick Access
                  </label>
                  <input type="checkbox" className="w-6 h-6" />
                  <label className="block text-lg font-semibold text-slate-700">
                    Sort Order
                  </label>
                  <input
                    type="number"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-lg"
                  />
                  <label className="block text-lg font-semibold text-slate-700">
                    Hide if empty
                  </label>
                  <input type="checkbox" className="w-6 h-6" />
                </div>
                {/* Kitchen Routing (optional) */}
                <div className="space-y-3">
                  <label className="block text-lg font-semibold text-slate-700">
                    Zone de préparation
                  </label>
                  <input
                    type="text"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-lg"
                    placeholder="Ex: Cuisine, Bar, Dessert"
                  />
                </div>
              </div>
              {/* Right: Live Preview Box */}
              <div className="w-full md:w-72 bg-indigo-50 rounded-2xl p-4 sm:p-6 flex flex-col gap-4 shadow-lg mt-4 md:mt-0 flex-shrink-0">
                <h4 className="text-xl font-bold text-indigo-700 mb-2">
                  Preview POS
                </h4>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-xl bg-white flex items-center justify-center text-3xl">
                    🍕
                  </div>
                  <div>
                    <div className="text-lg font-bold text-slate-800">
                      Pizza
                    </div>
                    <div className="text-sm text-slate-500">
                      Food &gt; Pizza
                    </div>
                  </div>
                </div>
                <div className="mt-4 text-lg text-slate-700">24 produits</div>
                <div className="mt-2 text-sm text-slate-500">
                  Visible dans POS
                </div>
              </div>
            </div>
            <div className="app-modal-footer px-4 sm:px-6 py-3 sm:py-4">
              <button
                type="button"
                onClick={handleClose}
                className="app-modal-btn app-modal-btn-secondary"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="app-modal-btn app-modal-btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSaving ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoryManagement;
