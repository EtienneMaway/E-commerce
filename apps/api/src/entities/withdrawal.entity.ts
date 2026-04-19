import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from './user.entity';

export enum WithdrawalCurrency {
  USD = 'USD',
  FC = 'FC',
}

@Entity('withdrawals')
export class Withdrawal {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'owner_id' })
  ownerId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @ApiProperty({ example: '150.00', description: 'Amount withdrawn in the chosen currency' })
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: string;

  @ApiProperty({ enum: WithdrawalCurrency, example: WithdrawalCurrency.USD })
  @Column({ type: 'enum', enum: WithdrawalCurrency })
  currency: WithdrawalCurrency;

  @ApiPropertyOptional({
    example: '2700.0000',
    description: 'System rate FC/USD captured at withdrawal time; null for USD withdrawals',
  })
  @Column({ name: 'usd_to_fc_rate_snapshot', type: 'decimal', precision: 14, scale: 4, nullable: true })
  usdToFcRateSnapshot: string | null;

  @ApiProperty({ example: '150.00', description: 'Canonical USD equivalent at withdrawal time' })
  @Column({ name: 'amount_usd', type: 'decimal', precision: 12, scale: 2 })
  amountUsd: string;

  @ApiProperty({ description: 'When the withdrawal was recorded' })
  @CreateDateColumn({ name: 'withdrawn_at' })
  withdrawnAt: Date;

  @ApiProperty({
    description: 'Start of the accounting window for this withdrawal (previous withdrawal time, or epoch)',
  })
  @Column({ name: 'period_start_at', type: 'timestamp' })
  periodStartAt: Date;

  @ApiProperty({ example: '500.00', description: 'Cash income in window (USD)' })
  @Column({ name: 'period_income', type: 'decimal', precision: 12, scale: 2 })
  periodIncome: string;

  @ApiProperty({ example: '75.00', description: 'Expenses in window (USD)' })
  @Column({ name: 'period_expenses', type: 'decimal', precision: 12, scale: 2 })
  periodExpenses: string;

  @ApiProperty({ example: '25.00', description: 'Carried from previous withdrawal leftover (USD)' })
  @Column({ name: 'leftover_carried', type: 'decimal', precision: 12, scale: 2, default: '0.00' })
  leftoverCarried: string;

  @ApiProperty({
    example: '300.00',
    description: 'Remaining after withdrawal: periodIncome − periodExpenses + leftoverCarried − amountUsd',
  })
  @Column({ name: 'leftover_out', type: 'decimal', precision: 12, scale: 2 })
  leftoverOut: string;

  @ApiPropertyOptional({ example: 'Taking cash for new stock' })
  @Column({ type: 'varchar', nullable: true })
  note: string | null;
}
