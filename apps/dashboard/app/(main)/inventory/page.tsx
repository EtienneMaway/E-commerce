'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { inventoryApi } from '../../../lib/api';
import { QK } from '../../../lib/query-keys';
import { breakdownQuantity, formatBreakdown } from '../../../lib/utils';
import { useFormatCurrency } from '../../../lib/currency';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { Pagination } from '../../../components/ui/Pagination';
import { AddPersonalProductDialog } from '../../../components/forms/AddPersonalProductDialog';
import { ReceiveFromSupplierDialog } from '../../../components/forms/ReceiveFromSupplierDialog';
import { CreateSizedProductDialog } from '../../../components/forms/CreateSizedProductDialog';
import {
  AddGroupStockDialog,
  type GroupStockTarget,
} from '../../../components/forms/AddGroupStockDialog';
import {
  EditGroupPricesDialog,
  type GroupPriceTarget,
} from '../../../components/forms/EditGroupPricesDialog';
import {
  AdjustGroupStockDialog,
  type GroupAdjustTarget,
} from '../../../components/forms/AdjustGroupStockDialog';
import { useT } from '../../../lib/i18n';
import { Fragment, useEffect, useState } from 'react';

interface RowVariant {
  variantId: string;
  label: string;
  unitCost: string | null;
  sellingPrice: string;
  piecesPerCarton: number;
  available: number;
}

interface Row {
  productName: string;
  category: string | null;
  piecesPerCarton: number | null;
  latestCartonPrice: string | null;
  totalAvailable: number;
  sourceBreakdown: {
    personal: number;
    supplier: number;
    consignedIn: number;
    consignedOut: number;
  };
  latestSellingPrice: string;
  latestUnitCost: string;
  // Sized products (optional — simple products omit these)
  kind?: 'simple' | 'group';
  groupId?: string;
  cartonSellingPrice?: string | null;
  cartonBuyingPrice?: string | null;
  cartonsAvailable?: number;
  variants?: RowVariant[];
}

