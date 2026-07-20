import { env } from '../config/env.js';
import { processPendingStaging } from '../pipeline/processStaging.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger(env.logLevel, { script: 'processPendingStaging' });

processPendingStaging(logger).catch((error) => {
  logger.error('Processing pending staging failed', error);
  process.exitCode = 1;
});
