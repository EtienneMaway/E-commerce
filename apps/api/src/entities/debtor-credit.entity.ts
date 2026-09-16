import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { User } from './user.entity';
import { Payment } from './payment.entity';
import { InventoryEntry } from './inventory-entry.entity';

@Entity('debtor_credits')
@Unique('UQ_debtor_credits_shop_owner_debtor', ['shopId', 'ownerId', 'debtorUserId'])
export class DebtorCredit {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: '400.00', description: 'Total credit ever given to this debtor' })
  @Column({ name: 'total_credit_given', type: 'decimal', precision: 14, scale: 4, default: '0.0000' })
  totalCreditGiven: string;

  @ApiProperty({ example: '100.00', description: 'Total amount received from this debtor' })
  @Column({ name: 'total_received', type: 'decimal', precision: 14, scale: 4, default: '0.0000' })
  totalReceived: string;

  @ApiProperty({ example: '300.00', description: 'Current outstanding balance owed by debtor' })
  @Column({ name: 'outstanding_balance', type: 'decimal', precision: 14, scale: 4, default: '0.0000' })
  outstandingBalance: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'owner_id' })
  ownerId: string;

  /**
   * Tenancy: the business and the branch these books belong to
   * (MULTI_SHOP_PLAN.md §3.2). NOT NULL since migration 034.
   */
  @Column({ name: 'org_id', type: 'uuid' })
  orgId: string;

  @Column({ name: 'shop_id', type: 'uuid' })
  shopId: string;

  /**
   * The **counterparty's** branch — the other side of this balance.
   *
   * `org_id`/`shop_id` say which of *my* branches this row belongs to; these say
   * which of *theirs*. Without them the pairing between a `SupplierDebt` on the
   * debtor's books and the matching `DebtorCredit` on the supplier's books is
   * only by user pair, and per-branch debts (MULTI_SHOP_PLAN.md §3.4) make that
   * ambiguous the moment a supplier has two branches trading with one debtor:
   * `payments.approvePayment` would have to guess which credit row to settle.
   *
   * Nullable for rows that pre-date multi-branch trading on the other side.
   */
  @Column({ name: 'counterparty_org_id', type: 'uuid', nullable: true })
  counterpartyOrgId: string | null;

  @Column({ name: 'counterparty_shop_id', type: 'uuid', nullable: true })
  counterpartyShopId: string | null;

  @ManyToOne(() => User, (user) => user.myDebtorCredits)
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @Column({ name: 'debtor_user_id' })
  debtorUserId: string;

  @ManyToOne(() => User, (user) => user.debtorCreditsAsDebtor)
  @JoinColumn({ name: 'debtor_user_id' })
  debtorUser: User;

  @OneToMany(() => Payment, (payment) => payment.debtorCredit)
  payments: Payment[];

  @OneToMany(() => InventoryEntry, (entry) => entry.debtorCredit)
  inventoryEntries: InventoryEntry[];
}
