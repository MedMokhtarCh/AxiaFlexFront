import React from "react";

interface NavbarProps {
  activeView: string;
  setActiveView: (view: string) => void;
  viewHint: string;
}

const Navbar: React.FC<NavbarProps> = ({
  activeView,
  setActiveView,
  viewHint,
}) => (
  <div className="flex flex-col xl:flex-row gap-4 items-center justify-between shrink-0">
    <div className="flex gap-2">
      <button
        className={`px-4 py-2 rounded-xl font-bold ${activeView === "items" ? "bg-indigo-600 text-white" : "bg-slate-100"}`}
        onClick={() => setActiveView("items")}
      >
        Articles
      </button>
      <button
        className={`px-4 py-2 rounded-xl font-bold ${activeView === "categories" ? "bg-indigo-600 text-white" : "bg-slate-100"}`}
        onClick={() => setActiveView("categories")}
      >
        Catégories
      </button>
      <button
        className={`px-4 py-2 rounded-xl font-bold ${activeView === "promotions" ? "bg-indigo-600 text-white" : "bg-slate-100"}`}
        onClick={() => setActiveView("promotions")}
      >
        Promotions
      </button>
      <button
        className={`px-4 py-2 rounded-xl font-bold ${activeView === "stock" ? "bg-indigo-600 text-white" : "bg-slate-100"}`}
        onClick={() => setActiveView("stock")}
      >
        Stock
      </button>
    </div>
    <div className="font-bold text-slate-500">{viewHint}</div>
  </div>
);

export default Navbar;
