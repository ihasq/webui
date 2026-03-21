import { Button } from "@/components/ui/button";
import { RefreshCw, X } from "lucide-react";

interface UpdatePromptProps {
  onUpdate: () => void;
  onDismiss: () => void;
}

export function UpdatePrompt({ onUpdate, onDismiss }: UpdatePromptProps) {
  return (
    <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="flex items-center gap-3 rounded-xl border bg-background/95 px-4 py-3 shadow-lg backdrop-blur-md">
        <RefreshCw className="size-4 text-primary" />
        <span className="text-sm">A new version is available</span>
        <div className="flex gap-1.5">
          <Button size="sm" onClick={onUpdate}>
            Update
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={onDismiss}>
            <X className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
