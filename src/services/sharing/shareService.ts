import { Alert, Linking, Platform, Share } from 'react-native';
import * as Sharing from 'expo-sharing';

import { ShareSettings, TransactionData, formatCustomerPhonesDisplay, formatCustomerPhoneNumbers } from '../../types/sharing';
import { generatePdfInvoice } from './pdfGenerator';
import { generateReceiptImage } from './imageGenerator';

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

export function formatTransactionAsText(transaction: TransactionData, customTemplate?: string): string {
  const company = transaction.company || {};
  const customer = transaction.customer || { name: 'Valued Customer' };
  const items = transaction.items || [];
  const companyName = company.name || 'Our Business';
  const customerPhones = formatCustomerPhonesDisplay(customer.phone, customer.phoneNumbers);

  const oldBal = transaction.previousBalance ? Number(transaction.previousBalance) : 0;
  const hasOldBal = oldBal > 0;
  const gTotal = (transaction.totalAmount || 0) + oldBal;
  const netDue = Math.max(0, gTotal - (transaction.paidAmount || 0));

  const itemsFormatted = items.length > 0
    ? items.map((item, index) => `${index + 1}. *${item.name}*\n   ${item.quantity}${item.unit ? ' ' + item.unit : ''} × ${formatCurrency(item.unitPrice)} = ${formatCurrency(item.totalPrice)}`).join('\n')
    : 'Transaction details record';

  const subtotalVal = transaction.subtotal !== undefined
    ? transaction.subtotal
    : (items.reduce((sum, item) => sum + (item.totalPrice || 0), 0) || transaction.totalAmount || 0);

  const shipmentVal = transaction.shipmentCharge || 0;
  const loadingVal = transaction.loadingCharge || 0;
  const unloadingVal = transaction.unloadingCharge || 0;
  const extraVal = transaction.extraAmount || 0;
  const extraLabel = transaction.extraAmountDescription || 'Extra Charge';
  const taxVal = transaction.taxAmount || 0;
  const discVal = transaction.discountAmount || 0;

  // Full Order Calculations Block
  let calcBlock = `📦 *ITEMS*\n${itemsFormatted}\n`;
  calcBlock += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  calcBlock += `💰 *ORDER CALCULATIONS*\n`;
  calcBlock += `• Items Subtotal: ${formatCurrency(subtotalVal)}\n`;
  if (shipmentVal > 0) calcBlock += `• Delivery / Freight: +${formatCurrency(shipmentVal)}\n`;
  if (loadingVal > 0) calcBlock += `• Loading Charge: +${formatCurrency(loadingVal)}\n`;
  if (unloadingVal > 0) calcBlock += `• Unloading Charge: +${formatCurrency(unloadingVal)}\n`;
  if (extraVal > 0) calcBlock += `• ${extraLabel}: +${formatCurrency(extraVal)}\n`;
  if (Array.isArray(transaction.charges)) {
    transaction.charges.forEach((chg) => {
      if (chg && chg.amount) {
        calcBlock += `• ${chg.name || 'Additional Charge'}: +${formatCurrency(chg.amount)}\n`;
      }
    });
  }
  if (taxVal > 0) calcBlock += `• Tax / GST: +${formatCurrency(taxVal)}\n`;
  if (discVal > 0) calcBlock += `• Discount: -${formatCurrency(discVal)}\n`;

  if (hasOldBal) {
    calcBlock += `• Current Invoice Total: ${formatCurrency(transaction.totalAmount)}\n`;
    calcBlock += `• Old Balance Due: +${formatCurrency(oldBal)}\n`;
    calcBlock += `⭐ *Grand Total (incl. Dues): ${formatCurrency(gTotal)}*\n`;
  } else {
    calcBlock += `⭐ *Total Amount: ${formatCurrency(transaction.totalAmount)}*\n`;
  }
  calcBlock += `• Amount Paid: ${formatCurrency(transaction.paidAmount)}\n`;
  calcBlock += `🚨 *Balance Remaining: ${formatCurrency(hasOldBal ? netDue : (transaction.pendingAmount || 0))}*`;

  if (customTemplate && customTemplate.trim().length > 0) {
    return customTemplate
      .replace(/\{company\}/g, companyName)
      .replace(/\{customer\}/g, customer.name)
      .replace(/\{customer_name\}/g, customer.name)
      .replace(/\{customer_phone\}/g, customerPhones || 'N/A')
      .replace(/\{customer_phones\}/g, customerPhones || 'N/A')
      .replace(/\{customerPhone\}/g, customerPhones || 'N/A')
      .replace(/\{invoice\}/g, transaction.invoiceNumber)
      .replace(/\{date\}/g, formatDate(transaction.date))
      .replace(/\{calculations\}/g, calcBlock)
      .replace(/\{breakdown\}/g, calcBlock)
      .replace(/\{items\}/g, itemsFormatted)
      .replace(/\{subtotal\}/g, formatCurrency(subtotalVal))
      .replace(/\{shipmentCharge\}/g, formatCurrency(shipmentVal))
      .replace(/\{loadingCharge\}/g, formatCurrency(loadingVal))
      .replace(/\{unloadingCharge\}/g, formatCurrency(unloadingVal))
      .replace(/\{extraAmount\}/g, formatCurrency(extraVal))
      .replace(/\{taxAmount\}/g, formatCurrency(taxVal))
      .replace(/\{discountAmount\}/g, formatCurrency(discVal))
      .replace(/\{total\}/g, formatCurrency(transaction.totalAmount))
      .replace(/\{paid\}/g, formatCurrency(transaction.paidAmount))
      .replace(/\{due\}/g, formatCurrency(hasOldBal ? netDue : transaction.pendingAmount))
      .replace(/\{oldBalance\}/g, formatCurrency(oldBal))
      .replace(/\{grandTotal\}/g, formatCurrency(gTotal))
      .replace(/\{link\}/g, transaction.paymentLink || '');
  }

  let text = `🧾 *TAX INVOICE / RECEIPT*\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `🏢 *${companyName}*\n`;
  if (company.phone) text += `📞 Phone: ${company.phone}\n`;
  if (company.email) text += `✉️ Email: ${company.email}\n`;
  if (company.address) text += `📍 Address: ${company.address}\n`;
  if (company.gstNo) text += `🏛️ GSTIN: ${company.gstNo}\n`;

  text += `\n📄 *INVOICE DETAILS*\n`;
  text += `• Invoice No: #${transaction.invoiceNumber}\n`;
  text += `• Date: ${formatDate(transaction.date)}\n`;
  if (transaction.dueDate) text += `• Due Date: ${formatDate(transaction.dueDate)}\n`;
  if (transaction.paymentMethod) text += `• Payment Mode: ${transaction.paymentMethod}\n`;

  text += `\n👤 *BILLED TO*\n`;
  text += `• Customer: ${customer.name}\n`;
  if (customerPhones) text += `• Phone: ${customerPhones}\n`;
  if (customer.address) text += `• Address: ${customer.address}\n`;
  if (customer.gstNo) text += `• GSTIN: ${customer.gstNo}\n`;

  text += `\n📦 *ITEMS*\n`;
  if (items.length > 0) {
    items.forEach((item, index) => {
      text += `${index + 1}. *${item.name}*\n`;
      text += `   ${item.quantity}${item.unit ? ' ' + item.unit : ''} × ${formatCurrency(item.unitPrice)} = ${formatCurrency(item.totalPrice)}\n`;
    });
  } else {
    text += `Transaction details record\n`;
  }

  text += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `💰 *SUMMARY & CHARGES*\n`;

  const hasExtraCharges = !!(
    transaction.shipmentCharge ||
    transaction.loadingCharge ||
    transaction.unloadingCharge ||
    transaction.extraAmount ||
    (Array.isArray(transaction.charges) && transaction.charges.some(c => c && c.amount)) ||
    transaction.taxAmount ||
    transaction.discountAmount
  );

  if (transaction.subtotal && hasExtraCharges) {
    text += `• Items Subtotal: ${formatCurrency(transaction.subtotal)}\n`;
  }
  if (transaction.shipmentCharge) text += `• Delivery / Freight: +${formatCurrency(transaction.shipmentCharge)}\n`;
  if (transaction.loadingCharge) text += `• Loading Charge: +${formatCurrency(transaction.loadingCharge)}\n`;
  if (transaction.unloadingCharge) text += `• Unloading Charge: +${formatCurrency(transaction.unloadingCharge)}\n`;
  if (transaction.extraAmount) {
    const extraLabel = transaction.extraAmountDescription ? transaction.extraAmountDescription : 'Extra Charge';
    text += `• ${extraLabel}: +${formatCurrency(transaction.extraAmount)}\n`;
  }
  if (Array.isArray(transaction.charges)) {
    transaction.charges.forEach((chg) => {
      if (chg && chg.amount) {
        text += `• ${chg.name || 'Additional Charge'}: +${formatCurrency(chg.amount)}\n`;
      }
    });
  }
  if (transaction.taxAmount) text += `• GST / Tax: +${formatCurrency(transaction.taxAmount)}\n`;
  if (transaction.discountAmount) text += `• Discount: -${formatCurrency(transaction.discountAmount)}\n`;

  if (hasOldBal) {
    if (hasExtraCharges) text += `• Current Invoice Total: ${formatCurrency(transaction.totalAmount)}\n`;
    else text += `• Subtotal: ${formatCurrency(transaction.totalAmount)}\n`;
    text += `• Old Balance Due: +${formatCurrency(oldBal)}\n`;
    text += `⭐ *Grand Total (incl. Dues): ${formatCurrency(gTotal)}*\n`;
  } else {
    text += `⭐ *Total Amount: ${formatCurrency(transaction.totalAmount)}*\n`;
  }

  if (transaction.paidAmount !== undefined) {
    text += `• Paid Amount: ${formatCurrency(transaction.paidAmount)}\n`;
  }

  const dueLabel = hasOldBal ? 'Total Balance Due' : 'Balance Due';
  const dueVal = hasOldBal ? netDue : transaction.pendingAmount;
  text += `🚨 *${dueLabel}: ${formatCurrency(dueVal)}*\n`;
  text += `📌 *Status: ${(transaction.paymentStatus || 'COMPLETED').toUpperCase()}*\n`;

  if (company.upiId || company.bankName || company.accountNo || transaction.paymentLink) {
    text += `\n💳 *PAYMENT INFORMATION*\n`;
    if (company.upiId) text += `• UPI ID: ${company.upiId}\n`;
    if (company.bankName) text += `• Bank Name: ${company.bankName}\n`;
    if (company.accountNo) text += `• Account No: ${company.accountNo}\n`;
    if (company.ifscCode) text += `• IFSC Code: ${company.ifscCode}\n`;
    if (transaction.paymentLink) text += `• Payment Link: ${transaction.paymentLink}\n`;
  }

  if (transaction.notes) {
    text += `\n📝 *Notes:* ${transaction.notes}\n`;
  }

  text += `\nThank you for doing business with us! 🙏`;
  return text;
}

