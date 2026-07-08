import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, In, Repository } from 'typeorm';
import Decimal from 'decimal.js';
import {
  ConsignmentItem,
  ConsignmentRequest,
  ConsignmentStatus,
  DebtorCredit,
  InventoryEntry,
  InventorySource,
  ProductGroup,
  ProductVariant,
  StockMovementReason,
  SupplierDebt,
  User,
} from '../entities';
import { CreateConsignmentDto } from './dto/create-consignment.dto';
import { StockMovementsService } from '../stock-movements/stock-movements.service';
import { PricingService } from '../pricing/pricing.service';
import { CurrencyService } from '../currency/currency.service';
import { ActorContext } from '../common/types/actor-context';

@Injectable()
export class ConsignmentsService {
  constructor(
    @InjectRepository(ConsignmentRequest)
    private readonly requestRepo: Repository<ConsignmentRequest>,
    @InjectRepository(ConsignmentItem)
    private readonly itemRepo: Repository<ConsignmentItem>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(InventoryEntry)
    private readonly entryRepo: Repository<InventoryEntry>,
    @InjectRepository(DebtorCredit)
    private readonly debtorCreditRepo: Repository<DebtorCredit>,
    @InjectRepository(ProductGroup)
    private readonly groupRepo: Repository<ProductGroup>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    private readonly dataSource: DataSource,
    private readonly stockMovements: StockMovementsService,
    private readonly pricingService: PricingService,
    private readonly currencyService: CurrencyService,
  ) {}

  /**
   * SUPPLIER + PERSONAL where-clause for an owner's sellable stock, matched by
   * size (variantId) when given, else by product name — mirrors
   * sales.service.fetchSellableLots.
   */
  private stockWhere(
    ownerId: string,
    key: { productName?: string; variantId?: string | null },
  ): Array<Record<string, unknown>> {
    const base = key.variantId
      ? { variantId: key.variantId }
      : { productName: ILike((key.productName ?? '').trim().toLowerCase()) };
    return [
      { ownerId, ...base, source: InventorySource.SUPPLIER },
      { ownerId, ...base, source: InventorySource.PERSONAL },
    ];
  }

  // ─── Supplier: create a consignment request ────────────────────────────────

  async create(ctx: ActorContext, dto: CreateConsignmentDto): Promise<ConsignmentRequest> {
    const supplierId = ctx.effectiveOwnerId;
    const actorId = ctx.actorId !== supplierId ? ctx.actorId : null;

    const debtor = await this.userRepo.findOne({ where: { id: dto.debtorUserId } });
    if (!debtor) throw new NotFoundException('Debtor user not found');
    if (debtor.id === supplierId) {
      throw new BadRequestException('You cannot consign goods to yourself');
    }

    // Soft-validate stock + apply pricing rule per item
    const itemEntities: ConsignmentItem[] = [];
    for (const dto_item of dto.items) {
      // Sized products: resolve the size and derive the (group) product name +
      // carton composition from it. Simple products stay name-keyed.
      let variant: ProductVariant | null = null;
      let group: ProductGroup | null = null;
      if (dto_item.variantId) {
        variant = await this.variantRepo.findOne({ where: { id: dto_item.variantId } });
        if (!variant) throw new NotFoundException('Size not found');
        group = await this.groupRepo.findOne({ where: { id: variant.groupId } });
      }
      const productName = (group?.name ?? dto_item.productName).trim().toLowerCase();
      const key = variant ? { variantId: variant.id } : { productName };

      const available = await this.countAvailableStock(supplierId, key);
      if (available < dto_item.quantity) {
        throw new BadRequestException(
          `Insufficient stock for "${productName}". Available: ${available}, requested: ${dto_item.quantity}`,
        );
      }

      const priceCheck = await this.pricingService.applyEmployeePriceRule({
        ctx,
        productName,
        submittedUnitPrice: dto_item.agreedUnitPrice,
        discountReason: dto_item.discountReason,
        // Sized products enforce the size's own standard price (null for the
        // owner, whose action always passes through).
        standardPrice: variant ? variant.sellingPrice : undefined,
      });

      const stockEntries = await this.getStockEntriesSorted(supplierId, key);
      const unitCost = stockEntries[0]?.unitCost ?? priceCheck.effectiveUnitPrice;
      const piecesPerCarton = variant
        ? variant.piecesPerCarton
        : stockEntries[0]?.piecesPerCarton ?? null;

      itemEntities.push(
        this.itemRepo.create({
          productName,
          variantId: variant?.id ?? null,
          groupId: variant?.groupId ?? null,
          quantity: dto_item.quantity,
          agreedUnitPrice: priceCheck.effectiveUnitPrice,
          unitCost,
          actorId,
          originalUnitPrice: priceCheck.originalUnitPrice,
          discountReason: priceCheck.originalUnitPrice ? dto_item.discountReason ?? null : null,
          piecesPerCarton,
        }),
      );
    }

    // Lock the FC/USD rate at give-time. Carried onto the recipient's
    // CONSIGNED_IN lot at confirm and every sale from it, so a mini employee's
    // agreement (what they owe) never shifts when the system rate later changes.
    const rateRow = await this.currencyService.getRate();
    const usdToFcRateSnapshot = rateRow?.usdToFcRate ?? null;

    const request = this.requestRepo.create({
      supplierId,
      debtorId: dto.debtorUserId,
      status: ConsignmentStatus.PENDING,
      note: dto.note ?? null,
      usdToFcRateSnapshot,
      items: itemEntities,
    });

    return this.requestRepo.save(request);
  }

