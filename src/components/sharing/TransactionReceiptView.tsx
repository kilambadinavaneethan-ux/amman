import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { ShareSettings, TransactionData, InvoiceTemplate, DEFAULT_INVOICE_TEMPLATE, formatCustomerPhonesDisplay } from '../../types/sharing';

interface Props {
  transaction: TransactionData;
  settings: ShareSettings;
  template?: InvoiceTemplate;
  isDark?: boolean;
}

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

const TransactionReceiptViewComponent: React.ForwardRefRenderFunction<View, Props> = (
  { transaction, settings, template: propTemplate, isDark },
  ref
) => {
  const tpl: InvoiceTemplate = propTemplate || {
    ...DEFAULT_INVOICE_TEMPLATE,
    accentColor: settings?.themeColor || DEFAULT_INVOICE_TEMPLATE.accentColor,
    showCompanyLogo: settings?.includeLogo ?? DEFAULT_INVOICE_TEMPLATE.showCompanyLogo,
    showSignature: settings?.includeSignature ?? DEFAULT_INVOICE_TEMPLATE.showSignature,
    showQrCode: settings?.includeQrCode ?? DEFAULT_INVOICE_TEMPLATE.showQrCode,
    showCompanyGst: settings?.includeGst ?? DEFAULT_INVOICE_TEMPLATE.showCompanyGst,
    showCustomerAddress: settings?.includeCustomerAddress ?? DEFAULT_INVOICE_TEMPLATE.showCustomerAddress,
    showCustomerPhone: settings?.includeCustomerPhone ?? DEFAULT_INVOICE_TEMPLATE.showCustomerPhone,
  };

  const company = transaction.company || {};
  const customer = transaction.customer || { name: 'Valued Customer' };
  const items = transaction.items || [];
  const isPaid = transaction.paymentStatus?.toUpperCase() === 'PAID';
  const isPartial = transaction.paymentStatus?.toUpperCase() === 'PARTIAL';

  const statusBg = isPaid ? '#10B981' : isPartial ? '#F59E0B' : '#EF4444';
  const statusLabel = isPaid ? 'PAID' : isPartial ? 'PARTIALLY PAID' : 'PENDING';

  const oldBalance = (tpl.showOldBalanceDue !== false && transaction.previousBalance) ? Number(transaction.previousBalance) : 0;
  const hasOldBalance = oldBalance > 0;
  const grandTotalWithOldDues = (transaction.totalAmount || 0) + oldBalance;
  const netBalanceDue = Math.max(0, grandTotalWithOldDues - (transaction.paidAmount || 0));

  const hasExtraCharges = !!(
    (tpl.showDeliveryCharge !== false && transaction.shipmentCharge) ||
    (tpl.showLoadingCharge !== false && transaction.loadingCharge) ||
    (tpl.showUnloadingCharge !== false && transaction.unloadingCharge) ||
    (tpl.showExtraCharge !== false && transaction.extraAmount) ||
    (Array.isArray(transaction.charges) && transaction.charges.some(c => c && c.amount)) ||
    (tpl.showTax && transaction.taxAmount) ||
    (tpl.showDiscount && transaction.discountAmount)
  );

  const accentColor = tpl.accentColor || '#2563EB';
  const cardBg = tpl.pageBackground || (isDark ? '#1E293B' : '#FFFFFF');
  const headingColor = tpl.headingColor || (isDark ? '#F8FAFC' : '#0F172A');
  const textColor = tpl.bodyTextColor || (isDark ? '#F8FAFC' : '#334155');
  const subTextColor = isDark ? '#94A3B8' : '#64748B';
  const borderColor = tpl.borderColor || (isDark ? '#334155' : '#E2E8F0');
  const tableHeaderBg = tpl.tableHeaderBg || (isDark ? '#0F172A' : '#F1F5F9');
  const tableHeaderTextColor = tpl.tableHeaderTextColor || '#FFFFFF';
  const altRowBg = isDark ? '#1E293B' : '#F8FAFC';
  const baseSize = tpl.baseFontSize || 12;

  const targetUpi = (settings?.upiId || company.upiId || '').trim();
  const rawAmount = netBalanceDue > 0 ? netBalanceDue : (transaction.pendingAmount || transaction.totalAmount || 0);
  const payeeName = encodeURIComponent((company.name || 'Business').trim());
  const txNote = encodeURIComponent(`Invoice ${transaction.invoiceNumber || ''} | Balance Due: ${Number(rawAmount).toFixed(2)}`.trim());

  const upiPayload = targetUpi
    ? `upi://pay?pa=${targetUpi}&pn=${payeeName}&cu=INR&tn=${txNote}`
    : `Invoice: ${transaction.invoiceNumber} | Total balance due: ${netBalanceDue}`;

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(upiPayload)}`;

  // Determine Table Column Widths
  const showIndex = tpl.showItemIndex;
  const showUnit = tpl.showItemUnit;
  const showRate = tpl.showItemRate;

  // Header Component Render based on layout
  const renderHeader = () => {
    const logoElement = (tpl.showCompanyLogo && settings?.includeLogo !== false) ? (
      company.logoUrl ? (
        <Image source={{ uri: company.logoUrl }} style={styles.logo} contentFit="contain" />
      ) : (
        <View style={[styles.logoFallback, { backgroundColor: accentColor }]}>
          <Text style={styles.logoFallbackText}>{(company.name || 'B').charAt(0).toUpperCase()}</Text>
        </View>
      )
    ) : null;

    const companyDetails = (
      <View style={styles.companyDetails}>
        {tpl.showCompanyName && (
          <Text style={[styles.companyName, { color: headingColor, fontSize: baseSize + 4 }]}>
            {company.name || 'My Business'}
          </Text>
        )}
        {tpl.showCompanyPhone && company.phone && (
          <Text style={[styles.companySub, { color: subTextColor, fontSize: baseSize - 1 }]}>📞 {company.phone}</Text>
        )}
        {tpl.showCompanyEmail && company.email && (
          <Text style={[styles.companySub, { color: subTextColor, fontSize: baseSize - 1 }]}>✉️ {company.email}</Text>
        )}
        {tpl.showCompanyAddress && company.address && (
          <Text style={[styles.companySub, { color: subTextColor, fontSize: baseSize - 1 }]}>📍 {company.address}</Text>
        )}
        {tpl.showCompanyGst && settings?.includeGst && (company.gstNo || settings?.gstNo) && (
          <Text style={[styles.companySub, { color: subTextColor, fontSize: baseSize - 1 }]}>
            GSTIN: {company.gstNo || settings?.gstNo}
          </Text>
        )}
      </View>
    );

    const titleAndStatus = (
      <View style={[styles.statusBox, tpl.headerLayout === 'centered' && { alignItems: 'center', marginTop: 8 }]}>
        <Text style={[styles.invoiceTitleText, { color: accentColor, fontSize: baseSize + 6 }]}>
          {tpl.invoiceTitleText || 'INVOICE'}
        </Text>
        {tpl.showPaymentStatus && (
          <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
            <Text style={styles.statusText}>{statusLabel}</Text>
          </View>
        )}
        {tpl.showInvoiceNumber && (
          <Text style={[styles.invoiceNumber, { color: headingColor, fontSize: baseSize + 1 }]}>
            #{transaction.invoiceNumber}
          </Text>
        )}
      </View>
    );

    if (tpl.headerLayout === 'centered') {
      return (
        <View style={styles.headerCentered}>
          {logoElement}
          {companyDetails}
          {titleAndStatus}
        </View>
      );
    }

    if (tpl.headerLayout === 'modern') {
      return (
        <View style={[styles.headerModern, { backgroundColor: `${accentColor}12`, borderColor: accentColor }]}>
          <View style={styles.companyContainer}>
            {logoElement}
            {companyDetails}
          </View>
          {titleAndStatus}
        </View>
      );
    }

    // Default 'classic' or 'minimal'
    return (
      <View style={styles.headerRow}>
        <View style={styles.companyContainer}>
          {logoElement}
          {companyDetails}
        </View>
        {titleAndStatus}
      </View>
    );
  };

  return (
    <View
      ref={ref}
      collapsable={false}
      style={[
        styles.container,
        { backgroundColor: cardBg, borderColor },
      ]}
    >
      {/* Watermark overlay */}
      {settings?.watermarkEnabled && (
        <View style={styles.watermarkContainer} pointerEvents="none">
          <Text style={styles.watermarkText}>{settings.watermarkText || 'CONFIDENTIAL'}</Text>
        </View>
      )}

      {/* Top Accent Line */}
      <View style={[styles.accentBar, { backgroundColor: accentColor }]} />

      {/* Header */}
      {renderHeader()}

      {/* Meta Row (Date, Due Date, Payment Method) */}
      {(tpl.showInvoiceDate || tpl.showDueDate || tpl.showPaymentMethod) && (
        <View style={[styles.metaGrid, { backgroundColor: altRowBg, borderColor }]}>
          {tpl.showInvoiceDate && (
            <View style={styles.metaCol}>
              <Text style={[styles.metaLabel, { color: subTextColor }]}>INVOICE DATE</Text>
              <Text style={[styles.metaVal, { color: headingColor }]}>{formatDate(transaction.date)}</Text>
            </View>
          )}
          {tpl.showDueDate && transaction.dueDate && (
            <View style={styles.metaCol}>
              <Text style={[styles.metaLabel, { color: subTextColor }]}>DUE DATE</Text>
              <Text style={[styles.metaVal, { color: headingColor }]}>{formatDate(transaction.dueDate)}</Text>
            </View>
          )}
          {tpl.showPaymentMethod && (
            <View style={styles.metaCol}>
              <Text style={[styles.metaLabel, { color: subTextColor }]}>PAYMENT MODE</Text>
              <Text style={[styles.metaVal, { color: headingColor }]}>{transaction.paymentMethod || 'Cash / Online'}</Text>
            </View>
          )}
        </View>
      )}

      {/* Customer Info Card */}
      {tpl.showCustomerSection && (
        <View style={[styles.customerCard, { backgroundColor: altRowBg, borderColor }]}>
          <Text style={[styles.customerLabel, { color: accentColor }]}>
            {(tpl.customerSectionTitle || 'BILLED TO').toUpperCase()}
          </Text>
          {(() => {
            const nameStr = customer.name || '';
            const nameHasAvargal = nameStr.endsWith('அவர்கள்');
            const mainCustomerName = nameHasAvargal ? nameStr.replace(/\s+அவர்கள்$/, '').trim() : nameStr;
            const dynamicFontSize = mainCustomerName.length > 25 ? baseSize : (mainCustomerName.length > 18 ? baseSize + 1 : baseSize + 2);
            return (
              <Text style={[styles.customerName, { color: headingColor, fontSize: dynamicFontSize }]}>
                {mainCustomerName}
                {nameHasAvargal && (
                  <Text style={{ fontSize: Math.max(10.5, dynamicFontSize - 3.5), fontWeight: '600', color: subTextColor }}>
                    {' '}அவர்கள்
                  </Text>
                )}
              </Text>
            );
          })()}
          {(() => {
            const customerPhones = formatCustomerPhonesDisplay(customer.phone, customer.phoneNumbers);
            if (!tpl.showCustomerPhone || !customerPhones) return null;
            return (
              <Text style={[styles.customerSub, { color: subTextColor, fontSize: baseSize - 1 }]}>
                📞 {customerPhones}
              </Text>
            );
          })()}
          {tpl.showCustomerAddress && settings?.includeCustomerAddress && customer.address && (
            <Text style={[styles.customerSub, { color: subTextColor, fontSize: baseSize - 1 }]}>📍 {customer.address}</Text>
          )}
          {tpl.showCustomerGst && settings?.includeGst && customer.gstNo && (
            <Text style={[styles.customerSub, { color: subTextColor, fontSize: baseSize - 1 }]}>GSTIN: {customer.gstNo}</Text>
          )}
        </View>
      )}

      {/* Items Table */}
      <View style={[styles.tableContainer, { borderColor }]}>
        <View style={[styles.tableHeader, { backgroundColor: tableHeaderBg }]}>
          {showIndex && <Text style={[styles.th, styles.colIndex, { color: tableHeaderTextColor }]}>#</Text>}
          <Text style={[styles.th, styles.colItem, { color: tableHeaderTextColor }]}>ITEM</Text>
          <Text style={[styles.th, styles.colQty, { color: tableHeaderTextColor }]}>QTY</Text>
          {showRate && <Text style={[styles.th, styles.colRate, { color: tableHeaderTextColor }]}>RATE</Text>}
          <Text style={[styles.th, styles.colAmount, { color: tableHeaderTextColor }]}>TOTAL</Text>
        </View>

        {items.length > 0 ? (
          items.map((item, idx) => {
            const isEven = idx % 2 === 0;
            const rowBg = tpl.tableStyle === 'striped' ? (isEven ? cardBg : altRowBg) : cardBg;
            return (
              <View
                key={idx}
                style={[
                  styles.tableRow,
                  {
                    backgroundColor: rowBg,
                    borderBottomColor: tpl.tableStyle === 'clean' || tpl.tableStyle === 'minimal' ? 'transparent' : borderColor,
                    borderBottomWidth: tpl.tableStyle === 'bordered' ? 1 : 0.5,
                  },
                ]}
              >
                {showIndex && <Text style={[styles.td, styles.colIndex, { color: subTextColor }]}>{idx + 1}</Text>}
                <Text style={[styles.td, styles.colItem, { color: textColor, fontWeight: '600' }]} numberOfLines={2}>
                  {item.name}
                </Text>
                <Text style={[styles.td, styles.colQty, { color: textColor }]}>
                  {item.quantity} {showUnit && item.unit ? item.unit : ''}
                </Text>
                {showRate && <Text style={[styles.td, styles.colRate, { color: textColor }]}>{formatCurrency(item.unitPrice)}</Text>}
                <Text style={[styles.td, styles.colAmount, { color: headingColor, fontWeight: '700' }]}>
                  {formatCurrency(item.totalPrice)}
                </Text>
              </View>
            );
          })
        ) : (
          <View style={[styles.tableRow, { backgroundColor: cardBg }]}>
            <Text style={[styles.td, { color: subTextColor, textAlign: 'center', width: '100%', paddingVertical: 12 }]}>
              Transaction Summary Record
            </Text>
          </View>
        )}
      </View>

      {/* Summary Container */}
      <View style={styles.summaryContainer}>
        {/* Payment Info Section: QR Code / Bank Account Details */}
        <View style={{ flex: 1, paddingRight: 8 }}>
          {/* QR Code */}
          {settings?.includeQrCode !== false && tpl?.showQrCode !== false && settings?.paymentDisplayMode !== 'NONE' && settings?.paymentDisplayMode !== 'BANK' ? (
            <View style={styles.qrSection}>
              <Image
                source={{ uri: (tpl.useCustomQrCode && tpl.customQrCodeUri) ? tpl.customQrCodeUri : qrCodeUrl }}
                style={styles.qrImage}
                contentFit="contain"
              />
              <Text style={[styles.qrCaption, { color: subTextColor }]}>
                {tpl.useCustomQrCode && tpl.customQrCodeUri ? 'Scan to Pay / Verify' : 'Scan to Pay'}
              </Text>
            </View>
          ) : null}

          {/* Bank Account Details */}
          {settings?.includeBankDetails !== false && tpl?.showBankDetails !== false && settings?.paymentDisplayMode !== 'NONE' && settings?.paymentDisplayMode !== 'QR' ? (
            (settings?.bankName || company?.bankName || settings?.accountNo || company?.accountNo) ? (
              <View style={{ marginTop: (settings?.includeQrCode !== false && tpl?.showQrCode !== false) ? 6 : 0, padding: 6, backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderRadius: 8, borderWidth: 1, borderColor }}>
                <Text style={{ fontSize: 9, fontWeight: '800', color: accentColor, marginBottom: 2 }}>BANK PAYMENT DETAILS</Text>
                {(settings?.bankName || company?.bankName) ? (
                  <Text style={{ fontSize: 9, color: textColor, fontWeight: '600' }}>Bank: {settings?.bankName || company?.bankName}</Text>
                ) : null}
                {(settings?.accountNo || company?.accountNo) ? (
                  <Text style={{ fontSize: 9, color: textColor, fontWeight: '600' }}>A/c: {settings?.accountNo || company?.accountNo}</Text>
                ) : null}
                {(settings?.ifscCode || company?.ifscCode) ? (
                  <Text style={{ fontSize: 9, color: textColor, fontWeight: '600' }}>IFSC: {settings?.ifscCode || company?.ifscCode}</Text>
                ) : null}
                {(settings?.accountHolderName || company?.name) ? (
                  <Text style={{ fontSize: 9, color: subTextColor }}>Holder: {settings?.accountHolderName || company?.name}</Text>
                ) : null}
              </View>
            ) : null
          ) : null}
        </View>

        {/* Totals Breakdown */}
        <View style={styles.totalsSection}>
          {tpl.showSubtotal && hasExtraCharges && (
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: subTextColor }]}>Subtotal</Text>
              <Text style={[styles.totalValue, { color: textColor }]}>
                {formatCurrency(transaction.subtotal || transaction.totalAmount)}
              </Text>
            </View>
          )}

          {tpl.showDeliveryCharge !== false && !!transaction.shipmentCharge && (
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: subTextColor }]}>Delivery / Freight</Text>
              <Text style={[styles.totalValue, { color: textColor }]}>+{formatCurrency(transaction.shipmentCharge)}</Text>
            </View>
          )}

          {tpl.showLoadingCharge !== false && !!transaction.loadingCharge && (
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: subTextColor }]}>Loading Charge</Text>
              <Text style={[styles.totalValue, { color: textColor }]}>+{formatCurrency(transaction.loadingCharge)}</Text>
            </View>
          )}

          {tpl.showUnloadingCharge !== false && !!transaction.unloadingCharge && (
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: subTextColor }]}>Unloading Charge</Text>
              <Text style={[styles.totalValue, { color: textColor }]}>+{formatCurrency(transaction.unloadingCharge)}</Text>
            </View>
          )}

          {tpl.showExtraCharge !== false && !!transaction.extraAmount && (
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: subTextColor }]} numberOfLines={1}>
                {transaction.extraAmountDescription || 'Extra Charge'}
              </Text>
              <Text style={[styles.totalValue, { color: textColor }]}>+{formatCurrency(transaction.extraAmount)}</Text>
            </View>
          )}

          {Array.isArray(transaction.charges) && transaction.charges.map((chg, cIdx) => (
            chg && chg.amount ? (
              <View key={cIdx} style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: subTextColor }]} numberOfLines={1}>
                  {chg.name || 'Additional Charge'}
                </Text>
                <Text style={[styles.totalValue, { color: textColor }]}>+{formatCurrency(chg.amount)}</Text>
              </View>
            ) : null
          ))}

          {tpl.showTax && !!transaction.taxAmount ? (
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: subTextColor }]}>GST / Tax</Text>
              <Text style={[styles.totalValue, { color: textColor }]}>+{formatCurrency(transaction.taxAmount)}</Text>
            </View>
          ) : null}

          {tpl.showDiscount && !!transaction.discountAmount ? (
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: '#10B981' }]}>Discount</Text>
              <Text style={[styles.totalValue, { color: '#10B981', fontWeight: '700' }]}>-{formatCurrency(transaction.discountAmount)}</Text>
            </View>
          ) : null}

          {hasOldBalance ? (
            <>
              {hasExtraCharges ? (
                <View style={styles.totalRow}>
                  <Text style={[styles.totalLabel, { color: subTextColor, fontWeight: '600' }]}>Current Bill Total</Text>
                  <Text style={[styles.totalValue, { color: textColor, fontWeight: '600' }]}>{formatCurrency(transaction.totalAmount)}</Text>
                </View>
              ) : (
                <View style={styles.totalRow}>
                  <Text style={[styles.totalLabel, { color: subTextColor }]}>Subtotal</Text>
                  <Text style={[styles.totalValue, { color: textColor }]}>{formatCurrency(transaction.totalAmount)}</Text>
                </View>
              )}
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: '#EF4444', fontWeight: '600' }]}>Old Balance Due</Text>
                <Text style={[styles.totalValue, { color: '#EF4444', fontWeight: '700' }]}>+{formatCurrency(oldBalance)}</Text>
              </View>
              <View style={[styles.totalRow, styles.grandTotalRow, { borderTopColor: headingColor }]}>
                <Text style={[styles.grandTotalLabel, { color: headingColor }]} numberOfLines={1}>Grand Total (incl. Dues)</Text>
                <Text style={[styles.grandTotalValue, { color: accentColor }]}>{formatCurrency(grandTotalWithOldDues)}</Text>
              </View>
            </>
          ) : (
            <View style={[styles.totalRow, styles.grandTotalRow, { borderTopColor: headingColor }]}>
              <Text style={[styles.grandTotalLabel, { color: headingColor }]}>Total</Text>
              <Text style={[styles.grandTotalValue, { color: accentColor }]}>{formatCurrency(transaction.totalAmount)}</Text>
            </View>
          )}

          {tpl.showPaidAmount && (
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: '#10B981', fontWeight: '600' }]}>Paid Amount</Text>
              <Text style={[styles.totalValue, { color: '#10B981', fontWeight: '700' }]}>
                {formatCurrency(transaction.paidAmount)}
              </Text>
            </View>
          )}

          {tpl.showBalanceDue && (
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: '#EF4444', fontWeight: '600' }]}>
                {hasOldBalance ? 'Total Balance Due' : 'Balance Due'}
              </Text>
              <Text style={[styles.totalValue, { color: '#EF4444', fontWeight: '700' }]}>
                {formatCurrency(hasOldBalance ? netBalanceDue : transaction.pendingAmount)}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Signature & Notes Footer */}
      <View style={styles.footerRow}>
        <View style={{ flex: 1, marginRight: 10 }}>
          {tpl.showNotes && transaction.notes ? (
            <View style={[styles.notesBox, { backgroundColor: altRowBg, borderColor, marginBottom: 6 }]}>
              <Text style={[styles.notesText, { color: subTextColor }]}>Note: {transaction.notes}</Text>
            </View>
          ) : null}
          {tpl.showTerms && settings?.termsAndConditions ? (
            <View style={[styles.notesBox, { backgroundColor: altRowBg, borderColor }]}>
              <Text style={[styles.notesText, { color: subTextColor, fontSize: 8.5 }]}>
                Terms: {settings.termsAndConditions}
              </Text>
            </View>
          ) : null}
        </View>

        {tpl.showSignature && settings?.includeSignature && (
          <View style={styles.signatureBox}>
            {company.signatureUrl ? (
              <Image source={{ uri: company.signatureUrl }} style={styles.signatureImage} contentFit="contain" />
            ) : (
              <View style={{ height: 28 }} />
            )}
            <View style={[styles.signatureLine, { backgroundColor: borderColor }]} />
            <Text style={[styles.signatureLabel, { color: subTextColor }]}>
              {settings?.signatureTitle || 'Authorized Signatory'}
            </Text>
          </View>
        )}
      </View>

      {/* Thank you note */}
      {(tpl.showThankYouNote || tpl.showFooterBranding) && (
        <View style={[styles.thankYouBox, { borderTopColor: borderColor }]}>
          {tpl.showThankYouNote && (
            <Text style={[styles.thankYouText, { color: headingColor }]}>
              {settings?.thankYouNote || 'Thank you for your business! 🙏'}
            </Text>
          )}
          {tpl.showFooterBranding && (
            <Text style={[styles.brandingText, { color: subTextColor }]}>
              {tpl.footerBrandingText || `Generated via ${company.name || 'Business App'}`}
            </Text>
          )}
        </View>
      )}
    </View>
  );
};

export const TransactionReceiptView = React.forwardRef(TransactionReceiptViewComponent);
TransactionReceiptView.displayName = 'TransactionReceiptView';

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  watermarkContainer: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 0,
  },
  watermarkText: {
    fontSize: 32,
    fontWeight: '900',
    color: 'rgba(148, 163, 184, 0.12)',
    transform: [{ rotate: '-30deg' }],
    letterSpacing: 4,
    textAlign: 'center',
  },
  accentBar: {
    height: 4,
    borderRadius: 2,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerCentered: {
    alignItems: 'center',
    textAlign: 'center',
    marginBottom: 10,
  },
  headerModern: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    borderLeftWidth: 4,
    marginBottom: 12,
  },
  companyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 10,
  },
  logoFallback: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoFallbackText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  companyDetails: {
    flex: 1,
  },
  companyName: {
    fontWeight: '700',
  },
  companySub: {
    fontSize: 11,
    marginTop: 1,
  },
  statusBox: {
    alignItems: 'flex-end',
  },
  invoiceTitleText: {
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    marginBottom: 4,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  invoiceNumber: {
    fontWeight: '700',
  },
  metaGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginVertical: 10,
  },
  metaCol: {
    flex: 1,
    alignItems: 'center',
  },
  metaLabel: {
    fontSize: 8.5,
    fontWeight: '800',
  },
  metaVal: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 1,
  },
  customerCard: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  customerLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  customerName: {
    fontWeight: '700',
  },
  customerSub: {
    fontSize: 11,
    marginTop: 1,
  },
  tableContainer: {
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 12,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  th: {
    fontSize: 10,
    fontWeight: '700',
  },
  td: {
    fontSize: 11,
  },
  colIndex: {
    width: 20,
    textAlign: 'center',
  },
  colItem: {
    flex: 2,
    paddingLeft: 4,
  },
  colQty: {
    flex: 1,
    textAlign: 'right',
  },
  colRate: {
    flex: 1.2,
    textAlign: 'right',
  },
  colAmount: {
    flex: 1.3,
    textAlign: 'right',
  },
  summaryContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  qrSection: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrImage: {
    width: 64,
    height: 64,
    borderRadius: 6,
  },
  qrCaption: {
    fontSize: 9,
    marginTop: 2,
    fontWeight: '600',
  },
  totalsSection: {
    flex: 1,
    minWidth: 140,
    padding: 6,
    borderRadius: 8,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  totalLabel: {
    fontSize: 11,
  },
  totalValue: {
    fontSize: 11,
    fontWeight: '600',
  },
  grandTotalRow: {
    borderTopWidth: 1.5,
    paddingTop: 5,
    marginTop: 5,
  },
  grandTotalLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    flex: 1,
  },
  grandTotalValue: {
    fontSize: 13.5,
    fontWeight: '900',
    marginLeft: 4,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 10,
  },
  notesBox: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  notesText: {
    fontSize: 10,
  },
  signatureBox: {
    alignItems: 'center',
    width: 110,
  },
  signatureImage: {
    width: 80,
    height: 30,
    marginBottom: 2,
  },
  signatureLine: {
    width: 100,
    height: 1,
  },
  signatureLabel: {
    fontSize: 9,
    marginTop: 2,
    fontWeight: '600',
  },
  thankYouBox: {
    borderTopWidth: 1,
    paddingTop: 8,
    alignItems: 'center',
  },
  thankYouText: {
    fontSize: 12,
    fontWeight: '700',
  },
  brandingText: {
    fontSize: 9,
    marginTop: 1,
  },
});
