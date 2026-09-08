import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Share, Alert, Linking } from 'react-native';

export interface DeliveryTripItem {
  id: string;
  orderId?: string;
  partnerId: string;
  partnerName?: string;
  customerName?: string;
  deliveryCharge: number;
  paymentStatus: string;
  deliveredItem?: string;
  notes?: string;
  createdAt: Date | string;
}

export interface DeliveryPaymentItem {
  id: string;
  partnerId: string;
  amount: number;
  paymentMethod?: string;
  notes?: string;
  createdAt: Date | string;
}

export interface DeliveryBonusItem {
  id: string;
  partnerId: string;
  amount: number;
  reason: string;
  notes?: string;
  createdAt: Date | string;
}

export interface DeliveryPartnerPurchasedOrderItem {
  id: string;
  items?: { itemName?: string; name?: string; quantity?: number; qty?: number; price?: number }[];
  itemName?: string;
  quantity?: number;
  total: number;
  paidAmount: number;
  balanceDue: number;
  createdAt: Date | string;
}

export interface PartnerSummary {
  totalTrips: number;
  totalPayable: number;
  totalBonuses: number;
  totalPaid: number;
  netPending: number;
  // Product purchases by partner
  totalOrdersPurchased?: number;
  totalOrderValue?: number;
  totalOrderPaid?: number;
  totalOrderDue?: number;
  totalOrderItemsCount?: number;
}

export interface DeliveryPartnerShareData {
  partner: {
    id: string;
    name: string;
    mobile?: string;
    vehicleType?: string;
    vehicleNumber?: string;
    address?: string;
    deliveryRateType?: string;
    deliveryRate?: number | string;
    minimumRate?: number | string;
    status?: string;
  };
  trips: DeliveryTripItem[];
  payments: DeliveryPaymentItem[];
  bonuses: DeliveryBonusItem[];
  purchasedOrders?: DeliveryPartnerPurchasedOrderItem[];
  summary: PartnerSummary;
  options?: {
    includeTrips?: boolean;
    includePayments?: boolean;
    includeBonuses?: boolean;
    includeVehicleInfo?: boolean;
    includePurchasedOrders?: boolean;
  };
}

