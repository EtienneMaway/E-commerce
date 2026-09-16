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
import { readScope, writeScope } from '../common/shop-scope';

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

  /**
   * The standard price at **this branch**. Prices are per-shop, so branch A can
   * sell rice at one price and branch B at another — which is the whole reason
   * `UQ_product_prices_owner_product` gains `shop_id` in migration 033.
   */
  async getStandardPrice(
    ctx: ActorContext,
    productName: string,
  ): Promise<string | null> {
    const row = await this.repo.findOne({
      where: { ...readScope(ctx), productName: productName.trim().toLowerCase() },
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
    /**
     * Explicit standard price to enforce, bypassing the name-based
     * ProductPrice lookup. Used by sized products, whose standard is the
     * variant's / group's own price (pass `null` to mean "no standard set",
     * e.g. for a mini selling consigned stock where markup is theirs to keep).
     */
    standardPrice?: string | null;
  }): Promise<PriceCheckResult> {
    const submitted = new Decimal(args.submittedUnitPrice);
    const standard =
      args.standardPrice !== undefined
        ? args.standardPrice
        : await this.getStandardPrice(args.ctx, args.productName);

    // Owner action: no cap, no reason required.
    if (args.ctx.tier === 'OWNER') {
      return {
        effectiveUnitPrice: submitted.toFixed(4),
        standardPrice: standard,
        capped: false,
        originalUnitPrice: null,
      };
    }

    if (!standard) {
      // No standard set by owner — let it pass.
      return {
        effectiveUnitPrice: submitted.toFixed(4),
        standardPrice: null,
        capped: false,
        originalUnitPrice: null,
      };
    }

    const standardDec = new Decimal(standard);

    if (submitted.gt(standardDec)) {
      // Cap silently to standard.
      return {
        effectiveUnitPrice: standardDec.toFixed(4),
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
          standardPrice: standardDec.toFixed(4),
          submittedPrice: submitted.toFixed(4),
          message: `Selling below standard price (${standardDec.toFixed(4)}) requires a discountReason.`,
        });
      }
      return {
        effectiveUnitPrice: submitted.toFixed(4),
        standardPrice: standard,
        capped: false,
        originalUnitPrice: standardDec.toFixed(4),
      };
    }

    // Equal — passthrough.
    return {
      effectiveUnitPrice: submitted.toFixed(4),
      standardPrice: standard,
      capped: false,
      originalUnitPrice: null,
    };
  }

  // ─── CRUD (Phase 6) ──────────────────────────────────────────────────────

  async list(ctx: ActorContext): Promise<ProductPrice[]> {
    return this.repo.find({
      where: readScope(ctx),
      order: { productName: 'ASC' },
    });
  }

  async upsert(
    ctx: ActorContext,
    productName: string,
    unitPrice: string,
  ): Promise<ProductPrice> {
    const normalized = productName.trim().toLowerCase();
    if (new Decimal(unitPrice).lte(0)) {
      throw new ConflictException('Unit price must be greater than zero');
    }
    const existing = await this.repo.findOne({
      where: { ...readScope(ctx), productName: normalized },
    });
    if (existing) {
      existing.unitPrice = new Decimal(unitPrice).toFixed(4);
      return this.repo.save(existing);
    }
    const created = this.repo.create({
      ...writeScope(ctx),
      productName: normalized,
      unitPrice: new Decimal(unitPrice).toFixed(4),
    });
    return this.repo.save(created);
  }

  async update(
    ctx: ActorContext,
    id: string,
    unitPrice: string,
  ): Promise<ProductPrice> {
    const row = await this.repo.findOne({ where: { id, ...readScope(ctx) } });
    if (!row) throw new NotFoundException('Product price not found');
    if (new Decimal(unitPrice).lte(0)) {
      throw new ConflictException('Unit price must be greater than zero');
    }
    row.unitPrice = new Decimal(unitPrice).toFixed(4);
    return this.repo.save(row);
  }

  async remove(ctx: ActorContext, id: string): Promise<void> {
    const row = await this.repo.findOne({ where: { id, ...readScope(ctx) } });
    if (!row) throw new NotFoundException('Product price not found');
    await this.repo.remove(row);
  }
}
