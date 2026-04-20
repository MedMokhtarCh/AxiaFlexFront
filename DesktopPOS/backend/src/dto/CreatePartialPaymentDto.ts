export class CreatePartialPaymentDto {
  orderId!: string;
  items!: { orderItemId: string; quantity: number }[];
  paymentMethod!: string;
}
