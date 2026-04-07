import React, { useMemo, useState } from "react";
import { Promotion, Product } from "../types";
import {
  X,
  Tag,
  Percent,
  Gift,
  Clock,
  Search,
  Filter,
  Copy,
} from "lucide-react";

interface PromotionManagementProps {
  promotions: Promotion[];
  products: Product[];
  addPromotion: (p: any) => Promise<void>;
  updatePromotion: (id: string, p: any) => Promise<void>;
  deletePromotion: (id: string) => Promise<void>;
  showToast: (msg: string, kind?: "success" | "error" | "info") => void;
}

type PromotionStatus = "ACTIVE" | "SCHEDULED" | "EXPIRED" | "DRAFT";

const PromotionManagement: React.FC<PromotionManagementProps> = ({
  promotions,
  products,
  addPromotion,
  updatePromotion,
  deletePromotion,
  showToast,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(
    null,
  );

  // List filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | PromotionStatus>(
    "ALL",
  );
  const [typeFilter, setTypeFilter] = useState<"ALL" | Promotion["type"]>(
    "ALL",
  );

  // Form state
  const [name, setName] = useState("");
  const [type, setType] = useState<Promotion["type"]>("PERIOD_PRICE");
  const [active, setActive] = useState(true);
  const [productId, setProductId] = useState<string>("");
  const [promoPrice, setPromoPrice] = useState<string>("");
  const [buyProductId, setBuyProductId] = useState<string>("");
  const [buyQty, setBuyQty] = useState<string>("1");
  const [freeProductId, setFreeProductId] = useState<string>("");
  const [freeQty, setFreeQty] = useState<string>("1");
  const [startAt, setStartAt] = useState<string>("");
  const [endAt, setEndAt] = useState<string>("");
  const [errors, setErrors] = useState<{ [k: string]: string }>({});

  const resetForm = () => {
    setName("");
    setType("PERIOD_PRICE");
    setActive(true);
    setProductId("");
    setPromoPrice("");
    setBuyProductId("");
    setBuyQty("1");
    setFreeProductId("");
    setFreeQty("1");
    setStartAt("");
    setEndAt("");
    setErrors({});
  };

  const getProductName = (id?: string | null) =>
    id ? products.find((p) => p.id === id)?.name || "—" : "—";

  const computeStatus = (promo: Promotion): PromotionStatus => {
    const now = Date.now();
    const start = promo.startAt ?? null;
    const end = promo.endAt ?? null;

    if (!promo.active && !start && !end) return "DRAFT";
    if (start && now < start) return "SCHEDULED";
    if (end && now > end) return "EXPIRED";
    if (promo.active) return "ACTIVE";
    return "DRAFT";
  };

  const filteredPromotions = useMemo(() => {
    return promotions
      .filter((p) =>
        search
          ? p.name.toLowerCase().includes(search.toLowerCase()) ||
            getProductName(p.productId)
              .toLowerCase()
              .includes(search.toLowerCase())
          : true,
      )
      .filter((p) => {
        if (typeFilter === "ALL") return true;
        return p.type === typeFilter;
      })
      .filter((p) => {
        if (statusFilter === "ALL") return true;
        return computeStatus(p) === statusFilter;
      });
  }, [promotions, search, typeFilter, statusFilter, products]);

  const openCreateModal = () => {
    setEditingPromotion(null);
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (promo: Promotion) => {
    setEditingPromotion(promo);
    setName(promo.name || "");
    setType(promo.type);
    setActive(promo.active);
    setProductId(promo.productId || "");
    setPromoPrice(
      promo.promoPrice !== undefined && promo.promoPrice !== null
        ? String(promo.promoPrice)
        : "",
    );
    setBuyProductId(promo.buyProductId || "");
    setBuyQty(
      promo.buyQty !== undefined && promo.buyQty !== null
        ? String(promo.buyQty)
        : "1",
    );
    setFreeProductId(promo.freeProductId || "");
    setFreeQty(
      promo.freeQty !== undefined && promo.freeQty !== null
        ? String(promo.freeQty)
        : "1",
    );
    setStartAt(
      promo.startAt ? new Date(promo.startAt).toISOString().slice(0, 16) : "",
    );
    setEndAt(
      promo.endAt ? new Date(promo.endAt).toISOString().slice(0, 16) : "",
    );
    setErrors({});
    setShowModal(true);
  };

  const validateForm = () => {
    const next: { [k: string]: string } = {};
    if (!name.trim()) next.name = "Nom requis";
    if (type === "PERIOD_PRICE") {
      if (!productId) next.productId = "Produit requis";
      if (!promoPrice.trim() || isNaN(Number(promoPrice))) {
        next.promoPrice = "Prix promo invalide";
      }
    }
    if (type === "BUY_X_GET_Y") {
      if (!buyProductId) next.buyProductId = "Produit requis";
      if (!freeProductId) next.freeProductId = "Produit offert requis";
      if (!buyQty.trim() || Number(buyQty) <= 0)
        next.buyQty = "Quantité invalide";
      if (!freeQty.trim() || Number(freeQty) <= 0)
        next.freeQty = "Quantité offerte invalide";
    }
    if (startAt && endAt && new Date(startAt) > new Date(endAt)) {
      next.endAt = "La fin doit être après le début";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    const payload: any = {
      name: name.trim(),
      type,
      active,
      startAt: startAt ? new Date(startAt).getTime() : null,
      endAt: endAt ? new Date(endAt).getTime() : null,
      productId: type === "PERIOD_PRICE" ? productId || null : null,
      promoPrice:
        type === "PERIOD_PRICE" && promoPrice ? Number(promoPrice) : null,
      buyProductId: type === "BUY_X_GET_Y" ? buyProductId || null : null,
      buyQty: type === "BUY_X_GET_Y" && buyQty ? Number(buyQty) : null,
      freeProductId: type === "BUY_X_GET_Y" ? freeProductId || null : null,
      freeQty: type === "BUY_X_GET_Y" && freeQty ? Number(freeQty) : null,
    };

    try {
      if (editingPromotion) {
        await updatePromotion(editingPromotion.id, payload);
        showToast("Promotion mise à jour", "success");
      } else {
        await addPromotion(payload);
        showToast("Promotion créée", "success");
      }
      setShowModal(false);
      resetForm();
    } catch (err) {
      showToast("Erreur lors de l'enregistrement", "error");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deletePromotion(id);
      showToast("Promotion supprimée", "success");
    } catch (err) {
      showToast("Erreur lors de la suppression", "error");
    }
  };

  const handleDuplicate = async (promo: Promotion) => {
    const { id, ...rest } = promo as any;
    try {
      await addPromotion({
        ...rest,
        name: `${promo.name} (copie)`,
        active: false,
      });
      showToast("Promotion dupliquée", "success");
    } catch (err) {
      showToast("Erreur lors de la duplication", "error");
    }
  };

  const handleToggleActive = async (promo: Promotion) => {
    try {
      await updatePromotion(promo.id, { active: !promo.active });
      showToast(
        !promo.active ? "Promotion activée" : "Promotion désactivée",
        "success",
      );
    } catch (err) {
      showToast("Erreur lors de la mise à jour", "error");
    }
  };

  const renderStatusBadge = (promo: Promotion) => {
    const status = computeStatus(promo);
    const baseClass =
      "inline-flex items-center px-2 py-1 rounded-full text-[11px] font-medium";
    switch (status) {
      case "ACTIVE":
        return (
          <span className={`${baseClass} bg-emerald-50 text-emerald-700`}>
            Active
          </span>
        );
      case "SCHEDULED":
        return (
          <span className={`${baseClass} bg-indigo-50 text-indigo-700`}>
            Programmée
          </span>
        );
      case "EXPIRED":
        return (
          <span className={`${baseClass} bg-slate-100 text-slate-500`}>
            Expirée
          </span>
        );
      case "DRAFT":
      default:
        return (
          <span className={`${baseClass} bg-amber-50 text-amber-700`}>
            Brouillon
          </span>
        );
    }
  };

  return (
    <div className="touch-management-page p-6 space-y-4">
      {/* Header & Filters */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h3 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Tag className="text-indigo-600" />
            Promotions
          </h3>
          <p className="text-sm text-slate-500">
            Créez, planifiez et suivez les promotions du restaurant.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={16}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par nom ou produit"
              className="pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none min-w-55"
            />
          </div>
          <div className="flex gap-2 items-center">
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as "ALL" | PromotionStatus)
              }
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            >
              <option value="ALL">Tous les statuts</option>
              <option value="ACTIVE">Actives</option>
              <option value="SCHEDULED">Programmées</option>
              <option value="EXPIRED">Expirées</option>
              <option value="DRAFT">Brouillons</option>
            </select>
            <select
              value={typeFilter}
              onChange={(e) =>
                setTypeFilter(e.target.value as "ALL" | Promotion["type"])
              }
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            >
              <option value="ALL">Tous les types</option>
              <option value="PERIOD_PRICE">Prix spécial période</option>
              <option value="BUY_X_GET_Y">Achete X, prends Y</option>
            </select>
          </div>
          <button
            onClick={openCreateModal}
            className="sm:ml-2 inline-flex items-center justify-center px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold shadow hover:bg-indigo-700 transition"
          >
            + Nouvelle promotion
          </button>
        </div>
      </div>

      {/* Promotions table */}
      <div className="touch-management-table overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                Nom
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                Type
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                Période
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                Cible
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                Statut
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredPromotions.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-slate-400 text-sm"
                >
                  Aucune promotion ne correspond à votre recherche.
                </td>
              </tr>
            ) : (
              filteredPromotions.map((promo) => {
                const periodLabel = promo.startAt
                  ? `${new Date(promo.startAt).toLocaleDateString()} - ${promo.endAt ? new Date(promo.endAt).toLocaleDateString() : ""}`
                  : "—";
                const appliesLabel =
                  promo.type === "PERIOD_PRICE"
                    ? getProductName(promo.productId)
                    : promo.type === "BUY_X_GET_Y"
                      ? `${Number(promo.buyQty ?? 1)} x ${getProductName(promo.buyProductId)} → ${Number(promo.freeQty ?? 1)} x ${getProductName(promo.freeProductId)}`
                      : "—";

                return (
                  <tr
                    key={promo.id}
                    className="border-t border-slate-100 hover:bg-slate-50/70 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-slate-800">
                          {promo.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {promo.type === "PERIOD_PRICE"
                        ? "Prix spécial période"
                        : "Achete X, prends Y"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {periodLabel}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {appliesLabel}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {renderStatusBadge(promo)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2 flex-wrap justify-end">
                        <button
                          className="px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-black hover:bg-indigo-100"
                          onClick={() => openEditModal(promo)}
                        >
                          Modifier
                        </button>
                        <button
                          className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-100 text-slate-700 text-xs font-black hover:bg-slate-200"
                          onClick={() => handleDuplicate(promo)}
                        >
                          Dupliquer
                        </button>
                        <button
                          className="px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-black hover:bg-emerald-100"
                          onClick={() => handleToggleActive(promo)}
                        >
                          {promo.active ? "Désactiver" : "Activer"}
                        </button>
                        <button
                          className="px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-black hover:bg-rose-100"
                          onClick={() => handleDelete(promo.id)}
                        >
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal for create/edit promotion */}
      {showModal && (
        <div className="touch-management-modal fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-lg p-4">
          <div className="touch-management-modal-panel bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-300">
            <div className="app-modal-header">
              <h3 className="app-modal-title">
                <Tag className="text-indigo-600" />
                {editingPromotion
                  ? "Modifier la promotion"
                  : "Nouvelle promotion"}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="app-modal-close"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex flex-col md:flex-row gap-6 p-6 overflow-auto">
              {/* Left: Form sections */}
              <div className="flex-1 space-y-6">
                {/* Basic info */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <Percent size={16} className="text-indigo-500" />
                    Informations de base
                  </h4>
                  <label className="block text-xs font-semibold text-slate-600">
                    Nom de la promotion *
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={`w-full px-4 py-3 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                      errors.name ? "border-red-300" : "border-slate-200"
                    }`}
                    placeholder="Ex: -20% sur les pizzas"
                  />
                  {errors.name && (
                    <p className="mt-1 text-xs text-red-500">{errors.name}</p>
                  )}

                  <div className="flex gap-3 items-center">
                    <div className="flex-1">
                      <label className="block text-xs font-semibold text-slate-600">
                        Type de promotion *
                      </label>
                      <select
                        value={type}
                        onChange={(e) =>
                          setType(e.target.value as Promotion["type"])
                        }
                        className="w-full px-3 py-3 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      >
                        <option value="PERIOD_PRICE">
                          Prix spécial période
                        </option>
                        <option value="BUY_X_GET_Y">Achete X, prends Y</option>
                      </select>
                    </div>
                    <div className="mt-5 flex items-center gap-2">
                      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={(e) => setActive(e.target.checked)}
                          className="rounded"
                        />
                        Active dans le POS
                      </label>
                    </div>
                  </div>
                </div>

                {/* Validity & scheduling */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <Clock size={16} className="text-indigo-500" />
                    Période et planification
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600">
                        Date de début
                      </label>
                      <input
                        type="datetime-local"
                        value={startAt}
                        onChange={(e) => setStartAt(e.target.value)}
                        className="w-full px-3 py-3 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600">
                        Date de fin
                      </label>
                      <input
                        type="datetime-local"
                        value={endAt}
                        onChange={(e) => setEndAt(e.target.value)}
                        className={`w-full px-3 py-3 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                          errors.endAt ? "border-red-300" : "border-slate-200"
                        }`}
                      />
                      {errors.endAt && (
                        <p className="mt-1 text-xs text-red-500">
                          {errors.endAt}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Type specific configuration */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <Gift size={16} className="text-indigo-500" />
                    Configuration
                  </h4>
                  {type === "PERIOD_PRICE" && (
                    <>
                      <label className="block text-xs font-semibold text-slate-600">
                        Produit concerné *
                      </label>
                      <select
                        value={productId}
                        onChange={(e) => setProductId(e.target.value)}
                        className={`w-full px-3 py-3 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                          errors.productId
                            ? "border-red-300"
                            : "border-slate-200"
                        }`}
                      >
                        <option value="">Sélectionner un produit</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      {errors.productId && (
                        <p className="mt-1 text-xs text-red-500">
                          {errors.productId}
                        </p>
                      )}
                      <label className="block text-xs font-semibold text-slate-600 mt-2">
                        Prix promotionnel *
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={promoPrice}
                        onChange={(e) => setPromoPrice(e.target.value)}
                        className={`w-full px-3 py-3 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                          errors.promoPrice
                            ? "border-red-300"
                            : "border-slate-200"
                        }`}
                      />
                      {errors.promoPrice && (
                        <p className="mt-1 text-xs text-red-500">
                          {errors.promoPrice}
                        </p>
                      )}
                    </>
                  )}

                  {type === "BUY_X_GET_Y" && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600">
                            Produit acheté *
                          </label>
                          <select
                            value={buyProductId}
                            onChange={(e) => setBuyProductId(e.target.value)}
                            className={`w-full px-3 py-3 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                              errors.buyProductId
                                ? "border-red-300"
                                : "border-slate-200"
                            }`}
                          >
                            <option value="">Sélectionner un produit</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                          {errors.buyProductId && (
                            <p className="mt-1 text-xs text-red-500">
                              {errors.buyProductId}
                            </p>
                          )}
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600">
                            Quantité achetée *
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={buyQty}
                            onChange={(e) => setBuyQty(e.target.value)}
                            className={`w-full px-3 py-3 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                              errors.buyQty
                                ? "border-red-300"
                                : "border-slate-200"
                            }`}
                          />
                          {errors.buyQty && (
                            <p className="mt-1 text-xs text-red-500">
                              {errors.buyQty}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600">
                            Produit offert *
                          </label>
                          <select
                            value={freeProductId}
                            onChange={(e) => setFreeProductId(e.target.value)}
                            className={`w-full px-3 py-3 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                              errors.freeProductId
                                ? "border-red-300"
                                : "border-slate-200"
                            }`}
                          >
                            <option value="">Sélectionner un produit</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                          {errors.freeProductId && (
                            <p className="mt-1 text-xs text-red-500">
                              {errors.freeProductId}
                            </p>
                          )}
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600">
                            Quantité offerte *
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={freeQty}
                            onChange={(e) => setFreeQty(e.target.value)}
                            className={`w-full px-3 py-3 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                              errors.freeQty
                                ? "border-red-300"
                                : "border-slate-200"
                            }`}
                          />
                          {errors.freeQty && (
                            <p className="mt-1 text-xs text-red-500">
                              {errors.freeQty}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: live preview */}
              <div className="w-full md:w-80 bg-indigo-50 rounded-2xl p-5 flex flex-col gap-4 shadow-lg">
                <h4 className="text-sm font-bold text-indigo-700 mb-1">
                  Aperçu de la promotion
                </h4>
                <div className="space-y-2 text-sm text-slate-700">
                  <div>
                    <span className="font-semibold">Nom :</span> {name || "–"}
                  </div>
                  <div>
                    <span className="font-semibold">Type :</span>{" "}
                    {type === "PERIOD_PRICE"
                      ? "Prix spécial période"
                      : "Achete X, prends Y"}
                  </div>
                  <div>
                    <span className="font-semibold">Période :</span>{" "}
                    {startAt
                      ? `${new Date(startAt).toLocaleString()} → ${endAt ? new Date(endAt).toLocaleString() : ""}`
                      : "Non définie"}
                  </div>
                  {type === "PERIOD_PRICE" && (
                    <div>
                      <span className="font-semibold">Produit :</span>{" "}
                      {getProductName(productId)}
                      {promoPrice && (
                        <>
                          {" "}
                          - Prix promo :
                          <span className="font-semibold"> {promoPrice}</span>
                        </>
                      )}
                    </div>
                  )}
                  {type === "BUY_X_GET_Y" && (
                    <div>
                      <span className="font-semibold">Règle :</span>{" "}
                      {`${buyQty || 1} x ${getProductName(buyProductId)} → ${freeQty || 1} x ${getProductName(freeProductId)}`}
                    </div>
                  )}
                  <div className="mt-2">
                    <span className="font-semibold">Statut prévu :</span>{" "}
                    {active ? "Active" : "Inactive"}
                  </div>
                </div>
              </div>
            </div>
            <div className="app-modal-footer sticky bottom-0">
              <button
                className="app-modal-btn app-modal-btn-secondary"
                onClick={() => setShowModal(false)}
              >
                Annuler
              </button>
              <button
                className="app-modal-btn app-modal-btn-primary"
                onClick={handleSave}
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PromotionManagement;
