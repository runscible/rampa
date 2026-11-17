import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { parseInstant } from '../../domain/shared/time';

/** Validates the optional `cutoff` query parameter: an ISO-8601 instant with an explicit offset. */
@Injectable()
export class CutoffPipe implements PipeTransform<string | undefined, string | undefined> {
  transform(value: string | undefined): string | undefined {
    if (value === undefined) return undefined;
    try {
      parseInstant(value);
      return value;
    } catch (error) {
      throw new BadRequestException(`Invalid cutoff: ${(error as Error).message}`);
    }
  }
}
