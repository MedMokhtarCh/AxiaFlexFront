import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'terminal_nodes' })
@Index('idx_terminal_nodes_fingerprint', ['fingerprintHash'], { unique: true })
export class TerminalNode {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('varchar', { length: 120 })
  alias!: string;

  @Column('varchar', { length: 128 })
  fingerprintHash!: string;

  @Column('varchar', { length: 120, nullable: true })
  siteName?: string | null;

  @Column('varchar', { length: 120, nullable: true })
  osInfo?: string | null;

  @Column('varchar', { length: 40, nullable: true })
  agentVersion?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  capabilities?: unknown;

  @Column('varchar', { length: 96, nullable: true })
  apiToken?: string | null;

  @Column('bigint', { nullable: true })
  lastSeenAt?: number | null;

  @Column('boolean', { default: false })
  online!: boolean;

  @Column('boolean', { default: true })
  accessEnabled!: boolean;

  @Column('varchar', { length: 32, nullable: true })
  assignedPlan?: string | null;

  @Column('varchar', { length: 300, nullable: true })
  accessNote?: string | null;

  @Column('bigint')
  createdAt!: number;

  @Column('bigint')
  updatedAt!: number;
}
