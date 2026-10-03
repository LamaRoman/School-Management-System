import { useCallback, useEffect, useState } from 'react';
import { api, getErrorMessage } from '../api/client';

export interface ActiveYear { id: string; yearBS: string; isActive: boolean }

/** The school's active academic year (or the first one if none is flagged), with load/error/retry. */
export function useActiveYear() {
  const [year, setYear] = useState<ActiveYear | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const years = await api.get<ActiveYear[]>('/academic-years');
      setYear(Array.isArray(years) ? years.find(y => y.isActive) ?? years[0] ?? null : null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  return { year, loading, error, reload: load };
}
