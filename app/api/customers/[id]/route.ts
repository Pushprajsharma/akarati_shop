import { NextRequest, NextResponse } from "next/server";
import { ClientSession, ObjectId } from "mongodb";
import { getCollection, getDb, getMongoClient } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { calculateBalance } from "@/lib/finance";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Context) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid customer ID." }, { status: 400 });
    const customers = await getCollection("customers");
    const customer = await customers.findOne({ _id: new ObjectId(id) });
    if (!customer) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    const txs = await (await getCollection("transactions")).find({ customerId: id }).sort({ transactionDate: 1, createdAt: 1, entryOrder: 1 }).toArray();
    const balanceTransactions = txs.map(tx => ({ transactionType: tx.transactionType, amount: tx.amount }));
    return NextResponse.json({ ...customer, _id: id, ...calculateBalance(Number(customer.openingBalance || 0), balanceTransactions) });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to load customer" }, { status: 500 }); }
}

export async function PATCH(request: NextRequest, context: Context) {
  let session: ClientSession | undefined;
  try {
    await requireAdmin();
    const { id } = await context.params;
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid customer ID." }, { status: 400 });
    const body = await request.json();
    const update: Record<string, unknown> = {};
    if (body.name !== undefined) update.name = String(body.name).trim();
    if (body.mobile !== undefined) update.mobile = String(body.mobile).trim();
    if (body.address !== undefined) update.address = String(body.address).trim();
    if (!update.name && body.name !== undefined) return NextResponse.json({ error: "Name is required." }, { status: 400 });
    if (body.openingBalance !== undefined) {
      const openingBalance = Number(body.openingBalance);
      if (!Number.isFinite(openingBalance) || openingBalance < 0) {
        return NextResponse.json({ error: "Opening balance must be zero or greater." }, { status: 400 });
      }
      update.openingBalance = Math.round(openingBalance * 100) / 100;
    }
    if (!Object.keys(update).length) return NextResponse.json({ error: "Provide at least one customer field to update." }, { status: 400 });
    const db = await getDb();
    session = (await getMongoClient()).startSession();
    let updated = false;
    await session.withTransaction(async () => {
      const customers = db.collection("customers");
      const customer = await customers.findOne({ _id: new ObjectId(id) }, { session });
      if (!customer) return;
      const oldOpeningBalance = Number(customer.openingBalance || 0);
      await customers.updateOne({ _id: new ObjectId(id) }, { $set: update }, { session });
      if (typeof update.openingBalance === "number" && update.openingBalance !== oldOpeningBalance) {
        await db.collection("dashboardActivity").insertOne({
          kind: "balance",
          description: "Customer balance updated",
          customerId: id,
          customerName: String(update.name || customer.name || "Customer"),
          amount: Math.abs(update.openingBalance - oldOpeningBalance),
          createdAt: new Date()
        }, { session });
      }
      updated = true;
    });
    if (!updated) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to update customer" }, { status: 500 }); }
  finally { await session?.endSession(); }
}

export async function DELETE(_request: NextRequest, context: Context) {
  let session: ClientSession | undefined;
  try {
    await requireAdmin();
    const { id } = await context.params;
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid customer ID." }, { status: 400 });
    const db = await getDb();
    session = (await getMongoClient()).startSession();
    let deleted = false;
    await session.withTransaction(async () => {
      const customers = db.collection("customers");
      const customer = await customers.findOne({ _id: new ObjectId(id) }, { session });
      if (!customer) return;
      const customerInvoices = await db.collection("invoices").find({ customerId: id }, { projection: { _id: 1 }, session }).toArray();
      const invoiceIds = customerInvoices.map(invoice => invoice._id.toString());
      if (invoiceIds.length) await db.collection("invoiceShares").deleteMany({ invoiceId: { $in: invoiceIds } }, { session });
      await db.collection("invoices").deleteMany({ customerId: id }, { session });
      await db.collection("transactions").deleteMany({ customerId: id }, { session });
      await customers.deleteOne({ _id: new ObjectId(id) }, { session });
      deleted = true;
    });
    if (!deleted) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to delete customer" }, { status: 500 });
  } finally {
    await session?.endSession();
  }
}
