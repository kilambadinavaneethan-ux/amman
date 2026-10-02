import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import {
  CustomerShareData,
  ShareSettings,
  InvoiceTemplate,
  formatCustomerPhonesDisplay,
  AppaBillTheme,
  AppaEstimateBillSettings,
  DEFAULT_APPA_ESTIMATE_BILL_SETTINGS,
} from '../../types/sharing';

export type { AppaBillTheme };

export interface AppaBillThemeConfig {
  id: AppaBillTheme;
  label: string;
  icon: string;
  paperBg: string;
  cardBg: string;
  inkColor: string;
  subTextColor: string;
  lineColor: string;
  gridLineColor: string;
  highlightColor: string;
  headerBg: string;
  totalRowBg: string;
  stampBorderColor: string;
  stampTextColor: string;
  badgeDueBg: string;
  badgeDueBorder: string;
  badgeDueText: string;
  badgeSettledBg: string;
  badgeSettledText: string;
}

export const APPA_BILL_THEMES: Record<AppaBillTheme, AppaBillThemeConfig> = {
  classic: {
    id: 'classic',
    label: '📜 Classic Ivory',
    icon: 'auto-stories',
    paperBg: '#F6F2E5',
    cardBg: '#FFFDF7',
    inkColor: '#0F2942',
    subTextColor: '#475569',
    lineColor: '#0F2942',
    gridLineColor: '#2563EB55',
    highlightColor: '#B91C1C',
    headerBg: '#EFE7D0',
    totalRowBg: '#E9E0C4',
    stampBorderColor: '#B91C1C',
    stampTextColor: '#B91C1C',
    badgeDueBg: '#FEE2E2',
    badgeDueBorder: '#FCA5A5',
    badgeDueText: '#B91C1C',
    badgeSettledBg: '#ECFDF5',
    badgeSettledText: '#047857',
  },
  blue: {
    id: 'blue',
    label: '📘 Royal Blue',
    icon: 'format-paint',
    paperBg: '#F1F5F9',
    cardBg: '#FFFFFF',
    inkColor: '#1E3A8A',
    subTextColor: '#3B82F6',
    lineColor: '#1E3A8A',
    gridLineColor: '#3B82F655',
    highlightColor: '#DC2626',
    headerBg: '#DBEAFE',
    totalRowBg: '#BFDBFE',
    stampBorderColor: '#1D4ED8',
    stampTextColor: '#1D4ED8',
    badgeDueBg: '#FEF2F2',
    badgeDueBorder: '#FECACA',
    badgeDueText: '#DC2626',
    badgeSettledBg: '#F0FDF4',
    badgeSettledText: '#15803D',
  },
  sepia: {
    id: 'sepia',
    label: '🟤 Vintage Sepia',
    icon: 'history-edu',
    paperBg: '#F2E8D5',
    cardBg: '#FAF3E3',
    inkColor: '#451A03',
    subTextColor: '#78350F',
    lineColor: '#451A03',
    gridLineColor: '#92400E55',
    highlightColor: '#991B1B',
    headerBg: '#E7D8BC',
    totalRowBg: '#DECBA9',
    stampBorderColor: '#991B1B',
    stampTextColor: '#991B1B',
    badgeDueBg: '#FEE2E2',
    badgeDueBorder: '#F87171',
    badgeDueText: '#991B1B',
    badgeSettledBg: '#FEF3C7',
    badgeSettledText: '#92400E',
  },
  emerald: {
    id: 'emerald',
    label: '🟢 Emerald Ledger',
    icon: 'eco',
    paperBg: '#ECFDF5',
    cardBg: '#F7FEFA',
    inkColor: '#064E3B',
    subTextColor: '#047857',
    lineColor: '#064E3B',
    gridLineColor: '#05966955',
    highlightColor: '#B91C1C',
    headerBg: '#D1FAE5',
    totalRowBg: '#A7F3D0',
    stampBorderColor: '#047857',
    stampTextColor: '#047857',
    badgeDueBg: '#FEF2F2',
    badgeDueBorder: '#FECACA',
    badgeDueText: '#DC2626',
    badgeSettledBg: '#ECFDF5',
    badgeSettledText: '#065F46',
  },
  dark: {
    id: 'dark',
    label: '🌑 Sleek Dark',
    icon: 'dark-mode',
    paperBg: '#090D16',
    cardBg: '#0F172A',
    inkColor: '#F8FAFC',
    subTextColor: '#94A3B8',
    lineColor: '#64748B',
    gridLineColor: '#334155',
    highlightColor: '#F87171',
    headerBg: '#1E293B',
    totalRowBg: '#334155',
    stampBorderColor: '#38BDF8',
    stampTextColor: '#38BDF8',
    badgeDueBg: '#450A0A',
    badgeDueBorder: '#991B1B',
    badgeDueText: '#FCA5A5',
    badgeSettledBg: '#064E3B',
    badgeSettledText: '#6EE7B7',
  },
};

