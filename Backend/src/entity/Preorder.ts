import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity({ name: 'preorders' })
export class Preorder {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_preorders_code', { unique: true })
  @Column('varchar')
  code!: string;

  @Column('varchar', { nullable: true })
  preorderUserId?: string | null;

  @Column('varchar')
  customerName!: string;

  @Column('varchar', { nullable: true })
  customerPhone?: string | null;

  @Column('varchar')
  mode!: 'DELIVERY' | 'PICKUP' | 'DINE_LATER';

  @Column('varchar', { default: 'PENDING' })
  status!: 'PENDING' | 'CONFIRMED' | 'READY' | 'COMPLETED' | 'CANCELLED';

  @Column('bigint', { nullable: true })
  scheduledAt?: number | null;

  @Column('decimal', { precision: 12, scale: 3, default: 0 })
  total!: number;

  @Column('varchar', { nullable: true })
  note?: string | null;

  @Column('bigint')
  createdAt!: number;
}
