import React from "react";
import { Product, ProductVariant } from "../../types";

interface VariantModalProps {
  product: Product;
  onSelect: (variant: ProductVariant) => void;
  onClose: () => void;
}

const VariantModal: React.FC<VariantModalProps> = ({
  product,
  onSelect,
  onClose,
}) => {
  // ...UI code for the variant modal...
  return <div>Variant Modal</div>;
};

export default VariantModal;
