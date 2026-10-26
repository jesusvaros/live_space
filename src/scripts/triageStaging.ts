import { env } from '../config/env.js';
import { runStagingTriage } from '../pipeline/stagingTriage.js';
import { Logger } from '../utils/logger.js';

// Dry-run by default: `npm run scrape:triage -- --apply [--with-r6]`.
const args = new Set(process.argv.slice(2));
const logger = new Logger(env.logLevel, { script: 'triageStaging' });

runStagingTriage({ apply: args.has('--apply'), includeR6: args.has('--with-r6'), logger })
  .then((plan) => {
    if (args.has('--list')) {
      for (const action of plan.actions.filter((item) => item.rule === 'R5' || item.rule === 'R6' || !item.rule)) {
        console.log(
          [action.rule || 'review', action.reviewStatus, action.sourceName, action.normalizedEvent?.startsAt, action.title]
            .join('\t'),
        );
      }
    }
  })
  .catch((error) => {
    logger.error('Staging triage failed', error);
    process.exitCode = 1;
  });
