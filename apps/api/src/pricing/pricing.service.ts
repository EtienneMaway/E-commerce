import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Decimal from 'decimal.js';
import { ProductPrice } from '../entities';
import { ActorContext } from '../common/types/actor-context';

export interface PriceCheckResult {
  /** The price the action will actually be recorded at (after capping). */
  effectiveUnitPrice: string;
  /** Owner's standard price at decision time, if one is set. */
  standardPrice: string | null;
  /** True when submittedPrice was clamped down to standardPrice. */
  capped: boolean;
  /** Set when the action was a discount and a reason is required (employee only). */
  originalUnitPrice: string | null;
}

@Injectable()
export class PricingService {
  constructor(
    @InjectRepository(ProductPrice)
    private readonly repo: Repository<ProductPrice>,
  ) {}

  // ─── Standard-price lookup used by sales / consignments / external-give ───

  async getStandardPrice(ownerId: string, productName: string): Promise<string | null> {
    const row = await this.repo.findOne({
      where: { ownerId, productName: productName.trim().toLowerCase() },
    });
    return row ? row.unitPrice : null;
  }

  /**
   * Apply the employee pricing rule on an outgoing-product action.
   *
   * - Owner-performed action: pass through, never cap, never require reason.
   * - Employee submits > standard: cap silently to standard.
   * - Employee submits < standard: require discountReason; capture original.
   * - No standard set: pass through (employer hasn't enforced a price for this product).
   *
   * Throws UnprocessableEntityException when an employee attempts to discount without a reason.
   */
  async applyEmployeePriceRule(args: {
    ctx: ActorContext;
    productName: string;
    submittedUnitPrice: string;
    discountReason: string | null | undefined;
  }): Promise<PriceCheckResult> {
    const submitted = new Decimal(args.submittedUnitPrice);
    const standard = await this.getStandardPrice(args.ctx.effectiveOwnerId, args.productName);

    // Owner action: no cap, no reason required.
    if (args.ctx.tier === 'OWNER') {
      return {
        effectiveUnitPrice: submitted.toFixed(2),
        standardPrice: standard,
        capped: false,
        originalUnitPrice: null,
      };
    }

    if (!standard) {
      // No standard set by owner — let it pass.
      return {
        effectiveUnitPrice: submitted.toFixed(2),
        standardPrice: null,
        capped: false,
        originalUnitPrice: null,
      };
    }

    const standardDec = new Decimal(standard);

    if (submitted.gt(standardDec)) {
      // Cap silently to standard.
      return {
        effectiveUnitPrice: standardDec.toFixed(2),
        standardPrice: standard,
        capped: true,
        originalUnitPrice: null,
      };
    }

    if (submitted.lt(standardDec)) {
      // Discount — reason required.
      const reason = (args.discountReason ?? '').trim();
      if (!reason) {
        throw new UnprocessableEntityException({
          error: 'DISCOUNT_REASON_REQUIRED',
          standardPrice: standardDec.toFixed(2),
          submittedPrice: submitted.toFixed(2),
          message: `Selling below standard price (${standardDec.toFixed(2)}) requires a discountReason.`,
        });
      }
      return {
        effectiveUnitPrice: submitted.toFixed(2),
        standardPrice: standard,
        capped: false,
        originalUnitPrice: standardDec.toFixed(2),
      };
    }

    // Equal — passthrough.
    return {
      effectiveUnitPrice: submitted.toFixed(2),
      standardPrice: standard,
      capped: false,
      originalUnitPrice: null,
    };
  }

  // ─── CRUD (Phase 6) ──────────────────────────────────────────────────────

  async list(ownerId: string): Promise<ProductPrice[]> {
    return this.repo.find({
      where: { ownerId },
      order: { productName: 'ASC' },
    });
  }

  async upsert(ownerId: string, productName: string, unitPrice: string): Promise<ProductPrice> {
    const normalized = productName.trim().toLowerCase();
    if (new Decimal(unitPrice).lte(0)) {
      throw new ConflictException('Unit price must be greater than zero');
    }
    const existing = await this.repo.findOne({ where: { ownerId, productName: normalized } });
    if (existing) {
      existing.unitPrice = new Decimal(unitPrice).toFixed(2);
      return this.repo.save(existing);
    }
    const created = this.repo.create({
      ownerId,
      productName: normalized,
      unitPrice: new Decimal(unitPrice).toFixed(2),
    });
    return this.repo.save(created);
  }

  async update(ownerId: string, id: string, unitPrice: string): Promise<ProductPrice> {
    const row = await this.repo.findOne({ where: { id, ownerId } });
    if (!row) throw new NotFoundException('Product price not found');
    if (new Decimal(unitPrice).lte(0)) {
      throw new ConflictException('Unit price must be greater than zero');
    }
    row.unitPrice = new Decimal(unitPrice).toFixed(2);
    return this.repo.save(row);
  }

  async remove(ownerId: string, id: string): Promise<void> {
    const row = await this.repo.findOne({ where: { id, ownerId } });
    if (!row) throw new NotFoundException('Product price not found');
    await this.repo.remove(row);
  }
}
