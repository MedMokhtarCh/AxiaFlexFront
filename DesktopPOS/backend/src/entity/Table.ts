import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'tables' })
export class Table {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('varchar')
  number!: string;

  @Column('varchar')
  zoneId!: string;

  @Column('int')
  capacity!: number;

  @Column('varchar', { default: 'AVAILABLE' })
  status!: string;

  @Column('varchar', { nullable: true })
  token?: string;

  @Column('varchar', { nullable: true })
  reservedBy?: string | null;

  @Column('bigint', { nullable: true })
  reservedAt?: number | null;

  @Column('bigint', { nullable: true })
  reservedUntil?: number | null;

  /** Position sur le plan (%, 0–100), coin supérieur gauche. */
  @Column('double precision', { nullable: true })
  planX?: number | null;

  @Column('double precision', { nullable: true })
  planY?: number | null;

  @Column('double precision', { nullable: true })
  planW?: number | null;

  @Column('double precision', { nullable: true })
  planH?: number | null;

  /** `square` | `rect` — influence le rendu des chaises / proportions. */
  @Column('varchar', { nullable: true })
  planShape?: string | null;
}
