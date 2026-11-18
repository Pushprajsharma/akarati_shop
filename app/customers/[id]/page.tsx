"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/http";
import { formatINR } from "@/lib/finance";

type LedgerRow={_id:string;transactionType:string;entryCategory:string;referenceId?:string;description:string;transactionDate:string;debit:number;credit:number;balance:number};
type Customer={_id:string;name:string;mobile:string;address:string;openingBalance:number};
type LedgerData={customer:Customer;summary:{totalDebit:number;totalCredit:number;pendingAmount:number};rows:LedgerRow[]};
export default function CustomerPage(){
 const params=useParams<{id:string}>();const id=params.id;
 const [data,setData]=useState<LedgerData|null>(null);const [error,setError]=useState("");
 const [form,setForm]=useState({transactionType:"DEBIT",amount:"",description:"",transactionDate:new Date().toISOString().slice(0,10)});
 const load=useCallback(async()=>{try{setData(await api<LedgerData>(`/api/customers/${id}/ledger`));setError("");}catch(e){setError(e instanceof Error?e.message:"Unable to load passbook");}},[id]);
 useEffect(()=>{if(id)void load();},[id,load]);
 async function add(e:React.FormEvent){e.preventDefault();try{await api("/api/transactions",{method:"POST",body:JSON.stringify({...form,customerId:id,transactionDate:new Date(`${form.transactionDate}T12:00:00`).toISOString()})});setForm({...form,amount:"",description:""});await load();}catch(e){setError(e instanceof Error?e.message:"Transaction failed");}}
 if(!data)return <main className="container">{error?<p className="error">{error}</p>:"Loading passbook..."}</main>;
 const customer=data.customer;const rows:LedgerRow[]=data.rows;
 return <main className="container"><div className="row"><div><h1>{customer.name}</h1><p className="muted">{customer.mobile} {customer.address?`· ${customer.address}`:""}</p></div><Link className="btn secondary" href="/invoices">Create invoice</Link></div>
 {error&&<p className="error">{error}</p>}
 <div className="summary" style={{margin:"18px 0"}}><div className="stat"><small>Opening balance</small><strong>{formatINR(customer.openingBalance)}</strong></div><div className="stat"><small>Total debit</small><strong>{formatINR(data.summary.totalDebit)}</strong></div><div className="stat"><small>Outstanding</small><strong>{formatINR(data.summary.pendingAmount)}</strong></div></div>
 <div className="grid"><section className="card"><h2>Add transaction</h2><form className="field" onSubmit={add}><label>Type</label><select value={form.transactionType} onChange={e=>setForm({...form,transactionType:e.target.value})}><option value="DEBIT">Debit (increase due)</option><option value="CREDIT">Credit (payment received)</option></select><label>Amount</label><input type="number" min="0.01" step="0.01" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} required/><label>Description</label><input value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/><label>Date</label><input type="date" value={form.transactionDate} onChange={e=>setForm({...form,transactionDate:e.target.value})}/><button className="btn">Save transaction</button></form></section>
 <section className="card"><h2>Passbook</h2><div className="table-wrap"><table><thead><tr><th>Date</th><th>Description</th><th>Type</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>{rows.map(r=><tr key={r._id}><td>{r.transactionDate?new Date(r.transactionDate).toLocaleDateString("en-IN"):"—"}</td><td>{r.description}<div className="muted">{r.referenceId||""}</div></td><td>{r.entryCategory}</td><td>{r.debit?formatINR(r.debit):"—"}</td><td>{r.credit?formatINR(r.credit):"—"}</td><td className="amount">{formatINR(r.balance)}</td></tr>)}</tbody></table></div></section></div>
 </main>;
}
