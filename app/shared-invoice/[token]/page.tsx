import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";
import { notFound } from "next/navigation";
import { InvoiceViewer, type InvoiceViewData } from "@/components/InvoiceViewer";
import { getCollection } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = {
  robots: { index: false, follow: false }
};

type PageProps = { params: Promise<{ token: string }> };

export default async function SharedInvoicePage({ params }: PageProps) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) notFound();
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const share = await (await getCollection("invoiceShares")).findOne({ tokenHash });
  if (!share || (share.expiresAt instanceof Date && share.expiresAt <= new Date())) notFound();
  const invoiceId = String(share.invoiceId || "");
  if (!ObjectId.isValid(invoiceId)) notFound();
  const invoice = await (await getCollection("invoices")).findOne({ _id: new ObjectId(invoiceId) });
  if (!invoice) notFound();
  const data: InvoiceViewData = {
    invoiceNumber: String(invoice.invoiceNumber || ""),
    customerName: String(invoice.customerName || ""),
    customerMobile: String(invoice.customerMobile || ""),
    invoiceDate: new Date(invoice.invoiceDate).toISOString(),
    paymentStatus: String(invoice.paymentStatus || ""),
    items: Array.isArray(invoice.items) ? invoice.items.map(item => ({
      productName: String(item.productName || ""),
      quantity: Number(item.quantity ?? 1),
      unitPrice: Number(item.unitPrice ?? item.amount ?? 0),
      amount: Number(item.amount || 0)
    })) : [],
    totalAmount: Number(invoice.totalAmount || 0),
    previousBalance: Number(invoice.previousBalance || 0),
    closingBalance: Number(invoice.closingBalance || 0),
    notes: typeof invoice.notes === "string" ? invoice.notes : undefined
  };
  return <InvoiceViewer invoice={data} publicMode/>;
}
