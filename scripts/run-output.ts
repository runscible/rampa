// Produces the run output required by the brief: starts the service, sends the four provided files through its
// HTTP API and saves what `GET /report` answers. Usage: `npm run output`.
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { configureApp } from '../src/adapters/http/configure-app';

const FEEDS = [
  { path: '/ingest/deposits', file: 'usdt_deposits.csv', contentType: 'text/csv' },
  { path: '/ingest/rates', file: 'reference_rates.csv', contentType: 'text/csv' },
  { path: '/ingest/funding-webhooks', file: 'funding_webhooks.json', contentType: 'application/json' },
  { path: '/ingest/payout-events', file: 'payout_events.json', contentType: 'application/json' },
] as const;

async function request(url: string, init?: RequestInit): Promise<string> {
  const response = await fetch(url, init);
  const body = await response.text();
  if (!response.ok) throw new Error(`${init?.method ?? 'GET'} ${new URL(url).pathname} answered ${response.status}: ${body}`);
  return body;
}

/** Sends the files in `dataDir` to the service at `baseUrl` and writes the reports it answers into `outDir`. */
export async function generateOutput(baseUrl: string, dataDir: string, outDir: string): Promise<void> {
  for (const { path, file, contentType } of FEEDS) {
    await request(`${baseUrl}${path}`, { method: 'POST', headers: { 'Content-Type': contentType }, body: readFileSync(join(dataDir, file), 'utf8') });
  }
  const json = await request(`${baseUrl}/report`, { headers: { Accept: 'application/json' } });
  const text = await request(`${baseUrl}/report`, { headers: { Accept: 'text/plain' } });

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'run-output.json'), json);
  writeFileSync(join(outDir, 'run-output.txt'), text);
}

async function main(): Promise<void> {
  // A throwaway database, so the output never depends on a previous run.
  process.env.RECON_DB_PATH = ':memory:';
  const { AppModule } = await import('../src/app.module');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error'] });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  try {
    await generateOutput(await app.getUrl(), 'data', 'out');
    process.stdout.write('Wrote out/run-output.txt and out/run-output.json\n');
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  main().catch((error: Error) => {
    process.stderr.write(`output: ${error.message}\n`);
    process.exitCode = 1;
  });
}
