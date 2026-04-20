import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity()
export class Client {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_clients_code', { unique: true })
  @Column('varchar', { nullable: true })
  code?: string | null;

  @Column('varchar', { default: 'PERSON' })
  type!: 'PERSON' | 'COMPANY';

  @Column('varchar')
  name!: string;

  @Column('varchar', { nullable: true })
  email?: string | null;

  @Column('varchar', { nullable: true })
  phone?: string | null;

  @Column('varchar', { nullable: true })
  address?: string | null;

  @Column('varchar', { nullable: true })
  cin?: string | null;

  @Column('varchar', { nullable: true })
  birthDate?: string | null;

  @Column('varchar', { nullable: true })
  taxId?: string | null;

  @Column('bigint')
  createdAt!: number;
}
