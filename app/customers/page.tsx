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
  const [deletingCustomerId,setDeletingCustomerId] = useState("");
  const [editingCustomerId,setEditingCustomerId] = useState("");
  const [editForm,setEditForm] = useState({name:"",mobile:"",address:"",openingBalance:"0"});
  const [savingCustomer,setSavingCustomer] = useState(false);
  async function load() { try { setCustomers(await api<Customer[]>("/api/customers")); setError(""); } catch(e) { setError(e instanceof Error?e.message:"Load failed"); } }
  useEffect(()=>{ void load(); },[]);
  const filtered = useMemo(()=>customers.filter(c=>`${c.name} ${c.mobile}`.toLowerCase().includes(search.toLowerCase())),[customers,search]);
  async function create(e:React.FormEvent) { e.preventDefault(); setBusy(true); setError(""); try { await api("/api/customers",{method:"POST",body:JSON.stringify(form)}); setForm({name:"",mobile:"",address:"",openingBalance:"0"}); await load(); } catch(e) {setError(e instanceof Error?e.message:"Save failed");} finally{setBusy(false);} }
  function startEdit(customer:Customer) { setEditingCustomerId(customer._id); setEditForm({name:customer.name,mobile:customer.mobile,address:customer.address,openingBalance:String(customer.openingBalance)}); setError(""); }
  async function saveCustomer(e:React.FormEvent) { e.preventDefault(); if(!editingCustomerId)return; setSavingCustomer(true);setError("");try{await api(`/api/customers/${editingCustomerId}`,{method:"PATCH",body:JSON.stringify(editForm)});setEditingCustomerId("");await load();}catch(e){setError(e instanceof Error?e.message:"Customer update failed");}finally{setSavingCustomer(false);} }
  async function removeCustomer(customer:Customer) { if(!window.confirm(`Permanently delete ${customer.name}, including all their invoices and ledger entries? This cannot be undone.`))return; setDeletingCustomerId(customer._id);setError("");try{await api(`/api/customers/${customer._id}`,{method:"DELETE"});await load();}catch(e){setError(e instanceof Error?e.message:"Customer deletion failed");}finally{setDeletingCustomerId("");} }
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
        {editingCustomerId&&<form onSubmit={saveCustomer} className="field card" style={{margin:"14px 0"}}>
          <h2>Edit customer</h2>
          <label>Name *</label><input value={editForm.name} onChange={e=>setEditForm({...editForm,name:e.target.value})} required/>
          <label>Mobile</label><input value={editForm.mobile} onChange={e=>setEditForm({...editForm,mobile:e.target.value})}/>
          <label>Address</label><textarea value={editForm.address} onChange={e=>setEditForm({...editForm,address:e.target.value})}/>
          <label>Opening balance (₹)</label><input type="number" min="0" step="0.01" value={editForm.openingBalance} onChange={e=>setEditForm({...editForm,openingBalance:e.target.value})} required/>
          <div className="actions"><button className="btn" disabled={savingCustomer}>{savingCustomer?"Saving...":"Save changes"}</button><button type="button" className="btn secondary" onClick={()=>setEditingCustomerId("")}>Cancel</button></div>
        </form>}
        <div className="table-wrap"><table><thead><tr><th>Customer</th><th>Mobile</th><th>Pending</th><th></th></tr></thead><tbody>
        {filtered.map(c=><tr key={c._id}><td><strong>{c.name}</strong></td><td>{c.mobile||"—"}</td><td className="amount">{formatINR(c.pendingAmount)}</td><td><div className="actions"><button type="button" className="btn secondary" onClick={()=>startEdit(c)}>Edit</button><Link className="btn secondary" href={`/customers/${c._id}`}>Passbook</Link><button type="button" className="btn danger" disabled={deletingCustomerId===c._id} onClick={()=>removeCustomer(c)}>{deletingCustomerId===c._id?"Deleting...":"Delete"}</button></div></td></tr>)}
        {!filtered.length && <tr><td colSpan={4} className="muted">No customers found.</td></tr>}
        </tbody></table></div>
      </section>
    </div>
  </main>;
}
