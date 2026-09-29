import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CustodyHandover } from './custody-handover.entity';

/**
 * One unsold product line the custodian is handing back with a
 * {@link CustodyHandover}.
 *
 * Unlike {@link MiniSettlementItem} there is no `agreed_unit_price` to reverse,
 * because custody never created a debt (`SHOP_CUSTODY_PLAN.md` §3.1). What is
 * snapshotted instead is `unit_cost` — the owner's real cost, carried from the
 * custody lot — so that when the goods re-enter unassigned stock on approval
 * they do so at the cost they left with, and the branch's profit maths is
 * unchanged by the round trip.
 */
@Entity('custody_handover_items')
export class CustodyHandoverItem {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'handover_id', type: 'uuid' })
  handoverId: string;

  @ManyToOne(() => CustodyHandover, (handover) => handover.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'handover_id' })
  handover: CustodyHandover;

  @ApiProperty({ example: 'rice 50kg' })
  @Column({ name: 'product_name', type: 'varchar' })
  productName: string;

  @ApiProperty({ example: 5, description: 'Units being handed back' })
  @Column({ type: 'int' })
  quantity: number;

  @ApiProperty({ example: '25.0000', description: "Owner's cost, carried from the custody lot" })
  @Column({ name: 'unit_cost', type: 'decimal', precision: 14, scale: 4 })
  unitCost: string;

  /** The custody lot these units come off, so approval decrements the right row. */
  @Column({ name: 'inventory_entry_id', type: 'uuid' })
  inventoryEntryId: string;

  @ApiPropertyOptional({ description: 'Size being returned, for sized products' })
  @Column({ name: 'variant_id', type: 'uuid', nullable: true })
  variantId: string | null;

  @ApiPropertyOptional({ example: 'large' })
  @Column({ name: 'variant_label', type: 'varchar', nullable: true })
  variantLabel: string | null;

  @ApiPropertyOptional({ example: 20 })
  @Column({ name: 'pieces_per_carton', type: 'int', nullable: true })
  piecesPerCarton: number | null;
}
