import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Shop } from './shop.entity';

/**
 * What one branch owes another branch of the same business, from transfers.
 *
 * One row per (creditor, debtor) pair, upserted on every receipt, the same
 * idea as business rule 3. Deliberately NOT `supplier_debts`/`debtor_credits`:
 * those are keyed on people, and reusing them would show the owner as their own
 * supplier and their own debtor.
 *
 * All amounts are USD at 4dp, like every other ledger column.
 */
@Entity('branch_balances')
@Unique('UQ_branch_balances_pair', ['orgId', 'creditorShopId', 'debtorShopId'])
export class BranchBalance {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'org_id', type: 'uuid' })
  orgId: string;

  @ApiProperty({ description: 'The branch that gave the goods and is owed' })
  @Column({ name: 'creditor_shop_id', type: 'uuid' })
  creditorShopId: string;

  @ManyToOne(() => Shop)
  @JoinColumn({ name: 'creditor_shop_id' })
  creditorShop: Shop;

  @ApiProperty({ description: 'The branch that received the goods and owes' })
  @Column({ name: 'debtor_shop_id', type: 'uuid' })
  debtorShopId: string;

  @ManyToOne(() => Shop)
  @JoinColumn({ name: 'debtor_shop_id' })
  debtorShop: Shop;

  @ApiProperty({ example: '420.0000' })
  @Column({ name: 'total_given', type: 'decimal', precision: 14, scale: 4, default: '0.0000' })
  totalGiven: string;

  @ApiProperty({ example: '100.0000' })
  @Column({ name: 'total_paid', type: 'decimal', precision: 14, scale: 4, default: '0.0000' })
  totalPaid: string;

  @ApiProperty({ example: '320.0000' })
  @Column({ name: 'outstanding', type: 'decimal', precision: 14, scale: 4, default: '0.0000' })
  outstanding: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
