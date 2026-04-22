
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, CreateDateColumn } from 'typeorm';
import { OrderType, OrderStatus, PaymentMethod } from '../../types';
import { User } from './user.entity';
import { TableConfig } from './table.entity';
import { Client } from './client.entity';
import { OrderItem } from './order-item.entity';
import { PosSession } from './session.entity';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: OrderType })
  type: OrderType;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  @Column({ type: 'enum', enum: PaymentMethod, nullable: true })
  paymentMethod: PaymentMethod;

  @Column({ type: 'decimal', precision: 10, scale: 3 })
  total: number;

  @Column({ type: 'decimal', precision: 10, scale: 3, default: 0 })
  discount: number;

  @Column({ type: 'decimal', precision: 10, scale: 3, default: 1.0 })
  timbre: number;

  @Column({ type: 'varchar', length: 32 })
  sessionDay: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.orders)
  server: User;

  @ManyToOne(() => TableConfig, { nullable: true })
  table: TableConfig;

  @ManyToOne(() => Client, { nullable: true })
  client: Client;

  @ManyToOne(() => PosSession, (session) => session.orders)
  session: PosSession;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
  items: OrderItem[];
}
