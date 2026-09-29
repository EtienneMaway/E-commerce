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
import { StockCustody } from './stock-custody.entity';

/**
 * Someone the custodian has allowed to sell from their volume
 * (`SHOP_CUSTODY_PLAN.md` §3.4).
 *
 * **Not the same thing as {@link MiniTeamMember}**, despite the similar name.
 * That one is record-only — a name and a phone number written down after the
 * fact, referenced by nothing in the ledger. This one is a real app user whose
 * sales deduct real stock, which is why it is a `user_id` and not a `name`.
 *
 * The access rule it exists to enforce: at a branch with an OPEN custody, only
 * the custodian, an active member of this team, or the owner may sell from or
 * adjust custodian-stamped stock. Everyone else is refused. Unassigned lots
 * (`custodian_id IS NULL`) are unaffected and keep today's rules.
 *
 * Membership is ended by stamping `removed_at`, never by deleting the row — the
 * same instinct as a rejected sale. Who was on the team during a period that
 * has already been settled is part of that period's record.
 */
@Entity('custody_team_members')
@Index('idx_custody_team_members_custody', ['custodyId'])
@Index('idx_custody_team_members_user', ['userId'])
export class CustodyTeamMember {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Tenancy: MULTI_SHOP_PLAN.md §3.2. Always the custody's own branch. */
  @Column({ name: 'org_id', type: 'uuid' })
  orgId: string;

  @Column({ name: 'shop_id', type: 'uuid' })
  shopId: string;

  @Column({ name: 'custody_id', type: 'uuid' })
  custodyId: string;

  @ManyToOne(() => StockCustody, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'custody_id' })
  custody: StockCustody;

  /** The owner, a full employee, or a mini employee of the same business. */
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ApiPropertyOptional({ description: 'Custodian (or owner) who added this person' })
  @Column({ name: 'added_by_id', type: 'uuid', nullable: true })
  addedById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'added_by_id' })
  addedBy: User | null;

  @CreateDateColumn({ name: 'added_at' })
  addedAt: Date;

  /** Null while the member is active. Stamped rather than deleted — see the class note. */
  @ApiPropertyOptional()
  @Column({ name: 'removed_at', type: 'timestamp', nullable: true })
  removedAt: Date | null;
}
