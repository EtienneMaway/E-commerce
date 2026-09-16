import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Organization } from './organization.entity';
import { User } from './user.entity';

/**
 * Append-only record of who owned a business, and when.
 *
 * It is the one fact that cannot be reconstructed afterwards: `actor_id` on a
 * row tells you who *did* a thing, never who was responsible for the business
 * when they did it. "Owned by X from Jan 2024 to Mar 2026" is what a buyer, an
 * auditor or a dispute asks for. See MULTI_SHOP_PLAN.md §3.12.
 */
@Entity('organization_ownership_history')
export class OrganizationOwnershipHistory {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'org_id', type: 'uuid' })
  orgId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'org_id' })
  organization: Organization;

  /** Null on the founding row — nobody held it before. */
  @Column({ name: 'from_user_id', type: 'uuid', nullable: true })
  fromUserId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'from_user_id' })
  fromUser: User | null;

  @Column({ name: 'to_user_id', type: 'uuid' })
  toUserId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'to_user_id' })
  toUser: User;

  @ApiPropertyOptional({ example: 'Sold to family' })
  @Column({ type: 'varchar', nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'transferred_at' })
  transferredAt: Date;
}
