import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_SHARE_SETTINGS, ShareSettings } from '../../types/sharing';

const SETTINGS_KEY = '@transaction_share_settings_v1';

export const shareSettingsService = {
  async getSettings(): Promise<ShareSettings> {
    try {
      const stored = await AsyncStorage.getItem(SETTINGS_KEY);
      if (stored) {
        return {
          ...DEFAULT_SHARE_SETTINGS,
          ...JSON.parse(stored),
        };
      }
    } catch (error) {
      console.warn('Error loading share settings, using defaults:', error);
    }
    return DEFAULT_SHARE_SETTINGS;
  },

  async saveSettingsSilent(settings: Partial<ShareSettings>): Promise<ShareSettings> {
    try {
      const current = await this.getSettings();
      const updated: ShareSettings = {
        ...current,
        ...settings,
      };
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
      return updated;
    } catch (error) {
      console.error('Error saving share settings silently:', error);
      throw error;
    }
  },

  async saveSettings(settings: Partial<ShareSettings>): Promise<ShareSettings> {
    try {
      const updated = await this.saveSettingsSilent(settings);

      // Sync matching fields to invoiceTemplate storage silently
      try {
        const storedTpl = await AsyncStorage.getItem('@invoice_template_v1');
        const currentTpl = storedTpl ? JSON.parse(storedTpl) : {};
        const updatedTpl = {
          ...currentTpl,
          accentColor: settings.themeColor || currentTpl.accentColor,
          showCompanyLogo: settings.includeLogo ?? currentTpl.showCompanyLogo,
          showSignature: settings.includeSignature ?? currentTpl.showSignature,
          showQrCode: settings.includeQrCode ?? currentTpl.showQrCode,
          useCustomQrCode: settings.useCustomQrCode ?? currentTpl.useCustomQrCode,
          customQrCodeUri: settings.customQrCodeUri ?? currentTpl.customQrCodeUri,
          paymentDisplayMode: settings.paymentDisplayMode ?? currentTpl.paymentDisplayMode,
          showBankDetails: settings.includeBankDetails ?? currentTpl.showBankDetails,
          bankName: settings.bankName ?? currentTpl.bankName,
          accountNo: settings.accountNo ?? currentTpl.accountNo,
          ifscCode: settings.ifscCode ?? currentTpl.ifscCode,
          accountHolderName: settings.accountHolderName ?? currentTpl.accountHolderName,
          bankAccounts: settings.bankAccounts ?? currentTpl.bankAccounts,
          selectedBankAccountId: settings.selectedBankAccountId ?? currentTpl.selectedBankAccountId,
          showCompanyGst: settings.includeGst ?? currentTpl.showCompanyGst,
          showCustomerAddress: settings.includeCustomerAddress ?? currentTpl.showCustomerAddress,
          showCustomerPhone: settings.includeCustomerPhone ?? currentTpl.showCustomerPhone,
        };
        await AsyncStorage.setItem('@invoice_template_v1', JSON.stringify(updatedTpl));
      } catch (err) {
        console.warn('Failed to sync invoiceTemplate from shareSettings:', err);
      }

      return updated;
    } catch (error) {
      console.error('Error saving share settings:', error);
      throw error;
    }
  },

  async resetSettings(): Promise<ShareSettings> {
    try {
      await AsyncStorage.removeItem(SETTINGS_KEY);
    } catch (error) {
      console.error('Error resetting share settings:', error);
    }
    return DEFAULT_SHARE_SETTINGS;
  },
};
