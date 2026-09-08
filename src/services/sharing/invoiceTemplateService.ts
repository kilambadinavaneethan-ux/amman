import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_INVOICE_TEMPLATE, InvoiceTemplate } from '../../types/sharing';

const TEMPLATE_KEY = '@invoice_template_v1';

export const invoiceTemplateService = {
  async getTemplate(): Promise<InvoiceTemplate> {
    try {
      const stored = await AsyncStorage.getItem(TEMPLATE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          ...DEFAULT_INVOICE_TEMPLATE,
          ...parsed,
          showFooterBranding: parsed.userSetFooterBranding !== undefined ? parsed.userSetFooterBranding : false,
          showPaymentStatus: parsed.userSetPaymentStatus !== undefined ? parsed.userSetPaymentStatus : false,
        };
      }
    } catch (error) {
      console.warn('Error loading invoice template, using defaults:', error);
    }
    return DEFAULT_INVOICE_TEMPLATE;
  },

  async saveTemplate(template: Partial<InvoiceTemplate>): Promise<InvoiceTemplate> {
    try {
      const current = await this.getTemplate();
      const updated: InvoiceTemplate = {
        ...current,
        ...template,
        ...(template.showFooterBranding !== undefined ? { userSetFooterBranding: template.showFooterBranding } : {}),
        ...(template.showPaymentStatus !== undefined ? { userSetPaymentStatus: template.showPaymentStatus } : {}),
      };
      await AsyncStorage.setItem(TEMPLATE_KEY, JSON.stringify(updated));

      // Sync common fields to shareSettings storage silently
      try {
        const storedShare = await AsyncStorage.getItem('@transaction_share_settings_v1');
        const currentShareSettings = storedShare ? JSON.parse(storedShare) : {};
        const updatedShareSettings = {
          ...currentShareSettings,
          themeColor: updated.accentColor || currentShareSettings.themeColor,
          includeLogo: updated.showCompanyLogo ?? currentShareSettings.includeLogo,
          includeSignature: updated.showSignature ?? currentShareSettings.includeSignature,
          includeQrCode: updated.showQrCode ?? currentShareSettings.includeQrCode,
          useCustomQrCode: updated.useCustomQrCode ?? currentShareSettings.useCustomQrCode,
          customQrCodeUri: updated.customQrCodeUri ?? currentShareSettings.customQrCodeUri,
          paymentDisplayMode: updated.paymentDisplayMode ?? currentShareSettings.paymentDisplayMode,
          includeBankDetails: updated.showBankDetails ?? currentShareSettings.includeBankDetails,
          bankName: updated.bankName ?? currentShareSettings.bankName,
          accountNo: updated.accountNo ?? currentShareSettings.accountNo,
          ifscCode: updated.ifscCode ?? currentShareSettings.ifscCode,
          accountHolderName: updated.accountHolderName ?? currentShareSettings.accountHolderName,
          bankAccounts: updated.bankAccounts ?? currentShareSettings.bankAccounts,
          selectedBankAccountId: updated.selectedBankAccountId ?? currentShareSettings.selectedBankAccountId,
          includeGst: updated.showCompanyGst ?? currentShareSettings.includeGst,
          includeCustomerAddress: updated.showCustomerAddress ?? currentShareSettings.includeCustomerAddress,
          includeCustomerPhone: updated.showCustomerPhone ?? currentShareSettings.includeCustomerPhone,
        };
        await AsyncStorage.setItem('@transaction_share_settings_v1', JSON.stringify(updatedShareSettings));
      } catch (err) {
        console.warn('Failed to sync shareSettings from invoiceTemplate:', err);
      }

      return updated;
    } catch (error) {
      console.error('Error saving invoice template:', error);
      throw error;
    }
  },

  async resetTemplate(): Promise<InvoiceTemplate> {
    try {
      await AsyncStorage.removeItem(TEMPLATE_KEY);
    } catch (error) {
      console.error('Error resetting invoice template:', error);
    }
    return DEFAULT_INVOICE_TEMPLATE;
  },
};
