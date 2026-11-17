import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import { configureApp } from '../../src/adapters/http/configure-app';
import { AppModule } from '../../src/app.module';

/** A fresh application (and so a fresh, empty in-memory log) wired exactly like production. */
export async function createTestApp(): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  return app;
}

export const readData = (name: string): string => readFileSync(join(__dirname, '..', '..', 'data', name), 'utf8');

/** Sends the four provided files to the API. */
export async function ingestAllFiles(app: NestExpressApplication): Promise<void> {
  const http = request(app.getHttpServer());
  await http.post('/ingest/deposits').set('Content-Type', 'text/csv').send(readData('usdt_deposits.csv')).expect(200);
  await http.post('/ingest/rates').set('Content-Type', 'text/csv').send(readData('reference_rates.csv')).expect(200);
  await http.post('/ingest/funding-webhooks').set('Content-Type', 'application/json').send(readData('funding_webhooks.json')).expect(200);
  await http.post('/ingest/payout-events').set('Content-Type', 'application/json').send(readData('payout_events.json')).expect(200);
}
