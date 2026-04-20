import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('boolean', { default: false })
  isOpen!: boolean;

  @Column('bigint', { nullable: true })
  openedAt?: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  openingBalance!: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  totalSales!: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  cashSales!: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  cardSales!: number;

  @Column('simple-json', { nullable: true })
  movements?: any[];
}
