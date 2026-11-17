import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp, readData } from '../support/app';

describe('POST /ingest/*', () => {
  let app: NestExpressApplication;
  beforeEach(async () => {
    app = await createTestApp();
  });
  afterEach(() => app.close());

  const http = () => request(app.getHttpServer());
  const csv = (path: string, body: string) => http().post(path).set('Content-Type', 'text/csv').send(body);
  const json = (path: string, body: unknown) => http().post(path).set('Content-Type', 'application/json').send(JSON.stringify(body));

  it('stores a CSV feed and says how many records were stored', async () => {
    const res = await csv('/ingest/deposits', readData('usdt_deposits.csv')).expect(200);
    expect(res.body).toEqual({ received: 5, stored: 5, ignored: 0 });
  });

  it('is idempotent: sending the same file again stores nothing', async () => {
    await csv('/ingest/deposits', readData('usdt_deposits.csv')).expect(200);
    const again = await csv('/ingest/deposits', readData('usdt_deposits.csv')).expect(200);
    expect(again.body).toEqual({ received: 5, stored: 0, ignored: 5 });
  });

  it('stores JSON feeds', async () => {
    const webhooks = await json('/ingest/funding-webhooks', JSON.parse(readData('funding_webhooks.json'))).expect(200);
    expect(webhooks.body).toEqual({ received: 4, stored: 4, ignored: 0 });
    const payouts = await json('/ingest/payout-events', JSON.parse(readData('payout_events.json'))).expect(200);
    expect(payouts.body).toEqual({ received: 53, stored: 53, ignored: 0 });
  });

  it('stores the rates feed', async () => {
    const res = await csv('/ingest/rates', readData('reference_rates.csv')).expect(200);
    expect(res.body).toEqual({ received: 14, stored: 14, ignored: 0 });
  });

  it('rejects the whole request with 422 and the bad lines, and stores nothing', async () => {
    const bad = 'tx_hash,amount_usdt,timestamp\n0x1,100.00,2026-10-05T08:00:00-04:00\n0x2,oops,2026-10-05T09:00:00-04:00\n';
    const res = await csv('/ingest/deposits', bad).expect(422);
    expect(res.body.message).toBe('deposits: 1 invalid record(s); nothing was stored');
    expect(res.body.errors).toEqual([{ line: 3, reason: expect.stringContaining('oops') }]);
    const balances = await http().get('/balances').expect(200);
    expect(balances.body.balances.usdtUnconverted).toBe('0.00');
  });

  it('a corrected file can be sent after a rejected one', async () => {
    await csv('/ingest/deposits', 'tx_hash,amount_usdt,timestamp\n0x2,oops,2026-10-05T09:00:00-04:00\n').expect(422);
    const ok = await csv('/ingest/deposits', 'tx_hash,amount_usdt,timestamp\n0x2,50.00,2026-10-05T09:00:00-04:00\n').expect(200);
    expect(ok.body.stored).toBe(1);
  });

  it('answers 422 for a JSON feed that is not an array or has bad records', async () => {
    const notArray = await json('/ingest/payout-events', { event_id: 'x' }).expect(422);
    expect(notArray.body.message).toBe('payout-events: 1 invalid record(s); nothing was stored');
    expect(notArray.body.errors).toEqual([{ line: 1, reason: 'Expected a JSON array' }]);
    const badRecord = await json('/ingest/funding-webhooks', [{ event_id: 'fw_1' }]).expect(422);
    expect(badRecord.body.message).toMatch(/^funding-webhooks: /);
    expect(badRecord.body.errors[0]).toMatchObject({ line: 1, reason: expect.stringContaining('deposit_tx_hash') });
  });

  it('answers 400 for JSON that does not even parse', async () => {
    await http().post('/ingest/payout-events').set('Content-Type', 'application/json').send('{nope').expect(400);
  });

  it('answers 415 when a CSV feed is not sent as text/csv', async () => {
    const res = await json('/ingest/deposits', []).expect(415);
    expect(res.body.message).toMatch(/text\/csv/);
  });
});
