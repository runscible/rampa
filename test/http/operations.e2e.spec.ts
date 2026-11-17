import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp, ingestAllFiles } from '../support/app';

describe('GET /payouts and /deposits (one view per operation)', () => {
  let app: NestExpressApplication;
  beforeEach(async () => {
    app = await createTestApp();
    await ingestAllFiles(app);
  });
  afterEach(() => app.close());

  const http = () => request(app.getHttpServer());
  const at = (hhmm: string) => encodeURIComponent(`2026-10-05T${hhmm}:00-04:00`);
  type Step = { eventId: string; type: string; applied: boolean };

  describe('GET /payouts/:payoutId', () => {
    it('P018: confirmed, never finished, no money moved, and the break that says so', async () => {
      const { body } = await http().get('/payouts/P018').expect(200);
      expect(body.asOf).toBe('2026-10-05T20:00:00-04:00');
      expect(body.payout).toMatchObject({ payoutId: 'P018', state: 'CONFIRMED', amountBs: '3900.00', paidOutBs: '0.00', missingSteps: [] });
      expect(body.payout.steps.map((s: Step) => [s.type, s.applied])).toEqual([['PREVIEW', true], ['CONFIRM', true]]);
      expect(body.payout.breaks.map((b: { type: string }) => b.type)).toEqual(['STUCK_PAYOUT']);
    });

    it('P005: completed and then reversed, so nothing is left paid out', async () => {
      const { body } = await http().get('/payouts/P005').expect(200);
      expect(body.payout).toMatchObject({ state: 'REVERSED', paidOutBs: '0.00' });
      expect(body.payout.steps.map((s: Step) => s.type)).toEqual(['PREVIEW', 'CONFIRM', 'COMPLETED', 'REVERSED']);
      expect(body.payout.breaks.map((b: { type: string }) => b.type)).toEqual(['PAYOUT_REVERSED']);
    });

    it('P010: the repeated delivery pe_0029 shows up as a break on the pay-out it belongs to', async () => {
      const { body } = await http().get('/payouts/P010').expect(200);
      expect(body.payout).toMatchObject({ state: 'COMPLETED', paidOutBs: '11200.00' });
      expect(body.payout.breaks.map((b: { type: string; subject: string }) => `${b.type} ${b.subject}`)).toEqual(['DUPLICATE_DELIVERY pe_0029']);
    });

    it('P009: a preview that was never confirmed', async () => {
      const { body } = await http().get('/payouts/P009').expect(200);
      expect(body.payout).toMatchObject({ state: 'PREVIEWED', paidOutBs: '0.00' });
      expect(body.payout.breaks.map((b: { type: string }) => b.type)).toEqual(['UNCONFIRMED_PREVIEW']);
    });

    it('every step carries its instant in UTC and in local time', async () => {
      const { body } = await http().get('/payouts/P018').expect(200);
      expect(body.payout.steps[0]).toMatchObject({ eventId: 'pe_0051', at: '2026-10-05T23:10:00.000Z', atLocal: '2026-10-05T19:10:00-04:00' });
    });

    it('answers 404 for a pay-out that does not exist, or that has no events by the cutoff', async () => {
      await http().get('/payouts/NOPE').expect(404);
      await http().get(`/payouts/P018?cutoff=${at('19:00')}`).expect(404);
    });

    it('?cutoff= shows the pay-out as it was then', async () => {
      const { body } = await http().get(`/payouts/P005?cutoff=${at('12:00')}`).expect(200);
      expect(body.payout).toMatchObject({ state: 'COMPLETED', paidOutBs: '3100.00' });
    });

    it('rejects an invalid cutoff with 400', async () => {
      await http().get('/payouts/P018?cutoff=ayer').expect(400);
    });
  });

  describe('GET /payouts', () => {
    it('lists every pay-out of the day, ordered by id', async () => {
      const { body } = await http().get('/payouts').expect(200);
      expect(body.payouts).toHaveLength(18);
      expect(body.payouts.map((p: { payoutId: string }) => p.payoutId)).toEqual(Array.from({ length: 18 }, (_, i) => `P${String(i + 1).padStart(3, '0')}`));
    });

    it('?state= filters, which is how a caller finds what is stuck', async () => {
      const confirmed = await http().get('/payouts?state=CONFIRMED').expect(200);
      expect(confirmed.body.payouts.map((p: { payoutId: string }) => p.payoutId)).toEqual(['P018']);
      const previewed = await http().get('/payouts?state=PREVIEWED').expect(200);
      expect(previewed.body.payouts.map((p: { payoutId: string }) => p.payoutId)).toEqual(['P009']);
      const reversed = await http().get('/payouts?state=REVERSED').expect(200);
      expect(reversed.body.payouts.map((p: { payoutId: string }) => p.payoutId)).toEqual(['P005']);
    });

    it('rejects a state that does not exist with 400', async () => {
      const res = await http().get('/payouts?state=bogus').expect(400);
      expect(res.body.message).toMatch(/state/i);
    });
  });

  describe('GET /deposits/:txHash', () => {
    const WITHOUT_WEBHOOK = '0x12a750139ca2e4c14287bb6ed9ece9ee75b556a911f19f91c2f0d59ef40e7597';
    const LATE = '0x080f626098377e96e40b2ff0260738034149998b08e5c086b940ae567580c32c';

    it('the deposit that never got its webhook', async () => {
      const { body } = await http().get(`/deposits/${WITHOUT_WEBHOOK}`).expect(200);
      expect(body.deposit).toMatchObject({ txHash: WITHOUT_WEBHOOK, depositedUsdt: '1500.00', convertedUsdt: '0.00', creditedBs: '0.00', fundings: [] });
      expect(body.deposit.breaks.map((b: { type: string }) => b.type)).toEqual(['DEPOSIT_WITHOUT_WEBHOOK']);
    });

    it('the deposit whose webhook arrived late, with the webhook and what it credited', async () => {
      const { body } = await http().get(`/deposits/${LATE}`).expect(200);
      expect(body.deposit).toMatchObject({ depositedUsdt: '2500.00', convertedUsdt: '2500.00', creditedBs: '24401.50' });
      expect(body.deposit.fundings).toEqual([expect.objectContaining({ eventId: 'fw_004', amountBs: '24401.50', rate: '9.7606' })]);
      expect(body.deposit.breaks.map((b: { type: string }) => b.type)).toEqual(['LATE_FUNDING_WEBHOOK']);
    });

    it('answers 404 for a transaction that is unknown', async () => {
      await http().get('/deposits/0xnope').expect(404);
    });
  });
});
