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
import { InventoryEntry } from './inventory-entry.entity';
import { User } from './user.entity';

export enum StockMovementReason {
  // Positive (qty in)
  PURCHASE = 'PURCHASE',
  RECEIVE_SUPPLIER = 'RECEIVE_SUPPLIER',
  CUSTOMER_RETURN = 'CUSTOMER_RETURN',
  RECOUNT_UP = 'RECOUNT_UP',
  OTHER_IN = 'OTHER_IN',
  EXTERNAL_IN = 'EXTERNAL_IN',
  // Negative (qty out)
  SALE = 'SALE',
  CONSIGN_OUT = 'CONSIGN_OUT',
  EXTERNAL_OUT = 'EXTERNAL_OUT',
  DAMAGE = 'DAMAGE',
  LOSS = 'LOSS',
  THEFT = 'THEFT',
  EXPIRY = 'EXPIRY',
  SUPPLIER_RETURN = 'SUPPLIER_RETURN',
  INTERNAL_USE = 'INTERNAL_USE',
  RECOUNT_DOWN = 'RECOUNT_DOWN',
  OTHER_OUT = 'OTHER_OUT',
}

/**
 * Subset of StockMovementReason that users can pick manually via
 * POST /inventory/:id/adjust. Auto-only reasons (PURCHASE, RECEIVE_SUPPLIER,
 * SALE, CONSIGN_OUT) are excluded so the API is impossible to misuse.
 */
export enum ManualStockMovementReason {
  CUSTOMER_RETURN = 'CUSTOMER_RETURN',
  RECOUNT_UP = 'RECOUNT_UP',
  OTHER_IN = 'OTHER_IN',
  DAMAGE = 'DAMAGE',
  LOSS = 'LOSS',
  THEFT = 'THEFT',
  EXPIRY = 'EXPIRY',
  SUPPLIER_RETURN = 'SUPPLIER_RETURN',
  INTERNAL_USE = 'INTERNAL_USE',
  RECOUNT_DOWN = 'RECOUNT_DOWN',
  OTHER_OUT = 'OTHER_OUT',
}

export const POSITIVE_REASONS: ReadonlySet<StockMovementReason> = new Set([
  StockMovementReason.PURCHASE,
  StockMovementReason.RECEIVE_SUPPLIER,
  StockMovementReason.CUSTOMER_RETURN,
  StockMovementReason.RECOUNT_UP,
  StockMovementReason.OTHER_IN,
  StockMovementReason.EXTERNAL_IN,
]);

export const NOTES_REQUIRED_REASONS: ReadonlySet<StockMovementReason> = new Set([
  StockMovementReason.RECOUNT_UP,
  StockMovementReason.RECOUNT_DOWN,
  StockMovementReason.OTHER_IN,
  StockMovementReason.OTHER_OUT,
]);

@Entity('stock_movements')
@Index('idx_stock_movements_owner_created', ['ownerId', 'createdAt'])
@Index('idx_stock_movements_entry_created', ['inventoryEntryId', 'createdAt'])
@Index('idx_stock_movements_reason', ['reason'])
export class StockMovement {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'inventory_entry_id', type: 'uuid' })
  inventoryEntryId: string;

  @ManyToOne(() => InventoryEntry, (entry) => entry.movements, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'inventory_entry_id' })
  inventoryEntry: InventoryEntry;

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @ApiProperty({ enum: StockMovementReason })
  @Column({ type: 'enum', enum: StockMovementReason })
  reason: StockMovementReason;

  @ApiProperty({ example: -5, description: 'Signed delta. Positive = stock added, negative = stock removed.' })
  @Column({ name: 'qty_delta', type: 'int' })
  qtyDelta: number;

  @ApiProperty({ example: 50 })
  @Column({ name: 'qty_before', type: 'int' })
  qtyBefore: number;

  @ApiProperty({ example: 45 })
  @Column({ name: 'qty_after', type: 'int' })
  qtyAfter: number;

  @ApiProperty({ example: '25.00', description: 'Unit cost at the time of the movement (snapshot)' })
  @Column({ name: 'unit_cost_snapshot', type: 'decimal', precision: 12, scale: 2 })
  unitCostSnapshot: string;

  @ApiPropertyOptional()
  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @ApiPropertyOptional()
  @Column({ name: 'sale_transaction_id', type: 'uuid', nullable: true })
  saleTransactionId: string | null;

  @ApiPropertyOptional()
  @Column({ name: 'consignment_request_id', type: 'uuid', nullable: true })
  consignmentRequestId: string | null;

  @ApiPropertyOptional()
  @Column({ name: 'supplier_debt_id', type: 'uuid', nullable: true })
  supplierDebtId: string | null;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
