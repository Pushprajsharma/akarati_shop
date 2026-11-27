"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/http";
import { formatINR } from "@/lib/finance";

type DashboardData = {
  generatedAt: string;
  overview: {
    totalCustomers: number;
    totalOutstanding: number;
    totalAdvances: number;
    customersWithOutstanding: number;
    customersWithZeroBalance: number;
    customersWithAdvance: number;
    totalInvoices: number;
    paidInvoices: number;
    unpaidInvoices: number;
    totalInvoiceValue: number;
    unpaidInvoiceValue: number;
    totalSalesThisMonth: number;
    totalCollectionsThisMonth: number;
    averageInvoiceValue: number;
  };
  today: {
    invoiceCount: number;
    invoiceValue: number;
    paidInvoiceCount: number;
    paidInvoiceValue: number;
    unpaidInvoiceCount: number;
    unpaidInvoiceValue: number;
    transactionCount: number;
    debitTotal: number;
    collectionTotal: number;
    newCustomerCount: number;
  };
  topCustomers: Array<{
    _id: string;
    name: string;
    mobile: string;
    outstanding: number;
    lastTransaction: string | null;
  }>;
  charts: {
    monthly: Array<{ key: string; label: string; sales: number; collections: number }>;
    daily: Array<{ key: string; label: string; sales: number; collections: number }>;
  };
  recentInvoices: Array<{
    _id: string;
    invoiceNumber: string;
    customerName: string;
    invoiceDate: string;
    totalAmount: number;
    paymentStatus: string;
  }>;
  recentActivity: Array<{
    id: string;
    kind: string;
    description: string;
    customerName: string;
    amount?: number;
    createdAt: string;
    href: string;
  }>;
};

function formatDate(value: string | null, withTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", withTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" }).format(date);
}

function MetricCard({ label, value, detail, accent = "" }: { label: string; value: string; detail?: string; accent?: string }) {
  return <article className={`dashboard-metric ${accent}`}>
    <span>{label}</span>
    <strong>{value}</strong>
    {detail && <small>{detail}</small>}
  </article>;
}

function TrendChart({ title, data, seriesLabel }: {
  title: string;
  data: Array<{ key: string; label: string; sales: number; collections: number }>;
  seriesLabel: string;
}) {
  const maxValue = Math.max(0, ...data.flatMap(point => [point.sales, point.collections]));
  return <section className="card dashboard-chart">
    <div className="row"><h2>{title}</h2><span className="muted">{seriesLabel}</span></div>
    <div className="chart-legend"><span><i className="legend-sales"/>Sales</span><span><i className="legend-collections"/>Collections</span></div>
    {!data.some(point => point.sales > 0 || point.collections > 0)
      ? <p className="muted chart-empty">No activity for this period yet.</p>
      : <div className="chart-columns">{data.map(point => {
        const height = (value: number) => value > 0 && maxValue > 0 ? Math.max(4, value / maxValue * 100) : 0;
        return <div className="chart-column" key={point.key} title={`${point.label}: Sales ${formatINR(point.sales)}, Collections ${formatINR(point.collections)}`}>
          <div className="chart-bars">
            <div className="chart-bar-track"><div className="chart-bar sales-bar" style={{ height: `${height(point.sales)}%` }}/></div>
            <div className="chart-bar-track"><div className="chart-bar collections-bar" style={{ height: `${height(point.collections)}%` }}/></div>
          </div>
          <small>{point.label}</small>
        </div>;
      })}</div>}
  </section>;
}

