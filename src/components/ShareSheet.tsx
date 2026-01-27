import React, { useEffect, useState } from 'react';
import {
  IonModal,
  IonContent,
} from '@ionic/react';
import { IconCopy, IconShare } from './icons';

type ShareSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  link: string;
};

const ShareSheet: React.FC<ShareSheetProps> = ({ isOpen, onClose, link }) => {
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setMessage('');
    }
  }, [isOpen]);

  const handleCopy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setMessage('Link copied.');
    } catch {
      setMessage('Copy failed. Long-press to copy.');
    }
  };

  const handleShare = async () => {
    if (!link) return;
    if (navigator.share) {
      try {
        await navigator.share({ url: link, title: 'Live Space event' });
        return;
      } catch {
        // Fall back to copy.
      }
    }
    handleCopy();
  };

  return (
    <IonModal
      isOpen={isOpen}
      onDidDismiss={onClose}
      initialBreakpoint={0.5}
      breakpoints={[0, 0.5, 0.9]}
      className="share-sheet"
    >
      <IonContent fullscreen>
        <div className="min-h-full bg-app-bg p-5">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-display text-lg font-bold text-white">Share</h2>
            <button
              type="button"
              className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70"
              onClick={onClose}
            >
              Close
            </button>
          </div>

          <div className="mt-6 flex items-center justify-center bg-white/5 p-5">
            {link && (
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(link)}`}
                alt="Event QR"
                className="h-40 w-40 bg-white"
              />
            )}
          </div>

          <div className="mt-6 space-y-2">
            <button type="button" className="inline-flex w-full items-center justify-center gap-2 bg-white/10 px-4 py-3 text-sm font-semibold text-white" onClick={handleCopy}>
              <IconCopy className="h-4 w-4" />
              Copy link
            </button>
            <button type="button" className="inline-flex w-full items-center justify-center gap-2 bg-white/10 px-4 py-3 text-sm font-semibold text-white" onClick={handleShare}>
              <IconShare className="h-4 w-4" />
              Share
            </button>
          </div>

          {message && <p className="mt-4 text-sm text-white/55">{message}</p>}
        </div>
      </IonContent>
    </IonModal>
  );
};

export default ShareSheet;
