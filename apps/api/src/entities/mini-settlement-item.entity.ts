import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MiniSettlement } from './mini-settlement.entity';

/**
 * One unsold product line being returned to the owner as part of a
 * {@link MiniSettlement}. `agreedUnitPrice` is snapshotted from the mini's
 * CONSIGNED_IN entry at hand-over time so the owner's credit can be reversed by
 * the exact amount the mini no longer owes. `unitCost` (the owner's original
 * cost) is resolved on approval and stored on the re-stocked owner entry.
 */
@Entity('mini_settlement_items')
export class MiniSettlementItem {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'mini_settlement_id', type: 'uuid' })
  miniSettlementId: string;

  @ManyToOne(() => MiniSettlement, (settlement) => settlement.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'mini_settlement_id' })
  miniSettlement: MiniSettlement;

  @ApiProperty({ example: 'rice 50kg' })
  @Column({ name: 'product_name', type: 'varchar' })
  productName: string;

  @ApiProperty({ example: 5, description: 'Units being returned' })
  @Column({ type: 'int' })
  quantity: number;

  @ApiProperty({
    example: '32.0000',
    description:
      'Owner-set price the mini owed per unit — reversed on approval',
  })
  @Column({
    name: 'agreed_unit_price',
    type: 'decimal',
    precision: 14,
    scale: 4,
  })
  agreedUnitPrice: string;

  @ApiPropertyOptional({
    example: '25.0000',
    description:
      'Owner original cost, resolved on approval for the re-stocked entry',
  })
  @Column({
    name: 'unit_cost',
    type: 'decimal',
    precision: 14,
    scale: 4,
    nullable: true,
  })
  unitCost: string | null;

  @ApiPropertyOptional({
    description:
      'Size (ProductVariant) being returned, for sized products; null for simple products',
  })
  @Column({ name: 'variant_id', type: 'uuid', nullable: true })
  variantId: string | null;

  @ApiPropertyOptional({
    example: 'large',
    description: 'Snapshot of the returned size label',
  })
  @Column({ name: 'variant_label', type: 'varchar', nullable: true })
  variantLabel: string | null;
}
