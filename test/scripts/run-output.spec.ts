import { NestExpressApplication } from '@nestjs/platform-express';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { generateOutput } from '../../scripts/run-output';
import { createTestApp } from '../support/app';

const DATA = join(__dirname, '..', '..', 'data');
const COMMITTED = join(__dirname, '..', '..', 'out');

describe('generateOutput (the run output, produced through the API)', () => {
  let app: NestExpressApplication;
  let baseUrl: string;
  let out: string;
  beforeEach(async () => {
    app = await createTestApp();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    out = mkdtempSync(join(tmpdir(), 'recon-run-'));
  });
  afterEach(async () => {
    await app.close();
    rmSync(out, { recursive: true, force: true });
  });

  it('sends the four files and saves the text and JSON reports', async () => {
    await generateOutput(baseUrl, DATA, join(out, 'nested'));
    const text = readFileSync(join(out, 'nested', 'run-output.txt'), 'utf8');
    const json = JSON.parse(readFileSync(join(out, 'nested', 'run-output.json'), 'utf8'));
    expect(text).toContain('BREAKS (5 breaks, 1 review, 2 info)');
    expect(json.balances.bsPaidOut).toBe('129505.55');
    expect(json.breaks).toHaveLength(8);
  });

  it('is repeatable: running it again against the same service writes the same bytes', async () => {
    await generateOutput(baseUrl, DATA, join(out, 'first'));
    await generateOutput(baseUrl, DATA, join(out, 'second'));
    for (const name of ['run-output.txt', 'run-output.json']) {
      expect(readFileSync(join(out, 'second', name), 'utf8')).toBe(readFileSync(join(out, 'first', name), 'utf8'));
    }
  });

  it('stops with a clear message when the API rejects a file', async () => {
    const bad = join(out, 'bad-data');
    mkdirSync(bad);
    for (const name of ['reference_rates.csv', 'funding_webhooks.json', 'payout_events.json']) {
      writeFileSync(join(bad, name), readFileSync(join(DATA, name)));
    }
    writeFileSync(join(bad, 'usdt_deposits.csv'), 'tx_hash,amount_usdt,timestamp\n0x1,oops,2026-10-05T09:00:00-04:00\n');
    await expect(generateOutput(baseUrl, bad, join(out, 'never'))).rejects.toThrow(/\/ingest\/deposits.*422/s);
  });

  it('the committed out/ is exactly what the API produces now (regenerate it with `npm run output`)', async () => {
    await generateOutput(baseUrl, DATA, out);
    for (const name of ['run-output.txt', 'run-output.json']) {
      expect(readFileSync(join(COMMITTED, name), 'utf8')).toBe(readFileSync(join(out, name), 'utf8'));
    }
  });
});
