import React from "react";
import ActionButton from "./ActionButton";
import {
  Boxes,
  Plus,
  Edit2,
  Trash2,
  ArrowUpCircle,
  ArrowDownCircle,
} from "lucide-react";

interface StockMovement {
  id: string;
  productId: string;
  variantId?: string | null;
  type: string;
  quantity: number;
  note?: string | null;
  userName?: string;
  createdAt: number;
}

interface GestionStockProps {
  stockMovements: StockMovement[];
  productsById: Map<string, any>;
  formatDateTimeSafe: (v: any) => string;
  openEditStockMovement: (movement: StockMovement) => void;
  openCreateStockMovement: () => void;
  deleteStockMovement?: (id: string) => void;
}

const GestionStock: React.FC<GestionStockProps> = ({
  stockMovements,
  productsById,
  formatDateTimeSafe,
  openEditStockMovement,
  openCreateStockMovement,
  deleteStockMovement,
}) => {
  return (
    <div className="p-6">
      {/* Add Stock Movement button */}
      <div className="flex justify-end mb-6">
        <ActionButton variant="primary" onClick={openCreateStockMovement}>
          <Plus size={18} className="mr-2" />
          Ajouter Mouvement
        </ActionButton>
      </div>

      {/* Empty State */}
      {stockMovements.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-4">
            <Boxes size={40} className="text-indigo-400" />
          </div>
          <h3 className="text-lg font-bold text-slate-700 mb-2">
            Aucun mouvement de stock
          </h3>
          <p className="text-slate-500 mb-6">
            Enregistrez votre premier mouvement de stock
          </p>
          <ActionButton variant="primary" onClick={openCreateStockMovement}>
            <Plus size={18} className="mr-2" />
            Ajouter un mouvement
          </ActionButton>
        </div>
      ) : (
        /* Stock Movement List */
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="p-4 font-semibold text-slate-600 text-sm">
                  Produit
                </th>
                <th className="p-4 font-semibold text-slate-600 text-sm">
                  Type
                </th>
                <th className="p-4 font-semibold text-slate-600 text-sm">
                  Quantité
                </th>
                <th className="p-4 font-semibold text-slate-600 text-sm">
                  Note
                </th>
                <th className="p-4 font-semibold text-slate-600 text-sm">
                  Utilisateur
                </th>
                <th className="p-4 font-semibold text-slate-600 text-sm">
                  Date
                </th>
                <th className="p-4 font-semibold text-slate-600 text-sm text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {stockMovements.slice(0, 50).map((mov) => (
                <tr
                  key={mov.id}
                  className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                >
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          mov.type === "IN" ? "bg-emerald-100" : "bg-red-100"
                        }`}
                      >
                        {mov.type === "IN" ? (
                          <ArrowUpCircle
                            size={18}
                            className="text-emerald-600"
                          />
                        ) : (
                          <ArrowDownCircle size={18} className="text-red-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-bold text-slate-800">
                          {productsById.get(mov.productId)?.name ||
                            mov.productId}
                        </p>
                        {mov.variantId && (
                          <p className="text-xs text-slate-400">Variante</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-semibold ${
                        mov.type === "IN"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {mov.type === "IN" ? "Entrée" : "Sortie"}
                    </span>
                  </td>
                  <td className="p-4 font-bold text-slate-800">
                    {mov.type === "IN" ? "+" : "-"}
                    {mov.quantity}
                  </td>
                  <td className="p-4 text-sm text-slate-600">
                    {mov.note || "—"}
                  </td>
                  <td className="p-4 text-sm text-slate-600">
                    {mov.userName || "—"}
                  </td>
                  <td className="p-4 text-sm text-slate-500">
                    {formatDateTimeSafe(mov.createdAt)}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2 justify-end">
                      <ActionButton
                        variant="ghost"
                        onClick={() => openEditStockMovement(mov)}
                        className="text-indigo-600 hover:bg-indigo-50"
                      >
                        <Edit2 size={16} />
                      </ActionButton>
                      {deleteStockMovement && (
                        <ActionButton
                          variant="ghost"
                          onClick={() => deleteStockMovement(mov.id)}
                          className="text-red-600 hover:bg-red-50"
                        >
                          <Trash2 size={16} />
                        </ActionButton>
                      )}
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

export default GestionStock;
