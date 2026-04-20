export type FiscalLifecycleStatus = 'DRAFT' | 'SIGNED' | 'PENDING_SYNC' | 'ACK' | 'REJECTED';

export interface FiscalCheckoutItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface FiscalCheckoutPayload {
  orderId?: string;
  terminalId: string;
  cashierId?: string;
  cashierName?: string;
  items: FiscalCheckoutItem[];
  total: number;
  discount?: number;
  timbre?: number;
  paymentMethod?: string;
}

export interface SignedFiscalPayload extends FiscalCheckoutPayload {
  ticketId: string;
  signedAt: string;
  signature: string;
  hash: string;
  qrPayload: string;
  sicReference?: string;
}

export interface FiscalTransaction {
  ticketId: string;
  orderId: string;
  status: FiscalLifecycleStatus;
  payload: SignedFiscalPayload;
  attempts: number;
  lastError?: string;
  syncedAt?: string;
  createdAt: string;
  updatedAt: string;
}
