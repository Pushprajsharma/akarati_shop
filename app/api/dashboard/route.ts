import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { roundMoney } from "@/lib/finance";

const BUSINESS_TIME_ZONE = "Asia/Kolkata";

function localDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(value => value.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function shiftDate(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function shiftMonth(monthKey: string, months: number) {
  const date = new Date(`${monthKey}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 7);
}

function istDayStart(dateKey: string) {
  return new Date(`${dateKey}T00:00:00+05:30`);
}

type CustomerBalanceResult = {
  summary: Array<{
    totalCustomers: number;
    totalOutstanding: number;
    totalAdvances: number;
    customersWithOutstanding: number;
    customersWithZeroBalance: number;
    customersWithAdvance: number;
  }>;
  top: Array<{
    _id: ObjectId;
    name: string;
    mobile?: string;
    outstanding: number;
    lastTransaction?: Date;
  }>;
};

type InvoiceTotals = {
  totalInvoices: number;
  paidInvoices: number;
  unpaidInvoices: number;
  totalInvoiceValue: number;
  unpaidInvoiceValue: number;
};

type TodayInvoiceTotals = {
  count: number;
  totalValue: number;
  paidCount: number;
  paidValue: number;
  unpaidCount: number;
  unpaidValue: number;
};

type TransactionTotals = { count: number; debitTotal: number; creditTotal: number };
type ChartValue = { _id: string; value: number };

export async function GET() {
  try {
    await requireAdmin();
    const db = await getDb();
    const customers = db.collection("customers");
    const invoices = db.collection("invoices");
    const transactions = db.collection("transactions");
    const now = new Date();
    const todayKey = localDateKey(now);
    const todayStart = istDayStart(todayKey);
    const tomorrowStart = istDayStart(shiftDate(todayKey, 1));
    const currentMonthKey = todayKey.slice(0, 7);
    const chartStartMonth = shiftMonth(currentMonthKey, -5);
    const chartMonthStart = istDayStart(`${chartStartMonth}-01`);
    const firstChartDay = shiftDate(todayKey, -6);
    const dailyChartStart = istDayStart(firstChartDay);

    const customerBalancesPromise = customers.aggregate<CustomerBalanceResult>([
      { $match: { isActive: { $ne: false } } },
      {
        $lookup: {
          from: "transactions",
          let: { customerId: { $toString: "$_id" } },
          pipeline: [
            { $match: { $expr: { $eq: ["$customerId", "$$customerId"] } } },
            {
              $group: {
                _id: null,
                totalDebit: {
                  $sum: { $cond: [{ $eq: ["$transactionType", "DEBIT"] }, { $ifNull: ["$amount", 0] }, 0] }
                },
                totalCredit: {
                  $sum: { $cond: [{ $eq: ["$transactionType", "CREDIT"] }, { $ifNull: ["$amount", 0] }, 0] }
                },
                lastTransaction: { $max: "$transactionDate" }
              }
            }
          ],
          as: "ledger"
        }
      },
      {
        $set: {
          totalDebit: { $ifNull: [{ $arrayElemAt: ["$ledger.totalDebit", 0] }, 0] },
          totalCredit: { $ifNull: [{ $arrayElemAt: ["$ledger.totalCredit", 0] }, 0] },
          lastTransaction: { $arrayElemAt: ["$ledger.lastTransaction", 0] }
        }
      },
      {
        $set: {
          outstanding: {
            $round: [{ $subtract: [{ $add: [{ $ifNull: ["$openingBalance", 0] }, "$totalDebit"] }, "$totalCredit"] }, 2]
          }
        }
      },
      {
        $facet: {
          summary: [
            {
              $group: {
                _id: null,
                totalCustomers: { $sum: 1 },
                totalOutstanding: { $sum: { $cond: [{ $gt: ["$outstanding", 0] }, "$outstanding", 0] } },
                totalAdvances: { $sum: { $cond: [{ $lt: ["$outstanding", 0] }, { $abs: "$outstanding" }, 0] } },
                customersWithOutstanding: { $sum: { $cond: [{ $gt: ["$outstanding", 0] }, 1, 0] } },
                customersWithZeroBalance: { $sum: { $cond: [{ $eq: ["$outstanding", 0] }, 1, 0] } },
                customersWithAdvance: { $sum: { $cond: [{ $lt: ["$outstanding", 0] }, 1, 0] } }
              }
            }
          ],
          top: [
            { $match: { outstanding: { $gt: 0 } } },
            { $sort: { outstanding: -1, name: 1 } },
            { $limit: 5 },
            { $project: { name: 1, mobile: 1, outstanding: 1, lastTransaction: 1 } }
          ]
        }
      }
    ]).toArray();

    const [
      customerBalanceResult,
      invoiceTotalsRows,
      todayInvoiceRows,
      todayTransactionRows,
      todayNewCustomers,
      monthSalesRows,
      monthCollectionRows,
      dailySalesRows,
      dailyCollectionRows,
      recentInvoices,
      recentCustomers,
      recentTransactions,
      recentBalanceUpdates
    ] = await Promise.all([
      customerBalancesPromise,
      invoices.aggregate<InvoiceTotals>([
        {
          $group: {
            _id: null,
            totalInvoices: { $sum: 1 },
            paidInvoices: { $sum: { $cond: [{ $eq: ["$paymentStatus", "PAID"] }, 1, 0] } },
            unpaidInvoices: { $sum: { $cond: [{ $eq: ["$paymentStatus", "UNPAID"] }, 1, 0] } },
            totalInvoiceValue: { $sum: { $ifNull: ["$totalAmount", 0] } },
            unpaidInvoiceValue: { $sum: { $cond: [{ $eq: ["$paymentStatus", "UNPAID"] }, { $ifNull: ["$totalAmount", 0] }, 0] } }
          }
        }
      ]).toArray(),
      invoices.aggregate<TodayInvoiceTotals>([
        { $match: { createdAt: { $gte: todayStart, $lt: tomorrowStart } } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            totalValue: { $sum: { $ifNull: ["$totalAmount", 0] } },
            paidCount: { $sum: { $cond: [{ $eq: ["$paymentStatus", "PAID"] }, 1, 0] } },
            paidValue: { $sum: { $cond: [{ $eq: ["$paymentStatus", "PAID"] }, { $ifNull: ["$totalAmount", 0] }, 0] } },
            unpaidCount: { $sum: { $cond: [{ $eq: ["$paymentStatus", "UNPAID"] }, 1, 0] } },
            unpaidValue: { $sum: { $cond: [{ $eq: ["$paymentStatus", "UNPAID"] }, { $ifNull: ["$totalAmount", 0] }, 0] } }
          }
        }
      ]).toArray(),
      transactions.aggregate<TransactionTotals>([
        { $match: { createdAt: { $gte: todayStart, $lt: tomorrowStart } } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            debitTotal: { $sum: { $cond: [{ $eq: ["$transactionType", "DEBIT"] }, { $ifNull: ["$amount", 0] }, 0] } },
            creditTotal: { $sum: { $cond: [{ $eq: ["$transactionType", "CREDIT"] }, { $ifNull: ["$amount", 0] }, 0] } }
          }
        }
      ]).toArray(),
      customers.countDocuments({ isActive: { $ne: false }, createdAt: { $gte: todayStart, $lt: tomorrowStart } }),
      invoices.aggregate<ChartValue>([
        { $match: { createdAt: { $gte: chartMonthStart, $lt: tomorrowStart } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt", timezone: BUSINESS_TIME_ZONE } }, value: { $sum: { $ifNull: ["$totalAmount", 0] } } } }
      ]).toArray(),
      transactions.aggregate<ChartValue>([
        { $match: { transactionType: "CREDIT", createdAt: { $gte: chartMonthStart, $lt: tomorrowStart } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt", timezone: BUSINESS_TIME_ZONE } }, value: { $sum: { $ifNull: ["$amount", 0] } } } }
      ]).toArray(),
      invoices.aggregate<ChartValue>([
        { $match: { createdAt: { $gte: dailyChartStart, $lt: tomorrowStart } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: BUSINESS_TIME_ZONE } }, value: { $sum: { $ifNull: ["$totalAmount", 0] } } } }
      ]).toArray(),
      transactions.aggregate<ChartValue>([
        { $match: { transactionType: "CREDIT", createdAt: { $gte: dailyChartStart, $lt: tomorrowStart } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: BUSINESS_TIME_ZONE } }, value: { $sum: { $ifNull: ["$amount", 0] } } } }
      ]).toArray(),
      invoices.find({}, { projection: { invoiceNumber: 1, customerName: 1, invoiceDate: 1, totalAmount: 1, paymentStatus: 1, createdAt: 1 } }).sort({ createdAt: -1 }).limit(5).toArray(),
      customers.find({ isActive: { $ne: false } }, { projection: { name: 1, createdAt: 1 } }).sort({ createdAt: -1 }).limit(10).toArray(),
      transactions.find({}, { projection: { customerId: 1, transactionType: 1, entryCategory: 1, amount: 1, description: 1, createdAt: 1, invoiceId: 1 } }).sort({ createdAt: -1 }).limit(15).toArray(),
      db.collection("dashboardActivity").find({ kind: "balance" }).sort({ createdAt: -1 }).limit(10).toArray()
    ]);

    const customerResult = customerBalanceResult[0];
    const balanceSummary = customerResult?.summary[0];
    const todayInvoices = todayInvoiceRows[0];
    const todayTransactions = todayTransactionRows[0];
    const invoiceTotals = invoiceTotalsRows[0];
    const monthSales = new Map(monthSalesRows.map(row => [row._id, Number(row.value)]));
    const monthCollections = new Map(monthCollectionRows.map(row => [row._id, Number(row.value)]));
    const dailySales = new Map(dailySalesRows.map(row => [row._id, Number(row.value)]));
    const dailyCollections = new Map(dailyCollectionRows.map(row => [row._id, Number(row.value)]));
    const months = Array.from({ length: 6 }, (_, index) => shiftMonth(chartStartMonth, index));
    const days = Array.from({ length: 7 }, (_, index) => shiftDate(firstChartDay, index));
    const recentCustomerIds = [...new Set(recentTransactions.map(tx => String(tx.customerId)).filter(id => ObjectId.isValid(id)))].map(id => new ObjectId(id));
    const recentTransactionCustomers = recentCustomerIds.length
      ? await customers.find({ _id: { $in: recentCustomerIds } }, { projection: { name: 1 } }).toArray()
      : [];
    const customerNames = new Map(recentTransactionCustomers.map(customer => [customer._id.toString(), String(customer.name || "Customer")]));

    const activity = [
      ...recentInvoices.map(invoice => ({
        id: `invoice-${invoice._id.toString()}`,
        kind: "invoice",
        description: "Invoice created",
        customerName: String(invoice.customerName || "Customer"),
        amount: Number(invoice.totalAmount || 0),
        createdAt: invoice.createdAt,
        href: `/invoice/${invoice._id.toString()}`
      })),
      ...recentCustomers.map(customer => ({
        id: `customer-${customer._id.toString()}`,
        kind: "customer",
        description: "Customer added",
        customerName: String(customer.name || "Customer"),
        createdAt: customer.createdAt,
        href: `/customers/${customer._id.toString()}`
      })),
      ...recentBalanceUpdates.map(update => ({
        id: `balance-${update._id.toString()}`,
        kind: "balance",
        description: String(update.description || "Customer balance updated"),
        customerName: String(update.customerName || "Customer"),
        amount: Number(update.amount || 0),
        createdAt: update.createdAt,
        href: `/customers/${update.customerId}`
      })),
      ...recentTransactions.map(transaction => {
        const transactionType = transaction.transactionType === "CREDIT" ? "CREDIT" : "DEBIT";
        const invoiceId = typeof transaction.invoiceId === "string" ? transaction.invoiceId : "";
        return {
          id: `transaction-${transaction._id.toString()}`,
          kind: transactionType.toLowerCase(),
          description: transaction.entryCategory === "PAYMENT" ? "Payment received" : `${transactionType === "DEBIT" ? "Debit" : "Credit"} transaction recorded`,
          customerName: customerNames.get(String(transaction.customerId)) || "Customer",
          amount: Number(transaction.amount || 0),
          createdAt: transaction.createdAt,
          href: invoiceId ? `/invoice/${invoiceId}` : `/customers/${transaction.customerId}`
        };
      })
    ].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()).slice(0, 15);

    const recentInvoiceRows = recentInvoices.map(invoice => ({
      _id: invoice._id.toString(),
      invoiceNumber: String(invoice.invoiceNumber || ""),
      customerName: String(invoice.customerName || "Customer"),
      invoiceDate: invoice.invoiceDate,
      totalAmount: Number(invoice.totalAmount || 0),
      paymentStatus: String(invoice.paymentStatus || "UNPAID")
    }));

    return NextResponse.json({
      generatedAt: now.toISOString(),
      overview: {
        totalCustomers: Number(balanceSummary?.totalCustomers || 0),
        totalOutstanding: roundMoney(Number(balanceSummary?.totalOutstanding || 0)),
        totalAdvances: roundMoney(Number(balanceSummary?.totalAdvances || 0)),
        customersWithOutstanding: Number(balanceSummary?.customersWithOutstanding || 0),
        customersWithZeroBalance: Number(balanceSummary?.customersWithZeroBalance || 0),
        customersWithAdvance: Number(balanceSummary?.customersWithAdvance || 0),
        totalInvoices: Number(invoiceTotals?.totalInvoices || 0),
        paidInvoices: Number(invoiceTotals?.paidInvoices || 0),
        unpaidInvoices: Number(invoiceTotals?.unpaidInvoices || 0),
        totalInvoiceValue: roundMoney(Number(invoiceTotals?.totalInvoiceValue || 0)),
        unpaidInvoiceValue: roundMoney(Number(invoiceTotals?.unpaidInvoiceValue || 0)),
        totalSalesThisMonth: roundMoney(monthSales.get(currentMonthKey) || 0),
        totalCollectionsThisMonth: roundMoney(monthCollections.get(currentMonthKey) || 0),
        averageInvoiceValue: roundMoney(invoiceTotals?.totalInvoices ? Number(invoiceTotals.totalInvoiceValue || 0) / invoiceTotals.totalInvoices : 0)
      },
      today: {
        invoiceCount: Number(todayInvoices?.count || 0),
        invoiceValue: roundMoney(Number(todayInvoices?.totalValue || 0)),
        paidInvoiceCount: Number(todayInvoices?.paidCount || 0),
        paidInvoiceValue: roundMoney(Number(todayInvoices?.paidValue || 0)),
        unpaidInvoiceCount: Number(todayInvoices?.unpaidCount || 0),
        unpaidInvoiceValue: roundMoney(Number(todayInvoices?.unpaidValue || 0)),
        transactionCount: Number(todayTransactions?.count || 0),
        debitTotal: roundMoney(Number(todayTransactions?.debitTotal || 0)),
        collectionTotal: roundMoney(Number(todayTransactions?.creditTotal || 0)),
        newCustomerCount: todayNewCustomers
      },
      topCustomers: (customerResult?.top || []).map(customer => ({
        _id: customer._id.toString(),
        name: customer.name,
        mobile: customer.mobile || "",
        outstanding: roundMoney(customer.outstanding),
        lastTransaction: customer.lastTransaction || null
      })),
      charts: {
        monthly: months.map(month => ({
          key: month,
          label: new Intl.DateTimeFormat("en-IN", { month: "short", year: "2-digit", timeZone: BUSINESS_TIME_ZONE }).format(new Date(`${month}-01T12:00:00Z`)),
          sales: roundMoney(monthSales.get(month) || 0),
          collections: roundMoney(monthCollections.get(month) || 0)
        })),
        daily: days.map(day => ({
          key: day,
          label: new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", timeZone: BUSINESS_TIME_ZONE }).format(istDayStart(day)),
          sales: roundMoney(dailySales.get(day) || 0),
          collections: roundMoney(dailyCollections.get(day) || 0)
        }))
      },
      recentInvoices: recentInvoiceRows,
      recentActivity: activity
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load dashboard" }, { status: 500 });
  }
}
