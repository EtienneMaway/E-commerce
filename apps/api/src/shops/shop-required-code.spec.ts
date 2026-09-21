import { BadRequestException } from '@nestjs/common';
import { SHOP_REQUIRED_CODE, requireShop } from '../common/shop-scope';
import { allShopsCtx } from '../common/testing/actor-context.fixture';

/**
 * "Select a shop for this action" is the one refusal a client answers rather
 * than reports: the dashboard opens a branch picker and replays the request
 * that was refused (`lib/api.ts` → `BranchRequiredDialog`).
 *
 * That only works while the refusal carries `code: 'SHOP_REQUIRED'`. The
 * message beside it is translated per `Accept-Language`, so matching on the
 * sentence would work in English and silently stop working in French — the
 * user would get a dead error toast instead of the picker, on half the
 * installs, with nothing failing anywhere to say so.
 *
 * The guard's own copy of this refusal (`assertWritableScope`, for a non-GET
 * under `X-Shop-Id: all`) carries the same code; it is asserted in the guard's
 * tests, and the shape is pinned here.
 */
describe('the "pick a branch" refusal is machine-readable', () => {
  it('requireShop refuses a cross-branch write with SHOP_REQUIRED', () => {
    let thrown: unknown;
    try {
      requireShop(allShopsCtx());
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    const body = (thrown as BadRequestException).getResponse();
    expect(body).toEqual({
      message: 'Select a shop for this action',
      code: SHOP_REQUIRED_CODE,
    });
  });

  it('keeps the human sentence as the exception message, for logs and plain clients', () => {
    // `HttpException` lifts `response.message` onto `.message`, which is what
    // every existing `toThrow('Select a shop…')` assertion reads.
    expect(() => requireShop(allShopsCtx())).toThrow('Select a shop for this action');
  });

  it('a chosen branch passes through untouched', () => {
    expect(requireShop({ ...allShopsCtx(), shopId: 'shop-1' })).toBe('shop-1');
  });
});
