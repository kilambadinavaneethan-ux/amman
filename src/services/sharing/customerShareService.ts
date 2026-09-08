import { Share, Linking, Alert, Clipboard, Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { CustomerShareData, ShareSettings, InvoiceTemplate, DEFAULT_CUSTOMER_MESSAGE_TEMPLATE, formatCustomerPhonesDisplay, formatCustomerPhoneNumbers } from '../../types/sharing';

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
    customTemplate?: string
  ): string {
    const templateText = customTemplate || settings.customerMessageTemplate || DEFAULT_CUSTOMER_MESSAGE_TEMPLATE;
    const targetUpi = (settings.upiId || company.upiId || '').trim();
    const netDue = data.summary.netBalanceDue;
    const isPaid = (netDue || 0) <= 0;
    const custPhones = formatCustomerPhonesDisplay(data.customer.phone, data.customer.phoneNumbers);

    const payeeName = encodeURIComponent((company.name || 'Business').trim());
    const txNote = encodeURIComponent(`Statement for ${data.customer.name || 'Customer'}`.trim());
    const upiLink = !isPaid && targetUpi
      ? `upi://pay?pa=${targetUpi}&pn=${payeeName}&cu=INR&tn=${txNote}`
      : isPaid ? '✅ Account Fully Settled' : `UPI ID: ${targetUpi || 'Not set'}`;

    // Format top 5 ledger entries
    const ledgerLines = (data.ledger || []).slice(0, 5).map((l) => {
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
      .replace(/\{net_balance_due\}/g, isPaid ? `${formatCurrency(0)} (Fully Settled ✅)` : formatCurrency(netDue))
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
    via: 'whatsapp' | 'sms' | 'copy' | 'share' = 'whatsapp'
  ): Promise<boolean> {
    try {
      const text = this.formatCustomerShareText(data, company, settings, customTemplate);
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
          <td style="padding: 10px; border-bottom: 1px solid #E2E8F0; font-size: 12px; color: #475569;">${formatDate(l.date)}</td>
          <td style="padding: 10px; border-bottom: 1px solid #E2E8F0; font-size: 12px; font-weight: 600; color: #0F172A;">
            <div>${l.description}</div>
            ${l.notes ? `<div style="font-size: 10px; color: #64748B; font-weight: 400; font-style: italic; margin-top: 2px;">📝 Note: ${l.notes}</div>` : ''}
          </td>
          <td style="padding: 10px; border-bottom: 1px solid #E2E8F0; font-size: 12px; text-align: center;">
            <span style="padding: 3px 8px; border-radius: 12px; font-size: 10px; font-weight: 700; background: ${l.type === 'order' ? '#EFF6FF' : l.type === 'payment' ? '#ECFDF5' : '#FFFBEB'}; color: ${l.type === 'order' ? '#2563EB' : l.type === 'payment' ? '#059669' : '#D97706'};">
              ${l.type.toUpperCase()}
            </span>
          </td>
          <td style="padding: 10px; border-bottom: 1px solid #E2E8F0; font-size: 12px; text-align: right; color: #0F172A;">${debitVal > 0 ? formatCurrency(debitVal) : '-'}</td>
          <td style="padding: 10px; border-bottom: 1px solid #E2E8F0; font-size: 12px; text-align: right; font-weight: 700; color: #059669;">${creditVal > 0 ? formatCurrency(creditVal) : '-'}</td>
          <td style="padding: 10px; border-bottom: 1px solid #E2E8F0; font-size: 12px; text-align: right; font-weight: 700; color: ${l.balance > 0 ? '#DC2626' : '#059669'};">${formatCurrency(l.balance)}</td>
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
            <div class="badge-statement" style="background: ${accentColor}; color: #FFFFFF; padding: 6px 14px; border-radius: 20px; font-size: 11px; font-weight: 800; letter-spacing: 0.5px; display: inline-block;">ACCOUNT STATEMENT</div>
            <div style="font-size: 11px; color: #64748B; margin-top: 6px; font-weight: 600;">📅 Date: ${formatDate(new Date())}</div>
          </div>
        </div>

        ${opts.includeProfileInfo !== false ? `
          <div class="grid-two">
            <div class="card-info">
              <div class="info-title">Statement For (Client Profile)</div>
              <div class="info-name">${data.customer.name.endsWith('அவர்கள்') ? `${data.customer.name.replace(/\s+அவர்கள்$/, '')} <span style="font-size: 11px; font-weight: 500; color: #64748B;">அவர்கள்</span>` : data.customer.name} ${data.customer.isSpecial ? '⭐ (Special Client)' : ''}</div>
              ${formatCustomerPhonesDisplay(data.customer.phone, data.customer.phoneNumbers) ? `<div class="info-text">📞 Phone: ${formatCustomerPhonesDisplay(data.customer.phone, data.customer.phoneNumbers)}</div>` : ''}
              ${data.customer.address ? `<div class="info-text">📍 Address: ${data.customer.address}</div>` : ''}
              ${showGst && data.customer.gstin ? `<div class="info-text">🏷️ GSTIN: ${data.customer.gstin}</div>` : ''}
            </div>
          </div>
        ` : ''}

        ${opts.includeDueDates !== false && data.dueDates && data.dueDates.length > 0 ? `
          <div style="margin-bottom: 24px;">
            <div class="info-title">Scheduled Payment Due Dates</div>
            ${dueDatesRows}
          </div>
        ` : ''}

        ${opts.includeSummary !== false ? `
          <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
            <div class="info-title" style="color: ${accentColor}; margin-bottom: 12px;">📊 Account Calculation Summary</div>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 0;">
              <tr style="border-bottom: 1px solid #E2E8F0;">
                <td style="padding: 6px 0; font-size: 13px; color: #64748B;">Total Orders</td>
                <td style="padding: 6px 0; font-size: 13px; font-weight: 700; text-align: right; color: #0F172A;">${data.summary.totalOrdersCount}</td>
              </tr>
              ${data.summary.oldBalanceDue > 0 ? `
                <tr style="border-bottom: 1px solid #E2E8F0;">
                  <td style="padding: 6px 0; font-size: 13px; color: #DC2626; font-weight: 700;">Opening / Old Balance Due</td>
                  <td style="padding: 6px 0; font-size: 13px; font-weight: 800; text-align: right; color: #DC2626;">+ ${formatCurrency(data.summary.oldBalanceDue)}</td>
                </tr>
              ` : ''}
              <tr style="border-bottom: 1px solid #E2E8F0;">
                <td style="padding: 6px 0; font-size: 13px; color: #0F172A;">Total Sales / Order Amount</td>
                <td style="padding: 6px 0; font-size: 13px; font-weight: 700; text-align: right; color: #0F172A;">+ ${formatCurrency(data.summary.totalSalesAmount)}</td>
              </tr>
              <tr style="border-bottom: 2px solid ${accentColor};">
                <td style="padding: 8px 0; font-size: 14px; font-weight: 800; color: ${accentColor};">Grand Total (incl. Dues)</td>
                <td style="padding: 8px 0; font-size: 15px; font-weight: 900; text-align: right; color: ${accentColor};">${formatCurrency((data.summary.oldBalanceDue || 0) + (data.summary.totalSalesAmount || 0))}</td>
              </tr>
              <tr style="border-bottom: 1px solid #E2E8F0;">
                <td style="padding: 6px 0; font-size: 13px; color: #059669; font-weight: 700;">Total Amount Paid (−)</td>
                <td style="padding: 6px 0; font-size: 13px; font-weight: 800; text-align: right; color: #059669;">− ${formatCurrency(data.summary.totalPaidAmount)}</td>
              </tr>
              <tr style="border-bottom: 3px solid ${netDue > 0 ? '#DC2626' : '#059669'};">
                <td style="padding: 10px 0; font-size: 15px; font-weight: 900; color: ${netDue > 0 ? '#DC2626' : '#059669'};">${netDue > 0 ? '💰 Total Balance Due' : '✅ Account Fully Settled'}</td>
                <td style="padding: 10px 0; font-size: 18px; font-weight: 900; text-align: right; color: ${netDue > 0 ? '#DC2626' : '#059669'};">${formatCurrency(Math.abs(netDue))}</td>
              </tr>
            </table>
          </div>
        ` : ''}

        ${opts.includeLedger !== false ? `
          <div class="info-title">Complete Statement Ledger (${(data.ledger || []).length} entries)</div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description / Reference</th>
                <th style="text-align: center;">Type</th>
                <th style="text-align: right;">Sales (+)</th>
                <th style="text-align: right;">Paid (-)</th>
                <th style="text-align: right;">Balance</th>
              </tr>
            </thead>
            <tbody>
              ${ledgerRows}
            </tbody>
            <tfoot>
              <tr style="background: #F1F5F9; border-top: 2px solid ${accentColor}; font-weight: 800;">
                <td colspan="3" style="padding: 10px; font-size: 12px; color: ${accentColor}; font-weight: 900;">TOTALS</td>
                <td style="padding: 10px; font-size: 12px; text-align: right; color: #0F172A;">${formatCurrency((data.ledger || []).filter(l => l.type === 'order' || l.type === 'opening').reduce((s, l) => s + (l.amount || 0), 0))}</td>
                <td style="padding: 10px; font-size: 12px; text-align: right; color: #059669;">${formatCurrency((data.ledger || []).reduce((s, l) => s + (l.paid || 0), 0))}</td>
                <td style="padding: 10px; font-size: 13px; text-align: right; color: ${netDue > 0 ? '#DC2626' : '#059669'}; font-weight: 900;">${formatCurrency(netDue)}</td>
              </tr>
            </tfoot>
          </table>
        ` : ''}

        <div class="footer-box">
          ${showQr ? `
            <div class="qr-box">
              <img src="${qrCodeSrc}" class="qr-img" />
              <div style="font-size: 10px; color: #64748B; margin-top: 4px; font-weight: 600;">Scan to Pay Balance</div>
            </div>
          ` : ''}

          ${showBank && hasBankInfo ? `
            <div class="bank-box">
              <strong style="color: ${accentColor}; display: block; margin-bottom: 4px; text-transform: uppercase;">🏦 Bank Account Details</strong>
              ${accountHolderName ? `<div><strong>Holder:</strong> ${accountHolderName}</div>` : ''}
              ${bankName ? `<div><strong>Bank:</strong> ${bankName}</div>` : ''}
              ${accountNo ? `<div><strong>A/C No:</strong> ${accountNo}</div>` : ''}
              ${ifscCode ? `<div><strong>IFSC:</strong> ${ifscCode}</div>` : ''}
            </div>
          ` : ''}

          ${showSignature ? `
            <div class="signature-box">
              ${company.signatureUrl ? `<img src="${company.signatureUrl}" style="max-height: 40px; margin-bottom: 4px;" />` : '<div class="sig-line"></div>'}
              <div style="font-size: 11px; color: #64748B; font-weight: 600;">${settings.signatureTitle || 'Authorized Signatory'}</div>
            </div>
          ` : ''}
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
    template: InvoiceTemplate
  ): Promise<boolean> {
    try {
      const html = this.generateCustomerStatementHtml(data, company, settings, template);
      const { uri } = await Print.printToFileAsync({ html });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Statement - ${data.customer.name}.pdf`,
          UTI: 'com.adobe.pdf',
        });
        return true;
      } else {
        Alert.alert('PDF Created', `PDF Statement generated at:\n${uri}`);
        return true;
      }
    } catch (err: any) {
      console.error('Share customer PDF error:', err);
      Alert.alert('Export Failed', err?.message || 'Could not generate PDF statement.');
      return false;
    }
  },
};
