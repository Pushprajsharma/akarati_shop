import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getCollection } from "@/lib/db";
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
