import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb, getMongoClient, getCollection } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { roundMoney } from "@/lib/finance";

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
  let session: any;
  try {
    await requireAdmin();
    const body = await request.json();
    const customerId = String(body.customerId || "");
    const paymentStatus = String(body.paymentStatus || "").toUpperCase();
    if (!ObjectId.isValid(customerId)) return NextResponse.json({ error: "Select a valid customer." }, { status: 400 });
    if (!["PAID", "UNPAID"].includes(paymentStatus)) return NextResponse.json({ error: "Payment status must be PAID or UNPAID." }, { status: 400 });
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) return NextResponse.json({ error: "Add between 1 and 100 invoice items." }, { status: 400 });
    const items = body.items.map((item: any) => {
      const productName = String(item.productName || "").trim();
      const amount = Number(item.amount);
      if (!productName || !Number.isFinite(amount) || amount <= 0) throw new Error("Each item needs a product name and a positive amount.");
      return { productName, amount: roundMoney(amount) };
    });
    const totalAmount = roundMoney(items.reduce((sum: number, item: any) => sum + item.amount, 0));
    const invoiceDate = body.invoiceDate ? new Date(body.invoiceDate) : new Date();
    if (Number.isNaN(invoiceDate.getTime())) return NextResponse.json({ error: "Invalid invoice date." }, { status: 400 });

    const db = await getDb();
    session = (await getMongoClient()).startSession();
    let response: any;
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
      const invoiceNumber = `INV-${now.getTime()}-${new ObjectId().toString().slice(-5).toUpperCase()}`;
      const invoiceDoc = {
        invoiceNumber, customerId, customerName: customer.name, customerMobile: customer.mobile || "",
        invoiceDate, totalAmount, paymentStatus, notes: String(body.notes || "").trim(),
        previousBalance, closingBalance, items, createdAt: now
      };
      const inserted = await invoices.insertOne(invoiceDoc, { session });
      const invoiceId = inserted.insertedId.toString();
      const debitEntry = {
        customerId, transactionType: "DEBIT", amount: totalAmount,
        description: `Invoice ${invoiceNumber}`, transactionDate: invoiceDate, createdAt: now,
        referenceId: invoiceNumber, invoiceId, entryCategory: "INVOICE", entryOrder: 1
      };
      const txDocs: any[] = [debitEntry];
      if (paymentStatus === "PAID") txDocs.push({
        customerId, transactionType: "CREDIT", amount: totalAmount,
        description: `Payment received - ${invoiceNumber}`, transactionDate: invoiceDate, createdAt: new Date(now.getTime() + 1),
        referenceId: invoiceNumber, invoiceId, entryCategory: "PAYMENT", entryOrder: 2
      });
      await transactions.insertMany(txDocs, { session });
      response = { success: true, invoiceId, invoiceNumber, totalAmount, paymentStatus, previousBalance, closingBalance };
    });
    return NextResponse.json(response, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Invoice creation failed. Ensure MongoDB supports transactions." }, { status: 400 });
  } finally {
    await session?.endSession();
  }
}
