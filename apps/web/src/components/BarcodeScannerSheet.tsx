import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Html5Qrcode } from "html5-qrcode";
import { Camera, Keyboard, X } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { cn } from "@/lib/cn";

type Props = {
  open: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
  title?: string;
  hint?: string;
};

export function BarcodeScannerSheet({
  open,
  onClose,
  onScan,
  title = "Scan barcode",
  hint = "Barcode ko frame ke andar lao",
}: Props) {
  const titleId = useId();
  const regionId = useId().replace(/:/g, "");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);
  const handledRef = useRef(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState("");

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!open) return;
    handledRef.current = false;
    setCameraError(null);
    setManualOpen(false);
    setManualCode("");
    setStarting(true);

    let cancelled = false;
    const scanner = new Html5Qrcode(regionId);
    scannerRef.current = scanner;

    void (async () => {
      try {
        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 12,
            qrbox: (viewW, viewH) => {
              const width = Math.min(Math.floor(viewW * 0.86), 320);
              const height = Math.min(Math.floor(viewH * 0.28), 140);
              return { width, height };
            },
            aspectRatio: 1.777,
          },
          (decodedText) => {
            if (handledRef.current || cancelled) return;
            const code = decodedText.trim();
            if (!code) return;
            handledRef.current = true;
            onScanRef.current(code);
          },
          () => {
            /* frame miss — ignore */
          },
        );
        if (!cancelled) setStarting(false);
      } catch {
        if (!cancelled) {
          setStarting(false);
          setCameraError(
            "Camera open nahi hui. Permission do, ya neeche barcode type karo.",
          );
          setManualOpen(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      const current = scannerRef.current;
      scannerRef.current = null;
      if (!current) return;
      void (async () => {
        try {
          if (current.isScanning) await current.stop();
        } catch {
          /* already stopped */
        }
        try {
          current.clear();
        } catch {
          /* ignore */
        }
      })();
    };
  }, [open, regionId]);

  if (!open) return null;

  function submitManual() {
    const code = manualCode.trim();
    if (!code || handledRef.current) return;
    handledRef.current = true;
    onScanRef.current(code);
  }

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-ink/60"
        aria-label="Close scanner"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-[1] flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-soft sm:rounded-3xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <p id={titleId} className="truncate text-base font-bold text-ink">
              {title}
            </p>
            <p className="text-xs text-ink-muted">{hint}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-9 items-center justify-center rounded-full bg-paper-2 text-ink hover:bg-line"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <div className="relative overflow-hidden rounded-2xl bg-ink">
            <div
              id={regionId}
              className={cn(
                "min-h-[260px] w-full overflow-hidden [&_video]:h-full [&_video]:w-full [&_video]:object-cover",
                cameraError && "hidden",
              )}
            />
            {starting && !cameraError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink/80 text-white">
                <Camera className="size-8 animate-pulse" />
                <p className="text-sm">Camera start ho rahi hai…</p>
              </div>
            ) : null}
            {cameraError ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 px-6 text-center text-white">
                <Camera className="size-8 opacity-70" />
                <p className="text-sm leading-relaxed">{cameraError}</p>
              </div>
            ) : null}
          </div>

          {manualOpen ? (
            <div className="space-y-2 rounded-2xl border border-line bg-paper-2 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                <Keyboard className="size-3.5" />
                Manual barcode
              </p>
              <div className="flex gap-2">
                <Input
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="Barcode number type karo"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitManual();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="primary"
                  disabled={!manualCode.trim()}
                  onClick={submitManual}
                >
                  Go
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="text-sm font-semibold text-forest hover:underline"
              onClick={() => setManualOpen(true)}
            >
              Camera nahi chal rahi? Type barcode
            </button>
          )}

          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={onClose}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
