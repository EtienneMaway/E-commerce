import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { ALL_SERVICE_KEYS, ServiceKey, SERVICE_CATALOG } from './service-catalog';

const SRC = join(__dirname, '..', '..');

function controllerFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...controllerFiles(full));
    else if (entry.endsWith('.controller.ts')) out.push(full);
  }
  return out;
}

const FILES = controllerFiles(SRC);

/** Every key mentioned in a @RequiresService(...) across the codebase. */
function usedKeys(): { key: string; file: string }[] {
  const found: { key: string; file: string }[] = [];
  for (const file of FILES) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/@RequiresService\(([^)]*)\)/g)) {
      for (const k of m[1].matchAll(/'([^']+)'/g)) {
        found.push({ key: k[1], file: file.slice(SRC.length + 1) });
      }
    }
  }
  return found;
}

describe('@RequiresService annotations', () => {
  it('finds controllers to check', () => {
    expect(FILES.length).toBeGreaterThan(10);
  });

  it('only references keys that exist in the catalogue', () => {
    // Guards against a typo or a key renamed in the catalogue but not on the
    // route — which would silently lock everyone out of that endpoint, since an
    // unknown key can never be in a resolved service set.
    const bad = usedKeys().filter((u) => !ALL_SERVICE_KEYS.includes(u.key as ServiceKey));
    expect(bad).toEqual([]);
  });

  it('leaves only the intended always-on controllers ungated', () => {
    // Identity, the employment lifecycle and sync must stay reachable no matter
    // what a role says. Anything else appearing here means a new controller
    // shipped without deciding which service it belongs to.
    const ALWAYS_ON = ['app', 'auth', 'users', 'sync', 'employee-roles'];
    const ungated = FILES.filter((f) => !readFileSync(f, 'utf8').includes('@RequiresService')).map(
      (f) => f.split('/').pop()!.replace('.controller.ts', ''),
    );
    expect(ungated.sort()).toEqual([...ALWAYS_ON].sort());
  });

  it('exercises most of the catalogue', () => {
    // Not every key maps to a route (some gate UI only), but a key that no route
    // uses and no client reads is dead weight worth noticing.
    const used = new Set(usedKeys().map((u) => u.key));
    const unused = SERVICE_CATALOG.map((s) => s.key).filter((k) => !used.has(k));
    expect(unused).toEqual([]);
  });
});
