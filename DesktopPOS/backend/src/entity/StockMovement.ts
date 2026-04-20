import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity({ name: 'stock_movements' })
export class StockMovement {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_stock_movements_product')
  @Column('varchar')
  productId!: string;

  @Column('varchar', { nullable: true })
  variantId?: string | null;

  @Column('varchar')
  type!: 'IN' | 'OUT';

  @Column('decimal', { precision: 10, scale: 3, default: 0 })
  quantity!: number;

  @Column('decimal', { precision: 14, scale: 4, nullable: true })
  unitCost?: number | null;

  @Column('decimal', { precision: 14, scale: 4, nullable: true })
  totalCost?: number | null;

  @Column('varchar', { nullable: true })
  costMethod?: string | null;

  @Column('varchar', { nullable: true })
  batchNo?: string | null;

  @Column('bigint', { nullable: true })
  expiryAt?: number | null;

  @Column('decimal', { precision: 14, scale: 3, default: 0 })
  quantityBefore!: number;

  @Column('decimal', { precision: 14, scale: 3, default: 0 })
  quantityAfter!: number;

  @Column('varchar', { nullable: true })
  unit?: string | null;

  @Column('varchar', { nullable: true })
  reason?: string | null;

  @Index('idx_stock_movements_ref')
  @Column('varchar', { nullable: true })
  referenceType?: string | null;

  @Index('idx_stock_movements_ref_id')
  @Column('varchar', { nullable: true })
  referenceId?: string | null;

  @Index('idx_stock_movements_source_product')
  @Column('varchar', { nullable: true })
  sourceProductId?: string | null;

  @Column('varchar', { nullable: true })
  branchId?: string | null;

  @Column('varchar', { nullable: true })
  warehouseId?: string | null;

  @Column('varchar', { nullable: true })
  note?: string | null;

  @Column('varchar', { nullable: true })
  userName?: string | null;

  @Column('varchar', { nullable: true })
  approvedBy?: string | null;

  @Index('idx_stock_movements_created_at')
  @Column('bigint')
  createdAt!: number;
}
