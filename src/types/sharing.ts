export type ShareFormat = 'IMAGE' | 'PDF' | 'TEXT';

export interface TransactionItem {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  unit?: string;
}

export interface BankAccount {
  id: string;
  bankName: string;
  accountNo: string;
  ifscCode: string;
  accountHolderName?: string;
  isPrimary?: boolean;
}

export interface CompanyDetails {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  gstNo?: string;
  logoUrl?: string;
  signatureUrl?: string;
  bankName?: string;
  accountNo?: string;
  ifscCode?: string;
  upiId?: string;
}

export interface CustomerDetails {
  name: string;
  phone?: string;
  phoneNumbers?: string[];
  email?: string;
  address?: string;
  gstNo?: string;
}

export function formatCustomerPhoneNumbers(
  phone?: string,
  phoneNumbers?: string[]
): string[] {
  const result: string[] = [];
  if (Array.isArray(phoneNumbers)) {
    phoneNumbers.forEach((p) => {
      if (typeof p === 'string' && p.trim()) {
        p.split(/[,/|]+/).forEach((sub) => {
          const trimmed = sub.trim();
          if (trimmed && !result.includes(trimmed)) {
            result.push(trimmed);
          }
        });
      }
    });
  }
  if (typeof phone === 'string' && phone.trim()) {
    phone.split(/[,/|]+/).forEach((sub) => {
      const trimmed = sub.trim();
      if (trimmed && !result.includes(trimmed)) {
        result.push(trimmed);
      }
    });
  }
  return result;
}

export function formatCustomerPhonesDisplay(
  phone?: string,
  phoneNumbers?: string[],
  separator: string = ', '
): string {
  const numbers = formatCustomerPhoneNumbers(phone, phoneNumbers);
  return numbers.join(separator);
}

export interface TransactionData {
  id: string;
  transactionType?: 'invoice' | 'order' | 'expense' | 'purchase' | 'payment';
  invoiceNumber: string;
  date: Date | string;
  dueDate?: Date | string;
  customer: CustomerDetails;
  items: TransactionItem[];
  subtotal: number;
  shipmentCharge?: number;
  loadingCharge?: number;
  unloadingCharge?: number;
  extraAmount?: number;
  extraAmountDescription?: string;
  charges?: Array<{ name: string; amount: number }>;
  taxAmount?: number;
  discountAmount?: number;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  previousBalance?: number;
  paymentStatus: 'PAID' | 'PARTIAL' | 'PENDING' | 'OVERDUE' | string;
  paymentMethod?: string;
  notes?: string;
  company?: CompanyDetails;
  paymentLink?: string;
}

export interface ShareSettings {
  defaultFormat: ShareFormat;
  includeLogo: boolean;
  includeSignature: boolean;
  signatureTitle?: string;
  includeQrCode: boolean;
  upiId?: string;
  useCustomQrCode?: boolean;
  customQrCodeUri?: string;
  includeGst: boolean;
  gstNo?: string;
  includeCustomerAddress: boolean;
  includeCustomerPhone?: boolean;
  includeCompanyDetails?: boolean;
  highQualityImage: boolean;
  paperSize?: 'A4' | 'LETTER' | 'THERMAL_80MM';
  themeColor?: string;
  watermarkEnabled: boolean;
  watermarkText: string;
  watermarkOpacity?: number;
  paymentDisplayMode?: 'QR' | 'BANK' | 'BOTH' | 'NONE';
  includeBankDetails?: boolean;
  bankName?: string;
  accountNo?: string;
  ifscCode?: string;
  accountHolderName?: string;
  bankAccounts?: BankAccount[];
  selectedBankAccountId?: string;
  customMessageTemplate?: string;
  customerMessageTemplate?: string;
  thankYouNote?: string;
  termsAndConditions?: string;
}

export interface CustomerShareData {
  customer: {
    id: string;
    name: string;
    salutation?: string;
    suffix?: string;
    phone?: string;
    phoneNumbers?: string[];
    address?: string;
    gstin?: string;
    email?: string;
    isSpecial?: boolean;
    openingBalance?: number;
    totalBalance?: number;
  };
  dueDates?: Array<{
    id: string;
    date: string;
    notes?: string;
    status: string;
  }>;
  summary: {
    totalOrdersCount: number;
    totalSalesAmount: number;
    totalPaidAmount: number;
    oldBalanceDue: number;
    netBalanceDue: number;
  };
  ledger: Array<{
    id: string;
    date: Date | string;
    type: 'order' | 'payment' | 'opening';
    description: string;
    notes?: string;
    amount: number;
    paid: number;
    balance: number;
    items?: Array<{
      name: string;
      quantity: number;
      rate: number;
      unit?: string;
      total: number;
    }>;
    rate?: number;
    quantity?: number;
    unit?: string;
    shipmentCharge?: number;
    loadingCharge?: number;
    unloadingCharge?: number;
    extraAmount?: number;
    extraAmountDescription?: string;
    taxAmount?: number;
    discountAmount?: number;
  }>;
  options?: {
    includeProfileInfo?: boolean;
    includeDueDates?: boolean;
    includeSummary?: boolean;
    includeLedger?: boolean;
  };
}

