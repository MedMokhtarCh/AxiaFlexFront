import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity({ name: 'suppliers' })
export class Supplier {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_suppliers_code', { unique: true })
  @Column('varchar', { nullable: true })
  code?: string | null;

  @Column('varchar')
  name!: string;

  @Column('varchar', { nullable: true })
  contactName?: string | null;

  @Column('varchar', { nullable: true })
  email?: string | null;

  @Column('varchar', { nullable: true })
  phone?: string | null;

  @Column('varchar', { nullable: true })
  address?: string | null;

  @Column('varchar', { nullable: true })
  taxId?: string | null;

  @Column('bigint')
  createdAt!: number;
}
