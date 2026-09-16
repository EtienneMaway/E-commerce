import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { User } from './user.entity';

/**
 * Per-owner configuration for quantity ("group of prices") discounts.
 *
 * One row per owner (shop-wide). The seller can toggle the discount on for a
 * given sale at checkout; the client reads these tiers, picks the highest
 * percentage among all tiers whose threshold the quantity meets, and applies it
 * to that sale. Nothing is stored per customer.
 */
@Entity('quantity_discounts')
export class QuantityDiscount {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Tenancy: the business and the branch these books belong to
   * (MULTI_SHOP_PLAN.md §3.2). NOT NULL since migration 034.
   */
  @Column({ name: 'org_id', type: 'uuid' })
  orgId: string;

  /**
   * One config per BRANCH, not per business — the unique index moved here with
   * the tenancy. It used to sit on `owner_id`; leaving it on `org_id` would let
   * a merchant configure discounts once and never differently per branch.
   */
  @Index('UQ_quantity_discounts_shop', { unique: true })
  @Column({ name: 'shop_id', type: 'uuid' })
  shopId: string;


  @ApiProperty({
    example: false,
    description: 'Master on/off switch for quantity discounts across the shop',
  })
  @Column({ name: 'enabled', type: 'boolean', default: false })
  enabled: boolean;

  @ApiProperty({
    example: '3.00',
    description: 'Percentage discount when quantity ≥ 6 (half dozen)',
  })
  @Column({
    name: 'half_dozen_percent',
    type: 'decimal',
    precision: 6,
    scale: 2,
    default: '0.00',
  })
  halfDozenPercent: string;

  @ApiProperty({
    example: '5.00',
    description: 'Percentage discount when quantity ≥ 12 (dozen)',
  })
  @Column({
    name: 'dozen_percent',
    type: 'decimal',
    precision: 6,
    scale: 2,
    default: '0.00',
  })
  dozenPercent: string;

  @ApiProperty({
    example: '8.00',
    description:
      "Percentage discount when quantity ≥ the product's pieces-per-carton (carton)",
  })
  @Column({
    name: 'carton_percent',
    type: 'decimal',
    precision: 6,
    scale: 2,
    default: '0.00',
  })
  cartonPercent: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
