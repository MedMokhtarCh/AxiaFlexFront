import React from "react";
import ActionButton from "./ActionButton";
import { Promotion } from "../types";
import { Tag, Plus, Edit2, Trash2, CheckCircle, XCircle } from "lucide-react";

interface GestionPromotionProps {
  promotions: Promotion[];
  productsById: Map<string, any>;
  formatAmount: (v: any, d?: number) => string;
  formatDateTimeSafe: (v: any) => string;
  deletePromotion: (id: string) => void;
  openEditPromotion: (promotion: Promotion) => void;
  openCreatePromotion: () => void;
}

const GestionPromotion: React.FC<GestionPromotionProps> = ({
  promotions,
  productsById,
  formatAmount,
  formatDateTimeSafe,
  deletePromotion,
  openEditPromotion,
  openCreatePromotion,
}) => {
  return (
    <div className="p-6">
      {/* Add Promotion button */}
      <div className="flex justify-end mb-6">
        <ActionButton variant="primary" onClick={openCreatePromotion}>
          <Plus size={18} className="mr-2" />
          Ajouter Promotion
        </ActionButton>
      </div>

      {/* Empty State */}
      {promotions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-4">
            <Tag size={40} className="text-indigo-400" />
          </div>
          <h3 className="text-lg font-bold text-slate-700 mb-2">
            Aucune promotion
          </h3>
          <p className="text-slate-500 mb-6">Créez votre première promotion</p>
          <ActionButton variant="primary" onClick={openCreatePromotion}>
            <Plus size={18} className="mr-2" />
            Ajouter une promotion
          </ActionButton>
        </div>
      ) : (
        /* Promotion List */
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="p-4 font-semibold text-slate-600 text-sm">
                  Nom
                </th>
                <th className="p-4 font-semibold text-slate-600 text-sm">
                  Statut
                </th>
                <th className="p-4 font-semibold text-slate-600 text-sm">
                  Produit
                </th>
                <th className="p-4 font-semibold text-slate-600 text-sm">
                  Prix promo
                </th>
                <th className="p-4 font-semibold text-slate-600 text-sm">
                  Début
                </th>
                <th className="p-4 font-semibold text-slate-600 text-sm">
                  Fin
                </th>
                <th className="p-4 font-semibold text-slate-600 text-sm text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {promotions.map((promo) => (
                <tr
                  key={promo.id}
                  className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                >
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                        <Tag size={18} className="text-amber-600" />
                      </div>
                      <span className="font-bold text-slate-800">
                        {promo.name || promo.type}
                      </span>
                    </div>
                  </td>
                  <td className="p-4">
                    {promo.active ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm font-semibold">
                        <CheckCircle size={14} />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-3 py-1 bg-slate-100 text-slate-500 rounded-full text-sm font-semibold">
                        <XCircle size={14} />
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="p-4">
                    {promo.productId ? (
                      <span className="px-3 py-1 bg-slate-100 rounded-full text-sm text-slate-600">
                        {productsById.get(promo.productId)?.name || "—"}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-sm">
                        Tous les produits
                      </span>
                    )}
                  </td>
                  <td className="p-4 font-bold text-indigo-600">
                    {promo.promoPrice ? formatAmount(promo.promoPrice, 3) : "—"}
                  </td>
                  <td className="p-4 text-sm text-slate-600">
                    {promo.startAt ? formatDateTimeSafe(promo.startAt) : "—"}
                  </td>
                  <td className="p-4 text-sm text-slate-600">
                    {promo.endAt ? formatDateTimeSafe(promo.endAt) : "—"}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2 justify-end">
                      <ActionButton
                        variant="ghost"
                        onClick={() => openEditPromotion(promo)}
                        className="text-indigo-600 hover:bg-indigo-50"
                      >
                        <Edit2 size={16} />
                      </ActionButton>
                      <ActionButton
                        variant="ghost"
                        onClick={() => deletePromotion(promo.id)}
                        className="text-red-600 hover:bg-red-50"
                      >
                        <Trash2 size={16} />
                      </ActionButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default GestionPromotion;