  // ─── Debtor: view incoming consignments ────────────────────────────────────

  async findIncoming(ctx: ActorContext): Promise<ConsignmentRequest[]> {
    const requests = await this.requestRepo.find({
      where: { debtorId: ctx.effectiveOwnerId },
      relations: { supplier: true, items: { actor: true } },
      order: { createdAt: 'DESC' },
    });
    await this.attachVariantLabels(requests);
    return requests;
  }

  // ─── Supplier: view outgoing consignments ──────────────────────────────────

  async findOutgoing(ctx: ActorContext): Promise<ConsignmentRequest[]> {
    const requests = await this.requestRepo.find({
      where: { supplierId: ctx.effectiveOwnerId },
      relations: { debtor: true, items: { actor: true } },
      order: { createdAt: 'DESC' },
    });
    await this.attachVariantLabels(requests);
    return requests;
  }

  /** Resolve each sized item's size label (transient, for display). */
  private async attachVariantLabels(requests: ConsignmentRequest[]): Promise<void> {
    const ids = [
      ...new Set(
        requests.flatMap((r) =>
          (r.items ?? []).map((i) => i.variantId).filter((v): v is string => !!v),
        ),
      ),
    ];
    if (ids.length === 0) return;
    const variants = await this.variantRepo.find({ where: { id: In(ids) } });
    const labels = new Map(variants.map((v) => [v.id, v.label]));
    for (const r of requests) {
      for (const it of r.items ?? []) {
        if (it.variantId) it.variantLabel = labels.get(it.variantId) ?? null;
      }
    }
  }

  // ─── Debtor: confirm reception (atomic) ───────────────────────────────────

  async confirm(ctx: ActorContext, requestId: string): Promise<ConsignmentRequest> {
    const debtorId = ctx.effectiveOwnerId;
    const actorId = ctx.actorId !== debtorId ? ctx.actorId : null;

    const request = await this.requestRepo.findOne({
      where: { id: requestId },
      relations: { items: true },
    });

    if (!request) throw new NotFoundException('Consignment request not found');
    if (request.debtorId !== debtorId) throw new ForbiddenException('This consignment is not addressed to you');
    if (request.status !== ConsignmentStatus.PENDING) {
      throw new BadRequestException(`Cannot confirm a consignment with status: ${request.status}`);
    }

    return this.dataSource.transaction(async (manager) => {
      for (const item of request.items) {
        const stockEntries = await manager.find(InventoryEntry, {
          where: this.stockWhere(request.supplierId, {
            productName: item.productName,
            variantId: item.variantId,
          }),
          order: { createdAt: 'ASC' },
        });

        const sorted = [
          ...stockEntries.filter((e) => e.source === InventorySource.SUPPLIER),
          ...stockEntries.filter((e) => e.source === InventorySource.PERSONAL),
        ].filter((e) => e.quantityRemaining > 0);

        const totalAvailable = sorted.reduce((sum, e) => sum + e.quantityRemaining, 0);
        if (totalAvailable < item.quantity) {
          throw new BadRequestException(
            `Insufficient stock for "${item.productName}". Available: ${totalAvailable}, requested: ${item.quantity}`,
          );
        }

        let remaining = item.quantity;
        for (const entry of sorted) {
          if (remaining === 0) break;
          const deduct = Math.min(entry.quantityRemaining, remaining);
          const qtyBeforeDeduct = entry.quantityRemaining;
          entry.quantityRemaining -= deduct;
          remaining -= deduct;
          await manager.save(InventoryEntry, entry);

          await this.stockMovements.record(manager, {
            ownerId: request.supplierId,
            entry,
            reason: StockMovementReason.CONSIGN_OUT,
            qty: deduct,
            qtyBefore: qtyBeforeDeduct,
            consignmentRequestId: request.id,
          });
        }

        const creditValue = new Decimal(item.agreedUnitPrice).mul(item.quantity).toFixed(4);

        let credit = await manager.findOne(DebtorCredit, {
          where: { ownerId: request.supplierId, debtorUserId: request.debtorId },
        });

        if (!credit) {
          credit = manager.create(DebtorCredit, {
            ownerId: request.supplierId,
            debtorUserId: request.debtorId,
            totalCreditGiven: creditValue,
            totalReceived: '0.0000',
            outstandingBalance: creditValue,
          });
        } else {
          credit.totalCreditGiven = new Decimal(credit.totalCreditGiven).plus(creditValue).toFixed(4);
          credit.outstandingBalance = new Decimal(credit.outstandingBalance).plus(creditValue).toFixed(4);
        }
        const savedCredit = await manager.save(DebtorCredit, credit);

        let debt = await manager.findOne(SupplierDebt, {
          where: { ownerId: request.debtorId, supplierUserId: request.supplierId },
        });
        if (!debt) {
          debt = manager.create(SupplierDebt, {
            ownerId: request.debtorId,
            supplierUserId: request.supplierId,
            totalCreditReceived: creditValue,
            totalPaid: '0.0000',
            outstandingBalance: creditValue,
          });
        } else {
          debt.totalCreditReceived = new Decimal(debt.totalCreditReceived).plus(creditValue).toFixed(4);
          debt.outstandingBalance  = new Decimal(debt.outstandingBalance).plus(creditValue).toFixed(4);
        }
        const savedDebt = await manager.save(SupplierDebt, debt);

        // Supplier-side CONSIGNED_OUT entry — the request item already records
        // who triggered this on the supplier side via item.actorId.
        const supplierEntry = manager.create(InventoryEntry, {
          ownerId: request.supplierId,
          source: InventorySource.CONSIGNED_OUT,
          productName: item.productName,
          groupId: item.groupId,
          variantId: item.variantId,
          unitCost: item.unitCost,
          sellingPrice: item.agreedUnitPrice,
          category: null,
          quantityOriginal: item.quantity,
          quantityRemaining: item.quantity,
          piecesPerCarton: item.piecesPerCarton,
          // Same locked rate as the recipient's lot — lets the owner's dashboard
          // show what was given at the rate of that batch, in USD and FC.
          usdToFcRateSnapshot: request.usdToFcRateSnapshot,
          debtorUserId: request.debtorId,
          debtorCreditId: savedCredit.id,
          actorId: null,
        });
        await manager.save(InventoryEntry, supplierEntry);

        // Debtor-side CONSIGNED_IN entry — actor is whoever confirmed. Carries
        // the consignment's locked rate so a mini recipient converts this lot's
        // USD figures to FC at the give-time rate, not the live one.
        const debtorEntry = manager.create(InventoryEntry, {
          ownerId: request.debtorId,
          source: InventorySource.CONSIGNED_IN,
          productName: item.productName,
          groupId: item.groupId,
          variantId: item.variantId,
          unitCost: item.agreedUnitPrice,
          sellingPrice: item.agreedUnitPrice,
          category: null,
          quantityOriginal: item.quantity,
          quantityRemaining: item.quantity,
          piecesPerCarton: item.piecesPerCarton,
          usdToFcRateSnapshot: request.usdToFcRateSnapshot,
          supplierUserId: request.supplierId,
          supplierDebtId: savedDebt.id,
          actorId,
        });
        await manager.save(InventoryEntry, debtorEntry);
      }

      request.status = ConsignmentStatus.ACCEPTED;
      request.confirmedAt = new Date();
      return manager.save(ConsignmentRequest, request);
    });
  }

