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
import { Payment } from './payment.entity';
import { MiniSettlementItem } from './mini-settlement-item.entity';
import { MiniExpense } from './mini-expense.entity';

export enum MiniSettlementStatus {
  /** Mini employee handed over cash + returns on the app; awaiting owner approval. */
  PENDING = 'PENDING',
  /** Owner/full employee acknowledged the handover — cash booked, returns re-stocked. */
  APPROVED = 'APPROVED',
  /** Owner/full employee rejected the handover — no side effects. */
  REJECTED = 'REJECTED',
}

/**
 * A mini-employee handover ("here's what I sold, here's what remained"): an
 * aggregate cash amount for goods sold (at the owner-set agreed price) plus a
 * list of unsold items being returned. Created by the mini on the app, approved
 * by the owner or a full employee on the dashboard. On approval the cash books
 * as a single DEBTOR_TO_OWNER payment (differentiated from direct daily sales)
 * and the returns re-enter the owner's sellable stock.
 */
@Entity('mini_settlements')
export class MiniSettlement {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Employer/supplier who receives the cash and returned goods. */
  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  /** Mini employee (debtor) handing over. */
  @Column({ name: 'mini_id', type: 'uuid' })
  miniId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'mini_id' })
  mini: User;

  @ApiProperty({ enum: MiniSettlementStatus, default: MiniSettlementStatus.PENDING })
  @Column({ type: 'enum', enum: MiniSettlementStatus, default: MiniSettlementStatus.PENDING })
  status: MiniSettlementStatus;

  @ApiProperty({ example: '150.0000', description: 'Cash handed over for sold goods (at agreed price)' })
  @Column({ name: 'cash_amount', type: 'decimal', precision: 14, scale: 4, default: '0.0000' })
  cashAmount: string;

  @ApiPropertyOptional({
    example: '405000.0000',
    description:
      "FC value of the sold cash at the batches' locked rates (Σ per sale at its lot's rate). Lets the owner see a locked-rate Net pay (sold − expenses); null for pre-snapshot handovers.",
  })
  @Column({ name: 'cash_amount_fc', type: 'decimal', precision: 14, scale: 4, nullable: true })
  cashAmountFc: string | null;

  @ApiPropertyOptional()
  @Column({ type: 'varchar', nullable: true })
  note: string | null;

  @ApiPropertyOptional({ description: 'The DEBTOR_TO_OWNER payment created when the cash was booked on approval' })
  @Column({ name: 'payment_id', type: 'uuid', nullable: true })
  paymentId: string | null;

  @ManyToOne(() => Payment, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'payment_id' })
  payment: Payment | null;

  @ApiPropertyOptional({ description: 'Full employee who approved/rejected on the owner\'s behalf' })
  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_id' })
  actor: User | null;

  @OneToMany(() => MiniSettlementItem, (item) => item.miniSettlement, { cascade: true })
  items: MiniSettlementItem[];

  /** Expenses the mini claimed on this handover (deducted from the cash and
   *  booked as the owner's expenses on approval). */
  @OneToMany(() => MiniExpense, (e) => e.settlement)
  expenses: MiniExpense[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  /**
   * Every state change, not just approval. `approvedAt` stays null on reject,
   * so this is the only timestamp that moves for a rejection — which is what
   * `GET /sync/signal` derives the handovers channel from.
   */
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ApiPropertyOptional()
  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt: Date | null;
}
