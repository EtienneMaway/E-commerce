import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BranchBalance } from './branch-balance.entity';
import { Shop } from './shop.entity';
import { User } from './user.entity';

export enum BranchPaymentStatus {
  /** Recorded by the paying custodian; waiting for the receiving branch. */
  PENDING = 'PENDING',
  /** The money arrived. Balance reduced, cash moved between the branches. */
  CONFIRMED = 'CONFIRMED',
  /** The receiving branch says it never arrived. No effect. */
  REJECTED = 'REJECTED',
}

export enum BranchPaymentCurrency {
  USD = 'USD',
  FC = 'FC',
}

/**
 * Money a debtor branch pays back to its creditor branch.
 *
 * A confirmed payment lowers the paying branch's cash and raises the receiving
 * branch's cash by `amount_usd`. It is never profit and never an expense. Under
 * "All branches" the two legs cancel out.
 */
@Entity('branch_payments')
@Index('idx_branch_payments_balance', ['balanceId', 'status'])
export class BranchPayment {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'org_id', type: 'uuid' })
  orgId: string;

  @Column({ name: 'balance_id', type: 'uuid' })
  balanceId: string;

  @ManyToOne(() => BranchBalance, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'balance_id' })
  balance: BranchBalance;

  @ApiProperty({ description: 'Paying (debtor) branch' })
  @Column({ name: 'from_shop_id', type: 'uuid' })
  fromShopId: string;

  @ManyToOne(() => Shop)
  @JoinColumn({ name: 'from_shop_id' })
  fromShop: Shop;

  @ApiProperty({ description: 'Receiving (creditor) branch' })
  @Column({ name: 'to_shop_id', type: 'uuid' })
  toShopId: string;

  @ManyToOne(() => Shop)
  @JoinColumn({ name: 'to_shop_id' })
  toShop: Shop;

  @ApiProperty({ example: '270000.0000', description: 'Amount in the currency handed over' })
  @Column({ type: 'decimal', precision: 14, scale: 4 })
  amount: string;

  @ApiProperty({ enum: BranchPaymentCurrency })
  @Column({ type: 'enum', enum: BranchPaymentCurrency })
  currency: BranchPaymentCurrency;

  @ApiProperty({ example: '100.0000', description: 'Ledger value. What the balance and both cash positions move by.' })
  @Column({ name: 'amount_usd', type: 'decimal', precision: 14, scale: 4 })
  amountUsd: string;

  @ApiPropertyOptional({ example: '2700.0000', description: 'System rate used for an FC payment' })
  @Column({ name: 'usd_to_fc_rate_snapshot', type: 'decimal', precision: 14, scale: 4, nullable: true })
  usdToFcRateSnapshot: string | null;

  @ApiProperty({ enum: BranchPaymentStatus })
  @Column({ type: 'enum', enum: BranchPaymentStatus, default: BranchPaymentStatus.PENDING })
  status: BranchPaymentStatus;

  @ApiPropertyOptional({ example: 'Cash sent with the driver' })
  @Column({ type: 'varchar', nullable: true })
  note: string | null;

  @Column({ name: 'paid_by_id', type: 'uuid', nullable: true })
  paidById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'paid_by_id' })
  paidBy: User | null;

  @Column({ name: 'answered_by_id', type: 'uuid', nullable: true })
  answeredById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'answered_by_id' })
  answeredBy: User | null;

  @ApiPropertyOptional()
  @Column({ name: 'answered_at', type: 'timestamp', nullable: true })
  answeredAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
