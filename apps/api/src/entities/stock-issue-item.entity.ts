import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StockIssue } from './stock-issue.entity';

/**
 * One product line on a {@link StockIssue} — the *request*, not the result.
 *
 * Accepting an item can draw from several lots at different costs and therefore
 * create several custody entries, so nothing about the outcome is denormalised
 * back onto this row; the `CUSTODY_OUT`/`CUSTODY_IN` stock movements are the
 * audit trail.
 */
@Entity('stock_issue_items')
export class StockIssueItem {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'issue_id', type: 'uuid' })
  issueId: string;

  @ManyToOne(() => StockIssue, (issue) => issue.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'issue_id' })
  issue: StockIssue;

  @ApiProperty({ example: 'rice 50kg', description: 'Normalised (lowercase) product name' })
  @Column({ name: 'product_name', type: 'varchar' })
  productName: string;

  @ApiProperty({ example: 20, description: 'Units being handed over' })
  @Column({ type: 'int' })
  quantity: number;

  @ApiPropertyOptional({ description: 'Size being issued, for sized products; null for simple products' })
  @Column({ name: 'variant_id', type: 'uuid', nullable: true })
  variantId: string | null;

  @ApiPropertyOptional({ example: 'large', description: 'Snapshot of the size label at issue time' })
  @Column({ name: 'variant_label', type: 'varchar', nullable: true })
  variantLabel: string | null;

  /**
   * Take from exactly this lot instead of letting SUPPLIER-first priority
   * choose. The appointment sweep sets it (it names the lots it found); a
   * hand-written issue leaves it null and lets business rule 2 pick.
   */
  @ApiPropertyOptional({ description: 'Specific source lot to draw from; null = SUPPLIER-first priority' })
  @Column({ name: 'source_entry_id', type: 'uuid', nullable: true })
  sourceEntryId: string | null;
}
