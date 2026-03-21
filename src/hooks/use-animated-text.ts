import { useState, useEffect, useRef } from "react";

const MAX_BUFFER = 20; // Maximum characters of delay
const BASE_CHARS_PER_SECOND = 60; // Base typing speed
const FLUSH_CHARS_PER_SECOND = 200; // Speed when flushing after stream ends

/**
 * Smoothly reveals text character-by-character with a natural typing feel.
 * - Maintains a maximum buffer of 20 characters delay
 * - Accelerates smoothly when buffer grows
 * - Flushes quickly when streaming ends
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
  const accumulatorRef = useRef(0); // Sub-character accumulator for smooth animation

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
        // Calculate speed based on buffer size and streaming state
        let charsPerSecond: number;

        if (!isStreamingRef.current) {
          // Streaming ended - flush remaining content quickly
          charsPerSecond = FLUSH_CHARS_PER_SECOND;
        } else if (remaining > MAX_BUFFER) {
          // Buffer exceeded - accelerate to catch up smoothly
          // Use exponential scaling for smooth acceleration
          const excess = remaining - MAX_BUFFER;
          charsPerSecond = BASE_CHARS_PER_SECOND + excess * 10;
        } else {
          // Normal streaming - smooth constant rate with slight acceleration
          // as buffer grows to prevent it from exceeding MAX_BUFFER
          const bufferRatio = remaining / MAX_BUFFER;
          charsPerSecond = BASE_CHARS_PER_SECOND * (1 + bufferRatio);
        }

        // Accumulate fractional characters for sub-frame smoothness
        accumulatorRef.current += charsPerSecond * dt;

        // Only advance when we have at least 1 full character
        if (accumulatorRef.current >= 1) {
          const advance = Math.min(Math.floor(accumulatorRef.current), remaining);
          accumulatorRef.current -= advance;
          lenRef.current = lenRef.current + advance;
          setDisplayedLen(lenRef.current);
        }

        raf = requestAnimationFrame(tick);
      } else if (isStreamingRef.current) {
        // Caught up but still streaming — wait for more tokens
        accumulatorRef.current = 0; // Reset accumulator when caught up
        raf = requestAnimationFrame(tick);
      }
      // else: streaming done & fully caught up → stop loop
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After streaming ends and animation has caught up, return the
  // original string directly (avoids a stale slice).
  if (!isStreaming && lenRef.current >= content.length) {
    return content;
  }

  return content.slice(0, displayedLen);
}
