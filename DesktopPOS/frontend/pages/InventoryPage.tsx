import React from "react";
import InventoryManager from "../components/InventoryManager";

const InventoryPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black">Inventaire</h2>
          <p className="text-sm text-slate-500">
            Gestion des articles, promotions et stock
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
        <InventoryManager />
      </div>
    </div>
  );
};

export default InventoryPage;
