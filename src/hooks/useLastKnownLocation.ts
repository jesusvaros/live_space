import { useCallback, useEffect, useState } from 'react';
import { StoredLocation, persistStoredLocation, useStoredLocation } from './useStoredLocation';

export const useLastKnownLocation = () => {
  const stored = useStoredLocation();
  const [location, setLocation] = useState<StoredLocation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (stored) setLocation(stored);
  }, [stored]);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Location is not supported on this device.');
      return;
    }
    setLoading(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      position => {
        const next = { lat: position.coords.latitude, lng: position.coords.longitude };
        setLocation(next);
        persistStoredLocation(next);
        setLoading(false);
      },
      () => {
        setLoading(false);
        setError('Enable location to see concerts near you.');
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  }, []);

  return { location, loading, error, requestLocation };
};

