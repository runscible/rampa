import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp, ingestAllFiles } from '../support/app';

describe('GET /balances, /breaks, /ledger, /report', () => {
  let app: NestExpressApplication;
  beforeEach(async () => {
    app = await createTestApp();
  });
  afterEach(() => app.close());

  const http = () => request(app.getHttpServer());
  const at = (hhmm: string) => encodeURIComponent(`2026-10-05T${hhmm}:00-04:00`);

  it('start empty: zeros, no breaks, reconciled, version 0', async () => {
    const balances = await http().get('/balances').expect(200);
    expect(balances.body).toMatchObject({ version: 0, status: 'RECONCILED' });
    expect(balances.body.balances.bsPaidOut).toBe('0.00');
    expect((await http().get('/breaks').expect(200)).body.breaks).toEqual([]);
    expect((await http().get('/ledger').expect(200)).body.ledger).toEqual([]);
  });

  describe('after ingesting the four provided files', () => {
    beforeEach(() => ingestAllFiles(app));

    it('GET /balances gives the numbers of the plan, says it needs review and which data it was computed from', async () => {
      const res = await http().get('/balances').expect(200);
      expect(res.body).toEqual({
        asOf: '2026-10-05T20:00:00-04:00',
        version: 76,
        status: 'NEEDS_REVIEW',
        balances: {
          usdtUnconverted: '1500.00',
          usdtConverted: '14500.00',
          bsFunded: '141626.50',
          bsAvailable: '12120.95',
          bsPaidOut: '129505.55',
          bsInFlight: '3900.00',
          bsPaidOutIncompleteHistory: '0.00',
        },
      });
    });

    it('every read carries the version, and it does not move when the files are sent again', async () => {
      const paths = ['/balances', '/breaks', '/ledger', '/report', '/payouts', '/payouts/P018', '/deposits/0x080f626098377e96e40b2ff0260738034149998b08e5c086b940ae567580c32c'];
      for (const path of paths) expect((await http().get(path).expect(200)).body.version).toBe(76);
      await ingestAllFiles(app);
      for (const path of paths) expect((await http().get(path).expect(200)).body.version).toBe(76);
    });

    it('the version grows when something new is delivered', async () => {
      await http().post('/ingest/deposits').set('Content-Type', 'text/csv').send('tx_hash,amount_usdt,timestamp\n0xnew,10.00,2026-10-05T10:00:00-04:00\n').expect(200);
      expect((await http().get('/balances').expect(200)).body.version).toBe(77);
    });

    it('GET /breaks says the status too', async () => {
      const { body } = await http().get('/breaks').expect(200);
      expect(body).toMatchObject({ version: 76, status: 'NEEDS_REVIEW', breakCounts: { BREAK: 5, REVIEW: 1, INFO: 2 } });
    });

    it('GET /breaks lists the 5 breaks, 1 review and 2 info of the plan, in local time too', async () => {
      const { body } = await http().get('/breaks').expect(200);
      expect(body.timeZone).toBe('America/La_Paz');
      type Item = { severity: string; type: string; subject: string };
      expect(body.breaks.map((b: Item) => `${b.severity} ${b.type}`)).toEqual([
        'BREAK SPREAD_EXCEEDED',
        'BREAK NEGATIVE_BALANCE',
        'BREAK LATE_FUNDING_WEBHOOK',
        'BREAK DEPOSIT_WITHOUT_WEBHOOK',
        'BREAK STUCK_PAYOUT',
        'REVIEW PAYOUT_REVERSED',
        'INFO UNCONFIRMED_PREVIEW',
        'INFO DUPLICATE_DELIVERY',
      ]);
      expect(body.breaks.map((b: Item) => b.subject)).toEqual([
        'fw_003',
        'BS_PROVIDER_BALANCE',
        'fw_004',
        '0x12a750139ca2e4c14287bb6ed9ece9ee75b556a911f19f91c2f0d59ef40e7597',
        'P018',
        'P005',
        'P009',
        'pe_0029',
      ]);
      expect(body.breaks[1]).toMatchObject({ atLocal: '2026-10-05T16:26:00-04:00', untilLocal: '2026-10-05T17:10:00-04:00' });
    });

    it('GET /ledger returns the double-entry ledger', async () => {
      const { body } = await http().get('/ledger').expect(200);
      expect(body.ledger).toHaveLength(24);
      expect(body.ledger[0]).toMatchObject({ id: expect.stringMatching(/^deposit:/), lines: expect.any(Array) });
    });

    it('GET /report is JSON by default and plain text when asked', async () => {
      const json = await http().get('/report').expect(200).expect('Content-Type', /json/);
      expect(json.body.balances.bsPaidOut).toBe('129505.55');
      expect(json.body.breaks).toHaveLength(8);
      const text = await http().get('/report').set('Accept', 'text/plain').expect(200).expect('Content-Type', /text\/plain/);
      expect(text.text).toContain('RAMPA RECONCILIATION REPORT');
      expect(text.text).toContain('BREAKS (5 breaks, 1 review, 2 info)');
    });

    it('?cutoff= reports the state at another instant', async () => {
      const early = await http().get(`/balances?cutoff=${at('09:00')}`).expect(200);
      expect(early.body.asOf).toBe('2026-10-05T09:00:00-04:00');
      expect(early.body.balances.usdtConverted).toBe('5000.00');
      expect(early.body.balances.bsPaidOut).toBe('6200.00');
      const breaks = await http().get(`/breaks?cutoff=${at('09:00')}`).expect(200);
      expect(breaks.body.breaks).toEqual([]);
    });

    it('re-ingesting every file leaves the report byte for byte identical', async () => {
      const before = await http().get('/report').expect(200);
      await ingestAllFiles(app);
      const after = await http().get('/report').expect(200);
      expect(after.text).toBe(before.text);
    });

    it('feeds can arrive in any order', async () => {
      const other = await createTestApp();
      const { readData } = await import('../support/app');
      const http2 = request(other.getHttpServer());
      await http2.post('/ingest/payout-events').set('Content-Type', 'application/json').send(readData('payout_events.json')).expect(200);
      await http2.post('/ingest/funding-webhooks').set('Content-Type', 'application/json').send(readData('funding_webhooks.json')).expect(200);
      await http2.post('/ingest/rates').set('Content-Type', 'text/csv').send(readData('reference_rates.csv')).expect(200);
      await http2.post('/ingest/deposits').set('Content-Type', 'text/csv').send(readData('usdt_deposits.csv')).expect(200);
      const a = await http().get('/report').expect(200);
      const b = await http2.get('/report').expect(200);
      expect(b.text).toBe(a.text);
      await other.close();
    });
  });

  it.each(['yesterday', '2026-10-05T20:00:00', '2026-10-05'])('rejects an invalid cutoff (%s) with 400', async (cutoff) => {
    for (const path of ['/balances', '/breaks', '/ledger', '/report']) {
      const res = await http().get(`${path}?cutoff=${encodeURIComponent(cutoff)}`).expect(400);
      expect(res.body.message).toMatch(/cutoff/i);
    }
  });

  it('answers 404 for unknown routes', async () => {
    await http().get('/nope').expect(404);
  });
});
