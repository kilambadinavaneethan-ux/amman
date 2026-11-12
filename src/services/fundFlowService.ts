import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore';
import { Alert } from 'react-native';
import { db, normalizeDateValue } from '../config/firebase';
import { roundCurrency } from '../../utils/currency';
import {
  DailyCashFlowPoint,
  DateGroupedEntries,
  FundAccount,
  FundAccountType,
  FundCategoryBreakdown,
  FundFlowFilter,
  FundFlowSummary,
  FundMovementType,
  FundTransaction,
  ReportPeriod,
  UnifiedFundEntry,
} from '../types/fundFlow';

export const DEFAULT_FUND_ACCOUNTS: FundAccount[] = [
  {
    id: 'acc_cash_default',
    name: 'Cash in Hand',
    type: 'cash',
    openingBalance: 0,
    isDefault: true,
    notes: 'Physical cash drawer / register',
  },
  {
    id: 'acc_bank_default',
    name: 'Primary Bank Account',
    type: 'bank',
    openingBalance: 0,
    isDefault: false,
    bankName: 'Bank',
    notes: 'Main Current / Savings account',
  },
  {
    id: 'acc_upi_default',
    name: 'UPI / Digital Wallet',
    type: 'upi',
    openingBalance: 0,
    isDefault: false,
    notes: 'Google Pay / PhonePe / Paytm / QR',
  },
];

export const INFLOW_CATEGORIES = [
  'Customer Payment',
  'Capital Addition',
  'Partner Investment',
  'Loan Received',
  'Tax Refund',
  'Customer Advance',
  'Interest Income',
  'Miscellaneous Inflow',
];

export const OUTFLOW_CATEGORIES = [
  'Raw Material Purchase',
  'Worker Wages',
  'Worker Bonuses & Incentives',
  'Delivery & Freight',
  'Delivery Partner Bonuses',
  'Customer Commissions & Rebates',
  'Goodwill & Other Bonuses',
  'Operating Expense',
  'Owner Drawings',
  'Personal Withdrawal',
  'Loan Repayment',
  'Tax / GST Payment',
  'Asset Purchase',
  'Bank Charges',
  'Miscellaneous Outflow',
];

export const TRANSFER_CATEGORIES = [
  'Cash Deposit to Bank',
  'Bank Withdrawal to Cash',
  'Bank to Bank Transfer',
  'Wallet Topup',
  'Internal Contra Transfer',
];

export function formatCurrency(amount: number): string {
  const safe = isNaN(amount) ? 0 : amount;
  return '₹' + Math.round(safe).toLocaleString('en-IN');
}

export function formatCurrencyExact(amount: number): string {
  const safe = isNaN(amount) ? 0 : amount;
  return '₹' + safe.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDate(date: any): string {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatTime(date: any): string {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function parseSafeDate(val: any): Date {
  if (!val) return new Date();
  if (val instanceof Date) return isNaN(val.getTime()) ? new Date() : val;
  if (typeof val.toDate === 'function') {
    try {
      const d = val.toDate();
      return isNaN(d.getTime()) ? new Date() : d;
    } catch {
      return new Date();
    }
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? new Date() : d;
}

/**
 * Calculate Date range boundaries for a given ReportPeriod
 */
export function getDateRangeForPeriod(
  period: ReportPeriod,
  customStart?: Date | null,
  customEnd?: Date | null
): { start: Date; end: Date; label: string } {
  const now = new Date();
  let start = new Date(now);
  let end = new Date(now);

  switch (period) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return { start, end, label: `Today (${formatDate(start)})` };

    case 'yesterday': {
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setHours(23, 59, 59, 999);
      return { start, end, label: `Yesterday (${formatDate(start)})` };
    }

    case 'this_week': {
      const day = start.getDay();
      const diffToMonday = day === 0 ? 6 : day - 1;
      start.setDate(start.getDate() - diffToMonday);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return { start, end, label: `This Week (${formatDate(start)} - ${formatDate(end)})` };
    }

    case 'last_week': {
      const day = start.getDay();
      const diffToMonday = day === 0 ? 6 : day - 1;
      start.setDate(start.getDate() - diffToMonday - 7);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { start, end, label: `Last Week (${formatDate(start)} - ${formatDate(end)})` };
    }

    case 'this_month': {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      return { start, end, label: `This Month (${start.toLocaleString('en-IN', { month: 'short' })} ${start.getFullYear()})` };
    }

    case 'last_month': {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { start, end, label: `Last Month (${start.toLocaleString('en-IN', { month: 'short' })} ${start.getFullYear()})` };
    }

    case 'this_quarter': {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      start = new Date(now.getFullYear(), qMonth, 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), qMonth + 3, 0, 23, 59, 59, 999);
      const qNum = Math.floor(now.getMonth() / 3) + 1;
      return { start, end, label: `Q${qNum} ${now.getFullYear()} (${formatDate(start)} - ${formatDate(end)})` };
    }

    case 'this_year': {
      start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      return { start, end, label: `Year ${now.getFullYear()}` };
    }

    case 'custom': {
      const s = customStart ? new Date(customStart) : new Date(now.getFullYear(), now.getMonth(), 1);
      s.setHours(0, 0, 0, 0);
      const e = customEnd ? new Date(customEnd) : new Date(now);
      e.setHours(23, 59, 59, 999);
      return { start: s, end: e, label: `${formatDate(s)} - ${formatDate(e)}` };
    }

    case 'all_time':
    default: {
      const epoch = new Date(2020, 0, 1, 0, 0, 0, 0);
      const farFuture = new Date(2035, 11, 31, 23, 59, 59, 999);
      return { start: epoch, end: farFuture, label: 'All Time' };
    }
  }
}

/**
 * Maps payment method string to standard account ID
 */
export function resolveAccountIdFromPaymentMethod(
  method: string,
  accounts: FundAccount[] = []
): string {
  const norm = (method || '').toLowerCase().trim();
  if (norm === 'cash') {
    const cashAcc = accounts.find((a) => a.type === 'cash');
    return cashAcc ? cashAcc.id : 'acc_cash_default';
  }
  if (norm === 'upi' || norm.includes('gpay') || norm.includes('phonepe') || norm.includes('paytm')) {
    const upiAcc = accounts.find((a) => a.type === 'upi');
    return upiAcc ? upiAcc.id : 'acc_upi_default';
  }
  // Bank transfer, cheque, card, NEFT, RTGS
  const bankAcc = accounts.find((a) => a.type === 'bank');
  return bankAcc ? bankAcc.id : 'acc_bank_default';
}

/**
 * Subscribes to Firestore fund_accounts
 */
export function subscribeFundAccounts(
  callback: (accounts: FundAccount[]) => void,
  onError?: (err: any) => void
) {
  const colRef = collection(db, 'fund_accounts');
  return onSnapshot(
    colRef,
    (snapshot) => {
      if (snapshot.empty) {
        callback(DEFAULT_FUND_ACCOUNTS);
        return;
      }
      const loaded: FundAccount[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name || 'Account',
          type: (data.type || 'other') as FundAccountType,
          openingBalance: Number(data.openingBalance || 0),
          accountNumber: data.accountNumber || '',
          bankName: data.bankName || '',
          upiId: data.upiId || '',
          isDefault: !!data.isDefault,
          notes: data.notes || '',
          createdAt: normalizeDateValue(data.createdAt),
          updatedAt: normalizeDateValue(data.updatedAt),
        };
      });
      callback(loaded);
    },
    (err) => {
      if (onError) onError(err);
      callback(DEFAULT_FUND_ACCOUNTS);
    }
  );
}

