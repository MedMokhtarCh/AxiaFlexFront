import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity({ name: 'stock_document_lines' })
export class StockDocumentLine {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_stock_document_lines_document')
  @Column('varchar')
  documentId!: string;

  @Index('idx_stock_document_lines_product')
  @Column('varchar')
  productId!: string;

  @Column('varchar', { nullable: true })
  variantId?: string | null;

  @Column('varchar')
  movementType!: 'IN' | 'OUT';

  @Column('decimal', { precision: 14, scale: 3 })
  quantity!: number;

  @Column('varchar', { nullable: true })
  note?: string | null;

  @Column('bigint')
  createdAt!: number;
}
