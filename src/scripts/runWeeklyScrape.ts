import { env } from '../config/env.js';
import { processPendingStaging } from '../pipeline/processStaging.js';
import { scrapeSources } from '../pipeline/scrapeSources.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger(env.logLevel, { script: 'runWeeklyScrape' });

const run = async () => {
  const scrapeSummary = await scrapeSources(logger);
  logger.info('Weekly scrape phase finished', scrapeSummary);

  const processSummary = await processPendingStaging(logger);
  logger.info('Weekly process phase finished', processSummary);
};

run().catch((error) => {
  logger.error('Weekly scrape failed', error);
  process.exitCode = 1;
});
