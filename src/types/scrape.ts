import type { Page } from 'playwright';

export type SourceType = 'venue' | 'festival' | 'promoter' | 'directory';

export type ParserKey =
  | 'generic-agenda'
  | 'wordpress-generic'
  | 'single-event-page'
  | 'resident-advisor-like';

export type RawScrapedEvent = {
  sourceUrl: string;
  sourceEventUrl?: string;
  sourceEventId?: string;
  title?: string;
  description?: string;
  dateText?: string;
  startsAt?: string | null;
  venueName?: string;
  city?: string;
  artistNames?: string[];
  rawPayload: unknown;
};

export type ScrapeSourceMetadata = {
  waitForSelector?: string;
  listItemSelector?: string;
  titleSelector?: string;
  dateSelector?: string;
  descriptionSelector?: string;
  linkSelector?: string;
  artistSelector?: string;
  venueSelector?: string;
  citySelector?: string;
  nextButtonSelector?: string;
  officialWebsite?: string;
  [key: string]: unknown;
};

export type ScrapeSource = {
  id: string;
  source_type: SourceType;
  source_name: string;
  source_url: string;
  city: string | null;
  country: string;
  parser_key: ParserKey;
  scrape_frequency: string;
  is_active: boolean;
  metadata: ScrapeSourceMetadata;
  created_at?: string;
  updated_at?: string;
};

export type ScrapeRun = {
  id: string;
  source_id: string;
  status: 'pending' | 'running' | 'success' | 'error';
  started_at: string;
  finished_at: string | null;
  raw_count: number;
  normalized_count: number;
  inserted_count: number;
  updated_count: number;
  error_message: string | null;
};

export type StagingEventRecord = {
  id: string;
  scrape_run_id: string;
  source_id: string;
  raw_payload: unknown;
  source_event_url: string | null;
  source_event_id: string | null;
  extracted_title: string | null;
  extracted_description: string | null;
  extracted_date_text: string | null;
  extracted_starts_at: string | null;
  extracted_venue_name: string | null;
  extracted_city: string | null;
  extracted_artist_names: string[];
  ai_normalized: unknown;
  normalization_status: 'pending' | 'processed' | 'error';
  processing_error: string | null;
  processed: boolean;
  created_at: string;
  updated_at: string;
};

export type VenueParser = {
  key: ParserKey;
  canHandle: (url: string, html: string) => boolean;
  parseListPage: (page: Page, source: ScrapeSource) => Promise<RawScrapedEvent[]>;
};
