import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Ticket } from './Ticket.js';

@Entity()
export class TicketItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Ticket, (ticket) => (ticket as any).items)
  ticket!: Ticket;

  @Column('varchar')
  orderItemId!: string;

  @Column('varchar')
  productId!: string;

  @Column('varchar')
  name!: string;

  @Column('decimal', { precision: 10, scale: 3 })
  unitPrice!: number;

  @Column('int')
  quantity!: number;

  @Column('decimal', { precision: 12, scale: 3 })
  total!: number;
}
