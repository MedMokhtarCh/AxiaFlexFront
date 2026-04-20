import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { RestaurantCard } from './RestaurantCard.js';
import { Payment } from './Payment.js';

@Entity()
export class RestaurantCardMovement {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => RestaurantCard, (card: any) => card.id)
  card!: RestaurantCard;

  @ManyToOne(() => Payment, (payment: any) => payment.id, { nullable: true })
  payment?: Payment | null;

  @Column('varchar')
  type!: 'CREDIT' | 'DEBIT';

  @Column('decimal', { precision: 12, scale: 3, default: 0 })
  amount!: number;

  @Column('varchar', { nullable: true })
  reference?: string | null;

  @Column('bigint')
  createdAt!: number;
}
