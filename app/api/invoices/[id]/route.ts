import { NextRequest, NextResponse } from "next/server";
import { ClientSession, ObjectId } from "mongodb";
import { getCollection, getDb, getMongoClient } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

type Context = { params: Promise<{ id: string }> };
type InvoiceItemInput = { productName?: unknown; quantity?: unknown; unitPrice?: unknown; amount?: unknown };
type InvoiceItem = { productName: string; quantity: number; unitPrice: number; amount: number };

function parseItems(input: unknown): InvoiceItem[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 100) {
    throw new Error("Add between 1 and 100 invoice items.");
  }
  return input.map((value: unknown) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("Each invoice item must be an object.");
    }
    const item = value as InvoiceItemInput;
    const productName = String(item.productName || "").trim();
    const quantity = Number(item.quantity ?? 1);
    const unitPrice = Math.round((Number(item.unitPrice ?? item.amount) + Number.EPSILON) * 100) / 100;
    const amount = Math.round((quantity * unitPrice + Number.EPSILON) * 100) / 100;
    if (!productName || !Number.isFinite(quantity) || quantity <= 0 ||
      !Number.isFinite(unitPrice) || unitPrice <= 0 || !Number.isFinite(amount) || amount <= 0) {
      throw new Error("Each item needs a product name, a positive quantity, and a positive per-unit price.");
    }
    return { productName, quantity, unitPrice, amount };
  });
}

export async function GET(_request: NextRequest, context: Context) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid invoice ID." }, { status: 400 });
    const invoice = await (await getCollection("invoices")).findOne({ _id: new ObjectId(id) });
    if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    return NextResponse.json({ ...invoice, _id: invoice._id.toString() });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to load invoice" }, { status: 500 }); }
}

export async function PATCH(request: NextRequest, context: Context) {
  let session: ClientSession | undefined;
  try {
    await requireAdmin();
    const { id } = await context.params;
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid invoice ID." }, { status: 400 });
    const body = await request.json();
    const items = parseItems(body.items);
    const paymentStatus = String(body.paymentStatus || "").toUpperCase();
    if (!["PAID", "UNPAID"].includes(paymentStatus)) {
      return NextResponse.json({ error: "Payment status must be PAID or UNPAID." }, { status: 400 });
    }
    const invoiceDate = new Date(String(body.invoiceDate || ""));
    if (Number.isNaN(invoiceDate.getTime())) return NextResponse.json({ error: "Invalid invoice date." }, { status: 400 });
    const totalAmount = Math.round((items.reduce((sum, item) => sum + item.amount, 0) + Number.EPSILON) * 100) / 100;
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return NextResponse.json({ error: "Invoice total must be greater than zero." }, { status: 400 });
    }

    const db = await getDb();
    session = (await getMongoClient()).startSession();
    let updated = false;
    await session.withTransaction(async () => {
      const invoices = db.collection("invoices");
      const invoice = await invoices.findOne({ _id: new ObjectId(id) }, { session });
      if (!invoice) return;
      const customers = db.collection("customers");
      const customer = await customers.findOne({ _id: new ObjectId(String(invoice.customerId)) }, { session });
      if (!customer) throw new Error("Invoice customer not found.");
      const transactions = db.collection("transactions");
      const priorTransactions = await transactions.find({ customerId: String(invoice.customerId), invoiceId: { $ne: id } }, { session }).toArray();
      const debit = priorTransactions.filter(tx => tx.transactionType === "DEBIT").reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
      const credit = priorTransactions.filter(tx => tx.transactionType === "CREDIT").reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
      const previousBalance = Math.round((Number(customer.openingBalance || 0) + debit - credit + Number.EPSILON) * 100) / 100;
      const closingBalance = paymentStatus === "UNPAID"
        ? Math.round((previousBalance + totalAmount + Number.EPSILON) * 100) / 100
        : previousBalance;
      const now = new Date();
      const invoiceNumber = String(invoice.invoiceNumber);
      const transactionFields = {
        amount: totalAmount,
        description: `Invoice ${invoiceNumber}`,
        transactionDate: invoiceDate,
        referenceId: invoiceNumber
      };
      const debitResult = await transactions.updateOne(
        { invoiceId: id, transactionType: "DEBIT" },
        { $set: transactionFields },
        { session }
      );
      if (!debitResult.matchedCount) {
        await transactions.insertOne({
          customerId: String(invoice.customerId),
          transactionType: "DEBIT",
          ...transactionFields,
          createdAt: now,
          invoiceId: id,
          entryCategory: "INVOICE",
          entryOrder: 1
        }, { session });
      }

      const paymentFilter = { invoiceId: id, transactionType: "CREDIT" };
      if (paymentStatus === "PAID") {
        const paymentFields = {
          amount: totalAmount,
          description: `Payment received - ${invoiceNumber}`,
          transactionDate: invoiceDate,
          referenceId: invoiceNumber
        };
        const paymentResult = await transactions.updateOne(paymentFilter, { $set: paymentFields }, { session });
        if (!paymentResult.matchedCount) {
          await transactions.insertOne({
            customerId: String(invoice.customerId),
            transactionType: "CREDIT",
            ...paymentFields,
            createdAt: new Date(now.getTime() + 1),
            invoiceId: id,
            entryCategory: "PAYMENT",
            entryOrder: 2
          }, { session });
        }
      } else {
        await transactions.deleteMany(paymentFilter, { session });
      }

      await invoices.updateOne({ _id: new ObjectId(id) }, {
        $set: {
          invoiceDate,
          totalAmount,
          paymentStatus,
          notes: String(body.notes || "").trim(),
          previousBalance,
          closingBalance,
          items
        }
      }, { session });
      updated = true;
    });
    if (!updated) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to update invoice" }, { status: 400 });
  } finally {
    await session?.endSession();
  }
}

export async function DELETE(_request: NextRequest, context: Context) {
  let session: ClientSession | undefined;
  try {
    await requireAdmin();
    const { id } = await context.params;
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid invoice ID." }, { status: 400 });
    const db = await getDb();
    session = (await getMongoClient()).startSession();
    let deleted = false;
    await session.withTransaction(async () => {
      const invoices = db.collection("invoices");
      const invoice = await invoices.findOne({ _id: new ObjectId(id) }, { session });
      if (!invoice) return;
      await db.collection("transactions").deleteMany({ invoiceId: id }, { session });
      await db.collection("invoiceShares").deleteMany({ invoiceId: id }, { session });
      await invoices.deleteOne({ _id: new ObjectId(id) }, { session });
      deleted = true;
    });
    if (!deleted) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to delete invoice" }, { status: 500 });
  } finally {
    await session?.endSession();
  }
}
