import { env, assertOpenAiEnabled } from '../config/env.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import type { AiExtractionPayload } from '../types/domain.js';
import { createDeterministicHash } from '../utils/hash.js';
import { Logger } from '../utils/logger.js';

type AiExtractionInput = {
  title?: string | null;
  description?: string | null;
  venueName?: string | null;
  city?: string | null;
  dateText?: string | null;
  sourceEventUrl?: string | null;
};

type OpenAiChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
      refusal?: string | null;
    };
  }>;
};

const RESPONSE_SCHEMA = {
  name: 'concert_event_extraction',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'canonical_event_name',
      'event_type',
      'artists',
      'starts_at_text',
      'city',
      'venue_name',
      'confidence',
    ],
    properties: {
      canonical_event_name: { type: 'string' },
      event_type: {
        type: 'string',
        enum: ['concert', 'festival', 'session', 'unknown'],
      },
      artists: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'role', 'confidence'],
          properties: {
            name: { type: 'string' },
            role: {
              type: 'string',
              enum: ['headliner', 'support', 'guest', 'unknown'],
            },
            confidence: { type: 'number' },
          },
        },
      },
      starts_at_text: {
        anyOf: [{ type: 'string' }, { type: 'null' }],
      },
      city: {
        anyOf: [{ type: 'string' }, { type: 'null' }],
      },
      venue_name: {
        anyOf: [{ type: 'string' }, { type: 'null' }],
      },
      confidence: { type: 'number' },
    },
  },
} as const;

const validateAiPayload = (value: unknown): AiExtractionPayload => {
  if (!value || typeof value !== 'object') {
    throw new Error('AI response is not a JSON object.');
  }

  const payload = value as Record<string, unknown>;
  if (
    typeof payload.canonical_event_name !== 'string' ||
    typeof payload.event_type !== 'string' ||
    !Array.isArray(payload.artists)
  ) {
    throw new Error('AI response does not match the expected schema.');
  }

  return payload as unknown as AiExtractionPayload;
};

export const extractAmbiguousEventWithAi = async (
  input: AiExtractionInput,
  logger: Logger
): Promise<AiExtractionPayload> => {
  assertOpenAiEnabled();
  const supabase = getSupabaseAdmin();
  const inputHash = createDeterministicHash({
    model: env.openAiModel,
    input,
  });

  const { data: cachedRow, error: cacheLookupError } = await supabase
    .from('ai_extraction_cache')
    .select('response_payload')
    .eq('input_hash', inputHash)
    .maybeSingle();

  if (cacheLookupError) {
    throw cacheLookupError;
  }

  if (cachedRow?.response_payload) {
    logger.info('AI extraction cache hit', { inputHash });
    return validateAiPayload(cachedRow.response_payload);
  }

  logger.info('Calling OpenAI for ambiguous extraction', { inputHash, model: env.openAiModel });

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.openAiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.openAiModel,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content:
            'You extract structured concert event data from noisy Spanish listings. Be conservative. If uncertain, keep low confidence and avoid inventing artists or dates.',
        },
        {
          role: 'user',
          content: JSON.stringify(input),
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: RESPONSE_SCHEMA,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI request failed with ${response.status}: ${errorBody}`);
  }

  const json = (await response.json()) as OpenAiChatCompletionResponse;
  const message = json.choices?.[0]?.message;

  if (message?.refusal) {
    throw new Error(`OpenAI refused the request: ${message.refusal}`);
  }

  if (!message?.content) {
    throw new Error('OpenAI returned an empty structured response.');
  }

  const parsed = validateAiPayload(JSON.parse(message.content));

  const { error: cacheWriteError } = await supabase.from('ai_extraction_cache').upsert(
    {
      input_hash: inputHash,
      model: env.openAiModel,
      request_payload: input,
      response_payload: parsed,
    },
    { onConflict: 'input_hash' }
  );

  if (cacheWriteError) {
    throw cacheWriteError;
  }

  return parsed;
};
