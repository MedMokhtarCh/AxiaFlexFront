import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'fund_sessions' })
export class FundSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('varchar', { nullable: true })
  terminalId?: string | null;

  @Column('varchar')
  fundId!: string;

  @Column('varchar')
  shiftId!: string;

  @Column('varchar')
  cashierId!: string;

  @Column('varchar')
  cashierName!: string;

  @Column('bigint')
  openedAt!: number;

  @Column('bigint', { nullable: true })
  closedAt?: number | null;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  openingBalance!: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  closingBalance!: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  totalSales!: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  cashSales!: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  cardSales!: number;

  @Column('varchar', { default: 'OPEN' })
  status!: string;

  @Column('varchar', { nullable: true })
  notes?: string | null;
}
