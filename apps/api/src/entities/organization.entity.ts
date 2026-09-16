import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from './user.entity';
import { Shop } from './shop.entity';

/**
 * The business. One account = one organization at registration, but the two are
 * deliberately separate rows.
 *
 * A `User` is a login and a person; an `Organization` is the thing that owns
 * books, employs people and will one day carry a subscription. Collapsing them
 * — which is what `owner_id` did — makes an ownership transfer a nineteen-table
 * rewrite, and makes `DELETE /users/me` capable of orphaning a live business.
 * See MULTI_SHOP_PLAN.md §3.10.
 *
 * The merchant never sees this word: it is labelled "Business" / "Entreprise"
 * in both apps.
 */
@Entity('organizations')
export class Organization {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** The account that administers the business. Changes on transfer (§3.12). */
  @Column({ name: 'owner_user_id', type: 'uuid' })
  ownerUserId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'owner_user_id' })
  ownerUser: User;

  /**
   * Nominee of a proposed ownership transfer, until they accept or reject.
   * An organization carries debts and payroll, so it is never pushed onto
   * someone without their consent.
   */
  @Column({ name: 'pending_owner_user_id', type: 'uuid', nullable: true })
  pendingOwnerUserId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'pending_owner_user_id' })
  pendingOwnerUser: User | null;

  @ApiProperty({ example: 'Amina Trading', description: 'Shown on receipts at every branch.' })
  @Column({ type: 'varchar' })
  name: string;

  @ApiPropertyOptional({ example: 'A1234567B' })
  @Column({ name: 'tax_id', type: 'varchar', nullable: true })
  taxId: string | null;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/logo.png' })
  @Column({ name: 'logo_url', type: 'varchar', nullable: true })
  logoUrl: string | null;

  @OneToMany(() => Shop, (shop) => shop.organization)
  shops: Shop[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
