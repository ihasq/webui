import { useCallback, useEffect, useRef, useState } from "react";

interface ResizeHandleProps {
  side: "left" | "right";
  width: number;
  minWidth?: number;
  maxWidth?: number;
  onResizeEnd: (newWidth: number) => void;
}

export function ResizeHandle({
  side,
  width,
  minWidth = 200,
  maxWidth = 480,
  onResizeEnd,
}: ResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(width);
  const currentWidthRef = useRef(width);

  // Sync ref with prop when not dragging
  useEffect(() => {
    if (!isDragging) {
      currentWidthRef.current = width;
    }
  }, [width, isDragging]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      startXRef.current = e.clientX;
      startWidthRef.current = currentWidthRef.current;
    },
    []
  );

  useEffect(() => {
    if (!isDragging) return;

    const cssVar = side === "left" ? "--sidebar-width" : "--settings-sidebar-width";
    const selector = side === "left" ? "[data-sidebar-width]" : "[data-settings-sidebar-width]";
    const parent = document.querySelector(selector) as HTMLElement | null;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startXRef.current;
      // For left sidebar, dragging right increases width
      // For right sidebar, dragging left increases width
      const newWidth = Math.min(
        maxWidth,
        Math.max(minWidth, startWidthRef.current + (side === "left" ? delta : -delta))
      );
      currentWidthRef.current = newWidth;

      // Directly update CSS custom property (bypasses React)
      if (parent) {
        parent.style.setProperty(cssVar, `${newWidth}px`);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      onResizeEnd(currentWidthRef.current);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, onResizeEnd, side, minWidth, maxWidth]);

  return (
    <div
      className={`absolute inset-y-0 hidden w-1 cursor-col-resize transition-colors hover:bg-ring/50 md:block ${
        side === "left" ? "right-0" : "left-0"
      } ${isDragging ? "bg-ring" : ""}`}
      onMouseDown={handleMouseDown}
    />
  );
}
