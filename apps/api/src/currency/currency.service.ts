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
   * In-process cache of each business's exchange-rate row, keyed by `org_id`.
   *
   * A business holds exactly one row that its owner changes at most a few times
   * a day, yet getRate() sits on hot paths — dashboard.getAlerts, miniStats,
   * handoverPreview — so every dashboard load would otherwise pay a query.
   *
   * Correctness note: this is safe to cache ONLY because setRate() below is the
   * single writer and invalidates the entry it wrote. If a second writer ever
   * appears, or the API is scaled to multiple processes, this must become a
   * shared cache or the TTL must be the only guarantee — with multiple
   * processes a stale rate could survive up to CACHE_TTL_MS after a change. The
   * TTL is deliberately short so that worst case stays small.
   *
   * Keyed per business since migration 037: before it, one global row (and one
   * cache slot) served every account in the database.
   */
  private readonly cached = new Map<string, { value: ExchangeRate | null; expiresAt: number }>();
  private static readonly CACHE_TTL_MS = 60_000;

  /**
   * The rate for one business. `orgId` comes from `ActorContext.orgId`, which
   * the guard resolves per request — an employee therefore reads their
   * employer's rate, which is what their FC figures must be converted at.
   */
  async getRate(orgId: string): Promise<ExchangeRate | null> {
    const now = Date.now();
    const hit = this.cached.get(orgId);
    if (hit && hit.expiresAt > now) {
      return hit.value;
    }
    const value = (await this.rateRepo.findOne({ where: { orgId } })) ?? null;
    this.cached.set(orgId, { value, expiresAt: now + CurrencyService.CACHE_TTL_MS });
    return value;
  }

  /** Drop one business's cache so its next read reflects a just-written rate. */
  private invalidate(orgId: string): void {
    this.cached.delete(orgId);
  }

  async setRate(orgId: string, dto: SetRateDto): Promise<ExchangeRate> {
    const rate = new Decimal(dto.usdToFcRate);
    if (rate.lte(0)) {
      throw new BadRequestException('Exchange rate must be greater than zero');
    }

    const existing = await this.rateRepo.findOne({ where: { orgId } });

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
      this.invalidate(orgId);
      return saved;
    }

    const record = this.rateRepo.create({
      orgId,
      usdToFcRate: rate.toFixed(4),
      sellingRate: dto.sellingRate ? new Decimal(dto.sellingRate).toFixed(4) : null,
    });
    const saved = await this.rateRepo.save(record);
    this.invalidate(orgId);
    return saved;
  }
}