/**
 * Subscribes to Firestore fund_transactions
 */
export function subscribeFundTransactions(
  callback: (txs: FundTransaction[]) => void,
  onError?: (err: any) => void
) {
  const colRef = collection(db, 'fund_transactions');
  const q = query(colRef, orderBy('date', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const loaded: FundTransaction[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          type: (data.type || 'inflow') as FundMovementType,
          category: data.category || 'General',
          amount: Number(data.amount || 0),
          date: parseSafeDate(data.date || data.createdAt),
          fromAccountId: data.fromAccountId || '',
          fromAccountName: data.fromAccountName || '',
          toAccountId: data.toAccountId || '',
          toAccountName: data.toAccountName || '',
          paymentMethod: data.paymentMethod || 'Cash',
          referenceNumber: data.referenceNumber || '',
          notes: data.notes || '',
          createdAt: parseSafeDate(data.createdAt),
          createdBy: data.createdBy || '',
        };
      });
      callback(loaded);
    },
    (err) => {
      if (onError) onError(err);
      callback([]);
    }
  );
}

/**
 * Add a new manual fund transaction to Firestore
 */
export async function addFundTransaction(tx: Omit<FundTransaction, 'id'>): Promise<string> {
  const colRef = collection(db, 'fund_transactions');
  const docRef = await addDoc(colRef, {
    ...tx,
    amount: Number(tx.amount || 0),
    date: tx.date instanceof Date ? tx.date : new Date(tx.date),
    createdAt: new Date(),
  });
  return docRef.id;
}

/**
 * Delete a manual fund transaction from Firestore
 */
export async function deleteFundTransaction(id: string): Promise<boolean> {
  try {
    const docRef = doc(db, 'fund_transactions', id);
    await deleteDoc(docRef);
    return true;
  } catch (err) {
    console.error('Error deleting fund transaction:', err);
    throw err;
  }
}

/**
 * Save / Update a fund account in Firestore
 */
export async function saveFundAccount(account: FundAccount): Promise<string> {
  const id = account.id || `acc_${Date.now()}`;
  const docRef = doc(db, 'fund_accounts', id);
  await setDoc(
    docRef,
    {
      ...account,
      id,
      openingBalance: Number(account.openingBalance || 0),
      updatedAt: new Date(),
    },
    { merge: true }
  );
  return id;
}

/**
 * Delete a custom fund account
 */
export async function deleteFundAccount(id: string): Promise<boolean> {
  try {
    const docRef = doc(db, 'fund_accounts', id);
    await deleteDoc(docRef);
    return true;
  } catch (err) {
    console.error('Error deleting fund account:', err);
    throw err;
  }
}

/**
 * Harmonize all incoming and outgoing financial touchpoints into a unified fund stream
 */