  // ─── Debtor: reject consignment ────────────────────────────────────────────

  async reject(ctx: ActorContext, requestId: string): Promise<ConsignmentRequest> {
    const request = await this.requestRepo.findOne({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Consignment request not found');
    if (request.debtorId !== ctx.effectiveOwnerId) {
      throw new ForbiddenException('This consignment is not addressed to you');
    }
    if (request.status !== ConsignmentStatus.PENDING) {
      throw new BadRequestException(`Cannot reject a consignment with status: ${request.status}`);
    }

    request.status = ConsignmentStatus.REJECTED;
    return this.requestRepo.save(request);
  }

  // ─── Supplier: cancel pending consignment ──────────────────────────────────

  async cancel(ctx: ActorContext, requestId: string): Promise<ConsignmentRequest> {
    const request = await this.requestRepo.findOne({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Consignment request not found');
    if (request.supplierId !== ctx.effectiveOwnerId) {
      throw new ForbiddenException('You did not send this consignment');
    }
    if (request.status !== ConsignmentStatus.PENDING) {
      throw new BadRequestException(`Cannot cancel a consignment with status: ${request.status}`);
    }

    request.status = ConsignmentStatus.CANCELLED;
    return this.requestRepo.save(request);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  async countAvailableStock(
    ownerId: string,
    key: { productName?: string; variantId?: string | null },
  ): Promise<number> {
    const entries = await this.entryRepo.find({ where: this.stockWhere(ownerId, key) });
    return entries.reduce((sum, e) => sum + e.quantityRemaining, 0);
  }

  private async getStockEntriesSorted(
    ownerId: string,
    key: { productName?: string; variantId?: string | null },
  ): Promise<InventoryEntry[]> {
    const entries = await this.entryRepo.find({
      where: this.stockWhere(ownerId, key),
      order: { createdAt: 'ASC' },
    });
    return [
      ...entries.filter((e) => e.source === InventorySource.SUPPLIER),
      ...entries.filter((e) => e.source === InventorySource.PERSONAL),
    ].filter((e) => e.quantityRemaining > 0);
  }

  async countPendingIncoming(debtorId: string): Promise<number> {
    return this.requestRepo.count({
      where: { debtorId, status: ConsignmentStatus.PENDING },
    });
  }
}
