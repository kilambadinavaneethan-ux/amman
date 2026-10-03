import { Share, Linking, Alert, Clipboard, Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import { CustomerShareData, ShareSettings, InvoiceTemplate, DEFAULT_CUSTOMER_MESSAGE_TEMPLATE, formatCustomerPhonesDisplay, formatCustomerPhoneNumbers, AppaEstimateBillSettings, DEFAULT_APPA_ESTIMATE_BILL_SETTINGS } from '../../types/sharing';
import { getInvoiceLabels } from '../../utils/invoiceLocalization';

function formatCurrency(amount: number): string {
  if (isNaN(amount) || amount === undefined || amount === null) return '₹0.00';
  return `₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateVal: Date | string): string {
  if (!dateVal) return '';
  const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
  if (isNaN(d.getTime())) return String(dateVal);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const customerShareService = {
  /**
   * Format text message for Customer Statement (WhatsApp / SMS)
   */
  formatCustomerShareText(
    data: CustomerShareData,
    company: any = {},
    settings: ShareSettings,
    customTemplate?: string,
    template?: InvoiceTemplate,
    formatType: 'standard' | 'appa_estimate' = 'standard'
  ): string {
    if (formatType === 'appa_estimate') {
      const cfg: AppaEstimateBillSettings = {
        ...DEFAULT_APPA_ESTIMATE_BILL_SETTINGS,
        ...(template?.appaBillSettings || {}),
      };
      const rawCompanyPhone = cfg.customPhones?.trim() || company.phone || '99430 51509';
      const altPhone = cfg.customPhones?.trim() ? '' : (company.alternatePhone || '99430 51209');
      const phones = [rawCompanyPhone, altPhone].filter(Boolean).join(', ');
      const compName = cfg.customCompanyName?.trim() || company.name || 'அம்மன் ஹாலோ பிரிக்ஸ்';
      const compAddress = cfg.customAddress?.trim() || company.address;
      const custName = data.customer.name.endsWith('அவர்கள்') ? data.customer.name : `${data.customer.name} அவர்கள்`;
      const netDue = data.summary.netBalanceDue;
      const invocation = cfg.invocationText || '|| ஸ்ரீ சொக்கநாச்சி அம்மன் துணை ||';
      const estTitle = cfg.titleEnglish || 'ESTEEMATE';

      let msg = `🌸 *${invocation}*\n`;
      msg += `📝 *${estTitle}*\n`;
      msg += `📞 ${phones}\n`;
      msg += `🏢 *${compName}*\n`;
      if (compAddress) msg += `📍 ${compAddress}\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `👤 *திரு. ${custName}*\n`;
      if (data.customer.address) msg += `📍 ${data.customer.address}\n`;
      msg += `📅 தேதி: ${formatDate(new Date())}\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `📋 *கணக்கு விவரங்கள் (பற்று - வரவு):*\n\n`;

      const ledger = data.ledger || [];
      ledger.forEach((l, idx) => {
        const dmy = formatDate(l.date);
        if (l.type === 'order') {
          msg += `${idx + 1}. [${dmy}] *${l.description}*\n`;
          if (l.items && l.items.length > 0) {
            l.items.forEach((it) => {
              const r = it.rate || (it.total && it.quantity ? it.total / it.quantity : 0);
              msg += `   • ${it.name} - ${it.quantity}X${r} = ${Math.round(it.total).toLocaleString('en-IN')}\n`;
            });
          }
          msg += `   🔴 பற்று: +${formatCurrency(l.amount)} | பாக்கி: ${formatCurrency(l.balance)}\n\n`;
        } else if (l.type === 'payment') {
          msg += `${idx + 1}. [${dmy}] 💳 ${l.description || 'ரொக்கம் வரவு'}${l.notes ? ' (' + l.notes + ')' : ''}\n`;
          msg += `   🟢 வரவு: -${formatCurrency(l.paid)} | பாக்கி: ${formatCurrency(l.balance)}\n\n`;
        } else {
          msg += `${idx + 1}. [${dmy}] 📌 ${l.description}: +${formatCurrency(l.amount)}\n\n`;
        }
      });

      const totalDebit = ledger.filter((l) => l.type === 'order' || l.type === 'opening').reduce((s, l) => s + (l.amount || 0), 0);
      const totalCredit = ledger.reduce((s, l) => s + (l.paid || 0), 0);

      msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `📊 *மொத்த பற்று:* ${formatCurrency(totalDebit)}\n`;
      msg += `💵 *மொத்த வரவு:* ${formatCurrency(totalCredit)}\n`;
      msg += `💰 *இறுதி பாக்கி:* ${netDue > 0 ? formatCurrency(netDue) : netDue < 0 ? `+${formatCurrency(Math.abs(netDue))} (முன்பணம் வரவு)` : 'கணக்கு முடிந்தது ✅'}\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;

      const showBank = (cfg.showBankDetails !== false) && (settings?.includeBankDetails !== false);
      const activeBankAcc = settings?.bankAccounts?.find((a: any) => a.id === settings.selectedBankAccountId) || settings?.bankAccounts?.[0];
      const bankName = settings?.bankName || activeBankAcc?.bankName || template?.bankName || company?.bankName || '';
      const accountNo = settings?.accountNo || activeBankAcc?.accountNo || template?.accountNo || company?.accountNo || '';
      const ifscCode = settings?.ifscCode || activeBankAcc?.ifscCode || template?.ifscCode || company?.ifscCode || '';
      const accountHolderName = settings?.accountHolderName || activeBankAcc?.accountHolderName || template?.accountHolderName || company?.accountHolderName || '';
      const hasBankInfo = !!(bankName || accountNo || ifscCode || accountHolderName);

      if (showBank && hasBankInfo) {
        msg += `🏦 *வங்கி விவரங்கள் (Bank Details):*\n`;
        if (accountHolderName) msg += `• பெயர்: ${accountHolderName}\n`;
        if (bankName) msg += `• வங்கி: ${bankName}\n`;
        if (accountNo) msg += `• A/C எண்: ${accountNo}\n`;
        if (ifscCode) msg += `• IFSC: ${ifscCode}\n`;
        msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      }

      msg += `நன்றி! மீண்டும் வருக! 🙏\n`;
      msg += `*For ${compName}*`;
      return msg;
    }

    const isTamil = Boolean(settings?.isTamilLanguage ?? template?.isTamilLanguage);
    const isBilingual = Boolean(settings?.isBilingual ?? template?.isBilingual);
    const customTamil = (settings?.customTamilLabels || template?.customTamilLabels) as any;
    const preset = settings?.tamilTerminologyPreset || template?.tamilTerminologyPreset;
    const labels = getInvoiceLabels(isTamil, customTamil, isBilingual, preset);

    const defaultTamilTemplate = `👤 *${labels.customerDetails.toUpperCase()} - கணக்கு அறிக்கை*
*{company}*
------------------------------
*${labels.billedTo}:* {customer_name}
*${labels.phone}:* {customer_phone}
------------------------------
📊 *கணக்கு கணக்கீட்டு சுருக்கம்*
• *மொத்த ஆர்டர்கள்:* {total_orders}
• *${labels.oldBalanceDue}:* {old_balance}
• *மொத்த விற்பனை:* +{total_sales}
• *${labels.grandTotalInclDues}:* {grand_total}
• *${labels.paidAmount}:* −{total_paid}
------------------------------
💰 *${labels.balanceDue}:* {net_balance_due}
------------------------------
{ledger_summary}
------------------------------
💳 *${labels.scanToPay}:*
{upi_link}

தங்களின் மேலான ஆதரவிற்கு மிக்க நன்றி! 🙏`;

    const templateText = customTemplate || (isTamil ? (settings.customerMessageTemplate && settings.customerMessageTemplate !== DEFAULT_CUSTOMER_MESSAGE_TEMPLATE ? settings.customerMessageTemplate : defaultTamilTemplate) : (settings.customerMessageTemplate || DEFAULT_CUSTOMER_MESSAGE_TEMPLATE));
    const targetUpi = (settings.upiId || company.upiId || '').trim();
    const netDue = data.summary.netBalanceDue;
    const isPaid = (netDue || 0) <= 0;
    const custPhones = formatCustomerPhonesDisplay(data.customer.phone, data.customer.phoneNumbers);

    const payeeName = encodeURIComponent((company.name || 'Business').trim());
    const txNote = encodeURIComponent(`Statement for ${data.customer.name || 'Customer'}`.trim());
    const upiLink = !isPaid && targetUpi
      ? `upi://pay?pa=${targetUpi}&pn=${payeeName}&cu=INR&tn=${txNote}`
      : isPaid ? '✅ Account Fully Settled' : `UPI ID: ${targetUpi || 'Not set'}`;

    // Format top 5 most recent ledger entries for message summary
    const rawLedger = data.ledger || [];
    const recentLedger = [...rawLedger].sort((a, b) => {
      const da = a.date instanceof Date ? a.date : new Date(a.date);
      const db = b.date instanceof Date ? b.date : new Date(b.date);
      return db.getTime() - da.getTime();
    }).slice(0, 5);

    const ledgerLines = recentLedger.map((l) => {
      const icon = l.type === 'order' ? '🛒' : l.type === 'payment' ? '💳' : '📌';
      const noteStr = l.notes ? ` (Note: ${l.notes})` : '';
      return `${icon} ${formatDate(l.date)} - ${l.description}${noteStr}: ${l.type === 'payment' ? '-' : '+'}${formatCurrency(l.amount || l.paid || 0)}`;
    }).join('\n');

    // Format scheduled due dates
    const dueDatesLines = (data.dueDates || []).map((d) => {
      const icon = d.status === 'Completed' ? '✅' : d.status === 'Cancelled' ? '🚫' : '⏰';
      return `${icon} Due Date: ${d.date} | Status: ${d.status}${d.notes ? ' (' + d.notes + ')' : ''}`;
    }).join('\n');

    const oldBal = data.summary.oldBalanceDue || 0;
    const totalSales = data.summary.totalSalesAmount || 0;
    const grandTotal = oldBal + totalSales;

    let result = templateText
      .replace(/\{company\}/g, company.name || 'Our Business')
      .replace(/\{customer_name\}/g, data.customer.name || 'Customer')
      .replace(/\{customer_phone\}/g, custPhones || 'N/A')
      .replace(/\{customer_phones\}/g, custPhones || 'N/A')
      .replace(/\{customerPhone\}/g, custPhones || 'N/A')
      .replace(/\{customer_address\}/g, data.customer.address || 'N/A')
      .replace(/\{total_orders\}/g, String(data.summary.totalOrdersCount || 0))
      .replace(/\{total_sales\}/g, formatCurrency(totalSales))
      .replace(/\{total_paid\}/g, formatCurrency(data.summary.totalPaidAmount))
      .replace(/\{old_balance\}/g, formatCurrency(oldBal))
      .replace(/\{grand_total\}/g, formatCurrency(grandTotal))
      .replace(/\{net_balance_due\}/g, netDue < 0 ? `+${formatCurrency(Math.abs(netDue))} (Advance Credit ⭐)` : isPaid ? `${formatCurrency(0)} (Fully Settled ✅)` : formatCurrency(netDue))
      .replace(/\{due_dates\}/g, dueDatesLines || 'No scheduled due dates')
      .replace(/\{ledger_summary\}/g, ledgerLines || 'No recent ledger records');

    if (isPaid) {
      result = result
        .replace(/------------------------------\s*💳\s*\*PAYMENT VIA UPI:\*\s*\n\{upi_link\}/gi, '------------------------------\n✅ *STATUS: ACCOUNT FULLY SETTLED*')
        .replace(/💳\s*\*PAYMENT VIA UPI:\*\s*\n\{upi_link\}/gi, '✅ *STATUS: ACCOUNT FULLY SETTLED*')
        .replace(/\{upi_link\}/g, '✅ Account Fully Settled');
    } else {
      result = result.replace(/\{upi_link\}/g, upiLink);
    }

    return result;
  },

  /**
   * Share Customer Statement as Text
   */
  async shareCustomerAsText(
    data: CustomerShareData,
    company: any,
    settings: ShareSettings,
    customTemplate?: string,
    via: 'whatsapp' | 'sms' | 'copy' | 'share' = 'whatsapp',
    formatType: 'standard' | 'appa_estimate' = 'standard'
  ): Promise<boolean> {
    try {
      const text = this.formatCustomerShareText(data, company, settings, customTemplate, undefined, formatType);
      const primaryPhoneRaw = (data.customer.phoneNumbers?.[0] || data.customer.phone || '').split(/[,/|]+/)[0].trim();
      const cleanPhone = primaryPhoneRaw.replace(/[^0-9]/g, '');

      if (via === 'whatsapp') {
        const formattedPhone = cleanPhone ? (cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone) : '';
        const url = formattedPhone
          ? `whatsapp://send?phone=${formattedPhone}&text=${encodeURIComponent(text)}`
          : `whatsapp://send?text=${encodeURIComponent(text)}`;

        const canOpen = await Linking.canOpenURL(url);
        if (canOpen) {
          await Linking.openURL(url);
          return true;
        } else {
          // Fallback to web WhatsApp link
          const webUrl = formattedPhone
            ? `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(text)}`
            : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
          await Linking.openURL(webUrl);
          return true;
        }
      }

      if (via === 'sms') {
        const smsUrl = cleanPhone
          ? `sms:${cleanPhone}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(text)}`
          : `sms:?body=${encodeURIComponent(text)}`;
        await Linking.openURL(smsUrl);
        return true;
      }

      if (via === 'copy') {
        Clipboard.setString(text);
        Alert.alert('Copied ✓', 'Customer statement text copied to clipboard.');
        return true;
      }

      // Native system share
      await Share.share({ message: text, title: `Account Statement - ${data.customer.name}` });
      return true;
    } catch (err: any) {
      console.error('Share customer text error:', err);
      Alert.alert('Sharing Failed', err?.message || 'Could not share text statement.');
      return false;
    }
  },

  /**
   * Generate HTML string for Customer Account Statement PDF / Print
   */
  generateCustomerStatementHtml(
    data: CustomerShareData,
    company: any = {},
    settings: ShareSettings,
    template: InvoiceTemplate
  ): string {
    const isTamil = Boolean(settings?.isTamilLanguage ?? template?.isTamilLanguage);
    const isBilingual = Boolean(settings?.isBilingual ?? template?.isBilingual);
    const customTamil = (settings?.customTamilLabels || template?.customTamilLabels) as any;
    const preset = settings?.tamilTerminologyPreset || template?.tamilTerminologyPreset;
    const labels = getInvoiceLabels(isTamil, customTamil, isBilingual, preset);

    const accentColor = settings.themeColor || template.accentColor || '#2563EB';
    const targetUpi = (settings.upiId || company.upiId || '').trim();
    const netDue = data.summary.netBalanceDue;
    const isPaid = (netDue || 0) <= 0;
    const opts = data.options || { includeProfileInfo: true, includeDueDates: true, includeSummary: true, includeLedger: true };

    const payeeName = encodeURIComponent((company.name || 'Business').trim());
    const txNote = encodeURIComponent(`Statement for ${data.customer.name || 'Customer'}`.trim());
    const upiPayload = targetUpi
      ? `upi://pay?pa=${targetUpi}&pn=${payeeName}&cu=INR&tn=${txNote}`
      : `Customer Statement: ${data.customer.name} | Total balance due: ${netDue}`;

    const qrCodeSrc = (template.useCustomQrCode && template.customQrCodeUri)
      ? template.customQrCodeUri
      : `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(upiPayload)}`;

    const dueDatesRows = (data.dueDates || []).map((d) => `
      <div style="background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 8px; padding: 10px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <strong style="color: #B45309; font-size: 13px;">📅 Due Date: ${d.date}</strong>
          ${d.notes ? `<div style="color: #78350F; font-size: 11px; margin-top: 2px;">Note: ${d.notes}</div>` : ''}
        </div>
        <span style="padding: 4px 10px; border-radius: 12px; font-size: 10px; font-weight: 800; background: ${d.status === 'Completed' ? '#DCFCE7' : d.status === 'Cancelled' ? '#F3F4F6' : '#FEF3C7'}; color: ${d.status === 'Completed' ? '#15803D' : d.status === 'Cancelled' ? '#4B5563' : '#B45309'};">
          ${d.status.toUpperCase()}
        </span>
      </div>
    `).join('');

    const ledgerRows = (data.ledger || []).map((l, idx) => {
      const creditVal = l.type === 'payment' ? (l.paid || l.amount || 0) : (l.paid || 0);
      const debitVal = l.type === 'payment' ? 0 : (l.amount || 0);

      return `
        <tr style="background: ${idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'};">
          <td style="padding: 10px; border-bottom: 1px solid #E2E8F0; font-size: 12px; color: #475569; vertical-align: top;">${formatDate(l.date)}</td>
          <td style="padding: 10px; border-bottom: 1px solid #E2E8F0; font-size: 12px; font-weight: 600; color: #0F172A; vertical-align: top;">
            <div>${l.description}</div>
            ${l.notes ? `<div style="font-size: 10px; color: #64748B; font-weight: 400; font-style: italic; margin-top: 2px;">📝 Note: ${l.notes}</div>` : ''}
          </td>
          <td style="padding: 10px; border-bottom: 1px solid #E2E8F0; font-size: 12px; text-align: center; vertical-align: top;">
            <span style="padding: 3px 8px; border-radius: 12px; font-size: 10px; font-weight: 700; background: ${l.type === 'order' ? '#EFF6FF' : l.type === 'payment' ? '#ECFDF5' : '#FFFBEB'}; color: ${l.type === 'order' ? '#2563EB' : l.type === 'payment' ? '#059669' : '#D97706'};">
              ${l.type.toUpperCase()}
            </span>
          </td>
          <td style="padding: 10px; border-bottom: 1px solid #E2E8F0; font-size: 12px; text-align: ${debitVal > 0 ? 'right' : 'center'}; color: ${debitVal > 0 ? '#0F172A' : '#94A3B8'}; vertical-align: top;">${debitVal > 0 ? formatCurrency(debitVal) : '—'}</td>
          <td style="padding: 10px; border-bottom: 1px solid #E2E8F0; font-size: 12px; text-align: ${creditVal > 0 ? 'right' : 'center'}; font-weight: 700; color: ${creditVal > 0 ? '#059669' : '#94A3B8'}; vertical-align: top;">${creditVal > 0 ? formatCurrency(creditVal) : '—'}</td>
          <td style="padding: 10px; border-bottom: 1px solid #E2E8F0; font-size: 12px; text-align: right; font-weight: 700; color: ${l.balance > 0 ? '#DC2626' : '#059669'}; vertical-align: top;">${l.balance < 0 ? `Adv: ${formatCurrency(Math.abs(l.balance))}` : formatCurrency(l.balance)}</td>
        </tr>
      `;
    }).join('');

    const showLogo = settings.includeLogo !== false;
    const showCompanyDetails = settings.includeCompanyDetails !== false;
    const showGst = settings.includeGst !== false;
    const showSignature = settings.includeSignature !== false;
    const payMode = settings.paymentDisplayMode || 'BOTH';

    // Do not show QR code or Bank details if the customer is fully paid (net balance due <= 0)
    const showQr = settings.includeQrCode !== false && payMode !== 'NONE' && payMode !== 'BANK' && !isPaid;
    const showBank = (payMode === 'BANK' || payMode === 'BOTH' || settings.includeBankDetails) && payMode !== 'NONE' && payMode !== 'QR' && !isPaid;

    const bankName = settings.bankName || company.bankName || '';
    const accountNo = settings.accountNo || company.accountNo || '';
    const ifscCode = settings.ifscCode || company.ifscCode || '';
    const accountHolderName = settings.accountHolderName || company.accountHolderName || company.name || '';
    const hasBankInfo = !!(bankName || accountNo || ifscCode || accountHolderName);

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Customer Statement - ${data.customer.name}</title>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #334155; margin: 0; padding: 24px; background: #FFFFFF; }
          .header-box { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid ${accentColor}; padding-bottom: 16px; margin-bottom: 20px; }
          .brand-title { font-size: 24px; font-weight: 800; color: ${accentColor}; margin: 0; }
          .brand-sub { font-size: 12px; color: #64748B; margin-top: 4px; }
          .badge-statement { background: ${accentColor}; color: #FFFFFF; padding: 6px 14px; borderRadius: 20px; font-size: 11px; font-weight: 800; letter-spacing: 0.5px; }
          
          .grid-two { display: flex; justify-content: space-between; gap: 20px; margin-bottom: 24px; }
          .card-info { flex: 1; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 14px; }
          .info-title { font-size: 11px; font-weight: 800; color: #64748B; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.5px; }
          .info-name { font-size: 16px; font-weight: 700; color: #0F172A; margin: 0 0 4px 0; }
          .info-text { font-size: 12px; color: #475569; margin: 2px 0; }

          table { width: 100%; border-collapse: collapse; margin-bottom: 24px; border-radius: 8px; overflow: hidden; }
          th { background: #0F172A; color: #FFFFFF; font-size: 11px; font-weight: 700; text-align: left; padding: 10px; text-transform: uppercase; }

          .footer-box { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #E2E8F0; padding-top: 16px; margin-top: 20px; gap: 16px; }
          .qr-box { text-align: center; }
          .qr-img { width: 85px; height: 85px; border-radius: 8px; border: 1px solid #CBD5E1; }
          .bank-box { flex: 1; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 10px; font-size: 11px; }
          .signature-box { text-align: right; margin-left: auto; }
          .sig-line { width: 140px; border-bottom: 1px solid #94A3B8; margin-top: 35px; }
        </style>
      </head>
      <body>
        <div class="header-box" style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 14px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 12px;">
            ${showLogo ? (
              company.logoUrl
                ? `<img src="${company.logoUrl}" style="max-height: 48px; border-radius: 8px;" />`
                : `<div style="width: 44px; height: 44px; border-radius: 10px; background: ${accentColor}; color: #FFF; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 800;">${(company.name || 'B').charAt(0).toUpperCase()}</div>`
            ) : ''}
            <div>
              <h1 class="brand-title" style="font-size: 18px; font-weight: 800; color: #0F172A; margin: 0;">${company.name || 'Company Name'}</h1>
              ${showCompanyDetails ? `<div class="brand-sub" style="font-size: 11px; color: #64748B; margin-top: 2px;">${company.phone ? '📞 ' + company.phone : ''} ${company.phone && company.address ? ' • ' : ''} ${company.address ? '📍 ' + company.address : ''} ${showGst && company.gstin ? ' • 🏷️ GSTIN: ' + company.gstin : ''}</div>` : ''}
            </div>
          </div>
          <div style="text-align: right;">
            <div class="badge-statement" style="background: ${accentColor}; color: #FFFFFF; padding: 6px 14px; border-radius: 20px; font-size: 11px; font-weight: 800; letter-spacing: 0.5px; display: inline-block;">${isBilingual ? 'ACCOUNT STATEMENT / கணக்கு அறிக்கை' : isTamil ? 'கணக்கு அறிக்கை' : 'ACCOUNT STATEMENT'}</div>
            <div style="font-size: 11px; color: #64748B; margin-top: 6px; font-weight: 600;">📅 ${labels.invoiceDate}: ${formatDate(new Date())}</div>
          </div>
        </div>

        ${opts.includeProfileInfo !== false ? `
          <div class="grid-two">
            <div class="card-info">
              <div class="info-title">${isTamil ? labels.customerDetails : 'Statement For (Client Profile)'}</div>
              <div class="info-name">${data.customer.name.endsWith('அவர்கள்') ? `${data.customer.name.replace(/\s+அவர்கள்$/, '')} <span style="font-size: 11px; font-weight: 500; color: #64748B;">அவர்கள்</span>` : data.customer.name} ${data.customer.isSpecial ? '⭐ (Special Client)' : ''}</div>
              ${formatCustomerPhonesDisplay(data.customer.phone, data.customer.phoneNumbers) ? `<div class="info-text">📞 ${labels.phone}: ${formatCustomerPhonesDisplay(data.customer.phone, data.customer.phoneNumbers)}</div>` : ''}
              ${data.customer.address ? `<div class="info-text">📍 ${labels.address}: ${data.customer.address}</div>` : ''}
              ${showGst && data.customer.gstin ? `<div class="info-text">🏷️ GSTIN: ${data.customer.gstin}</div>` : ''}
            </div>
          </div>
        ` : ''}

        ${opts.includeDueDates !== false && data.dueDates && data.dueDates.length > 0 ? `
          <div style="margin-bottom: 24px;">
            <div class="info-title">${isTamil ? 'நிலுவை தேதி அட்டவணை' : 'Scheduled Payment Due Dates'}</div>
            ${dueDatesRows}
          </div>
        ` : ''}

        ${opts.includeSummary !== false ? `
          <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
            <div class="info-title" style="color: ${accentColor}; margin-bottom: 12px;">📊 ${isBilingual ? 'ACCOUNT CALCULATION SUMMARY / கணக்கு கணக்கீட்டு சுருக்கம்' : isTamil ? 'கணக்கு கணக்கீட்டு சுருக்கம்' : 'Account Calculation Summary'}</div>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 0;">
              <tr style="border-bottom: 1px solid #E2E8F0;">
                <td style="padding: 6px 0; font-size: 13px; color: #64748B;">${isTamil ? 'மொத்த ஆர்டர்கள்' : 'Total Orders'}</td>
                <td style="padding: 6px 0; font-size: 13px; font-weight: 700; text-align: right; color: #0F172A;">${data.summary.totalOrdersCount}</td>
              </tr>
              ${data.summary.oldBalanceDue > 0 ? `
                <tr style="border-bottom: 1px solid #E2E8F0;">
                  <td style="padding: 6px 0; font-size: 13px; color: #DC2626; font-weight: 700;">${labels.oldBalanceDue}</td>
                  <td style="padding: 6px 0; font-size: 13px; font-weight: 800; text-align: right; color: #DC2626;">+ ${formatCurrency(data.summary.oldBalanceDue)}</td>
                </tr>
              ` : ''}
              <tr style="border-bottom: 1px solid #E2E8F0;">
                <td style="padding: 6px 0; font-size: 13px; color: #0F172A;">${isTamil ? 'மொத்த விற்பனை / ஆர்டர்கள்' : 'Total Sales / Order Amount'}</td>
                <td style="padding: 6px 0; font-size: 13px; font-weight: 700; text-align: right; color: #0F172A;">+ ${formatCurrency(data.summary.totalSalesAmount)}</td>
              </tr>
              <tr style="border-bottom: 2px solid ${accentColor};">
                <td style="padding: 8px 0; font-size: 14px; font-weight: 800; color: ${accentColor};">${labels.grandTotalInclDues}</td>
                <td style="padding: 8px 0; font-size: 15px; font-weight: 900; text-align: right; color: ${accentColor};">${formatCurrency((data.summary.oldBalanceDue || 0) + (data.summary.totalSalesAmount || 0))}</td>
              </tr>
              <tr style="border-bottom: 1px solid #E2E8F0;">
                <td style="padding: 6px 0; font-size: 13px; color: #059669; font-weight: 700;">${labels.paidAmount} (−)</td>
                <td style="padding: 6px 0; font-size: 13px; font-weight: 800; text-align: right; color: #059669;">− ${formatCurrency(data.summary.totalPaidAmount)}</td>
              </tr>
              <tr style="border-bottom: 3px solid ${netDue > 0 ? '#DC2626' : '#059669'};">
                <td style="padding: 10px 0; font-size: 15px; font-weight: 900; color: ${netDue > 0 ? '#DC2626' : '#059669'};">${netDue > 0 ? `💰 ${labels.balanceDue}` : netDue < 0 ? (isTamil ? '⭐ வாடிக்கையாளர் முன்பணம்' : '⭐ Customer Advance Credit') : (isTamil ? '✅ முழுமையாக செலுத்தப்பட்டது' : '✅ Account Fully Settled')}</td>
                <td style="padding: 10px 0; font-size: 18px; font-weight: 900; text-align: right; color: ${netDue > 0 ? '#DC2626' : '#059669'};">${netDue < 0 ? `+ ${formatCurrency(Math.abs(netDue))}` : formatCurrency(Math.abs(netDue))}</td>
              </tr>
            </table>
          </div>
        ` : ''}

        ${opts.includeLedger !== false ? `
          <div class="info-title">${isTamil ? `முழு அறிக்கை விவரங்கள் (${(data.ledger || []).length} பதிவுகள்)` : `Complete Statement Ledger (${(data.ledger || []).length} entries)`}</div>
          <table>
            <thead>
              <tr>
                <th>${labels.invoiceDate}</th>
                <th>${labels.itemsAndDescription}</th>
                <th style="text-align: center;">${labels.paymentMode}</th>
                <th style="text-align: right;">${labels.total} (+)</th>
                <th style="text-align: right;">${labels.paidAmount} (-)</th>
                <th style="text-align: right;">${labels.balanceDue}</th>
              </tr>
            </thead>
            <tbody>
              ${ledgerRows}
            </tbody>
            <tfoot>
              <tr style="background: #F1F5F9; border-top: 2px solid ${accentColor}; font-weight: 800;">
                <td colspan="3" style="padding: 10px; font-size: 12px; color: ${accentColor}; font-weight: 900;">${labels.total}</td>
                <td style="padding: 10px; font-size: 12px; text-align: right; color: #0F172A;">${formatCurrency((data.ledger || []).filter(l => l.type === 'order' || l.type === 'opening').reduce((s, l) => s + (l.amount || 0), 0))}</td>
                <td style="padding: 10px; font-size: 12px; text-align: right; color: #059669;">${formatCurrency((data.ledger || []).reduce((s, l) => s + (l.paid || 0), 0))}</td>
                <td style="padding: 10px; font-size: 13px; text-align: right; color: ${netDue > 0 ? '#DC2626' : '#059669'}; font-weight: 900;">${netDue < 0 ? `${isTamil ? 'முன்பணம்' : 'Adv'}: ${formatCurrency(Math.abs(netDue))}` : formatCurrency(netDue)}</td>
              </tr>
            </tfoot>
          </table>
        ` : ''}

        <div class="footer-box">
          ${showQr ? `
            <div class="qr-box">
              <img src="${qrCodeSrc}" class="qr-img" />
              <div style="font-size: 10px; color: #64748B; margin-top: 4px; font-weight: 600;">${labels.scanToPay}</div>
            </div>
          ` : ''}

          ${showBank && hasBankInfo ? `
            <div class="bank-box">
              <strong style="color: ${accentColor}; display: block; margin-bottom: 4px; text-transform: uppercase;">🏦 ${labels.bankPaymentDetails}</strong>
              ${accountHolderName ? `<div><strong>${labels.accountHolder}:</strong> ${accountHolderName}</div>` : ''}
              ${bankName ? `<div><strong>${labels.bankName}:</strong> ${bankName}</div>` : ''}
              ${accountNo ? `<div><strong>${labels.accountNo}:</strong> ${accountNo}</div>` : ''}
              ${ifscCode ? `<div><strong>${labels.ifscCode}:</strong> ${ifscCode}</div>` : ''}
            </div>
          ` : ''}

          ${showSignature ? `
            <div class="signature-box">
              ${company.signatureUrl ? `<img src="${company.signatureUrl}" style="max-height: 40px; margin-bottom: 4px;" />` : '<div class="sig-line"></div>'}
              <div style="font-size: 11px; color: #64748B; font-weight: 600;">${settings.signatureTitle || labels.authorizedSignatory}</div>
            </div>
          ` : ''}
        </div>
      </body>
      </html>
    `;
  },

  /**
   * Generate HTML for Traditional Appa Estimate Bill Slip
   */
  generateAppaEstimateHtml(
    data: CustomerShareData,
    company: any = {},
    settings: ShareSettings,
    template: InvoiceTemplate,
    billNo: string = '1',
    billTheme: string = 'classic',
    customAppaSettings?: Partial<AppaEstimateBillSettings>
  ): string {
    const cfg: AppaEstimateBillSettings = {
      ...DEFAULT_APPA_ESTIMATE_BILL_SETTINGS,
      ...(template?.appaBillSettings || {}),
      ...(customAppaSettings || {}),
    };

    let companyPhonesList: string[] = [];
    if (cfg.phoneNumbers && Array.isArray(cfg.phoneNumbers) && cfg.phoneNumbers.some((p) => p.trim())) {
      companyPhonesList = cfg.phoneNumbers.map((p) => p.trim()).filter(Boolean);
    } else if (cfg.customPhones?.trim()) {
      companyPhonesList = cfg.customPhones.split(/[•,]/).map((p) => p.trim()).filter(Boolean);
    } else {
      const rawCompanyPhone = company.phone || '99430 51509';
      const altPhone = company.alternatePhone || '99430 51209';
      companyPhonesList = [rawCompanyPhone, altPhone].filter(Boolean);
    }
    const companyPhones = companyPhonesList.join(' • ');

    const companyName = cfg.customCompanyName?.trim() || company.name || 'அம்மன் ஹாலோ பிரிக்ஸ்';
    const companyAddress = cfg.customAddress?.trim() || company.address || '11, கரூர் மெயின் ரோடு, வெங்கமேடு, தளவாபாளையம், Po. புகழூர் D.T - 638153';

    const customerName = data.customer.name || 'வாடிக்கையாளர்';
    const customerAddress = data.customer.address || '';
    const customerPhones = formatCustomerPhonesDisplay(data.customer.phone, data.customer.phoneNumbers);

    const effectiveInvocation = cfg.invocationText || '|| ஸ்ரீ சொக்கநாச்சி அம்மன் துணை ||';
    const titleEnglish = cfg.titleEnglish || 'ESTEEMATE';
    const titleTamil = cfg.titleTamil || 'மதிப்பீட்டு பில் / ESTIMATE BILL';


    const ledger = data.ledger || [];
    const totalDebit = ledger
      .filter((l) => l.type === 'order' || l.type === 'opening')
      .reduce((sum, l) => sum + (l.amount || 0), 0);
    const totalCredit = ledger.reduce((sum, l) => sum + (l.paid || 0), 0);
    const netDue = data.summary.netBalanceDue;
    const isPaid = (netDue || 0) <= 0;

    const themePalettes: Record<string, any> = {
      classic: { paperBg: '#F6F2E5', cardBg: '#FFFDF7', inkColor: '#0F2942', subTextColor: '#475569', lineColor: '#0F2942', gridLineColor: '#2563EB44', highlightColor: '#B91C1C', headerBg: '#EFE7D0', totalRowBg: '#E9E0C4', stampColor: '#B91C1C', dueBg: '#FEE2E2', dueColor: '#B91C1C' },
      blue: { paperBg: '#F1F5F9', cardBg: '#FFFFFF', inkColor: '#1E3A8A', subTextColor: '#3B82F6', lineColor: '#1E3A8A', gridLineColor: '#3B82F644', highlightColor: '#DC2626', headerBg: '#DBEAFE', totalRowBg: '#BFDBFE', stampColor: '#1D4ED8', dueBg: '#FEF2F2', dueColor: '#DC2626' },
      sepia: { paperBg: '#F2E8D5', cardBg: '#FAF3E3', inkColor: '#451A03', subTextColor: '#78350F', lineColor: '#451A03', gridLineColor: '#92400E44', highlightColor: '#991B1B', headerBg: '#E7D8BC', totalRowBg: '#DECBA9', stampColor: '#991B1B', dueBg: '#FEE2E2', dueColor: '#991B1B' },
      emerald: { paperBg: '#ECFDF5', cardBg: '#F7FEFA', inkColor: '#064E3B', subTextColor: '#047857', lineColor: '#064E3B', gridLineColor: '#05966944', highlightColor: '#B91C1C', headerBg: '#D1FAE5', totalRowBg: '#A7F3D0', stampColor: '#047857', dueBg: '#FEF2F2', dueColor: '#DC2626' },
      dark: { paperBg: '#090D16', cardBg: '#0F172A', inkColor: '#F8FAFC', subTextColor: '#94A3B8', lineColor: '#64748B', gridLineColor: '#334155', highlightColor: '#F87171', headerBg: '#1E293B', totalRowBg: '#334155', stampColor: '#38BDF8', dueBg: '#450A0A', dueColor: '#FCA5A5' },
    };

    const t = themePalettes[billTheme] || themePalettes.classic;

    const nameStr = customerName || '';
    const nameHasAvargal = nameStr.endsWith('அவர்கள்');
    const mainCustomerName = nameHasAvargal ? nameStr.replace(/\s*அவர்கள்$/, '').trim() : nameStr;
    const honorificColor = cfg.customerHonorificColor || t.subTextColor;
    const honorificSize = cfg.customerHonorificFontSize || 12;
    const customerNameHtml = nameHasAvargal
      ? `${mainCustomerName} <span class="customer-avargal" style="font-size: ${honorificSize}px; font-weight: 700; color: ${honorificColor}; margin-left: 3px;">அவர்கள்</span>`
      : mainCustomerName;
    const todayDate = formatDate(new Date());
    const invocationColor = cfg.invocationColor || t.highlightColor;

    // QR code setup
    const showQr = (cfg.showQrCode !== false) && settings?.includeQrCode !== false && !isPaid;
    const targetUpi = (settings?.upiId || company?.upiId || '').trim();
    const payeeName = encodeURIComponent((company?.name || 'Business').trim());
    const txNote = encodeURIComponent(`Bill for ${customerName}`.trim());
    const upiPayload = targetUpi
      ? `upi://pay?pa=${targetUpi}&pn=${payeeName}&cu=INR&tn=${txNote}`
      : `Customer Statement: ${customerName} | Balance: ${netDue}`;
    const qrSrc = (template?.useCustomQrCode && template?.customQrCodeUri)
      ? template.customQrCodeUri
      : `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(upiPayload)}`;

    // Bank Details setup
    const showBank = (cfg.showBankDetails !== false) && (settings?.includeBankDetails !== false);
    const activeBankAcc = settings?.bankAccounts?.find((a: any) => a.id === settings.selectedBankAccountId) || settings?.bankAccounts?.[0];
    const bankName = settings?.bankName || activeBankAcc?.bankName || template?.bankName || company?.bankName || '';
    const accountNo = settings?.accountNo || activeBankAcc?.accountNo || template?.accountNo || company?.accountNo || '';
    const ifscCode = settings?.ifscCode || activeBankAcc?.ifscCode || template?.ifscCode || company?.ifscCode || '';
    const accountHolderName = settings?.accountHolderName || activeBankAcc?.accountHolderName || template?.accountHolderName || company?.accountHolderName || '';
    const hasBankInfo = !!(bankName || accountNo || ifscCode || accountHolderName);

    // Signature image URI
    const effectiveSignatureUri = cfg.signatureImageUri || (template as any)?.signatureImageUri || company?.signatureUrl || '';

    // Company Logo setup (top-left)
    const effectiveLogoUri = cfg.companyLogoUri || company?.logoUrl || '';
    const showLogo = (cfg.showCompanyLogo !== false) && Boolean(effectiveLogoUri);

    const rowsHtml = ledger.map((item, index) => {
      const isOrder = item.type === 'order';
      const isPayment = item.type === 'payment';
      const isOpening = item.type === 'opening';

      const d = item.date instanceof Date ? item.date : new Date(item.date);
      const dmy = !isNaN(d.getTime()) ? `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getFullYear()).slice(-2)}` : '';

      const debitVal = (isOrder || isOpening) ? item.amount : 0;
      const creditVal = isPayment ? item.paid : 0;

      let particulars = '';
      if (isOpening) {
        particulars = `<span style="color: ${t.highlightColor}; font-weight: 800;">முந்தைய பாக்கி (Old Balance)</span>`;
      } else if (isPayment) {
        particulars = `<span style="color: #047857; font-weight: 800;">💳 ${item.description || 'ரொக்கம் வரவு'}</span>${item.notes ? ` <span style="font-size: 11px; color: ${t.subTextColor}; font-style: italic;">(${item.notes})</span>` : ''}`;
      } else {
        if (item.items && item.items.length > 0) {
          particulars = item.items.map(it => {
            const r = it.rate || (it.total && it.quantity ? it.total / it.quantity : 0);
            return `<div>• <strong>${it.name}</strong> - ${it.quantity}X${r} = <strong>${Math.round(it.total).toLocaleString('en-IN')}</strong></div>`;
          }).join('');
        } else {
          particulars = `<strong>${item.description || 'ஆர்டர் விபரம்'}</strong>`;
        }
        const extras: string[] = [];
        if (item.shipmentCharge) extras.push(`வண்டி வாடகை: ₹${Number(item.shipmentCharge).toLocaleString('en-IN')}`);
        if (item.loadingCharge) extras.push(`ஏற்று கூலி: ₹${Number(item.loadingCharge).toLocaleString('en-IN')}`);
        if (item.unloadingCharge) extras.push(`இறக்கு கூலி: ₹${Number(item.unloadingCharge).toLocaleString('en-IN')}`);
        if (item.extraAmount) extras.push(`கூடுதல்: ₹${Number(item.extraAmount).toLocaleString('en-IN')}`);
        if (item.notes) extras.push(item.notes);
        if (extras.length > 0) {
          particulars += extras.map(e => `<div style="font-size: 10px; color: ${t.subTextColor}; margin-top: 2px;">• ${e}</div>`).join('');
        }
      }

      return `
        <tr style="border-bottom: 1px solid ${t.gridLineColor}; font-size: 12px; ${index % 2 === 1 ? `background-color: ${t.headerBg}30;` : ''}">
          <td style="padding: 7px 4px; text-align: center; border-right: 1px solid ${t.gridLineColor}; font-weight: 700;">${index + 1}</td>
          <td style="padding: 7px 4px; text-align: center; border-right: 1px solid ${t.gridLineColor}; white-space: nowrap; font-size: 11px;">${dmy}</td>
          <td style="padding: 7px 8px; border-right: 1px solid ${t.gridLineColor};">${particulars}</td>
          <td style="padding: 7px 6px; text-align: right; border-right: 1px solid ${t.gridLineColor}; color: ${debitVal ? '#64748B' : t.subTextColor}; font-weight: ${debitVal ? '700' : '400'};">${debitVal ? formatCurrency(debitVal) : '-'}</td>
          <td style="padding: 7px 6px; text-align: right; border-right: 1px solid ${t.gridLineColor}; color: ${creditVal ? '#047857' : t.subTextColor}; font-weight: ${creditVal ? '800' : '400'};">${creditVal ? formatCurrency(creditVal) : '-'}</td>
          <td style="padding: 7px 6px; text-align: right; color: ${item.balance ? t.highlightColor : t.inkColor}; font-weight: 700;">${item.balance !== undefined ? formatCurrency(item.balance) : '-'}</td>
        </tr>
      `;
    }).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>ESTEEMATE - ${customerName}</title>
        <style>
          @page { size: A4; margin: 12mm; }
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: ${t.inkColor}; margin: 0; padding: 10px; background: #FFFFFF; }
          .outer-frame { border: 2.5px solid ${t.lineColor}; border-radius: 8px; padding: 3px; background: ${t.paperBg}; }
          .top-bar { position: relative; text-align: center; margin-bottom: 6px; min-height: 24px; }
          .top-logo { position: absolute; left: 0; top: 0; }
          .logo-img { max-width: 75px; max-height: 68px; object-fit: contain; border-radius: 6px; }
          .invocation { color: ${invocationColor}; font-weight: 900; font-size: ${cfg.invocationFontSize || 15}px; letter-spacing: 0.6px; display: inline-block; }
          .top-phones { position: absolute; right: 0; top: 0; font-size: 13px; font-weight: 800; color: ${t.inkColor}; text-align: right; }
          .company-name { font-size: ${cfg.companyNameFontSize || 21}px; font-weight: 900; color: ${cfg.companyNameColor || t.inkColor}; margin: 0 0 2px 0; }
          .company-address { font-size: ${cfg.companyAddressFontSize || 12}px; color: ${cfg.companyAddressColor || t.subTextColor}; line-height: 1.4; }
          .title-row { margin-bottom: 8px; text-align: center; }
          .estimate-title { font-size: ${cfg.titleEnglishFontSize || 30}px; font-weight: 900; letter-spacing: 2px; color: ${cfg.titleEnglishColor || t.inkColor}; margin: 0; line-height: 1; text-align: center; }
          .estimate-sub { font-size: ${cfg.titleTamilFontSize || 11}px; font-weight: 700; color: ${cfg.titleTamilColor || t.subTextColor}; margin-top: 2px; text-align: center; }
          .stamp-badge { border: 2px dashed ${t.stampColor}; border-radius: 6px; padding: 4px 10px; text-align: center; transform: rotate(-3deg); }
          .stamp-title { font-size: 13px; font-weight: 900; color: ${t.stampColor}; letter-spacing: 1px; }
          .stamp-sub { font-size: 9px; font-weight: 800; color: ${t.stampColor}; }
          .meta-row { display: flex; justify-content: space-between; border-top: 1px solid ${t.lineColor}; border-bottom: 1px solid ${t.lineColor}; padding: 6px 8px; margin-bottom: 10px; font-size: 13px; font-weight: 800; background: ${t.headerBg}40; border-radius: 4px; }
          .customer-box { border-bottom: 1px solid ${t.gridLineColor}; padding-bottom: 8px; margin-bottom: 12px; font-size: 13px; }
          .customer-name { font-size: 16px; font-weight: 900; color: ${t.inkColor}; }
          table { width: 100%; border-collapse: collapse; border: 1.5px solid ${t.lineColor}; margin-bottom: 8px; border-radius: 4px; overflow: hidden; }
          th { background: ${t.headerBg}; color: ${t.inkColor}; font-size: 12px; font-weight: 900; padding: 8px 4px; border-bottom: 1.5px solid ${t.lineColor}; border-right: 1px solid ${t.lineColor}; text-align: center; }
          th:last-child { border-right: none; }
          .total-row { background: ${t.totalRowBg}; font-weight: 900; border-top: 1.5px solid ${t.lineColor}; font-size: 13px; }
          .total-row td { padding: 8px 6px; border-right: 1px solid ${t.lineColor}; }
          .total-row td:last-child { border-right: none; }
          .double-line { border-top: 1px solid ${t.lineColor}; border-bottom: 1px solid ${t.lineColor}; height: 3px; margin: 2px 0 8px 0; }
          .net-due-box { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; border-radius: 6px; margin-bottom: 16px; font-size: 15px; font-weight: 900; background: ${netDue > 0 ? t.dueBg : '#ECFDF5'}; color: ${netDue > 0 ? t.dueColor : '#047857'}; border: 1.5px solid ${netDue > 0 ? t.dueColor : '#10B981'}; }
          .footer-box { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 14px; }
          .footer-note { font-size: 11.5px; font-weight: 700; }
          .payment-row { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 8px; flex-wrap: wrap; }
          .qr-block { display: flex; align-items: center; gap: 10px; border: 1px solid ${t.lineColor}; border-radius: 6px; padding: 6px 10px; background: ${t.headerBg}30; width: fit-content; }
          .bank-block { border: 1px solid ${t.lineColor}; border-radius: 6px; padding: 6px 10px; background: ${t.headerBg}30; min-width: 170px; max-width: 240px; }
          .bank-title { font-size: 10px; font-weight: 800; color: ${t.highlightColor}; margin-bottom: 2px; }
          .bank-row { font-size: 9px; line-height: 13px; color: ${t.inkColor}; }
          .qr-img { width: 55px; height: 55px; border-radius: 4px; }
          .seal-box { text-align: center; padding: 6px 10px; min-width: 140px; }

          .sig-line { width: 120px; border-bottom: 1px solid ${t.lineColor}; margin: 0 auto 3px auto; }
          .sig-label { font-size: 10px; font-weight: 800; color: ${t.inkColor}; }
        </style>
      </head>
      <body>
        <div class="outer-frame">
          <div class="inner-frame">
            <div class="top-bar">
              ${showLogo && effectiveLogoUri ? `
                <div class="top-logo">
                  <img src="${effectiveLogoUri}" class="logo-img" />
                </div>
              ` : ''}
              <div class="invocation">${effectiveInvocation}</div>
              <div class="top-phones">
                ${companyPhonesList.map((p, idx) => `<div>${idx === 0 ? '📞 ' : ''}${p}</div>`).join('')}
              </div>
            </div>
            <div class="company-block">
              <div class="company-name">${companyName}</div>
              <div class="company-address">${companyAddress}</div>
            </div>
            <div class="title-row">
              <div class="estimate-title">${titleEnglish}</div>
              <div class="estimate-sub">${titleTamil}</div>
            </div>
            <div class="meta-row" style="justify-content: flex-end;">
              <div>தேதி: ${todayDate}</div>
            </div>
            <div class="customer-box">
              <div class="customer-name">${customerNameHtml}</div>
              ${customerAddress ? `<div style="margin-top: 3px; color: ${t.subTextColor};">📍 ${customerAddress}</div>` : ''}
              ${customerPhones ? `<div style="margin-top: 3px; color: ${t.subTextColor};">📱 ${customerPhones}</div>` : ''}
            </div>
            <table>
              <thead>
                <tr>
                  <th style="width: 40px;">${cfg.columnLabels?.sno || 'வ. எண்'}<br/><span style="font-size: 9px; font-weight: normal;">S.No</span></th>
                  <th style="width: 70px;">${cfg.columnLabels?.date || 'தேதி'}<br/><span style="font-size: 9px; font-weight: normal;">Date</span></th>
                  <th>${cfg.columnLabels?.description || 'விபரம் (பொருட்கள் / கூலி விவரம்)'}<br/><span style="font-size: 9px; font-weight: normal;">Particulars</span></th>
                  <th style="width: 85px;">${cfg.columnLabels?.debit || 'பற்று (+)'}<br/><span style="font-size: 9px; font-weight: normal; color: #64748B;">Debit</span></th>
                  <th style="width: 85px;">${cfg.columnLabels?.credit || 'வரவு (-)'}<br/><span style="font-size: 9px; font-weight: normal; color: #047857;">Credit</span></th>
                  <th style="width: 80px;">${cfg.columnLabels?.balance || 'பாக்கி'}<br/><span style="font-size: 9px; font-weight: normal; color: ${t.highlightColor};">Balance</span></th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
                <tr class="total-row">
                  <td colspan="3" style="text-align: center;">மொத்தம் (ACCOUNT TOTALS)</td>
                  <td style="text-align: right; color: #64748B; font-weight: 800;">${formatCurrency(totalDebit)}</td>
                  <td style="text-align: right; color: #047857;">${formatCurrency(totalCredit)}</td>
                  <td style="text-align: right; color: ${t.highlightColor}; font-weight: 900;">${formatCurrency(netDue)}</td>
                </tr>
              </tbody>
            </table>

            <div class="double-line"></div>

            <div class="net-due-box">
              <div>
                <div>${netDue > 0 ? 'இறுதி பாக்கி (NET BALANCE DUE):' : netDue < 0 ? 'முன்பணம் வரவு (CUSTOMER ADVANCE):' : 'கணக்கு முடிந்தது (SETTLED):'}</div>
              </div>
              <div style="font-size: 20px;">${formatCurrency(Math.abs(netDue))}</div>
            </div>

            <div class="footer-box">
              <div style="flex: 1;">
                ${(showQr && targetUpi) || (showBank && hasBankInfo) ? `
                  <div class="payment-row">
                    ${showQr && targetUpi ? `
                      <div class="qr-block">
                        <img src="${qrSrc}" class="qr-img" />
                        <div>
                          <div style="font-size: 11px; font-weight: 800;">GPay / PhonePe / UPI</div>
                          <div style="font-size: 10px; color: ${t.subTextColor};">${targetUpi}</div>
                          <div style="font-size: 10px; font-weight: 800; color: ${t.highlightColor}; margin-top: 2px;">ஸ்கேன் செய்து கட்டவும் ↗</div>
                        </div>
                      </div>
                    ` : ''}
                    ${showBank && hasBankInfo ? `
                      <div class="bank-block">
                        <div class="bank-title">🏦 வங்கி விவரங்கள் (Bank Details)</div>
                        ${accountHolderName ? `<div class="bank-row">பெயர்: <strong>${accountHolderName}</strong></div>` : ''}
                        ${bankName ? `<div class="bank-row">வங்கி: <strong>${bankName}</strong></div>` : ''}
                        ${accountNo ? `<div class="bank-row">A/C எண்: <strong style="letter-spacing: 0.5px;">${accountNo}</strong></div>` : ''}
                        ${ifscCode ? `<div class="bank-row">IFSC: <strong style="letter-spacing: 0.5px;">${ifscCode}</strong></div>` : ''}
                      </div>
                    ` : ''}
                  </div>
                ` : ''}
                ${cfg.showGoodsAcknowledgment !== false ? (
                  cfg.footerNotes ? (
                    cfg.footerNotes.split('\n').filter(Boolean).map(line =>
                      `<div class="footer-note" style="margin-bottom: 2px;">${line.trim().startsWith('•') ? line.trim() : `• ${line.trim()}`}</div>`
                    ).join('')
                  ) : `
                    <div class="footer-note">• சரக்குகள் சரியான முறையில் கிடைக்கப்பெற்றது.</div>
                    <div class="footer-note" style="color: ${t.subTextColor};">• தங்களின் மேலான ஆதரவிற்கு மிக்க நன்றி! மீண்டும் வருக!</div>
                  `
                ) : ''}
              </div>
              <div class="seal-box">

                ${effectiveSignatureUri ? `
                  <div style="text-align: center; margin-bottom: 2px;">
                    <img src="${effectiveSignatureUri}" style="max-height: 44px; max-width: 130px; object-fit: contain;" />
                  </div>
                ` : ''}
                <div class="sig-line"></div>
                <div class="sig-label">${cfg.signatoryText || 'அங்கீகரிக்கப்பட்ட கையொப்பம்'}</div>
                <div style="font-size: 8.5px; color: ${t.subTextColor};">Authorized Signatory</div>
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  },

  /**
   * Share Customer Account Statement as PDF
   */
  async shareCustomerAsPdf(
    data: CustomerShareData,
    company: any,
    settings: ShareSettings,
    template: InvoiceTemplate,
    formatType: 'standard' | 'appa_estimate' = 'standard',
    billTheme: string = 'classic',
    billNo: string = '1',
    customAppaSettings?: Partial<AppaEstimateBillSettings>
  ): Promise<boolean> {
    try {
      const html = formatType === 'appa_estimate'
        ? this.generateAppaEstimateHtml(data, company, settings, template, billNo, billTheme, customAppaSettings)
        : this.generateCustomerStatementHtml(data, company, settings, template);
      const printResult = await Print.printToFileAsync({
        html,
        base64: true,
      });

      // In Android / Expo Go, temporary files from Print.printToFileAsync reside in the root cache,
      // which triggers 'Not allowed to read file under given URL' in ExpoSharing and is unreadable by FileSystem.copyAsync.
      // Writing base64 directly into FileSystem.cacheDirectory places the file inside the app sandbox safely.
      const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
      let shareUri = printResult.uri;

      if (baseDir) {
        const sanitizedName = (data.customer.name || 'Customer').replace(/[/\\?%*:|"<>]/g, '_');
        const filename = `${formatType === 'appa_estimate' ? 'Estimate' : 'Statement'}_${sanitizedName}_${Date.now()}.pdf`;
        const targetUri = `${baseDir}${filename}`;

        if (printResult.base64) {
          await FileSystem.writeAsStringAsync(targetUri, printResult.base64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          shareUri = targetUri;
        } else {
          try {
            await FileSystem.copyAsync({ from: printResult.uri, to: targetUri });
            shareUri = targetUri;
          } catch (copyErr) {
            console.warn('Fallback copyAsync failed, using raw URI:', copyErr);
          }
        }
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(shareUri, {
          mimeType: 'application/pdf',
          dialogTitle: `${formatType === 'appa_estimate' ? 'Estimate' : 'Statement'} - ${data.customer.name}`,
          UTI: 'com.adobe.pdf',
        });
        return true;
      } else {
        Alert.alert('PDF Created', `PDF Statement generated at:\n${shareUri}`);
        return true;
      }
    } catch (err: any) {
      console.error('Share customer PDF error:', err);
      Alert.alert('Export Failed', err?.message || 'Could not generate PDF statement.');
      return false;
    }
  },
};
