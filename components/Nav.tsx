"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  if (pathname === "/login" || pathname.startsWith("/shared-invoice/")) return null;
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  return <header className="topbar">
    <Link className="brand" href="/">Aakarati Mobile</Link>
    <nav className="nav">
      <Link href="/">Dashboard</Link>
      <Link href="/customers">Customers</Link>
      <Link href="/invoices">Invoices</Link>
      <button onClick={logout}>Logout</button>
    </nav>
  </header>;
}
