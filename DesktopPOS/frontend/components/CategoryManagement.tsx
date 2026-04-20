import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, HelpCircle, Sparkles, Lightbulb } from "lucide-react";
import { Category } from "../types";

interface CategoryManagementProps {
  categories: Category[];
  addCategory: (name: string, parentId?: string, imageUrl?: string) => Promise<void>;
  updateCategory: (id: string, data: any) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  uploadCategoryImage: (file: File) => Promise<string | null>;
  showToast: (msg: string, kind?: "success" | "error" | "info") => void;
}

const CategoryManagement: React.FC<CategoryManagementProps> = ({
  categories,
  addCategory,
  updateCategory,
  deleteCategory,
  uploadCategoryImage,
  showToast,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const [imageUrl, setImageUrl] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [showFormHelp, setShowFormHelp] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [page, setPage] = useState(1);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const parentSelectRef = useRef<HTMLSelectElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const saveButtonRef = useRef<HTMLButtonElement | null>(null);
  const pageSize = 12;
  const categoriesById = useMemo(() => {
    const map = new Map<string, Category>();
    for (const c of categories) map.set(String(c.id), c);
    return map;
  }, [categories]);

  useEffect(() => {
    if (editingCategory) {
      setName(editingCategory.name || "");
      setParentId(editingCategory.parentId || "");
      setImageUrl(editingCategory.imageUrl || "");
    } else {
      setName("");
      setParentId("");
      setImageUrl("");
    }
  }, [editingCategory, showModal]);
  useEffect(() => {
    setPage(1);
  }, [categories.length]);
  const pagedCategories = useMemo(() => {
    const start = (page - 1) * pageSize;
    return categories.slice(start, start + pageSize);
  }, [categories, page]);
  const totalPages = Math.max(1, Math.ceil(categories.length / pageSize));

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
          imageUrl: imageUrl || undefined,
        });
        showToast("Catégorie mise à jour", "success");
      } else {
        await addCategory(trimmedName, parentId || undefined, imageUrl || undefined);
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

  const TOUR_STEPS: Array<{
    title: string;
    desc: string;
    target: () => HTMLElement | null;
  }> = [
    {
      title: "Nom",
      desc: "Saisis un nom clair pour la catégorie.",
      target: () => nameInputRef.current,
    },
    {
      title: "Catégorie parente",
      desc: "Associe une catégorie parente si besoin.",
      target: () => parentSelectRef.current,
    },
    {
      title: "Image",
      desc: "Ajoute une image pour l'affichage visuel dans le POS.",
      target: () => imageInputRef.current,
    },
    {
      title: "Validation",
      desc: "Termine en cliquant sur Enregistrer.",
      target: () => saveButtonRef.current,
    },
  ];

  const focusTourStep = (index: number) => {
    const step = TOUR_STEPS[index];
    const el = step?.target?.();
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    if ("focus" in el) {
      try {
        (el as HTMLElement).focus({ preventScroll: true });
      } catch {
        (el as HTMLElement).focus();
      }
    }
  };

  const goToTourStep = (index: number) => {
    const next = Math.max(0, Math.min(TOUR_STEPS.length - 1, index));
    setTourStep(next);
    window.setTimeout(() => focusTourStep(next), 20);
  };

  const isTourStepActive = (stepIndex: number) =>
    Boolean(showFormHelp && tourStep === stepIndex);

  const tourGlowClass = (stepIndex: number) =>
    isTourStepActive(stepIndex)
      ? "rounded-2xl border border-amber-300 bg-amber-50/60 shadow-[0_0_0_4px_rgba(251,191,36,0.22)]"
      : "";

  return (
    <div className="touch-management-page p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-slate-800">Catégories</h3>
        <button
          className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold shadow hover:bg-indigo-700 transition"
          onClick={() => {
            setEditingCategory(null);
            setShowFormHelp(false);
            setTourStep(0);
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
              pagedCategories.map((cat) => (
                <tr
                  key={cat.id}
                  className="border-t border-slate-100 hover:bg-slate-50"
                >
                  <td className="px-4 py-2 font-medium text-slate-700">
                    <div className="flex items-center gap-2">
                      {cat.imageUrl ? (
                        <img src={cat.imageUrl} alt={cat.name} className="w-8 h-8 rounded object-cover border border-slate-200" />
                      ) : (
                        <div className="w-8 h-8 rounded bg-slate-100 border border-slate-200" />
                      )}
                      <span>{cat.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    {cat.parentId
                      ? (categoriesById.get(String(cat.parentId))?.name ?? "—")
                      : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <div className="inline-flex items-center gap-2">
                      <button
                        className="px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-black hover:bg-indigo-100"
                        onClick={() => {
                          setEditingCategory(cat);
                          setShowFormHelp(false);
                          setTourStep(0);
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
      {categories.length > pageSize && (
        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-slate-500">
            Page {page}/{totalPages} - {categories.length} categories
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1 rounded border border-slate-200 disabled:opacity-40"
            >
              Prec
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1 rounded border border-slate-200 disabled:opacity-40"
            >
              Suiv
            </button>
          </div>
        </div>
      )}
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
                <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-indigo-700 font-semibold">
                    Besoin d'aide pour compléter ce formulaire ?
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowFormHelp((v) => !v)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-indigo-200 bg-white text-indigo-700 text-xs font-black hover:bg-indigo-50"
                  >
                    <HelpCircle size={14} />
                    {showFormHelp ? "Masquer l'aide" : "Aide guidée"}
                  </button>
                </div>
                {showFormHelp && (
                  <div className="rounded-2xl border border-indigo-200 bg-white shadow-sm p-4 space-y-3 animate-in fade-in duration-200">
                    <div className="flex items-center gap-2">
                      <Sparkles size={16} className="text-indigo-600 animate-pulse" />
                      <p className="text-sm font-black text-slate-800">
                        Guide de creation - Categorie
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {TOUR_STEPS.map((step, index) => (
                        <button
                          key={step.title}
                          type="button"
                          onClick={() => goToTourStep(index)}
                          className={`text-left rounded-xl border px-3 py-2 transition ${
                            isTourStepActive(index)
                              ? "border-amber-300 bg-amber-50"
                              : "border-slate-200 hover:border-indigo-200 hover:bg-indigo-50/60"
                          }`}
                        >
                          <p className="text-[11px] font-black text-slate-700">
                            Etape {index + 1} - {step.title}
                          </p>
                          <p className="text-[11px] text-slate-600 mt-0.5">{step.desc}</p>
                        </button>
                      ))}
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 flex items-center gap-2">
                      <Lightbulb size={14} className="text-amber-600 animate-pulse" />
                      <p className="text-[11px] font-black text-amber-700">
                        Etape actuelle: {tourStep + 1}/{TOUR_STEPS.length} -{" "}
                        {TOUR_STEPS[tourStep]?.title}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => goToTourStep(tourStep - 1)}
                        disabled={tourStep <= 0}
                        className="px-3 py-1.5 rounded-lg border border-indigo-200 bg-white text-xs font-black text-indigo-700 disabled:opacity-40"
                      >
                        Precedent
                      </button>
                      <button
                        type="button"
                        onClick={() => goToTourStep(tourStep + 1)}
                        disabled={tourStep >= TOUR_STEPS.length - 1}
                        className="px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-xs font-black text-indigo-700 disabled:opacity-40"
                      >
                        Suivant
                      </button>
                    </div>
                  </div>
                )}
                {/* Basic Info */}
                <div className={`space-y-3 p-2 transition ${tourGlowClass(0)}`}>
                  <label className="block text-lg font-semibold text-slate-700">
                    Nom *
                    {isTourStepActive(0) && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest">
                        <Lightbulb size={11} className="animate-pulse" />
                        Etape active
                      </span>
                    )}
                  </label>
                  <input
                    ref={nameInputRef}
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                    placeholder="Nom de la catégorie"
                  />
                  <label className="block text-lg font-semibold text-slate-700">
                    Catégorie parente
                    {isTourStepActive(1) && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest">
                        <Lightbulb size={11} className="animate-pulse" />
                        Etape active
                      </span>
                    )}
                  </label>
                  <select
                    ref={parentSelectRef}
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
                <div className={`space-y-3 p-2 transition ${tourGlowClass(2)}`}>
                  <label className="block text-lg font-semibold text-slate-700">
                    Image
                    {isTourStepActive(2) && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest">
                        <Lightbulb size={11} className="animate-pulse" />
                        Etape active
                      </span>
                    )}
                  </label>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const u = await uploadCategoryImage(f);
                      if (u) setImageUrl(u);
                    }}
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
                ref={saveButtonRef}
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className={`app-modal-btn app-modal-btn-primary disabled:opacity-60 disabled:cursor-not-allowed ${
                  isTourStepActive(3)
                    ? "ring-4 ring-amber-200 bg-amber-600 hover:bg-amber-700"
                    : ""
                }`}
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
