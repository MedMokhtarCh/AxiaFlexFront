import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity({ name: 'stock_adjustments' })
export class StockAdjustment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_adjustments_status')
  @Column('varchar')
  status!: 'PENDING' | 'APPROVED' | 'REJECTED';

  @Column('varchar')
  productId!: string;

  @Column('varchar', { nullable: true })
  variantId?: string | null;

  @Column('varchar')
  kind!: 'WASTAGE' | 'EXPIRED' | 'DAMAGE' | 'CORRECTION';

  @Column('varchar')
  type!: 'IN' | 'OUT';

  @Column('decimal', { precision: 14, scale: 3 })
  quantity!: number;

  @Column('varchar', { nullable: true })
  warehouseId?: string | null;

  @Column('varchar', { nullable: true })
  branchId?: string | null;

  @Column('varchar', { nullable: true })
  reason?: string | null;

  @Column('varchar', { nullable: true })
  note?: string | null;

  @Column('varchar', { nullable: true })
  requestedBy?: string | null;

  @Column('varchar', { nullable: true })
  approvedBy?: string | null;

  @Column('varchar', { nullable: true })
  rejectedBy?: string | null;

  @Column('varchar', { nullable: true })
  rejectionReason?: string | null;

  @Column('bigint')
  createdAt!: number;

  @Column('bigint', { nullable: true })
  decidedAt?: number | null;
}
