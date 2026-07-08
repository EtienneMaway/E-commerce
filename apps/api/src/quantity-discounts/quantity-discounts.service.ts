import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Decimal from 'decimal.js';
import { QuantityDiscount } from '../entities';
import { UpdateQuantityDiscountDto } from './dto/update-quantity-discount.dto';

/** Shape returned to clients — the config with money as fixed-2dp strings. */
export interface QuantityDiscountConfig {
  enabled: boolean;
  halfDozenPercent: string;
  dozenPercent: string;
  cartonPercent: string;
  updatedAt: Date | null;
}

@Injectable()
export class QuantityDiscountsService {
  constructor(
    @InjectRepository(QuantityDiscount)
    private readonly repo: Repository<QuantityDiscount>,
  ) {}

  /**
   * The shop's quantity-discount config, or a disabled zeroed default when the
   * owner has never configured one. Never returns null so clients always have
   * tiers to compute against.
   */
  async get(ownerId: string): Promise<QuantityDiscountConfig> {
    const row = await this.repo.findOne({ where: { ownerId } });
    if (!row) {
      return {
        enabled: false,
        halfDozenPercent: '0.00',
        dozenPercent: '0.00',
        cartonPercent: '0.00',
        updatedAt: null,
      };
    }
    return this.toConfig(row);
  }

  /** Create or update the owner's single config row. */
  async upsert(
    ownerId: string,
    dto: UpdateQuantityDiscountDto,
  ): Promise<QuantityDiscountConfig> {
    const existing = await this.repo.findOne({ where: { ownerId } });
    const record = existing ?? this.repo.create({ ownerId });

    record.enabled = dto.enabled;
    record.halfDozenPercent = new Decimal(dto.halfDozenPercent).toFixed(2);
    record.dozenPercent = new Decimal(dto.dozenPercent).toFixed(2);
    record.cartonPercent = new Decimal(dto.cartonPercent).toFixed(2);

    const saved = await this.repo.save(record);
    return this.toConfig(saved);
  }

  private toConfig(row: QuantityDiscount): QuantityDiscountConfig {
    return {
      enabled: row.enabled,
      halfDozenPercent: new Decimal(row.halfDozenPercent).toFixed(2),
      dozenPercent: new Decimal(row.dozenPercent).toFixed(2),
      cartonPercent: new Decimal(row.cartonPercent).toFixed(2),
      updatedAt: row.updatedAt ?? null,
    };
  }
}
