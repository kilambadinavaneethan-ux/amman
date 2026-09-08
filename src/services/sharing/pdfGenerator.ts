import * as Print from 'expo-print';
import { ShareSettings, TransactionData, InvoiceTemplate, DEFAULT_INVOICE_TEMPLATE, formatCustomerPhonesDisplay } from '../../types/sharing';
import { invoiceTemplateService } from './invoiceTemplateService';

function formatDate(dateInput: Date | string | number | undefined): string {
  if (!dateInput) return new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const dateObj = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
  return isNaN(dateObj.getTime())
    ? new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatCurrency(amount: number | undefined): string {
  if (amount === undefined || amount === null || isNaN(amount)) return '₹0.00';
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getFontStack(family: string): string {
  switch (family) {
    case 'Georgia': return "'Georgia', 'Times New Roman', serif";
    case 'Courier': return "'Courier New', Courier, monospace";
    case 'Times': return "'Times New Roman', Times, serif";
    case 'Arial': return "'Arial', 'Helvetica Neue', sans-serif";
    default: return "'Helvetica Neue', Helvetica, Arial, sans-serif";
  }
}

function getTableCss(tpl: InvoiceTemplate): string {
  const base = `
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th {
      background: ${tpl.tableHeaderBg};
      color: ${tpl.tableHeaderTextColor};
      font-weight: 700;
      text-transform: uppercase;
      font-size: ${Math.max(tpl.baseFontSize - 2, 9)}px;
      padding: 10px 12px;
      text-align: left;
    }
    td {
      padding: 10px 12px;
      color: ${tpl.bodyTextColor};
    }
  `;

  switch (tpl.tableStyle) {
    case 'striped':
      return base + `
        td { border-bottom: 1px solid ${tpl.borderColor}; }
        tr.even { background: #F8FAFC; }
      `;
    case 'bordered':
      return base + `
        th, td { border: 1px solid ${tpl.borderColor}; }
      `;
    case 'clean':
      return base + `
        td { border-bottom: 1px solid ${tpl.borderColor}; }
      `;
    case 'minimal':
      return base + `
        th { background: transparent; color: ${tpl.headingColor}; border-bottom: 2px solid ${tpl.borderColor}; }
        td { border: none; border-bottom: 1px solid transparent; }
        tr:last-child td { border-bottom: 1px solid ${tpl.borderColor}; }
      `;
    default:
      return base;
  }
}

function getHeaderHtml(
  tpl: InvoiceTemplate,
  company: any,
  settings: ShareSettings,
  statusBg: string,
  statusLabel: string,
  invoiceNumber: string
): string {
  const accentColor = tpl.accentColor || '#2563EB';

  const logoHtml = tpl.showCompanyLogo && settings.includeLogo && company.logoUrl
    ? `<img src="${company.logoUrl}" class="company-logo" alt="Logo" />`
    : tpl.showCompanyLogo
    ? `<div class="company-avatar" style="background: linear-gradient(135deg, ${accentColor}, #1D4ED8);">${(company.name || 'B').charAt(0).toUpperCase()}</div>`
    : '';

  const companyGst = settings.gstNo || company.gstNo;
  const companyInfoParts: string[] = [];
  if (tpl.showCompanyName) companyInfoParts.push(`<div class="company-name">${company.name || 'Business Receipt'}</div>`);
  if (tpl.showCompanyPhone && company.phone) companyInfoParts.push(`<p style="margin: 3px 0; color: #475569; font-size: 11px;">📞 ${company.phone}</p>`);
  if (tpl.showCompanyEmail && company.email) companyInfoParts.push(`<p style="margin: 3px 0; color: #475569; font-size: 11px;">✉️ ${company.email}</p>`);
  if (tpl.showCompanyAddress && company.address) companyInfoParts.push(`<p style="margin: 3px 0; color: #475569; font-size: 11px;">📍 ${company.address}</p>`);
  if (tpl.showCompanyGst && settings.includeGst && companyGst) companyInfoParts.push(`<p style="margin: 3px 0; font-size: 11px; color: #334155;"><strong>GSTIN:</strong> ${companyGst}</p>`);

  const titleBoxHtml = `
    <div class="invoice-title-box">
      <div class="invoice-title">${tpl.invoiceTitleText || 'INVOICE'}</div>
      ${tpl.showPaymentStatus ? `<div class="status-badge" style="background-color: ${statusBg};">${statusLabel}</div>` : ''}
      ${tpl.showInvoiceNumber ? `<div style="font-size: 12px; font-weight: 700; color: #64748B; margin-top: 4px;"># ${invoiceNumber}</div>` : ''}
    </div>
  `;

  switch (tpl.headerLayout) {
    case 'centered':
      return `
        <div class="header" style="flex-direction: column; align-items: center; text-align: center; border-bottom: 2px solid ${accentColor}30; padding-bottom: 16px;">
          ${logoHtml}
          <div class="company-info" style="text-align: center; max-width: 100%; margin-top: 10px;">
            ${companyInfoParts.join('')}
          </div>
          <div style="margin-top: 12px; text-align: center;">
            ${titleBoxHtml.replace('text-align: right;', 'text-align: center;')}
          </div>
        </div>
      `;
    case 'modern':
      return `
        <div class="header" style="background: linear-gradient(135deg, ${accentColor}12, ${accentColor}05); padding: 18px 20px; border-radius: 12px; border-left: 5px solid ${accentColor}; margin-bottom: 24px;">
          <div style="display: flex; gap: 14px; align-items: center;">
            ${logoHtml}
            <div class="company-info">${companyInfoParts.join('')}</div>
          </div>
          ${titleBoxHtml}
        </div>
      `;
    case 'minimal':
      return `
        <div class="header" style="border-bottom: 1.5px solid ${tpl.borderColor}; padding-bottom: 14px; margin-bottom: 20px;">
          <div class="company-info">
            ${companyInfoParts.join('')}
          </div>
          ${titleBoxHtml}
        </div>
      `;
    default: // classic
      return `
        <div class="header" style="border-bottom: 2px solid ${tpl.borderColor}; padding-bottom: 16px; margin-bottom: 20px;">
          <div style="display: flex; gap: 14px; align-items: center;">
            ${logoHtml}
            <div class="company-info">${companyInfoParts.join('')}</div>
          </div>
          ${titleBoxHtml}
        </div>
      `;
  }
}

/**
 * Generates the full invoice HTML from transaction data, share settings, and template.
 * Exported so it can be reused for the live preview in the invoice management screen.
 */
export function generateInvoiceHtml(
  transaction: TransactionData,
  settings: ShareSettings,
  tpl: InvoiceTemplate
): string {
  const company = transaction.company || {};
  const customer = transaction.customer || { name: 'Valued Customer' };
  const items = transaction.items || [];
  const isPaid = transaction.paymentStatus?.toUpperCase() === 'PAID';
  const isPartial = transaction.paymentStatus?.toUpperCase() === 'PARTIAL';

  const accentColor = tpl.accentColor;
  const statusBg = isPaid ? '#10B981' : isPartial ? '#F59E0B' : '#EF4444';
  const statusLabel = isPaid ? 'PAID' : isPartial ? 'PARTIALLY PAID' : 'PENDING';

  // Build columns dynamically
  const showIndex = tpl.showItemIndex;
  const showUnit = tpl.showItemUnit;
  const showRate = tpl.showItemRate;
  let colCount = 2; // name + amount always shown
  if (showIndex) colCount++;
  if (showUnit) colCount++;
  if (showRate) colCount++;

  const itemsHtml = items.length > 0
    ? items.map((item, idx) => `
        <tr class="${idx % 2 === 0 ? 'even' : 'odd'}">
          ${showIndex ? `<td style="text-align: center; width: 40px;">${idx + 1}</td>` : ''}
          <td><strong>${item.name}</strong></td>
          <td style="text-align: right;">${item.quantity}${showUnit && item.unit ? ' ' + item.unit : ''}</td>
          ${showRate ? `<td style="text-align: right;">${formatCurrency(item.unitPrice)}</td>` : ''}
          <td style="text-align: right; font-weight: 600;">${formatCurrency(item.totalPrice)}</td>
        </tr>
      `).join('')
    : `
        <tr>
          <td colspan="${colCount}" style="text-align: center; color: #64748B; padding: 20px;">
            Transaction Details Record
          </td>
        </tr>
      `;

  const watermarkHtml = settings.watermarkEnabled
    ? `<div class="watermark">${settings.watermarkText || 'CONFIDENTIAL'}</div>`
    : '';

  const headerHtml = getHeaderHtml(tpl, company, settings, statusBg, statusLabel, transaction.invoiceNumber);

  // Meta grid
  const metaCols: string[] = [];
  if (tpl.showInvoiceDate) metaCols.push(`<div class="meta-col"><div class="meta-label">Invoice Date</div><div class="meta-value">${formatDate(transaction.date)}</div></div>`);
  if (tpl.showDueDate && transaction.dueDate) metaCols.push(`<div class="meta-col"><div class="meta-label">Due Date</div><div class="meta-value">${formatDate(transaction.dueDate)}</div></div>`);
  if (tpl.showPaymentMethod) metaCols.push(`<div class="meta-col"><div class="meta-label">Payment Method</div><div class="meta-value">${transaction.paymentMethod || 'Cash / Online'}</div></div>`);
  const metaHtml = metaCols.length > 0 ? `<div class="meta-grid">${metaCols.join('')}</div>` : '';

  // Customer section
  let customerHtml = '';
  if (tpl.showCustomerSection) {
    const custParts: string[] = [];
    const nameStr = customer.name || '';
    const nameHasAvargal = nameStr.endsWith('அவர்கள்');
    const mainCustomerName = nameHasAvargal ? nameStr.replace(/\s+அவர்கள்$/, '').trim() : nameStr;
    const displayCustomerName = nameHasAvargal
      ? `${mainCustomerName} <span style="font-size: 11px; font-weight: 600; color: #64748B; margin-left: 2px;">அவர்கள்</span>`
      : mainCustomerName;
    const custPhones = formatCustomerPhonesDisplay(customer.phone, customer.phoneNumbers);
    custParts.push(`<div style="font-size: 14px; font-weight: 700; color: ${tpl.headingColor};">${displayCustomerName}</div>`);
    if (tpl.showCustomerPhone && custPhones) custParts.push(`<p style="margin: 2px 0; color: #475569;">📞 ${custPhones}</p>`);
    if (tpl.showCustomerAddress && customer.address) custParts.push(`<p style="margin: 2px 0; color: #475569;">${customer.address}</p>`);
    if (tpl.showCustomerGst && settings.includeGst && customer.gstNo) custParts.push(`<p style="margin: 2px 0;"><strong>GSTIN:</strong> ${customer.gstNo}</p>`);

    customerHtml = `
      <div class="billing-row">
        <div class="billing-card">
          <div class="card-title">${tpl.customerSectionTitle}</div>
          ${custParts.join('')}
        </div>
      </div>
    `;
  }

  // Signature
  const sigTitle = settings.signatureTitle || 'Authorized Signature';
  const signatureHtml = tpl.showSignature && settings.includeSignature
    ? `
      <div class="signature-box">
        ${company.signatureUrl ? `<img src="${company.signatureUrl}" style="max-height: 48px; max-width: 140px; margin-bottom: 4px;" />` : '<div style="height: 40px;"></div>'}
        <div class="signature-line"></div>
        <p style="margin: 4px 0 0 0; font-size: 11px; color: #64748B;">${sigTitle}</p>
      </div>
    `
    : '';

  const oldBalance = (tpl.showOldBalanceDue !== false && transaction.previousBalance) ? Number(transaction.previousBalance) : 0;
  const hasOldBalance = oldBalance > 0;
  const grandTotalWithOldDues = (transaction.totalAmount || 0) + oldBalance;
  const netBalanceDue = Math.max(0, grandTotalWithOldDues - (transaction.paidAmount || 0));

  // QR Code
  const targetUpi = (settings.upiId || company.upiId || '').trim();
  const rawAmount = netBalanceDue > 0 ? netBalanceDue : (transaction.pendingAmount || transaction.totalAmount || 0);
  const payeeName = encodeURIComponent((company.name || 'Business').trim());
  const txNote = encodeURIComponent(`Invoice ${transaction.invoiceNumber || ''} | Balance Due: ${Number(rawAmount).toFixed(2)}`.trim());

  const upiPayload = targetUpi
    ? `upi://pay?pa=${targetUpi}&pn=${payeeName}&cu=INR&tn=${txNote}`
    : `Invoice: ${transaction.invoiceNumber} | Total balance due: ${netBalanceDue}`;

  const defaultQrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(upiPayload)}`;
  const qrCodeUrl = (tpl.useCustomQrCode && tpl.customQrCodeUri) ? tpl.customQrCodeUri : defaultQrCodeUrl;

  const showQr = settings.includeQrCode !== false && tpl.showQrCode !== false && settings.paymentDisplayMode !== 'NONE' && settings.paymentDisplayMode !== 'BANK';
  const showBank = settings.includeBankDetails !== false && tpl.showBankDetails !== false && settings.paymentDisplayMode !== 'NONE' && settings.paymentDisplayMode !== 'QR';

  const bankNameVal = settings.bankName || company.bankName || tpl.bankName || '';
  const bankAccVal = settings.accountNo || company.accountNo || tpl.accountNo || '';
  const bankIfscVal = settings.ifscCode || company.ifscCode || tpl.ifscCode || '';
  const bankHolderVal = settings.accountHolderName || company.name || '';

  let paymentInfoHtml = '';
  if (showQr) {
    paymentInfoHtml += `
      <div class="qr-box">
        <img src="${qrCodeUrl}" style="width: 76px; height: 76px; border-radius: 6px; border: 1px solid ${tpl.borderColor}; object-fit: contain;" />
        <p style="margin: 4px 0 0 0; font-size: 10px; color: #64748B;">Scan to Pay / Verify</p>
      </div>
    `;
  }
  if (showBank && (bankNameVal || bankAccVal)) {
    paymentInfoHtml += `
      <div style="margin-top: ${showQr ? '8px' : '0'}; padding: 8px; background: #F8FAFC; border-radius: 6px; border: 1px solid ${tpl.borderColor}; font-size: 10px;">
        <strong style="color: ${tpl.accentColor}; font-size: 10px; display: block; margin-bottom: 2px;">BANK PAYMENT DETAILS</strong>
        ${bankNameVal ? `<div><strong>Bank:</strong> ${bankNameVal}</div>` : ''}
        ${bankAccVal ? `<div><strong>A/c:</strong> ${bankAccVal}</div>` : ''}
        ${bankIfscVal ? `<div><strong>IFSC:</strong> ${bankIfscVal}</div>` : ''}
        ${bankHolderVal ? `<div style="color: #64748B;"><strong>Holder:</strong> ${bankHolderVal}</div>` : ''}
      </div>
    `;
  }

  const qrHtml = paymentInfoHtml;

  const hasExtraCharges = !!(
    (tpl.showDeliveryCharge !== false && transaction.shipmentCharge) ||
    (tpl.showLoadingCharge !== false && transaction.loadingCharge) ||
    (tpl.showUnloadingCharge !== false && transaction.unloadingCharge) ||
    (tpl.showExtraCharge !== false && transaction.extraAmount) ||
    (Array.isArray(transaction.charges) && transaction.charges.some(c => c && c.amount)) ||
    (tpl.showTax && transaction.taxAmount) ||
    (tpl.showDiscount && transaction.discountAmount)
  );

  // Summary rows
  const summaryRows: string[] = [];
  if (tpl.showSubtotal && hasExtraCharges) {
    summaryRows.push(`<tr><td style="color: #64748B;">Subtotal:</td><td style="text-align: right; font-weight: 600;">${formatCurrency(transaction.subtotal || transaction.totalAmount)}</td></tr>`);
  }
  if (tpl.showDeliveryCharge !== false && transaction.shipmentCharge) {
    summaryRows.push(`<tr><td style="color: #64748B;">Delivery / Freight:</td><td style="text-align: right; font-weight: 600;">+ ${formatCurrency(transaction.shipmentCharge)}</td></tr>`);
  }
  if (tpl.showLoadingCharge !== false && transaction.loadingCharge) {
    summaryRows.push(`<tr><td style="color: #64748B;">Loading Charge:</td><td style="text-align: right; font-weight: 600;">+ ${formatCurrency(transaction.loadingCharge)}</td></tr>`);
  }
  if (tpl.showUnloadingCharge !== false && transaction.unloadingCharge) {
    summaryRows.push(`<tr><td style="color: #64748B;">Unloading Charge:</td><td style="text-align: right; font-weight: 600;">+ ${formatCurrency(transaction.unloadingCharge)}</td></tr>`);
  }
  if (tpl.showExtraCharge !== false && transaction.extraAmount) {
    const extraLabel = transaction.extraAmountDescription ? transaction.extraAmountDescription : 'Extra Charge';
    summaryRows.push(`<tr><td style="color: #64748B;">${extraLabel}:</td><td style="text-align: right; font-weight: 600;">+ ${formatCurrency(transaction.extraAmount)}</td></tr>`);
  }
  if (Array.isArray(transaction.charges)) {
    transaction.charges.forEach((chg) => {
      if (chg && chg.amount) {
        summaryRows.push(`<tr><td style="color: #64748B;">${chg.name || 'Additional Charge'}:</td><td style="text-align: right; font-weight: 600;">+ ${formatCurrency(chg.amount)}</td></tr>`);
      }
    });
  }
  if (tpl.showTax && transaction.taxAmount) summaryRows.push(`<tr><td style="color: #64748B;">Tax / GST:</td><td style="text-align: right; font-weight: 600;">+ ${formatCurrency(transaction.taxAmount)}</td></tr>`);
  if (tpl.showDiscount && transaction.discountAmount) summaryRows.push(`<tr><td style="color: #10B981;">Discount:</td><td style="text-align: right; font-weight: 600; color: #10B981;">- ${formatCurrency(transaction.discountAmount)}</td></tr>`);

  if (hasOldBalance) {
    const billTotalLabel = hasExtraCharges ? 'Current Invoice Total:' : 'Subtotal:';
    summaryRows.push(`<tr><td style="color: #64748B; font-weight: 600;">${billTotalLabel}</td><td style="text-align: right; font-weight: 600;">${formatCurrency(transaction.totalAmount)}</td></tr>`);
    summaryRows.push(`<tr><td style="color: #EF4444; font-weight: 600;">Old Balance Due:</td><td style="text-align: right; font-weight: 700; color: #EF4444;">+ ${formatCurrency(oldBalance)}</td></tr>`);
    summaryRows.push(`<tr class="total-row"><td style="font-size: 11.5px; font-weight: 800;">Grand Total (incl. Dues):</td><td style="text-align: right; color: ${accentColor}; font-weight: 800; font-size: 13px; white-space: nowrap;">${formatCurrency(grandTotalWithOldDues)}</td></tr>`);
  } else {
    summaryRows.push(`<tr class="total-row"><td style="font-weight: 800;">Total Amount:</td><td style="text-align: right; color: ${accentColor}; font-weight: 800; white-space: nowrap;">${formatCurrency(transaction.totalAmount)}</td></tr>`);
  }

  if (tpl.showPaidAmount) summaryRows.push(`<tr><td style="color: #10B981; font-weight: 600;">Paid Amount:</td><td style="text-align: right; font-weight: 700; color: #10B981;">${formatCurrency(transaction.paidAmount)}</td></tr>`);
  if (tpl.showBalanceDue) summaryRows.push(`<tr><td style="color: #EF4444; font-weight: 600;">${hasOldBalance ? 'Total Balance Due:' : 'Balance Due:'}</td><td style="text-align: right; font-weight: 700; color: #EF4444;">${formatCurrency(hasOldBalance ? netBalanceDue : transaction.pendingAmount)}</td></tr>`);

  // Footer parts
  const thankNote = settings.thankYouNote || 'Thank you for your business!';
  const termsText = settings.termsAndConditions;

  let footerNotesHtml = '';
  if (tpl.showNotes && transaction.notes) {
    footerNotesHtml += `<div style="background: #F1F5F9; border-radius: 6px; padding: 10px; font-size: 11px; color: #475569; margin-bottom: 8px;"><strong>Notes:</strong> ${transaction.notes}</div>`;
  }
  if (tpl.showTerms && termsText) {
    footerNotesHtml += `<div style="font-size: 10px; color: #64748B; background: #F8FAFC; border-radius: 6px; padding: 8px; border: 1px solid ${tpl.borderColor};"><strong>Terms & Conditions:</strong><br />${termsText.replace(/\n/g, '<br />')}</div>`;
  }

  const footerHtml = (tpl.showThankYouNote || tpl.showFooterBranding) ? `
    <div class="footer">
      ${tpl.showThankYouNote ? `<p style="margin: 0; font-weight: 600;">${thankNote}</p>` : ''}
      ${tpl.showFooterBranding ? `<p style="margin: 4px 0 0 0; color: #94A3B8; font-size: 10px;">${tpl.footerBrandingText}</p>` : ''}
    </div>
  ` : '';

  const paperSizeCss = settings.paperSize === 'THERMAL_80MM'
    ? '@page { size: 80mm 200mm; margin: 5mm; } body { font-size: 10px; }'
    : settings.paperSize === 'LETTER'
    ? '@page { size: letter; margin: 20mm; }'
    : '@page { size: A4; margin: 20mm; }';

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Invoice - ${transaction.invoiceNumber}</title>
        <style>
          ${paperSizeCss}
          * {
            box-sizing: border-box;
            font-family: ${getFontStack(tpl.fontFamily)};
          }
          body {
            color: ${tpl.bodyTextColor};
            background: ${tpl.pageBackground};
            margin: 0;
            padding: 0;
            font-size: ${tpl.baseFontSize}px;
            position: relative;
          }
          .watermark {
            position: absolute;
            top: 40%;
            left: 10%;
            width: 80%;
            text-align: center;
            font-size: 64px;
            font-weight: 800;
            color: rgba(226, 232, 240, 0.45);
            transform: rotate(-30deg);
            z-index: 0;
            pointer-events: none;
            text-transform: uppercase;
          }
          .container {
            position: relative;
            z-index: 1;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px ${tpl.borderStyle !== 'none' ? tpl.borderStyle : 'solid'} ${tpl.borderColor};
            padding-bottom: 16px;
            margin-bottom: 20px;
          }
          .company-logo {
            max-height: 60px;
            max-width: 160px;
            object-fit: contain;
          }
          .company-avatar {
            width: 50px;
            height: 50px;
            border-radius: 12px;
            color: #FFFFFF;
            font-size: 24px;
            font-weight: 700;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            line-height: 50px;
          }
          .company-info {
            max-width: 280px;
          }
          .company-name {
            font-size: ${tpl.baseFontSize + 6}px;
            font-weight: 700;
            color: ${tpl.headingColor};
            margin: 0 0 4px 0;
          }
          .invoice-title-box {
            text-align: right;
          }
          .invoice-title {
            font-size: ${tpl.baseFontSize + 12}px;
            font-weight: 800;
            color: ${accentColor};
            margin: 0 0 6px 0;
            letter-spacing: 0.5px;
          }
          .status-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            color: #FFFFFF;
            font-weight: 700;
            font-size: 11px;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
          }
          .meta-grid {
            display: flex;
            justify-content: space-between;
            background: #F8FAFC;
            border-radius: 10px;
            padding: 14px 18px;
            margin-bottom: 20px;
            border: 1px ${tpl.borderStyle !== 'none' ? tpl.borderStyle : 'solid'} ${tpl.borderColor};
          }
          .meta-col { flex: 1; }
          .meta-label {
            font-size: ${Math.max(tpl.baseFontSize - 2, 9)}px;
            text-transform: uppercase;
            color: #64748B;
            font-weight: 700;
            margin-bottom: 2px;
          }
          .meta-value {
            font-size: ${tpl.baseFontSize + 1}px;
            font-weight: 600;
            color: ${tpl.headingColor};
          }
          .billing-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 20px;
            gap: 20px;
          }
          .billing-card {
            flex: 1;
            background: ${tpl.pageBackground};
            border-radius: 8px;
            padding: 12px;
            border: 1px ${tpl.borderStyle !== 'none' ? tpl.borderStyle : 'solid'} ${tpl.borderColor};
          }
          .card-title {
            font-size: 11px;
            text-transform: uppercase;
            color: ${accentColor};
            font-weight: 700;
            margin: 0 0 6px 0;
          }
          ${getTableCss(tpl)}
          .summary-container {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-top: 10px;
          }
          .left-summary {
            display: flex;
            gap: 20px;
            align-items: flex-end;
          }
          .summary-table {
            width: 310px;
            margin-left: auto;
            border-radius: 10px;
            overflow: hidden;
            background: #F8FAFC;
            border: 1px solid ${tpl.borderColor};
            padding: 4px 6px;
          }
          .summary-table tr td {
            padding: 7px 12px;
            border-bottom: 1px dashed #E2E8F0;
            font-size: ${tpl.baseFontSize}px;
          }
          .summary-table tr:last-child td {
            border-bottom: none;
          }
          .summary-table tr.total-row {
            background: ${accentColor}12;
            border-top: 2px solid ${accentColor};
            border-bottom: 2px solid ${accentColor};
            font-size: ${tpl.baseFontSize + 3}px;
            font-weight: 800;
            color: ${tpl.headingColor};
          }
          .signature-box {
            text-align: center;
          }
          .signature-line {
            width: 140px;
            height: 1px;
            background: #94A3B8;
            margin: 0 auto;
          }
          .footer {
            margin-top: 30px;
            border-top: 1px ${tpl.borderStyle !== 'none' ? tpl.borderStyle : 'solid'} ${tpl.borderColor};
            padding-top: 12px;
            text-align: center;
            color: #64748B;
            font-size: ${tpl.baseFontSize - 1}px;
          }
        </style>
      </head>
      <body>
        ${watermarkHtml}
        <div class="container">
          ${headerHtml}
          ${metaHtml}
          ${customerHtml}

          <table>
            <thead>
              <tr>
                ${showIndex ? '<th style="width: 40px; text-align: center;">#</th>' : ''}
                <th>Item & Description</th>
                <th style="text-align: right;">Qty</th>
                ${showRate ? '<th style="text-align: right;">Rate</th>' : ''}
                <th style="text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div class="summary-container">
            <div class="left-summary">
              ${qrHtml}
            </div>
            <table class="summary-table">
              ${summaryRows.join('')}
            </table>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 30px;">
            <div style="max-width: 320px;">
              ${footerNotesHtml}
            </div>
            ${signatureHtml}
          </div>

          ${footerHtml}
        </div>
      </body>
    </html>
  `;
}

export async function generatePdfInvoice(
  transaction: TransactionData,
  settings: ShareSettings
): Promise<string> {
  // Load the user's invoice template from storage
  let tpl: InvoiceTemplate;
  try {
    tpl = await invoiceTemplateService.getTemplate();
  } catch {
    tpl = DEFAULT_INVOICE_TEMPLATE;
  }

  const html = generateInvoiceHtml(transaction, settings, tpl);

  const { uri } = await Print.printToFileAsync({
    html,
    width: 612,
    height: 792,
  });

  return uri;
}
