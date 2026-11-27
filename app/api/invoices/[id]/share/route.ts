import { createHash, randomBytes } from "node:crypto";
import { ClientSession, ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getCollection, getDb, getMongoClient } from "@/lib/db";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  let session: ClientSession | undefined;
  try {
    await requireAdmin();
    const { id } = await context.params;
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid invoice ID." }, { status: 400 });
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const db = await getDb();
    session = (await getMongoClient()).startSession();
    let found = false;
    await session.withTransaction(async () => {
      const invoice = await db.collection("invoices").findOne({ _id: new ObjectId(id) }, { session });
      if (!invoice) return;
      const shares = db.collection("invoiceShares");
      await shares.deleteMany({ invoiceId: id }, { session });
      await shares.insertOne({ invoiceId: id, tokenHash, createdAt: new Date() }, { session });
      found = true;
    });
    if (!found) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    return NextResponse.json({ url: new URL(`/shared-invoice/${token}`, request.url).toString() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create public invoice link." }, { status: 500 });
  } finally {
    await session?.endSession();
  }
}

export async function DELETE(_request: NextRequest, context: Context) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid invoice ID." }, { status: 400 });
    await (await getCollection("invoiceShares")).deleteMany({ invoiceId: id });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to revoke public invoice link." }, { status: 500 });
  }
}
