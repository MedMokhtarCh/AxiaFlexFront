import React from "react";

interface ConfirmModalProps {
  modalKind: "cancel-order" | "empty-cart" | "order-validated" | null;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  modalKind,
  onConfirm,
  onCancel,
}) => {
  // ...UI code for the confirm modal...
  return <div>Confirm Modal</div>;
};

export default ConfirmModal;
