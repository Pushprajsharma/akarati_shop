import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getCollection } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { calculateBalance } from "@/lib/finance";

type Context = { params: Promise<{ id: string }> };
type LedgerRow = {
  _id: string;
  transactionType: string;
  entryCategory: string;
  description: string;
  transactionDate: Date;
  debit: number;
  credit: number;
  balance: number;
  referenceId?: string;
};

export async function GET(_request: NextRequest, context: Context) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid customer ID." }, { status: 400 });
    const customer = await (await getCollection("customers")).findOne({ _id: new ObjectId(id) });
    if (!customer) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    const txs = await (await getCollection("transactions")).find({ customerId: id }).sort({ transactionDate: 1, createdAt: 1, entryOrder: 1 }).toArray();
    let balance = Number(customer.openingBalance || 0);
    const rows: LedgerRow[] = [{ _id: "opening", transactionType: "OPENING", entryCategory: "OPENING", description: "Opening Balance", transactionDate: customer.createdAt, debit: 0, credit: 0, balance }];
    for (const tx of txs) {
      const amount = Number(tx.amount || 0);
      const debit = tx.transactionType === "DEBIT" ? amount : 0;
      const credit = tx.transactionType === "CREDIT" ? amount : 0;
      balance += debit - credit;
      rows.push({
        ...tx,
        _id: tx._id.toString(),
        transactionType: String(tx.transactionType),
        entryCategory: String(tx.entryCategory),
        description: String(tx.description || ""),
        transactionDate: tx.transactionDate instanceof Date ? tx.transactionDate : new Date(String(tx.transactionDate)),
        referenceId: typeof tx.referenceId === "string" ? tx.referenceId : undefined,
        debit,
        credit,
        balance: Math.round(balance * 100) / 100
      });
    }
    const balanceTransactions = txs.map(tx => ({ transactionType: tx.transactionType, amount: tx.amount }));
    return NextResponse.json({ customer: { ...customer, _id: id }, summary: calculateBalance(Number(customer.openingBalance || 0), balanceTransactions), rows });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to load ledger" }, { status: 500 }); }
}
