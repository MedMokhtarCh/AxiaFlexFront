
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Zone } from './zone.entity';

@Entity('tables')
export class TableConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  number: string;

  @Column({ type: 'int' })
  capacity: number;

  @Column({ nullable: true })
  reservedBy?: string | null;

  @Column({ type: 'bigint', nullable: true })
  reservedAt?: number | null;

  @Column({ type: 'bigint', nullable: true })
  reservedUntil?: number | null;

  @ManyToOne(() => Zone, (zone) => zone.tables)
  zone: Zone;
}
