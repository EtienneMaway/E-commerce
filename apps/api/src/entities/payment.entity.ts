import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SupplierDebt } from './supplier-debt.entity';
import { DebtorCredit } from './debtor-credit.entity';
import { User } from './user.entity';

export enum PaymentDirection {
  OWNER_TO_SUPPLIER = 'OWNER_TO_SUPPLIER',
  DEBTOR_TO_OWNER = 'DEBTOR_TO_OWNER',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
}

@Entity('payments')
export class Payment {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: '150.00' })
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: string;

  @ApiPropertyOptional({ example: 'Partial payment for rice batch' })
  @Column({ nullable: true, type: 'varchar' })
  note: string | null;

  @ApiProperty({ description: 'Date the payment was made' })
  @CreateDateColumn({ name: 'created_at' })
  date: Date;

  @ApiProperty({ enum: PaymentDirection })
  @Column({ type: 'enum', enum: PaymentDirection })
  direction: PaymentDirection;

  @ApiProperty({ enum: PaymentStatus, default: PaymentStatus.PENDING })
  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @ApiPropertyOptional({ example: '150.00', description: 'Remaining balance after approval — null while PENDING' })
  @Column({ name: 'remaining_balance', type: 'decimal', precision: 12, scale: 2, nullable: true })
  remainingBalance: string | null;

  // The user who sent the payment (debtor)
  @Column({ name: 'paid_by_user_id', nullable: true, type: 'varchar' })
  paidByUserId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'paid_by_user_id' })
  paidByUser: User | null;

  // The user who receives the payment (supplier)
  @Column({ name: 'paid_to_user_id', nullable: true, type: 'varchar' })
  paidToUserId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'paid_to_user_id' })
  paidToUser: User | null;

  @Column({ name: 'supplier_debt_id', nullable: true, type: 'varchar' })
  supplierDebtId: string | null;

  @ManyToOne(() => SupplierDebt, (debt) => debt.payments, { nullable: true })
  @JoinColumn({ name: 'supplier_debt_id' })
  supplierDebt: SupplierDebt | null;

  @Column({ name: 'debtor_credit_id', nullable: true, type: 'varchar' })
  debtorCreditId: string | null;

  @ManyToOne(() => DebtorCredit, (credit) => credit.payments, { nullable: true })
  @JoinColumn({ name: 'debtor_credit_id' })
  debtorCredit: DebtorCredit | null;
}
