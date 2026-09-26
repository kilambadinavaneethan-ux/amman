/**
 * Invoice Localization Helper
 * Provides English and Tamil label mappings for invoices, receipts, bills, and PDF generation.
 */

export interface InvoiceLabels {
  invoice: string;
  taxInvoice: string;
  bill: string;
  estimate: string;
  receipt: string;
  proforma: string;
  
  invoiceDate: string;
  dueDate: string;
  paymentMode: string;
  invoiceNo: string;
  
  billedTo: string;
  customerDetails: string;
  phone: string;
  address: string;
  gstin: string;
  
  itemIndex: string;
  item: string;
  qty: string;
  rate: string;
  total: string;
  itemsAndDescription: string;
  transactionSummaryRecord: string;
  
  subtotal: string;
  deliveryCharge: string;
  loadingCharge: string;
  unloadingCharge: string;
  extraCharge: string;
  taxGst: string;
  discount: string;
  
  currentBillTotal: string;
  oldBalanceDue: string;
  grandTotalInclDues: string;
  totalAmount: string;
  paidAmount: string;
  balanceDue: string;
  totalBalanceDue: string;
  
  scanToPay: string;
  scanToPayVerify: string;
  bankPaymentDetails: string;
  bankName: string;
  accountNo: string;
  ifscCode: string;
  accountHolder: string;
  
  statusPaid: string;
  statusPartiallyPaid: string;
  statusPending: string;
  statusOverdue: string;
  
  authorizedSignatory: string;
  notes: string;
  termsAndConditions: string;
  thankYouNote: string;
  avargal: string;
}

export const ENGLISH_INVOICE_LABELS: InvoiceLabels = {
  invoice: 'INVOICE',
  taxInvoice: 'TAX INVOICE',
  bill: 'BILL',
  estimate: 'ESTIMATE',
  receipt: 'RECEIPT',
  proforma: 'PROFORMA INVOICE',
  
  invoiceDate: 'INVOICE DATE',
  dueDate: 'DUE DATE',
  paymentMode: 'PAYMENT MODE',
  invoiceNo: 'INVOICE NO',
  
  billedTo: 'BILLED TO',
  customerDetails: 'CUSTOMER DETAILS',
  phone: 'Phone',
  address: 'Address',
  gstin: 'GSTIN',
  
  itemIndex: '#',
  item: 'ITEM',
  qty: 'QTY',
  rate: 'RATE',
  total: 'TOTAL',
  itemsAndDescription: 'Item & Description',
  transactionSummaryRecord: 'Transaction Summary Record',
  
  subtotal: 'Subtotal',
  deliveryCharge: 'Delivery / Freight',
  loadingCharge: 'Loading Charge',
  unloadingCharge: 'Unloading Charge',
  extraCharge: 'Extra Charge',
  taxGst: 'Tax / GST',
  discount: 'Discount',
  
  currentBillTotal: 'Current Bill Total',
  oldBalanceDue: 'Old Balance Due',
  grandTotalInclDues: 'Grand Total (incl. Dues)',
  totalAmount: 'Total Amount',
  paidAmount: 'Paid Amount',
  balanceDue: 'Balance Due',
  totalBalanceDue: 'Total Balance Due',
  
  scanToPay: 'Scan to Pay',
  scanToPayVerify: 'Scan to Pay / Verify',
  bankPaymentDetails: 'BANK PAYMENT DETAILS',
  bankName: 'Bank',
  accountNo: 'A/c',
  ifscCode: 'IFSC',
  accountHolder: 'Holder',
  
  statusPaid: 'PAID',
  statusPartiallyPaid: 'PARTIALLY PAID',
  statusPending: 'PENDING',
  statusOverdue: 'OVERDUE',
  
  authorizedSignatory: 'Authorized Signatory',
  notes: 'Notes',
  termsAndConditions: 'Terms & Conditions',
  thankYouNote: 'Thank you for your business! 🙏',
  avargal: 'அவர்கள்',
};

