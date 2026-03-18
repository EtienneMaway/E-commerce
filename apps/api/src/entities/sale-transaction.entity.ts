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

@Entity('sale_transactions')
export class SaleTransaction {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: 'Rice 50kg' })
  @Column({ name: 'product_name' })
  productName: string;

  @ApiProperty({ example: 'SUPPLIER', description: 'Stock source: PERSONAL or SUPPLIER' })
  @Column()
  source: string;

  @ApiPropertyOptional({ example: 'uuid-supplier' })
  @Column({ name: 'supplier_user_id', nullable: true, type: 'uuid' })
  supplierUserId: string | null;

  @ApiProperty({ example: 10 })
  @Column({ name: 'qty_sold' })
  qtySold: number;

  @ApiProperty({ example: '25.00' })
  @Column({ name: 'unit_cost', type: 'decimal', precision: 12, scale: 2 })
  unitCost: string;

  @ApiProperty({ example: '30.00' })
  @Column({ name: 'sale_price', type: 'decimal', precision: 12, scale: 2 })
  salePrice: string;

  @ApiProperty({ example: '50.00', description: '(salePrice - unitCost) × qtySold' })
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  profit: string;

  @ApiProperty({ example: false, description: 'True when sold below cost price' })
  @Column({ name: 'is_loss', default: false })
  isLoss: boolean;

  @ApiProperty({ description: 'Date the sale was recorded' })
  @CreateDateColumn({ name: 'created_at' })
  date: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'owner_id' })
  ownerId: string;

  @ManyToOne(() => User, (user) => user.salesTransactions)
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @Column({ name: 'inventory_entry_id' })
  inventoryEntryId: string;

  @ManyToOne(() => InventoryEntry, (entry) => entry.saleTransactions)
  @JoinColumn({ name: 'inventory_entry_id' })
  inventoryEntry: InventoryEntry;
}
