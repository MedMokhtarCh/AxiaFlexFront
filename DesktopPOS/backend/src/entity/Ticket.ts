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

  @Column('varchar', { length: 64, nullable: true })
  fiscalImdf?: string | null;

  @Column('varchar', { length: 24, nullable: true })
  fiscalStatus?: 'SIGNED' | 'REJECTED' | null;

  @Column('varchar', { length: 16, nullable: true })
  fiscalMode?: 'ONLINE' | 'OFFLINE' | null;

  @Column('text', { nullable: true })
  fiscalQrPayload?: string | null;

  @Column('text', { nullable: true })
  fiscalSignature?: string | null;

  @Column('text', { nullable: true })
  fiscalPayloadJson?: string | null;

  @Column('varchar', { length: 120, nullable: true })
  fiscalErrorCode?: string | null;

  @Column('bigint')
  createdAt!: number;
}