export function unifyFundEntries({
  customerPayments = [],
  expenses = [],
  expensePayments = [],
  rawLogs = [],
  workerPayments = [],
  deliveryPayments = [],
  workerBonuses = [],
  deliveryBonuses = [],
  customerBonuses = [],
  otherBonuses = [],
  fundTransactions = [],
  accounts = DEFAULT_FUND_ACCOUNTS,
  workerMap = new Map(),
  partnerMap = new Map(),
}: {
  customerPayments?: any[];
  expenses?: any[];
  expensePayments?: any[];
  rawLogs?: any[];
  workerPayments?: any[];
  deliveryPayments?: any[];
  workerBonuses?: any[];
  deliveryBonuses?: any[];
  customerBonuses?: any[];
  otherBonuses?: any[];
  fundTransactions?: FundTransaction[];
  accounts?: FundAccount[];
  workerMap?: Map<string, { name: string }>;
  partnerMap?: Map<string, { name: string }>;
}): UnifiedFundEntry[] {
  const stream: UnifiedFundEntry[] = [];
  const accountMap = new Map<string, FundAccount>();
  accounts.forEach((acc) => accountMap.set(acc.id, acc));

  // 1. Customer Payments (INFLOW)
  customerPayments.forEach((p) => {
    const amt = Number(p.amountReceived !== undefined ? p.amountReceived : p.amount || 0);
    if (amt <= 0) return;
    const date = parseSafeDate(p.createdAt || p.paymentDate || p.date);
    const method = p.paymentMethod || 'Cash';
    const accId = resolveAccountIdFromPaymentMethod(method, accounts);
    const acc = accountMap.get(accId);

    stream.push({
      id: `cp_${p.id}`,
      rawId: p.id,
      type: 'inflow',
      sourceType: 'customer_payment',
      sourceLabel: 'Customer Collection',
      title: p.customerName ? `Payment from ${p.customerName}` : 'Customer Payment',
      category: 'Customer Payment',
      amount: amt,
      paymentMethod: method,
      date,
      accountId: accId,
      accountName: acc?.name || method,
      partyName: p.customerName || 'Customer',
      notes: p.notes || (p.discountAmount ? `Discount: ₹${p.discountAmount}` : ''),
      referenceNumber: p.receiptNumber || p.invoiceNumber || '',
      isManual: false,
    });
  });

  // 2. Direct Expense Payments (OUTFLOW)
  const processedExpenseIds = new Set<string>();
  (expensePayments || []).forEach((ep) => {
    const amt = Number(ep.amount || 0);
    if (amt <= 0) return;
    const date = parseSafeDate(ep.paidAt || ep.createdAt || ep.date);
    const method = ep.paymentMethod || 'Cash';
    const accId = resolveAccountIdFromPaymentMethod(method, accounts);
    const acc = accountMap.get(accId);
    if (ep.expenseId) processedExpenseIds.add(ep.expenseId);

    stream.push({
      id: `ep_${ep.id}`,
      rawId: ep.id,
      type: 'outflow',
      sourceType: 'operating_expense',
      sourceLabel: 'Expense Payment',
      title: ep.expenseTitle || 'Business Expense',
      category: ep.expenseCategory || 'Operating Expense',
      amount: amt,
      paymentMethod: method,
      date,
      accountId: accId,
      accountName: acc?.name || method,
      partyName: ep.payeeName || ep.expenseTitle || 'Vendor',
      notes: ep.notes || '',
      isManual: false,
    });
  });

  // 3. Paid Expenses directly from expenses collection (OUTFLOW)
  (expenses || []).forEach((e) => {
    if (processedExpenseIds.has(e.id)) return;
    const paidAmt = Number(
      e.paidAmount !== undefined ? e.paidAmount : e.status === 'Paid' ? e.amount || e.totalAmount : 0
    );
    if (paidAmt <= 0) return;
    const date = parseSafeDate(e.expenseDate || e.createdAt);
    const method = e.paymentMethod || e.paymentMode || 'Cash';
    const accId = resolveAccountIdFromPaymentMethod(method, accounts);
    const acc = accountMap.get(accId);

    stream.push({
      id: `exp_${e.id}`,
      rawId: e.id,
      type: 'outflow',
      sourceType: 'operating_expense',
      sourceLabel: 'Operating Expense',
      title: e.title || 'Direct Expense',
      category: e.category || 'Operating Expense',
      amount: paidAmt,
      paymentMethod: method,
      date,
      accountId: accId,
      accountName: acc?.name || method,
      partyName: e.vendorName || e.title || 'Vendor',
      notes: e.notes || '',
      isManual: false,
    });
  });

  // 4. Raw Material Supplier Payments (OUTFLOW)
  (rawLogs || [])
    .filter((l) => (l.type === 'payment' || l.action === 'payment') && Number(l.amount || l.paidAmount || 0) > 0)
    .forEach((l) => {
      const amt = Number(l.amount || l.paidAmount || 0);
      const date = parseSafeDate(l.date || l.createdAt);
      const method = l.paymentMode || l.paymentMethod || 'Cash';
      const accId = resolveAccountIdFromPaymentMethod(method, accounts);
      const acc = accountMap.get(accId);

      stream.push({
        id: `supp_${l.id}`,
        rawId: l.id,
        type: 'outflow',
        sourceType: 'supplier_payout',
        sourceLabel: 'Supplier Payout',
        title: l.supplierName ? `Supplier Payout: ${l.supplierName}` : 'Raw Material Purchase',
        category: 'Raw Material Purchase',
        amount: amt,
        paymentMethod: method,
        date,
        accountId: accId,
        accountName: acc?.name || method,
        partyName: l.supplierName || 'Raw Material Supplier',
        notes: l.notes || '',
        referenceNumber: l.billNumber || '',
        isManual: false,
      });
    });

  // 5. Worker Wages & Payouts (OUTFLOW)
  (workerPayments || []).forEach((wp) => {
    const amt = Number(wp.amount || 0);
    if (amt <= 0) return;
    const date = parseSafeDate(wp.createdAt || wp.date || wp.paymentDate);
    const method = wp.paymentMethod || 'Cash';
    const accId = resolveAccountIdFromPaymentMethod(method, accounts);
    const acc = accountMap.get(accId);

    stream.push({
      id: `wp_${wp.id}`,
      rawId: wp.id,
      type: 'outflow',
      sourceType: 'worker_wage',
      sourceLabel: 'Worker Wage',
      title: wp.workerName ? `Wage to ${wp.workerName}` : 'Worker Wage Payment',
      category: 'Worker Wages',
      amount: amt,
      paymentMethod: method,
      date,
      accountId: accId,
      accountName: acc?.name || method,
      partyName: wp.workerName || 'Worker',
      notes: wp.notes || (wp.attendanceCount ? `Days: ${wp.attendanceCount}` : ''),
      isManual: false,
    });
  });

  // 6. Delivery Partner Freight / Fees (OUTFLOW)
  (deliveryPayments || []).forEach((dp) => {
    const amt = Number(dp.amount || 0);
    if (amt <= 0) return;
    const date = parseSafeDate(dp.createdAt || dp.date);
    const method = dp.paymentMethod || 'Cash';
    const accId = resolveAccountIdFromPaymentMethod(method, accounts);
    const acc = accountMap.get(accId);

    stream.push({
      id: `dp_${dp.id}`,
      rawId: dp.id,
      type: 'outflow',
      sourceType: 'delivery_fee',
      sourceLabel: 'Delivery Payout',
      title: dp.partnerName ? `Freight to ${dp.partnerName}` : 'Logistics Payment',
      category: 'Delivery & Freight',
      amount: amt,
      paymentMethod: method,
      date,
      accountId: accId,
      accountName: acc?.name || method,
      partyName: dp.partnerName || 'Delivery Partner',
      notes: dp.notes || '',
      isManual: false,
    });
  });

  // 7. Worker Bonuses & Incentives (OUTFLOW)
  (workerBonuses || []).forEach((wb) => {
    const amt = Number(wb.amount || 0);
    if (amt <= 0) return;
    const date = parseSafeDate(wb.createdAt || wb.date);
    const method = wb.paymentMethod || 'Cash';
    const accId = resolveAccountIdFromPaymentMethod(method, accounts);
    const acc = accountMap.get(accId);
    const workerName = workerMap.get(wb.workerId)?.name || wb.workerName || 'Worker';

    stream.push({
      id: `wb_${wb.id}`,
      rawId: wb.id,
      type: 'outflow',
      sourceType: 'worker_bonus',
      sourceLabel: 'Worker Bonus',
      title: wb.reason ? `Bonus (${wb.reason}): ${workerName}` : `Worker Bonus: ${workerName}`,
      category: 'Worker Bonuses & Incentives',
      amount: amt,
      paymentMethod: method,
      date,
      accountId: accId,
      accountName: acc?.name || method,
      partyName: workerName,
      notes: wb.notes || '',
      isManual: false,
    });
  });

  // 8. Delivery Partner Bonuses (OUTFLOW)
  (deliveryBonuses || []).forEach((db) => {
    const amt = Number(db.amount || 0);
    if (amt <= 0) return;
    const date = parseSafeDate(db.createdAt || db.date);
    const method = db.paymentMethod || 'Cash';
    const accId = resolveAccountIdFromPaymentMethod(method, accounts);
    const acc = accountMap.get(accId);
    const partnerName = partnerMap.get(db.partnerId)?.name || db.partnerName || 'Delivery Partner';

    stream.push({
      id: `db_${db.id}`,
      rawId: db.id,
      type: 'outflow',
      sourceType: 'delivery_bonus',
      sourceLabel: 'Delivery Bonus',
      title: db.reason ? `Bonus (${db.reason}): ${partnerName}` : `Delivery Bonus: ${partnerName}`,
      category: 'Delivery Partner Bonuses',
      amount: amt,
      paymentMethod: method,
      date,
      accountId: accId,
      accountName: acc?.name || method,
      partyName: partnerName,
      notes: db.notes || '',
      isManual: false,
    });
  });

  // 9. Marked Customer Commissions & Rebates (OUTFLOW)
  (customerBonuses || []).forEach((cb) => {
    const amt = Number(cb.amount || 0);
    if (amt <= 0) return;
    const date = parseSafeDate(cb.createdAt || cb.date);
    const method = cb.paymentMethod || 'Cash';
    const accId = resolveAccountIdFromPaymentMethod(method, accounts);
    const acc = accountMap.get(accId);
    const customerName = cb.customerName || 'Marked Customer';
    const markingsText = cb.markings && cb.markings.length > 0 ? ` [${cb.markings.join(', ')}]` : '';

    stream.push({
      id: `cb_${cb.id}`,
      rawId: cb.id,
      type: 'outflow',
      sourceType: 'customer_bonus',
      sourceLabel: 'Customer Commission / Rebate',
      title: cb.reason ? `${cb.reason}: ${customerName}${markingsText}` : `Customer Commission: ${customerName}`,
      category: 'Customer Commissions & Rebates',
      amount: amt,
      paymentMethod: method,
      date,
      accountId: accId,
      accountName: acc?.name || method,
      partyName: `${customerName}${markingsText}`,
      notes: cb.notes || '',
      isManual: false,
    });
  });

  // 9b. Goodwill & Other External Bonuses (OUTFLOW)
  (otherBonuses || []).forEach((ob) => {
    const amt = Number(ob.amount || 0);
    if (amt <= 0) return;
    const date = parseSafeDate(ob.createdAt || ob.date);
    const method = ob.paymentMethod || 'Cash';
    const accId = resolveAccountIdFromPaymentMethod(method, accounts);
    const acc = accountMap.get(accId);
    const recipientName = ob.recipientName || 'Goodwill Recipient';
    const roleText = ob.recipientRole ? ` (${ob.recipientRole})` : '';

    stream.push({
      id: `ob_${ob.id}`,
      rawId: ob.id,
      type: 'outflow',
      sourceType: 'other_bonus' as any,
      sourceLabel: 'Goodwill / Other Bonus',
      title: ob.reason ? `${ob.reason}: ${recipientName}${roleText}` : `Bonus: ${recipientName}${roleText}`,
      category: 'Goodwill & Other Bonuses',
      amount: amt,
      paymentMethod: method,
      date,
      accountId: accId,
      accountName: acc?.name || method,
      partyName: `${recipientName}${roleText}`,
      notes: ob.notes || '',
      isManual: false,
    });
  });

  // 10. Manual Fund Transactions (INFLOW / OUTFLOW / CONTRA TRANSFER)
  (fundTransactions || []).forEach((ft) => {
    const amt = Number(ft.amount || 0);
    if (amt <= 0) return;
    const date = parseSafeDate(ft.date || ft.createdAt);

    if (ft.type === 'transfer') {
      const fromAcc = accountMap.get(ft.fromAccountId || '') || accounts.find((a) => a.id === ft.fromAccountId);
      const toAcc = accountMap.get(ft.toAccountId || '') || accounts.find((a) => a.id === ft.toAccountId);

      stream.push({
        id: `ft_${ft.id}`,
        rawId: ft.id,
        type: 'transfer',
        sourceType: 'contra_transfer',
        sourceLabel: 'Contra Transfer',
        title: `Transfer: ${fromAcc?.name || 'Account'} → ${toAcc?.name || 'Account'}`,
        category: ft.category || 'Internal Contra Transfer',
        amount: amt,
        paymentMethod: ft.paymentMethod || 'Transfer',
        date,
        accountId: ft.fromAccountId,
        accountName: fromAcc?.name || 'From Account',
        toAccountId: ft.toAccountId,
        toAccountName: toAcc?.name || 'To Account',
        partyName: `${fromAcc?.name || 'Acc'} to ${toAcc?.name || 'Acc'}`,
        notes: ft.notes || '',
        referenceNumber: ft.referenceNumber || '',
        isManual: true,
      });
    } else if (ft.type === 'inflow') {
      const acc = accountMap.get(ft.toAccountId || ft.fromAccountId || '') || accounts[0];
      stream.push({
        id: `ft_${ft.id}`,
        rawId: ft.id,
        type: 'inflow',
        sourceType: 'manual_inflow',
        sourceLabel: 'Direct Fund Inflow',
        title: ft.category || 'Fund Inflow',
        category: ft.category || 'Capital Addition',
        amount: amt,
        paymentMethod: ft.paymentMethod || 'Cash',
        date,
        accountId: acc?.id,
        accountName: acc?.name || ft.paymentMethod,
        notes: ft.notes || '',
        referenceNumber: ft.referenceNumber || '',
        isManual: true,
      });
    } else {
      // Manual Outflow
      const acc = accountMap.get(ft.fromAccountId || '') || accounts[0];
      stream.push({
        id: `ft_${ft.id}`,
        rawId: ft.id,
        type: 'outflow',
        sourceType: 'manual_outflow',
        sourceLabel: 'Direct Fund Outflow',
        title: ft.category || 'Fund Outflow',
        category: ft.category || 'Owner Drawings',
        amount: amt,
        paymentMethod: ft.paymentMethod || 'Cash',
        date,
        accountId: acc?.id,
        accountName: acc?.name || ft.paymentMethod,
        notes: ft.notes || '',
        referenceNumber: ft.referenceNumber || '',
        isManual: true,
      });
    }
  });

  // Sort descending by date
  stream.sort((a, b) => b.date.getTime() - a.date.getTime());
  return stream;
}

