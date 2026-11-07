export type FundAccountType = 'cash' | 'bank' | 'upi' | 'other';

export interface FundAccount {
  id: string;
  name: string;
  type: FundAccountType;
  openingBalance: number;
  accountNumber?: string;
  bankName?: string;
  upiId?: string;
  isDefault?: boolean;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type FundMovementType = 'inflow' | 'outflow' | 'transfer';

export type InflowCategory =
  | 'Customer Payment'
  | 'Capital Addition'
  | 'Partner Investment'
  | 'Loan Received'
  | 'Tax Refund'
  | 'Customer Advance'
  | 'Interest Income'
  | 'Miscellaneous Inflow';

export type OutflowCategory =
  | 'Raw Material Purchase'
  | 'Worker Wages'
  | 'Worker Bonuses & Incentives'
  | 'Delivery & Freight'
  | 'Delivery Partner Bonuses'
  | 'Customer Commissions & Rebates'
  | 'Operating Expense'
  | 'Owner Drawings'
  | 'Personal Withdrawal'
  | 'Loan Repayment'
  | 'Tax / GST Payment'
  | 'Asset Purchase'
  | 'Bank Charges'
  | 'Miscellaneous Outflow';

export type TransferCategory =
  | 'Cash Deposit to Bank'
  | 'Bank Withdrawal to Cash'
  | 'Bank to Bank Transfer'
  | 'Wallet Topup'
  | 'Internal Contra Transfer';

export interface FundTransaction {
  id: string;
  type: FundMovementType;
  category: string;
  amount: number;
  date: Date;
  fromAccountId?: string;
  fromAccountName?: string;
  toAccountId?: string;
  toAccountName?: string;
  paymentMethod: string;
  referenceNumber?: string;
  notes?: string;
  createdAt?: Date;
  createdBy?: string;
}

export type UnifiedSourceType =
  | 'customer_payment'
  | 'manual_inflow'
  | 'operating_expense'
  | 'supplier_payout'
  | 'worker_wage'
  | 'worker_bonus'
  | 'delivery_fee'
  | 'delivery_bonus'
  | 'customer_bonus'
  | 'manual_outflow'
  | 'contra_transfer';

export interface UnifiedFundEntry {
  id: string;
  rawId: string;
  type: FundMovementType;
  sourceType: UnifiedSourceType;
  sourceLabel: string;
  title: string;
  category: string;
  amount: number;
  paymentMethod: string;
  date: Date;
  accountId?: string;
  accountName?: string;
  toAccountId?: string;
  toAccountName?: string;
  referenceNumber?: string;
  partyName?: string; // customer, supplier, worker, delivery partner
  notes?: string;
  isManual?: boolean;
  runningBalance?: number;
}

export interface DailyCashFlowPoint {
  date: Date;
  dateLabel: string;
  inflow: number;
  outflow: number;
  net: number;
}

export interface DateGroupedEntries {
  dateKey: string;
  dateLabel: string;
  date: Date;
  totalInflow: number;
  totalOutflow: number;
  entries: UnifiedFundEntry[];
}

export type ReportPeriod =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'this_year'
  | 'all_time'
  | 'custom';

export interface FundFlowFilter {
  period: ReportPeriod;
  customStartDate?: Date | null;
  customEndDate?: Date | null;
  typeFilter: 'all' | 'inflow' | 'outflow' | 'transfer';
  accountId: string; // 'all' or specific account id
  searchQuery: string;
  categoryFilter?: string;
}

export interface FundCategoryBreakdown {
  category: string;
  totalAmount: number;
  count: number;
  percentage: number;
  color?: string;
}

export interface FundFlowSummary {
  totalInflow: number;
  totalOutflow: number;
  netFlow: number;
  transferVolume: number;
  openingLiquidFunds: number;
  closingLiquidFunds: number;
  coverageRatio: number;
  inflowCount: number;
  outflowCount: number;
  transferCount: number;
  inflowCategories: FundCategoryBreakdown[];
  outflowCategories: FundCategoryBreakdown[];
}

