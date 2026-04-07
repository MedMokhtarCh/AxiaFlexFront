import React from "react";
import { OrderItem } from "../../types";

interface LineItemEditorModalProps {
  item: OrderItem;
  discountMode: "PERCENT" | "AMOUNT";
  discountValue: string;
  predefinedNotes: string[];
  onClose: () => void;
  onDelete: () => void;
  onDiscountModeChange: (mode: "PERCENT" | "AMOUNT") => void;
  onDiscountValueChange: (value: string) => void;
  onApplyDiscount: () => void;
  onSetOffered: () => void;
  onNoteChange: (value: string) => void;
  onAddQuickNote: (note: string) => void;
  onClearNotes: () => void;
}

const LineItemEditorModal: React.FC<LineItemEditorModalProps> = ({
  item,
  discountMode,
  discountValue,
  predefinedNotes,
  onClose,
  onDelete,
  onDiscountModeChange,
  onDiscountValueChange,
  onApplyDiscount,
  onSetOffered,
  onNoteChange,
  onAddQuickNote,
  onClearNotes,
}) => {
  // ...UI code for the modal, similar to the original JSX for editing a line item...
  return <div>Line Item Editor Modal</div>;
};

export default LineItemEditorModal;
