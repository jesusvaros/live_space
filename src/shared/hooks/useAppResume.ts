import { useEffect, useState } from 'react';

export const useAppResume = () => {
  const [resumeTick, setResumeTick] = useState(0);

  useEffect(() => {
    const handleResume = () => {
      if (document.visibilityState && document.visibilityState !== 'visible') return;
      setResumeTick(prev => prev + 1);
    };

    window.addEventListener('focus', handleResume);
    window.addEventListener('pageshow', handleResume);
    document.addEventListener('visibilitychange', handleResume);
    document.addEventListener('resume', handleResume);

    return () => {
      window.removeEventListener('focus', handleResume);
      window.removeEventListener('pageshow', handleResume);
      document.removeEventListener('visibilitychange', handleResume);
      document.removeEventListener('resume', handleResume);
    };
  }, []);

  return resumeTick;
};
