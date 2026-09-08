import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { listLocalImages, saveImageToLocalFolder, LocalImageFile } from '../../src/services/localImageStorageService';
import { useTheme } from '../context/ThemeContext';
import ProtectedRoute from '../components/ProtectedRoute';
import { DEFAULT_SHARE_SETTINGS, ShareFormat, ShareSettings, TransactionData, BankAccount } from '../../src/types/sharing';
import { shareSettingsService } from '../../src/services/sharing/shareSettingsService';
import { TransactionShareBottomSheet } from '../../src/components/sharing/TransactionShareBottomSheet';

const COLOR_PRESETS = [
  { label: 'Royal Blue', color: '#2563EB' },
  { label: 'Emerald', color: '#10B981' },
  { label: 'Indigo', color: '#6C5CE7' },
  { label: 'Rose Pink', color: '#EC4899' },
  { label: 'Amber Gold', color: '#F59E0B' },
  { label: 'Dark Slate', color: '#0F172A' },
];

const WATERMARK_PRESETS = ['PAID', 'CONFIDENTIAL', 'DUPLICATE', 'ORIGINAL', 'SAMPLE', 'OFFICIAL RECEIPT'];

const TEMPLATE_TAGS = [
  { tag: '{company}', label: 'Company Name' },
  { tag: '{customer}', label: 'Customer Name' },
  { tag: '{invoice}', label: 'Invoice #' },
  { tag: '{date}', label: 'Date' },
  { tag: '{calculations}', label: 'Full Calculations' },
  { tag: '{items}', label: 'Items List' },
  { tag: '{subtotal}', label: 'Subtotal' },
  { tag: '{shipmentCharge}', label: 'Shipment Charge' },
  { tag: '{loadingCharge}', label: 'Loading Charge' },
  { tag: '{unloadingCharge}', label: 'Unloading Charge' },
  { tag: '{extraAmount}', label: 'Extra Charge' },
  { tag: '{total}', label: 'Total Amount' },
  { tag: '{oldBalance}', label: 'Old Balance' },
  { tag: '{grandTotal}', label: 'Grand Total' },
  { tag: '{paid}', label: 'Paid Amount' },
  { tag: '{due}', label: 'Balance Due' },
  { tag: '{link}', label: 'Payment Link' },
];

const CUSTOMER_TEMPLATE_TAGS = [
  { tag: '{company}', label: 'Company Name' },
  { tag: '{customer_name}', label: 'Customer Name' },
  { tag: '{customer_phone}', label: 'Customer Phone' },
  { tag: '{customer_address}', label: 'Customer Address' },
  { tag: '{total_orders}', label: 'Total Orders' },
  { tag: '{total_sales}', label: 'Total Sales' },
  { tag: '{total_paid}', label: 'Total Paid' },
  { tag: '{old_balance}', label: 'Old Dues' },
  { tag: '{net_balance_due}', label: 'Net Balance Due' },
  { tag: '{ledger_summary}', label: 'Ledger Summary' },
  { tag: '{upi_link}', label: 'UPI Payment Link' },
];

// Sample transaction for live preview / test sharing
const SAMPLE_TRANSACTION: TransactionData = {
  id: 'sample-001',
  transactionType: 'invoice',
  invoiceNumber: 'INV-2026-001',
  date: new Date().toISOString(),
  dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
  customer: {
    name: 'Acme Enterprises',
    phone: '+91 98765 43210',
    address: '123 Business Park, Tech Zone, City',
    gstNo: '33AAAAA0000A1Z5',
  },
  company: {
    name: 'Hollow Brick Accounting',
    phone: '+91 91234 56789',
    gstNo: '33BBBBA1111B2Z6',
    upiId: 'mybusiness@upi',
  },
  items: [
    { name: 'Red Hollow Bricks (Standard)', quantity: 500, unitPrice: 12, totalPrice: 6000, unit: 'pcs' },
    { name: 'Cement Bags (50kg)', quantity: 20, unitPrice: 380, totalPrice: 7600, unit: 'bags' },
  ],
  subtotal: 13600,
  shipmentCharge: 500,
  loadingCharge: 200,
  unloadingCharge: 200,
  extraAmount: 100,
  extraAmountDescription: 'Service Charge',
  taxAmount: 680,
  totalAmount: 15280,
  paidAmount: 10000,
  pendingAmount: 5280,
  previousBalance: 1500,
  paymentStatus: 'PARTIAL',
  notes: 'Deliver to site block B by Friday.',
};

function ShareTransactionSettingsScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { colors } = theme;

  const [settings, setSettings] = useState<ShareSettings>(DEFAULT_SHARE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<'GENERAL' | 'LAYOUT' | 'WATERMARK' | 'TEMPLATE'>('GENERAL');
  const [testShareVisible, setTestShareVisible] = useState(false);
  const [localImagesModalVisible, setLocalImagesModalVisible] = useState(false);
  const [localImagesList, setLocalImagesList] = useState<LocalImageFile[]>([]);

  // Bank Accounts state & handlers
  const [bankModalVisible, setBankModalVisible] = useState(false);
  const [editingBankAccountId, setEditingBankAccountId] = useState<string | null>(null);
  const [modalBankName, setModalBankName] = useState('');
  const [modalAccountNo, setModalAccountNo] = useState('');
  const [modalIfscCode, setModalIfscCode] = useState('');
  const [modalAccountHolderName, setModalAccountHolderName] = useState('');

  const handleOpenAddBankModal = () => {
    setEditingBankAccountId(null);
    setModalBankName('');
    setModalAccountNo('');
    setModalIfscCode('');
    setModalAccountHolderName(settings.accountHolderName || '');
    setBankModalVisible(true);
  };

  const handleOpenEditBankModal = (account: BankAccount) => {
    setEditingBankAccountId(account.id);
    setModalBankName(account.bankName || '');
    setModalAccountNo(account.accountNo || '');
    setModalIfscCode(account.ifscCode || '');
    setModalAccountHolderName(account.accountHolderName || '');
    setBankModalVisible(true);
  };

  const handleSaveBankAccount = () => {
    if (!modalBankName.trim() && !modalAccountNo.trim()) {
      Alert.alert('Required Information', 'Please enter at least Bank Name or Account Number.');
      return;
    }

    const existingAccounts = settings.bankAccounts || [];
    let updatedAccounts: BankAccount[];

    if (editingBankAccountId) {
      updatedAccounts = existingAccounts.map((acc) =>
        acc.id === editingBankAccountId
          ? {
              ...acc,
              bankName: modalBankName.trim(),
              accountNo: modalAccountNo.trim(),
              ifscCode: modalIfscCode.trim().toUpperCase(),
              accountHolderName: modalAccountHolderName.trim(),
            }
          : acc
      );
    } else {
      const newAccount: BankAccount = {
        id: `bank_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        bankName: modalBankName.trim(),
        accountNo: modalAccountNo.trim(),
        ifscCode: modalIfscCode.trim().toUpperCase(),
        accountHolderName: modalAccountHolderName.trim(),
        isPrimary: existingAccounts.length === 0,
      };
      updatedAccounts = [...existingAccounts, newAccount];
    }

    const activeAccount =
      updatedAccounts.find((a) => a.id === (editingBankAccountId || settings.selectedBankAccountId)) ||
      updatedAccounts[updatedAccounts.length - 1];

    setSettings((prev) => ({
      ...prev,
      bankAccounts: updatedAccounts,
      selectedBankAccountId: activeAccount ? activeAccount.id : prev.selectedBankAccountId,
      bankName: activeAccount ? activeAccount.bankName : prev.bankName,
      accountNo: activeAccount ? activeAccount.accountNo : prev.accountNo,
      ifscCode: activeAccount ? activeAccount.ifscCode : prev.ifscCode,
      accountHolderName: activeAccount ? (activeAccount.accountHolderName || prev.accountHolderName) : prev.accountHolderName,
    }));

    setHasChanges(true);
    setBankModalVisible(false);
  };

  const handleSelectBankAccount = (account: BankAccount) => {
    setSettings((prev) => ({
      ...prev,
      selectedBankAccountId: account.id,
      bankName: account.bankName,
      accountNo: account.accountNo,
      ifscCode: account.ifscCode,
      accountHolderName: account.accountHolderName || prev.accountHolderName,
      bankAccounts: (prev.bankAccounts || []).map((acc) => ({
        ...acc,
        isPrimary: acc.id === account.id,
      })),
    }));
    setHasChanges(true);
  };

  const handleDeleteBankAccount = (id: string) => {
    Alert.alert('Delete Bank Account', 'Are you sure you want to remove this bank account?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          const updated = (settings.bankAccounts || []).filter((acc) => acc.id !== id);
          const nextActive = updated[0];
          setSettings((prev) => ({
            ...prev,
            bankAccounts: updated,
            selectedBankAccountId: nextActive ? nextActive.id : '',
            bankName: nextActive ? nextActive.bankName : '',
            accountNo: nextActive ? nextActive.accountNo : '',
            ifscCode: nextActive ? nextActive.ifscCode : '',
            accountHolderName: nextActive ? (nextActive.accountHolderName || '') : '',
          }));
          setHasChanges(true);
        },
      },
    ]);
  };

  const handlePickFromGallery = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Required', 'Gallery permission is required to select a QR code image.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const pickedUri = result.assets[0].uri;
        const saved = await saveImageToLocalFolder(pickedUri, 'receipts', 'custom_qr_code');
        const finalUri = saved.success && saved.image ? saved.image.uri : pickedUri;
        updateSetting('customQrCodeUri', finalUri);
        updateSetting('useCustomQrCode', true);
      }
    } catch (err) {
      console.error('Pick QR image error:', err);
      Alert.alert('Error', 'Failed to select QR code image.');
    }
  };

  const handlePickFromCamera = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Required', 'Camera permission is required to capture QR code.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.9,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const pickedUri = result.assets[0].uri;
        const saved = await saveImageToLocalFolder(pickedUri, 'receipts', 'custom_qr_code');
        const finalUri = saved.success && saved.image ? saved.image.uri : pickedUri;
        updateSetting('customQrCodeUri', finalUri);
        updateSetting('useCustomQrCode', true);
      }
    } catch (err) {
      console.error('Camera QR image error:', err);
      Alert.alert('Error', 'Failed to capture QR code.');
    }
  };

  const handleOpenLocalImagesModal = async () => {
    try {
      const images = await listLocalImages('all');
      setLocalImagesList(images);
      setLocalImagesModalVisible(true);
    } catch (err) {
      console.error('Failed to list local images:', err);
      Alert.alert('Error', 'Could not access local image storage.');
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await shareSettingsService.getSettings();
      setSettings(data);
    } catch (e) {
      console.error('Failed to load share settings:', e);
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = <K extends keyof ShareSettings>(key: K, value: ShareSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await shareSettingsService.saveSettings(settings);
      setHasChanges(false);
      Alert.alert('Settings Saved', 'Share Transaction preferences updated successfully!');
    } catch (e) {
      Alert.alert('Error', 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    Alert.alert(
      'Reset All Share Settings?',
      'This will restore all transaction sharing options, formats, and templates to default.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset to Defaults',
          style: 'destructive',
          onPress: async () => {
            const restored = await shareSettingsService.resetSettings();
            setSettings(restored);
            setHasChanges(false);
            Alert.alert('Reset Complete', 'Share settings have been restored to defaults.');
          },
        },
      ]
    );
  };

  const insertTemplateTag = (tag: string) => {
    const current = settings.customMessageTemplate || '';
    updateSetting('customMessageTemplate', `${current} ${tag}`);
  };

  const insertCustomerTemplateTag = (tag: string) => {
    const current = settings.customerMessageTemplate || '';
    updateSetting('customerMessageTemplate', `${current} ${tag}`);
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg.primary }]}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
        <Text style={[styles.loadingText, { color: colors.text.muted }]}>Loading Share Settings...</Text>
      </View>
    );
  }

  const isDark = theme.isDark;
  const cardBg = colors.bg.card;
  const textColor = colors.text.primary;
  const subTextColor = colors.text.muted;
  const borderColor = colors.border.subtle;

  return (
    <ProtectedRoute>
      <View style={[styles.container, { backgroundColor: colors.bg.primary }]}>
        {/* Top App Bar */}
        <View style={[styles.appBar, { backgroundColor: cardBg, borderBottomColor: borderColor }]}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn}>
            <MaterialIcons name="arrow-back" size={24} color={textColor} />
          </Pressable>
          <View style={styles.appBarTitleBox}>
            <Text style={[styles.appBarTitle, { color: textColor }]}>Share Transaction</Text>
            <Text style={[styles.appBarSubTitle, { color: subTextColor }]}>Receipt & Invoice Management</Text>
          </View>
          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={[styles.saveBtn, { backgroundColor: hasChanges ? '#2563EB' : colors.border.medium }]}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.saveBtnText}>Save</Text>
            )}
          </Pressable>
        </View>

        {/* Action Bar / Test Share Button */}
        <View style={[styles.subHeaderRow, { backgroundColor: cardBg, borderBottomColor: borderColor }]}>
          <Pressable
            style={[styles.testShareBtn, { backgroundColor: '#10B981' }]}
            onPress={() => setTestShareVisible(true)}
          >
            <MaterialIcons name="share" size={18} color="#FFFFFF" />
            <Text style={styles.testShareBtnText}>Test Share Sheet</Text>
          </Pressable>

          <Pressable style={styles.resetHeaderBtn} onPress={handleReset}>
            <MaterialIcons name="restart-alt" size={18} color="#EF4444" />
            <Text style={styles.resetHeaderBtnText}>Reset Defaults</Text>
          </Pressable>
        </View>

        {/* Tab Selector */}
        <View style={[styles.tabBar, { backgroundColor: cardBg, borderBottomColor: borderColor }]}>
          {[
            { id: 'GENERAL', label: 'Format & Theme', icon: 'tune' },
            { id: 'LAYOUT', label: 'Receipt Layout', icon: 'view-quilt' },
            { id: 'WATERMARK', label: 'Watermark', icon: 'layers' },
            { id: 'TEMPLATE', label: 'Message Template', icon: 'chat' },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <Pressable
                key={tab.id}
                onPress={() => setActiveTab(tab.id as any)}
                style={[
                  styles.tabItem,
                  isActive && { borderBottomColor: colors.accent.primary, borderBottomWidth: 3 },
                ]}
              >
                <MaterialIcons
                  name={tab.icon as any}
                  size={18}
                  color={isActive ? colors.accent.primary : subTextColor}
                />
                <Text
                  style={[
                    styles.tabLabel,
                    { color: isActive ? colors.accent.primary : subTextColor, fontWeight: isActive ? '700' : '500' },
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Main Content Form */}
        <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* TAB 1: GENERAL FORMAT & THEME */}
          {activeTab === 'GENERAL' && (
            <View style={styles.sectionContainer}>
              <Text style={[styles.sectionHeading, { color: colors.accent.primary }]}>
                DEFAULT SHARING FORMAT
              </Text>
              <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
                <Text style={[styles.cardTitle, { color: textColor }]}>Default Share Format</Text>
                <Text style={[styles.cardDesc, { color: subTextColor }]}>
                  Choose the default option pre-selected when tapping Share Transaction.
                </Text>

                <View style={styles.formatRow}>
                  {(['IMAGE', 'PDF', 'TEXT'] as ShareFormat[]).map((fmt) => {
                    const isSelected = settings.defaultFormat === fmt;
                    return (
                      <Pressable
                        key={fmt}
                        onPress={() => updateSetting('defaultFormat', fmt)}
                        style={[
                          styles.formatChip,
                          {
                            backgroundColor: isSelected ? '#2563EB' : colors.bg.primary,
                            borderColor: isSelected ? '#2563EB' : borderColor,
                          },
                        ]}
                      >
                        <MaterialIcons
                          name={fmt === 'IMAGE' ? 'image' : fmt === 'PDF' ? 'picture-as-pdf' : 'description'}
                          size={20}
                          color={isSelected ? '#FFFFFF' : subTextColor}
                        />
                        <Text
                          style={[
                            styles.formatChipText,
                            { color: isSelected ? '#FFFFFF' : textColor, fontWeight: isSelected ? '700' : '500' },
                          ]}
                        >
                          {fmt}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <Text style={[styles.sectionHeading, { color: colors.accent.primary, marginTop: 20 }]}>
                THEME COLOR FOR INVOICES & RECEIPTS
              </Text>
              <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
                <Text style={[styles.cardTitle, { color: textColor }]}>Brand Accent Color</Text>
                <Text style={[styles.cardDesc, { color: subTextColor }]}>
                  Select primary theme accent color for headings, total bars, and badges.
                </Text>

                <View style={styles.colorGrid}>
                  {COLOR_PRESETS.map((item) => {
                    const isSelected = (settings.themeColor || '#2563EB') === item.color;
                    return (
                      <Pressable
                        key={item.color}
                        onPress={() => updateSetting('themeColor', item.color)}
                        style={[
                          styles.colorChip,
                          { backgroundColor: item.color },
                          isSelected && styles.colorChipSelected,
                        ]}
                      >
                        {isSelected && <MaterialIcons name="check" size={20} color="#FFFFFF" />}
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <Text style={[styles.sectionHeading, { color: colors.accent.primary, marginTop: 20 }]}>
                PDF PAPER SIZE & RESOLUTION
              </Text>
              <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
                <Text style={[styles.cardTitle, { color: textColor }]}>PDF Page Size</Text>
                <View style={styles.paperRow}>
                  {[
                    { id: 'A4', label: 'A4 Standard' },
                    { id: 'LETTER', label: 'US Letter' },
                    { id: 'THERMAL_80MM', label: 'Thermal 80mm' },
                  ].map((p) => {
                    const isSelected = (settings.paperSize || 'A4') === p.id;
                    return (
                      <Pressable
                        key={p.id}
                        onPress={() => updateSetting('paperSize', p.id as any)}
                        style={[
                          styles.paperChip,
                          {
                            backgroundColor: isSelected ? colors.accent.primary : colors.bg.primary,
                            borderColor: isSelected ? colors.accent.primary : borderColor,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.paperChipText,
                            { color: isSelected ? '#FFFFFF' : textColor, fontWeight: isSelected ? '700' : '500' },
                          ]}
                        >
                          {p.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={[styles.toggleRow, { borderTopWidth: 1, borderTopColor: borderColor, marginTop: 14, paddingTop: 12 }]}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={[styles.toggleTitle, { color: textColor }]}>High Quality Image Mode</Text>
                    <Text style={[styles.toggleSub, { color: subTextColor }]}>
                      Generates crisp 2x resolution receipt snapshots
                    </Text>
                  </View>
                  <Switch
                    value={settings.highQualityImage}
                    onValueChange={(val) => updateSetting('highQualityImage', val)}
                    trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                    thumbColor={settings.highQualityImage ? '#2563EB' : '#F1F5F9'}
                  />
                </View>
              </View>
            </View>
          )}

          {/* TAB 2: RECEIPT LAYOUT TOGGLES */}
          {activeTab === 'LAYOUT' && (
            <View style={styles.sectionContainer}>
              <Text style={[styles.sectionHeading, { color: colors.accent.primary }]}>
                HEADER & BRANDING CONTENT
              </Text>
              <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
                <View style={[styles.toggleRow, { borderBottomWidth: 1, borderBottomColor: borderColor }]}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={[styles.toggleTitle, { color: textColor }]}>Company Logo</Text>
                    <Text style={[styles.toggleSub, { color: subTextColor }]}>
                      Display company logo on receipt headers
                    </Text>
                  </View>
                  <Switch
                    value={settings.includeLogo}
                    onValueChange={(val) => updateSetting('includeLogo', val)}
                    trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                    thumbColor={settings.includeLogo ? '#2563EB' : '#F1F5F9'}
                  />
                </View>

                <View style={[styles.toggleRow, { borderBottomWidth: 1, borderBottomColor: borderColor }]}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={[styles.toggleTitle, { color: textColor }]}>Authorized Signature</Text>
                    <Text style={[styles.toggleSub, { color: subTextColor }]}>
                      Show signature line & uploaded image on invoices
                    </Text>
                  </View>
                  <Switch
                    value={settings.includeSignature}
                    onValueChange={(val) => updateSetting('includeSignature', val)}
                    trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                    thumbColor={settings.includeSignature ? '#2563EB' : '#F1F5F9'}
                  />
                </View>

                {settings.includeSignature && (
                  <View style={{ marginTop: 12 }}>
                    <Text style={[styles.inputLabel, { color: subTextColor }]}>Signature Designation Title</Text>
                    <TextInput
                      value={settings.signatureTitle || 'Authorized Signatory'}
                      onChangeText={(val) => updateSetting('signatureTitle', val)}
                      placeholder="e.g. Authorized Signatory, Manager"
                      placeholderTextColor={subTextColor}
                      style={[styles.input, { backgroundColor: colors.bg.primary, color: textColor, borderColor }]}
                    />
                  </View>
                )}
              </View>

              <Text style={[styles.sectionHeading, { color: colors.accent.primary, marginTop: 20 }]}>
                PAYMENT & BANK DETAILS DISPLAY
              </Text>
              <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
                <Text style={[styles.cardTitle, { color: textColor }]}>Payment Info Display Mode</Text>
                <Text style={[styles.cardDesc, { color: subTextColor, marginBottom: 12 }]}>
                  Choose whether to show Scannable QR Code, Bank Account details, or both on shared receipts and invoices.
                </Text>

                {/* Display Mode Chips */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  {[
                    { id: 'QR', label: 'QR Code Only', icon: 'qr-code-2' },
                    { id: 'BANK', label: 'Bank Details Only', icon: 'account-balance' },
                    { id: 'BOTH', label: 'Both (QR & Bank)', icon: 'payments' },
                    { id: 'NONE', label: 'None / Hide', icon: 'visibility-off' },
                  ].map((mode) => {
                    const currentMode = settings.paymentDisplayMode || (settings.includeQrCode ? (settings.includeBankDetails ? 'BOTH' : 'QR') : (settings.includeBankDetails ? 'BANK' : 'NONE'));
                    const isSelected = currentMode === mode.id;
                    return (
                      <Pressable
                        key={mode.id}
                        onPress={() => {
                          const newMode = mode.id as any;
                          const incQr = newMode === 'QR' || newMode === 'BOTH';
                          const incBank = newMode === 'BANK' || newMode === 'BOTH';
                          updateSetting('paymentDisplayMode', newMode);
                          updateSetting('includeQrCode', incQr);
                          updateSetting('includeBankDetails', incBank);
                        }}
                        style={[
                          styles.chip,
                          isSelected && { backgroundColor: colors.accent.primary, borderColor: colors.accent.primary },
                          { flex: 1, minWidth: '45%', justifyContent: 'center', paddingVertical: 8 }
                        ]}
                      >
                        <MaterialIcons name={mode.icon as any} size={16} color={isSelected ? '#FFF' : textColor} />
                        <Text style={[styles.chipText, isSelected && { color: '#FFF', fontWeight: '700' }]}>
                          {mode.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* QR CODE SECTION (Visible when Mode is QR or BOTH) */}
                {(settings.paymentDisplayMode === 'QR' || settings.paymentDisplayMode === 'BOTH' || settings.includeQrCode) && settings.paymentDisplayMode !== 'NONE' && (
                  <View style={{ marginBottom: 16, padding: 12, backgroundColor: colors.bg.primary, borderRadius: 12, borderWidth: 1, borderColor }}>
                    <Text style={[styles.inputLabel, { color: textColor, fontWeight: '700', fontSize: 12 }]}>SCANNABLE QR CODE SOURCE</Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, marginBottom: 12 }}>
                      <Pressable
                        onPress={() => updateSetting('useCustomQrCode', false)}
                        style={[
                          styles.chip,
                          !settings.useCustomQrCode && { backgroundColor: colors.accent.primary, borderColor: colors.accent.primary },
                          { flex: 1, justifyContent: 'center' }
                        ]}
                      >
                        <MaterialIcons name="qr-code-2" size={16} color={!settings.useCustomQrCode ? '#FFF' : textColor} />
                        <Text style={[styles.chipText, !settings.useCustomQrCode && { color: '#FFF', fontWeight: '700' }]}>
                          Dynamic UPI
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={() => updateSetting('useCustomQrCode', true)}
                        style={[
                          styles.chip,
                          settings.useCustomQrCode && { backgroundColor: colors.accent.primary, borderColor: colors.accent.primary },
                          { flex: 1, justifyContent: 'center' }
                        ]}
                      >
                        <MaterialIcons name="photo-library" size={16} color={settings.useCustomQrCode ? '#FFF' : textColor} />
                        <Text style={[styles.chipText, settings.useCustomQrCode && { color: '#FFF', fontWeight: '700' }]}>
                          Custom Image
                        </Text>
                      </Pressable>
                    </View>

                    {!settings.useCustomQrCode && (
                      <View style={{ marginTop: 4 }}>
                        <Text style={[styles.inputLabel, { color: subTextColor }]}>Business UPI ID for Payment QR</Text>
                        <TextInput
                          value={settings.upiId || ''}
                          onChangeText={(val) => updateSetting('upiId', val)}
                          placeholder="e.g. company@upi or 9876543210@paytm"
                          placeholderTextColor={subTextColor}
                          style={[styles.input, { backgroundColor: cardBg, color: textColor, borderColor }]}
                        />
                        {settings.upiId ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
                            <MaterialIcons name="check-circle" size={14} color="#10B981" />
                            <Text style={{ fontSize: 11, color: '#10B981', fontWeight: '600' }}>
                              Active UPI: {settings.upiId}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    )}

                    {settings.useCustomQrCode && (
                      <View style={{ marginTop: 4 }}>
                        <Text style={[styles.cardDesc, { color: subTextColor, marginBottom: 10, fontSize: 11 }]}>
                          Upload or select a custom QR Code image stored in local image storage to be displayed when sharing receipts.
                        </Text>

                        <View style={{ alignItems: 'center', marginBottom: 12 }}>
                          {settings.customQrCodeUri ? (
                            <View style={{ position: 'relative', width: 110, height: 110, borderRadius: 12, borderWidth: 2, borderColor: colors.accent.primary, overflow: 'hidden', backgroundColor: '#FFF', padding: 4 }}>
                              <Image source={{ uri: settings.customQrCodeUri }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
                            </View>
                          ) : (
                            <View style={{ width: 110, height: 110, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border.medium, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', backgroundColor: cardBg }}>
                              <MaterialIcons name="qr-code-scanner" size={36} color={subTextColor} />
                              <Text style={{ fontSize: 10, color: subTextColor, marginTop: 4 }}>No QR Selected</Text>
                            </View>
                          )}
                        </View>

                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                          <Pressable
                            onPress={handlePickFromGallery}
                            style={[styles.presetBtn, { backgroundColor: '#2563EB15', borderColor: '#2563EB' }]}
                          >
                            <MaterialIcons name="photo-library" size={14} color="#2563EB" />
                            <Text style={{ color: '#2563EB', fontSize: 12, fontWeight: '600' }}>Gallery</Text>
                          </Pressable>

                          <Pressable
                            onPress={handlePickFromCamera}
                            style={[styles.presetBtn, { backgroundColor: '#10B98115', borderColor: '#10B981' }]}
                          >
                            <MaterialIcons name="photo-camera" size={14} color="#10B981" />
                            <Text style={{ color: '#10B981', fontSize: 12, fontWeight: '600' }}>Camera</Text>
                          </Pressable>

                          <Pressable
                            onPress={handleOpenLocalImagesModal}
                            style={[styles.presetBtn, { backgroundColor: '#6C5CE715', borderColor: '#6C5CE7' }]}
                          >
                            <MaterialIcons name="folder-special" size={14} color="#6C5CE7" />
                            <Text style={{ color: '#6C5CE7', fontSize: 12, fontWeight: '600' }}>Local Storage</Text>
                          </Pressable>

                          {settings.customQrCodeUri ? (
                            <Pressable
                              onPress={() => updateSetting('customQrCodeUri', '')}
                              style={[styles.presetBtn, { backgroundColor: '#EF444415', borderColor: '#EF4444' }]}
                            >
                              <MaterialIcons name="delete" size={14} color="#EF4444" />
                              <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '600' }}>Remove</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      </View>
                    )}
                  </View>
                )}

                {/* BANK ACCOUNT DETAILS SECTION (Visible when Mode is BANK or BOTH) */}
                {(settings.paymentDisplayMode === 'BANK' || settings.paymentDisplayMode === 'BOTH' || settings.includeBankDetails) && settings.paymentDisplayMode !== 'NONE' && (
                  <View style={{ padding: 12, backgroundColor: colors.bg.primary, borderRadius: 12, borderWidth: 1, borderColor, gap: 12 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <MaterialIcons name="account-balance" size={18} color={colors.accent.primary} />
                        <Text style={[styles.inputLabel, { color: textColor, fontWeight: '700', fontSize: 12, marginBottom: 0 }]}>
                          BANK ACCOUNT DETAILS
                        </Text>
                      </View>
                      <Pressable
                        onPress={handleOpenAddBankModal}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          backgroundColor: colors.accent.primary + '18',
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: colors.accent.primary,
                        }}
                      >
                        <MaterialIcons name="add" size={16} color={colors.accent.primary} />
                        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.accent.primary }}>Add Bank Account</Text>
                      </Pressable>
                    </View>

                    {/* Saved Bank Accounts List */}
                    {Array.isArray(settings.bankAccounts) && settings.bankAccounts.length > 0 && (
                      <View style={{ gap: 8 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: subTextColor, textTransform: 'uppercase' }}>
                          Saved Accounts (Tap to select for receipt)
                        </Text>
                        {settings.bankAccounts.map((acc) => {
                          const isSelected = settings.selectedBankAccountId === acc.id || (settings.bankName === acc.bankName && settings.accountNo === acc.accountNo);
                          return (
                            <Pressable
                              key={acc.id}
                              onPress={() => handleSelectBankAccount(acc)}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: 10,
                                borderRadius: 10,
                                borderWidth: 1.5,
                                borderColor: isSelected ? colors.accent.primary : borderColor,
                                backgroundColor: isSelected ? colors.accent.primary + '0D' : cardBg,
                              }}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                                <MaterialIcons
                                  name={isSelected ? 'radio-button-checked' : 'radio-button-unchecked'}
                                  size={20}
                                  color={isSelected ? colors.accent.primary : subTextColor}
                                />
                                <View style={{ flex: 1 }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Text style={{ fontSize: 13, fontWeight: '700', color: textColor }}>{acc.bankName || 'Bank Account'}</Text>
                                    {isSelected && (
                                      <View style={{ backgroundColor: colors.accent.primary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                        <Text style={{ fontSize: 9, fontWeight: '800', color: '#FFF' }}>ACTIVE</Text>
                                      </View>
                                    )}
                                  </View>
                                  <Text style={{ fontSize: 11, color: subTextColor, marginTop: 2 }}>
                                    A/C: {acc.accountNo || 'N/A'} {acc.ifscCode ? `| IFSC: ${acc.ifscCode}` : ''}
                                  </Text>
                                  {acc.accountHolderName ? (
                                    <Text style={{ fontSize: 10, color: subTextColor }}>Holder: {acc.accountHolderName}</Text>
                                  ) : null}
                                </View>
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Pressable onPress={() => handleOpenEditBankModal(acc)} hitSlop={8} style={{ padding: 4 }}>
                                  <MaterialIcons name="edit" size={18} color={colors.accent.primary} />
                                </Pressable>
                                <Pressable onPress={() => handleDeleteBankAccount(acc.id)} hitSlop={8} style={{ padding: 4 }}>
                                  <MaterialIcons name="delete-outline" size={18} color="#EF4444" />
                                </Pressable>
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>
                    )}

                    <View style={{ borderTopWidth: Array.isArray(settings.bankAccounts) && settings.bankAccounts.length > 0 ? 1 : 0, borderTopColor: borderColor, paddingTop: Array.isArray(settings.bankAccounts) && settings.bankAccounts.length > 0 ? 8 : 0, gap: 10 }}>
                      <Text style={[styles.inputLabel, { color: subTextColor, fontSize: 10, marginBottom: 0 }]}>ACTIVE RECEIPT BANK DETAILS</Text>
                      <View>
                        <Text style={[styles.inputLabel, { color: subTextColor }]}>Bank Name</Text>
                        <TextInput
                          value={settings.bankName || ''}
                          onChangeText={(val) => updateSetting('bankName', val)}
                          placeholder="e.g. State Bank of India / HDFC Bank"
                          placeholderTextColor={subTextColor}
                          style={[styles.input, { backgroundColor: cardBg, color: textColor, borderColor }]}
                        />
                      </View>

                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.inputLabel, { color: subTextColor }]}>Account Number</Text>
                          <TextInput
                            value={settings.accountNo || ''}
                            onChangeText={(val) => updateSetting('accountNo', val)}
                            placeholder="e.g. 123456789012"
                            placeholderTextColor={subTextColor}
                            keyboardType="numeric"
                            style={[styles.input, { backgroundColor: cardBg, color: textColor, borderColor }]}
                          />
                        </View>

                        <View style={{ flex: 1 }}>
                          <Text style={[styles.inputLabel, { color: subTextColor }]}>IFSC Code</Text>
                          <TextInput
                            value={settings.ifscCode || ''}
                            onChangeText={(val) => updateSetting('ifscCode', val.toUpperCase())}
                            placeholder="e.g. SBIN0001234"
                            placeholderTextColor={subTextColor}
                            autoCapitalize="characters"
                            style={[styles.input, { backgroundColor: cardBg, color: textColor, borderColor }]}
                          />
                        </View>
                      </View>

                      <View>
                        <Text style={[styles.inputLabel, { color: subTextColor }]}>Account Holder Name</Text>
                        <TextInput
                          value={settings.accountHolderName || ''}
                          onChangeText={(val) => updateSetting('accountHolderName', val)}
                          placeholder="e.g. My Business Name / John Doe"
                          placeholderTextColor={subTextColor}
                          style={[styles.input, { backgroundColor: cardBg, color: textColor, borderColor }]}
                        />
                      </View>
                    </View>
                  </View>
                )}

                <View style={[styles.toggleRow, { borderBottomWidth: 1, borderBottomColor: borderColor, marginTop: 12 }]}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={[styles.toggleTitle, { color: textColor }]}>GST Details</Text>
                    <Text style={[styles.toggleSub, { color: subTextColor }]}>
                      Include GSTIN numbers for tax invoice compliance
                    </Text>
                  </View>
                  <Switch
                    value={settings.includeGst}
                    onValueChange={(val) => updateSetting('includeGst', val)}
                    trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                    thumbColor={settings.includeGst ? '#2563EB' : '#F1F5F9'}
                  />
                </View>

                {settings.includeGst && (
                  <View style={{ marginTop: 12 }}>
                    <Text style={[styles.inputLabel, { color: subTextColor }]}>Company GSTIN Number</Text>
                    <TextInput
                      value={settings.gstNo || ''}
                      onChangeText={(val) => updateSetting('gstNo', val)}
                      placeholder="e.g. 33AAAAA0000A1Z5"
                      placeholderTextColor={subTextColor}
                      style={[styles.input, { backgroundColor: colors.bg.primary, color: textColor, borderColor }]}
                    />
                  </View>
                )}
              </View>

              <Text style={[styles.sectionHeading, { color: colors.accent.primary, marginTop: 20 }]}>
                CUSTOMER INFORMATION
              </Text>
              <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
                <View style={[styles.toggleRow, { borderBottomWidth: 1, borderBottomColor: borderColor }]}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={[styles.toggleTitle, { color: textColor }]}>Customer Address</Text>
                    <Text style={[styles.toggleSub, { color: subTextColor }]}>
                      Display billing address on receipt
                    </Text>
                  </View>
                  <Switch
                    value={settings.includeCustomerAddress}
                    onValueChange={(val) => updateSetting('includeCustomerAddress', val)}
                    trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                    thumbColor={settings.includeCustomerAddress ? '#2563EB' : '#F1F5F9'}
                  />
                </View>

                <View style={styles.toggleRow}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={[styles.toggleTitle, { color: textColor }]}>Customer Phone Number</Text>
                    <Text style={[styles.toggleSub, { color: subTextColor }]}>
                      Include customer contact number on receipt
                    </Text>
                  </View>
                  <Switch
                    value={settings.includeCustomerPhone ?? true}
                    onValueChange={(val) => updateSetting('includeCustomerPhone', val)}
                    trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                    thumbColor={(settings.includeCustomerPhone ?? true) ? '#2563EB' : '#F1F5F9'}
                  />
                </View>
              </View>

              <Text style={[styles.sectionHeading, { color: colors.accent.primary, marginTop: 20 }]}>
                FOOTER NOTES & TERMS
              </Text>
              <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
                <Text style={[styles.inputLabel, { color: subTextColor }]}>Footer Thank You Message</Text>
                <TextInput
                  value={settings.thankYouNote || ''}
                  onChangeText={(val) => updateSetting('thankYouNote', val)}
                  placeholder="e.g. Thank you for doing business with us! 🙏"
                  placeholderTextColor={subTextColor}
                  style={[styles.input, { backgroundColor: colors.bg.primary, color: textColor, borderColor, marginBottom: 14 }]}
                />

                <Text style={[styles.inputLabel, { color: subTextColor }]}>Invoice Terms & Conditions (PDF)</Text>
                <TextInput
                  value={settings.termsAndConditions || ''}
                  onChangeText={(val) => updateSetting('termsAndConditions', val)}
                  placeholder="e.g. 1. Goods once sold will not be taken back..."
                  placeholderTextColor={subTextColor}
                  multiline
                  numberOfLines={3}
                  style={[
                    styles.input,
                    { backgroundColor: colors.bg.primary, color: textColor, borderColor, height: 70, textAlignVertical: 'top' },
                  ]}
                />
              </View>
            </View>
          )}

          {/* TAB 3: WATERMARK CONFIGURATION */}
          {activeTab === 'WATERMARK' && (
            <View style={styles.sectionContainer}>
              <Text style={[styles.sectionHeading, { color: colors.accent.primary }]}>
                WATERMARK SETTINGS
              </Text>

              <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
                <View style={styles.toggleRow}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={[styles.toggleTitle, { color: textColor }]}>Enable Document Watermark</Text>
                    <Text style={[styles.toggleSub, { color: subTextColor }]}>
                      Overlay diagonal text across receipt image & PDF invoices
                    </Text>
                  </View>
                  <Switch
                    value={settings.watermarkEnabled}
                    onValueChange={(val) => updateSetting('watermarkEnabled', val)}
                    trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                    thumbColor={settings.watermarkEnabled ? '#2563EB' : '#F1F5F9'}
                  />
                </View>

                {settings.watermarkEnabled && (
                  <View style={{ marginTop: 16 }}>
                    <Text style={[styles.inputLabel, { color: subTextColor }]}>WATERMARK PRESET TEXTS</Text>
                    <View style={styles.presetWrap}>
                      {WATERMARK_PRESETS.map((txt) => {
                        const isSel = settings.watermarkText === txt;
                        return (
                          <Pressable
                            key={txt}
                            onPress={() => updateSetting('watermarkText', txt)}
                            style={[
                              styles.presetChip,
                              {
                                backgroundColor: isSel ? '#2563EB' : colors.bg.primary,
                                borderColor: isSel ? '#2563EB' : borderColor,
                              },
                            ]}
                          >
                            <Text style={[styles.presetChipText, { color: isSel ? '#FFFFFF' : textColor }]}>
                              {txt}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    <Text style={[styles.inputLabel, { color: subTextColor, marginTop: 14 }]}>
                      Custom Watermark Text
                    </Text>
                    <TextInput
                      value={settings.watermarkText}
                      onChangeText={(val) => updateSetting('watermarkText', val)}
                      placeholder="e.g. PAID, OFFICIAL RECEIPT"
                      placeholderTextColor={subTextColor}
                      style={[styles.input, { backgroundColor: colors.bg.primary, color: textColor, borderColor }]}
                    />
                  </View>
                )}
              </View>
            </View>
          )}

          {/* TAB 4: WHATSAPP / SMS MESSAGE TEMPLATE */}
          {activeTab === 'TEMPLATE' && (
            <View style={styles.sectionContainer}>
              <Text style={[styles.sectionHeading, { color: colors.accent.primary }]}>
                WHATSAPP & SMS MESSAGE TEMPLATE
              </Text>

              <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
                <Text style={[styles.cardTitle, { color: textColor }]}>Custom Message Body</Text>
                <Text style={[styles.cardDesc, { color: subTextColor }]}>
                  Customize the default text pre-filled when sharing via WhatsApp, SMS, or Text mode.
                </Text>

                <Text style={[styles.inputLabel, { color: subTextColor, marginTop: 10 }]}>QUICK TEMPLATE PRESETS:</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6, marginBottom: 12 }}>
                  <Pressable
                    onPress={() => updateSetting('customMessageTemplate', '🧾 *RECEIPT / INVOICE*\n*{company}*\n------------------------------\n*Invoice No:* #{invoice}\n*Date:* {date}\n*Customer:* {customer}\n------------------------------\n{calculations}\n------------------------------\nThank you for doing business with us! 🙏')}
                    style={[styles.presetBtn, { backgroundColor: '#10B98115', borderColor: '#10B981' }]}
                  >
                    <MaterialIcons name="auto-fix-high" size={14} color="#10B981" />
                    <Text style={{ color: '#10B981', fontSize: 12, fontWeight: '600' }}>Full Calculations</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => updateSetting('customMessageTemplate', '🧾 *TAX INVOICE / RECEIPT*\n*{company}*\n------------------------------\n*Invoice No:* #{invoice} | *Date:* {date}\n*Customer:* {customer}\n------------------------------\n{items}\n------------------------------\n*Items Subtotal:* {subtotal}\n*Shipment Charge:* {shipmentCharge}\n*Loading Charge:* {loadingCharge}\n*Unloading Charge:* {unloadingCharge}\n*Extra Charge:* {extraAmount}\n------------------------------\n*Current Invoice Total:* {total}\n*Old Balance Due:* {oldBalance}\n*Grand Total:* {grandTotal}\n*Paid:* {paid}\n*Balance Due:* {due}\n------------------------------\nThank you for doing business with us! 🙏')}
                    style={[styles.presetBtn, { backgroundColor: '#2563EB15', borderColor: '#2563EB' }]}
                  >
                    <MaterialIcons name="format-list-bulleted" size={14} color="#2563EB" />
                    <Text style={{ color: '#2563EB', fontSize: 12, fontWeight: '600' }}>Itemized Breakdown</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => updateSetting('customMessageTemplate', '🧾 *RECEIPT / INVOICE*\n*{company}*\n------------------------------\n*Invoice No:* #{invoice}\n*Date:* {date}\n*Customer:* {customer}\n------------------------------\n*Total:* {total}\n*Paid:* {paid}\n*Balance Due:* {due}\n------------------------------\nThank you for doing business with us! 🙏')}
                    style={[styles.presetBtn, { backgroundColor: '#6B728015', borderColor: '#6B7280' }]}
                  >
                    <MaterialIcons name="short-text" size={14} color="#6B7280" />
                    <Text style={{ color: '#6B7280', fontSize: 12, fontWeight: '600' }}>Simple Summary</Text>
                  </Pressable>
                </View>

                <Text style={[styles.inputLabel, { color: subTextColor }]}>INSERT DYNAMIC TAGS:</Text>
                <View style={styles.tagWrap}>
                  {TEMPLATE_TAGS.map((t) => (
                    <Pressable
                      key={t.tag}
                      onPress={() => insertTemplateTag(t.tag)}
                      style={[styles.tagChip, { backgroundColor: colors.bg.primary, borderColor }]}
                    >
                      <Text style={[styles.tagChipText, { color: colors.accent.primary }]}>+ {t.tag}</Text>
                    </Pressable>
                  ))}
                </View>

                <TextInput
                  value={settings.customMessageTemplate || ''}
                  onChangeText={(val) => updateSetting('customMessageTemplate', val)}
                  placeholder="Enter message template..."
                  placeholderTextColor={subTextColor}
                  multiline
                  numberOfLines={8}
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.bg.primary,
                      color: textColor,
                      borderColor,
                      height: 160,
                      textAlignVertical: 'top',
                      fontFamily: 'monospace',
                      fontSize: 12,
                      marginTop: 12,
                    },
                  ]}
                />
              </View>

              {/* CUSTOMER ACCOUNT STATEMENT MESSAGE TEMPLATE */}
              <View style={[styles.card, { backgroundColor: cardBg, borderColor, marginTop: 20 }]}>
                <Text style={[styles.cardTitle, { color: textColor }]}>Customer Statement Message Template</Text>
                <Text style={[styles.cardDesc, { color: subTextColor }]}>
                  Customize the default text pre-filled when sharing complete Customer Account Statements from Customer Profile.
                </Text>

                <Text style={[styles.inputLabel, { color: subTextColor, marginTop: 10 }]}>QUICK STATEMENT PRESETS:</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6, marginBottom: 12 }}>
                  <Pressable
                    onPress={() => updateSetting('customerMessageTemplate', '👤 *CUSTOMER ACCOUNT STATEMENT*\n*{company}*\n------------------------------\n*Customer Name:* {customer_name}\n*Phone:* {customer_phone}\n------------------------------\n📊 *ACCOUNT SUMMARY*\n• *Total Orders:* {total_orders}\n• *Total Sales:* {total_sales}\n• *Total Paid:* {total_paid}\n• *Old Dues:* {old_balance}\n• *NET BALANCE DUE:* {net_balance_due}\n------------------------------\n{ledger_summary}\n------------------------------\n💳 *PAYMENT VIA UPI:*\n{upi_link}\n\nThank you for your valued partnership! 🙏')}
                    style={[styles.presetBtn, { backgroundColor: '#10B98115', borderColor: '#10B981' }]}
                  >
                    <MaterialIcons name="account-balance-wallet" size={14} color="#10B981" />
                    <Text style={{ color: '#10B981', fontSize: 12, fontWeight: '600' }}>Full Account Statement</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => updateSetting('customerMessageTemplate', '👤 *CUSTOMER BALANCE STATEMENT*\n*{company}*\n------------------------------\n*Customer:* {customer_name}\n*Phone:* {customer_phone}\n*Net Balance Due:* {net_balance_due}\n------------------------------\n💳 *PAYMENT VIA UPI:*\n{upi_link}\n\nThank you! 🙏')}
                    style={[styles.presetBtn, { backgroundColor: '#2563EB15', borderColor: '#2563EB' }]}
                  >
                    <MaterialIcons name="monetization-on" size={14} color="#2563EB" />
                    <Text style={{ color: '#2563EB', fontSize: 12, fontWeight: '600' }}>Simple Balance Due</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => updateSetting('customerMessageTemplate', '👤 *CUSTOMER LEDGER SUMMARY*\n*{company}*\n------------------------------\n*Customer:* {customer_name}\n*Total Orders:* {total_orders}\n*Total Sales:* {total_sales}\n*Total Paid:* {total_paid}\n*Net Balance Due:* {net_balance_due}\n------------------------------\n*Recent Ledger:*\n{ledger_summary}\n------------------------------\nThank you! 🙏')}
                    style={[styles.presetBtn, { backgroundColor: '#6C5CE715', borderColor: '#6C5CE7' }]}
                  >
                    <MaterialIcons name="receipt-long" size={14} color="#6C5CE7" />
                    <Text style={{ color: '#6C5CE7', fontSize: 12, fontWeight: '600' }}>Ledger Summary</Text>
                  </Pressable>
                </View>

                <Text style={[styles.inputLabel, { color: subTextColor }]}>INSERT DYNAMIC CUSTOMER TAGS:</Text>
                <View style={styles.tagWrap}>
                  {CUSTOMER_TEMPLATE_TAGS.map((t) => (
                    <Pressable
                      key={t.tag}
                      onPress={() => insertCustomerTemplateTag(t.tag)}
                      style={[styles.tagChip, { backgroundColor: colors.bg.primary, borderColor }]}
                    >
                      <Text style={[styles.tagChipText, { color: colors.accent.primary }]}>+ {t.tag}</Text>
                    </Pressable>
                  ))}
                </View>

                <TextInput
                  value={settings.customerMessageTemplate || ''}
                  onChangeText={(val) => updateSetting('customerMessageTemplate', val)}
                  placeholder="Enter customer message template..."
                  placeholderTextColor={subTextColor}
                  multiline
                  numberOfLines={8}
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.bg.primary,
                      color: textColor,
                      borderColor,
                      height: 160,
                      textAlignVertical: 'top',
                      fontFamily: 'monospace',
                      fontSize: 12,
                      marginTop: 12,
                    },
                  ]}
                />
              </View>
            </View>
          )}

          <View style={{ height: 60 }} />
        </ScrollView>

        {/* Test Share Bottom Sheet Modal */}
        <TransactionShareBottomSheet
          visible={testShareVisible}
          transaction={SAMPLE_TRANSACTION}
          isDark={isDark}
          onClose={() => setTestShareVisible(false)}
        />
        {/* Local Image Storage Modal for QR Selection */}
        <Modal visible={localImagesModalVisible} animationType="slide" transparent onRequestClose={() => setLocalImagesModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContainer, { backgroundColor: cardBg, borderColor, maxWidth: 500, width: '90%' }]}>
              <View style={[styles.modalHeader, { borderBottomColor: borderColor }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <MaterialIcons name="folder-special" size={22} color={colors.accent.primary} />
                  <Text style={[styles.modalTitle, { color: textColor }]}>Local Image Storage</Text>
                </View>
                <Pressable onPress={() => setLocalImagesModalVisible(false)} hitSlop={8}>
                  <MaterialIcons name="close" size={22} color={subTextColor} />
                </Pressable>
              </View>

              <ScrollView style={{ maxHeight: 350, paddingVertical: 8 }} contentContainerStyle={{ paddingHorizontal: 4 }}>
                {localImagesList.length === 0 ? (
                  <View style={{ padding: 24, alignItems: 'center' }}>
                    <MaterialIcons name="image-not-supported" size={40} color={subTextColor} />
                    <Text style={{ color: subTextColor, marginTop: 8, fontSize: 13, textAlign: 'center' }}>
                      No saved images found in Local Image Storage.
                    </Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-start' }}>
                    {localImagesList.map((img) => (
                      <Pressable
                        key={img.uri}
                        onPress={() => {
                          updateSetting('customQrCodeUri', img.uri);
                          updateSetting('useCustomQrCode', true);
                          setLocalImagesModalVisible(false);
                        }}
                        style={{
                          width: 90,
                          height: 90,
                          borderRadius: 10,
                          borderWidth: settings.customQrCodeUri === img.uri ? 2.5 : 1,
                          borderColor: settings.customQrCodeUri === img.uri ? colors.accent.primary : colors.border.medium,
                          overflow: 'hidden',
                          backgroundColor: '#FFF',
                        }}
                      >
                        <Image source={{ uri: img.uri }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
                      </Pressable>
                    ))}
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Bank Account Modal */}
        <Modal
          visible={bankModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setBankModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContainer, { backgroundColor: cardBg, borderColor, width: '90%', maxWidth: 420 }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: textColor }]}>
                  {editingBankAccountId ? 'Edit Bank Account' : 'Add Bank Account'}
                </Text>
                <Pressable onPress={() => setBankModalVisible(false)}>
                  <MaterialIcons name="close" size={22} color={textColor} />
                </Pressable>
              </View>

              <View style={{ gap: 12, marginVertical: 12 }}>
                <View>
                  <Text style={[styles.inputLabel, { color: subTextColor }]}>Bank Name *</Text>
                  <TextInput
                    value={modalBankName}
                    onChangeText={setModalBankName}
                    placeholder="e.g. State Bank of India / HDFC"
                    placeholderTextColor={subTextColor}
                    style={[styles.input, { backgroundColor: colors.bg.primary, color: textColor, borderColor }]}
                  />
                </View>

                <View>
                  <Text style={[styles.inputLabel, { color: subTextColor }]}>Account Number *</Text>
                  <TextInput
                    value={modalAccountNo}
                    onChangeText={setModalAccountNo}
                    placeholder="e.g. 123456789012"
                    placeholderTextColor={subTextColor}
                    keyboardType="numeric"
                    style={[styles.input, { backgroundColor: colors.bg.primary, color: textColor, borderColor }]}
                  />
                </View>

                <View>
                  <Text style={[styles.inputLabel, { color: subTextColor }]}>IFSC Code</Text>
                  <TextInput
                    value={modalIfscCode}
                    onChangeText={(val) => setModalIfscCode(val.toUpperCase())}
                    placeholder="e.g. SBIN0001234"
                    placeholderTextColor={subTextColor}
                    autoCapitalize="characters"
                    style={[styles.input, { backgroundColor: colors.bg.primary, color: textColor, borderColor }]}
                  />
                </View>

                <View>
                  <Text style={[styles.inputLabel, { color: subTextColor }]}>Account Holder Name</Text>
                  <TextInput
                    value={modalAccountHolderName}
                    onChangeText={setModalAccountHolderName}
                    placeholder="e.g. Business Name / John Doe"
                    placeholderTextColor={subTextColor}
                    style={[styles.input, { backgroundColor: colors.bg.primary, color: textColor, borderColor }]}
                  />
                </View>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <Pressable
                  onPress={() => setBankModalVisible(false)}
                  style={[styles.presetBtn, { backgroundColor: colors.bg.primary, borderColor }]}
                >
                  <Text style={{ color: textColor, fontWeight: '600', fontSize: 13 }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleSaveBankAccount}
                  style={[styles.saveBtn, { backgroundColor: colors.accent.primary }]}
                >
                  <Text style={styles.saveBtnText}>{editingBankAccountId ? 'Save Changes' : 'Add Account'}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </ProtectedRoute>
  );
}

export default ShareTransactionSettingsScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  iconBtn: {
    padding: 6,
  },
  appBarTitleBox: {
    flex: 1,
    marginLeft: 12,
  },
  appBarTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  appBarSubTitle: {
    fontSize: 11,
    marginTop: 1,
  },
  saveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  subHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  testShareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  testShareBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  resetHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 6,
  },
  resetHeaderBtnText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '600',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 4,
  },
  tabLabel: {
    fontSize: 10,
  },
  scrollContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sectionContainer: {
    marginBottom: 20,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  cardDesc: {
    fontSize: 12,
    marginTop: 2,
    marginBottom: 12,
  },
  formatRow: {
    flexDirection: 'row',
    gap: 10,
  },
  formatChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  formatChipText: {
    fontSize: 13,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 6,
  },
  colorChip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorChipSelected: {
    borderWidth: 3,
    borderColor: '#FFFFFF',
    elevation: 4,
  },
  paperRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  paperChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  paperChipText: {
    fontSize: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  toggleSub: {
    fontSize: 11,
    marginTop: 2,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
  },
  input: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 13,
  },
  presetWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  tagChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  tagChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipText: {
    fontSize: 12,
  },
  presetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContainer: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
});
