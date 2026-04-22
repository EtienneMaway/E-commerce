import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from './user.entity';

export enum ExpenseCurrency {
  USD = 'USD',
  FC = 'FC',
}

export enum ExpenseCategory {
  TRANSPORT = 'TRANSPORT',
  RENT = 'RENT',
  UTILITIES = 'UTILITIES',
  COMMUNICATION = 'COMMUNICATION',
  STAFF = 'STAFF',
  PACKAGING = 'PACKAGING',
  MARKETING = 'MARKETING',
  TAXES = 'TAXES',
  MAINTENANCE = 'MAINTENANCE',
  MEALS = 'MEALS',
  OTHER = 'OTHER',
}

@Entity('expenses')
export class Expense {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @ApiProperty({ example: '25.00', description: 'Amount in the original currency' })
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: string;

  @ApiProperty({ enum: ExpenseCurrency, example: ExpenseCurrency.USD })
  @Column({ type: 'enum', enum: ExpenseCurrency })
  currency: ExpenseCurrency;

  @ApiProperty({ enum: ExpenseCategory, example: ExpenseCategory.TRANSPORT })
  @Column({ type: 'enum', enum: ExpenseCategory })
  category: ExpenseCategory;

  @ApiPropertyOptional({ example: 'Taxi to supplier warehouse' })
  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @ApiPropertyOptional({ example: '2700.0000', description: 'Buying rate FC/USD captured at entry time; null for USD entries' })
  @Column({ name: 'usd_to_fc_rate_snapshot', type: 'decimal', precision: 14, scale: 4, nullable: true })
  usdToFcRateSnapshot: string | null;

  @ApiProperty({ example: '2026-04-19T10:00:00.000Z', description: 'Date the expense was incurred' })
  @Column({ type: 'timestamp' })
  date: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
