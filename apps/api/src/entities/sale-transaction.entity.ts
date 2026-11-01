import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from './user.entity';
import { InventoryEntry } from './inventory-entry.entity';

export enum SaleApprovalStatus {
  /** Needs no attestation: outside a custody, or the owner's own sale. */
  AUTO = 'AUTO',
  /** A team member's sale, awaiting the custodian's batch review. */
  PENDING = 'PENDING',
  /** The custodian has reviewed and attested to this sale. */
  APPROVED = 'APPROVED',
}

@Entity('sale_transactions')
export class SaleTransaction {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: 'Rice 50kg' })
  @Column({ name: 'product_name' })
  productName: string;

  @ApiProperty({
    example: 'SUPPLIER',
    description: 'Stock source: PERSONAL or SUPPLIER',
  })
  @Column()
  source: string;

  @ApiPropertyOptional({ example: 'uuid-supplier' })
  @Column({ name: 'supplier_user_id', nullable: true, type: 'uuid' })
  supplierUserId: string | null;

  @ApiProperty({ example: 10 })
  @Column({ name: 'qty_sold' })
  qtySold: number;

  @ApiProperty({ example: '25.00' })
  @Column({ name: 'unit_cost', type: 'decimal', precision: 14, scale: 4 })
  unitCost: string;

  @ApiProperty({ example: '30.00' })
  @Column({ name: 'sale_price', type: 'decimal', precision: 14, scale: 4 })
  salePrice: string;

  @ApiProperty({
    example: '50.00',
    description: '(salePrice - unitCost) × qtySold',
  })
  @Column({ type: 'decimal', precision: 14, scale: 4 })
  profit: string;

  @ApiProperty({
    example: false,
    description: 'True when sold below cost price',
  })
  @Column({ name: 'is_loss', default: false })
  isLoss: boolean;

  @ApiProperty({ description: 'Date the sale was recorded' })
  @CreateDateColumn({ name: 'created_at' })
  date: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'owner_id' })
  ownerId: string;

  /**
   * Tenancy: the business and the branch these books belong to
   * (MULTI_SHOP_PLAN.md §3.2). NOT NULL since migration 034.
   */
  @Column({ name: 'org_id', type: 'uuid' })
  orgId: string;

  @Column({ name: 'shop_id', type: 'uuid' })
  shopId: string;

  @ManyToOne(() => User, (user) => user.salesTransactions)
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @Column({ name: 'inventory_entry_id' })
  inventoryEntryId: string;

  @ManyToOne(() => InventoryEntry, (entry) => entry.saleTransactions)
  @JoinColumn({ name: 'inventory_entry_id' })
  inventoryEntry: InventoryEntry;

  @ApiPropertyOptional({
    description:
      "Employee who performed this sale on the owner's behalf; null when owner-performed",
  })
  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_id' })
  actor: User | null;

  @ApiPropertyOptional({
    example: '32.00',
    description:
      "Owner's standard unit price at sale time; set only when employee discounted",
  })
  @Column({
    name: 'original_unit_price',
    type: 'decimal',
    precision: 14,
    scale: 4,
    nullable: true,
  })
  originalUnitPrice: string | null;

  @ApiPropertyOptional({
    example: 'Loyal customer',
    description:
      'Reason the employee discounted; required when employee sells below standard',
  })
  @Column({ name: 'discount_reason', type: 'varchar', nullable: true })
  discountReason: string | null;

  @ApiPropertyOptional({
    example: 'Jean Mukendi',
    description:
      "Buyer's name as captured at the receipt prompt. Lets the merchant later look the sale up by client.",
  })
  @Column({ name: 'client_name', type: 'varchar', nullable: true })
  clientName: string | null;

  @ApiPropertyOptional({
    example: '+243 836 743 579',
    description: "Buyer's phone — searchable from the sales tab.",
  })
  @Column({ name: 'client_phone', type: 'varchar', nullable: true })
  clientPhone: string | null;

  @ApiPropertyOptional({
    example: 'RCP-AB12CD',
    description:
      'Receipt identifier shared by every sale row that came out of one cart submission. ' +
      'Lets the mobile sales tab regroup a multi-item original receipt into a single reprint.',
  })
  @Column({ name: 'receipt_id', type: 'varchar', nullable: true })
  receiptId: string | null;

  @ApiPropertyOptional({
    example: '1719763200000-a1b2c',
    description:
      'Client-generated idempotency key. Set by the mobile offline queue so a sale that is retried after a ' +
      'flaky-network timeout (server committed but the response was lost) is recognised and NOT duplicated. ' +
      'Null for online sales. Multiple rows from one split sale share the same value.',
  })
  @Column({ name: 'client_sale_id', type: 'varchar', nullable: true })
  clientSaleId: string | null;

  @ApiPropertyOptional({
    example: '2700.0000',
    description:
      "Locked FC/USD rate copied from the CONSIGNED_IN lot when a mini employee sold it. The mini's app converts this sale's USD figures (agreed value owed, markup) to FC at this rate — so what they owe and their profit stay fixed against later rate changes. Null for owner/full-employee sales.",
  })
  @Column({
    name: 'usd_to_fc_rate_snapshot',
    type: 'decimal',
    precision: 14,
    scale: 4,
    nullable: true,
  })
  usdToFcRateSnapshot: string | null;

  @ApiPropertyOptional({
    description:
      'Size (ProductVariant) sold, for sized products; null for simple products',
  })
  @Column({ name: 'variant_id', type: 'uuid', nullable: true })
  variantId: string | null;

  @ApiPropertyOptional({
    example: 'large',
    description:
      'Snapshot of the size label at sale time (receipt/history stability)',
  })
  @Column({ name: 'variant_label', type: 'varchar', nullable: true })
  variantLabel: string | null;

  @ApiPropertyOptional({
    example: 'uuid-v4',
    description:
      'Groups the per-size rows that make up one whole-carton sale. Shared by every size row of one carton sale; null for individual piece sales.',
  })
  @Column({ name: 'carton_sale_id', type: 'uuid', nullable: true })
  cartonSaleId: string | null;

  // ─── Custody & team-sale approval (SHOP_CUSTODY_PLAN.md §3.5) ─────────────
  // Approval is an ATTESTATION, not a ledger gate. The goods left and the money
  // arrived the moment the sale was recorded, so this sale counts towards stock
  // and cash immediately whatever its approval status — a queue of sales that
  // did not count would make the branch's cash position wrong all day and would
  // fight the `rejected_at IS NULL` filters on every money query.
  //
  // What approval gates is the HANDOVER CLOSE: a `CustodyHandover` cannot be
  // submitted while any sale in its period is still PENDING. The man in charge
  // must approve each one or reject it — and rejection is not a new concept, it
  // is `POST /sales/:id/reject` below.

  @ApiPropertyOptional({
    description:
      'The custody period this sale belongs to; null for a sale at a branch with no open custody (every sale that pre-dates this feature).',
  })
  @Column({ name: 'custody_id', type: 'uuid', nullable: true })
  custodyId: string | null;

  @ApiProperty({
    enum: SaleApprovalStatus,
    default: SaleApprovalStatus.AUTO,
    description:
      "AUTO for a sale needing no attestation — anything outside a custody, and the owner's own sales, because he cannot cheat himself. PENDING for a team member's sale until the custodian reviews it.",
  })
  @Column({
    name: 'approval_status',
    type: 'enum',
    enum: SaleApprovalStatus,
    default: SaleApprovalStatus.AUTO,
  })
  approvalStatus: SaleApprovalStatus;

  @ApiPropertyOptional()
  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt: Date | null;

  @ApiPropertyOptional({ description: 'The custodian who attested to this sale' })
  @Column({ name: 'approved_by_id', type: 'uuid', nullable: true })
  approvedById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'approved_by_id' })
  approvedBy: User | null;

  // ─── Rejection (a sale recorded by mistake) ───────────────────────────────
  // A rejected sale is never deleted: the row stays, its quantity goes back on
  // the shelf, and every money/stock aggregation skips it (`rejected_at IS
  // NULL`). Keeping it is the point — the merchant can show what was voided,
  // when, by whom and why.

  @ApiPropertyOptional({
    description:
      'When this sale was rejected (recorded by mistake). Null for a live sale — every revenue, profit, stock and handover figure filters on this being null.',
  })
  @Column({ name: 'rejected_at', type: 'timestamp', nullable: true })
  rejectedAt: Date | null;

  @ApiPropertyOptional({ description: 'User who rejected the sale' })
  @Column({ name: 'rejected_by_id', type: 'uuid', nullable: true })
  rejectedById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'rejected_by_id' })
  rejectedBy: User | null;

  @ApiPropertyOptional({
    example: 'Wrong product',
    description: 'Optional note explaining why the sale was rejected',
  })
  @Column({ name: 'rejection_reason', type: 'varchar', nullable: true })
  rejectionReason: string | null;

  // ─── Amendment (a sale corrected the same day) ────────────────────────────
  // An amend is a void + re-record in one transaction: the original row is
  // rejected (so it drops out of every `rejected_at IS NULL` figure) and these
  // columns link it to the corrected row(s) that replaced it. A voided row with
  // `amended_to_id` set was amended, not plainly rejected — the UI and the owner
  // alert feed use that to tell the two apart.

  @ApiPropertyOptional({
    description:
      'When this row was superseded by an amendment. Set on the voided original; null otherwise.',
  })
  @Column({ name: 'amended_at', type: 'timestamp', nullable: true })
  amendedAt: Date | null;

  @ApiPropertyOptional({
    description:
      'On the VOIDED original: the id of the corrected sale row that replaced it.',
  })
  @Column({ name: 'amended_to_id', type: 'uuid', nullable: true })
  amendedToId: string | null;

  @ApiPropertyOptional({
    description:
      'On a corrected row: the id of the original sale it was amended from.',
  })
  @Column({ name: 'amended_from_id', type: 'uuid', nullable: true })
  amendedFromId: string | null;
}
