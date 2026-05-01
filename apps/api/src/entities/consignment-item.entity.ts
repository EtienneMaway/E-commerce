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

  @ApiProperty({ example: '32.00', description: 'What debtor will owe per unit' })
  @Column({ name: 'agreed_unit_price', type: 'decimal', precision: 12, scale: 2 })
  agreedUnitPrice: string;

  @ApiProperty({ example: '25.00', description: "Supplier's cost per unit at time of request" })
  @Column({ name: 'unit_cost', type: 'decimal', precision: 12, scale: 2 })
  unitCost: string;

  @Column({ name: 'consignment_request_id' })
  consignmentRequestId: string;

  @ManyToOne(() => ConsignmentRequest, (req) => req.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'consignment_request_id' })
  consignmentRequest: ConsignmentRequest;

  @ApiPropertyOptional({ description: 'Employee who created this consignment item on owner\'s behalf' })
  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_id' })
  actor: User | null;

  @ApiPropertyOptional({ example: '35.00', description: 'Owner\'s standard unit price at action time; set only when employee discounted' })
  @Column({ name: 'original_unit_price', type: 'decimal', precision: 12, scale: 2, nullable: true })
  originalUnitPrice: string | null;

  @ApiPropertyOptional({ example: 'Bulk discount agreed by employer' })
  @Column({ name: 'discount_reason', type: 'varchar', nullable: true })
  discountReason: string | null;
}
