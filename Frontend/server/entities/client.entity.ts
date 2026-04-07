
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('clients')
export class Client {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  email: string;

  @Column()
  phone: string;

  @Column({ type: 'text', nullable: true })
  address: string;
}
