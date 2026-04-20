import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type SmdfStatus =
  | 'FACTORY'
  | 'CERT_REQUESTED'
  | 'CERTIFICATE_GENERATED'
  | 'NOT_SYNCHRONIZED'
  | 'SYNCHRONIZED'
  | 'SUSPENDED'
  | 'REVOKED';

export type SmdfCommMode = 'ONLINE' | 'OFFLINE';

export type SmdfCertificateStatus =
  | 'NOT_REQUESTED'
  | 'PIN_VALIDATED'
  | 'CERTIFICATE_GENERATED'
  | 'EXPIRED'
  | 'REVOKED'
  | 'SUSPENDED';

@Entity({ name: 'nacef_smdf_states' })
@Index('idx_nacef_smdf_states_imdf', ['imdf'], { unique: true })
export class NacefSmdfState {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('varchar', { length: 64 })
  imdf!: string;

  @Column('varchar', { length: 32, default: 'FACTORY' })
  status!: SmdfStatus;

  @Column('varchar', { length: 32, default: 'NOT_REQUESTED' })
  certRequestStatus!: SmdfCertificateStatus;

  @Column('varchar', { length: 16, default: 'ONLINE' })
  mode!: SmdfCommMode;

  @Column('int', { default: 0 })
  availableOfflineTickets!: number;

  @Column('varchar', { length: 128, nullable: true })
  certificateRef?: string | null;

  @Column('bigint', { nullable: true })
  certificateExpiresAt?: number | null;

  @Column('bigint', { nullable: true })
  lastSyncAt?: number | null;

  @Column('varchar', { length: 80, nullable: true })
  lastErrorCode?: string | null;

  @Column('bigint')
  createdAt!: number;

  @Column('bigint')
  updatedAt!: number;
}

