import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Organization } from './organization.entity';

/**
 * A branch — the unit the books are kept in. Every scoped row carries
 * `(org_id, shop_id)`; see MULTI_SHOP_PLAN.md §3.2.
 */
@Entity('shops')
@Unique('UQ_shops_org_name', ['orgId', 'name'])
// Required so the composite FK `(shop_id, org_id) → shops (id, org_id)` on every
// scoped table has a unique constraint to reference. It looks redundant beside
// the primary key because it is — and it is what makes the denormalised `org_id`
// safe rather than a drift risk (§3.2).
@Unique('UQ_shops_id_org', ['id', 'orgId'])
// "Exactly one default per organization", held by the database rather than by
// discipline: every request without an X-Shop-Id header resolves through it.
@Index('UQ_shops_one_default_per_org', ['orgId'], { unique: true, where: 'is_default' })
export class Shop {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'org_id', type: 'uuid' })
  orgId: string;

  @ManyToOne(() => Organization, (org) => org.shops, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'org_id' })
  organization: Organization;

  @ApiProperty({ example: 'Main Shop' })
  @Column({ type: 'varchar' })
  name: string;

  @ApiPropertyOptional({ example: 'Avenue Kasa-Vubu 42' })
  @Column({ type: 'varchar', nullable: true })
  address: string | null;

  @ApiPropertyOptional({ example: '+243 990 000 000' })
  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @ApiPropertyOptional({ example: 'Goma' })
  @Column({ type: 'varchar', nullable: true })
  city: string | null;

  @ApiPropertyOptional({ example: 'Opposite the market' })
  @Column({ type: 'varchar', nullable: true })
  note: string | null;

  @ApiPropertyOptional({ description: 'Printed above the receipt body.' })
  @Column({ name: 'receipt_header', type: 'varchar', nullable: true })
  receiptHeader: string | null;

  @ApiPropertyOptional({ description: 'Printed below the receipt body.' })
  @Column({ name: 'receipt_footer', type: 'varchar', nullable: true })
  receiptFooter: string | null;

  /** Exactly one per organization — enforced by the partial unique index above. */
  @ApiProperty({ example: true })
  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  /**
   * A closed branch: readable forever, writable never. A shop still owns years
   * of sales, so it is archived rather than deleted — the same instinct as
   * business rule 9 keeping a rejected sale.
   */
  @ApiPropertyOptional()
  @Column({ name: 'archived_at', type: 'timestamp', nullable: true })
  archivedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
