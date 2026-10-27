import { supabase } from '../lib/supabase';
import { createCloudinaryMediaProvider } from './cloudinary';
import { R2MediaClient, R2MediaProvider } from './r2';
import type { MediaProvider } from './types';
import { waitForMediaAssetId } from './uploadPost';

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};
const supabaseUrl = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '';

const functionsBaseUrl = () => {
  if (!supabaseUrl) {
    throw new Error('Supabase is not configured for media uploads.');
  }
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1`;
};

const getAccessToken = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.access_token ?? null;
};

export const createConfiguredCloudinaryMediaProvider = () =>
  createCloudinaryMediaProvider({
    edgeFunctionUrl: `${functionsBaseUrl()}/cloudinary-sign-upload`,
    getAccessToken,
  });

export const createConfiguredR2Client = () =>
  new R2MediaClient({ functionsBaseUrl: functionsBaseUrl(), getAccessToken });

let routingProvider: R2MediaProvider | null = null;

/**
 * The provider screens should use: images go to Cloudinary; videos go to R2
 * when platform_settings.video_provider (or VIDEO_PROVIDER) is 'r2' and the R2
 * secrets exist, otherwise to Cloudinary exactly as before.
 */
export const getConfiguredMediaProvider = (): R2MediaProvider => {
  if (!routingProvider) {
    routingProvider = new R2MediaProvider({
      client: createConfiguredR2Client(),
      cloudinary: createConfiguredCloudinaryMediaProvider(),
      waitForAsset: (reservationId) => waitForMediaAssetId(reservationId, { attempts: 12, intervalMs: 500 }),
    });
  }
  return routingProvider;
};

export const createConfiguredMediaProvider = (): MediaProvider => getConfiguredMediaProvider();
