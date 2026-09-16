import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ExchangeRate } from '../entities/exchange-rate.entity';
import { CurrencyService } from './currency.service';

/**
 * The rate belongs to the business (migration 037).
 *
 * Before it, `exchange_rates` held one row for the whole database and
 * `getRate()` was `find({ take: 1 })` — so one merchant saving a rate moved
 * every other merchant's FC display, expense ledger and withdrawal caps. These
 * tests pin the scoping, and pin that the in-process cache is keyed per
 * business rather than shared (the bug would otherwise come back through the
 * cache even with the query fixed).
 */
describe('CurrencyService', () => {
  const ORG_A = 'org-a';
  const ORG_B = 'org-b';

  function rate(over: Partial<ExchangeRate> = {}): ExchangeRate {
    return {
      id: 'rate-a',
      orgId: ORG_A,
      usdToFcRate: '2700.0000',
      sellingRate: null,
      updatedAt: new Date(),
      ...over,
    } as ExchangeRate;
  }

  function make(rows: ExchangeRate[] = []) {
    const findOne = jest.fn(({ where }: { where: { orgId: string } }) =>
      Promise.resolve(rows.find((r) => r.orgId === where.orgId) ?? null),
    );
    const save = jest.fn((r: ExchangeRate) => Promise.resolve(r));
    const create = jest.fn((r: Partial<ExchangeRate>) => r as ExchangeRate);
    const repo = { findOne, save, create } as unknown as Repository<ExchangeRate>;
    return { service: new CurrencyService(repo), findOne, save, create };
  }

  describe('getRate', () => {
    it('reads only the asking business’s row', async () => {
      const { service, findOne } = make([
        rate(),
        rate({ id: 'rate-b', orgId: ORG_B, usdToFcRate: '3000.0000' }),
      ]);

      await expect(service.getRate(ORG_A)).resolves.toMatchObject({ usdToFcRate: '2700.0000' });
      await expect(service.getRate(ORG_B)).resolves.toMatchObject({ usdToFcRate: '3000.0000' });
      expect(findOne).toHaveBeenCalledWith({ where: { orgId: ORG_A } });
    });

    it('returns null for a business that has never set one, without borrowing another’s', async () => {
      const { service } = make([rate({ orgId: ORG_B })]);
      await expect(service.getRate(ORG_A)).resolves.toBeNull();
    });

    it('caches per business, so one business’s rate never answers for another', async () => {
      const { service, findOne } = make([
        rate(),
        rate({ id: 'rate-b', orgId: ORG_B, usdToFcRate: '3000.0000' }),
      ]);

      await service.getRate(ORG_A);
      await service.getRate(ORG_A); // served from cache
      const b = await service.getRate(ORG_B);

      expect(b?.usdToFcRate).toBe('3000.0000');
      expect(findOne).toHaveBeenCalledTimes(2); // one per business, not per call
    });
  });

  describe('setRate', () => {
    it('stamps the business on a first rate', async () => {
      const { service, create } = make();
      await service.setRate(ORG_A, { usdToFcRate: '2700' });
      expect(create).toHaveBeenCalledWith(expect.objectContaining({ orgId: ORG_A }));
    });

    it('updates that business’s existing row rather than creating a second', async () => {
      const { service, save, create } = make([rate()]);
      const saved = await service.setRate(ORG_A, { usdToFcRate: '2800' });
      expect(create).not.toHaveBeenCalled();
      expect(save).toHaveBeenCalled();
      expect(saved.usdToFcRate).toBe('2800.0000');
    });

    it('leaves another business untouched', async () => {
      const rows = [rate(), rate({ id: 'rate-b', orgId: ORG_B, usdToFcRate: '3000.0000' })];
      const { service } = make(rows);
      await service.setRate(ORG_A, { usdToFcRate: '2800' });
      expect(rows[1].usdToFcRate).toBe('3000.0000');
    });

    it('invalidates only the business it wrote', async () => {
      const rows = [rate(), rate({ id: 'rate-b', orgId: ORG_B, usdToFcRate: '3000.0000' })];
      const { service, findOne } = make(rows);

      await service.getRate(ORG_A);
      await service.getRate(ORG_B);
      expect(findOne).toHaveBeenCalledTimes(2);

      await service.setRate(ORG_A, { usdToFcRate: '2900' });

      await service.getRate(ORG_A); // re-read: its cache was dropped
      await service.getRate(ORG_B); // still cached
      expect(findOne).toHaveBeenCalledTimes(4); // 2 initial + 1 in setRate + 1 re-read
    });

    it('refuses a non-positive rate', async () => {
      const { service } = make();
      await expect(service.setRate(ORG_A, { usdToFcRate: '0' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
