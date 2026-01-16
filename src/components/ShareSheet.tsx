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
        <div className="app-modal">
          <div className="app-modal-header">
            <h2 className="app-modal-title">Share</h2>
            <button type="button" className="app-button app-button--ghost app-button--small" onClick={onClose}>
              Close
            </button>
          </div>
          <div className="share-qr">
            {link && (
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(link)}`}
                alt="Event QR"
                className="h-40 w-40"
              />
            )}
          </div>
          <button type="button" className="app-button app-button--block" onClick={handleCopy}>
            <IconCopy className="app-icon" />
            Copy link
          </button>
          <button type="button" className="app-button app-button--outline app-button--block" onClick={handleShare}>
            <IconShare className="app-icon" />
            Share
          </button>
          {message && <p className="text-sm text-slate-400">{message}</p>}
        </div>
      </IonContent>
    </IonModal>
  );
};

export default ShareSheet;
