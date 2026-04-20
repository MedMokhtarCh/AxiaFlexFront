import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity({ name: 'preorder_users' })
export class PreorderUser {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_preorder_users_email', { unique: true })
  @Column('varchar')
  email!: string;

  @Column('varchar')
  fullName!: string;

  @Column('varchar')
  passwordHash!: string;

  @Column('varchar', { nullable: true })
  phone?: string | null;

  @Column('varchar', { nullable: true })
  authToken?: string | null;

  @Column('bigint')
  createdAt!: number;
}
