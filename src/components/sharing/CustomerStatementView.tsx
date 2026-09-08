import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { CustomerShareData, ShareSettings, InvoiceTemplate, formatCustomerPhonesDisplay } from '../../types/sharing';

interface CustomerStatementViewProps {
  data: CustomerShareData;
  company?: any;
  settings?: ShareSettings;
  template?: InvoiceTemplate;
  isDark?: boolean;
}

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

const CustomerStatementViewComponent: React.ForwardRefRenderFunction<View, CustomerStatementViewProps> = (
  { data, company = {}, settings, template, isDark = false },
  ref
) => {
    const accentColor = settings?.themeColor || template?.accentColor || '#2563EB';
    const cardBg = isDark ? '#0F172A' : '#FFFFFF';
    const textColor = isDark ? '#F8FAFC' : '#0F172A';
    const subTextColor = isDark ? '#94A3B8' : '#64748B';
    const borderColor = isDark ? '#334155' : '#E2E8F0';
    const innerCardBg = isDark ? '#1E293B' : '#F8FAFC';

    const netDue = data.summary.netBalanceDue;
    const isPaid = (netDue || 0) <= 0;
    const oldBalance = data.summary.oldBalanceDue || 0;
    const totalSales = data.summary.totalSalesAmount || 0;
    const totalPaid = data.summary.totalPaidAmount || 0;
    const totalOrders = data.summary.totalOrdersCount || 0;

    // Grand total = old balance + total sales
    const grandTotal = oldBalance + totalSales;

    // Settings Toggles
    const showLogo = settings?.includeLogo !== false;
    const showCompanyDetails = settings?.includeCompanyDetails !== false;
    const showGst = settings?.includeGst !== false;
    const showSignature = settings?.includeSignature !== false;
    const payMode = settings?.paymentDisplayMode || 'BOTH';

    // Do not show QR code or Bank details if the customer is fully paid (net balance due <= 0)
    const showQr = settings?.includeQrCode !== false && payMode !== 'NONE' && payMode !== 'BANK' && !isPaid;
    const showBank = (payMode === 'BANK' || payMode === 'BOTH' || settings?.includeBankDetails) && payMode !== 'NONE' && payMode !== 'QR' && !isPaid;

    const bankName = settings?.bankName || company?.bankName || '';
    const accountNo = settings?.accountNo || company?.accountNo || '';
    const ifscCode = settings?.ifscCode || company?.ifscCode || '';
    const accountHolderName = settings?.accountHolderName || company?.accountHolderName || company?.name || '';
    const hasBankInfo = !!(bankName || accountNo || ifscCode || accountHolderName);

    // Calculate aggregated charges across all ledger items
    const allLedger = data.ledger || [];
    const totalShipment = allLedger.reduce((sum, l) => sum + (l.shipmentCharge || 0), 0);
    const totalLoading = allLedger.reduce((sum, l) => sum + (l.loadingCharge || 0), 0);
    const totalUnloading = allLedger.reduce((sum, l) => sum + (l.unloadingCharge || 0), 0);
    const totalExtra = allLedger.reduce((sum, l) => sum + (l.extraAmount || 0), 0);
    const totalTax = allLedger.reduce((sum, l) => sum + (l.taxAmount || 0), 0);
    const totalDiscount = allLedger.reduce((sum, l) => sum + (l.discountAmount || 0), 0);
    const hasAggregatedCharges = (totalShipment + totalLoading + totalUnloading + totalExtra + totalTax + totalDiscount) > 0;

    const targetUpi = (settings?.upiId || company.upiId || '').trim();
    const payeeName = encodeURIComponent((company.name || 'Business').trim());
    const txNote = encodeURIComponent(`Statement for ${data.customer.name || 'Customer'}`.trim());
    const upiPayload = targetUpi
      ? `upi://pay?pa=${targetUpi}&pn=${payeeName}&cu=INR&tn=${txNote}`
      : `Customer Statement: ${data.customer.name} | Total balance due: ${netDue}`;

    const qrCodeUrl = (template?.useCustomQrCode && template?.customQrCodeUri)
      ? template.customQrCodeUri
      : `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(upiPayload)}`;

    // Calculate ledger totals
    const ledgerTotalDebit = allLedger.filter(l => l.type === 'order' || l.type === 'opening').reduce((sum, l) => sum + (l.amount || 0), 0);
    const ledgerTotalCredit = allLedger.reduce((sum, l) => sum + (l.paid || 0), 0);

    return (
      <View ref={ref} collapsable={false} style={[styles.container, { backgroundColor: cardBg, borderColor }]}>
        {/* Top Accent Stripe */}
        <View style={[styles.accentStripe, { backgroundColor: accentColor }]} />

        <View style={styles.inner}>
          {/* Header Card */}
          <View style={[styles.headerCard, { backgroundColor: innerCardBg, borderColor }]}>
            <View style={styles.headerRow}>
              <View style={styles.companyContainer}>
                {showLogo ? (
                  company.logoUrl ? (
                    <Image source={{ uri: company.logoUrl }} style={styles.companyLogo} contentFit="contain" />
                  ) : (
                    <View style={[styles.logoFallback, { backgroundColor: accentColor }]}>
                      <Text style={styles.logoFallbackText}>{(company.name || 'B').charAt(0).toUpperCase()}</Text>
                    </View>
                  )
                ) : null}

                <View style={{ flex: 1 }}>
                  <Text style={[styles.companyName, { color: textColor }]} numberOfLines={2}>
                    {company.name || 'Company Name'}
                  </Text>
                  {showCompanyDetails && (company.phone || company.address) ? (
                    <Text style={[styles.companySub, { color: subTextColor }]}>
                      {company.phone ? `📞 ${company.phone}` : ''}
                      {company.phone && company.address ? '  •  ' : ''}
                      {company.address ? `📍 ${company.address}` : ''}
                    </Text>
                  ) : null}
                  {showGst && company.gstin ? (
                    <Text style={[styles.companyGst, { color: subTextColor }]}>🏷️ GSTIN: {company.gstin}</Text>
                  ) : null}
                </View>
              </View>

              <View style={styles.headerRight}>
                <View style={[styles.badge, { backgroundColor: accentColor }]}>
                  <Text style={styles.badgeText}>STATEMENT</Text>
                </View>
                <Text style={[styles.dateText, { color: subTextColor }]}>📅 {formatDate(new Date())}</Text>
              </View>
            </View>
          </View>

          {/* Customer Info Card */}
          {data.options?.includeProfileInfo !== false ? (
            <View style={[styles.customerCard, { backgroundColor: innerCardBg, borderColor }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MaterialIcons name="person" size={16} color={accentColor} />
                  <Text style={[styles.customerLabel, { color: subTextColor }]}>CLIENT PROFILE DETAILS</Text>
                </View>
                {data.customer.isSpecial ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F59E0B20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 }}>
                    <MaterialIcons name="stars" size={12} color="#D97706" />
                    <Text style={{ fontSize: 9, fontWeight: '800', color: '#D97706' }}>SPECIAL CLIENT</Text>
                  </View>
                ) : null}
              </View>
              {data.customer.name.endsWith('அவர்கள்') ? (
                <Text style={[styles.customerName, { color: textColor }]}>
                  {data.customer.name.replace(/\s+அவர்கள்$/, '')} <Text style={{ fontSize: 11, fontWeight: '600', color: subTextColor }}>அவர்கள்</Text>
                </Text>
              ) : (
                <Text style={[styles.customerName, { color: textColor }]}>{data.customer.name}</Text>
              )}
              {(() => {
                const custPhones = formatCustomerPhonesDisplay(data.customer.phone, data.customer.phoneNumbers);
                if (!custPhones) return null;
                return (
                  <Text style={[styles.customerMeta, { color: subTextColor }]}>
                    📞 {custPhones}
                  </Text>
                );
              })()}
              {data.customer.address ? (
                <Text style={[styles.customerMeta, { color: subTextColor }]}>📍 {data.customer.address}</Text>
              ) : null}
              {showGst && data.customer.gstin ? (
                <Text style={[styles.customerMeta, { color: subTextColor }]}>🏷️ GSTIN: {data.customer.gstin}</Text>
              ) : null}
            </View>
          ) : null}

          {/* Scheduled Due Dates Card */}
          {data.options?.includeDueDates !== false && data.dueDates && data.dueDates.length > 0 ? (
            <View style={[styles.customerCard, { backgroundColor: isDark ? '#3B1A1A' : '#FFFBEB', borderColor: '#FDE68A', marginBottom: 14 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <MaterialIcons name="alarm" size={16} color="#D97706" />
                <Text style={[styles.customerLabel, { color: '#B45309' }]}>SCHEDULED DUE DATES</Text>
              </View>
              {data.dueDates.map((due) => (
                <View key={due.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: textColor }}>
                    📅 {due.date} {due.notes ? `(${due.notes})` : ''}
                  </Text>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: due.status === 'Completed' ? '#10B981' : '#D97706' }}>
                    {due.status.toUpperCase()}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* ═══════ FULL CALCULATION & CHARGES BREAKDOWN ═══════ */}
          {data.options?.includeSummary !== false ? (
            <View style={[styles.calcCard, { backgroundColor: innerCardBg, borderColor }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <MaterialIcons name="calculate" size={16} color={accentColor} />
                <Text style={[styles.customerLabel, { color: accentColor }]}>ACCOUNT CALCULATION SUMMARY</Text>
              </View>

              {/* Row: Total Orders */}
              <View style={styles.calcRow}>
                <Text style={[styles.calcLabel, { color: subTextColor }]}>Total Orders</Text>
                <Text style={[styles.calcValue, { color: textColor }]}>{totalOrders}</Text>
              </View>

              <View style={[styles.calcSep, { borderBottomColor: borderColor }]} />

              {/* Row: Old Balance Due */}
              {oldBalance > 0 ? (
                <View style={styles.calcRow}>
                  <Text style={[styles.calcLabel, { color: '#EF4444', fontWeight: '700' }]}>Opening / Old Balance Due</Text>
                  <Text style={[styles.calcValue, { color: '#EF4444', fontWeight: '800' }]}>+{formatCurrency(oldBalance)}</Text>
                </View>
              ) : null}

              {/* Row: Total Sales */}
              <View style={styles.calcRow}>
                <Text style={[styles.calcLabel, { color: textColor }]}>Total Sales / Orders Subtotal</Text>
                <Text style={[styles.calcValue, { color: textColor }]}>+{formatCurrency(totalSales)}</Text>
              </View>

              {/* Aggregated Charges Breakdown Row if present */}
              {hasAggregatedCharges ? (
                <View style={{ backgroundColor: cardBg, padding: 8, borderRadius: 8, marginVertical: 4, borderWidth: 1, borderColor }}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: subTextColor, marginBottom: 4 }}>INCLUDED CHARGES BREAKDOWN:</Text>
                  {totalShipment > 0 ? (
                    <View style={styles.calcRow}>
                      <Text style={{ fontSize: 10, color: subTextColor }}>🚚 Total Delivery / Freight</Text>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: textColor }}>+{formatCurrency(totalShipment)}</Text>
                    </View>
                  ) : null}
                  {totalLoading > 0 ? (
                    <View style={styles.calcRow}>
                      <Text style={{ fontSize: 10, color: subTextColor }}>📦 Total Loading Charge</Text>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: textColor }}>+{formatCurrency(totalLoading)}</Text>
                    </View>
                  ) : null}
                  {totalUnloading > 0 ? (
                    <View style={styles.calcRow}>
                      <Text style={{ fontSize: 10, color: subTextColor }}>📦 Total Unloading Charge</Text>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: textColor }}>+{formatCurrency(totalUnloading)}</Text>
                    </View>
                  ) : null}
                  {totalExtra > 0 ? (
                    <View style={styles.calcRow}>
                      <Text style={{ fontSize: 10, color: subTextColor }}>➕ Total Extra Charges</Text>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: textColor }}>+{formatCurrency(totalExtra)}</Text>
                    </View>
                  ) : null}
                  {totalTax > 0 ? (
                    <View style={styles.calcRow}>
                      <Text style={{ fontSize: 10, color: subTextColor }}>🏷️ Total GST / Tax</Text>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: textColor }}>+{formatCurrency(totalTax)}</Text>
                    </View>
                  ) : null}
                  {totalDiscount > 0 ? (
                    <View style={styles.calcRow}>
                      <Text style={{ fontSize: 10, color: '#10B981' }}>🏷️ Total Discounts Applied</Text>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#10B981' }}>−{formatCurrency(totalDiscount)}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              <View style={[styles.calcSep, { borderBottomColor: accentColor, borderBottomWidth: 2 }]} />

              {/* Row: Grand Total */}
              <View style={styles.calcRow}>
                <Text style={[styles.calcLabel, { color: accentColor, fontWeight: '800', fontSize: 12 }]}>Grand Total (incl. Dues & Charges)</Text>
                <Text style={[styles.calcValue, { color: accentColor, fontWeight: '900', fontSize: 14 }]}>{formatCurrency(grandTotal)}</Text>
              </View>

              <View style={[styles.calcSep, { borderBottomColor: borderColor }]} />

              {/* Row: Total Paid */}
              <View style={styles.calcRow}>
                <Text style={[styles.calcLabel, { color: '#10B981', fontWeight: '700' }]}>Total Amount Paid (−)</Text>
                <Text style={[styles.calcValue, { color: '#10B981', fontWeight: '800' }]}>−{formatCurrency(totalPaid)}</Text>
              </View>

              <View style={[styles.calcSep, { borderBottomColor: netDue > 0 ? '#EF4444' : '#10B981', borderBottomWidth: 3 }]} />

              {/* Row: NET BALANCE DUE */}
              <View style={[styles.calcRow, { paddingVertical: 6 }]}>
                <Text style={[styles.calcLabel, { color: netDue > 0 ? '#EF4444' : '#10B981', fontWeight: '900', fontSize: 13 }]}>
                  {netDue > 0 ? '💰 Total Balance Due' : '✅ Fully Paid'}
                </Text>
                <Text style={[styles.calcValue, { color: netDue > 0 ? '#EF4444' : '#10B981', fontWeight: '900', fontSize: 16 }]}>
                  {formatCurrency(Math.abs(netDue))}
                </Text>
              </View>

              {/* Status Badge */}
              <View style={[styles.statusBadge, { backgroundColor: isPaid ? '#10B98120' : '#EF444420' }]}>
                <MaterialIcons name={isPaid ? 'check-circle' : 'pending'} size={14} color={isPaid ? '#10B981' : '#EF4444'} />
                <Text style={{ fontSize: 10, fontWeight: '800', color: isPaid ? '#10B981' : '#EF4444' }}>
                  {isPaid ? 'ACCOUNT FULLY SETTLED' : 'PAYMENT PENDING'}
                </Text>
              </View>
            </View>
          ) : null}

          {/* ═══════ FULL LEDGER TABLE WITH ITEM RATES & CHARGES ═══════ */}
          {data.options?.includeLedger !== false ? (
            <View style={styles.ledgerSection}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <MaterialIcons name="receipt-long" size={14} color={subTextColor} />
                <Text style={[styles.sectionTitle, { color: subTextColor, marginBottom: 0 }]}>COMPLETE STATEMENT LEDGER ({allLedger.length} entries)</Text>
              </View>

              <View style={[styles.tableHeader, { backgroundColor: isDark ? '#1E293B' : '#0F172A' }]}>
                <Text style={[styles.th, { flex: 1.1, color: '#FFF' }]}>Date</Text>
                <Text style={[styles.th, { flex: 2.3, color: '#FFF' }]}>Description & Item Rates / Charges</Text>
                <Text style={[styles.th, { flex: 1.2, textAlign: 'right', color: '#FFF' }]}>Debit (+)</Text>
                <Text style={[styles.th, { flex: 1.2, textAlign: 'right', color: '#FFF' }]}>Credit (−)</Text>
                <Text style={[styles.th, { flex: 1.3, textAlign: 'right', color: '#FFF' }]}>Balance</Text>
              </View>

              {allLedger.map((item, idx) => {
                const hasRate = item.type === 'order' && ((item.rate && item.rate > 0) || (item.items && item.items.length > 0));
                const hasItemCharges = item.type === 'order' && (
                  (item.shipmentCharge || 0) > 0 ||
                  (item.loadingCharge || 0) > 0 ||
                  (item.unloadingCharge || 0) > 0 ||
                  (item.extraAmount || 0) > 0 ||
                  (item.taxAmount || 0) > 0 ||
                  (item.discountAmount || 0) > 0
                );

                const creditAmount = item.type === 'payment'
                  ? (item.paid || item.amount || 0)
                  : (item.paid || 0);
                const debitAmount = item.type === 'payment'
                  ? 0
                  : (item.amount || 0);

                return (
                  <View
                    key={item.id || idx}
                    style={[
                      styles.tableRow,
                      { borderBottomColor: borderColor, backgroundColor: idx % 2 === 0 ? cardBg : innerCardBg }
                    ]}
                  >
                    <Text style={[styles.td, { flex: 1.1, color: subTextColor, fontSize: 9 }]}>{formatDate(item.date)}</Text>
                    <View style={{ flex: 2.3, paddingRight: 4 }}>
                      <Text style={[styles.td, { color: textColor, fontWeight: '700' }]}>
                        {item.description}
                      </Text>

                      {/* Transaction Notes */}
                      {item.notes ? (
                        <Text style={{ fontSize: 8.5, color: subTextColor, fontStyle: 'italic', marginTop: 1 }}>
                          📝 Note: {item.notes}
                        </Text>
                      ) : null}

                      {/* Items list with rates & quantities */}
                      {item.items && item.items.length > 0 ? (
                        <View style={{ marginTop: 2, gap: 1 }}>
                          {item.items.map((it, iIdx) => (
                            <Text key={iIdx} style={{ fontSize: 8.5, color: subTextColor }}>
                              • {it.name}: {it.quantity} {it.unit || 'pcs'} × {formatCurrency(it.rate)} = {formatCurrency(it.total)}
                            </Text>
                          ))}
                        </View>
                      ) : hasRate && item.quantity && item.rate ? (
                        <Text style={{ fontSize: 8.5, color: subTextColor, marginTop: 1 }}>
                          Rate: {item.quantity} {item.unit || 'pcs'} × {formatCurrency(item.rate)} = {formatCurrency(item.amount)}
                        </Text>
                      ) : null}

                      {/* Individual Order Charges Breakdown Badges */}
                      {hasItemCharges ? (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
                          {item.shipmentCharge ? (
                            <Text style={{ fontSize: 8, color: accentColor, backgroundColor: accentColor + '15', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, fontWeight: '700' }}>
                              🚚 Freight: +{formatCurrency(item.shipmentCharge)}
                            </Text>
                          ) : null}
                          {item.loadingCharge ? (
                            <Text style={{ fontSize: 8, color: '#D97706', backgroundColor: '#FEF3C7', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, fontWeight: '700' }}>
                              📦 Loading: +{formatCurrency(item.loadingCharge)}
                            </Text>
                          ) : null}
                          {item.unloadingCharge ? (
                            <Text style={{ fontSize: 8, color: '#D97706', backgroundColor: '#FEF3C7', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, fontWeight: '700' }}>
                              📦 Unload: +{formatCurrency(item.unloadingCharge)}
                            </Text>
                          ) : null}
                          {item.extraAmount ? (
                            <Text style={{ fontSize: 8, color: '#6C5CE7', backgroundColor: '#6C5CE715', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, fontWeight: '700' }}>
                              ➕ {item.extraAmountDescription || 'Extra'}: +{formatCurrency(item.extraAmount)}
                            </Text>
                          ) : null}
                          {item.taxAmount ? (
                            <Text style={{ fontSize: 8, color: '#2563EB', backgroundColor: '#EFF6FF', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, fontWeight: '700' }}>
                              🏷️ Tax: +{formatCurrency(item.taxAmount)}
                            </Text>
                          ) : null}
                          {item.discountAmount ? (
                            <Text style={{ fontSize: 8, color: '#10B981', backgroundColor: '#ECFDF5', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, fontWeight: '700' }}>
                              🏷️ Discount: −{formatCurrency(item.discountAmount)}
                            </Text>
                          ) : null}
                        </View>
                      ) : null}
                    </View>

                    <Text style={[styles.td, { flex: 1.2, textAlign: 'right', fontWeight: '700', color: debitAmount > 0 ? textColor : subTextColor, fontSize: 10 }]}>
                      {debitAmount > 0 ? formatCurrency(debitAmount) : '—'}
                    </Text>
                    <Text style={[styles.td, { flex: 1.2, textAlign: 'right', fontWeight: '700', color: creditAmount > 0 ? '#10B981' : subTextColor, fontSize: 10 }]}>
                      {creditAmount > 0 ? formatCurrency(creditAmount) : '—'}
                    </Text>
                    <Text
                      style={[
                        styles.td,
                        {
                          flex: 1.3,
                          textAlign: 'right',
                          fontWeight: '700',
                          color: item.balance > 0 ? '#EF4444' : '#10B981',
                          fontSize: 10,
                        }
                      ]}
                    >
                      {formatCurrency(item.balance)}
                    </Text>
                  </View>
                );
              })}

              {/* Totals Row */}
              <View style={[styles.tableRow, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderBottomWidth: 0, borderTopWidth: 2, borderTopColor: accentColor }]}>
                <Text style={[styles.td, { flex: 1.1, color: accentColor, fontWeight: '900', fontSize: 10 }]}>TOTALS</Text>
                <Text style={[styles.td, { flex: 2.3, color: textColor, fontWeight: '700', fontSize: 10 }]}>{allLedger.length} transactions</Text>
                <Text style={[styles.td, { flex: 1.2, textAlign: 'right', fontWeight: '800', color: textColor, fontSize: 10 }]}>
                  {formatCurrency(ledgerTotalDebit)}
                </Text>
                <Text style={[styles.td, { flex: 1.2, textAlign: 'right', fontWeight: '800', color: '#10B981', fontSize: 10 }]}>
                  {formatCurrency(ledgerTotalCredit)}
                </Text>
                <Text style={[styles.td, { flex: 1.3, textAlign: 'right', fontWeight: '900', color: netDue > 0 ? '#EF4444' : '#10B981', fontSize: 11 }]}>
                  {formatCurrency(netDue)}
                </Text>
              </View>
            </View>
          ) : null}

          {/* Footer */}
          <View style={[styles.footerRow, { borderTopColor: borderColor, gap: 12 }]}>
            {/* QR Code Section */}
            {showQr ? (
              <View style={styles.qrContainer}>
                <Image source={{ uri: qrCodeUrl }} style={styles.qrImage} contentFit="contain" />
                <Text style={[styles.qrCaption, { color: subTextColor }]}>Scan to Pay Balance</Text>
              </View>
            ) : null}

            {/* Bank Account Details Section */}
            {showBank && hasBankInfo ? (
              <View style={[styles.bankContainer, { backgroundColor: innerCardBg, borderColor }]}>
                <Text style={[styles.bankTitle, { color: accentColor }]}>🏦 BANK ACCOUNT DETAILS</Text>
                {accountHolderName ? <Text style={[styles.bankText, { color: textColor }]}>Holder: <Text style={{ fontWeight: '700' }}>{accountHolderName}</Text></Text> : null}
                {bankName ? <Text style={[styles.bankText, { color: textColor }]}>Bank: <Text style={{ fontWeight: '700' }}>{bankName}</Text></Text> : null}
                {accountNo ? <Text style={[styles.bankText, { color: textColor }]}>A/C No: <Text style={{ fontWeight: '700' }}>{accountNo}</Text></Text> : null}
                {ifscCode ? <Text style={[styles.bankText, { color: textColor }]}>IFSC: <Text style={{ fontWeight: '700' }}>{ifscCode}</Text></Text> : null}
              </View>
            ) : null}

            {!showQr && !showBank ? <View style={{ flex: 1 }} /> : null}

            {/* Signature Section */}
            {showSignature ? (
              <View style={styles.sigContainer}>
                {company.signatureUrl ? (
                  <Image source={{ uri: company.signatureUrl }} style={styles.sigImage} contentFit="contain" />
                ) : (
                  <View style={styles.sigLine} />
                )}
                <Text style={[styles.sigTitle, { color: subTextColor }]}>
                  {settings?.signatureTitle || 'Authorized Signatory'}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

export const CustomerStatementView = React.forwardRef(CustomerStatementViewComponent);
CustomerStatementView.displayName = 'CustomerStatementView';

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  accentStripe: {
    height: 6,
    width: '100%',
  },
  inner: {
    padding: 16,
  },
  headerCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  companyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    paddingRight: 8,
  },
  companyLogo: {
    width: 44,
    height: 44,
    borderRadius: 10,
  },
  logoFallback: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoFallbackText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  companyName: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  companySub: {
    fontSize: 11,
    marginTop: 2,
    fontWeight: '500',
  },
  companyGst: {
    fontSize: 9.5,
    marginTop: 2,
    fontWeight: '500',
  },
  headerRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  dateText: {
    fontSize: 10,
    marginTop: 4,
    fontWeight: '600',
  },
  customerCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  customerLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  customerName: {
    fontSize: 15,
    fontWeight: '700',
  },
  customerMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  // ── Calculation Card ──
  calcCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  calcRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  calcLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  calcValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  calcSep: {
    borderBottomWidth: 1,
    marginVertical: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 8,
  },
  // ── Ledger ──
  ledgerSection: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  tableHeader: {
    flexDirection: 'row',
    padding: 8,
    borderRadius: 6,
  },
  th: {
    fontSize: 9,
    fontWeight: '700',
  },
  tableRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    alignItems: 'center',
  },
  td: {
    fontSize: 10,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    borderTopWidth: 1,
    paddingTop: 12,
  },
  qrContainer: {
    alignItems: 'center',
  },
  qrImage: {
    width: 76,
    height: 76,
    borderRadius: 6,
    backgroundColor: '#FFF',
  },
  qrCaption: {
    fontSize: 9,
    fontWeight: '600',
    marginTop: 3,
  },
  bankContainer: {
    flex: 1,
    minWidth: 140,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  bankTitle: {
    fontSize: 9,
    fontWeight: '900',
    marginBottom: 3,
    letterSpacing: 0.5,
  },
  bankText: {
    fontSize: 9.5,
    marginVertical: 1,
  },
  sigContainer: {
    alignItems: 'flex-end',
  },
  sigImage: {
    width: 110,
    height: 36,
  },
  sigLine: {
    width: 110,
    borderBottomWidth: 1,
    borderBottomColor: '#94A3B8',
    marginBottom: 4,
    height: 30,
  },
  sigTitle: {
    fontSize: 10,
    fontWeight: '600',
  },
});
