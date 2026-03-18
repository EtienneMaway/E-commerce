import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { ConsignmentRequest } from './consignment-request.entity';

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
}
