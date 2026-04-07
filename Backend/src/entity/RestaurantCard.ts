import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class RestaurantCard {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Code unique (carte physique / QR). */
  @Column('varchar', { unique: true })
  code!: string;

  @Column('varchar', { nullable: true })
  holderName?: string | null;

  @Column('decimal', { precision: 12, scale: 3, default: 0 })
  balance!: number;

  @Column('boolean', { default: true })
  active!: boolean;

  @Column('bigint')
  createdAt!: number;
}
