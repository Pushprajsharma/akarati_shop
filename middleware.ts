import { NextRequest } from "next/server";
import { middlewareAuth } from "@/lib/auth";

export function middleware(request: NextRequest) {
  return middlewareAuth(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
