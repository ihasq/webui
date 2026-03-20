import { useState, useEffect, useRef } from "react";

/**
 * Smoothly reveals text character-by-character using an exponential
 * ease-out approach. Automatically adapts speed to the incoming rate:
 *   - Small buffer → 1 char/frame (typing feel)
 *   - Large buffer → accelerates to keep latency low
 *   - Streaming ends → flushes remaining content quickly
 */
export function useAnimatedText(
  content: string,
  isStreaming: boolean,
): string {
  // For historical (already-complete) messages, skip animation entirely.
  const [displayedLen, setDisplayedLen] = useState(() =>
    isStreaming ? 0 : content.length,
  );

  const lenRef = useRef(displayedLen);
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
        // speed 10 → ~15 % per frame @60 fps  → low latency, smooth feel
        // speed 24 → ~32 % per frame @60 fps  → fast flush after stream ends
        const speed = isStreamingRef.current ? 10 : 24;
        const fraction = 1 - Math.exp(-speed * dt);
        const advance = Math.max(1, Math.ceil(remaining * fraction));

        lenRef.current = Math.min(target, lenRef.current + advance);
        setDisplayedLen(lenRef.current);

        raf = requestAnimationFrame(tick);
      } else if (isStreamingRef.current) {
        // Caught up but still streaming — wait for more tokens
        raf = requestAnimationFrame(tick);
      }
      // else: streaming done & fully caught up → stop loop
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
    // Effect runs once per component mount; refs handle value changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After streaming ends and animation has caught up, return the
  // original string directly (avoids a stale slice).
  if (!isStreaming && lenRef.current >= content.length) {
    return content;
  }

  return content.slice(0, displayedLen);
}
