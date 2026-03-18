import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import Decimal from 'decimal.js';
import {
  ConsignmentRequest,
  ConsignmentStatus,
  DebtorCredit,
  InventoryEntry,
  InventorySource,
  Payment,
  PaymentStatus,
  SaleTransaction,
  SupplierDebt,
  User,
} from '../entities';
import { LOW_STOCK_THRESHOLD, OVERDUE_DAYS } from '../common/constants';
import { ConsignmentsService } from '../consignments/consignments.service';

export interface DashboardSummary {
  totalIOwe: string;
  totalOwedToMe: string;
  netPosition: string;
  totalProfitAllTime: string;
}

export interface SupplierListItem {
  supplierUserId: string;
  supplierUsername: string;
  outstandingBalance: string;
  totalCreditReceived: string;
  totalPaid: string;
  createdAt: Date;
}

export interface SupplierDetailView {
  supplierUserId: string;
  supplierUsername: string;
  debt: SupplierDebt;
  productsReceived: InventoryEntry[];
  totalValueSold: string;
  payments: Payment[];
}

export interface DebtorListItem {
  debtorUserId: string;
  debtorUsername: string;
  outstandingBalance: string;
  totalCreditGiven: string;
  totalReceived: string;
  createdAt: Date;
}

export interface DebtorDetailView {
  debtorUserId: string;
  debtorUsername: string;
  credit: DebtorCredit;
  productsConsigned: InventoryEntry[];
  payments: Payment[];   // all statuses (PENDING + APPROVED), unified view
}

export interface ProfitByProduct {
  productName: string;
  totalProfit: string;
  totalQtySold: number;
}

export interface AlertItem {
  type: 'overdue_debtor' | 'low_stock' | 'pending_consignment';
  // overdue_debtor fields
  debtorUserId?: string;
  debtorUsername?: string;
  outstandingBalance?: string;
  daysSinceActivity?: number;
  // low_stock fields
  productName?: string;
  quantityRemaining?: number;
  source?: string;
  // pending_consignment fields
  pendingCount?: number;
}

