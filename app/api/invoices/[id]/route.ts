import { NextRequest, NextResponse } from "next/server";
import { ClientSession, ObjectId } from "mongodb";
import { getCollection, getDb, getMongoClient } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

type Context = { params: Promise<{ id: string }> };

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
