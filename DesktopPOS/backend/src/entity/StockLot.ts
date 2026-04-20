import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity({ name: 'stock_lots' })
export class StockLot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_stock_lots_product')
  @Column('varchar')
  productId!: string;

  @Column('varchar', { nullable: true })
  variantId?: string | null;

  @Index('idx_stock_lots_warehouse')
  @Column('varchar', { nullable: true })
  warehouseId?: string | null;

  @Column('varchar', { nullable: true })
  branchId?: string | null;

  @Column('varchar', { nullable: true })
  batchNo?: string | null;

  @Column('bigint', { nullable: true })
  expiryAt?: number | null;

  @Column('bigint', { nullable: true })
  receivedAt?: number | null;

  @Column('decimal', { precision: 14, scale: 3, default: 0 })
  quantity!: number;

  @Column('decimal', { precision: 14, scale: 3, default: 0 })
  remainingQuantity!: number;

  @Column('decimal', { precision: 14, scale: 4, nullable: true })
  unitCost?: number | null;

  @Column('bigint')
  createdAt!: number;
}
