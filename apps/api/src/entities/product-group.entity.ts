import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from './user.entity';
import { ProductVariant } from './product-variant.entity';

/**
 * A "sized" product — one product name (e.g. "casserole") that ships in cartons
 * holding several {@link ProductVariant} sizes, each with its own cost and
 * price. This is an OPTIONAL alternate product shape: simple products (a single
 * flat piece price) never get a group and behave exactly as before. Stock for a
 * sized product lives in ordinary `inventory_entries` rows tagged with
 * `group_id`/`variant_id`; this table only holds the group-level definition.
 */
@Entity('product_groups')
@Unique('UQ_product_groups_owner_name', ['ownerId', 'name'])
export class ProductGroup {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'owner_id', type: 'uuid' })
  @Index()
  ownerId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @ApiProperty({
    example: 'casserole',
    description:
      'Group/product display name. Stored in lowercase; unique per owner.',
  })
  @Column({ name: 'name', type: 'varchar' })
  name: string;

  @ApiPropertyOptional({ example: 'Kitchenware' })
  @Column({ type: 'varchar', nullable: true })
  category: string | null;

  @ApiPropertyOptional({
    example: '220.0000',
    description:
      'Discounted selling price for one full carton (all sizes combined). ' +
      'Null disables whole-carton selling — sizes are still sold individually.',
  })
  @Column({
    name: 'carton_selling_price',
    type: 'decimal',
    precision: 14,
    scale: 4,
    nullable: true,
    default: null,
  })
  cartonSellingPrice: string | null;

  @ApiPropertyOptional({
    example: '180.0000',
    description:
      'Cost of one whole carton (what the owner pays). The per-size cost is ' +
      'derived by splitting this across sizes by selling-price share. Null = no cost set yet.',
  })
  @Column({
    name: 'carton_buying_price',
    type: 'decimal',
    precision: 14,
    scale: 4,
    nullable: true,
    default: null,
  })
  cartonBuyingPrice: string | null;

  @ApiProperty({
    example: false,
    description: 'Soft-hide without deleting history',
  })
  @Column({ type: 'boolean', default: false })
  archived: boolean;

  @OneToMany(() => ProductVariant, (variant) => variant.group)
  variants: ProductVariant[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
