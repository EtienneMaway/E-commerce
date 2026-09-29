import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StockCustody, StockCustodyStatus } from '../../entities';

/**
 * Whether an employee currently holds an OPEN custody appointment at a branch.
 *
 * Appointing someone custodian (`StockCustody`, `custody/custody.service.ts`
 * `appoint()`) never touches their role — `custody.hold` stays a normal,
 * revocable grant for everyone else. But an appointment IS the authorization
 * for the one person actually named on it: an owner picks a full employee and
 * that employee accepts, the same shape as a mini's mandatory
 * `handovers.mini` — the responsibility is handed to a specific person, not
 * opened as a feature toggle, so it cannot be stranded behind a role nobody
 * remembered to also grant.
 *
 * Kept as its own tiny global service — like `ShopContextService` — rather
 * than a dependency on `CustodyModule`, because `JwtAuthGuard` and the
 * `/auth/me` DTO are wired into nearly every module; pulling in custody's full
 * dependency graph (inventory, sales, mini-settlements) there would risk a
 * circular import for a single boolean lookup.
 */
@Injectable()
export class CustodyAccessService {
  constructor(
    @InjectRepository(StockCustody)
    private readonly repo: Repository<StockCustody>,
  ) {}

  async isCurrentCustodian(employeeId: string, shopId: string | null): Promise<boolean> {
    if (!shopId) return false;
    const row = await this.repo.findOne({
      where: { shopId, custodianId: employeeId, status: StockCustodyStatus.OPEN },
      select: ['id'],
    });
    return !!row;
  }
}
