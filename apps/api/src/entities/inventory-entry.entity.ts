import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  JoinColumn,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from './user.entity';
import { SupplierDebt } from './supplier-debt.entity';
import { DebtorCredit } from './debtor-credit.entity';
import { SaleTransaction } from './sale-transaction.entity';

export enum InventorySource {
  PERSONAL = 'PERSONAL',
  SUPPLIER = 'SUPPLIER',
  CONSIGNED_OUT = 'CONSIGNED_OUT',
  CONSIGNED_IN = 'CONSIGNED_IN',
}

@Entity('inventory_entries')
export class InventoryEntry {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ enum: InventorySource, example: InventorySource.SUPPLIER })
  @Column({ type: 'enum', enum: InventorySource })
  source: InventorySource;

  @ApiProperty({ example: 'Rice 50kg' })
  @Column({ name: 'product_name' })
  productName: string;

  @ApiProperty({ example: '25.00' })
  @Column({ name: 'unit_cost', type: 'decimal', precision: 12, scale: 2 })
  unitCost: string;

  @ApiProperty({ example: '30.00' })
  @Column({ name: 'selling_price', type: 'decimal', precision: 12, scale: 2 })
  sellingPrice: string;

  @ApiPropertyOptional({ example: 'Grains' })
  @Column({ nullable: true, type: 'varchar' })
  category: string | null;

  @ApiProperty({ example: 100 })
  @Column({ name: 'quantity_original' })
  quantityOriginal: number;

  @ApiProperty({ example: 85 })
  @Column({ name: 'quantity_remaining' })
  quantityRemaining: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  // Relations
  @Column({ name: 'owner_id' })
  ownerId: string;

  @ManyToOne(() => User, (user) => user.inventoryEntries)
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @Column({ name: 'supplier_user_id', nullable: true, type: 'uuid' })
  supplierUserId: string | null;

  @ManyToOne(() => User, (user) => user.suppliedEntries, { nullable: true })
  @JoinColumn({ name: 'supplier_user_id' })
  supplierUser: User | null;

  @Column({ name: 'debtor_user_id', nullable: true, type: 'varchar' })
  debtorUserId: string | null;

  @ManyToOne(() => User, (user) => user.consignedToEntries, { nullable: true })
  @JoinColumn({ name: 'debtor_user_id' })
  debtorUser: User | null;

  @Column({ name: 'supplier_debt_id', nullable: true, type: 'varchar' })
  supplierDebtId: string | null;

  @ManyToOne(() => SupplierDebt, (debt) => debt.inventoryEntries, { nullable: true })
  @JoinColumn({ name: 'supplier_debt_id' })
  supplierDebt: SupplierDebt | null;

  @Column({ name: 'debtor_credit_id', nullable: true, type: 'varchar' })
  debtorCreditId: string | null;

  @ManyToOne(() => DebtorCredit, (credit) => credit.inventoryEntries, { nullable: true })
  @JoinColumn({ name: 'debtor_credit_id' })
  debtorCredit: DebtorCredit | null;

  @OneToMany(() => SaleTransaction, (sale) => sale.inventoryEntry)
  saleTransactions: SaleTransaction[];
}
