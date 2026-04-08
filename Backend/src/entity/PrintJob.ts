import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'print_jobs' })
@Index('idx_print_jobs_target_status', ['targetTerminalNodeId', 'status', 'createdAt'])
export class PrintJob {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  targetTerminalNodeId!: string;

  @Column('varchar', { length: 240, nullable: true })
  targetPrinterLocalId?: string | null;

  @Column('varchar', { length: 240, nullable: true })
  targetPrinterName?: string | null;

  @Column('varchar', { length: 24, default: 'PENDING' })
  status!: 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'FAILED' | 'EXPIRED';

  @Column({ type: 'jsonb' })
  payload!: unknown;

  @Column('int', { default: 0 })
  retryCount!: number;

  @Column('int', { default: 5 })
  maxRetries!: number;

  @Column('varchar', { length: 500, nullable: true })
  lastError?: string | null;

  @Column('bigint')
  createdAt!: number;

  @Column('bigint', { nullable: true })
  pickedAt?: number | null;

  @Column('bigint', { nullable: true })
  completedAt?: number | null;

  @Column('bigint')
  updatedAt!: number;
}
