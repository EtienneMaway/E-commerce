import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Shop } from './shop.entity';
import { User } from './user.entity';
import { BranchTransferItem } from './branch-transfer-item.entity';

/**
 * The escrow states of a branch transfer (`BRANCH_TRANSFER_PLAN.md` §3.1).
 *
 * The goods leave the sending branch's shelf the moment the transfer is sent,
 * so `IN_TRANSIT` IS the escrow: they sit on this row and nowhere else.
 */
export enum BranchTransferStatus {
  /** Sent. Off A's shelf, not yet on B's. */
  IN_TRANSIT = 'IN_TRANSIT',
  /** B verified and took everything. Lots created at B, B owes A. */
  RECEIVED = 'RECEIVED',
  /** B refused it. Every draw restored to the lot it came from. */
  REJECTED = 'REJECTED',
  /** A withdrew it before B answered. Same stock effect as a rejection. */
  CANCELLED = 'CANCELLED',
}

/**
 * Moving stock from one branch to another branch of the SAME business.
 *
 * Unlike a consignment (two people, stock moves only on confirm), this is two
 * branches, and stock leaves the sender into escrow at once. Receipt is all or
 * nothing: B takes every line in full or rejects the whole transfer.
 *
 * Tenancy is `org_id` plus the two branch columns. There is no single
 * `shop_id` because the row belongs to both ends; each branch reads it through
 * its own column.
 */
@Entity('branch_transfers')
@Index('idx_branch_transfers_from', ['fromShopId', 'status'])
@Index('idx_branch_transfers_to', ['toShopId', 'status'])
export class BranchTransfer {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'org_id', type: 'uuid' })
  orgId: string;

  @ApiProperty({ description: 'Sending branch' })
  @Column({ name: 'from_shop_id', type: 'uuid' })
  fromShopId: string;

  @ManyToOne(() => Shop)
  @JoinColumn({ name: 'from_shop_id' })
  fromShop: Shop;

  @ApiProperty({ description: 'Receiving branch' })
  @Column({ name: 'to_shop_id', type: 'uuid' })
  toShopId: string;

  @ManyToOne(() => Shop)
  @JoinColumn({ name: 'to_shop_id' })
  toShop: Shop;

  @ApiProperty({ enum: BranchTransferStatus, example: BranchTransferStatus.IN_TRANSIT })
  @Column({ type: 'enum', enum: BranchTransferStatus, default: BranchTransferStatus.IN_TRANSIT })
  status: BranchTransferStatus;

  @ApiProperty({ description: 'Owner or sending custodian who sent it' })
  @Column({ name: 'sent_by_id', type: 'uuid', nullable: true })
  sentById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sent_by_id' })
  sentBy: User | null;

  @ApiPropertyOptional({ description: 'Who received, rejected or cancelled it' })
  @Column({ name: 'answered_by_id', type: 'uuid', nullable: true })
  answeredById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'answered_by_id' })
  answeredBy: User | null;

  /**
   * The custody the goods came out of. Null when the owner sent them off the
   * unassigned shelf. A reject restores the exact lots drawn, so this is a
   * record, not an input to the restore.
   */
  @ApiPropertyOptional()
  @Column({ name: 'from_custody_id', type: 'uuid', nullable: true })
  fromCustodyId: string | null;

  /** The custody the goods landed in. Null when the owner received them. */
  @ApiPropertyOptional()
  @Column({ name: 'to_custody_id', type: 'uuid', nullable: true })
  toCustodyId: string | null;

  @ApiProperty({ example: '420.0000', description: 'Σ quantity × unit cost. What B owes A once received.' })
  @Column({ name: 'total_value', type: 'decimal', precision: 14, scale: 4, default: '0.0000' })
  totalValue: string;

  @ApiPropertyOptional({ example: 'Slow at branch A, selling fast at B' })
  @Column({ type: 'varchar', nullable: true })
  note: string | null;

  @ApiPropertyOptional({ example: 'Wrong products sent' })
  @Column({ name: 'rejection_reason', type: 'varchar', nullable: true })
  rejectionReason: string | null;

  @ApiProperty()
  @Column({ name: 'sent_at', type: 'timestamp', default: () => 'now()' })
  sentAt: Date;

  @ApiPropertyOptional()
  @Column({ name: 'answered_at', type: 'timestamp', nullable: true })
  answeredAt: Date | null;

  @OneToMany(() => BranchTransferItem, (item) => item.transfer, { cascade: true })
  items: BranchTransferItem[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
