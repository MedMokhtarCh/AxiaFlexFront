
import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { TableConfig } from './table.entity';

@Entity('zones')
export class Zone {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 128 })
  name: string;

  @OneToMany(() => TableConfig, (table) => table.zone)
  tables: TableConfig[];
}
