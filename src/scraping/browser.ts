import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { chromium, type Page } from 'playwright';

import { env } from '../config/env.js';
import { Logger } from '../utils/logger.js';

const REALISTIC_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';

const sanitizeSegment = (value: string): string => value.replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-');

type BrowserWorkOptions = {
  logger: Logger;
  sourceId?: string;
  sourceUrl?: string;
  timeoutMs?: number;
  screenshotOnError?: boolean;
};

export const withBrowserPage = async <T>(
  options: BrowserWorkOptions,
  worker: (page: Page) => Promise<T>
): Promise<T> => {
  const timeoutMs = options.timeoutMs ?? env.scraperTimeoutMs;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: REALISTIC_USER_AGENT,
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    viewport: { width: 1440, height: 1200 },
  });

  await context.route('**/*', async (route) => {
    const resourceType = route.request().resourceType();
    if (resourceType === 'image' || resourceType === 'media' || resourceType === 'font') {
      await route.abort();
      return;
    }

    await route.continue();
  });

  const page = await context.newPage();
  page.setDefaultNavigationTimeout(timeoutMs);
  page.setDefaultTimeout(timeoutMs);

  try {
    return await worker(page);
  } catch (error) {
    if (options.screenshotOnError !== false) {
      try {
        const directory = path.resolve(env.errorScreenshotDir);
        await mkdir(directory, { recursive: true });
        const screenshotPath = path.join(
          directory,
          [
            sanitizeSegment(options.sourceId || 'source'),
            sanitizeSegment(new Date().toISOString()),
          ].join('-') + '.png'
        );
        await page.screenshot({ path: screenshotPath, fullPage: true });
        options.logger.error('Saved scraper error screenshot', undefined, {
          screenshotPath,
          sourceId: options.sourceId,
          sourceUrl: options.sourceUrl,
        });
      } catch (screenshotError) {
        options.logger.error('Failed to save scraper error screenshot', screenshotError, {
          sourceId: options.sourceId,
          sourceUrl: options.sourceUrl,
        });
      }
    }

    throw error;
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
};
