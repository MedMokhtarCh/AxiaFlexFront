
import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Order } from './order.entity';

@Entity('pos_sessions')
export class PosSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ default: true })
  isOpen: boolean;

  @Column({ type: 'bigint' })
  openedAt: number;

  @Column({ type: 'bigint', nullable: true })
  closedAt: number;

  @Column({ type: 'decimal', precision: 10, scale: 3 })
  openingBalance: number;

  @Column({ type: 'decimal', precision: 10, scale: 3, nullable: true })
  closingBalance: number;

  @Column({ type: 'decimal', precision: 10, scale: 3, default: 0 })
  cashSales: number;

  @Column({ type: 'decimal', precision: 10, scale: 3, default: 0 })
  cardSales: number;

  @Column({ type: 'decimal', precision: 10, scale: 3, default: 0 })
  totalSales: number;

  @OneToMany(() => Order, (order) => order.session)
  orders: Order[];
}