export const DEFAULT_CUSTOMER_MESSAGE_TEMPLATE = `👤 *CUSTOMER ACCOUNT STATEMENT*
*{company}*
------------------------------
*Customer Name:* {customer_name}
*Phone:* {customer_phone}
------------------------------
📊 *ACCOUNT CALCULATION SUMMARY*
• *Total Orders:* {total_orders}
• *Old Dues:* {old_balance}
• *Total Sales:* +{total_sales}
• *Grand Total (incl. Dues):* {grand_total}
• *Total Amount Paid:* −{total_paid}
------------------------------
💰 *NET BALANCE DUE:* {net_balance_due}
------------------------------
{ledger_summary}
------------------------------
💳 *PAYMENT VIA UPI:*
{upi_link}

Thank you for your valued partnership! 🙏`;

export const DEFAULT_SHARE_SETTINGS: ShareSettings = {
  defaultFormat: 'IMAGE',
  includeLogo: true,
  includeSignature: true,
  signatureTitle: 'Authorized Signatory',
  includeQrCode: true,
  upiId: '',
  useCustomQrCode: false,
  customQrCodeUri: '',
  paymentDisplayMode: 'BOTH',
  includeBankDetails: true,
  bankName: '',
  accountNo: '',
  ifscCode: '',
  accountHolderName: '',
  bankAccounts: [],
  selectedBankAccountId: '',
  includeGst: true,
  gstNo: '',
  includeCustomerAddress: true,
  includeCustomerPhone: true,
  highQualityImage: true,
  paperSize: 'A4',
  themeColor: '#2563EB',
  watermarkEnabled: false,
  watermarkText: 'CONFIDENTIAL',
  watermarkOpacity: 0.12,
  customMessageTemplate: '🧾 *RECEIPT / INVOICE*\n*{company}*\n------------------------------\n*Invoice No:* #{invoice}\n*Date:* {date}\n*Customer:* {customer}\n------------------------------\n{calculations}\n------------------------------\nThank you for doing business with us! 🙏',
  customerMessageTemplate: DEFAULT_CUSTOMER_MESSAGE_TEMPLATE,
  thankYouNote: 'Thank you for your business! 🙏',
  termsAndConditions: '1. Goods once sold will not be taken back.\n2. Payment due within 15 days from date of invoice.',
};

// ═══════════════════════════════════════════════════════════════════
// INVOICE TEMPLATE — Full customization for invoice layout & style
// ═══════════════════════════════════════════════════════════════════

export type HeaderLayout = 'classic' | 'modern' | 'minimal' | 'centered';
export type TableStyle = 'striped' | 'bordered' | 'clean' | 'minimal';
export type InvoiceFontFamily = 'Helvetica' | 'Georgia' | 'Courier' | 'Arial' | 'Times';
export type BorderStyle = 'solid' | 'dashed' | 'none';

export interface InvoiceTemplate {
  // Header
  headerLayout: HeaderLayout;
  showCompanyLogo: boolean;
  showCompanyName: boolean;
  showCompanyPhone: boolean;
  showCompanyEmail: boolean;
  showCompanyAddress: boolean;
  showCompanyGst: boolean;
  invoiceTitleText: string;

  // Customer Section
  showCustomerSection: boolean;
  showCustomerPhone: boolean;
  showCustomerAddress: boolean;
  showCustomerGst: boolean;
  customerSectionTitle: string;

  // Meta / Details Row
  showInvoiceDate: boolean;
  showDueDate: boolean;
  showPaymentMethod: boolean;
  showInvoiceNumber: boolean;

  // Items Table
  tableStyle: TableStyle;
  showItemIndex: boolean;
  showItemUnit: boolean;
  showItemRate: boolean;
  tableHeaderBg: string;
  tableHeaderTextColor: string;

  // Summary / Totals & Charges
  showSubtotal: boolean;
  showDeliveryCharge: boolean;
  showLoadingCharge: boolean;
  showUnloadingCharge: boolean;
  showExtraCharge: boolean;
  showTax: boolean;
  showDiscount: boolean;
  showPaidAmount: boolean;
  showOldBalanceDue: boolean;
  showBalanceDue: boolean;
  showPaymentStatus: boolean;

  // Footer
  showNotes: boolean;
  showTerms: boolean;
  showSignature: boolean;
  showQrCode: boolean;
  useCustomQrCode?: boolean;
  customQrCodeUri?: string;
  paymentDisplayMode?: 'QR' | 'BANK' | 'BOTH' | 'NONE';
  showBankDetails?: boolean;
  bankName?: string;
  accountNo?: string;
  ifscCode?: string;
  accountHolderName?: string;
  bankAccounts?: BankAccount[];
  selectedBankAccountId?: string;
  showThankYouNote: boolean;
  showFooterBranding: boolean;
  footerBrandingText: string;

