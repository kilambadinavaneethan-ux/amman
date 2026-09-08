import React, { useEffect, useState, useMemo, useCallback } from 'react';
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
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { listLocalImages, saveImageToLocalFolder, LocalImageFile } from '../../src/services/localImageStorageService';
import { useTheme } from '../context/ThemeContext';
import ProtectedRoute from '../components/ProtectedRoute';
import {
  DEFAULT_INVOICE_TEMPLATE,
  InvoiceTemplate,
  INVOICE_PRESETS,
  HeaderLayout,
  TableStyle,
  InvoiceFontFamily,
  BorderStyle,
  DEFAULT_SHARE_SETTINGS,
  ShareSettings,
  TransactionData,
  BankAccount,
} from '../../src/types/sharing';
import { invoiceTemplateService } from '../../src/services/sharing/invoiceTemplateService';
import { shareSettingsService } from '../../src/services/sharing/shareSettingsService';
import { generateInvoiceHtml } from '../../src/services/sharing/pdfGenerator';
import { WebView } from 'react-native-webview';

// ═══════════════════════════════════════════════════════════
// COLOR PRESETS
// ═══════════════════════════════════════════════════════════
const ACCENT_COLORS = [
  { label: 'Royal Blue', color: '#2563EB' },
  { label: 'Emerald', color: '#10B981' },
  { label: 'Indigo', color: '#6C5CE7' },
  { label: 'Rose', color: '#EC4899' },
  { label: 'Amber', color: '#F59E0B' },
  { label: 'Slate', color: '#0F172A' },
  { label: 'Teal', color: '#14B8A6' },
  { label: 'Red', color: '#EF4444' },
];

const TABLE_HEADER_COLORS = [
  '#0F172A', '#1E293B', '#334155', '#7C3AED', '#2563EB', '#0D9488', '#F8FAFC',
];

const HEADING_COLORS = [
  '#0F172A', '#1E293B', '#334155', '#4C1D95', '#1E3A8A', '#064E3B',
];

// ═══════════════════════════════════════════════════════════
// SAMPLE DATA FOR PREVIEW
// ═══════════════════════════════════════════════════════════
const SAMPLE_TRANSACTION: TransactionData = {
  id: 'preview-001',
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
    name: 'My Business Corp',
    phone: '+91 91234 56789',
    email: 'contact@mybusiness.com',
    address: '456 Commerce Ave, Industrial Area',
    gstNo: '33BBBBA1111B2Z6',
    upiId: 'mybusiness@upi',
  },
  items: [
    { name: 'Red Bricks (Standard Grade)', quantity: 500, unitPrice: 12, totalPrice: 6000, unit: 'pcs' },
    { name: 'Cement Bags (50kg)', quantity: 10, unitPrice: 380, totalPrice: 3800, unit: 'bags' },
  ],
  subtotal: 9800,
  shipmentCharge: 500,
  loadingCharge: 200,
  extraAmount: 150,
  extraAmountDescription: 'Packaging & Handling',
  taxAmount: 490,
  discountAmount: 200,
  totalAmount: 10940,
  paidAmount: 8000,
  pendingAmount: 2940,
  previousBalance: 1500,
  paymentStatus: 'PARTIAL',
  paymentMethod: 'Bank Transfer',
  notes: 'Deliver to warehouse B by Friday.',
};

type TabId = 'HEADER' | 'CONTENT' | 'TABLE' | 'STYLE' | 'PREVIEW';

function InvoiceManagementScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { colors } = theme;

  const [template, setTemplate] = useState<InvoiceTemplate>(DEFAULT_INVOICE_TEMPLATE);
  const [shareSettings, setShareSettings] = useState<ShareSettings>(DEFAULT_SHARE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('HEADER');
  const [previewHtml, setPreviewHtml] = useState('');
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
    setModalAccountHolderName(template.accountHolderName || '');
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

    const existingAccounts = template.bankAccounts || [];
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
      updatedAccounts.find((a) => a.id === (editingBankAccountId || template.selectedBankAccountId)) ||
      updatedAccounts[updatedAccounts.length - 1];

    setTemplate((prev) => ({
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
    setTemplate((prev) => ({
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
          const updated = (template.bankAccounts || []).filter((acc) => acc.id !== id);
          const nextActive = updated[0];
          setTemplate((prev) => ({
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
        updateField('customQrCodeUri', finalUri);
        updateField('useCustomQrCode', true);
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
        updateField('customQrCodeUri', finalUri);
        updateField('useCustomQrCode', true);
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

  const isDark = theme.isDark;
  const cardBg = colors.bg.card;
  const textColor = colors.text.primary;
  const subTextColor = colors.text.muted;
  const borderColor = colors.border.subtle;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tpl, ss] = await Promise.all([
        invoiceTemplateService.getTemplate(),
        shareSettingsService.getSettings(),
      ]);
      setTemplate(tpl);
      setShareSettings(ss);
    } catch (e) {
      console.error('Failed to load invoice template:', e);
    } finally {
      setLoading(false);
    }
  };

  const updateField = useCallback(<K extends keyof InvoiceTemplate>(key: K, value: InvoiceTemplate[K]) => {
    setTemplate((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  }, []);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const [updatedTpl] = await Promise.all([
        invoiceTemplateService.saveTemplate(template),
        shareSettingsService.saveSettingsSilent({ upiId: shareSettings.upiId }),
      ]);
      if (updatedTpl) {
        setTemplate(updatedTpl);
      }
      setHasChanges(false);
      Alert.alert('Saved ✓', 'Invoice template updated successfully!');
    } catch (e: any) {
      console.error('Error saving invoice template:', e);
      Alert.alert('Error', e?.message || 'Failed to save invoice template.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    Alert.alert(
      'Reset Invoice Template?',
      'This will restore all invoice customizations to factory defaults.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            const restored = await invoiceTemplateService.resetTemplate();
            setTemplate(restored);
            setHasChanges(false);
            Alert.alert('Reset Complete', 'Invoice template restored to defaults.');
          },
        },
      ]
    );
  };

  const applyPreset = (presetId: string) => {
    const preset = INVOICE_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setTemplate({ ...preset.template });
      setHasChanges(true);
    }
  };

  // Generate preview HTML when switching to preview tab
  useEffect(() => {
    if (activeTab === 'PREVIEW') {
      const html = generateInvoiceHtml(SAMPLE_TRANSACTION, shareSettings, template);
      setPreviewHtml(html);
    }
  }, [activeTab, template, shareSettings]);

  const styles = useMemo(() => getStyles(theme), [theme]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg.primary }]}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
        <Text style={[styles.loadingText, { color: subTextColor }]}>Loading Invoice Settings...</Text>
      </View>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // REUSABLE SUB-COMPONENTS
  // ═══════════════════════════════════════════════════════════

  const ToggleRow = ({ title, subtitle, value, onToggle, isLast = false }: { title: string; subtitle: string; value: boolean; onToggle: (v: boolean) => void; isLast?: boolean }) => (
    <View style={[styles.toggleRow, !isLast && { borderBottomWidth: 1, borderBottomColor: borderColor }]}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={[styles.toggleTitle, { color: textColor }]}>{title}</Text>
        <Text style={[styles.toggleSub, { color: subTextColor }]}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
        thumbColor={value ? '#2563EB' : '#F1F5F9'}
      />
    </View>
  );

  const SectionHeading = ({ text, marginTop = 0 }: { text: string; marginTop?: number }) => (
    <Text style={[styles.sectionHeading, { color: colors.accent.primary, marginTop }]}>{text}</Text>
  );

  const Card = ({ children }: { children: React.ReactNode }) => (
    <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>{children}</View>
  );

  const ChipSelector = <T extends string>({ options, selected, onSelect, renderLabel }: { options: T[]; selected: T; onSelect: (v: T) => void; renderLabel?: (v: T) => string }) => (
    <View style={styles.chipRow}>
      {options.map((opt) => {
        const isSelected = selected === opt;
        return (
          <Pressable
            key={opt}
            onPress={() => onSelect(opt)}
            style={[
              styles.chip,
              {
                backgroundColor: isSelected ? colors.accent.primary : colors.bg.primary,
                borderColor: isSelected ? colors.accent.primary : borderColor,
              },
            ]}
          >
            <Text
              style={[
                styles.chipText,
                { color: isSelected ? '#FFFFFF' : textColor, fontWeight: isSelected ? '700' : '500' },
              ]}
            >
              {renderLabel ? renderLabel(opt) : opt.charAt(0).toUpperCase() + opt.slice(1)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  const ColorPicker = ({ colors: colorOptions, selected, onSelect }: { colors: string[]; selected: string; onSelect: (c: string) => void }) => (
    <View style={styles.colorGrid}>
      {colorOptions.map((c) => {
        const isSelected = selected === c;
        return (
          <Pressable
            key={c}
            onPress={() => onSelect(c)}
            style={[
              styles.colorDot,
              { backgroundColor: c },
              isSelected && styles.colorDotSelected,
            ]}
          >
            {isSelected && <MaterialIcons name="check" size={16} color={c === '#F8FAFC' || c === '#FFFFFF' ? '#000' : '#FFF'} />}
          </Pressable>
        );
      })}
    </View>
  );

  // ═══════════════════════════════════════════════════════════
  // TABS
  // ═══════════════════════════════════════════════════════════

  const TABS: { id: TabId; label: string; icon: string }[] = [
    { id: 'HEADER', label: 'Header', icon: 'domain' },
    { id: 'CONTENT', label: 'Content', icon: 'view-quilt' },
    { id: 'TABLE', label: 'Table', icon: 'table-chart' },
    { id: 'STYLE', label: 'Style', icon: 'palette' },
    { id: 'PREVIEW', label: 'Preview', icon: 'visibility' },
  ];

  return (
    <ProtectedRoute>
      <View style={[styles.container, { backgroundColor: colors.bg.primary }]}>
        {/* App Bar */}
        <View style={[styles.appBar, { backgroundColor: cardBg, borderBottomColor: borderColor }]}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn}>
            <MaterialIcons name="arrow-back" size={24} color={textColor} />
          </Pressable>
          <View style={styles.appBarTitleBox}>
            <Text style={[styles.appBarTitle, { color: textColor }]}>Invoice Management</Text>
            <Text style={[styles.appBarSubTitle, { color: subTextColor }]}>Customize invoice layout & design</Text>
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

        {/* Action Bar */}
        <View style={[styles.subHeaderRow, { backgroundColor: cardBg, borderBottomColor: borderColor }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetScroll}>
            {INVOICE_PRESETS.map((preset) => (
              <Pressable
                key={preset.id}
                onPress={() => applyPreset(preset.id)}
                style={[styles.presetBtn, { backgroundColor: colors.bg.primary, borderColor }]}
              >
                <MaterialIcons name={preset.icon as any} size={16} color={colors.accent.primary} />
                <Text style={[styles.presetBtnText, { color: textColor }]}>{preset.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable style={styles.resetHeaderBtn} onPress={handleReset}>
            <MaterialIcons name="restart-alt" size={18} color="#EF4444" />
          </Pressable>
        </View>

        {/* Tab Selector */}
        <View style={[styles.tabBar, { backgroundColor: cardBg, borderBottomColor: borderColor }]}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <Pressable
                key={tab.id}
                onPress={() => setActiveTab(tab.id)}
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

        {/* ═══════════════════════ SCROLLABLE CONTENT ═══════════════════════ */}
        {activeTab !== 'PREVIEW' ? (
          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* ────────── TAB 1: HEADER & BRANDING ────────── */}
            {activeTab === 'HEADER' && (
              <View style={styles.sectionContainer}>
                <SectionHeading text="HEADER LAYOUT" />
                <Card>
                  <Text style={[styles.cardTitle, { color: textColor }]}>Layout Style</Text>
                  <Text style={[styles.cardDesc, { color: subTextColor }]}>
                    Choose how the company info and invoice title are arranged.
                  </Text>
                  <ChipSelector<HeaderLayout>
                    options={['classic', 'modern', 'minimal', 'centered']}
                    selected={template.headerLayout}
                    onSelect={(v) => updateField('headerLayout', v)}
                    renderLabel={(v) => v.charAt(0).toUpperCase() + v.slice(1)}
                  />
                </Card>

                <SectionHeading text="INVOICE TITLE" marginTop={20} />
                <Card>
                  <Text style={[styles.inputLabel, { color: subTextColor }]}>Title Text (shown on top-right)</Text>
                  <TextInput
                    value={template.invoiceTitleText}
                    onChangeText={(val) => updateField('invoiceTitleText', val)}
                    placeholder="e.g. INVOICE, TAX INVOICE, BILL"
                    placeholderTextColor={subTextColor}
                    style={[styles.input, { backgroundColor: colors.bg.primary, color: textColor, borderColor }]}
                  />
                  <View style={styles.quickTags}>
                    {['INVOICE', 'TAX INVOICE', 'BILL', 'RECEIPT', 'PROFORMA'].map((t) => (
                      <Pressable
                        key={t}
                        onPress={() => updateField('invoiceTitleText', t)}
                        style={[
                          styles.quickTag,
                          {
                            backgroundColor: template.invoiceTitleText === t ? colors.accent.primary : colors.bg.primary,
                            borderColor: template.invoiceTitleText === t ? colors.accent.primary : borderColor,
                          },
                        ]}
                      >
                        <Text style={[styles.quickTagText, { color: template.invoiceTitleText === t ? '#FFF' : textColor }]}>{t}</Text>
                      </Pressable>
                    ))}
                  </View>
                </Card>

                <SectionHeading text="COMPANY DETAILS VISIBILITY" marginTop={20} />
                <Card>
                  <ToggleRow title="Company Logo" subtitle="Show logo or avatar in header" value={template.showCompanyLogo} onToggle={(v) => updateField('showCompanyLogo', v)} />
                  <ToggleRow title="Company Name" subtitle="Display business name" value={template.showCompanyName} onToggle={(v) => updateField('showCompanyName', v)} />
                  <ToggleRow title="Phone Number" subtitle="Show contact phone" value={template.showCompanyPhone} onToggle={(v) => updateField('showCompanyPhone', v)} />
                  <ToggleRow title="Email Address" subtitle="Show contact email" value={template.showCompanyEmail} onToggle={(v) => updateField('showCompanyEmail', v)} />
                  <ToggleRow title="Business Address" subtitle="Show physical address" value={template.showCompanyAddress} onToggle={(v) => updateField('showCompanyAddress', v)} />
                  <ToggleRow title="GST Number" subtitle="Show GSTIN in header" value={template.showCompanyGst} onToggle={(v) => updateField('showCompanyGst', v)} isLast />
                </Card>
              </View>
            )}

            {/* ────────── TAB 2: CONTENT SECTIONS ────────── */}
            {activeTab === 'CONTENT' && (
              <View style={styles.sectionContainer}>
                <SectionHeading text="CUSTOMER SECTION" />
                <Card>
                  <ToggleRow title="Show Customer Section" subtitle="Include Billed To card on invoice" value={template.showCustomerSection} onToggle={(v) => updateField('showCustomerSection', v)} />
                  {template.showCustomerSection && (
                    <>
                      <ToggleRow title="Customer Phone" subtitle="Show customer phone number" value={template.showCustomerPhone} onToggle={(v) => updateField('showCustomerPhone', v)} />
                      <ToggleRow title="Customer Address" subtitle="Show billing address" value={template.showCustomerAddress} onToggle={(v) => updateField('showCustomerAddress', v)} />
                      <ToggleRow title="Customer GST" subtitle="Show customer GSTIN" value={template.showCustomerGst} onToggle={(v) => updateField('showCustomerGst', v)} isLast />
                      <View style={{ marginTop: 12 }}>
                        <Text style={[styles.inputLabel, { color: subTextColor }]}>Section Title</Text>
                        <TextInput
                          value={template.customerSectionTitle}
                          onChangeText={(val) => updateField('customerSectionTitle', val)}
                          placeholder="e.g. Billed To, Bill To, Customer"
                          placeholderTextColor={subTextColor}
                          style={[styles.input, { backgroundColor: colors.bg.primary, color: textColor, borderColor }]}
                        />
                      </View>
                    </>
                  )}
                </Card>

                <SectionHeading text="INVOICE META" marginTop={20} />
                <Card>
                  <ToggleRow title="Invoice Number" subtitle="Show # reference number" value={template.showInvoiceNumber} onToggle={(v) => updateField('showInvoiceNumber', v)} />
                  <ToggleRow title="Invoice Date" subtitle="Show issue date" value={template.showInvoiceDate} onToggle={(v) => updateField('showInvoiceDate', v)} />
                  <ToggleRow title="Due Date" subtitle="Show payment due date" value={template.showDueDate} onToggle={(v) => updateField('showDueDate', v)} />
                  <ToggleRow title="Payment Method" subtitle="Show payment mode (Cash, UPI, etc.)" value={template.showPaymentMethod} onToggle={(v) => updateField('showPaymentMethod', v)} isLast />
                </Card>

                <SectionHeading text="FOOTER SECTIONS" marginTop={20} />
                <Card>
                  <ToggleRow title="Notes" subtitle="Show transaction notes" value={template.showNotes} onToggle={(v) => updateField('showNotes', v)} />
                  <ToggleRow title="Terms & Conditions" subtitle="Show terms text block" value={template.showTerms} onToggle={(v) => updateField('showTerms', v)} />
                  <ToggleRow title="Signature" subtitle="Show authorized signature area" value={template.showSignature} onToggle={(v) => updateField('showSignature', v)} />
                  <ToggleRow title="QR Code" subtitle="Show payment QR code" value={template.showQrCode} onToggle={(v) => updateField('showQrCode', v)} />
                  {template.showQrCode && (
                    <View style={{ marginTop: 10, marginBottom: 12, padding: 12, backgroundColor: colors.bg.primary, borderRadius: 12, borderWidth: 1, borderColor }}>
                      <Text style={[styles.inputLabel, { color: textColor, fontWeight: '700', fontSize: 12 }]}>QR CODE SOURCE</Text>
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, marginBottom: 12 }}>
                        <Pressable
                          onPress={() => updateField('useCustomQrCode', false)}
                          style={[
                            styles.chip,
                            !template.useCustomQrCode && { backgroundColor: colors.accent.primary, borderColor: colors.accent.primary },
                            { flex: 1, justifyContent: 'center' }
                          ]}
                        >
                          <MaterialIcons name="qr-code-2" size={16} color={!template.useCustomQrCode ? '#FFF' : textColor} />
                          <Text style={[styles.chipText, !template.useCustomQrCode && { color: '#FFF', fontWeight: '700' }]}>
                            Dynamic UPI
                          </Text>
                        </Pressable>

                        <Pressable
                          onPress={() => updateField('useCustomQrCode', true)}
                          style={[
                            styles.chip,
                            template.useCustomQrCode && { backgroundColor: colors.accent.primary, borderColor: colors.accent.primary },
                            { flex: 1, justifyContent: 'center' }
                          ]}
                        >
                          <MaterialIcons name="photo-library" size={16} color={template.useCustomQrCode ? '#FFF' : textColor} />
                          <Text style={[styles.chipText, template.useCustomQrCode && { color: '#FFF', fontWeight: '700' }]}>
                            Custom Image
                          </Text>
                        </Pressable>
                      </View>

                      {!template.useCustomQrCode && (
                        <View style={{ marginTop: 4 }}>
                          <Text style={[styles.cardDesc, { color: subTextColor, marginBottom: 8, fontSize: 11 }]}>
                            Generates an instant payment QR code using your Business UPI Virtual Payment Address (VPA).
                          </Text>

                          <Text style={[styles.inputLabel, { color: subTextColor }]}>UPI VPA / PhonePe / GPay / Paytm ID</Text>
                          <TextInput
                            value={shareSettings.upiId || ''}
                            onChangeText={(val) => {
                              setShareSettings((prev) => ({ ...prev, upiId: val }));
                              setHasChanges(true);
                            }}
                            placeholder="e.g. yourname@upi, 9876543210@paytm, business@okicici"
                            placeholderTextColor={subTextColor}
                            style={[styles.input, { backgroundColor: cardBg, color: textColor, borderColor }]}
                          />

                          {shareSettings.upiId ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
                              <MaterialIcons name="check-circle" size={14} color="#10B981" />
                              <Text style={{ fontSize: 11, color: '#10B981', fontWeight: '600' }}>
                                Active UPI: {shareSettings.upiId}
                              </Text>
                            </View>
                          ) : (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
                              <MaterialIcons name="info" size={14} color="#F59E0B" />
                              <Text style={{ fontSize: 11, color: '#F59E0B', fontWeight: '500' }}>
                                Enter your UPI ID above so customers can scan and pay directly.
                              </Text>
                            </View>
                          )}
                        </View>
                      )}

                      {template.useCustomQrCode && (
                        <View style={{ marginTop: 4 }}>
                          <Text style={[styles.cardDesc, { color: subTextColor, marginBottom: 10, fontSize: 11 }]}>
                            Upload or select a custom QR Code image stored in local image storage to be displayed on your invoice.
                          </Text>

                          <View style={{ alignItems: 'center', marginBottom: 12 }}>
                            {template.customQrCodeUri ? (
                              <View style={{ position: 'relative', width: 110, height: 110, borderRadius: 12, borderWidth: 2, borderColor: colors.accent.primary, overflow: 'hidden', backgroundColor: '#FFF', padding: 4 }}>
                                <Image source={{ uri: template.customQrCodeUri }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
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

                            {template.customQrCodeUri ? (
                              <Pressable
                                onPress={() => updateField('customQrCodeUri', '')}
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
                  <ToggleRow title="Bank Account Details" subtitle="Include Bank Name, A/c & IFSC Code" value={template.showBankDetails !== false} onToggle={(v) => updateField('showBankDetails', v)} />
                  {template.showBankDetails !== false && (
                    <View style={{ marginTop: 10, marginBottom: 12, padding: 12, backgroundColor: colors.bg.primary, borderRadius: 12, borderWidth: 1, borderColor, gap: 12 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={[styles.inputLabel, { color: textColor, fontWeight: '700', fontSize: 11, marginBottom: 0 }]}>BANK PAYMENT DETAILS</Text>
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
                      {Array.isArray(template.bankAccounts) && template.bankAccounts.length > 0 && (
                        <View style={{ gap: 8 }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: subTextColor, textTransform: 'uppercase' }}>
                            Saved Accounts (Tap to select for invoice)
                          </Text>
                          {template.bankAccounts.map((acc) => {
                            const isSelected = template.selectedBankAccountId === acc.id || (template.bankName === acc.bankName && template.accountNo === acc.accountNo);
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

                      <View style={{ borderTopWidth: Array.isArray(template.bankAccounts) && template.bankAccounts.length > 0 ? 1 : 0, borderTopColor: borderColor, paddingTop: Array.isArray(template.bankAccounts) && template.bankAccounts.length > 0 ? 8 : 0, gap: 10 }}>
                        <Text style={[styles.inputLabel, { color: subTextColor, fontSize: 10, marginBottom: 0 }]}>ACTIVE INVOICE BANK DETAILS</Text>
                        <TextInput
                          value={template.bankName || ''}
                          onChangeText={(val) => updateField('bankName', val)}
                          placeholder="Bank Name (e.g. SBI / HDFC Bank)"
                          placeholderTextColor={subTextColor}
                          style={[styles.input, { backgroundColor: cardBg, color: textColor, borderColor }]}
                        />
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                          <View style={{ flex: 1 }}>
                            <TextInput
                              value={template.accountNo || ''}
                              onChangeText={(val) => updateField('accountNo', val)}
                              placeholder="Account Number"
                              placeholderTextColor={subTextColor}
                              keyboardType="numeric"
                              style={[styles.input, { backgroundColor: cardBg, color: textColor, borderColor }]}
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <TextInput
                              value={template.ifscCode || ''}
                              onChangeText={(val) => updateField('ifscCode', val.toUpperCase())}
                              placeholder="IFSC Code"
                              placeholderTextColor={subTextColor}
                              autoCapitalize="characters"
                              style={[styles.input, { backgroundColor: cardBg, color: textColor, borderColor }]}
                            />
                          </View>
                        </View>
                        <TextInput
                          value={template.accountHolderName || ''}
                          onChangeText={(val) => updateField('accountHolderName', val)}
                          placeholder="Account Holder Name"
                          placeholderTextColor={subTextColor}
                          style={[styles.input, { backgroundColor: cardBg, color: textColor, borderColor }]}
                        />
                      </View>
                    </View>
                  )}
                  <ToggleRow title="Thank You Note" subtitle="Show footer thank you message" value={template.showThankYouNote} onToggle={(v) => updateField('showThankYouNote', v)} />
                  <ToggleRow title="Footer Branding" subtitle="Show 'Generated via...' text" value={template.showFooterBranding} onToggle={(v) => updateField('showFooterBranding', v)} isLast />
                  {template.showFooterBranding && (
                    <View style={{ marginTop: 12 }}>
                      <Text style={[styles.inputLabel, { color: subTextColor }]}>Branding Text</Text>
                      <TextInput
                        value={template.footerBrandingText}
                        onChangeText={(val) => updateField('footerBrandingText', val)}
                        placeholder="e.g. Generated via Business Suite"
                        placeholderTextColor={subTextColor}
                        style={[styles.input, { backgroundColor: colors.bg.primary, color: textColor, borderColor }]}
                      />
                    </View>
                  )}
                </Card>

                <SectionHeading text="PAYMENT STATUS" marginTop={20} />
                <Card>
                  <ToggleRow title="Status Badge" subtitle="Show PAID/PENDING badge in header" value={template.showPaymentStatus} onToggle={(v) => updateField('showPaymentStatus', v)} isLast />
                </Card>
              </View>
            )}

            {/* ────────── TAB 3: TABLE & SUMMARY ────────── */}
            {activeTab === 'TABLE' && (
              <View style={styles.sectionContainer}>
                <SectionHeading text="TABLE STYLE" />
                <Card>
                  <Text style={[styles.cardTitle, { color: textColor }]}>Items Table Layout</Text>
                  <Text style={[styles.cardDesc, { color: subTextColor }]}>
                    Choose how the items table is rendered.
                  </Text>
                  <ChipSelector<TableStyle>
                    options={['striped', 'bordered', 'clean', 'minimal']}
                    selected={template.tableStyle}
                    onSelect={(v) => updateField('tableStyle', v)}
                    renderLabel={(v) => v.charAt(0).toUpperCase() + v.slice(1)}
                  />
                </Card>

                <SectionHeading text="TABLE COLUMNS" marginTop={20} />
                <Card>
                  <ToggleRow title="Row Index (#)" subtitle="Show item number column" value={template.showItemIndex} onToggle={(v) => updateField('showItemIndex', v)} />
                  <ToggleRow title="Unit Column" subtitle="Show unit alongside quantity (pcs, kg, etc.)" value={template.showItemUnit} onToggle={(v) => updateField('showItemUnit', v)} />
                  <ToggleRow title="Rate Column" subtitle="Show per-unit price column" value={template.showItemRate} onToggle={(v) => updateField('showItemRate', v)} isLast />
                </Card>

                <SectionHeading text="TABLE HEADER COLOR" marginTop={20} />
                <Card>
                  <Text style={[styles.cardTitle, { color: textColor }]}>Header Row Background</Text>
                  <ColorPicker colors={TABLE_HEADER_COLORS} selected={template.tableHeaderBg} onSelect={(c) => updateField('tableHeaderBg', c)} />
                  <View style={{ marginTop: 12 }}>
                    <Text style={[styles.inputLabel, { color: subTextColor }]}>Header Text Color</Text>
                    <View style={styles.chipRow}>
                      {['#FFFFFF', '#0F172A', '#F8FAFC'].map((c) => (
                        <Pressable
                          key={c}
                          onPress={() => updateField('tableHeaderTextColor', c)}
                          style={[
                            styles.chip,
                            {
                              backgroundColor: template.tableHeaderTextColor === c ? colors.accent.primary : colors.bg.primary,
                              borderColor: template.tableHeaderTextColor === c ? colors.accent.primary : borderColor,
                            },
                          ]}
                        >
                          <View style={[styles.miniSwatch, { backgroundColor: c, borderWidth: c === '#FFFFFF' ? 1 : 0, borderColor: '#CBD5E1' }]} />
                          <Text style={[styles.chipText, { color: template.tableHeaderTextColor === c ? '#FFF' : textColor, fontSize: 11 }]}>
                            {c === '#FFFFFF' ? 'White' : c === '#0F172A' ? 'Dark' : 'Light'}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                </Card>

                <SectionHeading text="SUMMARY ROWS & CHARGES" marginTop={20} />
                <Card>
                  <ToggleRow title="Subtotal" subtitle="Show subtotal before tax and charges" value={template.showSubtotal} onToggle={(v) => updateField('showSubtotal', v)} />
                  <ToggleRow title="Delivery / Freight Charge" subtitle="Show delivery and transport charges" value={template.showDeliveryCharge} onToggle={(v) => updateField('showDeliveryCharge', v)} />
                  <ToggleRow title="Loading Charge" subtitle="Show loading worker charges" value={template.showLoadingCharge} onToggle={(v) => updateField('showLoadingCharge', v)} />
                  <ToggleRow title="Unloading Charge" subtitle="Show unloading worker charges" value={template.showUnloadingCharge} onToggle={(v) => updateField('showUnloadingCharge', v)} />
                  <ToggleRow title="Extra Charges" subtitle="Show extra/custom charge breakdown" value={template.showExtraCharge} onToggle={(v) => updateField('showExtraCharge', v)} />
                  <ToggleRow title="Tax / GST" subtitle="Show tax amount row" value={template.showTax} onToggle={(v) => updateField('showTax', v)} />
                  <ToggleRow title="Discount" subtitle="Show discount row" value={template.showDiscount} onToggle={(v) => updateField('showDiscount', v)} />
                  <ToggleRow title="Paid Amount" subtitle="Show amount already paid" value={template.showPaidAmount} onToggle={(v) => updateField('showPaidAmount', v)} />
                  <ToggleRow title="Old Balance Due" subtitle="Show previous outstanding balance" value={template.showOldBalanceDue} onToggle={(v) => updateField('showOldBalanceDue', v)} />
                  <ToggleRow title="Balance Due" subtitle="Show remaining balance" value={template.showBalanceDue} onToggle={(v) => updateField('showBalanceDue', v)} isLast />
                </Card>
              </View>
            )}

            {/* ────────── TAB 4: TYPOGRAPHY & STYLE ────────── */}
            {activeTab === 'STYLE' && (
              <View style={styles.sectionContainer}>
                <SectionHeading text="TYPOGRAPHY" />
                <Card>
                  <Text style={[styles.cardTitle, { color: textColor }]}>Font Family</Text>
                  <Text style={[styles.cardDesc, { color: subTextColor }]}>
                    Choose the typeface used across the invoice.
                  </Text>
                  <ChipSelector<InvoiceFontFamily>
                    options={['Helvetica', 'Arial', 'Georgia', 'Times', 'Courier']}
                    selected={template.fontFamily}
                    onSelect={(v) => updateField('fontFamily', v)}
                  />

                  <View style={{ marginTop: 16 }}>
                    <Text style={[styles.inputLabel, { color: subTextColor }]}>
                      Base Font Size: {template.baseFontSize}px
                    </Text>
                    <View style={styles.fontSizeRow}>
                      {[10, 11, 12, 13, 14, 15, 16].map((size) => (
                        <Pressable
                          key={size}
                          onPress={() => updateField('baseFontSize', size)}
                          style={[
                            styles.fontSizeDot,
                            {
                              backgroundColor: template.baseFontSize === size ? colors.accent.primary : colors.bg.primary,
                              borderColor: template.baseFontSize === size ? colors.accent.primary : borderColor,
                            },
                          ]}
                        >
                          <Text style={[styles.fontSizeText, { color: template.baseFontSize === size ? '#FFF' : textColor }]}>
                            {size}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                </Card>

                <SectionHeading text="COLORS" marginTop={20} />
                <Card>
                  <Text style={[styles.cardTitle, { color: textColor }]}>Accent Color</Text>
                  <Text style={[styles.cardDesc, { color: subTextColor }]}>Used for titles, totals, and highlights</Text>
                  <ColorPicker colors={ACCENT_COLORS.map((c) => c.color)} selected={template.accentColor} onSelect={(c) => updateField('accentColor', c)} />

                  <View style={[styles.divider, { backgroundColor: borderColor }]} />

                  <Text style={[styles.cardTitle, { color: textColor }]}>Heading Color</Text>
                  <ColorPicker colors={HEADING_COLORS} selected={template.headingColor} onSelect={(c) => updateField('headingColor', c)} />

                  <View style={[styles.divider, { backgroundColor: borderColor }]} />

                  <Text style={[styles.cardTitle, { color: textColor }]}>Body Text Color</Text>
                  <ColorPicker colors={['#334155', '#1E293B', '#475569', '#0F172A', '#64748B']} selected={template.bodyTextColor} onSelect={(c) => updateField('bodyTextColor', c)} />
                </Card>

                <SectionHeading text="BORDERS & BACKGROUND" marginTop={20} />
                <Card>
                  <Text style={[styles.cardTitle, { color: textColor }]}>Border Style</Text>
                  <ChipSelector<BorderStyle>
                    options={['solid', 'dashed', 'none']}
                    selected={template.borderStyle}
                    onSelect={(v) => updateField('borderStyle', v)}
                    renderLabel={(v) => v.charAt(0).toUpperCase() + v.slice(1)}
                  />

                  <View style={{ marginTop: 12 }}>
                    <Text style={[styles.inputLabel, { color: subTextColor }]}>Border Color</Text>
                    <ColorPicker colors={['#E2E8F0', '#CBD5E1', '#94A3B8', '#DDD6FE', '#BFDBFE', '#D1FAE5']} selected={template.borderColor} onSelect={(c) => updateField('borderColor', c)} />
                  </View>

                  <View style={{ marginTop: 12 }}>
                    <Text style={[styles.inputLabel, { color: subTextColor }]}>Page Background</Text>
                    <View style={styles.chipRow}>
                      {['#FFFFFF', '#F8FAFC', '#FFFBEB', '#F0FDF4'].map((c) => (
                        <Pressable
                          key={c}
                          onPress={() => updateField('pageBackground', c)}
                          style={[
                            styles.chip,
                            {
                              backgroundColor: template.pageBackground === c ? colors.accent.primary : colors.bg.primary,
                              borderColor: template.pageBackground === c ? colors.accent.primary : borderColor,
                            },
                          ]}
                        >
                          <View style={[styles.miniSwatch, { backgroundColor: c, borderWidth: 1, borderColor: '#CBD5E1' }]} />
                          <Text style={[styles.chipText, { color: template.pageBackground === c ? '#FFF' : textColor, fontSize: 11 }]}>
                            {c === '#FFFFFF' ? 'White' : c === '#F8FAFC' ? 'Slate' : c === '#FFFBEB' ? 'Warm' : 'Mint'}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                </Card>
              </View>
            )}

            <View style={{ height: 60 }} />
          </ScrollView>
        ) : (
          /* ────────── TAB 5: LIVE PREVIEW ────────── */
          <View style={styles.previewContainer}>
            <View style={[styles.previewHeader, { backgroundColor: cardBg, borderBottomColor: borderColor }]}>
              <MaterialIcons name="visibility" size={18} color={colors.accent.primary} />
              <Text style={[styles.previewHeaderText, { color: textColor }]}>Live Invoice Preview</Text>
              <Pressable
                onPress={() => {
                  const html = generateInvoiceHtml(SAMPLE_TRANSACTION, shareSettings, template);
                  setPreviewHtml(html);
                }}
                style={[styles.refreshBtn, { backgroundColor: colors.accent.primary }]}
              >
                <MaterialIcons name="refresh" size={16} color="#FFF" />
                <Text style={styles.refreshBtnText}>Refresh</Text>
              </Pressable>
            </View>
            {previewHtml ? (
              <WebView
                originWhitelist={['*']}
                source={{ html: previewHtml }}
                style={styles.webview}
                scrollEnabled={true}
                scalesPageToFit={true}
                javaScriptEnabled={false}
              />
            ) : (
              <View style={styles.center}>
                <ActivityIndicator size="large" color={colors.accent.primary} />
              </View>
            )}
          </View>
        )}

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
                          updateField('customQrCodeUri', img.uri);
                          updateField('useCustomQrCode', true);
                          setLocalImagesModalVisible(false);
                        }}
                        style={{
                          width: 90,
                          height: 90,
                          borderRadius: 10,
                          borderWidth: template.customQrCodeUri === img.uri ? 2.5 : 1,
                          borderColor: template.customQrCodeUri === img.uri ? colors.accent.primary : colors.border.medium,
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

export default InvoiceManagementScreen;

// ═══════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════
const getStyles = (theme: any) => {
  const { colors, spacing, radius } = theme;
  return StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { marginTop: 12, fontSize: 14 },
    appBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 48,
      paddingBottom: 12,
      borderBottomWidth: 1,
    },
    iconBtn: { padding: 6 },
    appBarTitleBox: { flex: 1, marginLeft: 12 },
    appBarTitle: { fontSize: 18, fontWeight: '700' },
    appBarSubTitle: { fontSize: 11, marginTop: 1 },
    saveBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
    saveBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
    subHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      paddingLeft: 4,
      paddingRight: 8,
      borderBottomWidth: 1,
    },
    presetScroll: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 8,
    },
    presetBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
    },
    presetBtnText: { fontSize: 12, fontWeight: '600' },
    resetHeaderBtn: { padding: 8, marginLeft: 4 },
    tabBar: { flexDirection: 'row', borderBottomWidth: 1 },
    tabItem: {
      flex: 1,
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      gap: 3,
    },
    tabLabel: { fontSize: 10 },
    scrollContent: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
    sectionContainer: { marginBottom: 20 },
    sectionHeading: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, marginBottom: 8 },
    card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 4 },
    cardTitle: { fontSize: 15, fontWeight: '700' },
    cardDesc: { fontSize: 12, marginTop: 2, marginBottom: 12 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
    chip: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 10,
      borderWidth: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    chipText: { fontSize: 12 },
    colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
    colorDot: {
      width: 38,
      height: 38,
      borderRadius: 19,
      justifyContent: 'center',
      alignItems: 'center',
    },
    colorDotSelected: { borderWidth: 3, borderColor: '#FFFFFF', elevation: 4 },
    miniSwatch: { width: 14, height: 14, borderRadius: 3 },
    toggleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
    },
    toggleTitle: { fontSize: 14, fontWeight: '600' },
    toggleSub: { fontSize: 11, marginTop: 2 },
    inputLabel: { fontSize: 11, fontWeight: '700', marginBottom: 6 },
    input: { height: 44, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, fontSize: 13 },
    quickTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
    quickTag: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
    quickTagText: { fontSize: 11, fontWeight: '700' },
    fontSizeRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
    fontSizeDot: {
      width: 38,
      height: 38,
      borderRadius: 10,
      borderWidth: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    fontSizeText: { fontSize: 13, fontWeight: '700' },
    divider: { height: 1, marginVertical: 14 },
    // Preview
    previewContainer: { flex: 1 },
    previewHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: 1,
    },
    previewHeaderText: { flex: 1, fontSize: 14, fontWeight: '700' },
    refreshBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
    },
    refreshBtnText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
    webview: { flex: 1, backgroundColor: '#F8FAFC' },
    // Modal & QR Custom styles
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
};
