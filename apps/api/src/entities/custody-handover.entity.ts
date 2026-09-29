import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from './user.entity';
import { StockCustody } from './stock-custody.entity';
import { CustodyHandoverItem } from './custody-handover-item.entity';
import { CustodyHandoverAdjustment } from './custody-handover-adjustment.entity';

/** One product line sold from the custody during the period, snapshotted at submit. */
export interface CustodyHandoverSoldLine {
  productName: string;
  variantLabel: string | null;
  qtySold: number;
  piecesPerCarton: number | null;
  /** FC taken for these units, at each sale's locked rate. */
  valueFc: string;
  /** The owner's profit on these units, FC — real profit at real cost (§3.1). */
  profitFc: string;
}

/** One sale voided during the period (business rule 9), snapshotted at submit. */
export interface CustodyHandoverRejectedLine {
  productName: string;
  variantLabel: string | null;
  qtySold: number;
  valueFc: string;
  rejectedAt: string;
  reason: string | null;
}

/** What a mini handed up to this custodian during the period (§3.6). */
export interface CustodyHandoverMiniLine {
  miniId: string;
  miniName: string;
  settlementId: string;
  approvedAt: string;
  /** Cash the mini brought back — adds to what the custodian owes. */
  cashFc: string;
  /** Unsold units the mini returned — they re-enter this custody's volume. */
  returnedUnits: number;
}

export enum CustodyHandoverStatus {
  /** Custodian submitted; awaiting the owner's approval. */
  PENDING = 'PENDING',
  /** Owner approved — cash booked, returns re-stocked, adjustments applied, period sealed. */
  APPROVED = 'APPROVED',
  /** Owner rejected — no side effects; the period stays open. */
  REJECTED = 'REJECTED',
}

/**
 * One settlement period inside a {@link StockCustody} — the check
 * (`SHOP_CUSTODY_PLAN.md` §3.3).
 *
 * The custodian submits what they are handing back: cash, unsold goods, and the
 * expenses they spent out of the till. The owner reviews it, types in any
 * shortage or overage by hand (§3.8 — the app deliberately does not try to
 * reconcile for them), and approves.
 *
 * **A handover cannot be submitted while any team sale in the period is still
 * awaiting the custodian's approval** (§3.5). Approval of a sale is an
 * attestation, not a ledger gate — the money and the stock already moved — so
 * the only thing it blocks is closing the books on a period the man in charge
 * has not actually reviewed.
 *
 * All money here is **FC at the rate locked per sale**, never re-converted at
 * read time (§3.9). Re-converting would turn a rate movement between open and
 * close into an apparent shortage, and §3.8's manual lines would then be used to
 * paper over an arithmetic bug.
 */
@Entity('custody_handovers')
@Index('idx_custody_handovers_custody', ['custodyId'])
@Index('idx_custody_handovers_custodian', ['custodianId'])
export class CustodyHandover {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Tenancy: MULTI_SHOP_PLAN.md §3.2. Always the custody's own branch. */
  @Column({ name: 'org_id', type: 'uuid' })
  orgId: string;

  @Column({ name: 'shop_id', type: 'uuid' })
  shopId: string;

  @Column({ name: 'custody_id', type: 'uuid' })
  custodyId: string;

  @ManyToOne(() => StockCustody, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'custody_id' })
  custody: StockCustody;

  /**
   * Denormalised from the custody so the owner can filter handovers by employee
   * across branches and appointments without a join — the "switch dashboard
   * work, filterable by handovers of all full employees" view.
   */
  @Column({ name: 'custodian_id', type: 'uuid' })
  custodianId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'custodian_id' })
  custodian: User;

  @ApiProperty({ enum: CustodyHandoverStatus, default: CustodyHandoverStatus.PENDING })
  @Column({ type: 'enum', enum: CustodyHandoverStatus, default: CustodyHandoverStatus.PENDING })
  status: CustodyHandoverStatus;

  @ApiProperty({ description: 'Start of the period this settles — the previous handover, or the appointment.' })
  @Column({ name: 'period_start', type: 'timestamp' })
  periodStart: Date;

  @ApiProperty({ description: 'End of the period — the moment of submission. Sales bucket by server `created_at` (§3.10).' })
  @Column({ name: 'period_end', type: 'timestamp' })
  periodEnd: Date;

  @ApiProperty({ example: '405000.0000', description: 'FC the custodian says they are handing over' })
  @Column({ name: 'cash_declared_fc', type: 'decimal', precision: 14, scale: 4, default: '0.0000' })
  cashDeclaredFc: string;

  @ApiProperty({ example: '410000.0000', description: 'FC the books say should come back, sealed at submit' })
  @Column({ name: 'cash_expected_fc', type: 'decimal', precision: 14, scale: 4, default: '0.0000' })
  cashExpectedFc: string;

  @ApiProperty({ example: '90000.0000', description: 'Of the expected cash, what came up from minis (§3.6)' })
  @Column({ name: 'mini_rollup_cash_fc', type: 'decimal', precision: 14, scale: 4, default: '0.0000' })
  miniRollupCashFc: string;

  @ApiProperty({ example: '12000.0000', description: 'Expenses the custodian recorded in the period, FC' })
  @Column({ name: 'expenses_fc', type: 'decimal', precision: 14, scale: 4, default: '0.0000' })
  expensesFc: string;

  @ApiPropertyOptional({ description: 'Products sold from this custody during the period' })
  @Column({ name: 'sold_lines', type: 'jsonb', nullable: true })
  soldLines: CustodyHandoverSoldLine[] | null;

  @ApiPropertyOptional({ description: 'Sales voided during the period — printed with no amount beside them' })
  @Column({ name: 'rejected_lines', type: 'jsonb', nullable: true })
  rejectedLines: CustodyHandoverRejectedLine[] | null;

  @ApiPropertyOptional({ description: 'What each mini handed up to this custodian during the period' })
  @Column({ name: 'mini_rollup_lines', type: 'jsonb', nullable: true })
  miniRollupLines: CustodyHandoverMiniLine[] | null;

  @ApiPropertyOptional({ example: 'Two clients still owe for Friday' })
  @Column({ type: 'varchar', nullable: true })
  note: string | null;

  @OneToMany(() => CustodyHandoverItem, (item) => item.handover, { cascade: true })
  items: CustodyHandoverItem[];

  @OneToMany(() => CustodyHandoverAdjustment, (adj) => adj.handover)
  adjustments: CustodyHandoverAdjustment[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ApiPropertyOptional()
  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt: Date | null;

  @ApiPropertyOptional({ description: 'Who approved. Never the custodian themselves — blocked in the service, not the UI.' })
  @Column({ name: 'approved_by_id', type: 'uuid', nullable: true })
  approvedById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'approved_by_id' })
  approvedBy: User | null;

  @ApiPropertyOptional()
  @Column({ name: 'rejected_at', type: 'timestamp', nullable: true })
  rejectedAt: Date | null;

  @ApiPropertyOptional({ example: 'Count the rice again' })
  @Column({ name: 'rejection_reason', type: 'varchar', nullable: true })
  rejectionReason: string | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
