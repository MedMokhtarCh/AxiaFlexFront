import React from "react";
import { OrderItem, PaymentMethod, OrderPayment } from "../../types";

interface PaymentModalProps {
  cart: OrderItem[];
  isSplitPayment: boolean;
  selectedPaymentItems: Record<string, number>;
  amountReceived: string;
  paymentBreakdown: OrderPayment[];
  paidSoFar: number;
  remainingToPay: number;
  onClose: () => void;
  onSplitPaymentChange: (checked: boolean) => void;
  onSelectPaymentItem: (id: string, qty: number) => void;
  onAmountReceivedChange: (value: string) => void;
  onAddPayment: (method: PaymentMethod) => void;
}

const PaymentModal: React.FC<PaymentModalProps> = ({
  cart,
  isSplitPayment,
  selectedPaymentItems,
  amountReceived,
  paymentBreakdown,
  paidSoFar,
  remainingToPay,
  onClose,
  onSplitPaymentChange,
  onSelectPaymentItem,
  onAmountReceivedChange,
  onAddPayment,
}) => {
  // ...UI code for the payment modal...
  return <div>Payment Modal</div>;
};

export default PaymentModal;
