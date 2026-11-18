"use client";
import { useEffect,useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/http";
import { formatINR } from "@/lib/finance";

type InvoiceItem = {productName:string;quantity?:number;unitPrice?:number;amount:number};
type Invoice = {
 invoiceNumber:string;
 customerName:string;
 customerMobile:string;
 invoiceDate:string;
 paymentStatus:string;
 items:InvoiceItem[];
 totalAmount:number;
 previousBalance:number;
 closingBalance:number;
 notes?:string;
};

export default function InvoicePrintPage(){
 const params=useParams<{id:string}>();const [invoice,setInvoice]=useState<Invoice|null>(null);const [error,setError]=useState("");
 useEffect(()=>{api<Invoice>(`/api/invoices/${params.id}`).then(setInvoice).catch(e=>setError(e instanceof Error?e.message:"Unable to load invoice"));},[params.id]);
 if(error)return <main className="container"><p className="error">{error}</p></main>;
 if(!invoice)return <main className="container">Loading invoice...</main>;
 return <main className="print-sheet">
  <div className="row"><div><h1>Aakarati Mobile</h1><p className="muted">Rajoriya Complex, Pipariya<br/>Phone: +91-8989655788</p></div><div className="right"><h1>INVOICE</h1><strong>{invoice.invoiceNumber}</strong></div></div>
  <hr/>
  <div className="row"><div><small className="muted">BILL TO</small><h2 style={{marginTop:6}}>{invoice.customerName}</h2><p>{invoice.customerMobile}</p></div><div className="right"><small className="muted">INVOICE DATE</small><p>{new Date(invoice.invoiceDate).toLocaleDateString("en-IN")}</p><span className={`badge ${invoice.paymentStatus.toLowerCase()}`}>{invoice.paymentStatus}</span></div></div>
  <table style={{marginTop:28}}><thead><tr><th>#</th><th>Product / Description</th><th className="right">Quantity</th><th className="right">Per-unit price</th><th className="right">Amount</th></tr></thead><tbody>{invoice.items.map((item,index)=><tr key={index}><td>{index+1}</td><td>{item.productName}</td><td className="right">{item.quantity ?? 1}</td><td className="right amount">{formatINR(item.unitPrice ?? item.amount)}</td><td className="right amount">{formatINR(item.amount)}</td></tr>)}</tbody></table>
  <div style={{maxWidth:360,marginLeft:"auto",marginTop:24}}>
   <div className="row"><span>Invoice total</span><strong>{formatINR(invoice.totalAmount)}</strong></div>
   <div className="row" style={{marginTop:10}}><span>Old balance</span><strong>{formatINR(invoice.previousBalance)}</strong></div>
   <hr/>
   <div className="row"><strong>Current Balance</strong><strong style={{fontSize:21}}>{formatINR(invoice.closingBalance)}</strong></div>
  </div>
  {invoice.notes&&<p style={{marginTop:30}}><strong>Notes:</strong> {invoice.notes}</p>}
  <p className="muted" style={{marginTop:50}}>Thank you for your business.</p>
  <div className="no-print actions" style={{marginTop:24}}><button className="btn" onClick={()=>window.print()}>Print / Save PDF</button><button className="btn secondary" onClick={()=>history.back()}>Back</button></div>
 </main>;
}
