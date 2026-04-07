import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class RestaurantSettings {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('varchar', { default: 'RESTAURANT_CAFE' })
  companyType!: 'FAST_FOOD' | 'RESTAURANT_CAFE' | 'SHOP_SINGLE' | 'SHOP_MULTI';

  @Column('varchar', { nullable: true })
  restaurantName?: string;

  @Column('varchar', { nullable: true })
  logoUrl?: string;

  @Column('varchar', { nullable: true })
  phone?: string;

  @Column('varchar', { nullable: true })
  email?: string;

  @Column('varchar', { nullable: true })
  taxId?: string;

  @Column('varchar', { nullable: true })
  address?: string;

  @Column('decimal', { precision: 10, scale: 3, default: 0 })
  timbreValue!: number;

  @Column('decimal', { precision: 6, scale: 2, default: 0 })
  tvaRate!: number;

  @Column('boolean', { default: true })
  applyTvaToTicket!: boolean;

  @Column('boolean', { default: true })
  applyTvaToInvoice!: boolean;

  @Column('boolean', { default: true })
  applyTimbreToTicket!: boolean;

  @Column('boolean', { default: true })
  applyTimbreToInvoice!: boolean;

  @Column('boolean', { default: false })
  printPreviewOnValidate!: boolean;

  /** Force une UI tactile (boutons/champs plus grands) même sur PC. */
  @Column('boolean', { default: false })
  touchUiMode!: boolean;

  /** Affichage KDS client: standard, wallboard fixe, ou auto selon largeur. */
  @Column('varchar', { default: 'STANDARD' })
  clientKdsDisplayMode!: 'STANDARD' | 'WALLBOARD' | 'AUTO';

  /** Largeur min. (px) pour activer le wallboard en mode AUTO. */
  @Column('int', { default: 1920 })
  clientKdsWallboardMinWidthPx!: number;

  @Column('int', { default: 1 })
  clientTicketPrintCopies!: number;

  /** Modèle d'impression client (style visuel). */
  @Column('varchar', { default: 'CLASSIC' })
  clientTicketTemplate!: 'CLASSIC' | 'COMPACT' | 'MODERN';

  /** Personnalisation du contenu ticket client (entête/pied et blocs visibles). */
  @Column({ type: 'jsonb', nullable: true })
  clientTicketLayout?: unknown;

  /** Dossier d'export des reçus PDF (laisser vide pour utiliser Backend/tmp). */
  @Column('varchar', { nullable: true })
  receiptPdfDirectory?: string | null;

  /** Demande au frontend de télécharger automatiquement le PDF ticket sur la caisse. */
  @Column('boolean', { default: false })
  autoDownloadReceiptPdfOnClient!: boolean;

  /** Modèles d'impression bons de production (cuisine/bar). */
  @Column({ type: 'jsonb', nullable: true })
  kitchenBarPrintTemplates?: unknown;

  @Column('boolean', { default: true })
  preventSaleOnInsufficientStock!: boolean;

  @Column('varchar', { nullable: true })
  currency?: string;

  @Column('varchar', { nullable: true })
  terminalId?: string | null;

  @Column('varchar', { default: 'TK-' })
  ticketPrefix!: string;

  @Column('int', { default: 0 })
  ticketSequence!: number;

  @Column('varchar', { default: 'INV-' })
  invoicePrefix!: string;

  @Column('int', { default: 0 })
  invoiceSequence!: number;

  @Column('varchar', { default: 'CLI-' })
  clientPrefix!: string;

  @Column('int', { default: 0 })
  clientSequence!: number;

  @Column('varchar', { default: 'SD-' })
  stockDocumentPrefix!: string;

  @Column('int', { default: 0 })
  stockDocumentSequence!: number;

  @Column('varchar', { default: 'ART-' })
  productPrefix!: string;

  @Column('int', { default: 0 })
  productSequence!: number;

  @Column('varchar', { default: 'ORD-' })
  orderPrefix!: string;

  @Column('int', { default: 0 })
  orderSequence!: number;

  /** Raccourcis remise au POS (ligne ou ticket entier), ex. Fidélité 10 %, Staff 50 %. */
  @Column({ type: 'jsonb', nullable: true })
  posDiscountPresets?: unknown;

  /** Intégration carte restaurant externe (endpoint tiers de débit). */
  @Column({ type: 'jsonb', nullable: true })
  externalRestaurantCardApi?: unknown;

  /** Méthodes de paiement activées au POS. */
  @Column({ type: 'jsonb', nullable: true })
  paymentEnabledMethods?: unknown;

  /**
   * Clôture caisse : AUTO (selon type société), INDEPENDENT (toujours), SHIFT_HANDOVER
   * (tous les shifts serveur fermés avant la station).
   */
  @Column('varchar', { length: 24, default: 'AUTO' })
  cashClosingModePreference!: 'AUTO' | 'INDEPENDENT' | 'SHIFT_HANDOVER';
}
