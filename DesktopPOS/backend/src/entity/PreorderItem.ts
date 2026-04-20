import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity({ name: 'preorder_items' })
export class PreorderItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_preorder_items_preorder')
  @Column('varchar')
  preorderId!: string;

  @Column('varchar')
  productId!: string;

  @Column('varchar')
  name!: string;

  @Column('decimal', { precision: 10, scale: 3, default: 0 })
  unitPrice!: number;

  @Column('int', { default: 1 })
  quantity!: number;

  @Column('decimal', { precision: 12, scale: 3, default: 0 })
  total!: number;

  @Column('varchar', { nullable: true })
  note?: string | null;

  @Column('bigint')
  createdAt!: number;
}
