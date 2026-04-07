import { Entity, PrimaryColumn, Column } from 'typeorm';

/**
 * Une seule ligne par instance POS (clé fixe).
 * Limites et modules pilotés par le super admin SaaS.
 */
@Entity({ name: 'saas_tenant_license' })
export class SaasTenantLicense {
  @PrimaryColumn('varchar', { length: 36 })
  id!: string;

  /** sha256(pepper:code) — jamais en clair. */
  @Column('varchar', { length: 64 })
  superAdminPinHash!: string;

  /** null = illimité */
  @Column('int', { nullable: true })
  maxUsers!: number | null;

  @Column('int', { nullable: true })
  maxProducts!: number | null;

  /** Commandes (tickets de caisse) */
  @Column('int', { nullable: true })
  maxOrders!: number | null;

  /** string[] — ids de modules (sidebar). null = tous autorisés. */
  @Column({ type: 'jsonb', nullable: true })
  enabledModules!: string[] | null;

  /** Si true, le type de société n’est plus éditable dans Paramètres. */
  @Column('boolean', { default: false })
  companyTypeManagedBySaas!: boolean;

  @Column('varchar', { nullable: true })
  forcedCompanyType!: string | null;

  @Column('varchar', { nullable: true })
  licenseKey!: string | null;

  /** Timestamp ms ; null = pas de date de fin */
  @Column('bigint', { nullable: true })
  licenseExpiresAt!: number | null;

  /** Synchronisation avec une app externe (abonnements / facturation). */
  @Column('boolean', { default: false })
  externalLicenseApiEnabled!: boolean;

  @Column('varchar', { length: 512, nullable: true })
  externalLicenseApiBaseUrl!: string | null;

  /**
   * Chemin relatif à la base (ex. /v1/license/status) ou URL absolue.
   * Méthode HTTP : POST avec JSON { tenantId, licenseKey }.
   */
  @Column('varchar', { length: 256, nullable: true })
  externalLicenseVerifyPath!: string | null;

  /** Identifiant tenant / abonnement côté plateforme externe. */
  @Column('varchar', { length: 256, nullable: true })
  externalLicenseTenantId!: string | null;

  /** Bearer token ou clé API (stockage local — restreindre l’accès DB). */
  @Column('text', { nullable: true })
  externalLicenseApiToken!: string | null;

  @Column('bigint', { nullable: true })
  externalLicenseLastSyncAt!: number | null;

  @Column('varchar', { length: 16, nullable: true })
  externalLicenseLastSyncStatus!: string | null;

  @Column('varchar', { length: 500, nullable: true })
  externalLicenseLastSyncMessage!: string | null;

  @Column('bigint')
  updatedAt!: number;
}
