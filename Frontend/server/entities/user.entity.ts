
import { Entity, PrimaryGeneratedColumn, Column, ManyToMany, JoinTable, OneToMany } from 'typeorm';
import { Role } from '../../types';
import { Zone } from './zone.entity';
import { Order } from './order.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: Role, default: Role.SERVER })
  role: Role;

  @Column({ length: 4, unique: true })
  pin: string;

  @Column({ nullable: true })
  avatarUrl: string;

  @ManyToMany(() => Zone)
  @JoinTable({ name: 'user_zones' })
  assignedZones: Zone[];

  @OneToMany(() => Order, (order) => order.server)
  orders: Order[];
}
