import {
  ALL_SERVICE_KEYS,
  allServicesForTier,
  mandatoryServicesForTier,
  ROLE_PRESETS,
  SERVICE_CATALOG,
  SERVICE_GROUPS,
  ServiceKey,
  expandServices,
  isServiceKey,
  resolveGrantedServices,
} from './service-catalog';

describe('service catalog', () => {
  it('has unique keys', () => {
    expect(new Set(ALL_SERVICE_KEYS).size).toBe(ALL_SERVICE_KEYS.length);
  });

  it('only uses declared groups', () => {
    for (const service of SERVICE_CATALOG) {
      expect(SERVICE_GROUPS).toContain(service.group);
    }
  });

  it('declares at least one tier per service', () => {
    for (const service of SERVICE_CATALOG) {
      expect(service.tiers.length).toBeGreaterThan(0);
    }
  });

  it('keeps `mandatory` a subset of `tiers`', () => {
    // A service forced on a tier that cannot hold it would be dropped by the
    // ceiling filter immediately after being added — an unreachable state.
    for (const service of SERVICE_CATALOG) {
      for (const tier of service.mandatory) {
        expect(service.tiers).toContain(tier);
      }
    }
  });

  it('marks the mini handover as the only mandatory service', () => {
    expect(mandatoryServicesForTier('MINI_EMPLOYEE')).toEqual(['handovers.mini']);
    expect(mandatoryServicesForTier('FULL_EMPLOYEE')).toEqual([]);
    expect(mandatoryServicesForTier('OWNER')).toEqual([]);
  });

  it('points every `implies` target at a real key', () => {
    for (const service of SERVICE_CATALOG) {
      for (const dep of service.implies) {
        expect(ALL_SERVICE_KEYS).toContain(dep);
      }
    }
  });

  it('never implies itself', () => {
    for (const service of SERVICE_CATALOG) {
      expect(service.implies).not.toContain(service.key);
    }
  });

  it('lists only real keys in every preset', () => {
    for (const preset of ROLE_PRESETS) {
      expect(preset.services.length).toBeGreaterThan(0);
      for (const key of preset.services) {
        expect(ALL_SERVICE_KEYS).toContain(key);
      }
    }
  });

  it('keeps every preset fully grantable to the tier it targets', () => {
    // Nothing in a preset should be silently dropped by the tier ceiling — that
    // would make the role editor show a preset it cannot actually apply.
    for (const preset of ROLE_PRESETS) {
      const granted = resolveGrantedServices(preset.services, preset.tier);
      for (const key of preset.services) {
        expect(granted.has(key)).toBe(true);
      }
    }
  });
});

describe('isServiceKey', () => {
  it('accepts catalog keys and rejects anything else', () => {
    expect(isServiceKey('sales.record')).toBe(true);
    expect(isServiceKey('sales.everything')).toBe(false);
    expect(isServiceKey(undefined)).toBe(false);
    expect(isServiceKey(42)).toBe(false);
  });
});

describe('expandServices', () => {
  it('pulls in implied reads transitively', () => {
    expect(expandServices(['sales.record'])).toEqual(
      new Set<ServiceKey>(['sales.record', 'inventory.view']),
    );
    expect(expandServices(['inventory.receive'])).toEqual(
      new Set<ServiceKey>(['inventory.receive', 'inventory.view', 'suppliers.view']),
    );
  });

  it('drops keys that are not in the catalog', () => {
    expect(expandServices(['sales.history', 'legacy.key'])).toEqual(
      new Set<ServiceKey>(['sales.history']),
    );
  });

  it('returns an empty set for an empty role', () => {
    expect(expandServices([])).toEqual(new Set());
  });
});

describe('resolveGrantedServices', () => {
  it('gives a full employee with NO role nothing at all', () => {
    // Access is given, never assumed. An employer who has opened nothing has
    // opened nothing — including the dashboard itself.
    expect(resolveGrantedServices(null, 'FULL_EMPLOYEE')).toEqual(new Set());
  });

  it('always leaves a mini able to hand takings back', () => {
    // The one mandatory service. Without it an employer could strand cash and
    // unsold stock with an employee by forgetting a checkbox.
    for (const roleServices of [null, undefined, [] as string[]]) {
      expect(resolveGrantedServices(roleServices, 'MINI_EMPLOYEE')).toEqual(
        new Set(['handovers.mini']),
      );
    }
  });

  it('leaves an owner unrestricted, role or not', () => {
    // Roles bind employees. An owner on their own books — including a full
    // employee who switched to `X-Acting-As: self` — holds everything.
    expect(resolveGrantedServices(null, 'OWNER')).toEqual(allServicesForTier('OWNER'));
    expect(resolveGrantedServices([], 'OWNER')).toEqual(allServicesForTier('OWNER'));
    expect(resolveGrantedServices(null, 'OWNER').has('withdrawals')).toBe(true);
  });

  it('grants an employee exactly what the role lists, plus implied reads', () => {
    const granted = resolveGrantedServices(['inventory.receive', 'pricing.catalog'], 'FULL_EMPLOYEE');
    expect(granted.has('inventory.receive')).toBe(true);
    expect(granted.has('pricing.catalog')).toBe(true);
    expect(granted.has('suppliers.view')).toBe(true); // implied by inventory.receive
    expect(granted.has('inventory.view')).toBe(true); // implied
    expect(granted.has('cash.overview')).toBe(false); // never asked for
  });

  it('keeps withdrawals and rate-setting owner-only at the ceiling', () => {
    for (const key of ['withdrawals', 'currency.rates'] as const) {
      expect(resolveGrantedServices([key], 'FULL_EMPLOYEE').has(key)).toBe(false);
      expect(allServicesForTier('OWNER').has(key)).toBe(true);
    }
  });

  it('drops services the tier can never hold', () => {
    const granted = resolveGrantedServices(
      ['sales.record', 'withdrawals', 'employees.manage'],
      'FULL_EMPLOYEE',
    );
    expect(granted.has('sales.record')).toBe(true);
    expect(granted.has('withdrawals')).toBe(false);
    expect(granted.has('employees.manage')).toBe(false);
  });

  it('does not give a full employee the mini handover', () => {
    expect(resolveGrantedServices(['handovers.mini'], 'FULL_EMPLOYEE').has('handovers.mini')).toBe(
      false,
    );
  });

  it('leaves an empty role otherwise empty for a full employee', () => {
    expect(resolveGrantedServices([], 'FULL_EMPLOYEE')).toEqual(new Set());
  });
});