/**
 * Filter unified fund stream based on user criteria
 */
export function filterFundEntries(
  entries: UnifiedFundEntry[],
  filter: FundFlowFilter,
  dateBounds: { start: Date; end: Date }
): UnifiedFundEntry[] {
  const { start, end } = dateBounds;
  const startTime = start.getTime();
  const endTime = end.getTime();
  const search = filter.searchQuery.trim().toLowerCase();

  return entries.filter((e) => {
    // 1. Date window
    const t = e.date.getTime();
    if (t < startTime || t > endTime) return false;

    // 2. Type filter
    if (filter.typeFilter !== 'all' && e.type !== filter.typeFilter) return false;

    // 3. Account filter
    if (filter.accountId && filter.accountId !== 'all') {
      const matchesFrom = e.accountId === filter.accountId;
      const matchesTo = e.toAccountId === filter.accountId;
      if (!matchesFrom && !matchesTo) return false;
    }

    // 4. Search query
    if (search) {
      const matchTitle = (e.title || '').toLowerCase().includes(search);
      const matchCategory = (e.category || '').toLowerCase().includes(search);
      const matchParty = (e.partyName || '').toLowerCase().includes(search);
      const matchNotes = (e.notes || '').toLowerCase().includes(search);
      const matchRef = (e.referenceNumber || '').toLowerCase().includes(search);
      const matchMethod = (e.paymentMethod || '').toLowerCase().includes(search);
      if (!matchTitle && !matchCategory && !matchParty && !matchNotes && !matchRef && !matchMethod) {
        return false;
      }
    }

    // 5. Category filter
    if (filter.categoryFilter && filter.categoryFilter !== 'all') {
      if (e.category !== filter.categoryFilter) return false;
    }

    return true;
  });
}

/**
 * Compute real-time balances for Treasury accounts based on ALL time entries
 */
