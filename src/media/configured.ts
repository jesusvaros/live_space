import { supabase } from '../lib/supabase';
import { createCloudinaryMediaProvider } from './cloudinary';

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};
const supabaseUrl = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '';

export const createConfiguredCloudinaryMediaProvider = () => {
  if (!supabaseUrl) {
    throw new Error('Supabase is not configured for media uploads.');
  }

  return createCloudinaryMediaProvider({
    edgeFunctionUrl: `${supabaseUrl.replace(/\/$/, '')}/functions/v1/cloudinary-sign-upload`,
    getAccessToken: async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      return data.session?.access_token ?? null;
    },
  });
};
