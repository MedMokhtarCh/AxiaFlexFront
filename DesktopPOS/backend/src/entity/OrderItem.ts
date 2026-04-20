import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Order } from './Order.js';

@Entity()
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Order, (order: any) => order.items)
  order!: any;

  @Column('varchar')
  productId!: string;

  @Column('varchar', { nullable: true })
  variantId?: string | null;

  @Column('varchar', { nullable: true })
  stockBatchNo?: string | null;

  @Column('varchar')
  name!: string;

  @Column('varchar', { nullable: true })
  notes?: string | null;

  @Column('decimal', { precision: 10, scale: 2 })
  unitPrice!: number;

  @Column('int')
  quantity!: number;

  @Column('int', { default: 0 })
  paidQuantity!: number;

  @Column('int', { default: 0 })
  remainingQuantity!: number;

  @Column('boolean', { default: false })
  isLocked!: boolean;

  @Column('varchar', { default: 'UNPAID' })
  status!: 'UNPAID' | 'PARTIAL' | 'PAID';

  /** État préparation cuisine / bar (KDS). */
  @Column('varchar', { default: 'PENDING' })
  prepStatus!: string;

  /** Poste cible : KITCHEN ou BAR (déduit des imprimantes produit si non renseigné côté client). */
  @Column('varchar', { nullable: true })
  station?: string | null;
}