export default function Home() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      setData(await api<DashboardData>("/api/dashboard"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (loading) return <main className="container"><p className="muted">Loading dashboard...</p></main>;
  if (error) return <main className="container"><div className="row"><div><h1>Business dashboard</h1><p className="muted">{formatDate(new Date().toISOString())}</p></div><button className="btn secondary" onClick={()=>{setLoading(true);void load();}}>Retry</button></div><p className="error">{error}</p></main>;
  if (!data) return <main className="container"><p className="muted">No dashboard data available.</p></main>;

  const { overview, today } = data;
  return <main className="container dashboard">
    <div className="row dashboard-heading">
      <div><h1>Business dashboard</h1><p className="muted">Your business at a glance · {formatDate(data.generatedAt)}</p></div>
      <div className="actions"><Link className="btn secondary" href="/customers">View all customers</Link><Link className="btn" href="/invoices">Create invoice</Link></div>
    </div>

    <section aria-label="Business overview">
      <h2 className="dashboard-section-title">Business overview</h2>
      <div className="dashboard-metrics">
        <MetricCard label="Total outstanding" value={formatINR(overview.totalOutstanding)} detail={`${overview.customersWithOutstanding} customers with dues`} accent="metric-primary"/>
        <MetricCard label="Total customers" value={String(overview.totalCustomers)} detail={`${overview.customersWithZeroBalance} clear · ${overview.customersWithAdvance} with advance`}/>
        <MetricCard label="Today's invoices" value={String(today.invoiceCount)} detail={formatINR(today.invoiceValue)} />
        <MetricCard label="Today's collections" value={formatINR(today.collectionTotal)} detail="Actual credit transactions" accent="metric-green"/>
      </div>
      <div className="dashboard-metrics dashboard-metrics-secondary">
        <MetricCard label="Today's transactions" value={String(today.transactionCount)} detail={`Debit ${formatINR(today.debitTotal)} · Credit ${formatINR(today.collectionTotal)}`}/>
        <MetricCard label="Sales this month" value={formatINR(overview.totalSalesThisMonth)} detail="Invoice value; includes paid and unpaid"/>
        <MetricCard label="Collections this month" value={formatINR(overview.totalCollectionsThisMonth)} detail="Recorded credit transactions"/>
        <MetricCard label="Unpaid invoices" value={String(overview.unpaidInvoices)} detail={`${formatINR(overview.unpaidInvoiceValue)} all-time value`}/>
      </div>
      {overview.totalAdvances > 0 && <p className="dashboard-note">Customer advances / negative balances: <strong>{formatINR(overview.totalAdvances)}</strong></p>}
    </section>

    <section>
      <h2 className="dashboard-section-title">Today's business activity</h2>
      <div className="dashboard-metrics activity-metrics">
        <MetricCard label="Invoices created" value={`${today.invoiceCount}`} detail={formatINR(today.invoiceValue)}/>
        <MetricCard label="Paid invoices" value={`${today.paidInvoiceCount}`} detail={formatINR(today.paidInvoiceValue)}/>
        <MetricCard label="Unpaid invoices" value={`${today.unpaidInvoiceCount}`} detail={formatINR(today.unpaidInvoiceValue)}/>
        <MetricCard label="Transactions recorded" value={`${today.transactionCount}`} detail={`${formatINR(today.debitTotal)} debit · ${formatINR(today.collectionTotal)} credit`}/>
        <MetricCard label="New customers" value={`${today.newCustomerCount}`}/>
      </div>
    </section>

    <section>
      <div className="row dashboard-section-heading"><h2 className="dashboard-section-title">Sales and collections</h2><span className="muted">Sales are invoices; collections are recorded credits</span></div>
      <div className="grid dashboard-charts">
        <TrendChart title="Sales vs collections" data={data.charts.monthly} seriesLabel="Last 6 months"/>
        <TrendChart title="Daily sales and collections" data={data.charts.daily} seriesLabel="Last 7 days"/>
      </div>
    </section>

    <section className="card dashboard-table-card">
      <div className="row"><div><h2>Top outstanding customers</h2><p className="muted">{overview.customersWithOutstanding} customers · {formatINR(overview.totalOutstanding)} outstanding</p></div><Link className="btn secondary" href="/customers">View all customers</Link></div>
      <div className="table-wrap"><table><thead><tr><th>Customer</th><th>Mobile</th><th>Outstanding</th><th>Last transaction</th><th></th></tr></thead><tbody>
        {data.topCustomers.map(customer=><tr key={customer._id}><td><Link className="dashboard-link" href={`/customers/${customer._id}`}>{customer.name}</Link></td><td>{customer.mobile||"—"}</td><td className="amount">{formatINR(customer.outstanding)}</td><td>{formatDate(customer.lastTransaction)}</td><td><Link className="btn secondary" href={`/customers/${customer._id}`}>Passbook</Link></td></tr>)}
        {!data.topCustomers.length&&<tr><td colSpan={5} className="muted">No customers have an outstanding balance.</td></tr>}
      </tbody></table></div>
    </section>

    <div className="grid dashboard-bottom">
      <section className="card dashboard-table-card">
        <div className="row"><h2>Recent invoices</h2><Link className="btn secondary" href="/invoices">View all</Link></div>
        <div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Customer</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead><tbody>
          {data.recentInvoices.map(invoice=><tr key={invoice._id}><td><Link className="dashboard-link" href={`/invoice/${invoice._id}`}>{invoice.invoiceNumber}</Link></td><td>{invoice.customerName}</td><td>{formatDate(invoice.invoiceDate)}</td><td className="amount">{formatINR(invoice.totalAmount)}</td><td><span className={`badge ${invoice.paymentStatus.toLowerCase()}`}>{invoice.paymentStatus}</span></td></tr>)}
          {!data.recentInvoices.length&&<tr><td colSpan={5} className="muted">No invoices yet.</td></tr>}
        </tbody></table></div>
        <p className="muted dashboard-footnote">{overview.totalInvoices} invoices · {overview.paidInvoices} paid · Average {formatINR(overview.averageInvoiceValue)}</p>
      </section>

      <section className="card dashboard-activity-card">
        <div className="row"><h2>Recent activity</h2><button className="btn secondary" onClick={()=>{setLoading(true);void load();}}>Refresh</button></div>
        {!data.recentActivity.length?<p className="muted">Business activity will appear here.</p>:<ul className="activity-list">
          {data.recentActivity.map(activity=><li key={activity.id} className={`activity-item activity-${activity.kind}`}>
            <span className="activity-dot"/>
            <div><Link href={activity.href} className="dashboard-link">{activity.description}</Link><div><span>{activity.customerName}</span>{typeof activity.amount==="number"&&<strong>{formatINR(activity.amount)}</strong>}</div><small className="muted">{formatDate(activity.createdAt,true)}</small></div>
          </li>)}
        </ul>}
      </section>
    </div>
  </main>;
}
