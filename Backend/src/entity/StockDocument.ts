import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity({ name: 'stock_documents' })
export class StockDocument {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_stock_documents_code', { unique: true })
  @Column('varchar')
  code!: string;

  @Index('idx_stock_documents_type')
  @Column('varchar')
  type!: 'ENTRY' | 'OUT' | 'TRANSFER' | 'INVENTORY';

  @Column('varchar', { default: 'POSTED' })
  status!: 'POSTED' | 'DRAFT';

  @Column('varchar', { nullable: true })
  warehouseId?: string | null;

  @Column('varchar', { nullable: true })
  targetWarehouseId?: string | null;

  @Column('varchar', { nullable: true })
  branchId?: string | null;

  @Column('varchar', { nullable: true })
  note?: string | null;

  @Column('varchar', { nullable: true })
  userName?: string | null;

  @Column('varchar', { nullable: true })
  supplierId?: string | null;

  @Column('varchar', { nullable: true })
  externalRef?: string | null;

  @Column('bigint', { nullable: true })
  documentDate?: number | null;

  @Index('idx_stock_documents_created_at')
  @Column('bigint')
  createdAt!: number;
}
