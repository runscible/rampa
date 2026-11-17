import { NestExpressApplication } from '@nestjs/platform-express';

/** Largest CSV body accepted. JSON bodies use Nest's default limit. */
const CSV_BODY_LIMIT = '5mb';

/** HTTP setup shared by the real server and the tests, so both behave the same. */
export function configureApp(app: NestExpressApplication): void {
  app.useBodyParser('text', { type: 'text/csv', limit: CSV_BODY_LIMIT });
}