  // Typography
  fontFamily: InvoiceFontFamily;
  baseFontSize: number;
  headingColor: string;
  bodyTextColor: string;

  // Layout
  accentColor: string;
  borderStyle: BorderStyle;
  borderColor: string;
  pageBackground: string;
}

export const DEFAULT_INVOICE_TEMPLATE: InvoiceTemplate = {
  // Header
  headerLayout: 'classic',
  showCompanyLogo: true,
  showCompanyName: true,
  showCompanyPhone: true,
  showCompanyEmail: true,
  showCompanyAddress: true,
  showCompanyGst: true,
  invoiceTitleText: 'INVOICE',

  // Customer Section
  showCustomerSection: true,
  showCustomerPhone: true,
  showCustomerAddress: true,
  showCustomerGst: true,
  customerSectionTitle: 'Billed To',

  // Meta
  showInvoiceDate: true,
  showDueDate: true,
  showPaymentMethod: true,
  showInvoiceNumber: true,

  // Items Table
  tableStyle: 'striped',
  showItemIndex: true,
  showItemUnit: true,
  showItemRate: true,
  tableHeaderBg: '#0F172A',
  tableHeaderTextColor: '#FFFFFF',

  // Summary
  showSubtotal: true,
  showDeliveryCharge: true,
  showLoadingCharge: true,
  showUnloadingCharge: true,
  showExtraCharge: true,
  showTax: true,
  showDiscount: true,
  showPaidAmount: true,
  showOldBalanceDue: true,
  showBalanceDue: true,
  showPaymentStatus: false,

  // Footer
  showNotes: true,
  showTerms: true,
  showSignature: true,
  showQrCode: true,
  useCustomQrCode: false,
  customQrCodeUri: '',
  paymentDisplayMode: 'BOTH',
  showBankDetails: true,
  bankName: '',
  accountNo: '',
  ifscCode: '',
  accountHolderName: '',
  bankAccounts: [],
  selectedBankAccountId: '',
  showThankYouNote: true,
  showFooterBranding: false,
  footerBrandingText: '',

  // Typography
  fontFamily: 'Helvetica',
  baseFontSize: 12,
  headingColor: '#0F172A',
  bodyTextColor: '#334155',

  // Layout
  accentColor: '#2563EB',
  borderStyle: 'solid',
  borderColor: '#E2E8F0',
  pageBackground: '#FFFFFF',
};

export interface InvoicePreset {
  id: string;
  name: string;
  description: string;
  icon: string;
  template: InvoiceTemplate;
}

export const INVOICE_PRESETS: InvoicePreset[] = [
  {
    id: 'professional',
    name: 'Professional',
    description: 'Clean corporate look with all details',
    icon: 'business-center',
    template: { ...DEFAULT_INVOICE_TEMPLATE },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Stripped-down essentials only',
    icon: 'remove-circle-outline',
    template: {
      ...DEFAULT_INVOICE_TEMPLATE,
      headerLayout: 'minimal',
      showCompanyEmail: false,
      showCompanyAddress: false,
      showCompanyGst: false,
      showCustomerAddress: false,
      showCustomerGst: false,
      showDueDate: false,
      showPaymentMethod: false,
      tableStyle: 'clean',
      showItemIndex: false,
      showItemUnit: false,
      showTax: false,
      showDiscount: false,
      showNotes: false,
      showTerms: false,
      showSignature: false,
      showQrCode: false,
      showFooterBranding: false,
      tableHeaderBg: '#F8FAFC',
      tableHeaderTextColor: '#0F172A',
      accentColor: '#64748B',
      headingColor: '#334155',
    },
  },
  {
    id: 'bold',
    name: 'Bold',
    description: 'Vibrant colors with strong headings',
    icon: 'format-bold',
    template: {
      ...DEFAULT_INVOICE_TEMPLATE,
      headerLayout: 'modern',
      invoiceTitleText: 'TAX INVOICE',
      tableStyle: 'bordered',
      tableHeaderBg: '#7C3AED',
      tableHeaderTextColor: '#FFFFFF',
      accentColor: '#7C3AED',
      headingColor: '#4C1D95',
      baseFontSize: 13,
      borderStyle: 'solid',
      borderColor: '#DDD6FE',
    },
  },
  {
    id: 'classic',
    name: 'Classic',
    description: 'Traditional serif style invoice',
    icon: 'auto-stories',
    template: {
      ...DEFAULT_INVOICE_TEMPLATE,
      headerLayout: 'centered',
      fontFamily: 'Georgia',
      invoiceTitleText: 'BILL OF SALE',
      customerSectionTitle: 'Customer Details',
      tableStyle: 'bordered',
      tableHeaderBg: '#1E293B',
      tableHeaderTextColor: '#F8FAFC',
      accentColor: '#B45309',
      headingColor: '#1E293B',
      bodyTextColor: '#1E293B',
      borderStyle: 'solid',
      borderColor: '#CBD5E1',
      baseFontSize: 12,
    },
  },
];
