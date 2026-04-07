import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'printers' })
export class Printer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('varchar')
  name!: string;

  /**
   * RECEIPT = ticket client (caisse). Toute autre valeur = poste de production
   * (libellé libre : « Cuisine », « Terrasse », « Chicha », etc.).
   */
  @Column('varchar')
  type!: string;

  /** Pour les postes production uniquement : style du bon (cuisine vs bar). */
  @Column('varchar', { nullable: true })
  bonProfile!: string | null;
}
