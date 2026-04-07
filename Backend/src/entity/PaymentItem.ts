import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Payment } from './Payment.js';
import { OrderItem } from './OrderItem.js';

@Entity()
export class PaymentItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Payment, (payment: any) => payment.id)
  payment!: Payment;

  @ManyToOne(() => OrderItem, (orderItem: any) => orderItem.id)
  orderItem!: OrderItem;

  @Column('int')
  quantityPaid!: number;

  @Column('decimal', { precision: 10, scale: 2 })
  unitPrice!: number;

  @Column('decimal', { precision: 12, scale: 3 })
  total!: number;
}
