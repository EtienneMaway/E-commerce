import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('exchange_rates')
export class ExchangeRate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Tenancy: the business this rate belongs to. One row per organization, so
   * every branch of a business converts at the same rate (MULTI_SHOP_PLAN.md
   * §3.2 keeps rates above the branch — a franc is worth the same in both
   * shops, and a per-branch rate would make the same sale worth two amounts).
   *
   * NOT NULL and UNIQUE since migration 037. Before it the table held a single
   * global row shared by every account in the database, so one merchant
   * changing their rate silently moved everyone else's books.
   */
  @Column({ name: 'org_id', type: 'uuid' })
  orgId: string;

  /** FC per 1 USD — e.g. "2700.0000" means $1 = 2 700 FC */
  @Column({ type: 'decimal', precision: 14, scale: 4, name: 'usd_to_fc_rate' })
  usdToFcRate: string;

  /** Selling rate: FC per 1 USD used specifically for personal product entry in FC */
  @Column({ type: 'decimal', precision: 14, scale: 4, name: 'selling_rate', nullable: true, default: null })
  sellingRate: string | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
