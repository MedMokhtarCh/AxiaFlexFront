import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'shifts' })
export class Shift {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('varchar', { nullable: true })
  terminalId?: string | null;

  @Column('varchar')
  userId!: string;

  @Column('varchar')
  userName!: string;

  @Column('varchar')
  role!: string;

  @Column('varchar', { nullable: true })
  openedById?: string | null;

  @Column('varchar', { nullable: true })
  openedByName?: string | null;

  @Column('varchar', { nullable: true })
  cashierId?: string | null;

  @Column('varchar', { nullable: true })
  cashierName?: string | null;

  @Column('varchar', { nullable: true })
  fundId?: string | null;

  @Column('varchar', { nullable: true })
  fundName?: string | null;

  @Column('bigint')
  openedAt!: number;

  @Column('bigint', { nullable: true })
  closedAt?: number | null;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  openingFund!: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  closingFund!: number;

  @Column('varchar', { nullable: true })
  notes?: string | null;

  @Column('varchar', { default: 'OPEN' })
  status!: string;
}