export interface ProfitBySource {
  source: string;
  supplierUserId: string | null;
  supplierUsername: string | null;
  totalProfit: string;
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(SupplierDebt)
    private readonly supplierDebtRepo: Repository<SupplierDebt>,
    @InjectRepository(DebtorCredit)
    private readonly debtorCreditRepo: Repository<DebtorCredit>,
    @InjectRepository(SaleTransaction)
    private readonly saleRepo: Repository<SaleTransaction>,
    @InjectRepository(InventoryEntry)
    private readonly entryRepo: Repository<InventoryEntry>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(ConsignmentRequest)
    private readonly consignmentRequestRepo: Repository<ConsignmentRequest>,
    private readonly consignmentsService: ConsignmentsService,
  ) {}

  /**
   * Computes realized consignment profit for an owner across all debtor relationships.
   *
   * Formula per debtor:
   *   realizedProfit = (totalReceived / totalCreditGiven) × totalPotentialProfit
   * where:
   *   totalPotentialProfit = Σ (agreedUnitPrice − unitCost) × qty  (all ACCEPTED items)
   *   totalCreditGiven     = Σ agreedUnitPrice × qty               (= DebtorCredit.totalCreditGiven)
   *
   * Returns the total realized profit and a per-product breakdown.
   */
  private async computeConsignmentProfits(ownerId: string): Promise<{
    total: Decimal;
    byProduct: Map<string, Decimal>;
  }> {
    const credits = await this.debtorCreditRepo.find({ where: { ownerId } });
    if (credits.length === 0) {
      return { total: new Decimal(0), byProduct: new Map() };
    }

    // All ACCEPTED consignment requests sent by this owner as supplier
    const requests = await this.consignmentRequestRepo.find({
      where: { supplierId: ownerId, status: ConsignmentStatus.ACCEPTED },
      relations: { items: true },
    });
    if (requests.length === 0) {
      return { total: new Decimal(0), byProduct: new Map() };
    }

    // Aggregate potential profit and total credit per (debtorId, productName)
    type ItemStats = { potential: Decimal; creditFromItems: Decimal };
    const debtorProductMap = new Map<string, Map<string, ItemStats>>();

    for (const req of requests) {
      if (!debtorProductMap.has(req.debtorId)) {
        debtorProductMap.set(req.debtorId, new Map());
      }
      const productMap = debtorProductMap.get(req.debtorId)!;

      for (const item of req.items) {
        const margin = new Decimal(item.agreedUnitPrice).minus(item.unitCost).mul(item.quantity);
        const credit = new Decimal(item.agreedUnitPrice).mul(item.quantity);

        const existing = productMap.get(item.productName) ?? {
          potential: new Decimal(0),
          creditFromItems: new Decimal(0),
        };
        productMap.set(item.productName, {
          potential: existing.potential.plus(margin),
          creditFromItems: existing.creditFromItems.plus(credit),
        });
      }
    }

    // Apply the payment ratio per debtor to realize profits proportionally
    let total = new Decimal(0);
    const byProduct = new Map<string, Decimal>();

    for (const credit of credits) {
      const totalCreditGiven = new Decimal(credit.totalCreditGiven);
      if (totalCreditGiven.lte(0)) continue;

      const totalReceived = new Decimal(credit.totalReceived);
      if (totalReceived.lte(0)) continue;

      const ratio = Decimal.min(totalReceived.div(totalCreditGiven), new Decimal(1));
      const productMap = debtorProductMap.get(credit.debtorUserId);
      if (!productMap) continue;

      for (const [productName, stats] of productMap) {
        const realized = stats.potential.mul(ratio);
        total = total.plus(realized);
        byProduct.set(productName, (byProduct.get(productName) ?? new Decimal(0)).plus(realized));
      }
    }

    return { total, byProduct };
  }

  async getSummary(ownerId: string): Promise<DashboardSummary> {
    const [supplierDebts, debtorCredits, sales, { total: consignmentProfit }] = await Promise.all([
      this.supplierDebtRepo.find({ where: { ownerId } }),
      this.debtorCreditRepo.find({ where: { ownerId } }),
      this.saleRepo.find({ where: { ownerId } }),
      this.computeConsignmentProfits(ownerId),
    ]);

    const totalIOwe = supplierDebts
      .reduce((sum, d) => sum.plus(d.outstandingBalance), new Decimal(0))
      .toFixed(2);

    const totalOwedToMe = debtorCredits
      .reduce((sum, c) => sum.plus(c.outstandingBalance), new Decimal(0))
      .toFixed(2);

    const directSalesProfit = sales.reduce((sum, s) => sum.plus(s.profit), new Decimal(0));
    const totalProfitAllTime = directSalesProfit.plus(consignmentProfit).toFixed(2);

    return {
      totalIOwe,
      totalOwedToMe,
      netPosition: new Decimal(totalOwedToMe).minus(totalIOwe).toFixed(2),
      totalProfitAllTime,
    };
  }

  async getSuppliers(ownerId: string): Promise<SupplierListItem[]> {
    const debts = await this.supplierDebtRepo.find({
      where: { ownerId },
      relations: { supplierUser: true },
      order: { outstandingBalance: 'DESC' },
    });

    return debts.map((d) => ({
      supplierUserId: d.supplierUserId,
      supplierUsername: d.supplierUser.username,
      outstandingBalance: d.outstandingBalance,
      totalCreditReceived: d.totalCreditReceived,
      totalPaid: d.totalPaid,
      createdAt: d.createdAt,
    }));
  }

  async getSupplierDetail(
    ownerId: string,
    supplierUserId: string,
  ): Promise<SupplierDetailView> {
    const debt = await this.supplierDebtRepo.findOne({
      where: { ownerId, supplierUserId },
      relations: { supplierUser: true, payments: true },
      order: { payments: { date: 'ASC' } },
    });
    if (!debt) throw new NotFoundException('No supplier relationship found');

    // Query all inventory entries received from this supplier directly by supplierUserId.
    // This is more reliable than going through debt.inventoryEntries (which requires
    // supplier_debt_id to be populated — not guaranteed on older records).
    const productsReceived = await this.entryRepo.find({
      where: [
        { ownerId, supplierUserId, source: In([InventorySource.SUPPLIER, InventorySource.CONSIGNED_IN]) },
      ],
      order: { createdAt: 'DESC' },
    });

    // Total value sold from this supplier's products
    const supplierSales = await this.saleRepo.find({
      where: { ownerId, supplierUserId },
    });
    const totalValueSold = supplierSales
      .reduce(
        (sum, s) => sum.plus(new Decimal(s.salePrice).mul(s.qtySold)),
        new Decimal(0),
      )
      .toFixed(2);

    return {
      supplierUserId,
      supplierUsername: debt.supplierUser.username,
      debt,
      productsReceived,
      totalValueSold,
      payments: debt.payments,
    };
  }

  async getDebtors(ownerId: string): Promise<DebtorListItem[]> {
    const credits = await this.debtorCreditRepo.find({
      where: { ownerId },
      relations: { debtorUser: true },
      order: { outstandingBalance: 'DESC' },
    });

    return credits.map((c) => ({
      debtorUserId: c.debtorUserId,
      debtorUsername: c.debtorUser.username,
      outstandingBalance: c.outstandingBalance,
      totalCreditGiven: c.totalCreditGiven,
      totalReceived: c.totalReceived,
      createdAt: c.createdAt,
    }));
  }

  async getDebtorDetail(
    ownerId: string,
    debtorUserId: string,
  ): Promise<DebtorDetailView> {
    const credit = await this.debtorCreditRepo.findOne({
      where: { ownerId, debtorUserId },
      relations: { debtorUser: true, inventoryEntries: true },
    });
    if (!credit) throw new NotFoundException('No debtor relationship found');

    // Find the matching SupplierDebt on the debtor's side so we can fetch all payments
    // the debtor submitted via paySupplier (linked to supplierDebtId, incl. old records).
    const supplierDebt = await this.supplierDebtRepo.findOne({
      where: { ownerId: debtorUserId, supplierUserId: ownerId },
    });

    // Unified payment history: payments via paySupplier (supplierDebtId) +
    // payments manually recorded by supplier (debtorCreditId). Covers all statuses.
    const whereClause = [
      ...(supplierDebt ? [{ supplierDebtId: supplierDebt.id }] : []),
      { debtorCreditId: credit.id },
    ];
    const allPayments = await this.paymentRepo.find({
      where: whereClause,
      order: { date: 'DESC' },
    });

    return {
      debtorUserId,
      debtorUsername: credit.debtorUser.username,
      credit,
      productsConsigned: credit.inventoryEntries,
      payments: allPayments,
    };
  }

  async getProfitByProduct(ownerId: string): Promise<ProfitByProduct[]> {
    const [rows, { byProduct: consignmentByProduct }] = await Promise.all([
      this.saleRepo
        .createQueryBuilder('sale')
        .select('sale.productName', 'productName')
        .addSelect('SUM(CAST(sale.profit AS DECIMAL))', 'totalProfit')
        .addSelect('SUM(sale.qtySold)', 'totalQtySold')
        .where('sale.ownerId = :ownerId', { ownerId })
        .groupBy('sale.productName')
        .getRawMany<{ productName: string; totalProfit: string; totalQtySold: string }>(),
      this.computeConsignmentProfits(ownerId),
    ]);

    // Merge sale rows into a map so we can add consignment profit on top
    const profitMap = new Map<string, { profit: Decimal; qtySold: number }>();
    for (const r of rows) {
      profitMap.set(r.productName, {
        profit: new Decimal(r.totalProfit ?? 0),
        qtySold: Number(r.totalQtySold),
      });
    }

    // Add consignment realized profit per product
    for (const [productName, consignProfit] of consignmentByProduct) {
      const existing = profitMap.get(productName);
      if (existing) {
        existing.profit = existing.profit.plus(consignProfit);
      } else {
        profitMap.set(productName, { profit: consignProfit, qtySold: 0 });
      }
    }

    return Array.from(profitMap.entries())
      .map(([productName, { profit, qtySold }]) => ({
        productName,
        totalProfit: profit.toFixed(2),
        totalQtySold: qtySold,
      }))
      .sort((a, b) => new Decimal(b.totalProfit).minus(a.totalProfit).toNumber());
  }

  async getProfitBySource(ownerId: string): Promise<ProfitBySource[]> {
    const [rows, { total: consignmentTotal }] = await Promise.all([
      this.saleRepo
        .createQueryBuilder('sale')
        .leftJoin(User, 'u', 'u.id = sale.supplier_user_id')
        .select('sale.source', 'source')
        .addSelect('sale.supplierUserId', 'supplierUserId')
        .addSelect('u.username', 'supplierUsername')
        .addSelect('SUM(CAST(sale.profit AS DECIMAL))', 'totalProfit')
        .where('sale.ownerId = :ownerId', { ownerId })
        .groupBy('sale.source')
        .addGroupBy('sale.supplierUserId')
        .addGroupBy('u.username')
        .orderBy('SUM(CAST(sale.profit AS DECIMAL))', 'DESC')
        .getRawMany<{
          source: string;
          supplierUserId: string | null;
          supplierUsername: string | null;
          totalProfit: string;
        }>(),
      this.computeConsignmentProfits(ownerId),
    ]);

    const result: ProfitBySource[] = rows.map((r) => ({
      source: r.source,
      supplierUserId: r.supplierUserId,
      supplierUsername: r.supplierUsername,
      totalProfit: new Decimal(r.totalProfit ?? 0).toFixed(2),
    }));

    // Append realized consignment profit as its own source entry
    if (consignmentTotal.gt(0)) {
      result.push({
        source: InventorySource.CONSIGNED_OUT,
        supplierUserId: null,
        supplierUsername: null,
        totalProfit: consignmentTotal.toFixed(2),
      });
    }

    return result;
  }

  async getAlerts(ownerId: string): Promise<AlertItem[]> {
    const alerts: AlertItem[] = [];

    // ── Overdue debtors ──────────────────────────────────────────────────────
    // A debtor is overdue when they still owe money AND the credit record
    // has not been updated (i.e. no payment received) in OVERDUE_DAYS days.
    const overdueThreshold = new Date();
    overdueThreshold.setDate(overdueThreshold.getDate() - OVERDUE_DAYS);

    const overdueCredits = await this.debtorCreditRepo.find({
      where: {
        ownerId,
        updatedAt: LessThan(overdueThreshold),
      },
      relations: { debtorUser: true },
    });

    for (const credit of overdueCredits) {
      if (new Decimal(credit.outstandingBalance).lte(0)) continue;
      const daysSinceActivity = Math.floor(
        (Date.now() - credit.updatedAt.getTime()) / 86_400_000,
      );
      alerts.push({
        type: 'overdue_debtor',
        debtorUserId: credit.debtorUserId,
        debtorUsername: credit.debtorUser.username,
        outstandingBalance: new Decimal(credit.outstandingBalance).toFixed(2),
        daysSinceActivity,
      });
    }

    // ── Low stock ────────────────────────────────────────────────────────────
    const lowStockEntries = await this.entryRepo.find({
      where: { ownerId },
    });

    const lowStock = lowStockEntries.filter(
      (e) =>
        e.source !== InventorySource.CONSIGNED_OUT &&
        e.quantityRemaining <= LOW_STOCK_THRESHOLD &&
        e.quantityRemaining > 0,
    );

    // Deduplicate by productName — only alert once per product
    const seen = new Set<string>();
    for (const entry of lowStock) {
      if (seen.has(entry.productName)) continue;
      seen.add(entry.productName);
      alerts.push({
        type: 'low_stock',
        productName: entry.productName,
        quantityRemaining: entry.quantityRemaining,
        source: entry.source,
      });
    }

    // ── Pending incoming consignments ────────────────────────────────────────
    const pendingCount = await this.consignmentsService.countPendingIncoming(ownerId);
    if (pendingCount > 0) {
      alerts.push({ type: 'pending_consignment', pendingCount });
    }

    return alerts;
  }
}
