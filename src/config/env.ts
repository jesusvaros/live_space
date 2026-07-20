import './loadEnv.js';

type Booleanish = 'true' | 'false' | '1' | '0' | 'yes' | 'no' | 'on' | 'off';

const TRUE_VALUES = new Set<Booleanish>(['true', '1', 'yes', 'on']);
const FALSE_VALUES = new Set<Booleanish>(['false', '0', 'no', 'off']);

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase() as Booleanish;
  if (TRUE_VALUES.has(normalized)) {
    return true;
  }

  if (FALSE_VALUES.has(normalized)) {
    return false;
  }

  return fallback;
};

const parseInteger = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const readRequired = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

export type ScraperEnv = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  openAiApiKey?: string;
  openAiModel: string;
  scraperConcurrency: number;
  scraperTimeoutMs: number;
  enableAiNormalization: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  errorScreenshotDir: string;
  cityAllowlist: string[];
};

export const env: ScraperEnv = {
  get supabaseUrl() {
    return readRequired('SUPABASE_URL');
  },
  get supabaseServiceRoleKey() {
    return readRequired('SUPABASE_SERVICE_ROLE_KEY');
  },
  get openAiApiKey() {
    return process.env.OPENAI_API_KEY || undefined;
  },
  openAiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  scraperConcurrency: parseInteger(process.env.SCRAPER_CONCURRENCY, 3),
  scraperTimeoutMs: parseInteger(process.env.SCRAPER_TIMEOUT_MS, 30_000),
  enableAiNormalization: parseBoolean(process.env.ENABLE_AI_NORMALIZATION, false),
  logLevel:
    (process.env.LOG_LEVEL as ScraperEnv['logLevel'] | undefined) ||
    (process.env.NODE_ENV === 'development' ? 'debug' : 'info'),
  errorScreenshotDir: process.env.SCRAPER_ERROR_SCREENSHOT_DIR || 'tmp/scraper-errors',
  cityAllowlist: (process.env.SCRAPER_CITY_ALLOWLIST || 'Madrid,Barcelona')
    .split(',')
    .map((city) => city.trim())
    .filter(Boolean),
};

export const assertOpenAiEnabled = () => {
  if (!env.enableAiNormalization) {
    throw new Error('AI normalization is disabled by configuration.');
  }

  if (!env.openAiApiKey) {
    throw new Error('ENABLE_AI_NORMALIZATION is true but OPENAI_API_KEY is missing.');
  }
};
