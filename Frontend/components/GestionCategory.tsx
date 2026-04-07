import React from "react";
import ActionButton from "./ActionButton";
import { FolderTree, Plus, Edit2, Trash2 } from "lucide-react";

interface GestionCategoryProps {
  categories: any[];
  getCategoryPath: (catId: string) => string;
  openEditCategory: (cat: any) => void;
  deleteCategory: (id: string) => void;
  openCreateCategory: () => void;
}

const GestionCategory: React.FC<GestionCategoryProps> = ({
  categories,
  getCategoryPath,
  openEditCategory,
  deleteCategory,
  openCreateCategory,
}) => {
  return (
    <div className="p-6">
      <div className="flex justify-end mb-6">
        <ActionButton variant="primary" onClick={openCreateCategory}>
          <Plus size={18} className="mr-2" />
          Ajouter Catégorie
        </ActionButton>
      </div>

      {/* Empty State */}
      {categories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-4">
            <FolderTree size={40} className="text-indigo-400" />
          </div>
          <h3 className="text-lg font-bold text-slate-700 mb-2">
            Aucune catégorie
          </h3>
          <p className="text-slate-500 mb-6">
            Commencez par créer vos catégories
          </p>
          <ActionButton variant="primary" onClick={openCreateCategory}>
            <Plus size={18} className="mr-2" />
            Ajouter une catégorie
          </ActionButton>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="p-4 font-semibold text-slate-600 text-sm">
                  Nom
                </th>
                <th className="p-4 font-semibold text-slate-600 text-sm">
                  Parent
                </th>
                <th className="p-4 font-semibold text-slate-600 text-sm text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <tr
                  key={cat.id}
                  className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                >
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                        <FolderTree size={18} className="text-indigo-600" />
                      </div>
                      <span className="font-bold text-slate-800">
                        {cat.name}
                      </span>
                    </div>
                  </td>
                  <td className="p-4">
                    {cat.parentId ? (
                      <span className="px-3 py-1 bg-slate-100 rounded-full text-sm text-slate-600">
                        {getCategoryPath(cat.parentId)}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2 justify-end">
                      <ActionButton
                        variant="ghost"
                        onClick={() => openEditCategory(cat)}
                        className="text-indigo-600 hover:bg-indigo-50"
                      >
                        <Edit2 size={16} />
                      </ActionButton>
                      <ActionButton
                        variant="ghost"
                        onClick={() => deleteCategory(cat.id)}
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

export default GestionCategory;
