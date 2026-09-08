import { Share, Alert, Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';

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

export interface SalesReportFilter {
  period: ReportPeriod;
  customStartDate?: Date | null;
  customEndDate?: Date | null;
  searchQuery?: string;
  statusFilter?: 'all' | 'completed' | 'pending' | 'partial' | 'cancelled';
  customerId?: string;
  itemId?: string;
}

export interface SalesMetrics {
  totalSales: number;
  grossRevenue: number;
  netRevenue: number;
  totalOrders: number;
  totalUnits: number;
  collectedAmount: number;
  pendingBalance: number;
  avgOrderValue: number;
  totalDiscounts: number;
  totalFreight: number;
  totalTaxes: number;
  totalLoading: number;
  totalExtraCharges: number;
  completedOrdersCount: number;
  partialOrdersCount: number;
  pendingOrdersCount: number;
  cancelledOrdersCount: number;
  collectionRate: number; // percentage collected
  priorPeriodSales: number;
  growthPercent: number; // percentage change vs prior matching period
}

export interface CustomerSalesSummary {
  customerId: string;
  customerName: string;
  phone: string;
  ordersCount: number;
  totalSales: number;
  totalPaid: number;
  balanceDue: number;
  totalUnits: number;
  lastOrderDate: Date | null;
  sharePercent: number;
}

export interface ItemSalesSummary {
  itemId: string;
  itemName: string;
  itemType: string;
  totalUnits: number;
  totalRevenue: number;
  unitPriceAvg: number;
  ordersCount: number;
  sharePercent: number;
}

export interface DeliveryPartnerSalesSummary {
  partnerId: string;
  partnerName: string;
  ordersCount: number;
  freightTotal: number;
}

export interface PaymentStatusSummary {
  status: string;
  label: string;
  count: number;
  amount: number;
  percent: number;
  color: string;
}

export interface DailyTrendPoint {
  key?: string;
  label?: string;
  subLabel?: string;
  dateKey: string;
  dateLabel: string;
  salesAmount: number;
  ordersCount: number;
  collectedAmount: number;
  unitsCount?: number;
}

export interface TrendPoint {
  key: string;
  label: string;
  subLabel?: string;
  dateKey?: string;
  dateLabel?: string;
  salesAmount: number;
  ordersCount: number;
  collectedAmount: number;
  unitsCount?: number;
}

export interface SalesReportData {
  filter: SalesReportFilter;
  startDate: Date;
  endDate: Date;
  formattedDateRange: string;
  metrics: SalesMetrics;
  customerSummaries: CustomerSalesSummary[];
  itemSummaries: ItemSalesSummary[];
  deliverySummaries: DeliveryPartnerSalesSummary[];
  paymentStatusSummaries: PaymentStatusSummary[];
  dailyTrends: TrendPoint[];
  monthlyTrends: TrendPoint[];
  quarterlyTrends: TrendPoint[];
  yearlyTrends: TrendPoint[];
  filteredOrders: any[];
}

export interface SalesReportConfig {
  monthlyTarget: number;
  includeTaxInReports: boolean;
  includeFreightInReports: boolean;
  includeDiscountsInReports: boolean;
  defaultPeriod: ReportPeriod;
  customFooterNote: string;
  companyGstNo?: string;
  companyPanNo?: string;
}

export const DEFAULT_SALES_REPORT_CONFIG: SalesReportConfig = {
  monthlyTarget: 500000,
  includeTaxInReports: true,
  includeFreightInReports: true,
  includeDiscountsInReports: true,
  defaultPeriod: 'this_month',
  customFooterNote: 'Thank you for your business. For any discrepancies, please contact management within 7 days.',
};

const STORAGE_KEY_CONFIG = '@sales_report_config_v1';

export function formatCurrency(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) return '₹0.00';
  return `₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatCurrencyCompact(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) return '₹0';
  if (Math.abs(amount) >= 10000000) {
    return `₹${(amount / 10000000).toFixed(2)} Cr`;
  }
  if (Math.abs(amount) >= 100000) {
    return `₹${(amount / 100000).toFixed(2)} L`;
  }
  if (Math.abs(amount) >= 1000) {
    return `₹${(amount / 1000).toFixed(1)}k`;
  }
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

export function formatDate(dateInput: Date | string | number | undefined | null): string {
  if (!dateInput) return '-';
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateShort(dateInput: Date | string | number | undefined | null): string {
  if (!dateInput) return '-';
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

/**
 * Calculates start and end Date objects for a given period.
 */
export function getDateRangeForPeriod(
  period: ReportPeriod,
  customStart?: Date | null,
  customEnd?: Date | null
): { startDate: Date; endDate: Date; priorStartDate: Date; priorEndDate: Date } {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  let startDate: Date;
  let endDate: Date;
  let priorStartDate: Date;
  let priorEndDate: Date;

  switch (period) {
    case 'today': {
      startDate = new Date(todayStart);
      endDate = new Date(todayEnd);
      priorStartDate = new Date(todayStart);
      priorStartDate.setDate(priorStartDate.getDate() - 1);
      priorEndDate = new Date(todayEnd);
      priorEndDate.setDate(priorEndDate.getDate() - 1);
      break;
    }
    case 'yesterday': {
      startDate = new Date(todayStart);
      startDate.setDate(startDate.getDate() - 1);
      endDate = new Date(todayEnd);
      endDate.setDate(endDate.getDate() - 1);
      priorStartDate = new Date(startDate);
      priorStartDate.setDate(priorStartDate.getDate() - 1);
      priorEndDate = new Date(endDate);
      priorEndDate.setDate(priorEndDate.getDate() - 1);
      break;
    }
    case 'this_week': {
      const dayOfWeek = now.getDay();
      const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      startDate = new Date(todayStart);
      startDate.setDate(startDate.getDate() - diffToMonday);
      endDate = new Date(todayEnd);
      priorStartDate = new Date(startDate.getTime() - 7 * 86400000);
      priorEndDate = new Date(endDate.getTime() - 7 * 86400000);
      break;
    }
    case 'last_week': {
      const dayOfWeek = now.getDay();
      const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const lastMonday = new Date(todayStart);
      lastMonday.setDate(lastMonday.getDate() - diffToMonday - 7);
      const lastSunday = new Date(todayEnd);
      lastSunday.setDate(lastSunday.getDate() - diffToMonday - 1);
      startDate = lastMonday;
      endDate = lastSunday;
      priorStartDate = new Date(startDate.getTime() - 7 * 86400000);
      priorEndDate = new Date(endDate.getTime() - 7 * 86400000);
      break;
    }
    case 'this_month': {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      endDate = new Date(todayEnd);
      priorStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const priorLastDay = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
      const targetDay = Math.min(now.getDate(), priorLastDay);
      priorEndDate = new Date(now.getFullYear(), now.getMonth() - 1, targetDay, 23, 59, 59, 999);
      break;
    }
    case 'last_month': {
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      priorStartDate = new Date(now.getFullYear(), now.getMonth() - 2, 1, 0, 0, 0, 0);
      priorEndDate = new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59, 999);
      break;
    }
    case 'this_quarter': {
      const currentQuarter = Math.floor(now.getMonth() / 3);
      startDate = new Date(now.getFullYear(), currentQuarter * 3, 1, 0, 0, 0, 0);
      endDate = new Date(todayEnd);
      priorStartDate = new Date(now.getFullYear(), (currentQuarter - 1) * 3, 1, 0, 0, 0, 0);
      priorEndDate = new Date(now.getFullYear(), currentQuarter * 3, 0, 23, 59, 59, 999);
      break;
    }
    case 'this_year': {
      startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      endDate = new Date(todayEnd);
      priorStartDate = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0);
      priorEndDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate(), 23, 59, 59, 999);
      break;
    }
    case 'all_time': {
      startDate = new Date(2020, 0, 1, 0, 0, 0, 0);
      endDate = new Date(todayEnd);
      priorStartDate = new Date(2020, 0, 1, 0, 0, 0, 0);
      priorEndDate = new Date(todayEnd);
      break;
    }
    case 'custom':
    default: {
      startDate = customStart ? new Date(customStart) : new Date(todayStart);
      startDate.setHours(0, 0, 0, 0);
      endDate = customEnd ? new Date(customEnd) : new Date(todayEnd);
      endDate.setHours(23, 59, 59, 999);
      const span = endDate.getTime() - startDate.getTime();
      priorStartDate = new Date(startDate.getTime() - span);
      priorEndDate = new Date(startDate.getTime() - 1);
      break;
    }
  }

  return { startDate, endDate, priorStartDate, priorEndDate };
}

/**
 * Computes complete Sales Report Data from raw collections
 */
export function computeSalesReportData(
  orders: any[],
  customers: any[],
  items: any[],
  partners: any[],
  filter: SalesReportFilter
): SalesReportData {
  const { startDate, endDate, priorStartDate, priorEndDate } = getDateRangeForPeriod(
    filter.period,
    filter.customStartDate,
    filter.customEndDate
  );

  const startMs = startDate.getTime();
  const endMs = endDate.getTime();
  const priorStartMs = priorStartDate.getTime();
  const priorEndMs = priorEndDate.getTime();

  const getOrderDate = (order: any): Date => {
    let rawDate = order.orderedDate || order.createdAt || order.date;
    if (!rawDate) return new Date();
    if (rawDate instanceof Date) return rawDate;
    if (typeof rawDate?.toDate === 'function') return rawDate.toDate();
    const parsed = new Date(rawDate);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  };

  const getOrderPaymentStatus = (o: any): string => {
    const total = Number(o.total || o.totalAmount || 0);
    const paid = Number(o.paidAmount || o.paid || 0);
    const status = (o.status || '').toLowerCase();

    if (status === 'cancelled') return 'cancelled';
    if (paid >= total && total > 0) return 'completed';
    if (paid > 0 && paid < total) return 'partial';
    if (paid === 0) return 'pending';
    return 'pending';
  };

  // Calculate prior period sales for growth comparison
  let priorPeriodSales = 0;
  orders.forEach((o) => {
    const d = getOrderDate(o).getTime();
    if (d >= priorStartMs && d <= priorEndMs && (o.status || '').toLowerCase() !== 'cancelled') {
      priorPeriodSales += Number(o.total || o.totalAmount || 0);
    }
  });

  // Filter current period orders
  const periodOrders: any[] = [];
  orders.forEach((o) => {
    const d = getOrderDate(o).getTime();
    if (d >= startMs && d <= endMs) {
      periodOrders.push({
        ...o,
        _orderDate: getOrderDate(o),
        _computedStatus: getOrderPaymentStatus(o),
      });
    }
  });

  // Search & Status filters
  const searchLower = (filter.searchQuery || '').trim().toLowerCase();
  const filteredOrders = periodOrders.filter((o) => {
    if (filter.statusFilter && filter.statusFilter !== 'all') {
      if (filter.statusFilter === 'completed' && o._computedStatus !== 'completed') return false;
      if (filter.statusFilter === 'partial' && o._computedStatus !== 'partial') return false;
      if (filter.statusFilter === 'pending' && o._computedStatus !== 'pending') return false;
      if (filter.statusFilter === 'cancelled' && (o.status || '').toLowerCase() !== 'cancelled') return false;
    }

    if (filter.customerId && o.customerId !== filter.customerId) {
      return false;
    }

    if (filter.itemId) {
      const orderItems = Array.isArray(o.items) ? o.items : [];
      const hasItem = orderItems.some((i: any) => i.id === filter.itemId || i.itemId === filter.itemId);
      if (!hasItem) return false;
    }

    if (searchLower) {
      const custName = (o.customerName || o.customer?.name || '').toLowerCase();
      const orderNo = (o.invoiceNumber || o.orderNumber || o.id || '').toLowerCase();
      const phone = (o.customerPhone || o.customer?.phone || '').toLowerCase();
      const hasItemMatch = Array.isArray(o.items) && o.items.some((itm: any) => (itm.name || itm.itemName || '').toLowerCase().includes(searchLower));

      if (!custName.includes(searchLower) && !orderNo.includes(searchLower) && !phone.includes(searchLower) && !hasItemMatch) {
        return false;
      }
    }

    return true;
  });

  let totalSales = 0;
  let collectedAmount = 0;
  let pendingBalance = 0;
  let totalUnits = 0;
  let totalDiscounts = 0;
  let totalFreight = 0;
  let totalTaxes = 0;
  let totalLoading = 0;
  let totalExtraCharges = 0;
  let completedOrdersCount = 0;
  let partialOrdersCount = 0;
  let pendingOrdersCount = 0;
  let cancelledOrdersCount = 0;
  let completedSalesAmount = 0;
  let partialSalesAmount = 0;
  let partialPaidAmount = 0;
  let partialDueAmount = 0;
  let pendingSalesAmount = 0;
  let cancelledSalesAmount = 0;

  const customerMap: { [key: string]: CustomerSalesSummary } = {};
  const itemMap: { [key: string]: ItemSalesSummary } = {};
  const deliveryMap: { [key: string]: DeliveryPartnerSalesSummary } = {};
  const dailyMap: { [key: string]: TrendPoint } = {};
  const monthlyMap: { [key: string]: TrendPoint } = {};
  const quarterlyMap: { [key: string]: TrendPoint } = {};
  const yearlyMap: { [key: string]: TrendPoint } = {};

  filteredOrders.forEach((o) => {
    const isCancelled = (o.status || '').toLowerCase() === 'cancelled';
    const total = Number(o.total || o.totalAmount || 0);
    const paid = Number(o.paidAmount || o.paid || 0);
    const due = Math.max(0, total - paid);
    const discount = Number(o.discount || o.discountAmount || 0);
    const freight = Number(o.shipmentCharge || o.freightCharge || o.deliveryCharge || 0);
    const tax = Number(o.taxAmount || o.gstAmount || o.tax || 0);
    const loading = Number(o.loadingCharge || 0);
    const extra = Number(o.extraAmount || 0);

    if (isCancelled) {
      cancelledOrdersCount++;
      cancelledSalesAmount += total;
      return;
    }

    totalSales += total;
    collectedAmount += paid;
    pendingBalance += due;
    totalDiscounts += discount;
    totalFreight += freight;
    totalTaxes += tax;
    totalLoading += loading;
    totalExtraCharges += extra;

    if (o._computedStatus === 'completed') {
      completedOrdersCount++;
      completedSalesAmount += total;
    } else if (o._computedStatus === 'partial') {
      partialOrdersCount++;
      partialSalesAmount += total;
      partialPaidAmount += paid;
      partialDueAmount += due;
    } else {
      pendingOrdersCount++;
      pendingSalesAmount += total;
    }

    let orderUnits = 0;
    const orderItems = Array.isArray(o.items) && o.items.length > 0 ? o.items : [];
    if (orderItems.length > 0) {
      orderItems.forEach((itm: any) => {
        const qty = Number(itm.quantity || itm.qty || 0);
        const unitPrice = Number(itm.unitPrice || itm.price || 0);
        const itemTotal = Number(itm.totalPrice || itm.total || qty * unitPrice);
        const itmId = itm.id || itm.itemId || itm.name || 'unknown_item';
        const itmName = itm.name || itm.itemName || 'Product Item';
        const itmType = itm.itemType || 'product';

        orderUnits += qty;
        totalUnits += qty;

        if (!itemMap[itmId]) {
          itemMap[itmId] = {
            itemId: itmId,
            itemName: itmName,
            itemType: itmType,
            totalUnits: 0,
            totalRevenue: 0,
            unitPriceAvg: unitPrice,
            ordersCount: 0,
            sharePercent: 0,
          };
        }
        itemMap[itmId].totalUnits += qty;
        itemMap[itmId].totalRevenue += itemTotal;
        itemMap[itmId].ordersCount += 1;
      });
    } else {
      const q = Number(o.quantity || 1);
      orderUnits += q;
      totalUnits += q;
    }

    const cId = o.customerId || o.customer?.id || o.customerName || 'unnamed_customer';
    const cName = o.customerName || o.customer?.name || 'Customer';
    const cPhone = (Array.isArray(o.customerPhoneNumbers) && o.customerPhoneNumbers.length > 0)
      ? o.customerPhoneNumbers.join(', ')
      : (o.customerPhone || o.customer?.phone || (Array.isArray(o.customer?.phoneNumbers) ? o.customer?.phoneNumbers.join(', ') : ''));

    if (!customerMap[cId]) {
      customerMap[cId] = {
        customerId: cId,
        customerName: cName,
        phone: cPhone,
        ordersCount: 0,
        totalSales: 0,
        totalPaid: 0,
        balanceDue: 0,
        totalUnits: 0,
        lastOrderDate: o._orderDate,
        sharePercent: 0,
      };
    }
    customerMap[cId].ordersCount += 1;
    customerMap[cId].totalSales += total;
    customerMap[cId].totalPaid += paid;
    customerMap[cId].balanceDue += due;
    customerMap[cId].totalUnits += orderUnits;
    if (!customerMap[cId].lastOrderDate || o._orderDate > customerMap[cId].lastOrderDate!) {
      customerMap[cId].lastOrderDate = o._orderDate;
    }

    if (o.deliveryPartnerId || o.deliveryPartnerName) {
      const dpId = o.deliveryPartnerId || 'dp_' + o.deliveryPartnerName;
      const dpName = o.deliveryPartnerName || 'Delivery Partner';
      if (!deliveryMap[dpId]) {
        deliveryMap[dpId] = {
          partnerId: dpId,
          partnerName: dpName,
          ordersCount: 0,
          freightTotal: 0,
        };
      }
      deliveryMap[dpId].ordersCount += 1;
      deliveryMap[dpId].freightTotal += freight;
    }

    // Date calculations for Granular Trends
    const d = o._orderDate;
    const year = d.getFullYear();
    const month = d.getMonth(); // 0-11
    const day = d.getDate();
    const quarter = Math.floor(month / 3) + 1; // 1-4

    // 1. Day Trend
    const dKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dLabel = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    if (!dailyMap[dKey]) {
      dailyMap[dKey] = {
        key: dKey,
        label: dLabel,
        subLabel: `${day} ${d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`,
        dateKey: dKey,
        dateLabel: dLabel,
        salesAmount: 0,
        ordersCount: 0,
        collectedAmount: 0,
        unitsCount: 0,
      };
    }
    dailyMap[dKey].salesAmount += total;
    dailyMap[dKey].ordersCount += 1;
    dailyMap[dKey].collectedAmount += paid;
    dailyMap[dKey].unitsCount = (dailyMap[dKey].unitsCount || 0) + orderUnits;

    // 2. Month Trend
    const mKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    const mLabel = d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    if (!monthlyMap[mKey]) {
      monthlyMap[mKey] = {
        key: mKey,
        label: mLabel,
        subLabel: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
        dateKey: mKey,
        dateLabel: mLabel,
        salesAmount: 0,
        ordersCount: 0,
        collectedAmount: 0,
        unitsCount: 0,
      };
    }
    monthlyMap[mKey].salesAmount += total;
    monthlyMap[mKey].ordersCount += 1;
    monthlyMap[mKey].collectedAmount += paid;
    monthlyMap[mKey].unitsCount = (monthlyMap[mKey].unitsCount || 0) + orderUnits;

    // 3. Quarter Trend
    const qKey = `${year}-Q${quarter}`;
    const quarterRange = quarter === 1 ? 'Jan–Mar' : quarter === 2 ? 'Apr–Jun' : quarter === 3 ? 'Jul–Sep' : 'Oct–Dec';
    const qLabel = `Q${quarter} ${year} (${quarterRange})`;
    if (!quarterlyMap[qKey]) {
      quarterlyMap[qKey] = {
        key: qKey,
        label: qLabel,
        subLabel: `Quarter ${quarter} • ${year}`,
        dateKey: qKey,
        dateLabel: qLabel,
        salesAmount: 0,
        ordersCount: 0,
        collectedAmount: 0,
        unitsCount: 0,
      };
    }
    quarterlyMap[qKey].salesAmount += total;
    quarterlyMap[qKey].ordersCount += 1;
    quarterlyMap[qKey].collectedAmount += paid;
    quarterlyMap[qKey].unitsCount = (quarterlyMap[qKey].unitsCount || 0) + orderUnits;

    // 4. Year Trend
    const yKey = `${year}`;
    const yLabel = `Year ${year}`;
    if (!yearlyMap[yKey]) {
      yearlyMap[yKey] = {
        key: yKey,
        label: yLabel,
        subLabel: `Fiscal/Calendar ${year}`,
        dateKey: yKey,
        dateLabel: yLabel,
        salesAmount: 0,
        ordersCount: 0,
        collectedAmount: 0,
        unitsCount: 0,
      };
    }
    yearlyMap[yKey].salesAmount += total;
    yearlyMap[yKey].ordersCount += 1;
    yearlyMap[yKey].collectedAmount += paid;
    yearlyMap[yKey].unitsCount = (yearlyMap[yKey].unitsCount || 0) + orderUnits;
  });

  const validOrdersCount = filteredOrders.length - cancelledOrdersCount;
  const avgOrderValue = validOrdersCount > 0 ? totalSales / validOrdersCount : 0;
  const collectionRate = totalSales > 0 ? (collectedAmount / totalSales) * 100 : 0;
  const growthPercent =
    priorPeriodSales > 0 ? ((totalSales - priorPeriodSales) / priorPeriodSales) * 100 : totalSales > 0 ? 100 : 0;

  const customerSummaries = Object.values(customerMap)
    .map((c) => ({
      ...c,
      sharePercent: totalSales > 0 ? (c.totalSales / totalSales) * 100 : 0,
    }))
    .sort((a, b) => b.totalSales - a.totalSales);

  const itemSummaries = Object.values(itemMap)
    .map((i) => ({
      ...i,
      unitPriceAvg: i.totalUnits > 0 ? i.totalRevenue / i.totalUnits : i.unitPriceAvg,
      sharePercent: totalSales > 0 ? (i.totalRevenue / totalSales) * 100 : 0,
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue);

  const deliverySummaries = Object.values(deliveryMap).sort((a, b) => b.ordersCount - a.ordersCount);

  const dailyTrends = Object.values(dailyMap).sort((a, b) => a.key.localeCompare(b.key));
  const monthlyTrends = Object.values(monthlyMap).sort((a, b) => a.key.localeCompare(b.key));
  const quarterlyTrends = Object.values(quarterlyMap).sort((a, b) => a.key.localeCompare(b.key));
  const yearlyTrends = Object.values(yearlyMap).sort((a, b) => a.key.localeCompare(b.key));

  const paymentStatusSummaries: PaymentStatusSummary[] = [
    {
      status: 'completed',
      label: 'Fully Paid',
      count: completedOrdersCount,
      amount: completedSalesAmount,
      percent: validOrdersCount > 0 ? (completedOrdersCount / validOrdersCount) * 100 : 0,
      color: '#10B981',
    },
    {
      status: 'partial',
      label: 'Partially Paid',
      count: partialOrdersCount,
      amount: partialSalesAmount,
      percent: validOrdersCount > 0 ? (partialOrdersCount / validOrdersCount) * 100 : 0,
      color: '#F59E0B',
    },
    {
      status: 'pending',
      label: 'Unpaid / Overdue',
      count: pendingOrdersCount,
      amount: pendingSalesAmount,
      percent: validOrdersCount > 0 ? (pendingOrdersCount / validOrdersCount) * 100 : 0,
      color: '#EF4444',
    },
    {
      status: 'cancelled',
      label: 'Cancelled',
      count: cancelledOrdersCount,
      amount: cancelledSalesAmount,
      percent: filteredOrders.length > 0 ? (cancelledOrdersCount / filteredOrders.length) * 100 : 0,
      color: '#64748B',
    },
  ];

  const formattedDateRange =
    filter.period === 'today'
      ? `Today (${formatDate(startDate)})`
      : filter.period === 'yesterday'
      ? `Yesterday (${formatDate(startDate)})`
      : `${formatDate(startDate)} – ${formatDate(endDate)}`;

  return {
    filter,
    startDate,
    endDate,
    formattedDateRange,
    metrics: {
      totalSales,
      grossRevenue: totalSales,
      netRevenue: totalSales - totalDiscounts,
      totalOrders: validOrdersCount,
      totalUnits,
      collectedAmount,
      pendingBalance,
      avgOrderValue,
      totalDiscounts,
      totalFreight,
      totalTaxes,
      totalLoading,
      totalExtraCharges,
      completedOrdersCount,
      partialOrdersCount,
      pendingOrdersCount,
      cancelledOrdersCount,
      collectionRate,
      priorPeriodSales,
      growthPercent,
    },
    customerSummaries,
    itemSummaries,
    deliverySummaries,
    paymentStatusSummaries,
    dailyTrends,
    monthlyTrends,
    quarterlyTrends,
    yearlyTrends,
    filteredOrders: filteredOrders.sort((a, b) => b._orderDate.getTime() - a._orderDate.getTime()),
  };
}

/**
 * Generates an executive-level HTML sales report suitable for PDF conversion or WebView preview.
 */
export function generateSalesReportHtml(
  reportData: SalesReportData,
  company: any = {},
  config: SalesReportConfig = DEFAULT_SALES_REPORT_CONFIG
): string {
  const { metrics, customerSummaries, itemSummaries, deliverySummaries, paymentStatusSummaries, filteredOrders } =
    reportData;

  const companyName = company.name || company.businessName || 'Business Suite Enterprise';
  const companyPhone = company.phone || '';
  const companyEmail = company.email || '';
  const companyAddress = company.address || '';
  const companyGst = config.companyGstNo || company.gstNo || '';

  const topCustomers = customerSummaries.slice(0, 8);
  const topItems = itemSummaries.slice(0, 8);

  const customerRowsHtml =
    topCustomers.length > 0
      ? topCustomers
          .map(
            (c, idx) => `
      <tr>
        <td style="text-align:center; color:#64748B; font-weight:600;">${idx + 1}</td>
        <td>
          <div style="font-weight:700; color:#0F172A;">${c.customerName}</div>
          <div style="font-size:11px; color:#64748B;">${c.phone || 'No phone'}</div>
        </td>
        <td style="text-align:center; font-weight:600;">${c.ordersCount}</td>
        <td style="text-align:center; font-weight:600;">${c.totalUnits}</td>
        <td style="text-align:right; font-weight:700; color:#0F172A;">${formatCurrency(c.totalSales)}</td>
        <td style="text-align:right; font-weight:600; color:#10B981;">${formatCurrency(c.totalPaid)}</td>
        <td style="text-align:right; font-weight:700; color:${c.balanceDue > 0 ? '#EF4444' : '#10B981'};">
          ${c.balanceDue > 0 ? formatCurrency(c.balanceDue) : 'Settled'}
        </td>
        <td style="text-align:right; font-weight:600; color:#64748B;">${c.sharePercent.toFixed(1)}%</td>
      </tr>
    `
          )
          .join('')
      : `<tr><td colspan="8" style="text-align:center; padding:16px; color:#64748B;">No customer data available</td></tr>`;

  const itemRowsHtml =
    topItems.length > 0
      ? topItems
          .map(
            (item, idx) => `
      <tr>
        <td style="text-align:center; color:#64748B; font-weight:600;">${idx + 1}</td>
        <td style="font-weight:700; color:#0F172A;">${item.itemName}</td>
        <td style="text-align:center; font-weight:700; color:#2563EB;">${item.totalUnits}</td>
        <td style="text-align:right; font-weight:600;">${formatCurrency(item.unitPriceAvg)}</td>
        <td style="text-align:right; font-weight:700; color:#0F172A;">${formatCurrency(item.totalRevenue)}</td>
        <td style="text-align:right; font-weight:600; color:#64748B;">${item.sharePercent.toFixed(1)}%</td>
      </tr>
    `
          )
          .join('')
      : `<tr><td colspan="6" style="text-align:center; padding:16px; color:#64748B;">No product sales available</td></tr>`;

  const orderRowsHtml = filteredOrders
    .slice(0, 30)
    .map(
      (o, idx) => `
      <tr>
        <td style="text-align:center; font-weight:600; color:#64748B;">${idx + 1}</td>
        <td style="font-weight:700; color:#2563EB;">#${o.invoiceNumber || o.orderNumber || o.id.substring(0, 6).toUpperCase()}</td>
        <td style="color:#475569; font-size:11px;">${formatDate(o._orderDate)}</td>
        <td style="font-weight:600; color:#0F172A;">${o.customerName || 'Customer'}</td>
        <td style="text-align:right; font-weight:700; color:#0F172A;">${formatCurrency(o.total || o.totalAmount)}</td>
        <td style="text-align:right; font-weight:600; color:#10B981;">${formatCurrency(o.paidAmount || o.paid || 0)}</td>
        <td style="text-align:right; font-weight:600; color:#EF4444;">${formatCurrency(Math.max(0, (o.total || 0) - (o.paidAmount || 0)))}</td>
        <td style="text-align:center;">
          <span style="display:inline-block; padding:3px 8px; border-radius:12px; font-size:10px; font-weight:700; text-transform:uppercase;
            background:${o._computedStatus === 'completed' ? '#DCFCE7' : o._computedStatus === 'partial' ? '#FEF3C7' : '#FEE2E2'};
            color:${o._computedStatus === 'completed' ? '#166534' : o._computedStatus === 'partial' ? '#92400E' : '#991B1B'};">
            ${o._computedStatus}
          </span>
        </td>
      </tr>
    `
    )
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Sales Report - ${companyName}</title>
  <style>
    @page { margin: 15mm; size: A4 portrait; }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    body { background: #FFFFFF; color: #0F172A; font-size: 12px; line-height: 1.5; padding: 20px; }
    
    .header-card { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 16px; border-bottom: 2px solid #E2E8F0; margin-bottom: 20px; }
    .company-name { font-size: 22px; font-weight: 800; color: #1E3A8A; letter-spacing: -0.5px; }
    .company-sub { color: #64748B; font-size: 11px; margin-top: 2px; }
    .report-badge { background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 8px; padding: 8px 14px; text-align: right; }
    .report-title { font-size: 16px; font-weight: 800; color: #1D4ED8; text-transform: uppercase; letter-spacing: 0.5px; }
    .report-date { font-size: 11px; font-weight: 600; color: #475569; margin-top: 2px; }
    
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
    .kpi-card { background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px; }
    .kpi-card.highlight { background: #EFF6FF; border-color: #BFDBFE; }
    .kpi-card.success { background: #F0FDF4; border-color: #BBF7D0; }
    .kpi-card.warning { background: #FEF2F2; border-color: #FECACA; }
    .kpi-label { font-size: 10px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
    .kpi-value { font-size: 18px; font-weight: 800; color: #0F172A; }
    .kpi-sub { font-size: 10px; font-weight: 600; margin-top: 4px; }
    
    .section-title { font-size: 14px; font-weight: 800; color: #1E293B; margin: 20px 0 10px 0; display: flex; align-items: center; justify-content: space-between; border-bottom: 1.5px solid #F1F5F9; padding-bottom: 6px; }
    
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 11px; }
    th { background: #F1F5F9; color: #334155; font-weight: 700; text-transform: uppercase; font-size: 10px; padding: 8px 10px; border: 1px solid #E2E8F0; text-align: left; }
    td { padding: 8px 10px; border: 1px solid #E2E8F0; color: #334155; vertical-align: middle; }
    tr:nth-child(even) td { background: #F8FAFC; }
    
    .status-badge { display: inline-block; padding: 3px 8px; border-radius: 12px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
    
    .footer { margin-top: 30px; border-top: 1px solid #E2E8F0; padding-top: 14px; display: flex; justify-content: space-between; align-items: flex-end; color: #64748B; font-size: 10px; }
    .sign-box { text-align: center; width: 180px; }
    .sign-line { border-top: 1px solid #94A3B8; margin-top: 40px; padding-top: 4px; font-weight: 700; color: #334155; }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="header-card">
    <div>
      <div class="company-name">${companyName}</div>
      ${companyAddress ? `<div class="company-sub">📍 ${companyAddress}</div>` : ''}
      ${companyPhone ? `<div class="company-sub">📞 ${companyPhone} | ✉️ ${companyEmail}</div>` : ''}
      ${companyGst ? `<div class="company-sub"><strong>GSTIN:</strong> ${companyGst}</div>` : ''}
    </div>
    <div class="report-badge">
      <div class="report-title">Sales Analytics Report</div>
      <div class="report-date">Period: ${reportData.formattedDateRange}</div>
      <div class="report-date">Generated: ${formatDate(new Date())}</div>
    </div>
  </div>

  <!-- KPI Cards -->
  <div class="kpi-grid">
    <div class="kpi-card highlight">
      <div class="kpi-label">Gross Revenue</div>
      <div class="kpi-value" style="color:#1D4ED8;">${formatCurrency(metrics.totalSales)}</div>
      <div class="kpi-sub" style="color:${metrics.growthPercent >= 0 ? '#15803D' : '#B91C1C'};">
        ${metrics.growthPercent >= 0 ? '▲' : '▼'} ${Math.abs(metrics.growthPercent).toFixed(1)}% vs prior
      </div>
    </div>
    <div class="kpi-card success">
      <div class="kpi-label">Collected Amount</div>
      <div class="kpi-value" style="color:#15803D;">${formatCurrency(metrics.collectedAmount)}</div>
      <div class="kpi-sub" style="color:#15803D;">${metrics.collectionRate.toFixed(1)}% collection rate</div>
    </div>
    <div class="kpi-card warning">
      <div class="kpi-label">Outstanding Balance</div>
      <div class="kpi-value" style="color:#B91C1C;">${formatCurrency(metrics.pendingBalance)}</div>
      <div class="kpi-sub" style="color:#64748B;">Pending collection</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Orders & Avg Value</div>
      <div class="kpi-value">${metrics.totalOrders} <span style="font-size:13px; font-weight:600; color:#64748B;">Orders</span></div>
      <div class="kpi-sub" style="color:#64748B;">AOV: ${formatCurrency(metrics.avgOrderValue)}</div>
    </div>
  </div>

  <!-- Additional Financial Breakdown -->
  <table style="margin-bottom: 20px;">
    <thead>
      <tr>
        <th>Total Units Sold</th>
        <th>Discounts Allowed</th>
        <th>Delivery & Freight</th>
        <th>Loading Charges</th>
        <th>GST / Taxes Billed</th>
        <th>Net Settled Orders</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="font-weight:700; text-align:center;">${metrics.totalUnits} Units</td>
        <td style="font-weight:700; text-align:center; color:#EF4444;">${formatCurrency(metrics.totalDiscounts)}</td>
        <td style="font-weight:700; text-align:center; color:#2563EB;">${formatCurrency(metrics.totalFreight)}</td>
        <td style="font-weight:700; text-align:center; color:#0F172A;">${formatCurrency(metrics.totalLoading)}</td>
        <td style="font-weight:700; text-align:center; color:#8B5CF6;">${formatCurrency(metrics.totalTaxes)}</td>
        <td style="font-weight:700; text-align:center; color:#10B981;">${metrics.completedOrdersCount} / ${metrics.totalOrders}</td>
      </tr>
    </tbody>
  </table>

  <!-- Top Products and Top Customers Tables -->
  <div class="section-title">
    <span>🏆 Top Selling Products & Inventory Velocity</span>
    <span style="font-size:11px; font-weight:600; color:#64748B;">Top ${topItems.length} Products</span>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:40px; text-align:center;">#</th>
        <th>Product Description</th>
        <th style="text-align:center;">Units Sold</th>
        <th style="text-align:right;">Avg Unit Rate</th>
        <th style="text-align:right;">Total Revenue</th>
        <th style="text-align:right;">Revenue Share</th>
      </tr>
    </thead>
    <tbody>
      ${itemRowsHtml}
    </tbody>
  </table>

  <div class="section-title">
    <span>👥 Customer Performance & Balances</span>
    <span style="font-size:11px; font-weight:600; color:#64748B;">Top ${topCustomers.length} Clients</span>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:30px; text-align:center;">#</th>
        <th>Customer</th>
        <th style="text-align:center;">Orders</th>
        <th style="text-align:center;">Units</th>
        <th style="text-align:right;">Total Billed</th>
        <th style="text-align:right;">Paid</th>
        <th style="text-align:right;">Balance Due</th>
        <th style="text-align:right;">Share</th>
      </tr>
    </thead>
    <tbody>
      ${customerRowsHtml}
    </tbody>
  </table>

  <!-- Recent Transactions Ledger -->
  ${
    orderRowsHtml
      ? `
  <div class="section-title">
    <span>📋 Sales Ledger & Invoice Registry (First ${Math.min(30, filteredOrders.length)} of ${filteredOrders.length})</span>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:30px; text-align:center;">#</th>
        <th>Invoice #</th>
        <th>Date</th>
        <th>Customer</th>
        <th style="text-align:right;">Amount</th>
        <th style="text-align:right;">Paid</th>
        <th style="text-align:right;">Balance</th>
        <th style="text-align:center;">Status</th>
      </tr>
    </thead>
    <tbody>
      ${orderRowsHtml}
    </tbody>
  </table>
  `
      : ''
  }

  <!-- Footer Note & Authorization Signature -->
  <div class="footer">
    <div style="max-width: 60%;">
      <p style="font-weight:600; color:#334155;">${config.customFooterNote}</p>
      <p style="margin-top:4px;">Generated automatically via Business Suite Management App.</p>
    </div>
    <div class="sign-box">
      <div class="sign-line">Authorized Signatory</div>
    </div>
  </div>

</body>
</html>
  `;
}

/**
 * Export and Share PDF Sales Report
 */
export async function exportSalesReportPdf(
  reportData: SalesReportData,
  company: any = {},
  config: SalesReportConfig = DEFAULT_SALES_REPORT_CONFIG
): Promise<boolean> {
  try {
    const html = generateSalesReportHtml(reportData, company, config);
    const { uri } = await Print.printToFileAsync({
      html,
      base64: false,
    });

    if (await Sharing.isAvailableAsync()) {
      const filename = `SalesReport_${reportData.filter.period}_${Date.now()}.pdf`;
      const targetUri = `${FileSystem.documentDirectory}${filename}`;
      await FileSystem.copyAsync({ from: uri, to: targetUri });

      await Sharing.shareAsync(targetUri, {
        UTI: '.pdf',
        mimeType: 'application/pdf',
        dialogTitle: `Share Sales Report (${reportData.formattedDateRange})`,
      });
      return true;
    } else {
      Alert.alert('Sharing Unavailable', 'PDF generated at: ' + uri);
      return true;
    }
  } catch (error: any) {
    console.error('Error generating PDF sales report:', error);
    Alert.alert('Export Failed', error?.message || 'Could not generate PDF report');
    return false;
  }
}

/**
 * Directly print Sales Report
 */
export async function printSalesReport(
  reportData: SalesReportData,
  company: any = {},
  config: SalesReportConfig = DEFAULT_SALES_REPORT_CONFIG
): Promise<boolean> {
  try {
    const html = generateSalesReportHtml(reportData, company, config);
    await Print.printAsync({ html });
    return true;
  } catch (error: any) {
    console.error('Error printing sales report:', error);
    Alert.alert('Print Error', error?.message || 'Could not print report');
    return false;
  }
}

/**
 * Export Sales Report to CSV / Excel
 */
export async function exportSalesReportCsv(
  reportData: SalesReportData,
  company: any = {}
): Promise<boolean> {
  try {
    const { metrics, customerSummaries, itemSummaries, filteredOrders, formattedDateRange } = reportData;
    const companyName = company.name || company.businessName || 'Business Suite';

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const lines: string[] = [];

    // Header metadata
    lines.push(`${escapeCsv('SALES REPORT')},${escapeCsv(companyName)}`);
    lines.push(`${escapeCsv('Period')},${escapeCsv(formattedDateRange)}`);
    lines.push(`${escapeCsv('Generated At')},${escapeCsv(new Date().toLocaleString('en-IN'))}`);
    lines.push('');

    // Summary Metrics
    lines.push(`${escapeCsv('EXECUTIVE SUMMARY METRICS')}`);
    lines.push(`${escapeCsv('Gross Revenue')},${metrics.totalSales}`);
    lines.push(`${escapeCsv('Total Orders')},${metrics.totalOrders}`);
    lines.push(`${escapeCsv('Total Units Sold')},${metrics.totalUnits}`);
    lines.push(`${escapeCsv('Collected Amount')},${metrics.collectedAmount}`);
    lines.push(`${escapeCsv('Pending Balance Due')},${metrics.pendingBalance}`);
    lines.push(`${escapeCsv('Average Order Value (AOV)')},${metrics.avgOrderValue.toFixed(2)}`);
    lines.push(`${escapeCsv('Total Discounts Allowed')},${metrics.totalDiscounts}`);
    lines.push(`${escapeCsv('Total Freight / Delivery')},${metrics.totalFreight}`);
    lines.push(`${escapeCsv('Total Loading Charges')},${metrics.totalLoading}`);
    lines.push(`${escapeCsv('Total GST / Tax')},${metrics.totalTaxes}`);
    lines.push(`${escapeCsv('Collection Efficiency %')},${metrics.collectionRate.toFixed(2)}%`);
    lines.push('');

    // Customer Breakdown Table
    lines.push(`${escapeCsv('CUSTOMER BREAKDOWN')}`);
    lines.push([
      escapeCsv('#'),
      escapeCsv('Customer Name'),
      escapeCsv('Phone Number'),
      escapeCsv('Orders Count'),
      escapeCsv('Units Bought'),
      escapeCsv('Total Sales (INR)'),
      escapeCsv('Paid (INR)'),
      escapeCsv('Balance Due (INR)'),
      escapeCsv('Share %'),
    ].join(','));

    customerSummaries.forEach((c, idx) => {
      lines.push([
        idx + 1,
        escapeCsv(c.customerName),
        escapeCsv(c.phone),
        c.ordersCount,
        c.totalUnits,
        c.totalSales.toFixed(2),
        c.totalPaid.toFixed(2),
        c.balanceDue.toFixed(2),
        c.sharePercent.toFixed(2) + '%',
      ].join(','));
    });
    lines.push('');

    // Item Breakdown Table
    lines.push(`${escapeCsv('PRODUCT / ITEM PERFORMANCE')}`);
    lines.push([
      escapeCsv('#'),
      escapeCsv('Product Name'),
      escapeCsv('Item Type'),
      escapeCsv('Units Sold'),
      escapeCsv('Avg Unit Price (INR)'),
      escapeCsv('Total Revenue (INR)'),
      escapeCsv('Share %'),
    ].join(','));

    itemSummaries.forEach((i, idx) => {
      lines.push([
        idx + 1,
        escapeCsv(i.itemName),
        escapeCsv(i.itemType),
        i.totalUnits,
        i.unitPriceAvg.toFixed(2),
        i.totalRevenue.toFixed(2),
        i.sharePercent.toFixed(2) + '%',
      ].join(','));
    });
    lines.push('');

    // Orders Ledger Table
    lines.push(`${escapeCsv('TRANSACTION ORDERS LEDGER')}`);
    lines.push([
      escapeCsv('Date'),
      escapeCsv('Invoice / Order #'),
      escapeCsv('Customer Name'),
      escapeCsv('Phone'),
      escapeCsv('Items Breakdown'),
      escapeCsv('Total Amount (INR)'),
      escapeCsv('Paid Amount (INR)'),
      escapeCsv('Balance Due (INR)'),
      escapeCsv('Delivery Partner'),
      escapeCsv('Payment Status'),
    ].join(','));

    filteredOrders.forEach((o) => {
      const itemsList = Array.isArray(o.items)
        ? o.items.map((it: any) => `${it.name || it.itemName} (x${it.quantity || it.qty || 1})`).join('; ')
        : 'General Order';

      lines.push([
        escapeCsv(formatDate(o._orderDate)),
        escapeCsv(o.invoiceNumber || o.orderNumber || o.id),
        escapeCsv(o.customerName || 'Customer'),
        escapeCsv(o.customerPhone || ''),
        escapeCsv(itemsList),
        Number(o.total || o.totalAmount || 0).toFixed(2),
        Number(o.paidAmount || o.paid || 0).toFixed(2),
        Math.max(0, Number(o.total || o.totalAmount || 0) - Number(o.paidAmount || o.paid || 0)).toFixed(2),
        escapeCsv(o.deliveryPartnerName || 'Self / None'),
        escapeCsv(o._computedStatus),
      ].join(','));
    });

    const csvContent = lines.join('\n');
    const filename = `Sales_Report_${reportData.filter.period}_${Date.now()}.csv`;
    const targetUri = `${FileSystem.documentDirectory}${filename}`;

    await FileSystem.writeAsStringAsync(targetUri, csvContent, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(targetUri, {
        UTI: 'public.comma-separated-values-text',
        mimeType: 'text/csv',
        dialogTitle: `Share Sales CSV (${reportData.formattedDateRange})`,
      });
      return true;
    } else {
      Alert.alert('CSV Created', `Saved to ${targetUri}`);
      return true;
    }
  } catch (error: any) {
    console.error('Error generating CSV:', error);
    Alert.alert('CSV Export Failed', error?.message || 'Could not create CSV file');
    return false;
  }
}

/**
 * Format executive WhatsApp message summary
 */
export function formatSalesReportWhatsApp(
  reportData: SalesReportData,
  company: any = {},
  config: SalesReportConfig = DEFAULT_SALES_REPORT_CONFIG
): string {
  const { metrics, customerSummaries, itemSummaries, formattedDateRange } = reportData;
  const companyName = company.name || company.businessName || 'Our Business';

  const top3Cust = customerSummaries
    .slice(0, 3)
    .map((c, i) => `  ${i + 1}. *${c.customerName}*: ${formatCurrency(c.totalSales)} (${c.ordersCount} orders)`)
    .join('\n');

  const top3Items = itemSummaries
    .slice(0, 3)
    .map((item, i) => `  ${i + 1}. *${item.itemName}*: ${item.totalUnits} units (${formatCurrency(item.totalRevenue)})`)
    .join('\n');

  let text = `📊 *SALES REPORT SUMMARY - ${companyName.toUpperCase()}*\n`;
  text += `📅 *Period:* ${formattedDateRange}\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `💰 *Gross Sales:* ${formatCurrency(metrics.totalSales)}\n`;
  text += `💵 *Amount Collected:* ${formatCurrency(metrics.collectedAmount)} (${metrics.collectionRate.toFixed(1)}%)\n`;
  text += `⏳ *Pending Balance:* ${formatCurrency(metrics.pendingBalance)}\n`;
  text += `📦 *Total Orders:* ${metrics.totalOrders} (AOV: ${formatCurrency(metrics.avgOrderValue)})\n`;
  text += `🏷️ *Units Sold:* ${metrics.totalUnits} units\n`;

  if (metrics.totalDiscounts > 0) {
    text += `🏷️ *Discounts Given:* ${formatCurrency(metrics.totalDiscounts)}\n`;
  }
  if (metrics.totalFreight > 0) {
    text += `🚚 *Freight / Delivery:* ${formatCurrency(metrics.totalFreight)}\n`;
  }
  if (metrics.totalTaxes > 0) {
    text += `🧾 *Tax / GST:* ${formatCurrency(metrics.totalTaxes)}\n`;
  }

  if (top3Cust) {
    text += `\n👑 *TOP CUSTOMERS:*\n${top3Cust}\n`;
  }

  if (top3Items) {
    text += `\n🔥 *TOP SELLING PRODUCTS:*\n${top3Items}\n`;
  }

  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `📈 *Growth:* ${metrics.growthPercent >= 0 ? '▲ +' : '▼ '}${metrics.growthPercent.toFixed(1)}% vs previous period\n`;
  text += `_Generated via Business Suite App_`;

  return text;
}

/**
 * Load Report Configuration from AsyncStorage and Firestore
 */
export async function loadSalesReportConfig(): Promise<SalesReportConfig> {
  try {
    const local = await AsyncStorage.getItem(STORAGE_KEY_CONFIG);
    let parsed = local ? JSON.parse(local) : null;

    try {
      const snap = await getDoc(doc(db, 'app_settings', 'sales_report_config'));
      if (snap.exists()) {
        parsed = { ...DEFAULT_SALES_REPORT_CONFIG, ...parsed, ...snap.data() };
      }
    } catch (e) {
      // offline fallback
    }

    return parsed ? { ...DEFAULT_SALES_REPORT_CONFIG, ...parsed } : DEFAULT_SALES_REPORT_CONFIG;
  } catch (error) {
    return DEFAULT_SALES_REPORT_CONFIG;
  }
}

/**
 * Save Report Configuration
 */
export async function saveSalesReportConfig(config: SalesReportConfig): Promise<boolean> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config));
    try {
      await setDoc(doc(db, 'app_settings', 'sales_report_config'), config, { merge: true });
    } catch (e) {
      // ignore network errors
    }
    return true;
  } catch (error) {
    console.error('Error saving sales report config:', error);
    return false;
  }
}