export const shareService = {
  async shareAsImage(
    transaction: TransactionData,
    settings: ShareSettings,
    viewRef: React.RefObject<any>
  ): Promise<void> {
    const imageUri = await generateReceiptImage(viewRef, settings);
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      Alert.alert('Sharing Unavailable', 'Sharing is not supported on this device or environment.');
      return;
    }
    await Sharing.shareAsync(imageUri, {
      mimeType: 'image/png',
      dialogTitle: `Share Receipt #${transaction.invoiceNumber}`,
      UTI: 'public.png',
    });
  },

  async shareAsPdf(
    transaction: TransactionData,
    settings: ShareSettings
  ): Promise<string> {
    const pdfUri = await generatePdfInvoice(transaction, settings);
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      Alert.alert('Sharing Unavailable', 'Sharing is not supported on this device.');
      return pdfUri;
    }
    await Sharing.shareAsync(pdfUri, {
      mimeType: 'application/pdf',
      dialogTitle: `Share Invoice PDF #${transaction.invoiceNumber}`,
      UTI: 'com.adobe.pdf',
    });
    return pdfUri;
  },

  async downloadPdf(
    transaction: TransactionData,
    settings: ShareSettings
  ): Promise<void> {
    const pdfUri = await generatePdfInvoice(transaction, settings);
    try {
      // Lazy import to avoid triggering the Expo Go MediaLibrary warning at app startup
      const MediaLibrary = await import('expo-media-library');
      const permission = await MediaLibrary.requestPermissionsAsync();
      if (permission.granted) {
        const asset = await MediaLibrary.createAssetAsync(pdfUri);
        await MediaLibrary.createAlbumAsync('Invoices', asset, false);
        Alert.alert('Success', 'PDF Invoice saved to your device gallery!');
        return;
      }
    } catch (err) {
      console.warn('MediaLibrary unavailable, using share fallback:', err);
    }

    // Fallback: open native share sheet so user can save/send the PDF
    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      await Sharing.shareAsync(pdfUri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Save Invoice PDF',
        UTI: 'com.adobe.pdf',
      });
    } else {
      Alert.alert('PDF Generated', `Invoice PDF created at: ${pdfUri}`);
    }
  },

  async shareAsText(transaction: TransactionData, settings?: ShareSettings): Promise<void> {
    const text = formatTransactionAsText(transaction, settings?.customMessageTemplate);
    try {
      if (Platform.OS === 'web' && navigator.share) {
        await navigator.share({
          title: `Invoice #${transaction.invoiceNumber}`,
          text,
        });
        return;
      }

      await Share.share(
        {
          message: text,
          title: `Invoice #${transaction.invoiceNumber}`,
        },
        {
          dialogTitle: `Share Invoice #${transaction.invoiceNumber}`,
          subject: `Invoice #${transaction.invoiceNumber}`,
        }
      );
    } catch (error: any) {
      console.error('Error sharing text:', error);
      Alert.alert(`Invoice #${transaction.invoiceNumber}`, text);
    }
  },

  async shareToWhatsApp(
    transaction: TransactionData,
    settings: ShareSettings,
    viewRef: React.RefObject<any>,
    formatPreference: 'IMAGE' | 'PDF' | 'TEXT' = 'TEXT'
  ): Promise<void> {
    try {
      // Clean phone number: remove non-digits
      const primaryPhoneRaw = (transaction.customer?.phoneNumbers?.[0] || transaction.customer?.phone || '').split(/[,/|]+/)[0].trim();
      let customerPhone = primaryPhoneRaw.replace(/[^0-9]/g, '');
      // If 10 digits (standard Indian number without country code), prepend 91
      if (customerPhone.length === 10) {
        customerPhone = `91${customerPhone}`;
      }

      if (formatPreference === 'IMAGE' && viewRef && viewRef.current) {
        const imageUri = await generateReceiptImage(viewRef, settings);
        await Sharing.shareAsync(imageUri, {
          mimeType: 'image/png',
          dialogTitle: `Receipt #${transaction.invoiceNumber}`,
        });
        return;
      }

      if (formatPreference === 'PDF') {
        const pdfUri = await generatePdfInvoice(transaction, settings);
        await Sharing.shareAsync(pdfUri, {
          mimeType: 'application/pdf',
          dialogTitle: `Invoice PDF #${transaction.invoiceNumber}`,
        });
        return;
      }

      const textMessage = formatTransactionAsText(transaction, settings?.customMessageTemplate);
      const encodedText = encodeURIComponent(textMessage);
      const whatsappNativeUrl = customerPhone
        ? `whatsapp://send?phone=${customerPhone}&text=${encodedText}`
        : `whatsapp://send?text=${encodedText}`;
      const whatsappWebUrl = customerPhone
        ? `https://wa.me/${customerPhone}?text=${encodedText}`
        : `https://api.whatsapp.com/send?text=${encodedText}`;

      try {
        const canOpen = await Linking.canOpenURL('whatsapp://send');
        if (canOpen) {
          await Linking.openURL(whatsappNativeUrl);
          return;
        }
      } catch (err) {
        // Fallback to web link
      }

      // Universal wa.me fallback
      await Linking.openURL(whatsappWebUrl);
    } catch (error: any) {
      console.error('WhatsApp share error:', error);
      Alert.alert(
        'WhatsApp Error',
        `Unable to open WhatsApp: ${error.message || 'Please verify WhatsApp is installed.'}`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'System Share',
            onPress: () => this.shareSystem(transaction, settings, viewRef, formatPreference),
          },
        ]
      );
    }
  },

  async shareViaSms(transaction: TransactionData): Promise<void> {
    const companyName = transaction.company?.name || 'Our Company';
    const oldBal = transaction.previousBalance ? Number(transaction.previousBalance) : 0;
    const gTotal = (transaction.totalAmount || 0) + oldBal;
    const netDue = Math.max(0, gTotal - (transaction.paidAmount || 0));
    const amountDue = formatCurrency(oldBal > 0 ? netDue : (transaction.pendingAmount || 0));

    let message = `Invoice #${transaction.invoiceNumber}\n`;
    message += `From: ${companyName}\n`;
    message += `To: ${transaction.customer?.name || 'Customer'}\n`;
    message += `Total Amount: ${formatCurrency(transaction.totalAmount)}\n`;
    if (oldBal > 0) {
      message += `Grand Total (incl dues): ${formatCurrency(gTotal)}\n`;
    }
    message += `Amount Due: ${amountDue}\n`;

    if (transaction.paymentLink) {
      message += `Pay Online: ${transaction.paymentLink}\n`;
    }

    message += `Thank you!`;

    const encodedMessage = encodeURIComponent(message);
    const primaryPhoneRaw = (transaction.customer?.phoneNumbers?.[0] || transaction.customer?.phone || '').split(/[,/|]+/)[0].trim();
    const phone = primaryPhoneRaw.replace(/[^0-9]/g, '');

    const separator = Platform.OS === 'ios' ? '&' : '?';
    const smsUrl = phone
      ? `sms:${phone}${separator}body=${encodedMessage}`
      : `sms:${separator}body=${encodedMessage}`;

    try {
      const canOpen = await Linking.canOpenURL(smsUrl);
      if (canOpen) {
        await Linking.openURL(smsUrl);
      } else {
        // Direct open fallback
        await Linking.openURL(`sms:?body=${encodedMessage}`);
      }
    } catch (error: any) {
      console.error('SMS launch error:', error);
      Alert.alert('SMS Error', 'Could not launch SMS app on this device.');
    }
  },

  async shareSystem(
    transaction: TransactionData,
    settings: ShareSettings,
    viewRef?: React.RefObject<any>,
    preferredFormat: 'IMAGE' | 'PDF' | 'TEXT' = 'IMAGE'
  ): Promise<void> {
    if (preferredFormat === 'PDF') {
      await this.shareAsPdf(transaction, settings);
    } else if (preferredFormat === 'IMAGE' && viewRef && viewRef.current) {
      await this.shareAsImage(transaction, settings, viewRef);
    } else {
      await this.shareAsText(transaction);
    }
  },
};
