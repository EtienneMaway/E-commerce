import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from './user.entity';
import { ExternalTransaction } from './external-transaction.entity';

export enum ExternalContactRole {
  DEBTOR = 'DEBTOR',
  SUPPLIER = 'SUPPLIER',
  BOTH = 'BOTH',
}

@Entity('external_contacts')
export class ExternalContact {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: 'Jean Dupont' })
  @Column()
  name: string;

  @ApiPropertyOptional({ example: '+243812345678' })
  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @ApiPropertyOptional({ example: 'Market vendor, pays on Fridays' })
  @Column({ type: 'varchar', nullable: true })
  notes: string | null;

  @ApiProperty({ enum: ExternalContactRole, example: ExternalContactRole.DEBTOR })
  @Column({ type: 'enum', enum: ExternalContactRole, default: ExternalContactRole.DEBTOR })
  role: ExternalContactRole;

  @ApiProperty({ example: '150.00', description: 'Amount this contact owes you (debtor side)' })
  @Column({ name: 'debtor_balance', type: 'decimal', precision: 14, scale: 4, default: '0.0000' })
  debtorBalance: string;

  @ApiProperty({ example: '75.00', description: 'Amount you owe this contact (supplier side)' })
  @Column({ name: 'supplier_balance', type: 'decimal', precision: 14, scale: 4, default: '0.0000' })
  supplierBalance: string;


  /**
   * Tenancy: the business and the branch these books belong to
   * (MULTI_SHOP_PLAN.md §3.2). NOT NULL since migration 034.
   */
  @Column({ name: 'org_id', type: 'uuid' })
  orgId: string;

  @Column({ name: 'shop_id', type: 'uuid' })
  shopId: string;


  @OneToMany(() => ExternalTransaction, (tx) => tx.contact, { cascade: true })
  transactions: ExternalTransaction[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
