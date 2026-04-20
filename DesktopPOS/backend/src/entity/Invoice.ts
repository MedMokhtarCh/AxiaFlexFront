import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity()
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_invoices_code', { unique: true })
  @Column('varchar', { nullable: true })
  code?: string | null;

  @Column('varchar')
  clientId!: string;

  @Column('simple-json')
  orderIds!: string[];

  @Column('decimal', { precision: 10, scale: 3, default: 0 })
  total!: number;

  @Column('bigint')
  createdAt!: number;
}
