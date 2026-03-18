import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { User } from './user.entity';
import { Payment } from './payment.entity';
import { InventoryEntry } from './inventory-entry.entity';

@Entity('supplier_debts')
@Unique(['ownerId', 'supplierUserId'])
export class SupplierDebt {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: '500.00', description: 'Total credit ever received from this supplier' })
  @Column({ name: 'total_credit_received', type: 'decimal', precision: 12, scale: 2, default: '0.00' })
  totalCreditReceived: string;

  @ApiProperty({ example: '200.00', description: 'Total amount paid back to this supplier' })
  @Column({ name: 'total_paid', type: 'decimal', precision: 12, scale: 2, default: '0.00' })
  totalPaid: string;

  @ApiProperty({ example: '300.00', description: 'Current outstanding balance owed to supplier' })
  @Column({ name: 'outstanding_balance', type: 'decimal', precision: 12, scale: 2, default: '0.00' })
  outstandingBalance: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'owner_id' })
  ownerId: string;

  @ManyToOne(() => User, (user) => user.mySupplierDebts)
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @Column({ name: 'supplier_user_id' })
  supplierUserId: string;

  @ManyToOne(() => User, (user) => user.supplierDebtsAsSupplier)
  @JoinColumn({ name: 'supplier_user_id' })
  supplierUser: User;

  @OneToMany(() => Payment, (payment) => payment.supplierDebt)
  payments: Payment[];

  @OneToMany(() => InventoryEntry, (entry) => entry.supplierDebt)
  inventoryEntries: InventoryEntry[];
}
