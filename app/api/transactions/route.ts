import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb, getCollection } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { roundMoney } from "@/lib/finance";

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const body = await request.json();
    const customerId = String(body.customerId || "");
    const transactionType = String(body.transactionType || "").toUpperCase();
    const amount = Number(body.amount);
    if (!ObjectId.isValid(customerId)) return NextResponse.json({ error: "Select a valid customer." }, { status: 400 });
    if (!["DEBIT", "CREDIT"].includes(transactionType)) return NextResponse.json({ error: "Invalid transaction type." }, { status: 400 });
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Amount must be greater than zero." }, { status: 400 });
    const customer = await (await getCollection("customers")).findOne({ _id: new ObjectId(customerId), isActive: { $ne: false } });
    if (!customer) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    const date = body.transactionDate ? new Date(body.transactionDate) : new Date();
    if (Number.isNaN(date.getTime())) return NextResponse.json({ error: "Invalid transaction date." }, { status: 400 });
    const doc = { customerId, transactionType, amount: roundMoney(amount), description: String(body.description || "").trim(), transactionDate: date, createdAt: new Date(), referenceId: "", invoiceId: null, entryCategory: "MANUAL", entryOrder: 0 };
    const result = await (await getCollection("transactions")).insertOne(doc);
    return NextResponse.json({ ...doc, _id: result.insertedId.toString() }, { status: 201 });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to save transaction" }, { status: 500 }); }
}
