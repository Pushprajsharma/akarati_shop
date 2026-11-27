"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { InvoiceViewer, type InvoiceViewData } from "@/components/InvoiceViewer";
import { api } from "@/lib/http";

export default function InvoicePrintPage() {
  const params = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<InvoiceViewData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<InvoiceViewData>(`/api/invoices/${params.id}`)
      .then(setInvoice)
      .catch(e => setError(e instanceof Error ? e.message : "Unable to load invoice"));
  }, [params.id]);

  if (error) return <main className="container"><p className="error">{error}</p></main>;
  if (!invoice) return <main className="container">Loading invoice...</main>;
  return <InvoiceViewer invoice={invoice} invoiceId={params.id}/>;
}
