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
import { MiniSettlement } from './mini-settlement.entity';

/**
 * An expense a mini-employee incurs while selling the owner's consigned goods
 * (transport, etc.), entered in FC. It stays PENDING (settlementId null) until a
 * handover claims it; on handover approval it is booked as one of the OWNER's
 * business expenses and deducted from the cash handed over.
 */
@Entity('mini_expenses')
export class MiniExpense {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'mini_id', type: 'uuid' })
  miniId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'mini_id' })
  mini: User;

  /** Employer whose books the expense books against on approval. */
  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId: string;

  @ApiProperty({ example: '15000.0000', description: 'Amount in FC (what the mini spent)' })
  @Column({ type: 'decimal', precision: 14, scale: 4 })
  amount: string;

  @ApiProperty({ example: 'TRANSPORT', description: 'ExpenseCategory value' })
  @Column({ type: 'varchar' })
  category: string;

  @ApiPropertyOptional({ example: 'Taxi to the market' })
  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @ApiPropertyOptional({ description: 'Client-generated idempotency key for offline sync dedup' })
  @Column({ name: 'client_id', type: 'varchar', nullable: true })
  clientId: string | null;

  @ApiPropertyOptional({ description: 'Set when a handover has claimed this expense (pending → part of that settlement)' })
  @Column({ name: 'settlement_id', type: 'uuid', nullable: true })
  settlementId: string | null;

  @ManyToOne(() => MiniSettlement, (s) => s.expenses, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'settlement_id' })
  settlement: MiniSettlement | null;

  @ApiPropertyOptional({ description: 'The Expense row created on the owner\'s books when the handover was approved' })
  @Column({ name: 'booked_expense_id', type: 'uuid', nullable: true })
  bookedExpenseId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
