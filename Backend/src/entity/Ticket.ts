import { Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToOne } from 'typeorm';
import { Order } from './Order.js';
import { TicketItem } from './TicketItem.js';
import { Payment } from './Payment.js';

@Entity()
export class Ticket {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('varchar')
  code!: string; // prefixed code (from settings.ticketPrefix)

  @ManyToOne(() => Order, (order) => (order as any).id)
  order!: any;

  /** Ticket issu d'un encaissement spécifique (paiement partiel ou complet). */
  @ManyToOne(() => Payment, (payment) => (payment as any).id, { nullable: true })
  payment?: any | null;

  @OneToMany(() => TicketItem, (item) => (item as any).ticket, { cascade: true })
  items!: any[];

  @Column('decimal', { precision: 12, scale: 3, default: 0 })
  total!: number;

  @Column('decimal', { precision: 12, scale: 3, default: 0 })
  discount!: number;

  @Column('decimal', { precision: 12, scale: 3, default: 0 })
  timbre!: number;

  @Column('bigint')
  createdAt!: number;
}
