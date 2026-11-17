import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const { email, password } = await request.json();
  const expectedEmail = process.env.ADMIN_EMAIL || "";
  const expectedPassword = process.env.ADMIN_PASSWORD || "";
  if (!expectedEmail || !expectedPassword) {
    return NextResponse.json({ error: "Admin credentials are not configured." }, { status: 500 });
  }
  if (String(email).toLowerCase() !== expectedEmail.toLowerCase() || String(password) !== expectedPassword) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }
  await createSession(expectedEmail);
  return NextResponse.json({ success: true });
}
