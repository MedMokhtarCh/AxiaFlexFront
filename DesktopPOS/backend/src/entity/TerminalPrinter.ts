import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'terminal_printers' })
@Index('idx_terminal_printers_terminal', ['terminalNodeId'])
@Index('idx_terminal_printers_unique_local', ['terminalNodeId', 'printerLocalId'], {
  unique: true,
})
export class TerminalPrinter {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  terminalNodeId!: string;

  @Column('varchar', { length: 240 })
  printerLocalId!: string;

  @Column('varchar', { length: 240 })
  name!: string;

  @Column('varchar', { length: 24, default: 'UNKNOWN' })
  transport!: 'USB' | 'TCP' | 'SHARED' | 'UNKNOWN';

  @Column('varchar', { length: 240, nullable: true })
  driverName?: string | null;

  @Column('varchar', { length: 240, nullable: true })
  portName?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: unknown;

  @Column('boolean', { default: true })
  isOnline!: boolean;

  @Column('bigint')
  updatedAt!: number;
}
