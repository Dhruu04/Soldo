import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { Camera, X, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

interface Props {
  open: boolean;
  onClose: () => void;
  onDecode: (text: string) => void;
}

export function BarcodeScanner({ open, onClose, onDecode }: Props) {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setReady(false);
    const reader = new BrowserMultiFormatReader();
    let cancelled = false;

    (async () => {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        if (!devices.length) {
          setError(t("scan.err.nocamera"));
          return;
        }
        // Prefer back camera
        const back = devices.find((d) => /back|rear|environment/i.test(d.label)) ?? devices[devices.length - 1];
        if (!videoRef.current || cancelled) return;
        const controls = await reader.decodeFromVideoDevice(
          back.deviceId,
          videoRef.current,
          (result, err, ctrl) => {
            if (result) {
              ctrl.stop();
              onDecode(result.getText());
              onClose();
            }
          },
        );
        controlsRef.current = controls;
        setReady(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
      try {
        controlsRef.current?.stop();
      } catch {
        /* noop */
      }
      controlsRef.current = null;
    };
  }, [open, onDecode, onClose, t]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" /> {t("scan.title")}
          </DialogTitle>
          <DialogDescription>{t("scan.help")}</DialogDescription>
        </DialogHeader>
        {error ? (
          <div className="text-center space-y-3 py-6">
            <AlertCircle className="h-10 w-10 mx-auto text-destructive" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" onClick={onClose}>
              <X className="h-4 w-4 mr-2" /> {t("common.close")}
            </Button>
          </div>
        ) : (
          <div className="relative rounded-lg overflow-hidden bg-black aspect-[4/3]">
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-0.5 bg-primary/80 shadow-[0_0_12px_var(--primary)]" />
              <div className="absolute inset-6 border-2 border-primary/60 rounded-md" />
            </div>
            {!ready && (
              <div className="absolute inset-0 grid place-items-center text-white text-xs">
                {t("scan.starting")}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
