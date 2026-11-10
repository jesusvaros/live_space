import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FetchQueryOptions,
  QueryKey,
  QuerySnapshot,
  fetchQuery,
  getQuerySnapshot,
  serializeQueryKey,
  subscribeQuery,
} from '../../lib/queryClient';
import { useAppResume } from './useAppResume';

type UseQueryOptions<T> = FetchQueryOptions & {
  enabled?: boolean;
  initialData?: T;
  refetchOnResume?: boolean;
};

export const useQuery = <T>(
  queryKey: QueryKey,
  queryFn: () => Promise<T>,
  options?: UseQueryOptions<T>
) => {
  const serializedKey = useMemo(() => serializeQueryKey(queryKey), [queryKey]);
  const enabled = options?.enabled ?? true;
  const refetchOnResume = options?.refetchOnResume ?? true;
  const resumeTick = useAppResume();
  const hasHandledFirstResumeTick = useRef(false);
  const queryFnRef = useRef(queryFn);

  useEffect(() => {
    queryFnRef.current = queryFn;
  }, [queryFn]);

  const [snapshot, setSnapshot] = useState<QuerySnapshot<T>>(() => getQuerySnapshot<T>(serializedKey));

  useEffect(() => {
    setSnapshot(getQuerySnapshot<T>(serializedKey));
    return subscribeQuery(serializedKey, () => {
      setSnapshot(getQuerySnapshot<T>(serializedKey));
    });
  }, [serializedKey]);

  const run = useCallback(
    async (force = false) =>
      fetchQuery<T>(serializedKey, () => queryFnRef.current(), {
        ttlMs: options?.ttlMs,
        inFlightTtlMs: options?.inFlightTtlMs,
        timeoutMs: options?.timeoutMs,
        force,
      }),
    [options?.inFlightTtlMs, options?.timeoutMs, options?.ttlMs, serializedKey]
  );

  useEffect(() => {
    if (!enabled) return;
    void run();
  }, [enabled, run]);

  // Only a real resume forces a refetch. A new key also gives a new `run`,
  // and that must not count as a resume: the effect above already loads it,
  // and forcing here sent the same request twice.
  const lastResumeTick = useRef(resumeTick);
  useEffect(() => {
    if (!enabled || !refetchOnResume) return;
    if (!hasHandledFirstResumeTick.current) {
      hasHandledFirstResumeTick.current = true;
      lastResumeTick.current = resumeTick;
      return;
    }
    if (lastResumeTick.current === resumeTick) return;
    lastResumeTick.current = resumeTick;
    void run(true);
  }, [enabled, refetchOnResume, resumeTick, run]);

  const data = (snapshot.data ?? options?.initialData) as T | undefined;
  const loading = snapshot.status === 'loading' || (enabled && data === undefined);
  const error = snapshot.status === 'error' ? snapshot.error : null;

  return {
    data,
    loading,
    error,
    status: snapshot.status,
    refetch: () => run(true),
  };
};
