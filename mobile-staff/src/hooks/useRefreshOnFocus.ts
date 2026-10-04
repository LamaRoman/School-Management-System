import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';

/**
 * Bottom-tab screens stay mounted, so a `useEffect(..., [])` load runs once per app launch and
 * anything an admin changes on the web (a subject's full marks, new marks, an assignment) never
 * shows up until the app is killed. Call `refetch` every time the screen comes back into view.
 * The first focus is skipped: the screen's own mount effect has just loaded.
 */
export function useRefreshOnFocus(refetch: () => void) {
  const first = useRef(true);
  const latest = useRef(refetch);
  latest.current = refetch;
  useFocusEffect(
    useCallback(() => {
      if (first.current) { first.current = false; return; }
      latest.current();
    }, []),
  );
}
