import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import { ShareSettings, TransactionData, InvoiceTemplate, DEFAULT_INVOICE_TEMPLATE, formatCustomerPhonesDisplay } from '../../types/sharing';
import { invoiceTemplateService } from './invoiceTemplateService';
import { getInvoiceLabels, getLocalizedInvoiceTitle } from '../../utils/invoiceLocalization';

function formatDate(dateInput: Date | string | number | undefined): string {
  if (!dateInput) return new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const dateObj = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
  return isNaN(dateObj.getTime())
    ? new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatCurrency(
  amount: number | undefined,
  currencySymbol: string = '₹',
  decimalPlaces: number = 2
): string {
  const sym = currencySymbol === 'None' || !currencySymbol ? '' : currencySymbol;
  const decimals = typeof decimalPlaces === 'number' ? Math.max(0, Math.min(4, decimalPlaces)) : 2;
  if (amount === undefined || amount === null || isNaN(amount)) {
    return `${sym}0${decimals > 0 ? '.' + '0'.repeat(decimals) : ''}`;
  }
  const formatted = amount.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${sym}${formatted}`;
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
  const density = tpl.tableDensity || 'normal';
  const padding = density === 'compact' ? '6px 8px' : density === 'relaxed' ? '14px 16px' : '10px 12px';
  const borderRule = tpl.borderStyle === 'double'
    ? `3px double ${tpl.borderColor}`
    : `1px ${tpl.borderStyle !== 'none' ? tpl.borderStyle : 'solid'} ${tpl.borderColor}`;

  const base = `
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th {
      background: ${tpl.tableHeaderBg};
      color: ${tpl.tableHeaderTextColor};
      font-weight: 700;
      text-transform: uppercase;
      font-size: ${Math.max(tpl.baseFontSize - 2, 9)}px;
      padding: ${padding};
      text-align: left;
    }
    td {
      padding: ${padding};
      color: ${tpl.bodyTextColor};
    }
  `;

  switch (tpl.tableStyle) {
    case 'striped':
      return base + `
        td { border-bottom: ${borderRule}; }
        tr.even { background: #F8FAFC; }
      `;
    case 'bordered':
      return base + `
        th, td { border: ${borderRule}; }
      `;
    case 'clean':
      return base + `
        td { border-bottom: ${borderRule}; }
      `;
    case 'minimal':
      return base + `
        th { background: transparent; color: ${tpl.headingColor}; border-bottom: 2px solid ${tpl.borderColor}; }
        td { border: none; border-bottom: 1px solid transparent; }
        tr:last-child td { border-bottom: ${borderRule}; }
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
  invoiceNumber: string,
  isTamil?: boolean,
  customTitle?: string,
  isBilingual?: boolean
): string {
  const accentColor = tpl.accentColor || '#2563EB';

  const logoDimensions = tpl.logoSize === 'small'
    ? { maxH: 38, maxW: 100, avatarSize: 38, avatarFont: 18 }
    : tpl.logoSize === 'large'
    ? { maxH: 80, maxW: 200, avatarSize: 66, avatarFont: 30 }
    : { maxH: 58, maxW: 160, avatarSize: 50, avatarFont: 24 };

  const logoHtml = tpl.showCompanyLogo && settings.includeLogo && company.logoUrl
    ? `<img src="${company.logoUrl}" class="company-logo" style="max-height: ${logoDimensions.maxH}px; max-width: ${logoDimensions.maxW}px;" alt="Logo" />`
    : tpl.showCompanyLogo
    ? `<div class="company-avatar" style="width: ${logoDimensions.avatarSize}px; height: ${logoDimensions.avatarSize}px; line-height: ${logoDimensions.avatarSize}px; font-size: ${logoDimensions.avatarFont}px; background: linear-gradient(135deg, ${accentColor}, #1D4ED8);">${(company.name || 'B').charAt(0).toUpperCase()}</div>`
    : '';

  const companyGst = settings.gstNo || company.gstNo;
  const companyInfoParts: string[] = [];
  if (tpl.showCompanyName) {
    companyInfoParts.push(`<div class="company-name">${company.name || 'Business Receipt'}</div>`);
    if (tpl.showCompanyTagline && tpl.companyTagline) {
      companyInfoParts.push(`<div class="company-tagline" style="font-size: 10.5px; font-style: italic; color: #64748B; margin: 1px 0 4px 0;">${tpl.companyTagline}</div>`);
    }
  }
  if (tpl.showCompanyPhone && company.phone) companyInfoParts.push(`<p style="margin: 3px 0; color: #475569; font-size: 11px;">📞 ${company.phone}</p>`);
  if (tpl.showCompanyEmail && company.email) companyInfoParts.push(`<p style="margin: 3px 0; color: #475569; font-size: 11px;">✉️ ${company.email}</p>`);
  if (tpl.showCompanyAddress && company.address) companyInfoParts.push(`<p style="margin: 3px 0; color: #475569; font-size: 11px;">📍 ${company.address}</p>`);
  if (tpl.showCompanyGst && settings.includeGst && companyGst) companyInfoParts.push(`<p style="margin: 3px 0; font-size: 11px; color: #334155;"><strong>GSTIN:</strong> ${companyGst}</p>`);

  const titleText = getLocalizedInvoiceTitle(tpl.invoiceTitleText, isTamil, customTitle, isBilingual);

  const titleBoxHtml = `
    <div class="invoice-title-box">
      <div class="invoice-title">${titleText}</div>
      ${tpl.showPaymentStatus ? `<div class="status-badge" style="background-color: ${statusBg};">${statusLabel}</div>` : ''}
      ${tpl.showInvoiceNumber ? `<div style="font-size: 12px; font-weight: 700; color: #64748B; margin-top: 4px;"># ${invoiceNumber}</div>` : ''}
    </div>
  `;

  const invocationHtml = tpl.showInvocation && tpl.invocationText
    ? `<div class="divine-invocation" style="text-align: center; font-size: 11px; font-weight: 700; color: ${tpl.invocationColor || '#B91C1C'}; margin-bottom: 10px; letter-spacing: 0.5px;">|| ${tpl.invocationText} ||</div>`
    : '';

  let headerBodyHtml = '';
  switch (tpl.headerLayout) {
    case 'centered':
      headerBodyHtml = `
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
      break;
    case 'modern':
      headerBodyHtml = `
        <div class="header" style="background: linear-gradient(135deg, ${accentColor}12, ${accentColor}05); padding: 18px 20px; border-radius: 12px; border-left: 5px solid ${accentColor}; margin-bottom: 24px;">
          <div style="display: flex; gap: 14px; align-items: center;">
            ${logoHtml}
            <div class="company-info">${companyInfoParts.join('')}</div>
          </div>
          ${titleBoxHtml}
        </div>
      `;
      break;
    case 'minimal':
      headerBodyHtml = `
        <div class="header" style="border-bottom: 1.5px solid ${tpl.borderColor}; padding-bottom: 14px; margin-bottom: 20px;">
          <div class="company-info">
            ${companyInfoParts.join('')}
          </div>
          ${titleBoxHtml}
        </div>
      `;
      break;
    default: // classic
      headerBodyHtml = `
        <div class="header" style="border-bottom: 2px solid ${tpl.borderColor}; padding-bottom: 16px; margin-bottom: 20px;">
          <div style="display: flex; gap: 14px; align-items: center;">
            ${logoHtml}
            <div class="company-info">${companyInfoParts.join('')}</div>
          </div>
          ${titleBoxHtml}
        </div>
      `;
      break;
  }

  return `${invocationHtml}${headerBodyHtml}`;
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
  const isTamil = Boolean(tpl.isTamilLanguage ?? settings?.isTamilLanguage);
  const isBilingual = Boolean(tpl.isBilingual ?? settings?.isBilingual);
  const customTamil = (tpl.customTamilLabels || settings?.customTamilLabels) as any;
  const labels = getInvoiceLabels(isTamil, customTamil, isBilingual, tpl.tamilTerminologyPreset || settings?.tamilTerminologyPreset);

  const currencySymbol = tpl.currencySymbol ?? '₹';
  const decimalPlaces = tpl.decimalPlaces ?? 2;
  const fmtMoney = (amount: number | undefined) => formatCurrency(amount, currencySymbol, decimalPlaces);

  const company = transaction.company || {};
  const customer = transaction.customer || { name: 'Valued Customer' };
  const items = transaction.items || [];
  const isPaid = transaction.paymentStatus?.toUpperCase() === 'PAID';
  const isPartial = transaction.paymentStatus?.toUpperCase() === 'PARTIAL';

  const accentColor = tpl.accentColor;
  const statusBg = isPaid ? '#10B981' : isPartial ? '#F59E0B' : '#EF4444';
  const statusLabel = isPaid ? labels.statusPaid : isPartial ? labels.statusPartiallyPaid : labels.statusPending;

  // Build columns dynamically
  const showIndex = tpl.showItemIndex;
  const showUnit = tpl.showItemUnit;
  const showRate = tpl.showItemRate;
  let colCount = 2; // name + amount always shown
  if (showIndex) colCount++;
  if (showUnit) colCount++;
  if (showRate) colCount++;

  const colIndex = tpl.customColumnLabels?.index || (isTamil ? 'எண்' : '#');
  const colItem = tpl.customColumnLabels?.item || (isBilingual ? 'Item / பொருள்' : isTamil ? (customTamil?.item || labels.item) : 'Item & Description');
  const colQty = tpl.customColumnLabels?.qty || (isBilingual ? 'Qty / அளவு' : isTamil ? (customTamil?.qty || labels.qty) : 'Qty');
  const colRate = tpl.customColumnLabels?.rate || (isBilingual ? 'Rate / விலை' : isTamil ? (customTamil?.rate || labels.rate) : 'Rate');
  const colAmount = tpl.customColumnLabels?.amount || (isBilingual ? 'Amount / தொகை' : isTamil ? (customTamil?.total || labels.total) : 'Amount');

  const itemsHtml = items.length > 0
    ? items.map((item, idx) => `
        <tr class="${idx % 2 === 0 ? 'even' : 'odd'}">
          ${showIndex ? `<td style="text-align: center; width: 40px;">${idx + 1}</td>` : ''}
          <td><strong>${item.name}</strong></td>
          <td style="text-align: right;">${item.quantity}${showUnit && item.unit ? ' ' + item.unit : ''}</td>
          ${showRate ? `<td style="text-align: right;">${fmtMoney(item.unitPrice)}</td>` : ''}
          <td style="text-align: right; font-weight: 600;">${fmtMoney(item.totalPrice)}</td>
        </tr>
      `).join('')
    : `
        <tr>
          <td colspan="${colCount}" style="text-align: center; color: #64748B; padding: 20px;">
            ${labels.transactionSummaryRecord}
          </td>
        </tr>
      `;

  const watermarkEnabled = tpl.watermarkEnabled ?? settings.watermarkEnabled;
  const watermarkText = tpl.watermarkText || settings.watermarkText || 'CONFIDENTIAL';
  const watermarkOpacity = tpl.watermarkOpacity !== undefined ? tpl.watermarkOpacity : 0.12;
  const watermarkHtml = watermarkEnabled
    ? `<div class="watermark" style="opacity: ${watermarkOpacity};">${watermarkText}</div>`
    : '';

  const headerHtml = getHeaderHtml(tpl, company, settings, statusBg, statusLabel, transaction.invoiceNumber, isTamil, customTamil?.invoice, isBilingual);

  // Meta grid
  const metaCols: string[] = [];
  if (tpl.showInvoiceDate) metaCols.push(`<div class="meta-col"><div class="meta-label">${labels.invoiceDate}</div><div class="meta-value">${formatDate(transaction.date)}</div></div>`);
  if (tpl.showDueDate && transaction.dueDate) metaCols.push(`<div class="meta-col"><div class="meta-label">${labels.dueDate}</div><div class="meta-value">${formatDate(transaction.dueDate)}</div></div>`);
  if (tpl.showPaymentMethod) metaCols.push(`<div class="meta-col"><div class="meta-label">${labels.paymentMode}</div><div class="meta-value">${transaction.paymentMethod || 'Cash / Online'}</div></div>`);
  const metaHtml = metaCols.length > 0 ? `<div class="meta-grid">${metaCols.join('')}</div>` : '';

  // Customer section
  let customerHtml = '';
  if (tpl.showCustomerSection) {
    const custParts: string[] = [];
    const rawCustName = customer.name || '';
    const shouldAddHonorific = (isTamil || isBilingual) && (tpl.showCustomerHonorificTamil ?? settings?.showCustomerHonorificTamil) !== false;
    const nameStr = shouldAddHonorific && !rawCustName.endsWith('அவர்கள்') ? `${rawCustName} ${labels.avargal || 'அவர்கள்'}` : rawCustName;
    const nameHasAvargal = nameStr.endsWith(labels.avargal || 'அவர்கள்');
    const honorificSuffix = labels.avargal || 'அவர்கள்';
    const mainCustomerName = nameHasAvargal ? nameStr.substring(0, nameStr.length - honorificSuffix.length).trim() : nameStr;
    const displayCustomerName = nameHasAvargal
      ? `${mainCustomerName} <span style="font-size: 11px; font-weight: 600; color: #64748B; margin-left: 2px;">${honorificSuffix}</span>`
      : mainCustomerName;
    const custPhones = formatCustomerPhonesDisplay(customer.phone, customer.phoneNumbers);
    custParts.push(`<div style="font-size: 14px; font-weight: 700; color: ${tpl.headingColor};">${displayCustomerName}</div>`);
    if (tpl.showCustomerPhone && custPhones) custParts.push(`<p style="margin: 2px 0; color: #475569;">📞 ${custPhones}</p>`);
    if (tpl.showCustomerAddress && customer.address) custParts.push(`<p style="margin: 2px 0; color: #475569;">${customer.address}</p>`);
    if (tpl.showCustomerGst && settings.includeGst && customer.gstNo) custParts.push(`<p style="margin: 2px 0;"><strong>GSTIN:</strong> ${customer.gstNo}</p>`);

    const sectionTitleText = (tpl.customerSectionTitle ? (isTamil && tpl.customerSectionTitle === 'Billed To' ? labels.billedTo : tpl.customerSectionTitle) : labels.billedTo).toUpperCase();

    customerHtml = `
      <div class="billing-row">
        <div class="billing-card">
          <div class="card-title">${sectionTitleText}</div>
          ${custParts.join('')}
        </div>
      </div>
    `;
  }

  // Signature & Rubber Seal
  const sigTitle = tpl.signatureTitle || settings.signatureTitle || labels.authorizedSignatory;
  const sigName = tpl.signatoryName ? `<div style="font-size: 11px; font-weight: 700; color: ${tpl.headingColor}; margin-top: 3px;">${tpl.signatoryName}</div>` : '';
  const rubberSealHtml = tpl.showRubberSeal
    ? `<div class="rubber-seal" style="display: flex; align-items: center; justify-content: center; width: 68px; height: 68px; border-radius: 50%; border: 2px dashed ${accentColor}; color: ${accentColor}; font-size: 8px; font-weight: 800; text-transform: uppercase; text-align: center; transform: rotate(-12deg); margin: 0 auto 6px auto; opacity: 0.85; padding: 4px; box-sizing: border-box; line-height: 1.1;">
        ${tpl.rubberSealText || '★ SEAL ★'}
      </div>`
    : '';

  const signatureHtml = tpl.showSignature && (settings.includeSignature !== false)
    ? `
      <div class="signature-box" style="display: flex; flex-direction: column; align-items: center;">
        ${rubberSealHtml}
        ${company.signatureUrl ? `<img src="${company.signatureUrl}" style="max-height: 48px; max-width: 140px; margin-bottom: 4px;" />` : '<div style="height: 36px;"></div>'}
        <div class="signature-line"></div>
        ${sigName}
        <p style="margin: 4px 0 0 0; font-size: 11px; color: #64748B;">${sigTitle}</p>
      </div>
    `
    : '';

  const oldBalance = (tpl.showOldBalanceDue !== false && transaction.previousBalance) ? Number(transaction.previousBalance) : 0;
  const hasOldBalance = oldBalance > 0;
  const grandTotalWithOldDues = (transaction.totalAmount || 0) + oldBalance;
  const netBalanceDue = Math.max(0, grandTotalWithOldDues - (transaction.paidAmount || 0));
  const excessAdvance = Math.max(0, (transaction.paidAmount || 0) - grandTotalWithOldDues);

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

  const bankNameVal = settings.bankName || tpl.bankName || company.bankName || '';
  const bankAccVal = settings.accountNo || tpl.accountNo || company.accountNo || '';
  const bankIfscVal = settings.ifscCode || tpl.ifscCode || company.ifscCode || '';
  const bankHolderVal = settings.accountHolderName || tpl.accountHolderName || company.name || '';

  let paymentInfoHtml = '';
  if (showQr) {
    paymentInfoHtml += `
      <div class="qr-box">
        <img src="${qrCodeUrl}" style="width: 76px; height: 76px; border-radius: 6px; border: 1px solid ${tpl.borderColor}; object-fit: contain;" />
        <p style="margin: 4px 0 0 0; font-size: 10px; color: #64748B;">${tpl.useCustomQrCode && tpl.customQrCodeUri ? labels.scanToPayVerify : labels.scanToPay}</p>
      </div>
    `;
  }
  if (showBank && (bankNameVal || bankAccVal)) {
    paymentInfoHtml += `
      <div style="margin-top: ${showQr ? '8px' : '0'}; padding: 8px 10px; background: #F8FAFC; border-radius: 8px; border: 1px solid ${tpl.borderColor}; font-size: 10px; width: 100%; max-width: 220px;">
        <div style="display: flex; align-items: center; margin-bottom: 5px; gap: 4px;">
          <div style="width: 3px; height: 10px; background: ${tpl.accentColor}; border-radius: 2px;"></div>
          <strong style="color: ${tpl.accentColor}; font-size: 8.5px; letter-spacing: 0.3px;">${labels.bankPaymentDetails.toUpperCase()}</strong>
        </div>
        ${bankNameVal ? `<div style="margin-bottom: 3px;"><div style="font-size: 7.5px; color: #64748B; font-weight: 700; text-transform: uppercase;">${labels.bankName}</div><strong style="color: ${tpl.bodyTextColor}; font-size: 9.5px;">${bankNameVal}</strong></div>` : ''}
        ${bankAccVal ? `<div style="margin-bottom: 3px;"><div style="font-size: 7.5px; color: #64748B; font-weight: 700; text-transform: uppercase;">${labels.accountNo}</div><strong style="color: ${tpl.bodyTextColor}; font-size: 9.5px; letter-spacing: 0.3px;">${bankAccVal}</strong></div>` : ''}
        ${bankIfscVal ? `<div style="margin-bottom: 3px;"><div style="font-size: 7.5px; color: #64748B; font-weight: 700; text-transform: uppercase;">${labels.ifscCode}</div><strong style="color: ${tpl.bodyTextColor}; font-size: 9.5px;">${bankIfscVal}</strong></div>` : ''}
        ${bankHolderVal ? `<div><div style="font-size: 7.5px; color: #64748B; font-weight: 700; text-transform: uppercase;">${labels.accountHolder}</div><span style="color: #64748B; font-size: 8.5px;">${bankHolderVal}</span></div>` : ''}
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
    summaryRows.push(`<tr><td style="color: #64748B;">${labels.subtotal}:</td><td style="text-align: right; font-weight: 600;">${fmtMoney(transaction.subtotal || transaction.totalAmount)}</td></tr>`);
  }
  if (tpl.showDeliveryCharge !== false && transaction.shipmentCharge) {
    summaryRows.push(`<tr><td style="color: #64748B;">${labels.deliveryCharge}:</td><td style="text-align: right; font-weight: 600;">+ ${fmtMoney(transaction.shipmentCharge)}</td></tr>`);
  }
  if (tpl.showLoadingCharge !== false && transaction.loadingCharge) {
    summaryRows.push(`<tr><td style="color: #64748B;">${labels.loadingCharge}:</td><td style="text-align: right; font-weight: 600;">+ ${fmtMoney(transaction.loadingCharge)}</td></tr>`);
  }
  if (tpl.showUnloadingCharge !== false && transaction.unloadingCharge) {
    summaryRows.push(`<tr><td style="color: #64748B;">${labels.unloadingCharge}:</td><td style="text-align: right; font-weight: 600;">+ ${fmtMoney(transaction.unloadingCharge)}</td></tr>`);
  }
  if (tpl.showExtraCharge !== false && transaction.extraAmount) {
    const extraLabel = transaction.extraAmountDescription ? transaction.extraAmountDescription : labels.extraCharge;
    summaryRows.push(`<tr><td style="color: #64748B;">${extraLabel}:</td><td style="text-align: right; font-weight: 600;">+ ${fmtMoney(transaction.extraAmount)}</td></tr>`);
  }
  if (Array.isArray(transaction.charges)) {
    transaction.charges.forEach((chg) => {
      if (chg && chg.amount) {
        summaryRows.push(`<tr><td style="color: #64748B;">${chg.name || labels.extraCharge}:</td><td style="text-align: right; font-weight: 600;">+ ${fmtMoney(chg.amount)}</td></tr>`);
      }
    });
  }
  if (tpl.showTax && transaction.taxAmount) summaryRows.push(`<tr><td style="color: #64748B;">${labels.taxGst}:</td><td style="text-align: right; font-weight: 600;">+ ${fmtMoney(transaction.taxAmount)}</td></tr>`);
  if (tpl.showDiscount && transaction.discountAmount) summaryRows.push(`<tr><td style="color: #10B981;">${labels.discount}:</td><td style="text-align: right; font-weight: 600; color: #10B981;">- ${fmtMoney(transaction.discountAmount)}</td></tr>`);

  if (hasOldBalance) {
    const billTotalLabel = hasExtraCharges ? labels.currentBillTotal + ':' : labels.subtotal + ':';
    summaryRows.push(`<tr><td style="color: #64748B; font-weight: 600;">${billTotalLabel}</td><td style="text-align: right; font-weight: 600;">${fmtMoney(transaction.totalAmount)}</td></tr>`);
    summaryRows.push(`<tr><td style="color: #EF4444; font-weight: 600;">${labels.oldBalanceDue}:</td><td style="text-align: right; font-weight: 700; color: #EF4444;">+ ${fmtMoney(oldBalance)}</td></tr>`);
    summaryRows.push(`<tr class="total-row"><td style="font-size: 11.5px; font-weight: 800;">${labels.grandTotalInclDues}:</td><td style="text-align: right; color: ${accentColor}; font-weight: 800; font-size: 13px; white-space: nowrap;">${fmtMoney(grandTotalWithOldDues)}</td></tr>`);
  } else {
    summaryRows.push(`<tr class="total-row"><td style="font-weight: 800;">${labels.totalAmount}:</td><td style="text-align: right; color: ${accentColor}; font-weight: 800; white-space: nowrap;">${fmtMoney(transaction.totalAmount)}</td></tr>`);
  }

  if (tpl.showPaidAmount) summaryRows.push(`<tr><td style="color: #10B981; font-weight: 600;">${labels.paidAmount}:</td><td style="text-align: right; font-weight: 700; color: #10B981;">${fmtMoney(transaction.paidAmount)}</td></tr>`);
  if (excessAdvance > 0) {
    summaryRows.push(`<tr style="background: #F0FDF4;"><td style="color: #059669; font-weight: 700;">${isTamil ? 'முன்பணம் கிரெடிட்:' : 'Advance Credit Added:'}</td><td style="text-align: right; font-weight: 800; color: #059669;">+ ${fmtMoney(excessAdvance)}</td></tr>`);
  }
  if (tpl.showBalanceDue) summaryRows.push(`<tr><td style="color: #EF4444; font-weight: 600;">${hasOldBalance ? labels.totalBalanceDue + ':' : labels.balanceDue + ':'}</td><td style="text-align: right; font-weight: 700; color: #EF4444;">${fmtMoney(hasOldBalance ? netBalanceDue : transaction.pendingAmount)}</td></tr>`);

  // Footer parts (effective notes, terms, thank you note)
  const effectiveNotes = transaction.notes || tpl.defaultNotes || '';
  const effectiveTerms = tpl.termsAndConditions || settings.termsAndConditions || '';
  const effectiveThankNote = tpl.thankYouNote || (
    (isTamil && (!settings.thankYouNote || settings.thankYouNote.toLowerCase().includes('thank you')))
      ? labels.thankYouNote
      : (settings.thankYouNote || labels.thankYouNote)
  );

  let footerNotesHtml = '';
  if (tpl.showNotes && effectiveNotes) {
    footerNotesHtml += `<div style="background: #F1F5F9; border-radius: 6px; padding: 10px; font-size: 11px; color: #475569; margin-bottom: 8px;"><strong>${labels.notes}:</strong> ${effectiveNotes}</div>`;
  }
  if (tpl.showTerms && effectiveTerms) {
    footerNotesHtml += `<div style="font-size: 10px; color: #64748B; background: #F8FAFC; border-radius: 6px; padding: 8px; border: 1px solid ${tpl.borderColor};"><strong>${labels.termsAndConditions}:</strong><br />${effectiveTerms.replace(/\n/g, '<br />')}</div>`;
  }

  const footerHtml = (tpl.showThankYouNote || tpl.showFooterBranding) ? `
    <div class="footer">
      ${tpl.showThankYouNote ? `<p style="margin: 0; font-weight: 600;">${effectiveThankNote}</p>` : ''}
      ${tpl.showFooterBranding ? `<p style="margin: 4px 0 0 0; color: #94A3B8; font-size: 10px;">${tpl.footerBrandingText}</p>` : ''}
    </div>
  ` : '';

  const paperSize = tpl.paperSize || settings.paperSize || 'A4';
  const pageMargin = tpl.pageMargin || 'normal';
  const marginMm = pageMargin === 'compact' ? '10mm' : pageMargin === 'wide' ? '25mm' : '20mm';

  let paperSizeCss = `@page { size: A4; margin: ${marginMm}; }`;
  if (paperSize === 'THERMAL_80MM') {
    const thermalMargin = pageMargin === 'compact' ? '3mm' : pageMargin === 'wide' ? '8mm' : '5mm';
    paperSizeCss = `@page { size: 80mm auto; margin: ${thermalMargin}; } body { font-size: 10px; }`;
  } else if (paperSize === 'LETTER') {
    paperSizeCss = `@page { size: letter; margin: ${marginMm}; }`;
  }

  const borderStyleVal = tpl.borderStyle === 'double' ? '3px double' : (tpl.borderStyle !== 'none' ? `1px ${tpl.borderStyle}` : 'none');

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
            color: #64748B;
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
            border-bottom: 2px ${tpl.borderStyle === 'double' ? 'double' : (tpl.borderStyle !== 'none' ? tpl.borderStyle : 'solid')} ${tpl.borderColor};
            padding-bottom: 16px;
            margin-bottom: 20px;
          }
          .company-logo {
            object-fit: contain;
          }
          .company-avatar {
            border-radius: 12px;
            color: #FFFFFF;
            font-weight: 700;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
          }
          .company-info {
            max-width: 280px;
          }
          .company-name {
            font-size: ${tpl.baseFontSize + 6}px;
            font-weight: 700;
            color: ${tpl.headingColor};
            margin: 0 0 2px 0;
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
            border: ${borderStyleVal !== 'none' ? `${borderStyleVal} ${tpl.borderColor}` : 'none'};
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
            border: ${borderStyleVal !== 'none' ? `${borderStyleVal} ${tpl.borderColor}` : 'none'};
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
            border-top: ${borderStyleVal !== 'none' ? `${borderStyleVal} ${tpl.borderColor}` : '1px solid ' + tpl.borderColor};
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
                ${showIndex ? `<th style="width: 40px; text-align: center;">${colIndex}</th>` : ''}
                <th>${colItem}</th>
                <th style="text-align: right;">${colQty}</th>
                ${showRate ? `<th style="text-align: right;">${colRate}</th>` : ''}
                <th style="text-align: right;">${colAmount}</th>
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

  const printResult = await Print.printToFileAsync({
    html,
    width: 612,
    height: 792,
    base64: true,
  });

  // In Android / Expo Go, temporary files from Print.printToFileAsync reside in the root cache,
  // which triggers 'Not allowed to read file under given URL' in ExpoSharing and is unreadable by FileSystem.copyAsync.
  // Writing base64 directly into FileSystem.cacheDirectory places the file inside the app sandbox safely.
  try {
    const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
    if (baseDir) {
      const sanitizedInvoiceNo = (transaction.invoiceNumber || 'Invoice').replace(/[/\\?%*:|"<>]/g, '_');
      const targetUri = `${baseDir}Invoice_${sanitizedInvoiceNo}_${Date.now()}.pdf`;

      if (printResult.base64) {
        await FileSystem.writeAsStringAsync(targetUri, printResult.base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        return targetUri;
      } else {
        try {
          await FileSystem.copyAsync({ from: printResult.uri, to: targetUri });
          return targetUri;
        } catch (copyErr) {
          console.warn('Fallback copyAsync failed, using raw URI:', copyErr);
        }
      }
    }
  } catch (writeErr) {
    console.warn('Could not write PDF invoice to cache directory:', writeErr);
  }

  return printResult.uri;
}
