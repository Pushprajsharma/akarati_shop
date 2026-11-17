"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/http";
import { formatINR } from "@/lib/finance";

type Customer = { _id:string; name:string; mobile:string; address:string; openingBalance:number; totalDebit:number; totalCredit:number; pendingAmount:number };
export default function CustomersPage() {
  const [customers,setCustomers] = useState<Customer[]>([]);
  const [search,setSearch] = useState("");
  const [error,setError] = useState("");
  const [form,setForm] = useState({name:"",mobile:"",address:"",openingBalance:"0"});
  const [busy,setBusy] = useState(false);
  async function load() { try { setCustomers(await api<Customer[]>("/api/customers")); setError(""); } catch(e) { setError(e instanceof Error?e.message:"Load failed"); } }
  useEffect(()=>{ void load(); },[]);
  const filtered = useMemo(()=>customers.filter(c=>`${c.name} ${c.mobile}`.toLowerCase().includes(search.toLowerCase())),[customers,search]);
  async function create(e:React.FormEvent) { e.preventDefault(); setBusy(true); setError(""); try { await api("/api/customers",{method:"POST",body:JSON.stringify(form)}); setForm({name:"",mobile:"",address:"",openingBalance:"0"}); await load(); } catch(e) {setError(e instanceof Error?e.message:"Save failed");} finally{setBusy(false);} }
  return <main className="container">
    <div className="row"><div><h1>Customers</h1><p className="muted">Manage customer accounts and outstanding balances.</p></div><Link className="btn" href="/invoices">Create invoice</Link></div>
    {error && <p className="error">{error}</p>}
    <div className="grid" style={{marginTop:20}}>
      <section className="card"><h2>Add customer</h2><form onSubmit={create} className="field">
        <label>Name *</label><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required />
        <label>Mobile</label><input value={form.mobile} onChange={e=>setForm({...form,mobile:e.target.value})} />
        <label>Address</label><textarea value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/>
        <label>Opening balance (₹)</label><input type="number" min="0" step="0.01" value={form.openingBalance} onChange={e=>setForm({...form,openingBalance:e.target.value})}/>
        <button className="btn" disabled={busy}>{busy?"Saving...":"Save customer"}</button>
      </form></section>
      <section className="card"><div className="row"><h2>Customer list</h2><span className="badge">{filtered.length} customers</span></div>
        <input placeholder="Search name or mobile..." value={search} onChange={e=>setSearch(e.target.value)}/>
        <div className="table-wrap"><table><thead><tr><th>Customer</th><th>Mobile</th><th>Pending</th><th></th></tr></thead><tbody>
        {filtered.map(c=><tr key={c._id}><td><strong>{c.name}</strong></td><td>{c.mobile||"—"}</td><td className="amount">{formatINR(c.pendingAmount)}</td><td><Link className="btn secondary" href={`/customers/${c._id}`}>Passbook</Link></td></tr>)}
        {!filtered.length && <tr><td colSpan={4} className="muted">No customers found.</td></tr>}
        </tbody></table></div>
      </section>
    </div>
  </main>;
}
