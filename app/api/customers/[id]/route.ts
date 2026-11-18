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
    return NextResponse.json({ ...customer, _id: id, ...calculateBalance(Number(customer.openingBalance || 0), txs as any) });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to load customer" }, { status: 500 }); }
}

export async function PATCH(request: NextRequest, context: Context) {
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
    const result = await (await getCollection("customers")).updateOne({ _id: new ObjectId(id) }, { $set: update });
    if (!result.matchedCount) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to update customer" }, { status: 500 }); }
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
