import React, { useEffect, useState } from 'react';
import { IconPlay } from '../icons';

type VideoThumbProps = {
  src: string;
  label: string;
  className?: string;
  onDuration?: (seconds: number) => void;
};


/**
 * First frame of a local video as an image. The WebView does not paint a
 * frame for preload="metadata", so it seeks a hidden video and copies the frame
 * to a canvas. If the codec cannot be decoded here, a neutral tile.
 */
const VideoThumb: React.FC<VideoThumbProps> = ({ src, label, className = '', onDuration }) => {
  const [frame, setFrame] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = src;
    const fail = () => {
      if (!cancelled) setFailed(true);
    };
    const timer = window.setTimeout(fail, 8_000);
    video.onloadedmetadata = () => {
      if (Number.isFinite(video.duration)) onDuration?.(video.duration);
      video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
    };
    video.onseeked = () => {
      window.clearTimeout(timer);
      try {
        const width = 160;
        const height = Math.round((width * (video.videoHeight || 200)) / (video.videoWidth || 160));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')?.drawImage(video, 0, 0, width, height);
        if (!cancelled) setFrame(canvas.toDataURL('image/jpeg', 0.7));
      } catch {
        fail();
      }
      video.removeAttribute('src');
      video.load();
    };
    video.onerror = () => {
      window.clearTimeout(timer);
      fail();
    };
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
    };
  }, [src]);

  if (frame) return <img src={frame} alt={label} className={`h-full w-full object-cover ${className}`} />;
  return (
    <span
      role="img"
      aria-label={label}
      className={`flex h-full w-full items-center justify-center bg-gradient-to-br from-[#2a2c33] to-[#17181d] text-white/60 ${className}`}
    >
      {failed ? <IconPlay size={22} /> : <span className="h-4 w-4 animate-pulse rounded-full bg-white/20" />}
    </span>
  );
};

export default VideoThumb;
