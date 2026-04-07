import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Order } from './Order.js';

@Entity()
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('varchar')
  code!: string;

  @ManyToOne(() => Order, (order: any) => order.id)
  order!: Order;

  @Column('decimal', { precision: 12, scale: 3, default: 0 })
  totalPaid!: number;

  @Column('varchar')
  paymentMethod!: string;

  /** Référence externe (ex: code ticket resto, code carte resto, autorisation TPE). */
  @Column('varchar', { nullable: true })
  reference?: string | null;

  /** Métadonnées du moyen de paiement (scan code, détails techniques, etc.). */
  @Column({ type: 'jsonb', nullable: true })
  metadata?: unknown;

  @Column('bigint')
  createdAt!: number;
}
