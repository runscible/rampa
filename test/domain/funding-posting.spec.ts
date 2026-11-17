import { accountBalance, assertBalanced } from '../../src/domain/ledger/ledger';
import { postFunding } from '../../src/domain/ledger/posting';
import { createFundingEvent } from '../../src/domain/funding/funding-event';

const event = createFundingEvent({
  eventId: 'fw_001',
  depositTxHash: '0xabc',
  amountUsdt: 5000,
  rate: 9.7945,
  amountBs: 48972.5,
  timestamp: '2026-10-05T08:18:00-04:00',
});

describe('postFunding', () => {
  const entry = postFunding(event);

  it('has a deterministic id and the event time', () => {
    expect(entry.id).toBe('funding:fw_001');
    expect(entry.at).toBe(event.at);
  });

  it('is balanced in both currencies', () => {
    expect(() => assertBalanced([entry])).not.toThrow();
  });

  it('moves USDT from pending to converted and credits Bs through FX clearing', () => {
    expect(accountBalance([entry], 'USDT_WALLET_PENDING').toString()).toBe('-5000.00');
    expect(accountBalance([entry], 'USDT_CONVERTED').toString()).toBe('5000.00');
    expect(accountBalance([entry], 'BS_PROVIDER_BALANCE').toString()).toBe('48972.50');
    expect(accountBalance([entry], 'FX_CLEARING').toString()).toBe('-48972.50');
  });
});
