"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const res = await fetch("/api/auth/login", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({email,password}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      router.replace("/"); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Login failed"); }
    finally { setBusy(false); }
  }
  return <main className="container" style={{maxWidth:480, paddingTop:80}}>
    <div className="card">
      <h1>Admin Login</h1><p className="muted">Sign in to manage customers, invoices and passbooks.</p>
      {error && <p className="error">{error}</p>}
      <form onSubmit={submit} className="field" style={{marginTop:20}}>
        <label>Email</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required />
        <label>Password</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} required />
        <button className="btn" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button>
      </form>
    </div>
  </main>;
}