function formatDate(dateVal?: Date | string): string {
  if (!dateVal) return 'N/A';
  const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
  if (isNaN(d.getTime())) return 'N/A';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatCurrency(amount: number): string {
  return `₹${(amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatRateDisplay(partner: any): string {
  const type = partner.deliveryRateType || 'fixed amount';
  const rateVal = parseFloat(partner.deliveryRate) || 0;
  let text = '';
  if (type === 'kilometre') text = `₹${rateVal.toFixed(2)} / KM`;
  else if (type === 'per brick') text = `₹${rateVal.toFixed(2)} / Brick`;
  else text = `₹${rateVal.toFixed(2)} (Fixed)`;

  if (partner.minimumRate) {
    const minVal = parseFloat(partner.minimumRate) || 0;
    if (minVal > 0) text += ` [Min: ₹${minVal.toFixed(2)}]`;
  }
  return text;
}

export class DeliveryPartnerShareService {
  /**
   * Format text message for Delivery Partner Statement (WhatsApp / SMS)
   */
  formatPartnerStatementText(
    data: DeliveryPartnerShareData,
    company: any = {},
    periodLabel: string = 'All Time'
  ): string {
    const p = data.partner;
    const s = data.summary;
    const companyName = company?.businessName || company?.fullName || company?.name || 'Our Business';
    const companyPhone = company?.mobile || company?.phone || '';
    const isAdvance = s.netPending < 0;
    const balanceStatusStr = isAdvance
      ? `🟢 Advance Paid: ${formatCurrency(Math.abs(s.netPending))}`
      : s.netPending === 0
      ? `✅ Fully Settled (₹0.00 Due)`
      : `🔴 Balance Due to Partner: ${formatCurrency(s.netPending)}`;

    let msg = `🚚 *DELIVERY PARTNER ACCOUNT STATEMENT*\n`;
    msg += `🏢 *${companyName}*\n`;
    if (companyPhone) msg += `📞 Contact: ${companyPhone}\n`;
    msg += `----------------------------------------\n`;
    msg += `👤 *Partner Name:* ${p.name || 'Delivery Partner'}\n`;
    if (p.mobile) msg += `📱 *Mobile:* ${p.mobile}\n`;
    if (p.vehicleType || p.vehicleNumber) {
      msg += `🚛 *Vehicle:* ${p.vehicleType || 'Vehicle'} ${p.vehicleNumber ? `(${p.vehicleNumber})` : ''}\n`;
    }
    msg += `📅 *Statement Period:* ${periodLabel}\n`;
    msg += `----------------------------------------\n`;
    msg += `📊 *FINANCIAL SUMMARY (DELIVERY SERVICES)*\n`;
    msg += `• *Total Deliveries / Trips:* ${s.totalTrips}\n`;
    msg += `• *Delivery Earnings (Payable):* ${formatCurrency(s.totalPayable)}\n`;
    if (s.totalBonuses > 0) {
      msg += `• *Bonus Rewards ⭐:* ${formatCurrency(s.totalBonuses)}\n`;
    }
    msg += `• *Total Amount Paid:* ${formatCurrency(s.totalPaid)}\n`;
    msg += `• *NET DELIVERY BALANCE:* ${balanceStatusStr}\n`;
    msg += `----------------------------------------\n`;

    // Product Orders Purchased by Partner
    if (
      data.options?.includePurchasedOrders !== false &&
      data.purchasedOrders &&
      data.purchasedOrders.length > 0
    ) {
      msg += `🛒 *PRODUCT ORDERS PURCHASED (${data.purchasedOrders.length})*\n`;
      msg += `• *Total Orders Value:* ${formatCurrency(s.totalOrderValue || 0)}\n`;
      msg += `• *Total Paid for Orders:* ${formatCurrency(s.totalOrderPaid || 0)}\n`;
      msg += `• *Order Balance Due:* ${formatCurrency(s.totalOrderDue || 0)}\n`;
      if ((s.totalOrderItemsCount || 0) > 0) {
        msg += `• *Total Bricks / Items:* ${(s.totalOrderItemsCount || 0).toLocaleString('en-IN')}\n`;
      }
      msg += `----------------------------------------\n`;
      data.purchasedOrders.slice(0, 4).forEach((ord, idx) => {
        const orderDate = formatDate(ord.createdAt);
        const orderIdShort = ord.id ? `#${ord.id.slice(-6).toUpperCase()}` : '';
        const qty = ord.items && ord.items.length > 0
          ? ord.items.reduce((sum, itm) => sum + Number(itm.quantity || itm.qty || 0), 0)
          : Number(ord.quantity || 0);
        const itemDetail = ord.itemName ? ` (${ord.itemName})` : (qty ? ` (${qty} pcs)` : '');
        const dueText = Number(ord.balanceDue || 0) > 0 ? `[Due: ${formatCurrency(ord.balanceDue)}]` : '[Paid ✓]';
        msg += `${idx + 1}. ${orderDate} - Order ${orderIdShort}${itemDetail}: ${formatCurrency(ord.total)} ${dueText}\n`;
      });
      if (data.purchasedOrders.length > 4) {
        msg += `   ... and ${data.purchasedOrders.length - 4} more orders purchased.\n`;
      }
      msg += `----------------------------------------\n`;
    }

    // Recent Trips (up to 5)
    if (data.options?.includeTrips !== false && data.trips.length > 0) {
      msg += `📦 *RECENT DELIVERIES (${Math.min(5, data.trips.length)} of ${data.trips.length})*\n`;
      data.trips.slice(0, 5).forEach((t, idx) => {
        const itemStr = t.deliveredItem ? ` (${t.deliveredItem})` : '';
        msg += `${idx + 1}. ${formatDate(t.createdAt)} - ${t.customerName || 'General Client'}${itemStr}\n   Charge: ${formatCurrency(t.deliveryCharge)}\n`;
      });
      if (data.trips.length > 5) {
        msg += `   ... and ${data.trips.length - 5} more trips recorded.\n`;
      }
      msg += `----------------------------------------\n`;
    }

    // Recent Payments (up to 3)
    if (data.options?.includePayments !== false && data.payments.length > 0) {
      msg += `💳 *RECENT PAYMENTS (${Math.min(3, data.payments.length)} of ${data.payments.length})*\n`;
      data.payments.slice(0, 3).forEach((pm, idx) => {
        const methodStr = pm.paymentMethod ? ` (${pm.paymentMethod})` : '';
        msg += `${idx + 1}. ${formatDate(pm.createdAt)} - Paid ${formatCurrency(pm.amount)}${methodStr}\n`;
      });
      msg += `----------------------------------------\n`;
    }

    // Recent Bonuses (up to 3)
    if (data.options?.includeBonuses !== false && data.bonuses.length > 0) {
      msg += `⭐ *BONUS REWARDS (${data.bonuses.length})*\n`;
      data.bonuses.slice(0, 3).forEach((b, idx) => {
        msg += `${idx + 1}. ${formatDate(b.createdAt)} - ${b.reason}: +${formatCurrency(b.amount)}\n`;
      });
      msg += `----------------------------------------\n`;
    }

    msg += `Generated on: ${new Date().toLocaleString('en-IN')}\n`;
    msg += `Thank you for your dedicated service! 🚚✨`;

    return msg;
  }

  /**
   * Share Delivery Partner Statement as Text via WhatsApp or Native Dialog
   */
  async shareText(
    text: string,
    partnerName: string = 'Partner',
    mobile?: string
  ): Promise<void> {
    try {
      if (mobile) {
        const cleanMobile = mobile.replace(/[^0-9]/g, '');
        const formattedMobile = cleanMobile.length === 10 ? `91${cleanMobile}` : cleanMobile;
        const encoded = encodeURIComponent(text);
        const waUrl = `whatsapp://send?phone=${formattedMobile}&text=${encoded}`;
        const canOpen = await Linking.canOpenURL(waUrl);

        if (canOpen) {
          await Linking.openURL(waUrl);
          return;
        }
      }

      await Share.share({
        message: text,
        title: `Delivery Partner Statement - ${partnerName}`,
      });
    } catch (err: any) {
      console.error('Share text statement error:', err);
      Alert.alert('Sharing Failed', err?.message || 'Could not share text statement.');
    }
  }

  /**
   * Generate HTML for Delivery Partner Statement PDF / Print
   */
  generateDeliveryPartnerStatementHtml(
    data: DeliveryPartnerShareData,
    company: any = {},
    periodLabel: string = 'All Time'
  ): string {
    const p = data.partner;
    const s = data.summary;
    const companyName = company?.businessName || company?.fullName || company?.name || 'My Business App';
    const ownerName = company?.fullName || company?.name || '';
    const companyMobile = company?.mobile || company?.phone || '';
    const companyAddress = company?.address || '';
    const companyGst = company?.gstNo || company?.gstin || '';
    const isAdvance = s.netPending < 0;

    const tripsRows = data.trips.map((t, idx) => {
      return `
        <tr style="background: ${idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'};">
          <td style="padding: 9px 10px; border-bottom: 1px solid #E2E8F0; font-size: 11px; color: #475569;">${formatDate(t.createdAt)}</td>
          <td style="padding: 9px 10px; border-bottom: 1px solid #E2E8F0; font-size: 11.5px; font-weight: 600; color: #0F172A;">
            <div>${t.customerName || 'General Client'}</div>
            ${t.deliveredItem ? `<div style="font-size: 10px; color: #64748B; font-weight: 400; margin-top: 2px;">📦 ${t.deliveredItem}</div>` : ''}
            ${t.notes ? `<div style="font-size: 9.5px; color: #94A3B8; font-style: italic;">Note: ${t.notes}</div>` : ''}
          </td>
          <td style="padding: 9px 10px; border-bottom: 1px solid #E2E8F0; font-size: 11.5px; text-align: right; font-weight: 700; color: #1E293B;">
            ${formatCurrency(t.deliveryCharge)}
          </td>
        </tr>
      `;
    }).join('');

    const paymentsRows = data.payments.map((pm, idx) => {
      return `
        <tr style="background: ${idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'};">
          <td style="padding: 8px 10px; border-bottom: 1px solid #E2E8F0; font-size: 11px; color: #475569;">${formatDate(pm.createdAt)}</td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #E2E8F0; font-size: 11.5px; color: #0F172A;">
            <span style="font-weight: 600; color: #059669;">Payment to Partner</span>
            ${pm.paymentMethod ? `<span style="font-size: 10px; color: #64748B; margin-left: 6px;">[${pm.paymentMethod}]</span>` : ''}
            ${pm.notes ? `<div style="font-size: 9.5px; color: #94A3B8; margin-top: 2px;">${pm.notes}</div>` : ''}
          </td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #E2E8F0; font-size: 11.5px; text-align: right; font-weight: 700; color: #059669;">
            ${formatCurrency(pm.amount)}
          </td>
        </tr>
      `;
    }).join('');

    const bonusesRows = data.bonuses.map((b, idx) => {
      return `
        <tr style="background: ${idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'};">
          <td style="padding: 8px 10px; border-bottom: 1px solid #E2E8F0; font-size: 11px; color: #475569;">${formatDate(b.createdAt)}</td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #E2E8F0; font-size: 11.5px; color: #0F172A;">
            <span style="font-weight: 600; color: #8B5CF6;">⭐ ${b.reason || 'Bonus Reward'}</span>
            ${b.notes ? `<div style="font-size: 9.5px; color: #94A3B8; margin-top: 2px;">${b.notes}</div>` : ''}
          </td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #E2E8F0; font-size: 11.5px; text-align: right; font-weight: 700; color: #8B5CF6;">
            +${formatCurrency(b.amount)}
          </td>
        </tr>
      `;
    }).join('');

    const purchasedOrdersRows = (data.purchasedOrders || []).map((ord, idx) => {
      const isPaid = Number(ord.balanceDue || 0) <= 0;
      const qty = ord.items && ord.items.length > 0
        ? ord.items.reduce((sum, itm) => sum + Number(itm.quantity || itm.qty || 0), 0)
        : Number(ord.quantity || 0);
      const itemText = ord.items && ord.items.length > 0
        ? ord.items.map((i) => `${i.itemName || i.name || 'Item'} (${Number(i.quantity || i.qty || 0).toLocaleString('en-IN')})`).join(', ')
        : (ord.itemName || `${qty} Bricks`);

      return `
        <tr style="background: ${idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'};">
          <td style="padding: 8px 10px; border-bottom: 1px solid #E2E8F0; font-size: 11px; color: #475569;">${formatDate(ord.createdAt)}</td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #E2E8F0; font-size: 11.5px; font-weight: 600; color: #0F172A;">
            <div>Order #${ord.id ? ord.id.slice(-6).toUpperCase() : ''}</div>
            <div style="font-size: 10px; color: #64748B; font-weight: 400; margin-top: 2px;">📦 ${itemText}</div>
          </td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #E2E8F0; font-size: 11.5px; text-align: right; font-weight: 700; color: #0F172A;">
            ${formatCurrency(ord.total)}
          </td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #E2E8F0; font-size: 11.5px; text-align: right; color: #059669; font-weight: 600;">
            ${formatCurrency(ord.paidAmount)}
          </td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #E2E8F0; font-size: 11.5px; text-align: right; font-weight: 700; color: ${isPaid ? '#059669' : '#DC2626'};">
            ${isPaid ? 'Paid ✓' : formatCurrency(ord.balanceDue)}
          </td>
        </tr>
      `;
    }).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Delivery Partner Statement - ${p.name}</title>
        <style>
          @page { margin: 16mm 14mm; size: A4; }
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            color: #0F172A;
            background: #FFFFFF;
            margin: 0;
            padding: 0;
            line-height: 1.45;
          }
          .header-table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
          .header-left { vertical-align: top; }
          .header-right { vertical-align: top; text-align: right; }
          .company-title { font-size: 22px; font-weight: 800; color: #0F172A; margin: 0 0 4px 0; }
          .company-sub { font-size: 11px; color: #64748B; margin: 2px 0; }
          .badge-statement {
            background: #2563EB;
            color: #FFFFFF;
            padding: 6px 14px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 800;
            letter-spacing: 0.6px;
            display: inline-block;
            margin-bottom: 6px;
          }
          .period-pill {
            background: #F1F5F9;
            color: #475569;
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 10px;
            font-weight: 700;
            display: inline-block;
          }
          .partner-card {
            background: #F8FAFC;
            border: 1px solid #E2E8F0;
            border-radius: 12px;
            padding: 14px 16px;
            margin-bottom: 18px;
          }
          .info-table { width: 100%; border-collapse: collapse; }
          .info-cell { vertical-align: top; width: 50%; }
          .info-title { font-size: 10px; font-weight: 800; text-transform: uppercase; color: #94A3B8; letter-spacing: 0.5px; margin-bottom: 3px; }
          .info-val { font-size: 13px; font-weight: 700; color: #0F172A; }
          .info-desc { font-size: 11px; color: #64748B; margin-top: 2px; }
          .summary-grid {
            display: flex;
            gap: 10px;
            margin-bottom: 14px;
          }
          .summary-card {
            flex: 1;
            background: #FFFFFF;
            border: 1px solid #E2E8F0;
            border-radius: 10px;
            padding: 10px 12px;
            text-align: center;
          }
          .summary-label { font-size: 9.5px; font-weight: 700; text-transform: uppercase; color: #64748B; margin-bottom: 4px; }
          .summary-val { font-size: 14px; font-weight: 800; color: #0F172A; }
          .section-heading {
            font-size: 12px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.6px;
            color: #334155;
            margin: 18px 0 8px 0;
            padding-bottom: 4px;
            border-bottom: 1.5px solid #E2E8F0;
            display: flex;
            justify-content: space-between;
          }
          .data-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 16px;
            border: 1px solid #E2E8F0;
            border-radius: 8px;
            overflow: hidden;
          }
          .data-table th {
            background: #F1F5F9;
            color: #475569;
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            padding: 8px 10px;
            border-bottom: 1px solid #CBD5E1;
            text-align: left;
          }
          .footer-section {
            margin-top: 30px;
            padding-top: 14px;
            border-top: 1px solid #E2E8F0;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
          }
          .footer-text { font-size: 10px; color: #94A3B8; }
          .sign-box { text-align: center; min-width: 160px; }
          .sign-line { border-bottom: 1px solid #94A3B8; width: 140px; margin: 0 auto 6px auto; }
          .sign-title { font-size: 10px; font-weight: 700; color: #64748B; text-transform: uppercase; }
        </style>
      </head>
      <body>
        <!-- Header -->
        <table class="header-table">
          <tr>
            <td class="header-left">
              <div class="company-title">${companyName}</div>
              ${ownerName ? `<div class="company-sub">Proprietor: ${ownerName}</div>` : ''}
              ${companyMobile ? `<div class="company-sub">Mobile: ${companyMobile}</div>` : ''}
              ${companyAddress ? `<div class="company-sub">${companyAddress}</div>` : ''}
              ${companyGst ? `<div class="company-sub">GSTIN: ${companyGst}</div>` : ''}
            </td>
            <td class="header-right">
              <div class="badge-statement">DELIVERY PARTNER STATEMENT</div>
              <div><span class="period-pill">Period: ${periodLabel}</span></div>
              <div style="font-size: 10.5px; color: #64748B; margin-top: 6px;">Generated: ${new Date().toLocaleDateString('en-IN')}</div>
            </td>
          </tr>
        </table>

        <!-- Partner Info Box -->
        <div class="partner-card">
          <table class="info-table">
            <tr>
              <td class="info-cell">
                <div class="info-title">Delivery Partner</div>
                <div class="info-val">${p.name}</div>
                <div class="info-desc">📱 ${p.mobile || 'No mobile provided'}</div>
                ${p.address ? `<div class="info-desc">📍 ${p.address}</div>` : ''}
              </td>
              <td class="info-cell" style="padding-left: 20px;">
                <div class="info-title">Vehicle & Rate Details</div>
                <div class="info-val">🚛 ${p.vehicleType || 'Vehicle'} ${p.vehicleNumber ? `(${p.vehicleNumber})` : ''}</div>
                <div class="info-desc">Rate: ${formatRateDisplay(p)}</div>
                <div class="info-desc">Status: <strong style="color: ${p.status === 'Active' ? '#059669' : '#DC2626'};">${p.status || 'Active'}</strong></div>
              </td>
            </tr>
          </table>
        </div>

        <!-- Delivery Financial Summary Grid -->
        <div class="summary-grid">
          <div class="summary-card" style="background: #EFF6FF; border-color: #BFDBFE;">
            <div class="summary-label" style="color: #1D4ED8;">Total Trips</div>
            <div class="summary-val" style="color: #2563EB;">${s.totalTrips}</div>
          </div>
          <div class="summary-card" style="background: #F0FDF4; border-color: #BBF7D0;">
            <div class="summary-label" style="color: #15803D;">Trip Earnings</div>
            <div class="summary-val" style="color: #16A34A;">${formatCurrency(s.totalPayable)}</div>
          </div>
          ${s.totalBonuses > 0 ? `
          <div class="summary-card" style="background: #FAF5FF; border-color: #E9D5FF;">
            <div class="summary-label" style="color: #7E22CE;">Bonus Rewards</div>
            <div class="summary-val" style="color: #8B5CF6;">+${formatCurrency(s.totalBonuses)}</div>
          </div>
          ` : ''}
          <div class="summary-card" style="background: #F8FAFC; border-color: #E2E8F0;">
            <div class="summary-label" style="color: #475569;">Total Paid</div>
            <div class="summary-val" style="color: #0F172A;">${formatCurrency(s.totalPaid)}</div>
          </div>
          <div class="summary-card" style="background: ${isAdvance ? '#ECFDF5' : '#FEF2F2'}; border-color: ${isAdvance ? '#A7F3D0' : '#FECACA'};">
            <div class="summary-label" style="color: ${isAdvance ? '#047857' : '#B91C1C'};">${isAdvance ? 'Advance Paid' : 'Net Delivery Due'}</div>
            <div class="summary-val" style="color: ${isAdvance ? '#059669' : '#DC2626'};">${formatCurrency(Math.abs(s.netPending))}</div>
          </div>
        </div>

        <!-- Product Orders Summary (If Any) -->
        ${(data.purchasedOrders && data.purchasedOrders.length > 0 && (s.totalOrderValue || 0) > 0) ? `
          <div style="background: #F0F9FF; border: 1px solid #BAE6FD; border-radius: 10px; padding: 10px 14px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong style="color: #0369A1; font-size: 12px;">🛒 Product Orders Purchased as Client (${data.purchasedOrders.length} Orders):</strong>
              <div style="font-size: 11px; color: #0284C7; margin-top: 2px;">
                Total Orders Value: <strong>${formatCurrency(s.totalOrderValue || 0)}</strong> | Paid: <strong>${formatCurrency(s.totalOrderPaid || 0)}</strong>
              </div>
            </div>
            <div style="text-align: right;">
              <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #0369A1;">Order Balance Due</span>
              <div style="font-size: 14px; font-weight: 800; color: ${(s.totalOrderDue || 0) > 0 ? '#DC2626' : '#059669'};">
                ${(s.totalOrderDue || 0) > 0 ? formatCurrency(s.totalOrderDue || 0) : 'Fully Settled ✓'}
              </div>
            </div>
          </div>
        ` : ''}

        <!-- 1. Product Orders Purchased Table -->
        ${(data.options?.includePurchasedOrders !== false && data.purchasedOrders && data.purchasedOrders.length > 0) ? `
          <div class="section-heading" style="color: #0369A1;">
            <span>🛒 Product Orders Purchased (${data.purchasedOrders.length})</span>
            <span>Total Value: ${formatCurrency(s.totalOrderValue || 0)} | Due: ${formatCurrency(s.totalOrderDue || 0)}</span>
          </div>
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 85px;">Date</th>
                <th>Order # & Purchased Items</th>
                <th style="width: 90px; text-align: right;">Total</th>
                <th style="width: 90px; text-align: right;">Paid</th>
                <th style="width: 90px; text-align: right;">Due</th>
              </tr>
            </thead>
            <tbody>
              ${purchasedOrdersRows}
            </tbody>
          </table>
        ` : ''}

        <!-- 2. Payments Table -->
        ${data.payments.length > 0 ? `
          <div class="section-heading">
            <span>Payment Records (${data.payments.length})</span>
            <span>Total Paid: ${formatCurrency(s.totalPaid)}</span>
          </div>
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 85px;">Date</th>
                <th>Transaction Details / Method</th>
                <th style="width: 100px; text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${paymentsRows}
            </tbody>
          </table>
        ` : ''}

        <!-- Bonuses Table -->
        ${data.bonuses.length > 0 ? `
          <div class="section-heading">
            <span>Bonus Rewards ⭐ (${data.bonuses.length})</span>
            <span>Total: +${formatCurrency(s.totalBonuses)}</span>
          </div>
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 85px;">Date</th>
                <th>Reward Reason & Notes</th>
                <th style="width: 100px; text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${bonusesRows}
            </tbody>
          </table>
        ` : ''}

        <!-- 3. Deliveries & Trips Table -->
        <div class="section-heading">
          <span>Deliveries & Trips Ledger (${data.trips.length})</span>
          <span>Total: ${formatCurrency(s.totalPayable)}</span>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 85px;">Date</th>
              <th>Customer / Destination & Goods</th>
              <th style="width: 100px; text-align: right;">Charge</th>
            </tr>
          </thead>
          <tbody>
            ${data.trips.length > 0 ? tripsRows : `
              <tr>
                <td colspan="3" style="text-align: center; padding: 16px; color: #94A3B8; font-style: italic; font-size: 11px;">
                  No delivery trips recorded in this period.
                </td>
              </tr>
            `}
          </tbody>
        </table>

        <!-- Footer -->
        <div class="footer-section">
          <div class="footer-text">
            <div>• This is a computer-generated delivery partner statement.</div>
            <div>• For any queries regarding trips, product purchases, or payouts, please contact ${companyName}.</div>
          </div>
          <div class="sign-box">
            <div class="sign-line"></div>
            <div class="sign-title">Authorized Signatory</div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Share Delivery Partner Statement as PDF
   */
  async sharePdf(
    data: DeliveryPartnerShareData,
    company: any = {},
    periodLabel: string = 'All Time'
  ): Promise<void> {
    try {
      const html = this.generateDeliveryPartnerStatementHtml(data, company, periodLabel);
      const { uri } = await Print.printToFileAsync({ html });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Statement - ${data.partner.name}.pdf`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('PDF Created', `PDF statement saved at:\n${uri}`);
      }
    } catch (err: any) {
      console.error('Export partner PDF error:', err);
      Alert.alert('Export Failed', err?.message || 'Could not generate PDF statement.');
    }
  }

  /**
   * Direct Print Delivery Partner Statement
   */
  async printStatement(
    data: DeliveryPartnerShareData,
    company: any = {},
    periodLabel: string = 'All Time'
  ): Promise<void> {
    try {
      const html = this.generateDeliveryPartnerStatementHtml(data, company, periodLabel);
      await Print.printAsync({ html });
    } catch (err: any) {
      console.error('Print statement error:', err);
      Alert.alert('Print Failed', err?.message || 'Could not print statement.');
    }
  }
}

export const deliveryPartnerShareService = new DeliveryPartnerShareService();
