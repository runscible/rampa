import { createBreak } from './break';
import { BreakRule } from './context';

const duplicates: BreakRule = ({ duplicates }) =>
  duplicates.map((d) => createBreak('DUPLICATE_DELIVERY', d.id, 'Delivered more than once with identical content; the repeat was ignored', d.at));

const conflicts: BreakRule = ({ conflicts }) =>
  conflicts.map((c) => createBreak('EVENT_CONFLICT', c.id, 'Delivered again with different content; the first delivery was kept', c.at));

export const INGESTION_RULES: BreakRule[] = [duplicates, conflicts];
