export type TransactionType = "DEBIT" | "CREDIT";

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateBalance(openingBalance: number, transactions: Array<{ transactionType: TransactionType; amount: number }>) {
  const debit = transactions.filter(t => t.transactionType === "DEBIT").reduce((s, t) => s + Number(t.amount), 0);
  const credit = transactions.filter(t => t.transactionType === "CREDIT").reduce((s, t) => s + Number(t.amount), 0);
  return {
    totalDebit: roundMoney(debit),
    totalCredit: roundMoney(credit),
    pendingAmount: roundMoney(Number(openingBalance || 0) + debit - credit)
  };
}

export function formatINR(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(Number(value || 0));
}
