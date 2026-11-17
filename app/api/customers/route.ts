import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getCollection } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { calculateBalance, roundMoney } from "@/lib/finance";

export async function GET() {
  try {
    await requireAdmin();
    const customers = await getCollection("customers");
    const transactions = await getCollection("transactions");
    const rows = await customers.find({ isActive: { $ne: false } }).sort({ name: 1 }).toArray();
    const result = await Promise.all(rows.map(async c => {
      const txs = await transactions.find({ customerId: c._id.toString() }).toArray();
      return { ...c, _id: c._id.toString(), ...calculateBalance(Number(c.openingBalance || 0), txs as any) };
    }));
    return NextResponse.json(result);
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to load customers" }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const body = await request.json();
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "Customer name is required." }, { status: 400 });
    const openingBalance = roundMoney(Number(body.openingBalance || 0));
    if (!Number.isFinite(openingBalance) || openingBalance < 0) return NextResponse.json({ error: "Opening balance must be zero or greater." }, { status: 400 });
    const doc = { name, mobile: String(body.mobile || "").trim(), address: String(body.address || "").trim(), openingBalance, isActive: true, createdAt: new Date() };
    const collection = await getCollection("customers");
    const inserted = await collection.insertOne(doc);
    return NextResponse.json({ ...doc, _id: inserted.insertedId.toString(), totalDebit: 0, totalCredit: 0, pendingAmount: openingBalance }, { status: 201 });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to create customer" }, { status: 500 }); }
}
