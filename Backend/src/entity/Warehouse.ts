import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity({ name: 'warehouses' })
export class Warehouse {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_warehouses_code', { unique: true })
  @Column('varchar')
  code!: string;

  @Column('varchar')
  name!: string;

  @Column('varchar', { nullable: true })
  branchId?: string | null;

  @Column('boolean', { default: true })
  isActive!: boolean;

  @Column('bigint')
  createdAt!: number;
}
