
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { Category } from './category.entity';
import { ProductVariant } from './variant.entity';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'decimal', precision: 10, scale: 3 })
  price: number;

  @Column({ nullable: true })
  imageUrl: string;

  @Column({ default: false })
  isPack: boolean;

  @Column({ type: 'jsonb', nullable: true })
  subItemIds: string[];

  @Column({ default: true })
  manageStock: boolean;

  @Column({ type: 'int', default: 0 })
  stock: number;

  @Column({ type: 'decimal', precision: 10, scale: 3, nullable: true })
  promotionPrice: number;

  @Column({ type: 'bigint', nullable: true })
  promoStart: number;

  @Column({ type: 'bigint', nullable: true })
  promoEnd: number;

  @Column({ type: 'simple-array', nullable: true })
  printerIds: string[];

  @ManyToOne(() => Category, (category) => category.products)
  category: Category;

  @OneToMany(() => ProductVariant, (variant) => variant.product, { cascade: true })
  variants: ProductVariant[];
}
