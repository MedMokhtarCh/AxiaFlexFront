import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'table_reservations' })
export class TableReservation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('varchar')
  tableId!: string;

  @Column('varchar')
  tableNumber!: string;

  @Column('varchar')
  zoneId!: string;

  @Column('varchar', { nullable: true })
  reservedBy?: string | null;

  @Column('bigint')
  reservedAt!: number;

  @Column('bigint')
  reservedUntil!: number;

  @Column('bigint', { nullable: true })
  releasedAt?: number | null;
}
