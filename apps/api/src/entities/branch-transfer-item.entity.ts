import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { BranchTransfer } from './branch-transfer.entity';
import { BranchTransferLotDraw } from './branch-transfer-lot-draw.entity';

/** One product line of a branch transfer. */
@Entity('branch_transfer_items')
export class BranchTransferItem {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'transfer_id', type: 'uuid' })
  transferId: string;

  @ManyToOne(() => BranchTransfer, (t) => t.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transfer_id' })
  transfer: BranchTransfer;

  @ApiProperty({ example: 'rice 50kg', description: 'Stored in lowercase' })
  @Column({ name: 'product_name', type: 'varchar' })
  productName: string;

  @ApiProperty({ example: 10 })
  @Column({ type: 'int' })
  quantity: number;

  @ApiProperty({ example: '42.0000', description: 'Weighted average unit cost of the lots drawn' })
  @Column({ name: 'unit_cost', type: 'decimal', precision: 14, scale: 4 })
  unitCost: string;

  @ApiPropertyOptional({ description: "Sending branch's size, for sized products" })
  @Column({ name: 'variant_id', type: 'uuid', nullable: true })
  variantId: string | null;

  @ApiPropertyOptional({ example: 'large', description: 'Size label, snapshotted so B can match or create it' })
  @Column({ name: 'variant_label', type: 'varchar', nullable: true })
  variantLabel: string | null;

  @ApiPropertyOptional({ example: 20 })
  @Column({ name: 'pieces_per_carton', type: 'int', nullable: true })
  piecesPerCarton: number | null;

  @OneToMany(() => BranchTransferLotDraw, (d) => d.item, { cascade: true })
  draws: BranchTransferLotDraw[];
}
