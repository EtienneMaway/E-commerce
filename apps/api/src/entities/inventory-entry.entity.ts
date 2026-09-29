import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  JoinColumn,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from './user.entity';
import { SupplierDebt } from './supplier-debt.entity';
import { DebtorCredit } from './debtor-credit.entity';
import { SaleTransaction } from './sale-transaction.entity';
import { StockMovement } from './stock-movement.entity';
import { ProductGroup } from './product-group.entity';
import { ProductVariant } from './product-variant.entity';

export enum InventorySource {
  PERSONAL = 'PERSONAL',
  SUPPLIER = 'SUPPLIER',
  CONSIGNED_OUT = 'CONSIGNED_OUT',
  CONSIGNED_IN = 'CONSIGNED_IN',
}

@Entity('inventory_entries')
export class InventoryEntry {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ enum: InventorySource, example: InventorySource.SUPPLIER })
  @Column({ type: 'enum', enum: InventorySource })
  source: InventorySource;

  @ApiProperty({ example: 'Rice 50kg' })
  @Column({ name: 'product_name' })
  productName: string;

  @ApiProperty({ example: '25.00' })
  @Column({ name: 'unit_cost', type: 'decimal', precision: 14, scale: 4 })
  unitCost: string;

  @ApiProperty({ example: '30.00' })
  @Column({ name: 'selling_price', type: 'decimal', precision: 14, scale: 4 })
  sellingPrice: string;

  @ApiPropertyOptional({ example: 'Grains' })
  @Column({ nullable: true, type: 'varchar' })
  category: string | null;

  @ApiProperty({ example: 100 })
  @Column({ name: 'quantity_original' })
  quantityOriginal: number;

  @ApiProperty({ example: 85 })
  @Column({ name: 'quantity_remaining' })
  quantityRemaining: number;

  @ApiPropertyOptional({
    example: '240.00',
    description: 'Purchase price for one full carton (null if not set)',
  })
  @Column({
    name: 'carton_price',
    type: 'decimal',
    precision: 14,
    scale: 4,
    nullable: true,
    default: null,
  })
  cartonPrice: string | null;

  @ApiPropertyOptional({
    example: 20,
    description: 'How many pieces make one carton (null if not set)',
  })
  @Column({
    name: 'pieces_per_carton',
    type: 'int',
    nullable: true,
    default: null,
  })
  piecesPerCarton: number | null;

  @ApiPropertyOptional({
    example: '2700.0000',
    description:
      "Locked FC/USD rate for CONSIGNED_IN lots given to a mini employee — snapshotted from the consignment at confirm time. A mini converts this lot's USD figures to FC at this rate (not the live rate), so the agreement stays intact when the rate changes. Null for owner/full-employee stock (they use the live rate).",
  })
  @Column({
    name: 'usd_to_fc_rate_snapshot',
    type: 'decimal',
    precision: 14,
    scale: 4,
    nullable: true,
    default: null,
  })
  usdToFcRateSnapshot: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  // Relations
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

  @ManyToOne(() => User, (user) => user.inventoryEntries)
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  /**
   * The full employee currently holding this lot, when it has been issued into
   * their custody (`SHOP_CUSTODY_PLAN.md` §3.1). **Null means unassigned** — on
   * the shelf, the owner's to sell or to issue — which is every lot that
   * pre-dates this feature and every lot at a branch with no custodian, so a
   * business that never appoints anyone is unaffected.
   *
   * This is a THIRD axis, beside tenancy `(org_id, shop_id)` and holder
   * `owner_id`. It is **not** a tenancy key and must never be used as one: it
   * narrows *within* `holderScope()`, it does not replace it. The goods stay
   * the employer's, so `owner_id`, `source` and `unit_cost` are all untouched
   * when a lot is issued — unlike a mini's `CONSIGNED_IN` lot, custody does not
   * change the cost basis and creates no debt.
   */
  @ApiPropertyOptional({ description: 'Full employee holding this lot; null = unassigned shelf stock' })
  @Column({ name: 'custodian_id', type: 'uuid', nullable: true })
  custodianId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'custodian_id' })
  custodian: User | null;

  @Column({ name: 'supplier_user_id', nullable: true, type: 'uuid' })
  supplierUserId: string | null;

  @ManyToOne(() => User, (user) => user.suppliedEntries, { nullable: true })
  @JoinColumn({ name: 'supplier_user_id' })
  supplierUser: User | null;

  @Column({ name: 'debtor_user_id', nullable: true, type: 'varchar' })
  debtorUserId: string | null;

  @ManyToOne(() => User, (user) => user.consignedToEntries, { nullable: true })
  @JoinColumn({ name: 'debtor_user_id' })
  debtorUser: User | null;

  @Column({ name: 'supplier_debt_id', nullable: true, type: 'varchar' })
  supplierDebtId: string | null;

  @ManyToOne(() => SupplierDebt, (debt) => debt.inventoryEntries, {
    nullable: true,
  })
  @JoinColumn({ name: 'supplier_debt_id' })
  supplierDebt: SupplierDebt | null;

  @Column({ name: 'debtor_credit_id', nullable: true, type: 'varchar' })
  debtorCreditId: string | null;

  @ManyToOne(() => DebtorCredit, (credit) => credit.inventoryEntries, {
    nullable: true,
  })
  @JoinColumn({ name: 'debtor_credit_id' })
  debtorCredit: DebtorCredit | null;

  @OneToMany(() => SaleTransaction, (sale) => sale.inventoryEntry)
  saleTransactions: SaleTransaction[];

  @OneToMany(() => StockMovement, (m) => m.inventoryEntry)
  movements: StockMovement[];

  @ApiPropertyOptional({
    description:
      "Employee who created this entry on owner's behalf (consignment-out flows etc.)",
  })
  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_id' })
  actor: User | null;

  // --- Sized (carton-with-variants) products. Null for simple products, which
  //     keep their flat piece price and the legacy carton_price/pieces_per_carton
  //     columns above. When set, this lot holds stock of one size of a group. ---
  @ApiPropertyOptional({
    description: 'ProductGroup this lot belongs to (sized products only)',
  })
  @Column({ name: 'group_id', type: 'uuid', nullable: true, default: null })
  groupId: string | null;

  @ManyToOne(() => ProductGroup, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'group_id' })
  group: ProductGroup | null;

  @ApiPropertyOptional({
    description:
      'ProductVariant (size) this lot holds stock of (sized products only)',
  })
  @Column({ name: 'variant_id', type: 'uuid', nullable: true, default: null })
  variantId: string | null;

  @ManyToOne(() => ProductVariant, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'variant_id' })
  variant: ProductVariant | null;
}
