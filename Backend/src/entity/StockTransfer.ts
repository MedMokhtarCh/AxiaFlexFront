import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity({ name: 'stock_transfers' })
export class StockTransfer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_transfers_status')
  @Column('varchar')
  status!: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'COMPLETED';

  @Column('varchar', { nullable: true })
  sourceWarehouseId?: string | null;

  @Column('varchar', { nullable: true })
  sourceBranchId?: string | null;

  @Column('varchar', { nullable: true })
  destinationWarehouseId?: string | null;

  @Column('varchar', { nullable: true })
  destinationBranchId?: string | null;

  @Column('simple-json')
  items!: {
    productId: string;
    quantity: number;
    variantId?: string | null;
    note?: string | null;
  }[];

  @Column('varchar', { nullable: true })
  requestedBy?: string | null;

  @Column('varchar', { nullable: true })
  approvedBy?: string | null;

  @Column('varchar', { nullable: true })
  rejectedBy?: string | null;

  @Column('varchar', { nullable: true })
  rejectionReason?: string | null;

  @Column('varchar', { nullable: true })
  note?: string | null;

  @Column('bigint')
  createdAt!: number;

  @Column('bigint', { nullable: true })
  approvedAt?: number | null;

  @Column('bigint', { nullable: true })
  completedAt?: number | null;
}
