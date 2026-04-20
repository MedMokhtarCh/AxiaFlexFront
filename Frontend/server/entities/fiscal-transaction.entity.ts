import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { FiscalLifecycleStatus, SignedFiscalPayload } from '../fiscal.types';

@Entity('fiscal_transactions')
export class FiscalTransactionEntity {
  @PrimaryColumn({ type: 'varchar', length: 128 })
  ticketId: string;

  @Column({ type: 'varchar', length: 128 })
  orderId: string;

  @Column({ type: 'varchar', length: 32 })
  status: FiscalLifecycleStatus;

  @Column({ type: 'jsonb' })
  payload: SignedFiscalPayload;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'text', nullable: true })
  lastError?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  syncedAt?: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