export function computeAccountBalances(
  allEntries: UnifiedFundEntry[],
  accounts: FundAccount[] = DEFAULT_FUND_ACCOUNTS
): Record<string, { balance: number; inflowTotal: number; outflowTotal: number; count: number }> {
  const balances: Record<
    string,
    { balance: number; inflowTotal: number; outflowTotal: number; count: number }
  > = {};

  accounts.forEach((acc) => {
    balances[acc.id] = {
      balance: roundCurrency(acc.openingBalance || 0),
      inflowTotal: 0,
      outflowTotal: 0,
      count: 0,
    };
  });

  allEntries.forEach((e) => {
    const amt = roundCurrency(e.amount);
    if (e.type === 'inflow') {
      const accId = e.accountId || 'acc_cash_default';
      if (balances[accId]) {
        balances[accId].balance = roundCurrency(balances[accId].balance + amt);
        balances[accId].inflowTotal = roundCurrency(balances[accId].inflowTotal + amt);
        balances[accId].count += 1;
      }
    } else if (e.type === 'outflow') {
      const accId = e.accountId || 'acc_cash_default';
      if (balances[accId]) {
        balances[accId].balance = roundCurrency(balances[accId].balance - amt);
        balances[accId].outflowTotal = roundCurrency(balances[accId].outflowTotal + amt);
        balances[accId].count += 1;
      }
    } else if (e.type === 'transfer') {
      // Contra: Deduct from source, add to destination
      if (e.accountId && balances[e.accountId]) {
        balances[e.accountId].balance = roundCurrency(balances[e.accountId].balance - amt);
        balances[e.accountId].outflowTotal = roundCurrency(balances[e.accountId].outflowTotal + amt);
        balances[e.accountId].count += 1;
      }
      if (e.toAccountId && balances[e.toAccountId]) {
        balances[e.toAccountId].balance = roundCurrency(balances[e.toAccountId].balance + amt);
        balances[e.toAccountId].inflowTotal = roundCurrency(balances[e.toAccountId].inflowTotal + amt);
        balances[e.toAccountId].count += 1;
      }
    }
  });

  return balances;
}

/**
 * Calculate Fund Flow Summary and Statement Breakdowns
 */
