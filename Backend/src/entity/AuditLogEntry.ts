import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type AuditLogKind = 'developer' | 'app-admin' | 'cash-closing';

@Entity({ name: 'audit_log_entries' })
@Index('idx_audit_kind_date_created', ['kind', 'dateKey', 'createdAt'])
export class AuditLogEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('varchar', { length: 32 })
  kind!: AuditLogKind;

  /** Format YYYY-MM-DD (date locale serveur). */
  @Column('varchar', { length: 10 })
  dateKey!: string;

  @Column('bigint')
  createdAt!: number;

  /** Entrée complète du journal (compatible JSONL actuel). */
  @Column({ type: 'jsonb' })
  payload!: unknown;
}
