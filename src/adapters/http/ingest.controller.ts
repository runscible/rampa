import { Body, Controller, HttpCode, Post, UnprocessableEntityException, UnsupportedMediaTypeException } from '@nestjs/common';
import { FeedName, FeedRecords } from '../../application/feeds';
import { IngestSummary, ReconciliationService } from '../../application/reconciliation-service';
import { ParseError } from '../files/csv';
import { parseDeposits } from '../files/parse-deposits';
import { fundingEventsFromJson } from '../files/parse-funding';
import { payoutEventsFromJson } from '../files/parse-payouts';
import { parseRates } from '../files/parse-rates';

/** How each feed is called in the URL, so error messages speak the caller's language. */
const ROUTE_NAMES: Record<FeedName, string> = {
  deposits: 'deposits',
  rates: 'rates',
  fundingEvents: 'funding-webhooks',
  payoutEvents: 'payout-events',
};

/**
 * Receives the four feeds. A request is all or nothing: if any record is invalid the answer is 422 with the
 * offending lines and nothing is stored, so a corrected file can simply be sent again.
 */
@Controller('ingest')
export class IngestController {
  constructor(private readonly service: ReconciliationService) {}

  @Post('deposits')
  @HttpCode(200)
  deposits(@Body() body: unknown): Promise<IngestSummary> {
    return this.saveOrReject('deposits', parseDeposits(this.csv(body)));
  }

  @Post('rates')
  @HttpCode(200)
  rates(@Body() body: unknown): Promise<IngestSummary> {
    return this.saveOrReject('rates', parseRates(this.csv(body)));
  }

  @Post('funding-webhooks')
  @HttpCode(200)
  fundingWebhooks(@Body() body: unknown): Promise<IngestSummary> {
    return this.saveOrReject('fundingEvents', fundingEventsFromJson(body));
  }

  @Post('payout-events')
  @HttpCode(200)
  payoutEvents(@Body() body: unknown): Promise<IngestSummary> {
    return this.saveOrReject('payoutEvents', payoutEventsFromJson(body));
  }

  private csv(body: unknown): string {
    if (typeof body !== 'string') throw new UnsupportedMediaTypeException('Send this feed as text/csv');
    return body;
  }

  private async saveOrReject<F extends FeedName>(feed: F, parsed: { records: Array<FeedRecords[F]>; errors: ParseError[] }): Promise<IngestSummary> {
    if (parsed.errors.length > 0) {
      throw new UnprocessableEntityException({
        message: `${ROUTE_NAMES[feed]}: ${parsed.errors.length} invalid record(s); nothing was stored`,
        errors: parsed.errors,
      });
    }
    return this.service.ingest(feed, parsed.records);
  }
}
