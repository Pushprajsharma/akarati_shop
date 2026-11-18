import { NextRequest, NextResponse } from "next/server";
import { ClientSession, ObjectId } from "mongodb";
import { getDb, getMongoClient, getCollection } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { roundMoney } from "@/lib/finance";

type InvoiceItem = { productName: string; quantity: number; unitPrice: number; amount: number };
type InvoiceTransaction = {
  customerId: string;
  transactionType: "DEBIT" | "CREDIT";
  amount: number;
  description: string;
  transactionDate: Date;
  createdAt: Date;
  referenceId: string;
  invoiceId: string;
  entryCategory: "INVOICE" | "PAYMENT";
  entryOrder: number;
};
type CreateInvoiceResponse = {
  success: true;
  invoiceId: string;
  invoiceNumber: string;
  totalAmount: number;
  paymentStatus: string;
  previousBalance: number;
  closingBalance: number;
};
type InvoiceRequestBody = {
  customerId?: unknown;
  paymentStatus?: unknown;
  items?: unknown;
  invoiceDate?: unknown;
  notes?: unknown;
};

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const customerId = request.nextUrl.searchParams.get("customerId");
    const filter = customerId ? { customerId } : {};
    const invoices = await (await getCollection("invoices")).find(filter).sort({ invoiceDate: -1, createdAt: -1 }).limit(500).toArray();
    return NextResponse.json(invoices.map(i => ({ ...i, _id: i._id.toString() })));
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to load invoices" }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  let session: ClientSession | undefined;
  try {
    await requireAdmin();
    const body = await request.json() as InvoiceRequestBody;
    const customerId = String(body.customerId || "");
    const paymentStatus = String(body.paymentStatus || "").toUpperCase();
    if (!ObjectId.isValid(customerId)) return NextResponse.json({ error: "Select a valid customer." }, { status: 400 });
    if (!["PAID", "UNPAID"].includes(paymentStatus)) return NextResponse.json({ error: "Payment status must be PAID or UNPAID." }, { status: 400 });
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) return NextResponse.json({ error: "Add between 1 and 100 invoice items." }, { status: 400 });
    const items = body.items.map((input: unknown): InvoiceItem => {
      if (typeof input !== "object" || input === null || Array.isArray(input)) {
        throw new Error("Each invoice item must be an object.");
      }
      const item = input as Record<string, unknown>;
      const productName = String(item.productName || "").trim();
      const quantity = Number(item.quantity ?? 1);
      const unitPrice = roundMoney(Number(item.unitPrice ?? item.amount));
      const amount = roundMoney(quantity * unitPrice);
      if (!productName || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice <= 0 || !Number.isFinite(amount) || amount <= 0) {
        throw new Error("Each item needs a product name, a positive quantity, and a positive per-unit price.");
      }
      return { productName, quantity, unitPrice, amount };
    });
    const totalAmount = roundMoney(items.reduce((sum, item) => sum + item.amount, 0));
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) return NextResponse.json({ error: "Invoice total must be greater than zero." }, { status: 400 });
    const invoiceDate = body.invoiceDate ? new Date(String(body.invoiceDate)) : new Date();
    if (Number.isNaN(invoiceDate.getTime())) return NextResponse.json({ error: "Invalid invoice date." }, { status: 400 });

    const db = await getDb();
    session = (await getMongoClient()).startSession();
    let response: CreateInvoiceResponse | undefined;
    await session.withTransaction(async () => {
      const customers = db.collection("customers");
      const transactions = db.collection("transactions");
      const invoices = db.collection("invoices");
      const customer = await customers.findOne({ _id: new ObjectId(customerId), isActive: { $ne: false } }, { session });
      if (!customer) throw new Error("Customer not found or inactive.");
      const prior = await transactions.find({ customerId }, { session }).toArray();
      const debit = prior.filter(t => t.transactionType === "DEBIT").reduce((s, t) => s + Number(t.amount || 0), 0);
      const credit = prior.filter(t => t.transactionType === "CREDIT").reduce((s, t) => s + Number(t.amount || 0), 0);
      const previousBalance = roundMoney(Number(customer.openingBalance || 0) + debit - credit);
      const closingBalance = paymentStatus === "UNPAID" ? roundMoney(previousBalance + totalAmount) : previousBalance;
      const now = new Date();
      const counters = db.collection<{ _id: string; baseSequence: number; sequence: number }>("counters");
      const existingCounter = await counters.findOne({ _id: "invoice-number" }, { session });
      let baseSequence = 0;
      if (!existingCounter) {
        const existingCount = await invoices.countDocuments({}, { session });
        const numberedInvoices = await invoices.find(
          { invoiceNumber: /^INV-\d+$/ },
          { projection: { invoiceNumber: 1 }, session }
        ).toArray();
        const highestExistingNumber = numberedInvoices.reduce((highest, invoice) => {
          const number = Number(invoice.invoiceNumber.slice(4));
          return Number.isSafeInteger(number) ? Math.max(highest, number) : highest;
        }, 0);
        baseSequence = Math.max(existingCount, highestExistingNumber);
      }
      await counters.updateOne(
        { _id: "invoice-number" },
        { $setOnInsert: { baseSequence }, $inc: { sequence: 1 } },
        { upsert: true, session }
      );
      const counter = await counters.findOne({ _id: "invoice-number" }, { session });
      if (!counter) throw new Error("Unable to allocate an invoice number.");
      const invoiceNumber = `INV-${String(counter.baseSequence + counter.sequence).padStart(4, "0")}`;
      const invoiceDoc = {
        invoiceNumber, customerId, customerName: customer.name, customerMobile: customer.mobile || "",
        invoiceDate, totalAmount, paymentStatus, notes: String(body.notes || "").trim(),
        previousBalance, closingBalance, items, createdAt: now
      };
      const inserted = await invoices.insertOne(invoiceDoc, { session });
      const invoiceId = inserted.insertedId.toString();
      const debitEntry: InvoiceTransaction = {
        customerId, transactionType: "DEBIT", amount: totalAmount,
        description: `Invoice ${invoiceNumber}`, transactionDate: invoiceDate, createdAt: now,
        referenceId: invoiceNumber, invoiceId, entryCategory: "INVOICE", entryOrder: 1
      };
      const txDocs: InvoiceTransaction[] = [debitEntry];
      if (paymentStatus === "PAID") txDocs.push({
        customerId, transactionType: "CREDIT", amount: totalAmount,
        description: `Payment received - ${invoiceNumber}`, transactionDate: invoiceDate, createdAt: new Date(now.getTime() + 1),
        referenceId: invoiceNumber, invoiceId, entryCategory: "PAYMENT", entryOrder: 2
      });
      await transactions.insertMany(txDocs, { session });
      response = { success: true, invoiceId, invoiceNumber, totalAmount, paymentStatus, previousBalance, closingBalance };
    });
    if (!response) throw new Error("Invoice creation did not complete.");
    return NextResponse.json(response, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Invoice creation failed. Ensure MongoDB supports transactions." }, { status: 400 });
  } finally {
    await session?.endSession();
  }
}
