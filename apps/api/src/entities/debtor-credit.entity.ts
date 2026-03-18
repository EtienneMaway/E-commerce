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

@Entity('debtor_credits')
@Unique(['ownerId', 'debtorUserId'])
export class DebtorCredit {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: '400.00', description: 'Total credit ever given to this debtor' })
  @Column({ name: 'total_credit_given', type: 'decimal', precision: 12, scale: 2, default: '0.00' })
  totalCreditGiven: string;

  @ApiProperty({ example: '100.00', description: 'Total amount received from this debtor' })
  @Column({ name: 'total_received', type: 'decimal', precision: 12, scale: 2, default: '0.00' })
  totalReceived: string;

  @ApiProperty({ example: '300.00', description: 'Current outstanding balance owed by debtor' })
  @Column({ name: 'outstanding_balance', type: 'decimal', precision: 12, scale: 2, default: '0.00' })
  outstandingBalance: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'owner_id' })
  ownerId: string;

  @ManyToOne(() => User, (user) => user.myDebtorCredits)
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @Column({ name: 'debtor_user_id' })
  debtorUserId: string;

  @ManyToOne(() => User, (user) => user.debtorCreditsAsDebtor)
  @JoinColumn({ name: 'debtor_user_id' })
  debtorUser: User;

  @OneToMany(() => Payment, (payment) => payment.debtorCredit)
  payments: Payment[];

  @OneToMany(() => InventoryEntry, (entry) => entry.debtorCredit)
  inventoryEntries: InventoryEntry[];
}