export default function InventoryPage() {
  const t = useT();
  const formatCurrency = useFormatCurrency();
  const [addOpen, setAddOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [sizedOpen, setSizedOpen] = useState(false);
  const [stockGroup, setStockGroup] = useState<GroupStockTarget | null>(null);

  const COLUMNS: Column<Row>[] = [
    {
      key: 'productName',
      header: t.inventory.colProduct,
      sortable: true,
      render: (r) => (
        <Link
          href={`/inventory/${encodeURIComponent(r.productName)}`}
          className="font-semibold hover:text-primary transition-colors"
          style={{ color: 'var(--foreground)' }}
        >
          {r.productName.charAt(0).toUpperCase() + r.productName.slice(1)}
        </Link>
      ),
    },
    {
      key: 'category',
      header: t.inventory.colCategory,
      render: (r) => <span style={{ color: 'var(--muted)' }}>{r.category ?? '—'}</span>,
    },
    {
      key: 'totalAvailable',
      header: t.inventory.colAvailable,
      sortable: true,
      getValue: (r) => r.totalAvailable,
      render: (r) => {
        const bd = breakdownQuantity(r.totalAvailable, r.piecesPerCarton);
        const isLow = r.totalAvailable > 0 && r.totalAvailable <= 5;
        const isOut = r.totalAvailable === 0;
        return (
          <div>
            <span
              style={{
                fontWeight: isLow ? 600 : 400,
                color: isOut
                  ? 'var(--muted)'
                  : isLow
                  ? 'var(--danger)'
                  : 'inherit',
              }}
            >
              {formatBreakdown(bd)}
              {isLow && <span className="ml-1 text-xs">⚠️ {t.inventory.low}</span>}
            </span>
            <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
              {r.totalAvailable} pcs
              {r.piecesPerCarton ? ` · 1 ctn = ${r.piecesPerCarton} pcs` : ''}
            </div>
          </div>
        );
      },
    },
    {
      key: 'sourceBreakdown',
      header: t.inventory.colSources,
      render: (r) => (
        <div className="flex gap-1 flex-wrap">
          {r.sourceBreakdown.personal > 0 && (
            <span className="text-xs rounded px-1.5 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              P: {r.sourceBreakdown.personal}
            </span>
          )}
          {r.sourceBreakdown.supplier > 0 && (
            <span className="text-xs rounded px-1.5 py-0.5 bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300">
              S: {r.sourceBreakdown.supplier}
            </span>
          )}
          {r.sourceBreakdown.consignedIn > 0 && (
            <span className="text-xs rounded px-1.5 py-0.5 bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
              IN: {r.sourceBreakdown.consignedIn}
            </span>
          )}
          {r.sourceBreakdown.consignedOut > 0 && (
            <span className="text-xs rounded px-1.5 py-0.5" style={{ background: 'var(--surface)', color: 'var(--muted)' }}>
              OUT: {r.sourceBreakdown.consignedOut}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'latestCartonPrice',
      header: t.inventory.colBuyingCarton,
      sortable: true,
      getValue: (r) => {
        if (r.latestCartonPrice) return parseFloat(r.latestCartonPrice);
        if (r.piecesPerCarton) return parseFloat(r.latestUnitCost) * r.piecesPerCarton;
        return 0;
      },
      render: (r) => {
        if (r.latestCartonPrice) return formatCurrency(r.latestCartonPrice);
        if (r.piecesPerCarton) {
          const computed = (parseFloat(r.latestUnitCost) * r.piecesPerCarton).toFixed(4);
          return <span style={{ fontStyle: 'italic', color: 'var(--muted)' }}>{formatCurrency(computed)}</span>;
        }
        return <span style={{ color: 'var(--muted)' }}>—</span>;
      },
    },
    {
      key: 'sellingCartonPrice',
      header: t.inventory.colSellingCarton,
      sortable: true,
      getValue: (r) => r.piecesPerCarton ? parseFloat(r.latestSellingPrice) * r.piecesPerCarton : 0,
      render: (r) => {
        if (!r.piecesPerCarton) return <span style={{ color: 'var(--muted)' }}>—</span>;
        const computed = (parseFloat(r.latestSellingPrice) * r.piecesPerCarton).toFixed(4);
        return <span style={{ fontStyle: 'italic', color: 'var(--muted)' }}>{formatCurrency(computed)}</span>;
      },
    },
    {
      key: 'latestUnitCost',
      header: t.inventory.colCost,
      sortable: true,
      getValue: (r) => parseFloat(r.latestUnitCost),
      render: (r) => formatCurrency(r.latestUnitCost),
    },
    {
      key: 'latestSellingPrice',
      header: t.inventory.colSellingPrice,
      sortable: true,
      getValue: (r) => parseFloat(r.latestSellingPrice),
      render: (r) => formatCurrency(r.latestSellingPrice),
    },
  ];

  const { data, isLoading } = useQuery({
    queryKey: QK.inventoryProducts,
    queryFn: () => inventoryApi.listProducts(),
    staleTime: 30_000,
  });

  const allRows = (data as Row[] | undefined) ?? [];
  const simpleRows = allRows.filter((r) => r.kind !== 'group');
  const groupRows = allRows.filter((r) => r.kind === 'group');
  const lowStock = simpleRows.filter((r) => r.totalAvailable > 0 && r.totalAvailable <= 5).length;

  return (
    <div>
      <AddPersonalProductDialog open={addOpen} onClose={() => setAddOpen(false)} />
      <ReceiveFromSupplierDialog open={receiveOpen} onClose={() => setReceiveOpen(false)} />
      <CreateSizedProductDialog
        open={sizedOpen}
        onClose={() => setSizedOpen(false)}
        onRestock={(g) => {
          setSizedOpen(false);
          setStockGroup(g);
        }}
      />
      <AddGroupStockDialog group={stockGroup} onClose={() => setStockGroup(null)} />

      <div className="page-header">
        <div className="flex-1 min-w-0">
          <h1 className="page-title">{t.inventory.title}</h1>
          <p className="page-sub">
            {t.inventory.items(allRows.length)}
            {lowStock > 0 && (
              <span style={{ color: 'var(--danger)' }}> · {t.inventory.lowStock(lowStock)}</span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0 flex-wrap">
          <button onClick={() => setAddOpen(true)} className="btn btn-primary">
            {t.inventory.addProduct}
          </button>
          <button onClick={() => setReceiveOpen(true)} className="btn btn-secondary">
            {t.inventory.receiveFromSupplier}
          </button>
          <button onClick={() => setSizedOpen(true)} className="btn btn-secondary">
            {t.sizedProducts.createBtn}
          </button>
        </div>
      </div>

      <div className="page-content">
        {isLoading ? (
          <div className="loading-state">
            <div className="spinner" />
            <span>{t.inventory.loading}</span>
          </div>
        ) : allRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-4xl mb-3">📦</div>
            <p className="font-semibold" style={{ color: 'var(--foreground)' }}>
              {t.inventory.noProducts}
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
              {t.inventory.noProductsSub}
            </p>
          </div>
        ) : (
          <>
            {simpleRows.length > 0 && (
              <DataTable
                columns={COLUMNS}
                data={simpleRows}
                keyField="productName"
                searchPlaceholder={t.inventory.searchPlaceholder}
                searchFields={['productName', 'category']}
                pageSize={5}
              />
            )}
            {groupRows.length > 0 && (
              <SizedProductsSection groups={groupRows} onAddStock={setStockGroup} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Sized products (carton with different-priced sizes) ─────────────────────
 * DataTable has no expandable-row support, so this is a hand-rolled table with
 * a React.Fragment per group and an expand toggle revealing the per-size rows
 * and the carton math (combined size value vs the discounted carton price).
 */
function SizedProductsSection({
  groups,
  onAddStock,
}: {
  groups: Row[];
  onAddStock: (g: GroupStockTarget) => void;
}) {
  const t = useT();
  const formatCurrency = useFormatCurrency();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [priceGroup, setPriceGroup] = useState<GroupPriceTarget | null>(null);
  const [adjustGroup, setAdjustGroup] = useState<GroupAdjustTarget | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 5;
  const totalPages = Math.max(1, Math.ceil(groups.length / PAGE_SIZE));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  const visibleGroups = groups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="mt-8">
      <div className="mb-3">
        <h2 className="text-base font-bold" style={{ color: 'var(--foreground)' }}>
          {t.sizedProducts.sectionTitle}
        </h2>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          {t.sizedProducts.sectionSub}
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
        <table className="w-full text-sm min-w-[680px]">
          <thead>
            <tr style={{ background: 'var(--surface)', color: 'var(--muted)' }}>
              <th className="text-left font-semibold px-4 py-2.5">{t.inventory.colProduct}</th>
              <th className="text-left font-semibold px-4 py-2.5">{t.inventory.colCategory}</th>
              <th className="text-left font-semibold px-4 py-2.5">{t.inventory.colAvailable}</th>
              <th className="text-right font-semibold px-4 py-2.5">
                {t.sizedProducts.cartonBuyingShort}
              </th>
              <th className="text-right font-semibold px-4 py-2.5">
                {t.sizedProducts.cartonPriceLabelShort}
              </th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {visibleGroups.map((g) => {
              const variants = g.variants ?? [];
              const combined = variants.reduce(
                (s, v) => s + parseFloat(v.sellingPrice) * v.piecesPerCarton,
                0,
              );
              const cartonPrice = g.cartonSellingPrice ? parseFloat(g.cartonSellingPrice) : null;
              const cartonCost = g.cartonBuyingPrice ? parseFloat(g.cartonBuyingPrice) : null;
              const isOpen = expanded === g.groupId;
              return (
                <Fragment key={g.groupId}>
                  <tr className="border-t" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setExpanded(isOpen ? null : g.groupId ?? null)}
                        className="flex items-center gap-2 font-semibold"
                        style={{ color: 'var(--foreground)' }}
                      >
                        <span
                          style={{
                            display: 'inline-block',
                            transform: isOpen ? 'rotate(90deg)' : 'none',
                            transition: 'transform 0.15s',
                            color: 'var(--muted)',
                          }}
                        >
                          ▶
                        </span>
                        {g.productName.charAt(0).toUpperCase() + g.productName.slice(1)}
                        <span className="text-xs font-normal" style={{ color: 'var(--muted)' }}>
                          · {variants.length} {t.sizedProducts.expandHint}
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--muted)' }}>
                      {g.category ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-xs rounded px-1.5 py-0.5"
                        style={{ background: 'var(--surface)', color: 'var(--foreground)' }}
                      >
                        {t.sizedProducts.cartonsAvailable(g.cartonsAvailable ?? 0)}
                      </span>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                        {g.totalAvailable} pcs
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {cartonCost != null ? (
                        formatCurrency(cartonCost.toFixed(4))
                      ) : (
                        <span style={{ color: 'var(--muted)' }}>—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {cartonPrice != null ? (
                        formatCurrency(cartonPrice.toFixed(4))
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--muted)' }}>
                          {t.sizedProducts.noCartonPrice}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5 justify-end flex-wrap">
                        <button
                          onClick={() =>
                            setPriceGroup({
                              id: g.groupId!,
                              name: g.productName,
                              cartonSellingPrice: g.cartonSellingPrice ?? null,
                              cartonBuyingPrice: g.cartonBuyingPrice ?? null,
                              variants: variants.map((v) => ({
                                variantId: v.variantId,
                                label: v.label,
                                sellingPrice: v.sellingPrice,
                              })),
                            })
                          }
                          className="btn btn-ghost"
                          style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                        >
                          {t.sizedProducts.editPricesBtn}
                        </button>
                        <button
                          onClick={() =>
                            setAdjustGroup({
                              id: g.groupId!,
                              name: g.productName,
                              variants: variants.map((v) => ({
                                variantId: v.variantId,
                                label: v.label,
                                available: v.available,
                              })),
                            })
                          }
                          className="btn btn-ghost"
                          style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                        >
                          {t.sizedProducts.adjustBtn}
                        </button>
                        <button
                          onClick={() =>
                            onAddStock({
                              id: g.groupId!,
                              name: g.productName,
                              variants: variants.map((v) => ({
                                variantId: v.variantId,
                                label: v.label,
                                piecesPerCarton: v.piecesPerCarton,
                              })),
                            })
                          }
                          className="btn btn-secondary"
                          style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}
                        >
                          {t.sizedProducts.addStockBtn}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr style={{ background: 'var(--surface)' }}>
                      <td colSpan={6} className="px-4 py-3">
                        <table className="w-full text-xs">
                          <thead>
                            <tr style={{ color: 'var(--muted)' }}>
                              <th className="text-left font-semibold py-1">
                                {t.sizedProducts.colSize}
                              </th>
                              <th className="text-right font-semibold py-1">
                                {t.sizedProducts.colPrice}
                              </th>
                              <th className="text-right font-semibold py-1">
                                {t.sizedProducts.colPerCarton}
                              </th>
                              <th className="text-right font-semibold py-1">
                                {t.sizedProducts.colSizeAvailable}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {variants.map((v) => (
                              <tr key={v.variantId}>
                                <td className="py-1 capitalize" style={{ color: 'var(--foreground)' }}>
                                  {v.label}
                                </td>
                                <td className="py-1 text-right tabular-nums">
                                  {formatCurrency(v.sellingPrice)}
                                </td>
                                <td className="py-1 text-right tabular-nums">{v.piecesPerCarton}</td>
                                <td className="py-1 text-right tabular-nums">{v.available}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {/* Carton math */}
                        <div
                          className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs pt-2 border-t"
                          style={{ borderColor: 'var(--border)' }}
                        >
                          {cartonCost != null && (
                            <span style={{ color: 'var(--muted)' }}>
                              {t.sizedProducts.cartonBuyingShort}:{' '}
                              <span className="tabular-nums" style={{ color: 'var(--foreground)' }}>
                                {formatCurrency(cartonCost.toFixed(4))}
                              </span>
                            </span>
                          )}
                          <span style={{ color: 'var(--muted)' }}>
                            {t.sizedProducts.combinedLabel}:{' '}
                            <span className="tabular-nums" style={{ color: 'var(--foreground)' }}>
                              {formatCurrency(combined.toFixed(4))}
                            </span>
                          </span>
                          {cartonPrice != null && (
                            <>
                              <span style={{ color: 'var(--muted)' }}>
                                {t.sizedProducts.cartonPriceLabelShort}:{' '}
                                <span className="tabular-nums" style={{ color: 'var(--foreground)' }}>
                                  {formatCurrency(cartonPrice.toFixed(4))}
                                </span>
                              </span>
                              <span style={{ color: 'var(--muted)' }}>
                                {t.sizedProducts.discountLabel}:{' '}
                                <span
                                  className="tabular-nums font-semibold"
                                  style={{
                                    color:
                                      combined - cartonPrice >= 0
                                        ? 'var(--success)'
                                        : 'var(--danger)',
                                  }}
                                >
                                  {formatCurrency((combined - cartonPrice).toFixed(4))}
                                </span>
                              </span>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        <Pagination
          page={page}
          totalPages={totalPages}
          total={groups.length}
          pageSize={PAGE_SIZE}
          onChange={setPage}
        />
      </div>

      <EditGroupPricesDialog group={priceGroup} onClose={() => setPriceGroup(null)} />
      <AdjustGroupStockDialog group={adjustGroup} onClose={() => setAdjustGroup(null)} />
    </div>
  );
}
