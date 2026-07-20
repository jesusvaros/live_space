import type { Page } from 'playwright';

export type SourceType = 'venue' | 'festival' | 'promoter' | 'directory';

export type ParserKey =
  | 'apolo-agenda'
  | 'events-manager-calendar'
  | 'json-ld-agenda'
  | 'razzmatazz-agenda'
  | 'siroco-agenda'
  | 'tribe-events-api'
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
  termsReviewStatus?: 'pending' | 'approved' | 'rejected';
  fixtureVerified?: boolean;
  [key: string]: unknown;
};

export type ScrapeSource = {
  id: string;
  source_type: SourceType;
  name: string;
  base_url: string;
  city: string | null;
  country_code: string;
  parser_key: ParserKey;
  frequency: string;
  terms_reviewed_at?: string | null;
  is_active: boolean;
  metadata: ScrapeSourceMetadata;
  created_at?: string;
  updated_at?: string;
};

export type ScrapeRun = {
  id: string;
  source_id: string;
  status: 'pending' | 'running' | 'success' | 'partial' | 'error';
  started_at: string;
  finished_at: string | null;
  raw_count: number;
  normalized_count: number;
  published_count: number;
  metrics: Record<string, unknown>;
  error_message: string | null;
};

export type StagingEventRecord = {
  id: string;
  scrape_run_id: string;
  source_id: string;
  source_url: string;
  raw_payload: unknown;
  raw_hash: string;
  source_event_id: string | null;
  extracted_title: string | null;
  extracted_date_text: string | null;
  extracted_starts_at: string | null;
  extracted_venue_name: string | null;
  extracted_city: string | null;
  extracted_artist_names: string[];
  normalized_payload: unknown;
  confidence: number | null;
  review_status: 'pending' | 'approved' | 'rejected' | 'merged';
  published_event_id: string | null;
  processing_error: string | null;
  created_at: string;
  updated_at: string;
};

export type VenueParser = {
  key: ParserKey;
  canHandle: (url: string, html: string) => boolean;
  parseListPage: (page: Page, source: ScrapeSource) => Promise<RawScrapedEvent[]>;
};