export const TAMIL_INVOICE_LABELS: InvoiceLabels = {
  invoice: 'விலைப்பட்டியல்',
  taxInvoice: 'வரி விலைப்பட்டியல்',
  bill: 'பில்',
  estimate: 'மதிப்பீடு',
  receipt: 'ரசீது',
  proforma: 'முன்மொழிவு ரசீது',
  
  invoiceDate: 'தேதி',
  dueDate: 'கெடு தேதி',
  paymentMode: 'செலுத்தும் முறை',
  invoiceNo: 'ரசீது எண்',
  
  billedTo: 'பெறுநர்',
  customerDetails: 'வாடிக்கையாளர் விவரம்',
  phone: 'தொலைபேசி',
  address: 'முகவரி',
  gstin: 'GST எண்',
  
  itemIndex: '#',
  item: 'பொருள்',
  qty: 'அளவு',
  rate: 'விலை',
  total: 'மொத்தம்',
  itemsAndDescription: 'பொருள் மற்றும் விவரம்',
  transactionSummaryRecord: 'பரிவர்த்தனை சுருக்க விவரம்',
  
  subtotal: 'கூட்டுத்தொகை',
  deliveryCharge: 'வண்டி வாடகை',
  loadingCharge: 'ஏற்றுக்கூலி',
  unloadingCharge: 'இறக்குக்கூலி',
  extraCharge: 'கூடுதல் கட்டணம்',
  taxGst: 'வரி / GST',
  discount: 'தள்ளுபடி',
  
  currentBillTotal: 'நடப்பு பில் தொகை',
  oldBalanceDue: 'பழைய பாக்கி',
  grandTotalInclDues: 'மொத்த தொகை (பாக்கி சேர்த்து)',
  totalAmount: 'மொத்த தொகை',
  paidAmount: 'செலுத்திய தொகை',
  balanceDue: 'மீதி பாக்கி',
  totalBalanceDue: 'மொத்த பாக்கி',
  
  scanToPay: 'ஸ்கேன் செய்து செலுத்தவும்',
  scanToPayVerify: 'ஸ்கேன் செய்து செலுத்தவும்',
  bankPaymentDetails: 'வங்கி விவரங்கள்',
  bankName: 'வங்கி',
  accountNo: 'கணக்கு எண்',
  ifscCode: 'IFSC குறியீடு',
  accountHolder: 'கணக்கு பெயர்',
  
  statusPaid: 'செலுத்தப்பட்டது',
  statusPartiallyPaid: 'பகுதி செலுத்தப்பட்டது',
  statusPending: 'நிலுவை',
  statusOverdue: 'கெடு முடிந்தது',
  
  authorizedSignatory: 'அங்கீகரிக்கப்பட்ட கையொப்பம்',
  notes: 'குறிப்பு',
  termsAndConditions: 'விதிமுறைகள் & நிபந்தனைகள்',
  thankYouNote: 'தங்களின் மேலான ஆதரவிற்கு மிக்க நன்றி! 🙏',
  avargal: 'அவர்கள்',
};

export const BRICK_CONSTRUCTION_TAMIL_LABELS: Partial<InvoiceLabels> = {
  invoice: 'பில் / ரசீது',
  taxInvoice: 'வரி ரசீது',
  bill: 'பில்',
  receipt: 'ரசீது',
  item: 'பொருள் (செங்கல் / மணல்)',
  qty: 'அளவு / லோடு',
  rate: 'விலை',
  total: 'தொகை',
  subtotal: 'பொருட்கள் தொகை',
  deliveryCharge: 'வண்டி வாடகை',
  loadingCharge: 'ஏற்றுக்கூலி',
  unloadingCharge: 'இறக்குக்கூலி',
  extraCharge: 'இதர செலவு',
  oldBalanceDue: 'பழைய பாக்கி',
  balanceDue: 'மீதி பாக்கி',
  currentBillTotal: 'நடப்பு பில் தொகை',
  totalBalanceDue: 'மொத்த பாக்கி',
  grandTotalInclDues: 'மொத்த தொகை (பாக்கி சேர்த்து)',
  bankPaymentDetails: 'வங்கி கணக்கு விவரம்',
  scanToPay: 'ஸ்கேன் செய்து செலுத்தவும்',
  authorizedSignatory: 'உரிமையாளர் கையொப்பம்',
  thankYouNote: 'வணக்கம்! தங்களின் மேலான ஆதரவிற்கு மிக்க நன்றி! 🙏',
  avargal: 'அவர்கள்',
};

