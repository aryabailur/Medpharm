"use client"

import { useState, useEffect, useRef, useCallback, useId } from "react"
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode"
import { C, FONT } from "../lib/theme"

interface BarcodeScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onScanFailure?: (error: unknown) => void;
}

type ScannerState = "initializing" | "scanning" | "permission_denied" | "no_camera" | "error"

export default function BarcodeScanner({ onScanSuccess, onScanFailure }: BarcodeScannerProps) {
  const reactId = useId().replace(/:/g, "_");
  const readerId = `barcode-reader-${reactId}`;
  
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ScannerState>("initializing");
  const [errorMessage, setErrorMessage] = useState("");
  const [lastDetected, setLastDetected] = useState<string | null>(null);
  const lastScannedRef = useRef<{ code: string; time: number }>({ code: "", time: 0 });
  const mountedRef = useRef(true);

  const handleDetection = useCallback((decodedText: string) => {
    const now = Date.now();
    // Debounce: ignore same barcode within 3 seconds
    if (
      decodedText === lastScannedRef.current.code &&
      now - lastScannedRef.current.time < 3000
    ) {
      return;
    }
    lastScannedRef.current = { code: decodedText, time: now };
    setLastDetected(decodedText);
    // Clear the visual indicator after 3 seconds
    setTimeout(() => setLastDetected(null), 3000);
    onScanSuccess(decodedText);
  }, [onScanSuccess]);

  useEffect(() => {
    mountedRef.current = true;
    let isCleanedUp = false;

    const startScanner = async () => {
      // Small delay for React Strict Mode double-mount
      await new Promise(r => setTimeout(r, 200));
      if (!mountedRef.current || isCleanedUp) return;

      // Clean container DOM if any stale elements exist from previous runs
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }

      // Stop & clear any previous scanner instance
      if (scannerRef.current) {
        try {
          if (scannerRef.current.isScanning) {
            await scannerRef.current.stop();
          }
          scannerRef.current.clear();
        } catch {
          // ignore cleanup errors
        }
        scannerRef.current = null;
      }

      if (!mountedRef.current || isCleanedUp) return;

      try {
        const scanner = new Html5Qrcode(readerId, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.QR_CODE,
          ],
          verbose: false,
        });

        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 15,
            qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
              const width = Math.min(Math.floor(viewfinderWidth * 0.85), 360);
              const height = Math.min(Math.floor(viewfinderHeight * 0.45), 180);
              return { width, height };
            },
            aspectRatio: 1.333,
            disableFlip: false,
          },
          handleDetection,
          (errorMsg) => {
            onScanFailure?.(errorMsg);
          }
        );

        if (mountedRef.current && !isCleanedUp) {
          setState("scanning");
        } else {
          // Unmounted while starting
          try {
            if (scanner.isScanning) {
              await scanner.stop();
            }
            scanner.clear();
          } catch {}
        }
      } catch (err: unknown) {
        if (!mountedRef.current || isCleanedUp) return;

        const msg = typeof err === "string" ? err : (err as Error)?.message || "";
        console.error("BarcodeScanner: start failed:", msg);

        if (
          msg.includes("NotAllowedError") ||
          msg.includes("Permission") ||
          msg.includes("denied")
        ) {
          setState("permission_denied");
          setErrorMessage("Camera access was denied. Please allow camera permissions in your browser settings and reload.");
        } else if (
          msg.includes("NotFoundError") ||
          msg.includes("no camera") ||
          msg.includes("Requested device not found")
        ) {
          setState("no_camera");
          setErrorMessage("No camera found on this device.");
        } else {
          setState("error");
          setErrorMessage(msg || "Could not start camera. Please try again.");
        }
      }
    };

    void startScanner();

    return () => {
      isCleanedUp = true;
      mountedRef.current = false;
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s) {
        s.stop()
          .then(() => {
            try { s.clear(); } catch {}
          })
          .catch(() => {
            try { s.clear(); } catch {}
          });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readerId]);

  const errorTitle =
    state === "permission_denied" ? "Camera Permission Required" :
    state === "no_camera" ? "No Camera Available" : "Camera Error";

  if (state === "permission_denied" || state === "no_camera" || state === "error") {
    return (
      <div style={{
        maxWidth: 440,
        margin: "0 auto",
        border: `1px solid #E7C9C6`,
        borderRadius: 10,
        background: C.redTint,
        padding: "24px 20px",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
      }}>
        <div style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: "#FBEAE8",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 22,
        }}>
          {state === "permission_denied" ? "📷" : "⚠️"}
        </div>
        <div style={{ font: `600 14px/1.3 ${FONT}`, color: C.red }}>{errorTitle}</div>
        <div style={{ font: `400 12px/1.5 ${FONT}`, color: C.inkMuted, maxWidth: 300 }}>
          {errorMessage}
        </div>
        {state === "permission_denied" && (
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 4,
              font: `600 12px/1 ${FONT}`,
              color: C.green,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Reload Page
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{
      maxWidth: 440,
      margin: "0 auto",
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      background: C.surface,
      overflow: "hidden",
      position: "relative",
    }}>
      {state === "initializing" && (
        <div style={{
          position: "absolute",
          inset: 0,
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(255,255,255,0.92)",
          gap: 8,
          minHeight: 220,
        }}>
          <div style={{
            width: 24,
            height: 24,
            border: `3px solid ${C.greenTint}`,
            borderTop: `3px solid ${C.green}`,
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }} />
          <div style={{ font: `400 12px/1.4 ${FONT}`, color: C.inkFaint }}>Starting camera…</div>
        </div>
      )}

      {/* Detection feedback overlay */}
      {lastDetected && (
        <div style={{
          position: "absolute",
          top: 8,
          left: 8,
          right: 8,
          zIndex: 20,
          animation: "fadeIn 0.2s ease",
        }}>
          <div style={{
            background: "rgba(24, 106, 59, 0.9)",
            color: "#fff",
            font: `500 12px/1.4 ${FONT}`,
            padding: "8px 12px",
            borderRadius: 8,
            textAlign: "center",
            backdropFilter: "blur(4px)",
          }}>
            ✓ Detected: <span style={{ fontFamily: "monospace" }}>{lastDetected}</span>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        #${readerId} { border: none !important; background: transparent !important; padding: 0 !important; overflow: hidden !important; }
        #${readerId} video { border-radius: 8px !important; width: 100% !important; max-height: 280px !important; object-fit: cover !important; display: block !important; }
        #${readerId} video:not(:last-of-type) { display: none !important; }
        #${readerId} canvas { border-radius: 8px !important; }
        #${readerId} img[alt="Info icon"] { display: none !important; }
        #${readerId}__dashboard_section,
        #${readerId}__dashboard_section_csr,
        #${readerId}__dashboard_section_swaplink,
        #${readerId}__header_message,
        #${readerId} button,
        #${readerId} select { display: none !important; }
        #${readerId}__scan_region { position: relative !important; }
        #${readerId}__scan_region > img { display: none !important; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
      `}} />
      <div id={readerId} ref={containerRef} style={{ width: "100%", minHeight: 220, position: "relative" }} />
    </div>
  );
}
