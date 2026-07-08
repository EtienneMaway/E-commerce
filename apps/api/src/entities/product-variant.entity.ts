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
import { ProductGroup } from './product-group.entity';

/**
 * One size within a {@link ProductGroup} (e.g. "large"). Carries its own cost,
 * selling price, and `piecesPerCarton` — how many of THIS size make up one
 * carton (the carton composition). Stock is tracked per size via
 * `inventory_entries.variant_id`, so all existing lot/sale/consignment logic
 * works per size unchanged.
 */
@Entity('product_variants')
@Unique('UQ_product_variants_group_label', ['groupId', 'label'])
export class ProductVariant {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'group_id', type: 'uuid' })
  @Index()
  groupId: string;

  @ManyToOne(() => ProductGroup, (group) => group.variants, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'group_id' })
  group: ProductGroup;

  @ApiProperty({
    example: 'owner-uuid',
    description: 'Denormalized from the group for scoped queries',
  })
  @Column({ name: 'owner_id', type: 'uuid' })
  @Index()
  ownerId: string;

  @ApiProperty({
    example: 'large',
    description: 'Size label. Stored in lowercase; unique per group.',
  })
  @Column({ name: 'label', type: 'varchar' })
  label: string;

  @ApiPropertyOptional({
    example: '4.0000',
    description:
      "Owner's cost for one piece of this size. Nullable — cost is normally set " +
      'at the carton level (group.cartonBuyingPrice) and split across sizes.',
  })
  @Column({ name: 'unit_cost', type: 'decimal', precision: 14, scale: 4, nullable: true })
  unitCost: string | null;

  @ApiProperty({
    example: '6.0000',
    description: 'Standard per-piece selling price for this size',
  })
  @Column({ name: 'selling_price', type: 'decimal', precision: 14, scale: 4 })
  sellingPrice: string;

  @ApiProperty({
    example: 20,
    description: 'How many of this size are in one carton (carton composition)',
  })
  @Column({ name: 'pieces_per_carton', type: 'int' })
  piecesPerCarton: number;

  @ApiProperty({ example: 0, description: 'Display ordering within the group' })
  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @ApiProperty({ example: false })
  @Column({ type: 'boolean', default: false })
  archived: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
