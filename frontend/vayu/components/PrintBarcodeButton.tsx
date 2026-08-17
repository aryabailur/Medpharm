"use client"

import { useRef } from "react"
import { useReactToPrint } from "react-to-print"
import Barcode from "react-barcode"
import { QRCodeCanvas } from "qrcode.react"
import { Printer, QrCode } from "lucide-react"
import { C, FONT } from "../lib/theme"

interface PrintBarcodeButtonProps {
  supplierName: string;
  productName: string;
  barcode: string;
  lotNumber?: string;
  batchId?: string;
}

export function PrintBarcodeButton({
  supplierName,
  productName,
  barcode,
  lotNumber,
  batchId,
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
    `Supplier: ${supplierName}`,
    `Product: ${productName}`,
    `Barcode: ${barcode}`,
    lotNumber ? `Lot: ${lotNumber}` : null,
    batchId ? `Batch: ${batchId}` : null,
  ].filter(Boolean).join("\n");

  const iconBtnStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 26,
    height: 26,
    borderRadius: 5,
    border: `1px solid ${C.border}`,
    background: C.surface,
    color: C.inkMuted,
    cursor: "pointer",
    transition: "background 0.15s, color 0.15s, border-color 0.15s",
    padding: 0,
  };

  return (
    <>
      <button
        style={iconBtnStyle}
        onClick={() => handlePrintBarcode()}
        title="Print Barcode Label"
        onMouseOver={e => {
          e.currentTarget.style.background = C.greyTint;
          e.currentTarget.style.color = C.ink;
        }}
        onMouseOut={e => {
          e.currentTarget.style.background = C.surface;
          e.currentTarget.style.color = C.inkMuted;
        }}
      >
        <Printer size={13} />
      </button>
      <button
        style={iconBtnStyle}
        onClick={() => handlePrintQR()}
        title="Print QR Code Label"
        onMouseOver={e => {
          e.currentTarget.style.background = C.greyTint;
          e.currentTarget.style.color = C.ink;
        }}
        onMouseOut={e => {
          e.currentTarget.style.background = C.surface;
          e.currentTarget.style.color = C.inkMuted;
        }}
      >
        <QrCode size={13} />
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
            {supplierName}
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, textAlign: "center", marginBottom: 4, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {productName}
          </div>
          <div style={{ maxWidth: "100%", overflow: "hidden", display: "flex", justifyContent: "center" }}>
            <Barcode
              value={barcode}
              format="CODE128"
              width={0.8}
              height={22}
              fontSize={8}
              margin={0}
              background="#ffffff"
              lineColor="#000000"
              displayValue={true}
            />
          </div>
          {lotNumber && (
            <div style={{ fontSize: 8, color: "#555", marginTop: 2 }}>
              Lot: {lotNumber}
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
            {supplierName}
          </div>
          <div style={{ fontSize: 9, fontWeight: 700, textAlign: "center", marginBottom: 3, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {productName}
          </div>
          <QRCodeCanvas
            value={qrData}
            size={36}
            level="M"
            marginSize={0}
          />
          {lotNumber && (
            <div style={{ fontSize: 8, color: "#555", marginTop: 2, textAlign: "center" }}>
              Lot: {lotNumber.substring(0, 20)}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
