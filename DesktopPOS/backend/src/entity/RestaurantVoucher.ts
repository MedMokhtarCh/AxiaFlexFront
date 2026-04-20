import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class RestaurantVoucher {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Code unique scanné sur le ticket restaurant. */
  @Column('varchar', { unique: true })
  code!: string;

  @Column('decimal', { precision: 12, scale: 3, default: 0 })
  amount!: number;

  @Column('decimal', { precision: 12, scale: 3, default: 0 })
  remainingAmount!: number;

  @Column('varchar', { default: 'ACTIVE' })
  status!: 'ACTIVE' | 'USED' | 'CANCELLED';

  @Column('bigint')
  issuedAt!: number;

  @Column('bigint', { nullable: true })
  usedAt?: number | null;
}
