import React from "react";
import ActionButton from "./ActionButton";
import { Product } from "../types";
import { Package, Search, Plus, Edit2, Trash2 } from "lucide-react";

interface GestionArticleProps {
  products: Product[];
  categories: any[];
  settings: any;
  isLowStock: (product: Product) => boolean;
  getCategoryPath: (catId: string) => string;
  openEditProduct: (product: Product) => void;
  deleteProduct: (id: string) => void;
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  openCreateArticle: () => void;
}

const GestionArticle: React.FC<GestionArticleProps> = ({
  products,
  categories,
  settings,
  isLowStock,
  getCategoryPath,
  openEditProduct,
  deleteProduct,
  searchTerm,
  setSearchTerm,
  openCreateArticle,
}) => {
  return (
    <div className="p-6">
      {/* Search and Add button */}
      <div className="flex justify-between items-center mb-6">
        <div className="relative flex-1 max-w-md">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            size={20}
          />
          <input
            type="text"
            placeholder="Rechercher un article..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-slate-50"
          />
        </div>
        <ActionButton
          variant="primary"
          onClick={openCreateArticle}
          className="ml-4"
        >
          <Plus size={18} className="mr-2" />
          Ajouter Article
        </ActionButton>
      </div>

      {/* Empty State */}
      {products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-4">
            <Package size={40} className="text-indigo-400" />
          </div>
          <h3 className="text-lg font-bold text-slate-700 mb-2">
            Aucun article
          </h3>
          <p className="text-slate-500 mb-6">
            Commencez par ajouter votre premier article
          </p>
          <ActionButton variant="primary" onClick={openCreateArticle}>
            <Plus size={18} className="mr-2" />
            Ajouter un article
          </ActionButton>
        </div>
      ) : (
        /* Article List */
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="p-4 font-semibold text-slate-600 text-sm">
                  Article
                </th>
                <th className="p-4 font-semibold text-slate-600 text-sm">
                  Catégorie
                </th>
                <th className="p-4 font-semibold text-slate-600 text-sm">
                  Prix
                </th>
                <th className="p-4 font-semibold text-slate-600 text-sm">
                  Stock
                </th>
                <th className="p-4 font-semibold text-slate-600 text-sm text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr
                  key={product.id}
                  className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${isLowStock(product) ? "bg-red-50" : ""}`}
                >
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="w-12 h-12 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center">
                          <Package size={20} className="text-slate-400" />
                        </div>
                      )}
                      <div>
                        <p className="font-bold text-slate-800">
                          {product.name}
                        </p>
                        {product.code && (
                          <p className="text-xs text-slate-400">
                            {product.code}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="px-3 py-1 bg-slate-100 rounded-full text-sm text-slate-600">
                      {getCategoryPath(product.category) || "—"}
                    </span>
                  </td>
                  <td className="p-4 font-bold text-indigo-600">
                    {Number(product.price || 0).toFixed(3)} {settings.currency}
                  </td>
                  <td className="p-4">
                    {product.manageStock ? (
                      <span
                        className={`font-bold ${isLowStock(product) ? "text-red-600" : "text-slate-700"}`}
                      >
                        {product.stock ?? 0}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2 justify-end">
                      <ActionButton
                        variant="ghost"
                        onClick={() => openEditProduct(product)}
                        className="text-indigo-600 hover:bg-indigo-50"
                      >
                        <Edit2 size={16} />
                      </ActionButton>
                      <ActionButton
                        variant="ghost"
                        onClick={() => deleteProduct(product.id)}
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

export default GestionArticle;
