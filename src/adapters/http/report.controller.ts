import { Controller, Get, Inject, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ReconciliationService } from '../../application/reconciliation-service';
import { AppConfig, APP_CONFIG } from '../../config/app-config';
import { balancesJson, breaksJson, ledgerJson, renderJsonReport } from '../report/json-report';
import { renderTextReport } from '../report/text-report';
import { CutoffPipe } from './cutoff.pipe';

/** Read side. Every endpoint takes an optional `?cutoff=` (ISO-8601 with offset); the default is the configured one. */
@Controller()
export class ReportController {
  constructor(
    private readonly service: ReconciliationService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get('balances')
  async balances(@Query('cutoff', CutoffPipe) cutoff?: string) {
    const asOf = cutoff ?? this.config.cutoff;
    return { asOf, balances: balancesJson((await this.service.report(asOf)).balances) };
  }

  @Get('breaks')
  async breaks(@Query('cutoff', CutoffPipe) cutoff?: string) {
    const asOf = cutoff ?? this.config.cutoff;
    const { timeZone } = this.config;
    return { asOf, timeZone, breaks: breaksJson((await this.service.report(asOf)).breaks, timeZone) };
  }

  @Get('ledger')
  async ledger(@Query('cutoff', CutoffPipe) cutoff?: string) {
    const asOf = cutoff ?? this.config.cutoff;
    return { asOf, ledger: ledgerJson((await this.service.report(asOf)).ledger) };
  }

  /** The whole report: JSON by default, plain text with `Accept: text/plain`. */
  @Get('report')
  async report(@Res() res: Response, @Query('cutoff', CutoffPipe) cutoff?: string): Promise<void> {
    const options = { cutoff: cutoff ?? this.config.cutoff, timeZone: this.config.timeZone };
    const result = await this.service.report(options.cutoff);
    const json = (): void => void res.type('application/json').send(renderJsonReport(result, options));
    res.format({
      'application/json': json,
      'text/plain': () => void res.send(renderTextReport(result, options)),
      default: json,
    });
  }
}