export const STANDARD_COMMERCE_TAMIL_LABELS: Partial<InvoiceLabels> = {
  invoice: 'விலைப்பட்டியல்',
  taxInvoice: 'வரி விலைப்பட்டியல்',
  bill: 'பில்',
  receipt: 'ரசீது',
  item: 'பொருள்',
  qty: 'அளவு',
  rate: 'விலை',
  total: 'மொத்தம்',
  subtotal: 'துணை மொத்தம்',
  deliveryCharge: 'போக்குவரத்து கட்டணம்',
  loadingCharge: 'ஏற்று கூலி',
  unloadingCharge: 'இறக்கு கூலி',
  extraCharge: 'கூடுதல் கட்டணம்',
  oldBalanceDue: 'முந்தைய நிலுவை',
  balanceDue: 'நிலுவை தொகை',
  currentBillTotal: 'தற்போதைய பில் தொகை',
  totalBalanceDue: 'மொத்த நிலுவை தொகை',
  grandTotalInclDues: 'மொத்த தொகை (நிலுவை சேர்த்து)',
  bankPaymentDetails: 'வங்கி விவரங்கள்',
  scanToPay: 'ஸ்கேன் செய்து செலுத்தவும்',
  authorizedSignatory: 'அங்கீகரிக்கப்பட்ட கையொப்பம்',
  thankYouNote: 'தங்களின் மேலான ஆதரவிற்கு மிக்க நன்றி! 🙏',
  avargal: 'அவர்கள்',
};

/**
 * Returns the localized labels object based on the isTamil flag, custom labels, bilingual flag, and preset.
 */
export function getInvoiceLabels(
  isTamil?: boolean,
  customLabels?: Partial<InvoiceLabels>,
  isBilingual?: boolean,
  preset?: 'brick_construction' | 'standard'
): InvoiceLabels {
  if (!isTamil && !isBilingual) return ENGLISH_INVOICE_LABELS;

  const baseTamil = {
    ...TAMIL_INVOICE_LABELS,
    ...(preset === 'standard' ? STANDARD_COMMERCE_TAMIL_LABELS : BRICK_CONSTRUCTION_TAMIL_LABELS),
    ...(customLabels || {}),
  };

  if (!isBilingual) {
    return baseTamil;
  }

  // Bilingual formatting: "ENGLISH / TAMIL"
  const bilingualLabels: InvoiceLabels = { ...baseTamil };
  const keys = Object.keys(ENGLISH_INVOICE_LABELS) as (keyof InvoiceLabels)[];

  keys.forEach((k) => {
    const en = ENGLISH_INVOICE_LABELS[k];
    const ta = baseTamil[k];
    if (k === 'itemIndex') {
      bilingualLabels[k] = '#';
    } else if (k === 'thankYouNote') {
      bilingualLabels[k] = `${ta} / Thank you! 🙏`;
    } else if (en && ta && en !== ta) {
      bilingualLabels[k] = `${en} / ${ta}`;
    } else {
      bilingualLabels[k] = ta || en;
    }
  });

  return bilingualLabels;
}

/**
 * Translates a given title text to Tamil or Bilingual if active.
 */
export function getLocalizedInvoiceTitle(
  title: string | undefined,
  isTamil?: boolean,
  customTitle?: string,
  isBilingual?: boolean
): string {
  if (customTitle && customTitle.trim()) return customTitle.trim();
  if (!title) {
    if (isBilingual) return 'INVOICE / விலைப்பட்டியல்';
    return isTamil ? TAMIL_INVOICE_LABELS.invoice : ENGLISH_INVOICE_LABELS.invoice;
  }
  if (!isTamil && !isBilingual) return title;

  const trimmed = title.trim().toUpperCase();
  let tamilTitle = TAMIL_INVOICE_LABELS.invoice;

  if (trimmed === 'INVOICE') tamilTitle = TAMIL_INVOICE_LABELS.invoice;
  else if (trimmed === 'TAX INVOICE') tamilTitle = TAMIL_INVOICE_LABELS.taxInvoice;
  else if (trimmed === 'BILL') tamilTitle = TAMIL_INVOICE_LABELS.bill;
  else if (trimmed === 'ESTIMATE') tamilTitle = TAMIL_INVOICE_LABELS.estimate;
  else if (trimmed === 'RECEIPT') tamilTitle = TAMIL_INVOICE_LABELS.receipt;
  else if (trimmed === 'PROFORMA' || trimmed === 'PROFORMA INVOICE') tamilTitle = TAMIL_INVOICE_LABELS.proforma;
  else tamilTitle = title;

  if (isBilingual) {
    return `${title} / ${tamilTitle}`;
  }

  return tamilTitle;
}

/**
 * Formats a customer name with the Tamil honorific (அவர்கள்) if enabled.
 */
export function formatCustomerNameWithHonorific(
  name: string | undefined,
  isTamil?: boolean,
  includeHonorific?: boolean,
  customHonorific?: string
): string {
  if (!name) return '';
  if (!isTamil || !includeHonorific) return name;
  const honorific = customHonorific?.trim() || TAMIL_INVOICE_LABELS.avargal || 'அவர்கள்';
  if (name.endsWith(honorific)) return name;
  return `${name} ${honorific}`;
}

