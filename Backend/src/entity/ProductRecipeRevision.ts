import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity({ name: 'product_recipe_revisions' })
export class ProductRecipeRevision {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_recipe_revisions_product')
  @Column('varchar')
  productId!: string;

  @Column('int')
  version!: number;

  @Column('simple-json')
  items!: {
    ingredientProductId: string;
    quantity: number;
    unit: string;
  }[];

  @Column('varchar', { nullable: true })
  changedBy?: string | null;

  @Column('bigint')
  createdAt!: number;
}
