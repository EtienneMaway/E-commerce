import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { BranchTransferItem } from './branch-transfer-item.entity';
import { InventoryEntry, InventorySource } from './inventory-entry.entity';

/**
 * Exactly what one line took from one of the sending branch's lots.
 *
 * This is what makes the escrow reversible: a reject or cancel adds `quantity`
 * back onto `inventory_entry_id`, the lot it came from, rather than inventing a
 * new lot. On receipt, each draw becomes one lot at B carrying the same
 * `unit_cost` and `source`, so B's margins and SUPPLIER-first order stay true.
 */
@Entity('branch_transfer_lot_draws')
export class BranchTransferLotDraw {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @ManyToOne(() => BranchTransferItem, (i) => i.draws, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item: BranchTransferItem;

  @Column({ name: 'inventory_entry_id', type: 'uuid' })
  inventoryEntryId: string;

  @ManyToOne(() => InventoryEntry, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'inventory_entry_id' })
  inventoryEntry: InventoryEntry;

  @ApiProperty({ example: 4 })
  @Column({ type: 'int' })
  quantity: number;

  @ApiProperty({ example: '42.0000' })
  @Column({ name: 'unit_cost', type: 'decimal', precision: 14, scale: 4 })
  unitCost: string;

  @ApiProperty({ enum: InventorySource })
  @Column({ type: 'enum', enum: InventorySource, enumName: 'inventory_entries_source_enum' })
  source: InventorySource;
}
