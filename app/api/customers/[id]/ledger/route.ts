import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getCollection } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { calculateBalance } from "@/lib/finance";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Context) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid customer ID." }, { status: 400 });
    const customer = await (await getCollection("customers")).findOne({ _id: new ObjectId(id) });
    if (!customer) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    const txs = await (await getCollection("transactions")).find({ customerId: id }).sort({ transactionDate: 1, createdAt: 1, entryOrder: 1 }).toArray();
    let balance = Number(customer.openingBalance || 0);
    const rows: any[] = [{ _id: "opening", transactionType: "OPENING", entryCategory: "OPENING", description: "Opening Balance", transactionDate: customer.createdAt, debit: 0, credit: 0, balance }];
    for (const tx of txs) {
      const amount = Number(tx.amount || 0);
      const debit = tx.transactionType === "DEBIT" ? amount : 0;
      const credit = tx.transactionType === "CREDIT" ? amount : 0;
      balance += debit - credit;
      rows.push({ ...tx, _id: tx._id.toString(), debit, credit, balance: Math.round(balance * 100) / 100 });
    }
    return NextResponse.json({ customer: { ...customer, _id: id }, summary: calculateBalance(Number(customer.openingBalance || 0), txs as any), rows });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to load ledger" }, { status: 500 }); }
}
