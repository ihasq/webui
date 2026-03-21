import { useState, useEffect, useRef } from "react";

export interface AnimatedTextResult {
  displayed: string;
  stableEnd: number; // Index where stable (non-fading) text ends
}

/**
 * Smoothly reveals text character-by-character using an exponential
 * ease-out approach. Automatically adapts speed to the incoming rate:
 *   - Small buffer → 1 char/frame (typing feel)
 *   - Large buffer → accelerates to keep latency low
 *   - Streaming ends → flushes remaining content quickly
 *
 * Returns both the displayed text and the position where "stable" text ends,
 * allowing the caller to apply fade-in effects to newly added characters.
 */
export function useAnimatedText(
  content: string,
  isStreaming: boolean,
): AnimatedTextResult {
  // For historical (already-complete) messages, skip animation entirely.
  const [displayedLen, setDisplayedLen] = useState(() =>
    isStreaming ? 0 : content.length,
  );
  const [stableEnd, setStableEnd] = useState(() =>
    isStreaming ? 0 : content.length,
  );

  const lenRef = useRef(displayedLen);
  const stableEndRef = useRef(stableEnd);
  const contentRef = useRef(content);
  const isStreamingRef = useRef(isStreaming);

  // Keep refs in sync (no extra renders)
  contentRef.current = content;
  isStreamingRef.current = isStreaming;

  useEffect(() => {
    // Nothing to animate for already-complete messages
    if (!isStreamingRef.current && lenRef.current >= contentRef.current.length) {
      return;
    }

    let raf: number;
    let prev: number | undefined;
    let stableUpdateTimer: number | undefined;

    const tick = (now: number) => {
      if (prev === undefined) {
        prev = now;
        raf = requestAnimationFrame(tick);
        return;
      }

      const dt = (now - prev) / 1000; // seconds
      prev = now;

      const target = contentRef.current.length;
      const remaining = target - lenRef.current;

      if (remaining > 0) {
        // Exponential ease-out: close a fraction of the gap each frame.
        const speed = isStreamingRef.current ? 10 : 24;
        const fraction = 1 - Math.exp(-speed * dt);
        const advance = Math.max(1, Math.ceil(remaining * fraction));

        lenRef.current = Math.min(target, lenRef.current + advance);
        setDisplayedLen(lenRef.current);

        // Update stable end with a small delay for fade effect
        clearTimeout(stableUpdateTimer);
        stableUpdateTimer = window.setTimeout(() => {
          stableEndRef.current = lenRef.current;
          setStableEnd(lenRef.current);
        }, 150);

        raf = requestAnimationFrame(tick);
      } else if (isStreamingRef.current) {
        // Caught up but still streaming — wait for more tokens
        raf = requestAnimationFrame(tick);
      } else {
        // Streaming done, ensure stable end catches up
        stableEndRef.current = lenRef.current;
        setStableEnd(lenRef.current);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(stableUpdateTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After streaming ends and animation has caught up, return full content
  if (!isStreaming && lenRef.current >= content.length) {
    return { displayed: content, stableEnd: content.length };
  }

  return {
    displayed: content.slice(0, displayedLen),
    stableEnd: Math.min(stableEnd, displayedLen),
  };
}
