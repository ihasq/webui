import { useRef, useState, useEffect } from "react";
import { cn } from "@/lib/utils";

/** Text that scrolls left when `hovering` is true and content overflows */
export function MarqueeText({
  text,
  hovering,
  className,
}: {
  text: string;
  hovering: boolean;
  className?: string;
}) {
  const outerRef = useRef<HTMLSpanElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;

    if (!hovering) {
      cancelAnimationFrame(rafRef.current);
      inner.style.transform = "translateX(0)";
      return;
    }

    const outer = outerRef.current;
    if (!outer) return;
    const distance = inner.scrollWidth - outer.clientWidth;
    if (distance <= 0) return;

    const speed = 30; // px per second
    const duration = (distance / speed) * 1000;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      inner.style.transform = `translateX(${-distance * progress}px)`;
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafRef.current);
  }, [hovering, text]);

  return (
    <span ref={outerRef} className={cn("block overflow-hidden", className)}>
      <span
        ref={innerRef}
        className="inline-block whitespace-nowrap transition-none"
      >
        {text}
      </span>
    </span>
  );
}

/** Wrapper component that manages hover state for MarqueeText */
export function MarqueeContainer({
  children,
  className,
  gradientClassName,
}: {
  children: (hovering: boolean) => React.ReactNode;
  className?: string;
  gradientClassName?: string;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={cn("relative min-w-0 overflow-hidden", className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children(hovered)}
      {/* Gradient fade on the right */}
      <div
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l to-transparent",
          gradientClassName ?? "from-sidebar"
        )}
      />
    </div>
  );
}
