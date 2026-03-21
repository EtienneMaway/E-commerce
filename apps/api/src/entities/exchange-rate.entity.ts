import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('exchange_rates')
export class ExchangeRate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'owner_id' })
  ownerId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  /** FC per 1 USD — e.g. "2700.0000" means $1 = 2 700 FC */
  @Column({ type: 'decimal', precision: 14, scale: 4, name: 'usd_to_fc_rate' })
  usdToFcRate: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
