"use client"

import { useRef } from "react"
import { useReactToPrint } from "react-to-print"
import Barcode from "react-barcode"
import { QRCodeCanvas } from "qrcode.react"
import { C, FONT, rupees } from "@/lib/theme"

interface PrintBarcodeButtonProps {
  institutionName: string;
  medicineName: string;
  barcode: string;
  price?: number;
  batch?: string;
}

export function PrintBarcodeButton({
  institutionName,
  medicineName,
  barcode,
  price,
  batch,
}: PrintBarcodeButtonProps) {
  const barcodeRef = useRef<HTMLDivElement>(null);
  const qrRef = useRef<HTMLDivElement>(null);

  const handlePrintBarcode = useReactToPrint({
    contentRef: barcodeRef,
    documentTitle: `Barcode-${barcode}`,
    pageStyle: `
      @page { size: 2in 1in; margin: 0; }
      @media print {
        body { margin: 0; padding: 0; background: white !important; }
      }
    `
  });

  const handlePrintQR = useReactToPrint({
    contentRef: qrRef,
    documentTitle: `QRCode-${barcode}`,
    pageStyle: `
      @page { size: 2in 1in; margin: 0; }
      @media print {
        body { margin: 0; padding: 0; background: white !important; }
      }
    `
  });

  const qrData = [
    `Med: ${medicineName}`,
    `Barcode: ${barcode}`,
    price != null ? `Price: ${rupees(price)}` : null,
    batch ? `Batch: ${batch}` : null,
  ].filter(Boolean).join("\n");

  const btnStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "5px 10px",
    borderRadius: 6,
    border: `1px solid ${C.border}`,
    background: C.surface,
    color: C.inkMuted,
    font: `500 11px/1.2 ${FONT}`,
    cursor: "pointer",
    transition: "background 0.15s",
  };

  return (
    <>
      <button
        style={btnStyle}
        onClick={() => handlePrintBarcode()}
        title="Print Barcode Label"
        onMouseOver={e => (e.currentTarget.style.background = C.greyTint)}
        onMouseOut={e => (e.currentTarget.style.background = C.surface)}
      >
        🖨 Barcode
      </button>
      <button
        style={btnStyle}
        onClick={() => handlePrintQR()}
        title="Print QR Code Label"
        onMouseOver={e => (e.currentTarget.style.background = C.greyTint)}
        onMouseOut={e => (e.currentTarget.style.background = C.surface)}
      >
        ▣ QR Code
      </button>

      {/* Hidden printable area for Barcode */}
      <div style={{ display: "none" }}>
        <div
          ref={barcodeRef}
          style={{
            width: "2in",
            height: "1in",
            padding: "0.05in",
            boxSizing: "border-box",
            background: "white",
            color: "black",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          <div style={{ fontSize: 7, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#555", marginBottom: 2, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {institutionName}
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, textAlign: "center", marginBottom: 4, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {medicineName}
          </div>
          <Barcode
            value={barcode}
            format="CODE128"
            width={1.2}
            height={20}
            fontSize={10}
            margin={0}
            background="#ffffff"
            lineColor="#000000"
            displayValue={true}
          />
          {price != null && (
            <div style={{ fontSize: 9, fontWeight: 700, marginTop: 4 }}>
              {rupees(price)}
            </div>
          )}
        </div>
      </div>

      {/* Hidden printable area for QR Code */}
      <div style={{ display: "none" }}>
        <div
          ref={qrRef}
          style={{
            width: "2in",
            height: "1in",
            padding: "0.05in",
            boxSizing: "border-box",
            background: "white",
            color: "black",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          <div style={{ fontSize: 7, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#555", marginBottom: 2, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {institutionName}
          </div>
          <div style={{ fontSize: 9, fontWeight: 700, textAlign: "center", marginBottom: 3, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {medicineName}
          </div>
          <QRCodeCanvas
            value={qrData}
            size={36}
            level="M"
            marginSize={0}
          />
          {(price != null || batch) && (
            <div style={{ fontSize: 8, color: "#555", marginTop: 2, textAlign: "center" }}>
              {price != null ? rupees(price) : ""}
              {price != null && batch ? " | " : ""}
              {batch ? `B: ${batch.substring(0, 15)}` : ""}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
