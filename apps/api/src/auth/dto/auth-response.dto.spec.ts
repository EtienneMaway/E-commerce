import { Employment, EmploymentStatus, EmploymentTier } from '../../entities';
import { toActiveEmploymentDto } from './auth-response.dto';

function role(id: string, name: string, services: string[]): Employment['role'] {
  return { id, name, services } as unknown as Employment['role'];
}

function employment(over: Partial<Employment> = {}): Employment {
  return {
    id: 'emp-1',
    tier: EmploymentTier.FULL,
    status: EmploymentStatus.ACTIVE,
    employer: { id: 'employer-1', username: 'boss' },
    terminationRequestedBy: null,
    role: null,
    ...over,
  } as Employment;
}

describe('toActiveEmploymentDto', () => {
  it('returns null when there is no employment', () => {
    expect(toActiveEmploymentDto(null)).toBeNull();
  });

  it('reports the role and its expanded services', () => {
    const dto = toActiveEmploymentDto(
      employment({
        role: role('role-1', 'Cashier', ['sales.record']),
      }),
    );
    expect(dto?.role).toEqual({ id: 'role-1', name: 'Cashier' });
    // `sales.record` implies `inventory.view`.
    expect(dto?.services).toEqual(['inventory.view', 'sales.record']);
  });

  it('reports no services at all when a full employee has no role', () => {
    const dto = toActiveEmploymentDto(employment({ role: null }));
    expect(dto?.role).toBeNull();
    expect(dto?.services).toEqual([]);
  });

  it('still reports the handover for a role-less mini', () => {
    const dto = toActiveEmploymentDto(
      employment({ tier: EmploymentTier.SALES_ONLY, role: null }),
    );
    expect(dto?.services).toEqual(['handovers.mini']);
  });

  it('resolves a mini against the mini tier, not the full one', () => {
    const dto = toActiveEmploymentDto(
      employment({
        tier: EmploymentTier.SALES_ONLY,
        role: role('role-2', 'Seller', ['sales.record', 'cash.overview']),
      }),
    );
    // Granted and grantable to a mini.
    expect(dto?.services).toContain('sales.record');
    // Asked for, but above the mini ceiling — dropped.
    expect(dto?.services).not.toContain('cash.overview');
  });

  it('never emits null services — clients only test membership', () => {
    const dto = toActiveEmploymentDto(employment({ role: role('r', 'Empty', []) }));
    expect(dto?.services).toEqual([]);
  });
});
