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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from './user.entity';

export enum StockCustodyStatus {
  /** The appointment is live — this person is the man in charge at this branch. */
  OPEN = 'OPEN',
  /** The appointment has ended; the final handover was approved. */
  CLOSED = 'CLOSED',
}

/**
 * The appointment: one full employee is accountable for a named volume of a
 * branch's stock (`SHOP_CUSTODY_PLAN.md` §3.3).
 *
 * This is the long-lived row — "Jean is the man in charge at Goma". It spans
 * many settlement periods; a {@link CustodyHandover} closes one period inside
 * it without ending the appointment, which is what lets the owner settle at the
 * end of a day, two days, a week or a month without re-issuing the volume each
 * time.
 *
 * **Custody is not ownership.** The goods stay the employer's: the lots keep
 * their `owner_id`, their `source` and — critically — their `unit_cost`. Only
 * `inventory_entries.custodian_id` changes (§3.1). There is no `DebtorCredit`
 * and no agreed price anywhere in this feature; the custodian owes the sale
 * proceeds, not a price the owner set.
 *
 * At most one OPEN custody per branch, held by a partial unique index rather
 * than by discipline — the same instinct as "one default shop per organization".
 */
@Entity('stock_custodies')
@Index('idx_stock_custodies_custodian', ['custodianId'])
export class StockCustody {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Tenancy: the business and the branch this custody belongs to
   * (MULTI_SHOP_PLAN.md §3.2).
   */
  @Column({ name: 'org_id', type: 'uuid' })
  orgId: string;

  @Column({ name: 'shop_id', type: 'uuid' })
  shopId: string;

  /**
   * The full employee holding the volume. Not a tenancy key and never to be
   * used as one — it narrows *within* `holderScope()`, it does not replace it.
   */
  @Column({ name: 'custodian_id', type: 'uuid' })
  custodianId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'custodian_id' })
  custodian: User;

  @ApiProperty({ enum: StockCustodyStatus, default: StockCustodyStatus.OPEN })
  @Column({ type: 'enum', enum: StockCustodyStatus, default: StockCustodyStatus.OPEN })
  status: StockCustodyStatus;

  @ApiPropertyOptional({ description: 'Owner who made the appointment' })
  @Column({ name: 'appointed_by_id', type: 'uuid', nullable: true })
  appointedById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'appointed_by_id' })
  appointedBy: User | null;

  @ApiPropertyOptional({ example: 'Morning shift, main counter' })
  @Column({ type: 'varchar', nullable: true })
  note: string | null;

  @ApiProperty()
  @Column({ name: 'opened_at', type: 'timestamp', default: () => 'now()' })
  openedAt: Date;

  @ApiPropertyOptional()
  @Column({ name: 'closed_at', type: 'timestamp', nullable: true })
  closedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
