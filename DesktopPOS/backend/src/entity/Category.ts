import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'categories' })
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('varchar')
  name!: string;

  @Column('varchar', { nullable: true })
  parentId?: string | null;

  @Column('varchar', { nullable: true })
  imageUrl?: string | null;
}
