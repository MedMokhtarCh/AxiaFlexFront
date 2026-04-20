import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'fund_movements' })
export class FundMovement {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('varchar')
  fundSessionId!: string;

  @Column('varchar')
  type!: string;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  amount!: number;

  @Column('varchar')
  reason!: string;

  @Column('bigint')
  createdAt!: number;

  @Column('varchar', { nullable: true })
  userId?: string | null;

  @Column('varchar', { nullable: true })
  userName?: string | null;
}
