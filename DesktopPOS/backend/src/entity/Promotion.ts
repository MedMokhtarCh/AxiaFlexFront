import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'promotions' })
export class Promotion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('varchar')
  name!: string;

  @Column('varchar')
  type!: string; // PERIOD_PRICE | BUY_X_GET_Y

  @Column('boolean', { default: true })
  active!: boolean;

  @Column('bigint', { nullable: true })
  startAt?: number | null;

  @Column('bigint', { nullable: true })
  endAt?: number | null;

  @Column('varchar', { nullable: true })
  productId?: string | null; // PERIOD_PRICE target

  @Column('decimal', { precision: 10, scale: 3, nullable: true })
  promoPrice?: number | null;

  @Column('varchar', { nullable: true })
  buyProductId?: string | null;

  @Column('int', { nullable: true })
  buyQty?: number | null;

  @Column('varchar', { nullable: true })
  freeProductId?: string | null;

  @Column('int', { nullable: true })
  freeQty?: number | null;
}
