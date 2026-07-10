import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConsignmentRequest } from './consignment-request.entity';
import { User } from './user.entity';

@Entity('consignment_items')
export class ConsignmentItem {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: 'rice 50kg' })
  @Column({ name: 'product_name' })
  productName: string;

  @ApiProperty({ example: 10 })
  @Column()
  quantity: number;

  @ApiProperty({
    example: '32.00',
    description: 'What debtor will owe per unit',
  })
  @Column({
    name: 'agreed_unit_price',
    type: 'decimal',
    precision: 14,
    scale: 4,
  })
  agreedUnitPrice: string;

  @ApiProperty({
    example: '25.00',
    description: "Supplier's cost per unit at time of request",
  })
  @Column({ name: 'unit_cost', type: 'decimal', precision: 14, scale: 4 })
  unitCost: string;

  @Column({ name: 'consignment_request_id' })
  consignmentRequestId: string;

  @ManyToOne(() => ConsignmentRequest, (req) => req.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'consignment_request_id' })
  consignmentRequest: ConsignmentRequest;

  @ApiPropertyOptional({
    description: "Employee who created this consignment item on owner's behalf",
  })
  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_id' })
  actor: User | null;

  @ApiPropertyOptional({
    example: '35.00',
    description:
      "Owner's standard unit price at action time; set only when employee discounted",
  })
  @Column({
    name: 'original_unit_price',
    type: 'decimal',
    precision: 14,
    scale: 4,
    nullable: true,
  })
  originalUnitPrice: string | null;

  @ApiPropertyOptional({ example: 'Bulk discount agreed by employer' })
  @Column({ name: 'discount_reason', type: 'varchar', nullable: true })
  discountReason: string | null;

  @ApiPropertyOptional({
    example: 20,
    description:
      'Pieces per carton snapshotted from the source stock — lets the recipient see the carton/loose breakdown and carton price',
  })
  @Column({ name: 'pieces_per_carton', type: 'int', nullable: true })
  piecesPerCarton: number | null;

  @ApiPropertyOptional({
    description:
      'Size (ProductVariant) being consigned, for sized products; null for simple products',
  })
  @Column({ name: 'variant_id', type: 'uuid', nullable: true })
  variantId: string | null;

  @ApiPropertyOptional({
    description:
      'ProductGroup the consigned size belongs to (convenience FK); null for simple products',
  })
  @Column({ name: 'group_id', type: 'uuid', nullable: true })
  groupId: string | null;

  /**
   * Size label — NOT persisted. Resolved at read time (findIncoming/findOutgoing)
   * so the recipient can see which size each consigned line is, without a column.
   */
  variantLabel?: string | null;
}
