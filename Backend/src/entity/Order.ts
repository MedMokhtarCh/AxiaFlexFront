import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { OrderItem } from './OrderItem.js';
import { Payment } from './Payment.js';

@Entity()
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('varchar', { nullable: true })
  terminalId?: string | null;


  @OneToMany(() => OrderItem, (item: any) => item.order)
  items!: OrderItem[];

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  total!: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  timbre!: number;

  @Column('varchar', { nullable: true })
  serverName?: string;

  @Column('varchar', { nullable: true })
  serverId?: string;

  @Column('varchar', { nullable: true })
  shiftId?: string;

  @Column('varchar', { nullable: true })
  tableNumber?: string;

  @Column('varchar', { nullable: true })
  zoneId?: string;

  @Column('varchar', { nullable: true })
  clientId?: string | null;

  @Column('varchar', { nullable: true })
  invoiceId?: string | null;

  @Column('varchar', { nullable: true })
  type?: string;

  @Column('varchar', { default: 'PENDING' })
  status!: string;

  @Column('bigint')
  createdAt!: number;

  @Column('decimal', { precision: 10, scale: 3, default: 0 })
  discount!: number;

  @Column('varchar', { nullable: true })
  paymentMethod?: string;

  @Column('bigint', { nullable: true })
  stockDeductedAt?: number | null;

  @Column('varchar', { nullable: true })
  ticketNumber?: string;

  /** Nom affiché au comptoir / KDS client (ex. fast food). */
  @Column('varchar', { nullable: true })
  clientDisplayName?: string | null;

  @Column('decimal', { precision: 10, scale: 3, default: 0 })
  paidAmount!: number;


  @OneToMany(() => Payment, (payment: any) => payment.order)
  payments!: Payment[];
}
