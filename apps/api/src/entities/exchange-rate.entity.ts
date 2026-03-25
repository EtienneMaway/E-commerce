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

  /** FC per 1 USD — e.g. "2700.0000" means $1 = 2 700 FC */
  @Column({ type: 'decimal', precision: 14, scale: 4, name: 'usd_to_fc_rate' })
  usdToFcRate: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
