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
import { ApiProperty } from '@nestjs/swagger';
import { User } from './user.entity';

@Entity('product_prices')
// A price is per branch: branch A and branch B may charge differently.
@Unique('UQ_product_prices_shop_product', ['shopId', 'productName'])
export class ProductPrice {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;


  /**
   * Tenancy: the business and the branch these books belong to
   * (MULTI_SHOP_PLAN.md §3.2). NOT NULL since migration 034.
   */
  @Column({ name: 'org_id', type: 'uuid' })
  orgId: string;

  @Column({ name: 'shop_id', type: 'uuid' })
  shopId: string;


  @ApiProperty({ example: 'rice 50kg', description: 'Stored in lowercase' })
  @Column({ name: 'product_name', type: 'varchar' })
  productName: string;

  @ApiProperty({ example: '30.00' })
  @Column({ name: 'unit_price', type: 'decimal', precision: 14, scale: 4 })
  unitPrice: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
