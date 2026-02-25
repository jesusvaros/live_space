import { useEffect, useState } from 'react';

export const useAppResume = () => {
  const [resumeTick, setResumeTick] = useState(0);

  useEffect(() => {
    const handleResume = () => {
      if (document.visibilityState && document.visibilityState !== 'visible') return;
      setResumeTick(prev => prev + 1);
    };

    window.addEventListener('focus', handleResume);
    document.addEventListener('visibilitychange', handleResume);

    return () => {
      window.removeEventListener('focus', handleResume);
      document.removeEventListener('visibilitychange', handleResume);
    };
  }, []);

  return resumeTick;
};