export function computeFundFlowSummary(
  filteredEntries: UnifiedFundEntry[],
  allEntries: UnifiedFundEntry[],
  accounts: FundAccount[],
  periodStart: Date
): FundFlowSummary {
  let totalInflow = 0;
  let totalOutflow = 0;
  let transferVolume = 0;
  let inflowCount = 0;
  let outflowCount = 0;
  let transferCount = 0;

  const inflowCategoryMap = new Map<string, { amount: number; count: number }>();
  const outflowCategoryMap = new Map<string, { amount: number; count: number }>();

  filteredEntries.forEach((e) => {
    const amt = roundCurrency(e.amount);
    if (e.type === 'inflow') {
      totalInflow = roundCurrency(totalInflow + amt);
      inflowCount += 1;
      const cat = e.category || 'Other Inflow';
      const cur = inflowCategoryMap.get(cat) || { amount: 0, count: 0 };
      inflowCategoryMap.set(cat, { amount: roundCurrency(cur.amount + amt), count: cur.count + 1 });
    } else if (e.type === 'outflow') {
      totalOutflow = roundCurrency(totalOutflow + amt);
      outflowCount += 1;
      const cat = e.category || 'Other Outflow';
      const cur = outflowCategoryMap.get(cat) || { amount: 0, count: 0 };
      outflowCategoryMap.set(cat, { amount: roundCurrency(cur.amount + amt), count: cur.count + 1 });
    } else if (e.type === 'transfer') {
      transferVolume = roundCurrency(transferVolume + amt);
      transferCount += 1;
    }
  });

  const netFlow = roundCurrency(totalInflow - totalOutflow);
  const coverageRatio = totalOutflow > 0 ? totalInflow / totalOutflow : totalInflow > 0 ? 99 : 1;

  // Compute Opening Funds at period start
  let openingLiquidFunds = roundCurrency(accounts.reduce((acc, a) => acc + Number(a.openingBalance || 0), 0));
  const pStartTime = periodStart.getTime();

  allEntries.forEach((e) => {
    if (e.date.getTime() < pStartTime) {
      const amt = roundCurrency(e.amount);
      if (e.type === 'inflow') openingLiquidFunds = roundCurrency(openingLiquidFunds + amt);
      else if (e.type === 'outflow') openingLiquidFunds = roundCurrency(openingLiquidFunds - amt);
      // transfers don't change net liquid pool
    }
  });

  const closingLiquidFunds = roundCurrency(openingLiquidFunds + netFlow);

  // Categories Breakdown
  const inflowCategories: FundCategoryBreakdown[] = Array.from(inflowCategoryMap.entries())
    .map(([category, val]) => ({
      category,
      totalAmount: val.amount,
      count: val.count,
      percentage: totalInflow > 0 ? (val.amount / totalInflow) * 100 : 0,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  const outflowCategories: FundCategoryBreakdown[] = Array.from(outflowCategoryMap.entries())
    .map(([category, val]) => ({
      category,
      totalAmount: val.amount,
      count: val.count,
      percentage: totalOutflow > 0 ? (val.amount / totalOutflow) * 100 : 0,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  return {
    totalInflow,
    totalOutflow,
    netFlow,
    transferVolume,
    openingLiquidFunds,
    closingLiquidFunds,
    coverageRatio,
    inflowCount,
    outflowCount,
    transferCount,
    inflowCategories,
    outflowCategories,
  };
}

/**
 * Compute chronological running balances on unified fund entries.
 * Returns entries with .runningBalance populated in descending date order (newest first).
 */
export function computeRunningBalances(
  allEntries: UnifiedFundEntry[],
  accounts: FundAccount[] = DEFAULT_FUND_ACCOUNTS,
  selectedAccountId?: string
): UnifiedFundEntry[] {
  // Determine opening balance
  let running = 0;
  const isSpecificAccount = selectedAccountId && selectedAccountId !== 'all';

  if (isSpecificAccount) {
    const targetAcc = accounts.find((a) => a.id === selectedAccountId);
    running = roundCurrency(targetAcc?.openingBalance || 0);
  } else {
    running = roundCurrency(accounts.reduce((sum, a) => sum + Number(a.openingBalance || 0), 0));
  }

  // Sort ascending (chronological) to accumulate balance
  const ascending = [...allEntries].sort((a, b) => a.date.getTime() - b.date.getTime());

  const processed = ascending.map((entry) => {
    const amt = roundCurrency(entry.amount);
    if (isSpecificAccount) {
      if (entry.type === 'inflow') {
        if (entry.accountId === selectedAccountId || entry.toAccountId === selectedAccountId) {
          running = roundCurrency(running + amt);
        }
      } else if (entry.type === 'outflow') {
        if (entry.accountId === selectedAccountId) {
          running = roundCurrency(running - amt);
        }
      } else if (entry.type === 'transfer') {
        if (entry.toAccountId === selectedAccountId) {
          running = roundCurrency(running + amt);
        } else if (entry.accountId === selectedAccountId) {
          running = roundCurrency(running - amt);
        }
      }
    } else {
      if (entry.type === 'inflow') {
        running = roundCurrency(running + amt);
      } else if (entry.type === 'outflow') {
        running = roundCurrency(running - amt);
      }
      // Internal transfers don't change net portfolio balance across all accounts
    }

    return {
      ...entry,
      runningBalance: running,
    };
  });

  // Return in descending order (newest first for display)
  return processed.sort((a, b) => b.date.getTime() - a.date.getTime());
}

/**
 * Group filtered entries by date for structured, passbook-style ledger view.
 */
export function groupEntriesByDate(entries: UnifiedFundEntry[]): DateGroupedEntries[] {
  const groupsMap = new Map<
    string,
    { date: Date; dateLabel: string; entries: UnifiedFundEntry[]; totalInflow: number; totalOutflow: number }
  >();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  entries.forEach((entry) => {
    const d = new Date(entry.date);
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    let group = groupsMap.get(dateKey);
    if (!group) {
      const checkDate = new Date(d);
      checkDate.setHours(0, 0, 0, 0);
      let dateLabel = '';
      if (checkDate.getTime() === today.getTime()) {
        dateLabel = 'Today';
      } else if (checkDate.getTime() === yesterday.getTime()) {
        dateLabel = 'Yesterday';
      } else {
        dateLabel = formatDate(d);
      }
      group = {
        date: d,
        dateLabel,
        entries: [],
        totalInflow: 0,
        totalOutflow: 0,
      };
      groupsMap.set(dateKey, group);
    }

    group.entries.push(entry);
    if (entry.type === 'inflow') {
      group.totalInflow += entry.amount;
    } else if (entry.type === 'outflow') {
      group.totalOutflow += entry.amount;
    }
  });

  return Array.from(groupsMap.entries()).map(([dateKey, val]) => ({
    dateKey,
    dateLabel: val.dateLabel,
    date: val.date,
    totalInflow: val.totalInflow,
    totalOutflow: val.totalOutflow,
    entries: val.entries,
  }));
}

/**
 * Compute daily cash flow points for visual chart in Statement tab.
 */
export function computeDailyCashFlow(
  filteredEntries: UnifiedFundEntry[],
  dateBounds: { start: Date; end: Date }
): DailyCashFlowPoint[] {
  const dayMs = 24 * 60 * 60 * 1000;
  const startTime = dateBounds.start.getTime();
  const endTime = dateBounds.end.getTime();
  const totalDays = Math.max(1, Math.round((endTime - startTime) / dayMs));

  const pointsMap = new Map<
    string,
    { date: Date; dateLabel: string; inflow: number; outflow: number; net: number }
  >();

  // If period is <= 14 days, populate continuous days so chart looks balanced
  if (totalDays <= 14 && totalDays > 0) {
    const cur = new Date(dateBounds.start);
    cur.setHours(0, 0, 0, 0);
    const endBoundary = new Date(dateBounds.end);
    endBoundary.setHours(23, 59, 59, 999);

    while (cur.getTime() <= endBoundary.getTime()) {
      const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
      const label = cur.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      pointsMap.set(key, {
        date: new Date(cur),
        dateLabel: label,
        inflow: 0,
        outflow: 0,
        net: 0,
      });
      cur.setDate(cur.getDate() + 1);
    }
  }

  // Populate from entries
  filteredEntries.forEach((e) => {
    const d = new Date(e.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    let pt = pointsMap.get(key);
    if (!pt) {
      const label = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      pt = {
        date: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
        dateLabel: label,
        inflow: 0,
        outflow: 0,
        net: 0,
      };
      pointsMap.set(key, pt);
    }

    if (e.type === 'inflow') {
      pt.inflow += e.amount;
    } else if (e.type === 'outflow') {
      pt.outflow += e.amount;
    }
    pt.net = pt.inflow - pt.outflow;
  });

  const sortedPoints = Array.from(pointsMap.values()).sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );

  // Return at most the last 14 days
  if (sortedPoints.length > 14) {
    return sortedPoints.slice(sortedPoints.length - 14);
  }
  return sortedPoints;
}

/**
 * Generate formatted HTML for PDF Fund Flow Statement
 */
export function generateFundFlowHtml(
  summary: FundFlowSummary,
  entries: UnifiedFundEntry[],
  accounts: FundAccount[],
  periodLabel: string,
  profile: any = {}
): string {
  const companyName = profile?.businessName || profile?.fullName || 'Business Enterprise';
  const companyPhone = profile?.phone || profile?.mobile || '';
  const companyEmail = profile?.email || '';

  const netColor = summary.netFlow >= 0 ? '#10B981' : '#EF4444';
  const netBadge = summary.netFlow >= 0 ? 'NET SURPLUS' : 'NET DEFICIT';

  const accountCardsHtml = accounts
    .map((acc) => {
      return `
      <div style="border: 1px solid #E2E8F0; border-radius: 8px; padding: 10px 14px; background: #F8FAFC; min-width: 140px; flex: 1;">
        <div style="font-size: 11px; color: #64748B; text-transform: uppercase; font-weight: 600;">${acc.name}</div>
        <div style="font-size: 14px; font-weight: 700; color: #0F172A; margin-top: 4px;">Opening: ${formatCurrency(acc.openingBalance)}</div>
      </div>
    `;
    })
    .join('');

  const inflowRows = summary.inflowCategories
    .map(
      (cat, idx) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #E2E8F0; font-size: 12px;">${idx + 1}</td>
        <td style="padding: 8px; border-bottom: 1px solid #E2E8F0; font-size: 12px; font-weight: 600;">${cat.category}</td>
        <td style="padding: 8px; border-bottom: 1px solid #E2E8F0; font-size: 12px; text-align: center;">${cat.count}</td>
        <td style="padding: 8px; border-bottom: 1px solid #E2E8F0; font-size: 12px; text-align: right; font-weight: 700; color: #10B981;">${formatCurrency(cat.totalAmount)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #E2E8F0; font-size: 12px; text-align: right; color: #64748B;">${cat.percentage.toFixed(1)}%</td>
      </tr>
    `
    )
    .join('');

  const outflowRows = summary.outflowCategories
    .map(
      (cat, idx) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #E2E8F0; font-size: 12px;">${idx + 1}</td>
        <td style="padding: 8px; border-bottom: 1px solid #E2E8F0; font-size: 12px; font-weight: 600;">${cat.category}</td>
        <td style="padding: 8px; border-bottom: 1px solid #E2E8F0; font-size: 12px; text-align: center;">${cat.count}</td>
        <td style="padding: 8px; border-bottom: 1px solid #E2E8F0; font-size: 12px; text-align: right; font-weight: 700; color: #EF4444;">${formatCurrency(cat.totalAmount)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #E2E8F0; font-size: 12px; text-align: right; color: #64748B;">${cat.percentage.toFixed(1)}%</td>
      </tr>
    `
    )
    .join('');

  const ledgerRows = entries
    .slice(0, 150)
    .map((e) => {
      const typeColor = e.type === 'inflow' ? '#10B981' : e.type === 'outflow' ? '#EF4444' : '#6366F1';
      const typeSign = e.type === 'inflow' ? '+' : e.type === 'outflow' ? '-' : '⇄';
      return `
      <tr>
        <td style="padding: 6px 8px; border-bottom: 1px solid #F1F5F9; font-size: 11px; white-space: nowrap;">${formatDate(e.date)}</td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #F1F5F9; font-size: 11px;">
          <span style="font-weight: 600; color: #1E293B;">${e.title}</span>
          ${e.notes ? `<div style="font-size: 10px; color: #64748B;">${e.notes}</div>` : ''}
        </td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #F1F5F9; font-size: 11px; color: #475569;">${e.category}</td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #F1F5F9; font-size: 11px; color: #475569;">${e.accountName || e.paymentMethod}</td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #F1F5F9; font-size: 11px; text-align: right; font-weight: 700; color: ${typeColor};">
          ${typeSign} ${formatCurrency(e.amount)}
        </td>
      </tr>
    `;
    })
    .join('');

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <title>Fund Flow Statement - ${companyName}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0F172A; margin: 0; padding: 24px; font-size: 13px; line-height: 1.4; }
      .header-container { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #E2E8F0; padding-bottom: 16px; margin-bottom: 20px; }
      .title { font-size: 22px; font-weight: 800; color: #0F172A; margin: 0 0 4px 0; }
      .subtitle { font-size: 13px; color: #64748B; margin: 0; }
      .meta-box { text-align: right; }
      .summary-grid { display: flex; gap: 12px; margin-bottom: 24px; }
      .metric-card { flex: 1; border-radius: 10px; padding: 14px; background: #F8FAFC; border: 1px solid #E2E8F0; }
      .metric-label { font-size: 11px; font-weight: 600; text-transform: uppercase; color: #64748B; margin-bottom: 6px; }
      .metric-value { font-size: 18px; font-weight: 800; }
      .section-heading { font-size: 14px; font-weight: 700; text-transform: uppercase; color: #334155; margin: 24px 0 10px 0; letter-spacing: 0.5px; border-bottom: 1px solid #CBD5E1; padding-bottom: 6px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      th { background: #F1F5F9; font-weight: 700; font-size: 11px; text-transform: uppercase; color: #475569; padding: 8px; text-align: left; border-bottom: 2px solid #CBD5E1; }
      .footer { margin-top: 30px; border-top: 1px solid #E2E8F0; padding-top: 12px; text-align: center; font-size: 11px; color: #94A3B8; }
    </style>
  </head>
  <body>
    <div class="header-container">
      <div>
        <h1 class="title">${companyName}</h1>
        <p class="subtitle">FUND FLOW & CASH MOVEMENT STATEMENT</p>
        ${companyPhone ? `<div style="font-size: 11px; color: #64748B; margin-top: 4px;">Phone: ${companyPhone}</div>` : ''}
        ${companyEmail ? `<div style="font-size: 11px; color: #64748B;">Email: ${companyEmail}</div>` : ''}
      </div>
      <div class="meta-box">
        <div style="font-size: 12px; font-weight: 700; color: #2563EB;">${periodLabel}</div>
        <div style="font-size: 11px; color: #64748B; margin-top: 4px;">Generated: ${new Date().toLocaleString('en-IN')}</div>
        <div style="display: inline-block; margin-top: 8px; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; background: ${netColor}15; color: ${netColor};">${netBadge}</div>
      </div>
    </div>

    <!-- Summary Key Metrics -->
    <div class="summary-grid">
      <div class="metric-card" style="border-left: 4px solid #10B981;">
        <div class="metric-label">Total Inflow (Sources)</div>
        <div class="metric-value" style="color: #10B981;">${formatCurrency(summary.totalInflow)}</div>
        <div style="font-size: 10px; color: #64748B; margin-top: 4px;">${summary.inflowCount} Receipts</div>
      </div>
      <div class="metric-card" style="border-left: 4px solid #EF4444;">
        <div class="metric-label">Total Outflow (Applications)</div>
        <div class="metric-value" style="color: #EF4444;">${formatCurrency(summary.totalOutflow)}</div>
        <div style="font-size: 10px; color: #64748B; margin-top: 4px;">${summary.outflowCount} Payments</div>
      </div>
      <div class="metric-card" style="border-left: 4px solid ${netColor};">
        <div class="metric-label">Net Fund Flow</div>
        <div class="metric-value" style="color: ${netColor};">${formatCurrency(summary.netFlow)}</div>
        <div style="font-size: 10px; color: #64748B; margin-top: 4px;">Coverage: ${summary.coverageRatio.toFixed(2)}x</div>
      </div>
      <div class="metric-card" style="border-left: 4px solid #6366F1;">
        <div class="metric-label">Closing Liquid Position</div>
        <div class="metric-value" style="color: #6366F1;">${formatCurrency(summary.closingLiquidFunds)}</div>
        <div style="font-size: 10px; color: #64748B; margin-top: 4px;">Opening: ${formatCurrency(summary.openingLiquidFunds)}</div>
      </div>
    </div>

    <!-- Treasury Accounts Breakdown -->
    <div class="section-heading">Treasury & Liquid Cash Balances</div>
    <div style="display: flex; gap: 10px; margin-bottom: 20px;">
      ${accountCardsHtml}
    </div>

    <!-- Sources & Applications Tables (Side by Side) -->
    <div style="display: flex; gap: 20px;">
      <div style="flex: 1;">
        <div class="section-heading" style="color: #10B981;">Sources of Funds (Inflows)</div>
        <table>
          <thead>
            <tr>
              <th style="width: 30px;">#</th>
              <th>Category</th>
              <th style="text-align: center;">Qty</th>
              <th style="text-align: right;">Amount</th>
              <th style="text-align: right;">Share</th>
            </tr>
          </thead>
          <tbody>
            ${inflowRows || '<tr><td colspan="5" style="text-align:center; padding:10px; color:#94A3B8;">No inflows in this period</td></tr>'}
          </tbody>
        </table>
      </div>

      <div style="flex: 1;">
        <div class="section-heading" style="color: #EF4444;">Applications of Funds (Outflows)</div>
        <table>
          <thead>
            <tr>
              <th style="width: 30px;">#</th>
              <th>Category</th>
              <th style="text-align: center;">Qty</th>
              <th style="text-align: right;">Amount</th>
              <th style="text-align: right;">Share</th>
            </tr>
          </thead>
          <tbody>
            ${outflowRows || '<tr><td colspan="5" style="text-align:center; padding:10px; color:#94A3B8;">No outflows in this period</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Itemized Fund Flow Ledger -->
    <div class="section-heading">Itemized Fund Flow Ledger</div>
    <table>
      <thead>
        <tr>
          <th style="width: 85px;">Date</th>
          <th>Description & Party</th>
          <th>Category</th>
          <th>Account / Mode</th>
          <th style="text-align: right; width: 100px;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${ledgerRows || '<tr><td colspan="5" style="text-align:center; padding:14px; color:#94A3B8;">No transactions found</td></tr>'}
      </tbody>
    </table>

    <div class="footer">
      Generated automatically by Business Suite Treasury & Fund Flow System • Page 1 of 1
    </div>
  </body>
  </html>
  `;
}

/**
 * Export Fund Flow Statement as PDF and open share sheet
 */
export async function exportFundFlowPdf(
  summary: FundFlowSummary,
  entries: UnifiedFundEntry[],
  accounts: FundAccount[],
  periodLabel: string,
  profile: any = {}
): Promise<boolean> {
  try {
    const html = generateFundFlowHtml(summary, entries, accounts, periodLabel, profile);
    const printResult = await Print.printToFileAsync({ html });

    if (await Sharing.isAvailableAsync()) {
      const filename = `Fund_Flow_Statement_${Date.now()}.pdf`;
      const targetUri = `${FileSystem.documentDirectory}${filename}`;
      await FileSystem.copyAsync({ from: printResult.uri, to: targetUri });

      await Sharing.shareAsync(targetUri, {
        UTI: '.pdf',
        mimeType: 'application/pdf',
        dialogTitle: `Share Fund Flow Statement (${periodLabel})`,
      });
      return true;
    } else {
      Alert.alert('PDF Created', `Saved to ${printResult.uri}`);
      return true;
    }
  } catch (error: any) {
    console.error('Error generating PDF fund flow:', error);
    Alert.alert('Export Failed', error?.message || 'Could not generate PDF');
    return false;
  }
}

/**
 * Print Fund Flow Statement directly
 */
export async function printFundFlowReport(
  summary: FundFlowSummary,
  entries: UnifiedFundEntry[],
  accounts: FundAccount[],
  periodLabel: string,
  profile: any = {}
): Promise<boolean> {
  try {
    const html = generateFundFlowHtml(summary, entries, accounts, periodLabel, profile);
    await Print.printAsync({ html });
    return true;
  } catch (error: any) {
    console.error('Error printing fund flow:', error);
    Alert.alert('Print Error', error?.message || 'Could not print statement');
    return false;
  }
}

/**
 * Export Fund Flow Ledger to CSV
 */
export async function exportFundFlowCsv(
  summary: FundFlowSummary,
  entries: UnifiedFundEntry[],
  accounts: FundAccount[],
  periodLabel: string,
  profile: any = {}
): Promise<boolean> {
  try {
    const companyName = profile?.businessName || profile?.fullName || 'Business Enterprise';

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const lines: string[] = [];
    lines.push(`${escapeCsv('FUND FLOW & CASH MOVEMENT STATEMENT')},${escapeCsv(companyName)}`);
    lines.push(`${escapeCsv('Period')},${escapeCsv(periodLabel)}`);
    lines.push(`${escapeCsv('Generated At')},${escapeCsv(new Date().toLocaleString('en-IN'))}`);
    lines.push('');

    // Summary
    lines.push(`${escapeCsv('EXECUTIVE SUMMARY METRICS')}`);
    lines.push(`${escapeCsv('Total Inflow (Sources)')},${summary.totalInflow.toFixed(2)}`);
    lines.push(`${escapeCsv('Total Outflow (Applications)')},${summary.totalOutflow.toFixed(2)}`);
    lines.push(`${escapeCsv('Net Fund Flow')},${summary.netFlow.toFixed(2)}`);
    lines.push(`${escapeCsv('Opening Liquid Funds')},${summary.openingLiquidFunds.toFixed(2)}`);
    lines.push(`${escapeCsv('Closing Liquid Funds')},${summary.closingLiquidFunds.toFixed(2)}`);
    lines.push(`${escapeCsv('Coverage Ratio')},${summary.coverageRatio.toFixed(2)}x`);
    lines.push('');

    // Ledger Table
    lines.push(`${escapeCsv('FUND MOVEMENT LEDGER')}`);
    lines.push([
      escapeCsv('Date'),
      escapeCsv('Time'),
      escapeCsv('Movement Type'),
      escapeCsv('Source / Category'),
      escapeCsv('Description / Party'),
      escapeCsv('Account / Mode'),
      escapeCsv('Reference #'),
      escapeCsv('Inflow (INR)'),
      escapeCsv('Outflow (INR)'),
      escapeCsv('Notes'),
    ].join(','));

    entries.forEach((e) => {
      const inflowAmt = e.type === 'inflow' ? e.amount.toFixed(2) : '0.00';
      const outflowAmt = e.type === 'outflow' ? e.amount.toFixed(2) : '0.00';

      lines.push([
        escapeCsv(formatDate(e.date)),
        escapeCsv(formatTime(e.date)),
        escapeCsv(e.type.toUpperCase()),
        escapeCsv(e.category),
        escapeCsv(e.title),
        escapeCsv(e.accountName || e.paymentMethod),
        escapeCsv(e.referenceNumber || ''),
        inflowAmt,
        outflowAmt,
        escapeCsv(e.notes || ''),
      ].join(','));
    });

    const csvContent = lines.join('\n');
    const filename = `Fund_Flow_${Date.now()}.csv`;
    const targetUri = `${FileSystem.documentDirectory}${filename}`;

    await FileSystem.writeAsStringAsync(targetUri, csvContent, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(targetUri, {
        UTI: 'public.comma-separated-values-text',
        mimeType: 'text/csv',
        dialogTitle: `Share Fund Flow CSV (${periodLabel})`,
      });
      return true;
    } else {
      Alert.alert('CSV Created', `Saved to ${targetUri}`);
      return true;
    }
  } catch (error: any) {
    console.error('Error exporting CSV:', error);
    Alert.alert('CSV Export Failed', error?.message || 'Could not export CSV');
    return false;
  }
}

/**
 * Format executive WhatsApp message
 */
export function formatFundFlowWhatsApp(
  summary: FundFlowSummary,
  periodLabel: string,
  profile: any = {}
): string {
  const companyName = profile?.businessName || profile?.fullName || 'Our Business';
  const statusEmoji = summary.netFlow >= 0 ? '🟢 *NET SURPLUS*' : '🔴 *NET DEFICIT*';

  let text = `💼 *FUND FLOW & CASH STATEMENT - ${companyName.toUpperCase()}*\n`;
  text += `📅 *Period:* ${periodLabel}\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `📥 *Total Inflows (Sources):* ${formatCurrency(summary.totalInflow)} (${summary.inflowCount} receipts)\n`;
  text += `📤 *Total Outflows (Applications):* ${formatCurrency(summary.totalOutflow)} (${summary.outflowCount} payments)\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `${statusEmoji}: ${formatCurrency(summary.netFlow)}\n`;
  text += `📊 *Coverage Ratio:* ${summary.coverageRatio.toFixed(2)}x\n`;
  text += `💰 *Closing Liquid Funds:* ${formatCurrency(summary.closingLiquidFunds)}\n\n`;

  if (summary.inflowCategories.length > 0) {
    text += `*Top Sources of Funds:*\n`;
    summary.inflowCategories.slice(0, 3).forEach((c, i) => {
      text += `  ${i + 1}. ${c.category}: ${formatCurrency(c.totalAmount)} (${c.percentage.toFixed(0)}%)\n`;
    });
    text += `\n`;
  }

  if (summary.outflowCategories.length > 0) {
    text += `*Top Applications of Funds:*\n`;
    summary.outflowCategories.slice(0, 3).forEach((c, i) => {
      text += `  ${i + 1}. ${c.category}: ${formatCurrency(c.totalAmount)} (${c.percentage.toFixed(0)}%)\n`;
    });
  }

  return text;
}

