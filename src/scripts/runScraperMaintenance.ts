import { env } from '../config/env.js';
import { runScraperMaintenance } from '../pipeline/runScraperMaintenance.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger(env.logLevel, { script: 'runScraperMaintenance' });

runScraperMaintenance(logger).catch((error) => {
  logger.error('Scraper maintenance failed', error);
  process.exitCode = 1;
});
