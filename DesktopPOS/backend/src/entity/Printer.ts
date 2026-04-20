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

  /** Liaison optionnelle à un terminal agent (cloud -> local). */
  @Column('uuid', { nullable: true })
  terminalNodeId?: string | null;

  /** ID imprimante locale remonté par l'agent (stable sur le terminal). */
  @Column('varchar', { nullable: true })
  terminalPrinterLocalId?: string | null;
}
