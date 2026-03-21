import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExternalContact } from './external-contact.entity';

export enum ExternalTransactionType {
  /** Trader gave products to an external debtor — deducts inventory, increases debtorBalance */
  PRODUCT_OUT = 'PRODUCT_OUT',
  /** External debtor paid cash — decreases debtorBalance */
  PAYMENT_IN = 'PAYMENT_IN',
  /** Trader received products from external supplier — adds to inventory, increases supplierBalance */
  PRODUCT_IN = 'PRODUCT_IN',
  /** Trader paid cash to external supplier — decreases supplierBalance */
  PAYMENT_OUT = 'PAYMENT_OUT',
}

@Entity('external_transactions')
export class ExternalTransaction {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'owner_id' })
  ownerId: string;

  @Column({ name: 'contact_id' })
  contactId: string;

  @ManyToOne(() => ExternalContact, (c) => c.transactions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contact_id' })
  contact: ExternalContact;

  @ApiProperty({ enum: ExternalTransactionType })
  @Column({ type: 'enum', enum: ExternalTransactionType })
  type: ExternalTransactionType;

  @ApiPropertyOptional({ example: 'Rice 50kg' })
  @Column({ name: 'product_name', type: 'varchar', nullable: true })
  productName: string | null;

  @ApiPropertyOptional({ example: 10 })
  @Column({ type: 'int', nullable: true })
  quantity: number | null;

  @ApiPropertyOptional({ example: '22.00', description: 'Price per unit (for PRODUCT_* types)' })
  @Column({ name: 'unit_price', type: 'decimal', precision: 12, scale: 2, nullable: true })
  unitPrice: string | null;

  @ApiProperty({ example: '220.00', description: 'Total transaction value' })
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: string;

  @ApiPropertyOptional({ example: '18.00', description: 'Unit cost of goods deducted (PRODUCT_OUT only)' })
  @Column({ name: 'unit_cost_used', type: 'decimal', precision: 12, scale: 2, nullable: true })
  unitCostUsed: string | null;

  @ApiPropertyOptional({ example: '100.00', description: 'Realized profit on this handoff (PRODUCT_OUT only; negative = loss)' })
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  profit: string | null;

  @ApiPropertyOptional({ example: false })
  @Column({ name: 'is_loss', type: 'boolean', nullable: true })
  isLoss: boolean | null;

  @ApiPropertyOptional({ example: 'First batch of rice' })
  @Column({ type: 'varchar', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
