import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('varchar')
  name!: string;

  @Column('varchar')
  role!: string;

  @Column('varchar')
  pin!: string;

  @Column('simple-json', { nullable: true })
  assignedZoneIds?: string[];

  @Column('simple-json', { nullable: true })
  assignedWarehouseIds?: string[] | null;

  @Column('varchar', { nullable: true })
  salesWarehouseId?: string | null;

  @Column('boolean', { nullable: true })
  canManageFund?: boolean | null;

  /** Droits fins (ex. nav + deux-points + id menu : reports, pos, settings…). */
  @Column('simple-json', { nullable: true })
  claims?: string[] | null;

  /**
   * Imprimante Windows (ligne printers) pour les tickets client de cet utilisateur
   * (souvent une imprimante sans fil sur le poste). UUID de `printers.id`.
   */
  @Column('varchar', { length: 36, nullable: true })
  assignedPrinterId?: string | null;
}
