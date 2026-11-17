import { readFileSync } from 'fs';
import { join } from 'path';
import { formatAmount } from '../../src/adapters/report/text-report';
import { BREAK_SEVERITY } from '../../src/domain/breaks/break';
import { reconcileRealData } from '../support/real-data';

const ROOT = join(__dirname, '..', '..');
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');
const readme = read('README.md');

/** The README is part of the deliverable, so it must not drift from the code. */
describe('README matches the code', () => {
  describe('break catalogue', () => {
    const rows = [...readme.matchAll(/^\| (BREAK|REVIEW|INFO) \| `([A-Z_]+)` \|/gm)].map((m) => [m[2], m[1]]);

    it.each(Object.entries(BREAK_SEVERITY))('documents %s with its severity (%s)', (type, severity) => {
      expect(rows).toContainEqual([type, severity]);
    });

    it('documents nothing that no longer exists', () => {
      const known = Object.keys(BREAK_SEVERITY);
      expect(rows.map(([type]) => type).filter((type) => !known.includes(type))).toEqual([]);
    });
  });

  describe('endpoints', () => {
    const routes = ['ingest.controller.ts', 'report.controller.ts'].flatMap((file) => {
      const source = read(`src/adapters/http/${file}`);
      const prefix = /@Controller\((?:'([^']*)')?\)/.exec(source)?.[1] ?? '';
      return [...source.matchAll(/@(Get|Post)\('([^']*)'\)/g)].map((m) => `${m[1].toUpperCase()} /${[prefix, m[2]].filter(Boolean).join('/')}`);
    });

    it('finds the routes it is supposed to check', () => {
      expect(routes).toEqual(expect.arrayContaining(['POST /ingest/deposits', 'GET /balances', 'GET /payouts/:payoutId', 'GET /deposits/:txHash']));
      expect(routes.length).toBeGreaterThanOrEqual(11);
    });

    it.each(routes)('documents %s', (route) => {
      expect(readme).toContain(`\`${route}\``);
    });
  });

  describe('configuration', () => {
    const variables = [...read('src/config/app-config.ts').matchAll(/env\.(RECON_[A-Z_]+)/g)].map((m) => m[1]);

    it('finds the variables it is supposed to check', () => {
      expect(variables).toContain('RECON_DB_PATH');
    });

    it.each(variables)('documents %s', (name) => {
      expect(readme).toContain(`\`${name}\``);
    });

    it('documents no variable that is not read', () => {
      const documented = [...readme.matchAll(/^\| `(RECON_[A-Z_]+)` \|/gm)].map((m) => m[1]);
      expect(documented.filter((name) => !variables.includes(name))).toEqual([]);
    });
  });

  it('states the Node version the dependencies need', () => {
    const { engines } = JSON.parse(read('package.json'));
    expect(engines?.node).toBeDefined();
    const major = /(\d+)/.exec(engines.node)![1];
    expect(readme).toContain(`Node ${major}`);
  });

  it('shows the balances the provided data really gives', async () => {
    const { balances } = await reconcileRealData();
    for (const money of Object.values(balances)) {
      if (!money.isZero()) expect(readme).toContain(formatAmount(money.toString()));
    }
  });
});
