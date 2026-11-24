import { Capacitor } from '@capacitor/core';

// Shares a link with the system sheet (WhatsApp, mail…) or copies it.

export const copyLink = async (url: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
};

export const shareLink = async (url: string, text: string): Promise<'shared' | 'copied' | 'failed'> => {
  try {
    if (Capacitor.isNativePlatform()) {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title: text, text, url, dialogTitle: 'Compartir' });
      return 'shared';
    }
    if (navigator.share) {
      await navigator.share({ title: text, text, url });
      return 'shared';
    }
  } catch {
    // Cancelled or not available: copy instead.
  }
  return (await copyLink(url)) ? 'copied' : 'failed';
};

/** A mailto: link with the invite, for «invite by email» until we send mail ourselves. */
export const mailtoInvite = (email: string, subject: string, body: string) =>
  `mailto:${encodeURIComponent(email.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
