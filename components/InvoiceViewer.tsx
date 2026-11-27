"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/http";
import { formatINR } from "@/lib/finance";

export type InvoiceViewData = {
  invoiceNumber: string;
  customerName: string;
  customerMobile: string;
  invoiceDate: string;
  paymentStatus: string;
  items: Array<{ productName: string; quantity?: number; unitPrice?: number; amount: number }>;
  totalAmount: number;
  previousBalance: number;
  closingBalance: number;
  notes?: string;
};

export function InvoiceViewer({ invoice, invoiceId, publicMode = false }: { invoice: InvoiceViewData; invoiceId?: string; publicMode?: boolean }) {
  const invoiceRef = useRef<HTMLDivElement>(null);
  const [pdfError, setPdfError] = useState("");
  const [notice, setNotice] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [publicUrl, setPublicUrl] = useState("");

  async function createPdfFile() {
    if (!invoiceRef.current) throw new Error("Invoice is not ready to export.");
    const { default: html2pdf } = await import("html2pdf.js");
    const filename = `invoice-${invoice.invoiceNumber.replace(/[^\w-]/g, "_")}.pdf`;
    const blob = await html2pdf().set({
      margin: 10,
      filename,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
    }).from(invoiceRef.current).outputPdf("blob") as Blob;
    return new File([blob], filename, { type: "application/pdf" });
  }

  function downloadFile(file: File) {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function downloadPdf() {
    setPdfBusy(true);
    setPdfError("");
    setNotice("");
    try {
      downloadFile(await createPdfFile());
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : "Unable to generate invoice PDF");
    } finally {
      setPdfBusy(false);
    }
  }

  async function sharePdf() {
    setPdfBusy(true);
    setPdfError("");
    setNotice("");
    try {
      const file = await createPdfFile();
      const shareData: ShareData = {
        files: [file],
        title: `Invoice ${invoice.invoiceNumber}`,
        text: `Invoice ${invoice.invoiceNumber} from Aakarati Mobile`
      };
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share(shareData);
      } else {
        downloadFile(file);
        setNotice("This browser cannot share files directly. The PDF was downloaded; attach it to WhatsApp manually.");
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setPdfError(error instanceof Error ? error.message : "Unable to share invoice PDF");
      }
    } finally {
      setPdfBusy(false);
    }
  }

  async function createPublicLink() {
    if (!invoiceId) {
      setPdfError("Invoice ID is missing.");
      return;
    }
    setLinkBusy(true);
    setPdfError("");
    setNotice("");
    try {
      const result = await api<{ url: string }>(`/api/invoices/${encodeURIComponent(invoiceId)}/share`, { method: "POST" });
      setPublicUrl(result.url);
      setNotice("Public link created. Anyone with this link can view and download the invoice until you revoke or regenerate it.");
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : "Unable to create public link");
    } finally {
      setLinkBusy(false);
    }
  }

  async function revokePublicLink() {
    if (!invoiceId) {
      setPdfError("Invoice ID is missing.");
      return;
    }
    if (!window.confirm("Revoke the public invoice link? Anyone using the current link will lose access.")) return;
    setLinkBusy(true);
    setPdfError("");
    setNotice("");
    try {
      await api(`/api/invoices/${encodeURIComponent(invoiceId)}/share`, { method: "DELETE" });
      setPublicUrl("");
      setNotice("Public invoice link revoked.");
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : "Unable to revoke public link");
    } finally {
      setLinkBusy(false);
    }
  }

  async function copyPublicLink() {
    const url = publicMode ? window.location.href : publicUrl;
    if (!url) return;
    setPdfError("");
    try {
      await navigator.clipboard.writeText(url);
      setNotice("Public invoice link copied.");
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : "Unable to copy public link");
    }
  }

  function shareLinkOnWhatsApp() {
    const url = publicMode ? window.location.href : publicUrl;
    if (!url) return;
    const message = `Invoice ${invoice.invoiceNumber} from Aakarati Mobile: ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  return <main className="print-sheet">
    <div ref={invoiceRef} className="invoice-document">
      <div className="row"><div><h1>Aakarati Mobile</h1><p className="muted">Rajoriya Complex, Pipariya<br/>Phone: +91-8989655788</p></div><div className="right"><h1>INVOICE</h1><strong>{invoice.invoiceNumber}</strong></div></div>
      <hr/>
      <div className="row"><div><small className="muted">BILL TO</small><h2 style={{marginTop:6}}>{invoice.customerName}</h2><p>{invoice.customerMobile}</p></div><div className="right"><small className="muted">INVOICE DATE</small><p>{new Date(invoice.invoiceDate).toLocaleDateString("en-IN")}</p><span className={`badge ${invoice.paymentStatus.toLowerCase()}`}>{invoice.paymentStatus}</span></div></div>
      <table style={{marginTop:28}}><thead><tr><th>#</th><th>Product / Description</th><th className="right">Quantity</th><th className="right">Per-unit price</th><th className="right">Amount</th></tr></thead><tbody>{invoice.items.map((item,index)=><tr key={index}><td>{index+1}</td><td>{item.productName}</td><td className="right">{item.quantity ?? 1}</td><td className="right amount">{formatINR(item.unitPrice ?? item.amount)}</td><td className="right amount">{formatINR(item.amount)}</td></tr>)}</tbody></table>
      <div style={{maxWidth:360,marginLeft:"auto",marginTop:24}}>
        <div className="row"><span>Invoice total</span><strong>{formatINR(invoice.totalAmount)}</strong></div>
        <div className="row" style={{marginTop:10}}><span>Old balance</span><strong>{formatINR(invoice.previousBalance)}</strong></div>
        <hr/>
        <div className="row"><strong>Current Balance</strong><strong style={{fontSize:21}}>{formatINR(invoice.closingBalance)}</strong></div>
      </div>
      {invoice.notes&&<p style={{marginTop:30}}><strong>Notes:</strong> {invoice.notes}</p>}
      <p className="muted" style={{marginTop:50}}>Thank you for your business.</p>
    </div>
    {pdfError&&<p className="error no-print">{pdfError}</p>}
    {notice&&<p className="success no-print">{notice}</p>}
    <div className="no-print actions invoice-actions" style={{marginTop:24}}>
      <button className="btn" disabled={pdfBusy||linkBusy} onClick={downloadPdf}>{pdfBusy?"Preparing PDF...":"Download PDF"}</button>
      <button className="btn secondary" disabled={pdfBusy||linkBusy} onClick={sharePdf}>Share PDF</button>
      {publicMode
        ? <><button className="btn secondary" onClick={copyPublicLink}>Copy public link</button><button className="btn secondary" onClick={shareLinkOnWhatsApp}>Share link on WhatsApp</button></>
        : <><button className="btn secondary" disabled={pdfBusy||linkBusy} onClick={createPublicLink}>{linkBusy?"Updating link...":"Generate public link"}</button><button className="btn danger" disabled={pdfBusy||linkBusy} onClick={revokePublicLink}>Revoke public link</button>{publicUrl&&<><button className="btn secondary" onClick={copyPublicLink}>Copy link</button><button className="btn secondary" onClick={shareLinkOnWhatsApp}>Share link on WhatsApp</button><input className="public-invoice-url" aria-label="Public invoice link" readOnly value={publicUrl}/></>}</>}
      {!publicMode&&<button className="btn secondary" onClick={()=>window.print()}>Print</button>}
      <button className="btn secondary" onClick={()=>history.back()}>Back</button>
    </div>
  </main>;
}