interface AppaEstimateBillViewProps {
  data: CustomerShareData;
  company?: any;
  settings?: ShareSettings;
  template?: InvoiceTemplate;
  isDark?: boolean;
  billTheme?: AppaBillTheme;
  billNo?: string;
  invocationText?: string;
  appaBillSettings?: Partial<AppaEstimateBillSettings>;
}

function formatDateDMY(dateVal: Date | string | undefined): string {
  if (!dateVal) return '';
  const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
  if (isNaN(d.getTime())) return String(dateVal);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  return `${day}.${month}.${year}`;
}

function formatFullDate(dateVal: Date | string | undefined): string {
  if (!dateVal) return '';
  const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
  if (isNaN(d.getTime())) return String(dateVal);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatCurrency(amount: number | undefined): string {
  if (amount === undefined || amount === null || isNaN(amount)) return '₹0.00';
  return `₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const AppaEstimateBillView = React.forwardRef<View, AppaEstimateBillViewProps>(
  (
    {
      data,
      company = {},
      settings,
      template,
      isDark = false,
      billTheme = 'classic',
      billNo = '1',
      invocationText,
      appaBillSettings: propAppaSettings,
    },
    ref
  ) => {
    const cfg: AppaEstimateBillSettings = {
      ...DEFAULT_APPA_ESTIMATE_BILL_SETTINGS,
      ...(template?.appaBillSettings || {}),
      ...(propAppaSettings || {}),
    };

    const activeThemeKey: AppaBillTheme = isDark && (billTheme === 'classic' || !billTheme)
      ? 'dark'
      : (billTheme || cfg.defaultTheme || 'classic');
    const theme = APPA_BILL_THEMES[activeThemeKey] || APPA_BILL_THEMES.classic;

    let companyPhones: string[] = [];
    if (cfg.phoneNumbers && Array.isArray(cfg.phoneNumbers) && cfg.phoneNumbers.some((p) => p.trim())) {
      companyPhones = cfg.phoneNumbers.map((p) => p.trim()).filter(Boolean);
    } else if (cfg.customPhones?.trim()) {
      companyPhones = cfg.customPhones.split(/[•,]/).map((p) => p.trim()).filter(Boolean);
    } else {
      const rawCompanyPhone = company.phone || '99430 51509';
      const altPhone = company.alternatePhone || '99430 51209';
      companyPhones = [rawCompanyPhone, altPhone].filter(Boolean);
    }

    const companyName = cfg.customCompanyName?.trim() || company.name || 'அம்மன் ஹாலோ பிரிக்ஸ்';
    const companyAddress = cfg.customAddress?.trim() || company.address || '11, கரூர் மெயின் ரோடு, வெங்கமேடு, தளவாபாளையம், Po. புகழூர் D.T - 638153';

    const effectiveInvocation = invocationText || cfg.invocationText || '|| ஸ்ரீ சொக்கநாச்சி அம்மன் துணை ||';
    const titleEnglish = cfg.titleEnglish || 'ESTEEMATE';
    const titleTamil = cfg.titleTamil || 'மதிப்பீட்டு பில் / ESTIMATE BILL';


    const customerName = data.customer.name || 'வாடிக்கையாளர்';
    const customerAddress = data.customer.address || '';
    const customerPhones = formatCustomerPhonesDisplay(data.customer.phone, data.customer.phoneNumbers);

    const ledger = data.ledger || [];
    const totalDebit = ledger
      .filter((l) => l.type === 'order' || l.type === 'opening')
      .reduce((sum, l) => sum + (l.amount || 0), 0);
    const totalCredit = ledger.reduce((sum, l) => sum + (l.paid || 0), 0);
    const netDue = data.summary.netBalanceDue;
    const isPaid = (netDue || 0) <= 0;

    // Optional UPI QR code integration
    const showQr = (cfg.showQrCode !== false) && settings?.includeQrCode !== false && !isPaid;
    const targetUpi = (settings?.upiId || company?.upiId || '').trim();
    const payeeName = encodeURIComponent((company?.name || 'Business').trim());
    const txNote = encodeURIComponent(`Bill for ${customerName}`.trim());
    const upiPayload = targetUpi
      ? `upi://pay?pa=${targetUpi}&pn=${payeeName}&cu=INR&tn=${txNote}`
      : `Customer Statement: ${customerName} | Balance: ${netDue}`;

    const qrCodeUrl = template?.useCustomQrCode && template?.customQrCodeUri
      ? template.customQrCodeUri
      : `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(upiPayload)}`;

    // Bank Details setup
    const showBank = (cfg.showBankDetails !== false) && (settings?.includeBankDetails !== false);
    const activeBankAcc = settings?.bankAccounts?.find(a => a.id === settings.selectedBankAccountId) || settings?.bankAccounts?.[0];
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

    return (
      <View ref={ref} collapsable={false} style={[styles.container, { backgroundColor: theme.paperBg }]}>
        {/* Double-Ruled Outer Ledger Border Frame */}
        <View style={[styles.outerBorder, { borderColor: theme.lineColor, backgroundColor: theme.cardBg }]}>
          {/* Inner Decorative Corner Frame Line */}
          <View style={[styles.innerFrame, { borderColor: theme.lineColor }]}>
            {/* 1. Top Auspicious Divine Invocation & Top-Right Phones */}
            <View style={styles.topBarRow}>
              {/* Top-Left Company Logo */}
              {showLogo && effectiveLogoUri ? (
                <View style={styles.topLogoContainer}>
                  <Image
                    source={{ uri: effectiveLogoUri }}
                    style={styles.companyLogo}
                    contentFit="contain"
                  />
                </View>
              ) : null}

              <View style={styles.topInvocationContainer}>
                <Text
                  style={[
                    styles.invocationText,
                    {
                      color: cfg.invocationColor || theme.highlightColor,
                      fontSize: cfg.invocationFontSize || 14,
                    },
                  ]}
                >
                  {effectiveInvocation}
                </Text>
              </View>

              {/* Top-Right Phone Numbers Column */}
              <View style={styles.topPhonesContainer}>
                {companyPhones.map((phone, idx) => (
                  <Text key={idx} style={[styles.phoneText, { color: theme.inkColor, marginTop: idx > 0 ? 2 : 0 }]}>
                    {idx === 0 ? '📞 ' : ''}{phone}
                  </Text>
                ))}
              </View>
            </View>

            {/* 2. Business Branding & Address (Centered) */}
            <View style={styles.companyCenterBlock}>
              <Text
                style={[
                  styles.companyTitle,
                  {
                    color: cfg.companyNameColor || theme.inkColor,
                    fontSize: cfg.companyNameFontSize || 20,
                  },
                ]}
              >
                {companyName.toUpperCase()}
              </Text>
              <Text
                style={[
                  styles.companyAddress,
                  {
                    color: cfg.companyAddressColor || theme.subTextColor,
                    fontSize: cfg.companyAddressFontSize || 11.5,
                  },
                ]}
              >
                {companyAddress}
              </Text>
            </View>

            {/* 3. English Title & Tamil Subtitle (Centered) */}
            <View style={styles.titleRow}>
              <Text
                style={[
                  styles.estimateTitle,
                  {
                    color: cfg.titleEnglishColor || theme.inkColor,
                    fontSize: cfg.titleEnglishFontSize || 28,
                    lineHeight: (cfg.titleEnglishFontSize || 28) + 4,
                  },
                ]}
              >
                {titleEnglish}
              </Text>
              <Text
                style={[
                  styles.estimateSubTitle,
                  {
                    color: cfg.titleTamilColor || theme.subTextColor,
                    fontSize: cfg.titleTamilFontSize || 11,
                  },
                ]}
              >
                {titleTamil}
              </Text>
            </View>

            {/* Bill Date Bar */}
            <View style={[styles.metaRow, { borderColor: theme.lineColor, backgroundColor: theme.headerBg + '40', justifyContent: 'flex-end' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[styles.metaLabel, { color: theme.inkColor }]}>தேதி: </Text>
                <Text style={[styles.metaValue, { color: theme.inkColor }]}>
                  {formatFullDate(new Date())}
                </Text>
              </View>
            </View>

            {/* Customer (Billed To) Section */}
            <View style={[styles.customerSection, { borderColor: theme.gridLineColor }]}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline' }}>
                {(() => {
                  const nameStr = customerName || '';
                  const nameHasAvargal = nameStr.endsWith('அவர்கள்');
                  const mainName = nameHasAvargal ? nameStr.replace(/\s*அவர்கள்$/, '').trim() : nameStr;
                  const honorificColor = cfg.customerHonorificColor || theme.subTextColor;
                  const honorificSize = cfg.customerHonorificFontSize || 12;

                  return (
                    <Text style={[styles.customerName, { color: theme.inkColor }]}>
                      {mainName}
                      {nameHasAvargal && (
                        <Text
                          style={{
                            fontSize: honorificSize,
                            fontWeight: '700',
                            color: honorificColor,
                          }}
                        >
                          {' '}அவர்கள்
                        </Text>
                      )}
                    </Text>
                  );
                })()}
              </View>
              {customerAddress ? (
                <Text style={[styles.customerAddressText, { color: theme.subTextColor }]}>
                  📍 {customerAddress}
                </Text>
              ) : null}
              {customerPhones ? (
                <Text style={[styles.customerPhoneText, { color: theme.subTextColor }]}>
                  📱 {customerPhones}
                </Text>
              ) : null}
            </View>

            {/* 6-Column Traditional Tamil Ledger Grid */}
            <View style={[styles.tableContainer, { borderColor: theme.lineColor }]}>
              {/* Table Header Row */}
              <View style={[styles.tableHeaderRow, { borderBottomColor: theme.lineColor, backgroundColor: theme.headerBg }]}>
                <View style={[styles.colIndex, { borderRightColor: theme.lineColor }]}>
                  <Text style={[styles.tableHeaderText, { color: theme.inkColor }]}>{cfg.columnLabels?.sno || 'வ. எண்'}</Text>
                  <Text style={[styles.tableHeaderSub, { color: theme.subTextColor }]}>S.No</Text>
                </View>
                <View style={[styles.colDate, { borderRightColor: theme.lineColor }]}>
                  <Text style={[styles.tableHeaderText, { color: theme.inkColor }]}>{cfg.columnLabels?.date || 'தேதி'}</Text>
                  <Text style={[styles.tableHeaderSub, { color: theme.subTextColor }]}>Date</Text>
                </View>
                <View style={[styles.colParticulars, { borderRightColor: theme.lineColor }]}>
                  <Text style={[styles.tableHeaderText, { color: theme.inkColor }]}>{cfg.columnLabels?.description || 'விபரம் (பொருட்கள் / கூலி விவரம்)'}</Text>
                  <Text style={[styles.tableHeaderSub, { color: theme.subTextColor }]}>Particulars</Text>
                </View>
                <View style={[styles.colDebit, { borderRightColor: theme.lineColor }]}>
                  <Text style={[styles.tableHeaderText, { color: theme.inkColor }]}>{cfg.columnLabels?.debit || 'பற்று (+)'}</Text>
                  <Text style={[styles.tableHeaderSub, { color: theme.highlightColor }]}>Debit</Text>
                </View>
                <View style={[styles.colCredit, { borderRightColor: theme.lineColor }]}>
                  <Text style={[styles.tableHeaderText, { color: theme.inkColor }]}>{cfg.columnLabels?.credit || 'வரவு (-)'}</Text>
                  <Text style={[styles.tableHeaderSub, { color: '#047857' }]}>Credit</Text>
                </View>
                <View style={styles.colBalance}>
                  <Text style={[styles.tableHeaderText, { color: theme.inkColor }]}>{cfg.columnLabels?.balance || 'பாக்கி'}</Text>
                  <Text style={[styles.tableHeaderSub, { color: theme.subTextColor }]}>Balance</Text>
                </View>
              </View>

              {/* Table Body Rows */}
              {ledger.length === 0 ? (
                <View style={[styles.tableRow, { borderBottomColor: theme.gridLineColor }]}>
                  <Text style={[styles.emptyLedgerText, { color: theme.subTextColor }]}>
                    பதிவுகள் ஏதுமில்லை (No transaction records found)
                  </Text>
                </View>
              ) : (
                ledger.map((item, index) => {
                  const isOrder = item.type === 'order';
                  const isPayment = item.type === 'payment';
                  const isOpening = item.type === 'opening';

                  const dmy = formatDateDMY(item.date);
                  const debitVal = isOrder || isOpening ? item.amount : 0;
                  const creditVal = isPayment ? item.paid : 0;

                  return (
                    <View
                      key={item.id || index}
                      style={[
                        styles.tableRow,
                        { borderBottomColor: theme.gridLineColor },
                        index % 2 === 1 && { backgroundColor: theme.headerBg + '25' },
                      ]}
                    >
                      <View style={[styles.colIndex, { borderRightColor: theme.gridLineColor }]}>
                        <Text style={[styles.rowCellText, { color: theme.inkColor, textAlign: 'center', fontWeight: '700' }]}>
                          {index + 1}
                        </Text>
                      </View>
                      <View style={[styles.colDate, { borderRightColor: theme.gridLineColor }]}>
                        <Text style={[styles.rowCellText, { color: theme.inkColor, textAlign: 'center', fontSize: 11 }]}>
                          {dmy}
                        </Text>
                      </View>

                      {/* Particulars Cell with Detailed Items Structure */}
                      <View style={[styles.colParticulars, { borderRightColor: theme.gridLineColor }]}>
                        {isOpening ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text style={[styles.rowCellText, { color: theme.highlightColor, fontWeight: '800' }]}>
                              முந்தைய பாக்கி (Old Balance Due)
                            </Text>
                          </View>
                        ) : isPayment ? (
                          <View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <Text style={{ fontSize: 11, color: '#047857' }}>💳</Text>
                              <Text style={[styles.rowCellText, { color: '#047857', fontWeight: '800' }]}>
                                {item.description || 'ரொக்கம் வரவு (Payment)'}
                              </Text>
                            </View>
                            {item.notes ? (
                              <Text style={{ fontSize: 10, color: theme.subTextColor, fontStyle: 'italic', marginTop: 1 }}>
                                ({item.notes})
                              </Text>
                            ) : null}
                          </View>
                        ) : (
                          <View>
                            {item.items && item.items.length > 0 ? (
                              item.items.map((it, itIdx) => {
                                const rate = it.rate || (it.total && it.quantity ? it.total / it.quantity : 0);
                                return (
                                  <View key={itIdx} style={styles.particularItemRow}>
                                    <Text style={[styles.particularItemBullet, { color: theme.inkColor }]}>•</Text>
                                    <Text style={[styles.particularItemName, { color: theme.inkColor }]}>
                                      {it.name}
                                    </Text>
                                    <Text style={[styles.particularItemQty, { color: theme.subTextColor }]}>
                                      - {it.quantity}X{rate} =
                                    </Text>
                                    <Text style={[styles.particularItemTotal, { color: theme.inkColor }]}>
                                      {Math.round(it.total).toLocaleString('en-IN')}
                                    </Text>
                                  </View>
                                );
                              })
                            ) : (
                              <Text style={[styles.rowCellText, { color: theme.inkColor, fontWeight: '700' }]}>
                                {item.description || 'ஆர்டர் விபரம்'}
                              </Text>
                            )}

                            {/* Additional Service Charges formatted as clean subtext */}
                            {(() => {
                              const extras: string[] = [];
                              if (item.shipmentCharge) extras.push(`வண்டி வாடகை: ₹${item.shipmentCharge}`);
                              if (item.loadingCharge) extras.push(`ஏற்று கூலி: ₹${item.loadingCharge}`);
                              if (item.unloadingCharge) extras.push(`இறக்கு கூலி: ₹${item.unloadingCharge}`);
                              if (item.extraAmount) extras.push(`கூடுதல்: ₹${item.extraAmount}`);
                              if (item.notes) extras.push(item.notes);
                              if (extras.length === 0) return null;
                              return (
                                <Text style={{ fontSize: 10, color: theme.subTextColor, marginTop: 2 }}>
                                  ({extras.join(', ')})
                                </Text>
                              );
                            })()}
                          </View>
                        )}
                      </View>

                      {/* Debit (+) Cell */}
                      <View style={[styles.colDebit, { borderRightColor: theme.gridLineColor }]}>
                        <Text style={[styles.rowCellText, { color: debitVal ? theme.highlightColor : theme.subTextColor, textAlign: 'right', fontWeight: debitVal ? '800' : '400' }]}>
                          {debitVal ? formatCurrency(debitVal) : '-'}
                        </Text>
                      </View>

                      {/* Credit (-) Cell */}
                      <View style={[styles.colCredit, { borderRightColor: theme.gridLineColor }]}>
                        <Text style={[styles.rowCellText, { color: creditVal ? '#047857' : theme.subTextColor, textAlign: 'right', fontWeight: creditVal ? '800' : '400' }]}>
                          {creditVal ? formatCurrency(creditVal) : '-'}
                        </Text>
                      </View>

                      {/* Running Balance Cell */}
                      <View style={styles.colBalance}>
                        <Text style={[styles.rowCellText, { color: theme.inkColor, textAlign: 'right', fontWeight: '600' }]}>
                          {item.balance !== undefined ? formatCurrency(item.balance) : '-'}
                        </Text>
                      </View>
                    </View>
                  );
                })
              )}

              {/* Accounting Double-Ruled Total Row */}
              <View style={[styles.tableTotalRow, { borderTopColor: theme.lineColor, backgroundColor: theme.totalRowBg }]}>
                <View style={[styles.colSpanParticulars, { borderRightColor: theme.lineColor }]}>
                  <Text style={[styles.totalTitleText, { color: theme.inkColor, textAlign: 'center' }]}>
                    மொத்தம் (ACCOUNT TOTALS)
                  </Text>
                </View>
                <View style={[styles.colDebit, { borderRightColor: theme.lineColor }]}>
                  <Text style={[styles.totalValText, { color: theme.highlightColor, textAlign: 'right' }]}>
                    {formatCurrency(totalDebit)}
                  </Text>
                </View>
                <View style={[styles.colCredit, { borderRightColor: theme.lineColor }]}>
                  <Text style={[styles.totalValText, { color: '#047857', textAlign: 'right' }]}>
                    {formatCurrency(totalCredit)}
                  </Text>
                </View>
                <View style={styles.colBalance}>
                  <Text style={[styles.totalValText, { color: netDue > 0 ? theme.highlightColor : theme.inkColor, textAlign: 'right' }]}>
                    {formatCurrency(netDue)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Traditional Double Line Under Totals */}
            <View style={[styles.doubleLineBar, { borderColor: theme.lineColor }]} />

            {/* Net Balance Due Highlight Box */}
            <View
              style={[
                styles.netDueRow,
                {
                  backgroundColor: netDue > 0 ? theme.badgeDueBg : theme.badgeSettledBg,
                  borderColor: netDue > 0 ? theme.badgeDueBorder : '#10B981',
                },
              ]}
            >
              <View>
                <Text
                  style={[
                    styles.netDueLabel,
                    { color: netDue > 0 ? theme.badgeDueText : theme.badgeSettledText },
                  ]}
                >
                  {netDue > 0
                    ? 'இறுதி பாக்கி (NET BALANCE DUE):'
                    : netDue < 0
                    ? 'முன்பணம் வரவு (CUSTOMER ADVANCE):'
                    : 'கணக்கு முடிந்தது (ACCOUNT SETTLED):'}
                </Text>
              </View>
              <Text
                style={[
                  styles.netDueAmount,
                  { color: netDue > 0 ? theme.badgeDueText : theme.badgeSettledText },
                ]}
              >
                {formatCurrency(Math.abs(netDue))}
              </Text>
            </View>

            {/* Bottom Footer Section: Terms, Optional QR & Authorized Seal/Signature */}
            <View style={styles.footerSection}>
              {/* Left Side: Goods Acknowledgment & Optional UPI QR */}
              <View style={{ flex: 1, paddingRight: 16 }}>
                {/* Payment Options Row: UPI QR and/or Bank Details */}
                {(showQr && targetUpi) || (showBank && hasBankInfo) ? (
                  <View style={styles.paymentRow}>
                    {showQr && targetUpi ? (
                      <View style={[styles.qrBlock, { borderColor: theme.lineColor, backgroundColor: theme.headerBg + '30' }]}>
                        <Image source={{ uri: qrCodeUrl }} style={styles.qrImage} contentFit="contain" />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.qrTitle, { color: theme.inkColor }]}>GPay / PhonePe / UPI</Text>
                          <Text style={[styles.qrUpiId, { color: theme.subTextColor }]}>{targetUpi}</Text>
                          <Text style={[styles.qrPrompt, { color: theme.highlightColor }]}>ஸ்கேன் செய்து கட்டவும் ↗</Text>
                        </View>
                      </View>
                    ) : null}

                    {showBank && hasBankInfo ? (
                      <View style={[styles.bankBlock, { borderColor: theme.lineColor, backgroundColor: theme.headerBg + '30' }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                          <Text style={{ fontSize: 9 }}>🏦</Text>
                          <Text style={[styles.bankTitle, { color: theme.highlightColor }]}>வங்கி விவரங்கள் (Bank Details)</Text>
                        </View>
                        {accountHolderName ? (
                          <Text style={[styles.bankText, { color: theme.inkColor }]} numberOfLines={1}>
                            பெயர்: <Text style={{ fontWeight: '800' }}>{accountHolderName}</Text>
                          </Text>
                        ) : null}
                        {bankName ? (
                          <Text style={[styles.bankText, { color: theme.inkColor }]} numberOfLines={1}>
                            வங்கி: <Text style={{ fontWeight: '800' }}>{bankName}</Text>
                          </Text>
                        ) : null}
                        {accountNo ? (
                          <Text style={[styles.bankText, { color: theme.inkColor }]} numberOfLines={1}>
                            A/C எண்: <Text style={{ fontWeight: '800', letterSpacing: 0.5 }}>{accountNo}</Text>
                          </Text>
                        ) : null}
                        {ifscCode ? (
                          <Text style={[styles.bankText, { color: theme.inkColor }]} numberOfLines={1}>
                            IFSC: <Text style={{ fontWeight: '800', letterSpacing: 0.5 }}>{ifscCode}</Text>
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {cfg.showGoodsAcknowledgment !== false ? (
                  cfg.footerNotes ? (
                    cfg.footerNotes.split('\n').filter(Boolean).map((line, idx) => (
                      <Text key={idx} style={[styles.footerNote, { color: idx === 0 ? theme.inkColor : theme.subTextColor }]}>
                        {line.trim().startsWith('•') ? line.trim() : `• ${line.trim()}`}
                      </Text>
                    ))
                  ) : (
                    <>
                      <Text style={[styles.footerNote, { color: theme.inkColor }]}>
                        • சரக்குகள் சரியான முறையில் கிடைக்கப்பெற்றது.
                      </Text>
                      <Text style={[styles.footerNote, { color: theme.subTextColor }]}>
                        • தங்களின் மேலான ஆதரவிற்கு மிக்க நன்றி! மீண்டும் வருக!
                      </Text>
                    </>
                  )
                ) : null}
              </View>

              {/* Right Side: Company Seal & Signature Box */}
              <View style={styles.sealBox}>


                {effectiveSignatureUri ? (
                  <Image
                    source={{ uri: effectiveSignatureUri }}
                    style={styles.signatureImage}
                    contentFit="contain"
                  />
                ) : null}
                <View style={[styles.signatureLine, { borderBottomColor: theme.lineColor }]} />
                <Text style={[styles.signatureLabel, { color: theme.inkColor }]}>
                  {cfg.signatoryText || 'அங்கீகரிக்கப்பட்ட கையொப்பம்'}
                </Text>
                <Text style={[styles.signatureSub, { color: theme.subTextColor }]}>
                  Authorized Signatory
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    );
  }
);

AppaEstimateBillView.displayName = 'AppaEstimateBillView';

const styles = StyleSheet.create({
  container: {
    width: 720,
    padding: 6,
    borderRadius: 8,
  },
  outerBorder: {
    borderWidth: 2.5,
    borderRadius: 8,
    padding: 3,
  },
  innerFrame: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 18,
  },
  topBarRow: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 28,
    marginBottom: 6,
  },
  topLogoContainer: {
    position: 'absolute',
    left: 0,
    top: 0,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  companyLogo: {
    width: 68,
    height: 64,
    borderRadius: 6,
  },
  topInvocationContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  invocationText: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.6,
    textAlign: 'center',
  },
  topPhonesContainer: {
    position: 'absolute',
    right: 0,
    top: 0,
    alignItems: 'flex-end',
  },
  phoneText: {
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  companyCenterBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    marginTop: 4,
  },
  companyTitle: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  companyAddress: {
    fontSize: 11.5,
    fontWeight: '600',
    marginTop: 2,
    lineHeight: 16,
    textAlign: 'center',
  },
  titleRow: {
    marginBottom: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  estimateTitle: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 2,
    lineHeight: 32,
    textAlign: 'center',
  },
  estimateSubTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 2,
    textAlign: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginVertical: 8,
    borderRadius: 4,
  },
  metaLabel: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  metaValue: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  customerSection: {
    borderBottomWidth: 1,
    paddingBottom: 8,
    marginBottom: 10,
  },
  customerPrefix: {
    fontSize: 14,
    fontWeight: '800',
  },
  customerName: {
    fontSize: 15.5,
    fontWeight: '900',
  },
  customerAddressText: {
    fontSize: 11.5,
    fontWeight: '600',
    marginTop: 3,
  },
  customerPhoneText: {
    fontSize: 11.5,
    fontWeight: '600',
    marginTop: 3,
  },
  tableContainer: {
    borderWidth: 1.5,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1.5,
    minHeight: 34,
    alignItems: 'center',
    paddingVertical: 3,
  },
  tableHeaderText: {
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
  },
  tableHeaderSub: {
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
  },
  colIndex: {
    width: 42,
    borderRightWidth: 1,
    paddingHorizontal: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colDate: {
    width: 72,
    borderRightWidth: 1,
    paddingHorizontal: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colParticulars: {
    flex: 1,
    borderRightWidth: 1,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  colDebit: {
    width: 96,
    borderRightWidth: 1,
    paddingHorizontal: 6,
    justifyContent: 'center',
  },
  colCredit: {
    width: 96,
    borderRightWidth: 1,
    paddingHorizontal: 6,
    justifyContent: 'center',
  },
  colBalance: {
    width: 92,
    paddingHorizontal: 6,
    justifyContent: 'center',
  },
  colSpanParticulars: {
    flex: 1,
    borderRightWidth: 1,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    minHeight: 32,
    alignItems: 'center',
    paddingVertical: 5,
  },
  rowCellText: {
    fontSize: 11.5,
    lineHeight: 16,
  },
  particularItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    marginVertical: 1,
  },
  particularItemBullet: {
    fontSize: 11,
  },
  particularItemName: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  particularItemQty: {
    fontSize: 11,
    fontWeight: '600',
  },
  particularItemTotal: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  emptyLedgerText: {
    padding: 16,
    textAlign: 'center',
    fontSize: 12,
    fontStyle: 'italic',
  },
  tableTotalRow: {
    flexDirection: 'row',
    borderTopWidth: 1.5,
    minHeight: 34,
    alignItems: 'center',
    paddingVertical: 5,
  },
  totalTitleText: {
    fontSize: 12,
    fontWeight: '900',
  },
  totalValText: {
    fontSize: 12.5,
    fontWeight: '900',
  },
  doubleLineBar: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    height: 3,
    marginVertical: 4,
  },
  netDueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderRadius: 6,
    marginVertical: 10,
  },
  netDueLabel: {
    fontSize: 13,
    fontWeight: '900',
  },
  netDueAmount: {
    fontSize: 20,
    fontWeight: '900',
  },
  footerSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 10,
  },
  footerNote: {
    fontSize: 10.5,
    fontWeight: '700',
    lineHeight: 15,
  },
  paymentRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  qrBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 6,
    padding: 6,
    gap: 8,
    maxWidth: 240,
  },
  bankBlock: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 6,
    minWidth: 170,
    maxWidth: 240,
    justifyContent: 'center',
  },
  bankTitle: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  bankText: {
    fontSize: 8.5,
    lineHeight: 12,
  },
  qrImage: {
    width: 55,
    height: 55,
    borderRadius: 4,
  },
  qrTitle: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  qrUpiId: {
    fontSize: 9.5,
    fontWeight: '600',
  },
  qrPrompt: {
    fontSize: 9.5,
    fontWeight: '800',
    marginTop: 2,
  },
  sealBox: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 140,
  },

  signatureImage: {
    height: 44,
    width: 130,
    marginBottom: 2,
  },
  signatureLine: {
    width: 120,
    borderBottomWidth: 1,
    marginBottom: 4,
  },
  signatureLabel: {
    fontSize: 10,
    fontWeight: '800',
  },
  signatureSub: {
    fontSize: 8.5,
    fontWeight: '600',
  },
});
