import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'zones' })
export class Zone {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('varchar')
  name!: string;

  /** Rectangle de zone sur le plan global (%, 0–100). */
  @Column('double precision', { nullable: true })
  planX?: number | null;

  @Column('double precision', { nullable: true })
  planY?: number | null;

  @Column('double precision', { nullable: true })
  planW?: number | null;

  @Column('double precision', { nullable: true })
  planH?: number | null;

  /** Couleur de fond (ex. #e5e7eb). */
  @Column('varchar', { nullable: true })
  planFill?: string | null;
}
