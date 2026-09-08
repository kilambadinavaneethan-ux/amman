import React, { createContext, useContext, useRef, useCallback, useEffect } from "react";
import { usePathname } from "expo-router";

interface ScrollContextType {
  getScrollPosition: (key: string) => number;
  setScrollPosition: (key: string, y: number) => void;
}

const ScrollContext = createContext<ScrollContextType>({
  getScrollPosition: () => 0,
  setScrollPosition: () => {},
});

export const ScrollProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const positionsRef = useRef<Record<string, number>>({});

  const getScrollPosition = useCallback((key: string) => {
    return positionsRef.current[key] || 0;
  }, []);

  const setScrollPosition = useCallback((key: string, y: number) => {
    if (typeof y === "number" && !isNaN(y) && y >= 0) {
      positionsRef.current[key] = y;
    }
  }, []);

  return (
    <ScrollContext.Provider value={{ getScrollPosition, setScrollPosition }}>
      {children}
    </ScrollContext.Provider>
  );
};

export const useScrollRestoration = (customKey?: string) => {
  const pathname = usePathname();
  const key = customKey || pathname;
  const { getScrollPosition, setScrollPosition } = useContext(ScrollContext);
  const scrollViewRef = useRef<any>(null);
  const hasRestoredRef = useRef(false);
  const userScrolledRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    hasRestoredRef.current = false;
    userScrolledRef.current = false;

    // Timeout fallback: after 600ms mark restoration as done so late layout events don't jerk UI
    const timer = setTimeout(() => {
      if (isMountedRef.current) {
        hasRestoredRef.current = true;
      }
    }, 600);

    return () => {
      isMountedRef.current = false;
      clearTimeout(timer);
    };
  }, [key]);

  const lastScrollTimeRef = useRef(0);

  const handleScroll = useCallback(
    (event: any) => {
      if (!isMountedRef.current) return;

      const contentOffset = event?.nativeEvent?.contentOffset;
      if (!contentOffset) return;

      const x = contentOffset.x || 0;
      const y = contentOffset.y || 0;

      // Ignore scroll events originating from nested horizontal ScrollViews
      if (x > 0 && Math.abs(y) < 1) {
        return;
      }

      if (typeof y === "number" && !isNaN(y)) {
        const now = Date.now();
        // Throttle updates to at most once per 100ms, or when reaching the top (y === 0)
        if (now - lastScrollTimeRef.current < 100 && y > 0) {
          return;
        }
        lastScrollTimeRef.current = now;

        if (y > 0) {
          if (hasRestoredRef.current) {
            userScrolledRef.current = true;
          }
          setScrollPosition(key, y);
        } else if (y === 0 && userScrolledRef.current && hasRestoredRef.current) {
          // Only update to 0 if restoration is complete and user actively scrolled to top
          setScrollPosition(key, 0);
        }
      }
    },
    [key, setScrollPosition]
  );

  const doScroll = useCallback(
    (savedY: number) => {
      if (!scrollViewRef.current || !isMountedRef.current) return;
      try {
        if (typeof scrollViewRef.current.scrollTo === "function") {
          scrollViewRef.current.scrollTo({ y: savedY, animated: false });
        } else if (typeof scrollViewRef.current.scrollToOffset === "function") {
          scrollViewRef.current.scrollToOffset({ offset: savedY, animated: false });
        }
      } catch {
        // Ignore
      }
    },
    []
  );

  const handleContentSizeChange = useCallback(
    (_w: number, h: number) => {
      const savedY = getScrollPosition(key);
      if (!hasRestoredRef.current && !userScrolledRef.current && savedY > 0 && h > 0) {
        if (h >= savedY) {
          hasRestoredRef.current = true;
        }
        requestAnimationFrame(() => {
          doScroll(savedY);
          // Small safety timer to enable userScrolledRef tracking after restoration
          setTimeout(() => {
            if (isMountedRef.current) {
              hasRestoredRef.current = true;
            }
          }, 80);
        });
      }
    },
    [key, getScrollPosition, doScroll]
  );

  return {
    scrollViewRef,
    handleScroll,
    handleContentSizeChange,
    savedY: getScrollPosition(key),
  };
};

export default function ScrollContextRoutePlaceholder() {
  return null;
}
