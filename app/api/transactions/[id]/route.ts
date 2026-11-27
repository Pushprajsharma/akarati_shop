import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getCollection } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(_request: NextRequest, context: Context) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid transaction ID." }, { status: 400 });
    const transactions = await getCollection("transactions");
    const transaction = await transactions.findOne({ _id: new ObjectId(id) });
    if (!transaction) return NextResponse.json({ error: "Passbook entry not found." }, { status: 404 });
    if (transaction.invoiceId) {
      return NextResponse.json({ error: "Invoice entries must be changed or deleted from the invoice." }, { status: 409 });
    }
    const result = await transactions.deleteOne({ _id: new ObjectId(id), entryCategory: "MANUAL" });
    if (!result.deletedCount) return NextResponse.json({ error: "Only manual passbook entries can be deleted here." }, { status: 409 });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to delete passbook entry" }, { status: 500 });
  }
}
