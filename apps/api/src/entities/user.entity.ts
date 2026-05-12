import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InventoryEntry } from './inventory-entry.entity';
import { SupplierDebt } from './supplier-debt.entity';
import { DebtorCredit } from './debtor-credit.entity';
import { SaleTransaction } from './sale-transaction.entity';
import { ConsignmentRequest } from './consignment-request.entity';

@Entity('users')
export class User {
  @ApiProperty({ example: 'clx1234abcd' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: 'trader_alice' })
  @Column({ unique: true })
  username: string;

  @ApiPropertyOptional({ example: 'alice@example.com' })
  @Column({ unique: true, nullable: true, type: 'varchar' })
  email: string | null;

  @ApiPropertyOptional({ example: '+1234567890' })
  @Column({ unique: true, nullable: true, type: 'varchar', name: 'phone' })
  phone: string | null;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @ApiPropertyOptional({ example: 'Alice K.', description: 'Display name. Nullable for legacy rows; required when creating new employee profiles.' })
  @Column({ type: 'varchar', nullable: true })
  name: string | null;

  @ApiPropertyOptional({ example: '1995-08-12', description: 'Date of birth (YYYY-MM-DD). Mainly used for external employees.' })
  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth: string | null;

  @ApiPropertyOptional({ example: 'Sales associate', description: 'Job role / title for display only. Used mainly for external employees.' })
  @Column({ type: 'varchar', nullable: true })
  role: string | null;

  @ApiProperty({ example: false, description: 'Mini employee — mobile-only, no dashboard login' })
  @Column({ name: 'is_mini_employee', type: 'boolean', default: false })
  isMiniEmployee: boolean;

  @ApiProperty({ example: false, description: 'External employee — does not log in; payroll-only record managed by the employer.' })
  @Column({ name: 'is_external_employee', type: 'boolean', default: false })
  isExternalEmployee: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  // Owner perspective: inventory entries this user owns
  @OneToMany(() => InventoryEntry, (entry) => entry.owner)
  inventoryEntries: InventoryEntry[];

  // As Supplier: entries where other users borrowed from this user
  @OneToMany(() => InventoryEntry, (entry) => entry.supplierUser)
  suppliedEntries: InventoryEntry[];

  // As Debtor: entries consigned to this user
  @OneToMany(() => InventoryEntry, (entry) => entry.debtorUser)
  consignedToEntries: InventoryEntry[];

  // Owner perspective: debts owed TO suppliers
  @OneToMany(() => SupplierDebt, (debt) => debt.owner)
  mySupplierDebts: SupplierDebt[];

  // As Supplier: debts that other owners owe to this user
  @OneToMany(() => SupplierDebt, (debt) => debt.supplierUser)
  supplierDebtsAsSupplier: SupplierDebt[];

  // Owner perspective: credits owed BY debtors
  @OneToMany(() => DebtorCredit, (credit) => credit.owner)
  myDebtorCredits: DebtorCredit[];

  // As Debtor: credits this user owes to other owners
  @OneToMany(() => DebtorCredit, (credit) => credit.debtorUser)
  debtorCreditsAsDebtor: DebtorCredit[];

  @OneToMany(() => SaleTransaction, (sale) => sale.owner)
  salesTransactions: SaleTransaction[];

  // Consignment requests sent by this user (as supplier)
  @OneToMany(() => ConsignmentRequest, (req) => req.supplier)
  outgoingConsignments: ConsignmentRequest[];

  // Consignment requests received by this user (as debtor)
  @OneToMany(() => ConsignmentRequest, (req) => req.debtor)
  incomingConsignments: ConsignmentRequest[];
}
