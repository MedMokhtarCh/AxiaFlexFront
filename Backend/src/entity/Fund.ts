import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'funds' })
export class Fund {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('varchar')
  name!: string;

  @Column('varchar', { default: 'DT' })
  currency!: string;

  @Column('varchar', { nullable: true })
  terminalId?: string | null;

  @Column('boolean', { default: true })
  isActive!: boolean;
}
