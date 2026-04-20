import React from "react";
import { Product } from "../types";

interface ProductSelectProps {
  products: Product[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  filterStock?: boolean;
}

const ProductSelect: React.FC<ProductSelectProps> = ({
  products,
  value,
  onChange,
  className = "",
  filterStock = true,
}) => (
  <div className="relative">
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
      title="Sélectionnez un produit géré en stock."
    >
      <option value="">Produit...</option>
      {products
        .filter((p) => !filterStock || p.manageStock)
        .map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
    </select>
    <span
      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 cursor-help"
      title="Seuls les produits gérés en stock apparaissent ici."
    >
      ?
    </span>
  </div>
);

export default ProductSelect;
