import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from './user.entity';
import { CustodyHandover } from './custody-handover.entity';

export enum CustodyAdjustmentKind {
  /** Money the custodian is short. */
  CASH_SHORT = 'CASH_SHORT',
  /** Money over and above what the books expected. */
  CASH_OVER = 'CASH_OVER',
  /** Goods that should be here and are not — applied to stock on approval. */
  ITEM_MISSING = 'ITEM_MISSING',
  /** Goods found that the books had already written off — applied to stock on approval. */
  ITEM_FOUND = 'ITEM_FOUND',
  /** Anything the owner wants on the record that is neither of the above. */
  OTHER = 'OTHER',
}

/**
 * A line the **owner types by hand** onto a {@link CustodyHandover}
 * (`SHOP_CUSTODY_PLAN.md` §3.8).
 *
 * This is deliberately dumb. The app does not compute shortages, does not guess
 * at causes and does not reconcile: the owner counts, decides, and writes the
 * figure in with a note. That was the explicit requirement, and it is also the
 * honest design — the difference between the books and the shelf is a
 * judgement about people, not an arithmetic result.
 *
 * Item lines (`ITEM_MISSING` / `ITEM_FOUND`) produce a typed `StockMovement` on
 * approval through the same machinery as `POST /inventory/:entryId/adjust`, so
 * a shortage lands in the stock ledger exactly like a damage or a recount.
 * Cash lines affect this handover's net and the record; they never silently
 * move the branch's cash position.
 */
@Entity('custody_handover_adjustments')
@Index('idx_custody_handover_adjustments_handover', ['handoverId'])
export class CustodyHandoverAdjustment {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'handover_id', type: 'uuid' })
  handoverId: string;

  @ManyToOne(() => CustodyHandover, (handover) => handover.adjustments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'handover_id' })
  handover: CustodyHandover;

  @ApiProperty({ enum: CustodyAdjustmentKind })
  @Column({ type: 'enum', enum: CustodyAdjustmentKind })
  kind: CustodyAdjustmentKind;

  @ApiPropertyOptional({
    example: '5000.0000',
    description: 'FC, always positive — the `kind` carries the direction. Null on a pure item line.',
  })
  @Column({ name: 'amount_fc', type: 'decimal', precision: 14, scale: 4, nullable: true })
  amountFc: string | null;

  @ApiPropertyOptional({ example: 'rice 50kg', description: 'Set on item lines only' })
  @Column({ name: 'product_name', type: 'varchar', nullable: true })
  productName: string | null;

  @ApiPropertyOptional({ example: 'large' })
  @Column({ name: 'variant_label', type: 'varchar', nullable: true })
  variantLabel: string | null;

  @ApiPropertyOptional({ example: 3, description: 'Units missing or found; set on item lines only' })
  @Column({ type: 'int', nullable: true })
  quantity: number | null;

  /** The custody lot an item line applies to — resolved when the line is typed. */
  @ApiPropertyOptional()
  @Column({ name: 'inventory_entry_id', type: 'uuid', nullable: true })
  inventoryEntryId: string | null;

  /** Required on every line. A figure without a reason is not a record. */
  @ApiProperty({ example: 'Three bags short, says a client took them Friday' })
  @Column({ type: 'varchar' })
  note: string;

  @ApiPropertyOptional({ description: 'The owner or approver who typed this line' })
  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
