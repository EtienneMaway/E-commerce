import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from './user.entity';
import { MiniSettlement } from './mini-settlement.entity';

/**
 * Someone who was out selling with a mini-employee during the cycle an approved
 * handover closes. Owner-side bookkeeping: the rows are materialised when the
 * handover is approved (from the team attached to that cycle's consignments),
 * and the owner can keep adding or removing people on the dashboard afterwards —
 * who was along is often only established once the goods are back.
 *
 * Record-only — these are people off the books, not app users, and nothing in
 * the ledger references them.
 */
@Entity('mini_team_members')
@Index('idx_mini_team_members_mini', ['miniId'])
export class MiniTeamMember {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'mini_id', type: 'uuid' })
  miniId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'mini_id' })
  mini: User;

  /** Employer the mini is holding goods for — who ends up seeing this record. */
  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId: string;

  @ApiProperty({ example: 'Jean Kabila' })
  @Column({ type: 'varchar', length: 120 })
  name: string;

  @ApiPropertyOptional({ example: '+243 990 000 000' })
  @Column({ type: 'varchar', length: 40, nullable: true })
  phone: string | null;

  /**
   * The approved handover this person is recorded against. Nullable in the
   * schema (the column pre-dates this shape) but always set in practice — a
   * teammate only exists as part of a settled cycle's record.
   */
  @Column({ name: 'settlement_id', type: 'uuid', nullable: true })
  settlementId: string | null;

  @ManyToOne(() => MiniSettlement, (s) => s.team, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'settlement_id' })
  settlement: MiniSettlement | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
