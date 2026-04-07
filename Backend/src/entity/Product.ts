import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity()
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_products_code', { unique: true })
  @Column('varchar', { nullable: true })
  code?: string | null;

  @Column('varchar')
  name!: string;

  @Column('decimal', { precision: 10, scale: 3, default: 0 })
  price!: number;

  @Column('varchar', { nullable: true })
  category?: string;

  @Column('varchar', { nullable: true })
  imageUrl?: string;

  @Column('boolean', { default: false })
  isPack!: boolean;

  @Column('simple-json', { nullable: true })
  subItemIds?: string[];

  @Column('simple-json', { nullable: true })
  printerIds?: string[];

  @Column('decimal', { precision: 10, scale: 3, nullable: true })
  promotionPrice?: number;

  @Column('bigint', { nullable: true })
  promoStart?: number;

  @Column('bigint', { nullable: true })
  promoEnd?: number;

  @Column('simple-json', { nullable: true })
  variants?: any[];

  @Column('boolean', { default: false })
  manageStock!: boolean;

  @Column('boolean', { default: true })
  visibleInPos!: boolean;

  @Column('decimal', { precision: 14, scale: 3, default: 0 })
  stock!: number;

  @Column('varchar', { nullable: true })
  unit?: string;

  @Column('varchar', { default: 'FINISHED' })
  productType!: 'RAW' | 'SEMI_FINISHED' | 'FINISHED' | 'PACKAGING';

  @Column('varchar', { nullable: true })
  baseUnit?: string | null;

  @Column('simple-json', { nullable: true })
  recipe?: {
    ingredientProductId: string;
    quantity: number;
    unit: string;
  }[];

  @Column('int', { default: 0 })
  recipeVersion!: number;

  @Column('int', { nullable: true })
  alertLevel?: number | null;
}
