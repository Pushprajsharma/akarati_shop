"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/http";
import { formatINR } from "@/lib/finance";

type Customer = {_id:string;name:string;mobile:string;pendingAmount:number};
type Item = {productName:string;quantity:number;unitPrice:number;amount:number;key:string};
type Invoice = {_id:string;invoiceNumber:string;customerName:string;invoiceDate:string;totalAmount:number;paymentStatus:string;closingBalance:number;notes?:string;items?:Array<{productName:string;quantity?:number;unitPrice?:number;amount:number}>};
type CreatedInvoice = {invoiceNumber:string};
type InvoiceEditForm = {invoiceDate:string;paymentStatus:string;notes:string;items:Item[]};
export default function InvoicesPage() {
  const [customers,setCustomers]=useState<Customer[]>([]);
  const [customerId,setCustomerId]=useState("");
  const [invoices,setInvoices]=useState<Invoice[]>([]);
  const [items,setItems]=useState<Item[]>([]);
  const [productName,setProductName]=useState("");
  const [quantity,setQuantity]=useState("");
  const [unitPrice,setUnitPrice]=useState("");
  const [status,setStatus]=useState("UNPAID");
  const [date,setDate]=useState(new Date().toISOString().slice(0,10));
  const [notes,setNotes]=useState("");
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const [busy,setBusy]=useState(false);
  const [deletingInvoiceId,setDeletingInvoiceId]=useState("");
  const [editingInvoiceId,setEditingInvoiceId]=useState("");
  const [editForm,setEditForm]=useState<InvoiceEditForm|null>(null);
  const [savingInvoice,setSavingInvoice]=useState(false);
  const nextItemKey=useRef(0);
  const customer=customers.find(c=>c._id===customerId);
  const total=useMemo(()=>items.reduce((s,i)=>s+i.amount,0),[items]);
  const previous=customer?.pendingAmount||0;
  const closing=status==="UNPAID"?previous+total:previous;
  async function loadCustomers() { const data=await api<Customer[]>("/api/customers");setCustomers(data); }
  async function loadInvoices(id:string) { setInvoices(id?await api<Invoice[]>(`/api/invoices?customerId=${id}`):[]); }
  useEffect(()=>{loadCustomers().catch(e=>setError(e.message));},[]);
  useEffect(()=>{loadInvoices(customerId).catch(e=>setError(e.message));},[customerId]);
  function addItem() { const count=Number(quantity); const price=Number(unitPrice); if(!productName.trim()||!Number.isFinite(count)||count<=0||!Number.isFinite(price)||price<=0){setError("Enter a product name, a valid quantity, and a valid per-unit price.");return;} const roundedPrice=Math.round(price*100)/100; const lineAmount=Math.round(count*roundedPrice*100)/100; if(!Number.isFinite(lineAmount)||lineAmount<=0){setError("The item total must be greater than zero.");return;} setItems([...items,{productName:productName.trim(),quantity:count,unitPrice:roundedPrice,amount:lineAmount,key:String(++nextItemKey.current)}]);setProductName("");setQuantity("");setUnitPrice("");setError(""); }
  async function deleteInvoice(invoice:Invoice) { if(!window.confirm(`Permanently delete invoice ${invoice.invoiceNumber} and its linked ledger entries? This cannot be undone.`))return; setDeletingInvoiceId(invoice._id);setError("");setSuccess("");try{await api(`/api/invoices/${invoice._id}`,{method:"DELETE"});setSuccess(`Invoice ${invoice.invoiceNumber} deleted.`);await Promise.all([loadInvoices(customerId),loadCustomers()]);}catch(e){setError(e instanceof Error?e.message:"Invoice deletion failed");}finally{setDeletingInvoiceId("");} }
  function startEditInvoice(invoice:Invoice) { setEditingInvoiceId(invoice._id);setEditForm({invoiceDate:new Date(invoice.invoiceDate).toISOString().slice(0,10),paymentStatus:invoice.paymentStatus,notes:invoice.notes||"",items:(invoice.items||[]).map((item,index)=>({productName:item.productName,quantity:item.quantity??1,unitPrice:item.unitPrice??item.amount,amount:item.amount,key:String(index)}))});setError("");setSuccess(""); }
  function updateEditItem(key:string,field:"productName"|"quantity"|"unitPrice",value:string) { setEditForm(current=>current?{...current,items:current.items.map(item=>{if(item.key!==key)return item;const updated={...item,[field]:field==="productName"?value:Number(value)};return {...updated,amount:Math.round(updated.quantity*updated.unitPrice*100)/100};})}:current); }
  async function saveInvoice(e:React.FormEvent) { e.preventDefault();if(!editingInvoiceId||!editForm)return;setSavingInvoice(true);setError("");setSuccess("");try{await api(`/api/invoices/${editingInvoiceId}`,{method:"PATCH",body:JSON.stringify({...editForm,invoiceDate:new Date(`${editForm.invoiceDate}T12:00:00`).toISOString(),items:editForm.items.map(({productName,quantity,unitPrice})=>({productName,quantity,unitPrice}))})});setSuccess("Invoice updated.");setEditingInvoiceId("");setEditForm(null);await Promise.all([loadInvoices(customerId),loadCustomers()]);}catch(e){setError(e instanceof Error?e.message:"Invoice update failed");}finally{setSavingInvoice(false);} }
  async function submit(e:React.FormEvent) { e.preventDefault();if(!customerId){setError("Select a customer.");return;}if(!items.length){setError("Add at least one product.");return;}setBusy(true);setError("");setSuccess("");try{const result=await api<CreatedInvoice>("/api/invoices",{method:"POST",body:JSON.stringify({customerId,paymentStatus:status,invoiceDate:new Date(`${date}T12:00:00`).toISOString(),notes,items})});setSuccess(`Invoice ${result.invoiceNumber} created.`);setItems([]);setNotes("");await loadCustomers();await loadInvoices(customerId);}catch(e){setError(e instanceof Error?e.message:"Invoice creation failed");}finally{setBusy(false);} }
  return <main className="container">
    <div className="row"><div><h1>Invoice Management</h1><p className="muted">Create invoices and review previous invoices.</p></div><Link className="btn secondary" href="/customers">Customers</Link></div>
    {error&&<p className="error">{error}</p>}{success&&<p className="success">{success}</p>}
    <section className="card" style={{marginTop:18}}>
      <h2>Create invoice</h2>
      <form onSubmit={submit} className="field">
        <div className="form-grid">
          <div className="field"><label>Customer *</label><select value={customerId} onChange={e=>setCustomerId(e.target.value)} required><option value="">Select customer</option>{customers.map(c=><option key={c._id} value={c._id}>{c.name} {c.mobile?`- ${c.mobile}`:""}</option>)}</select></div>
          <div className="field"><label>Invoice date</label><input type="date" value={date} onChange={e=>setDate(e.target.value)} required/></div>
        </div>
        <hr/>
        <h2>Add products</h2>
        <div className="form-grid">
          <div className="field"><label>Product name</label><input value={productName} onChange={e=>setProductName(e.target.value)} placeholder="e.g. Grocery items"/></div>
          <div className="field"><label>Quantity</label><input type="number" min="0.001" step="any" value={quantity} onChange={e=>setQuantity(e.target.value)} placeholder="1"/></div>
          <div className="field"><label>Per-unit price (₹)</label><input type="number" min="0.01" step="0.01" value={unitPrice} onChange={e=>setUnitPrice(e.target.value)} placeholder="0.00"/></div>
        </div>
        <div><button type="button" className="btn secondary" onClick={addItem}>+ Add product</button></div>
        {items.map(item=><div className="product-row" key={item.key}><span>{item.productName} · {item.quantity} × {formatINR(item.unitPrice)}</span><strong>{formatINR(item.amount)}</strong><button type="button" className="btn danger" onClick={()=>setItems(items.filter(i=>i.key!==item.key))}>Remove</button></div>)}
        <hr/>
        <div className="form-grid">
          <div className="field"><label>Payment status</label><select value={status} onChange={e=>setStatus(e.target.value)}><option value="UNPAID">Unpaid</option><option value="PAID">Paid</option></select></div>
          <div className="field"><label>Notes</label><input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional notes"/></div>
        </div>
        <div className="summary">
          <div className="stat"><small>Old balance</small><strong>{formatINR(previous)}</strong></div>
          <div className="stat"><small>Invoice total</small><strong>{formatINR(total)}</strong></div>
          <div className="stat"><small>Current Balance</small><strong>{formatINR(closing)}</strong></div>
        </div>
        <button className="btn" disabled={busy||!customerId||!items.length}>{busy?"Creating invoice...":"Create invoice"}</button>
      </form>
    </section>
    <section className="card" style={{marginTop:18}}>
      <div className="row"><h2>Invoice history</h2><span className="badge">{invoices.length} invoices</span></div>
      {editingInvoiceId&&editForm&&<form onSubmit={saveInvoice} className="field card" style={{marginBottom:18}}>
        <h2>Edit invoice {invoices.find(invoice=>invoice._id===editingInvoiceId)?.invoiceNumber}</h2>
        <div className="form-grid">
          <div className="field"><label>Invoice date</label><input type="date" value={editForm.invoiceDate} onChange={e=>setEditForm({...editForm,invoiceDate:e.target.value})} required/></div>
          <div className="field"><label>Payment status</label><select value={editForm.paymentStatus} onChange={e=>setEditForm({...editForm,paymentStatus:e.target.value})}><option value="UNPAID">Unpaid</option><option value="PAID">Paid</option></select></div>
          <div className="field"><label>Notes</label><input value={editForm.notes} onChange={e=>setEditForm({...editForm,notes:e.target.value})}/></div>
        </div>
        <h3>Items</h3>
        {editForm.items.map(item=><div className="product-row" key={item.key}>
          <input aria-label="Product name" value={item.productName} onChange={e=>updateEditItem(item.key,"productName",e.target.value)}/>
          <div className="field"><label>Quantity</label><input aria-label="Quantity" type="number" min="0.001" step="any" value={item.quantity} onChange={e=>updateEditItem(item.key,"quantity",e.target.value)}/><label>Per-unit price (₹)</label><input aria-label="Per-unit price" type="number" min="0.01" step="0.01" value={item.unitPrice} onChange={e=>updateEditItem(item.key,"unitPrice",e.target.value)}/></div>
          <div><strong>{formatINR(item.amount)}</strong><button type="button" className="btn danger" onClick={()=>setEditForm({...editForm,items:editForm.items.filter(current=>current.key!==item.key)})}>Remove</button></div>
        </div>)}
        <div className="actions"><button type="button" className="btn secondary" onClick={()=>setEditForm({...editForm,items:[...editForm.items,{productName:"",quantity:1,unitPrice:0,amount:0,key:String(++nextItemKey.current)}]})}>+ Add item</button><button className="btn" disabled={savingInvoice}>{savingInvoice?"Saving...":"Save invoice"}</button><button type="button" className="btn secondary" onClick={()=>{setEditingInvoiceId("");setEditForm(null);}}>Cancel</button></div>
      </form>}
      {!customerId?<p className="muted">Select a customer to view their invoices above.</p>:<div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>
        {invoices.map(i=><tr key={i._id}><td>{i.invoiceNumber}</td><td>{new Date(i.invoiceDate).toLocaleDateString("en-IN")}</td><td>{i.customerName}</td><td className="amount">{formatINR(i.totalAmount)}</td><td><span className={`badge ${i.paymentStatus.toLowerCase()}`}>{i.paymentStatus}</span></td><td><div className="actions"><Link className="btn secondary" href={`/invoice/${i._id}`}>View / Print</Link><button type="button" className="btn secondary" onClick={()=>startEditInvoice(i)}>Edit</button><button type="button" className="btn danger" disabled={deletingInvoiceId===i._id} onClick={()=>deleteInvoice(i)}>{deletingInvoiceId===i._id?"Deleting...":"Delete"}</button></div></td></tr>)}
        {!invoices.length&&<tr><td colSpan={6} className="muted">No invoices for this customer yet.</td></tr>}
      </tbody></table></div>}
    </section>
  </main>;
}
