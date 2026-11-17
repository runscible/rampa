import { Module } from '@nestjs/common';
import { InMemoryDeliveryRepository } from './adapters/memory/in-memory-delivery-repository';
import { IngestController } from './adapters/http/ingest.controller';
import { ReportController } from './adapters/http/report.controller';
import { DeliveryRepository } from './application/ports';
import { ReconciliationService } from './application/reconciliation-service';
import { APP_CONFIG, AppConfig, loadConfig } from './config/app-config';

export const DELIVERY_REPOSITORY = Symbol('DELIVERY_REPOSITORY');

/** Composition root: the only place that knows which implementation backs each port. */
@Module({
  controllers: [IngestController, ReportController],
  providers: [
    { provide: APP_CONFIG, useFactory: () => loadConfig() },
    { provide: DELIVERY_REPOSITORY, useFactory: (): DeliveryRepository => new InMemoryDeliveryRepository() },
    {
      provide: ReconciliationService,
      inject: [DELIVERY_REPOSITORY, APP_CONFIG],
      useFactory: (repository: DeliveryRepository, config: AppConfig) =>
        new ReconciliationService(repository, {
          cutoff: config.cutoff,
          fundingSlaMinutes: config.fundingSlaMinutes,
          payoutSlaMinutes: config.payoutSlaMinutes,
          maxSpread: config.maxSpread,
        }),
    },
  ],
  exports: [APP_CONFIG],
})
export class AppModule {}
