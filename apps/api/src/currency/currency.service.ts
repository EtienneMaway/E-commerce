import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Decimal from 'decimal.js';
import { ExchangeRate } from '../entities/exchange-rate.entity';
import { SetRateDto } from './dto/set-rate.dto';

@Injectable()
export class CurrencyService {
  constructor(
    @InjectRepository(ExchangeRate)
    private readonly rateRepo: Repository<ExchangeRate>,
  ) {}

  /**
   * In-process cache of the single exchange-rate row.
   *
   * `exchange_rates` holds exactly one row that an admin changes at most a few
   * times a day, yet getRate() sits on hot paths — dashboard.getAlerts,
   * miniStats, handoverPreview — so every dashboard load paid a query for it.
   *
   * Correctness note: this is safe to cache ONLY because setRate() below is the
   * single writer and invalidates it. If a second writer ever appears, or the
   * API is scaled to multiple processes, this must become a shared cache or the
   * TTL must be the only guarantee — with multiple processes a stale rate could
   * survive up to CACHE_TTL_MS after an admin change. The TTL is deliberately
   * short so that worst case stays small.
   */
  private cached: { value: ExchangeRate | null; expiresAt: number } | null = null;
  private static readonly CACHE_TTL_MS = 60_000;

  async getRate(): Promise<ExchangeRate | null> {
    const now = Date.now();
    if (this.cached && this.cached.expiresAt > now) {
      return this.cached.value;
    }
    const [rate] = await this.rateRepo.find({ take: 1 });
    const value = rate ?? null;
    this.cached = { value, expiresAt: now + CurrencyService.CACHE_TTL_MS };
    return value;
  }

  /** Drop the cache so the next read reflects a just-written rate. */
  private invalidate(): void {
    this.cached = null;
  }

  async setRate(dto: SetRateDto): Promise<ExchangeRate> {
    const rate = new Decimal(dto.usdToFcRate);
    if (rate.lte(0)) {
      throw new BadRequestException('Exchange rate must be greater than zero');
    }

    const [existing] = await this.rateRepo.find({ take: 1 });

    if (dto.sellingRate !== undefined) {
      const selling = new Decimal(dto.sellingRate);
      if (selling.lte(0)) {
        throw new BadRequestException('Selling rate must be greater than zero');
      }
    }

    if (existing) {
      existing.usdToFcRate = rate.toFixed(4);
      if (dto.sellingRate !== undefined) {
        existing.sellingRate = new Decimal(dto.sellingRate).toFixed(4);
      }
      const saved = await this.rateRepo.save(existing);
      this.invalidate();
      return saved;
    }

    const record = this.rateRepo.create({
      usdToFcRate: rate.toFixed(4),
      sellingRate: dto.sellingRate ? new Decimal(dto.sellingRate).toFixed(4) : null,
    });
    const saved = await this.rateRepo.save(record);
    this.invalidate();
    return saved;
  }
}
