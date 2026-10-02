import React, { useEffect, useState, useMemo, useCallback, useContext } from 'react';
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
import { UserContext } from '../context/UserContext';
import ProtectedRoute from '../components/ProtectedRoute';
import {
  DEFAULT_INVOICE_TEMPLATE,
  InvoiceTemplate,
  INVOICE_PRESETS,
  HeaderLayout,
  TableStyle,
  InvoiceFontFamily,
  BorderStyle,
  TableDensity,
  PageMargin,
  DEFAULT_SHARE_SETTINGS,
  ShareSettings,
  TransactionData,
  BankAccount,
  AppaEstimateBillSettings,
  DEFAULT_APPA_ESTIMATE_BILL_SETTINGS,
  AppaBillTheme,
  CustomerShareData,
} from '../../src/types/sharing';
import { invoiceTemplateService } from '../../src/services/sharing/invoiceTemplateService';
import { shareSettingsService } from '../../src/services/sharing/shareSettingsService';
import { generateInvoiceHtml } from '../../src/services/sharing/pdfGenerator';
import {
  TAMIL_INVOICE_LABELS,
  BRICK_CONSTRUCTION_TAMIL_LABELS,
  STANDARD_COMMERCE_TAMIL_LABELS,
  InvoiceLabels,
} from '../../src/utils/invoiceLocalization';
import { WebView } from 'react-native-webview';
import { AppaEstimateBillView, APPA_BILL_THEMES } from '../../src/components/sharing/AppaEstimateBillView';
import { SignaturePadModal } from '../../src/components/sharing/SignaturePadModal';

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

const SAMPLE_CUSTOMER_STATEMENT_DATA: CustomerShareData = {
  customer: {
    id: 'sample-cust-1',
    name: 'திரு. எஸ். குமார்',
    phone: '98421 98421',
    address: '24, காவேரி நகர், தளவாபாளையம்',
  },
  summary: {
    totalOrdersCount: 2,
    totalSalesAmount: 48500,
    totalPaidAmount: 30000,
    netBalanceDue: 18500,
    oldBalanceDue: 5000,
  },
  ledger: [
    {
      id: 'led-1',
      date: new Date(Date.now() - 14 * 86400000).toISOString(),
      type: 'opening',
      description: 'முந்தைய பழைய பாக்கி',
      amount: 5000,
      paid: 0,
      balance: 5000,
    },
    {
      id: 'led-2',
      date: new Date(Date.now() - 7 * 86400000).toISOString(),
      type: 'order',
      description: 'ஹாலோ பிளாக்ஸ் (4" & 6")',
      amount: 43500,
      paid: 0,
      balance: 48500,
      shipmentCharge: 1500,
      loadingCharge: 600,
      unloadingCharge: 400,
      items: [
        { name: '4" ஹாலோ பிளாக்ஸ்', quantity: 1500, rate: 21, total: 31500 },
        { name: '6" சாலிட் பிளாக்ஸ்', quantity: 300, rate: 32, total: 9500 },
      ],
    },
    {
      id: 'led-3',
      date: new Date().toISOString(),
      type: 'payment',
      description: 'GPay மூலம் ரொக்க வரவு',
      amount: 0,
      paid: 30000,
      balance: 18500,
      notes: 'முன்பணம் வரவு வைக்கப்பட்டது',
    },
  ],
};

type TabId = 'HEADER' | 'CONTENT' | 'TABLE' | 'STYLE' | 'PREVIEW';

// ═══════════════════════════════════════════════════════════
// INVOICE EDITOR CONTEXT (Module level to keep component tree stable)
// ═══════════════════════════════════════════════════════════
interface InvoiceEditorContextValue {
  template: InvoiceTemplate;
  updateTamilLabel: (key: keyof InvoiceLabels, val: string) => void;
  resetTamilLabel: (key: keyof InvoiceLabels) => void;
}

const InvoiceEditorContext = React.createContext<InvoiceEditorContextValue>({
  template: DEFAULT_INVOICE_TEMPLATE,
  updateTamilLabel: () => {},
  resetTamilLabel: () => {},
});

// ═══════════════════════════════════════════════════════════
// REUSABLE SUB-COMPONENTS (Module level to prevent unmount/remount on keystrokes)
// ═══════════════════════════════════════════════════════════

interface ToggleRowProps {
  title: string;
  subtitle: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  isLast?: boolean;
}
const ToggleRow = React.memo(function ToggleRow({ title, subtitle, value, onToggle, isLast = false }: ToggleRowProps) {
  const { theme } = useTheme();
  return (
    <View style={[{
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
    }, !isLast && { borderBottomWidth: 1, borderBottomColor: theme.colors.border.subtle }]}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: theme.colors.text.primary }}>{title}</Text>
        <Text style={{ fontSize: 11, marginTop: 2, color: theme.colors.text.muted }}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
        thumbColor={value ? '#2563EB' : '#F1F5F9'}
      />
    </View>
  );
});

interface SectionHeadingProps {
  text: string;
  marginTop?: number;
}
const SectionHeading = React.memo(function SectionHeading({ text, marginTop = 0 }: SectionHeadingProps) {
  const { theme } = useTheme();
  return (
    <Text style={{
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 8,
      color: theme.colors.accent.primary,
      marginTop,
    }}>
      {text}
    </Text>
  );
});

interface CardProps {
  children: React.ReactNode;
  style?: any;
}
const Card = React.memo(function Card({ children, style }: CardProps) {
  const { theme } = useTheme();
  return (
    <View style={[{
      borderRadius: 12,
      borderWidth: 1,
      padding: 14,
      marginBottom: 12,
      backgroundColor: theme.colors.bg.card,
      borderColor: theme.colors.border.subtle,
    }, style]}>
      {children}
    </View>
  );
});

interface ChipSelectorProps<T extends string> {
  options: T[];
  selected: T;
  onSelect: (v: T) => void;
  renderLabel?: (v: T) => string;
}
function ChipSelector<T extends string>({ options, selected, onSelect, renderLabel }: ChipSelectorProps<T>) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {options.map((opt) => {
        const isSelected = selected === opt;
        return (
          <Pressable
            key={opt}
            onPress={() => onSelect(opt)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 8,
              borderWidth: 1,
              backgroundColor: isSelected ? theme.colors.accent.primary : theme.colors.bg.primary,
              borderColor: isSelected ? theme.colors.accent.primary : theme.colors.border.subtle,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                color: isSelected ? '#FFFFFF' : theme.colors.text.primary,
                fontWeight: isSelected ? '700' : '500',
              }}
            >
              {renderLabel ? renderLabel(opt) : opt.charAt(0).toUpperCase() + opt.slice(1)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

interface ColorPickerProps {
  colors: string[];
  selected: string;
  onSelect: (c: string) => void;
}
const ColorPicker = React.memo(function ColorPicker({ colors: colorOptions, selected, onSelect }: ColorPickerProps) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
      {colorOptions.map((c) => {
        const isSelected = selected === c;
        return (
          <Pressable
            key={c}
            onPress={() => onSelect(c)}
            style={[
              {
                width: 38,
                height: 38,
                borderRadius: 19,
                justifyContent: 'center',
                alignItems: 'center',
                backgroundColor: c,
              },
              isSelected && { borderWidth: 3, borderColor: '#FFFFFF', elevation: 4 },
            ]}
          >
            {isSelected && <MaterialIcons name="check" size={16} color={c === '#F8FAFC' || c === '#FFFFFF' ? '#000' : '#FFF'} />}
          </Pressable>
        );
      })}
    </View>
  );
});

interface FontSizeControllerProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  presets: number[];
  onChange: (val: number) => void;
  accentColor?: string;
}

const FontSizeController = React.memo(function FontSizeController({
  label,
  value,
  min = 10,
  max = 40,
  presets,
  onChange,
  accentColor,
}: FontSizeControllerProps) {
  const { theme } = useTheme();
  const textColor = theme.colors.text.primary;
  const subTextColor = theme.colors.text.muted;
  const borderColor = theme.colors.border.subtle;
  const primaryBg = theme.colors.bg.primary;
  const activeColor = accentColor || theme.colors.accent.primary;

  return (
    <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: borderColor }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: subTextColor, marginBottom: 0 }}>
          {label}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Pressable
            onPress={() => {
              if (value > min) onChange(value - 1);
            }}
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              backgroundColor: primaryBg,
              borderWidth: 1,
              borderColor,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <MaterialIcons name="remove" size={16} color={textColor} />
          </Pressable>
          <Text style={{ fontSize: 13, fontWeight: '700', color: textColor, minWidth: 36, textAlign: 'center' }}>
            {value}px
          </Text>
          <Pressable
            onPress={() => {
              if (value < max) onChange(value + 1);
            }}
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              backgroundColor: primaryBg,
              borderWidth: 1,
              borderColor,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <MaterialIcons name="add" size={16} color={textColor} />
          </Pressable>
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {presets.map((sz) => {
          const isSelected = value === sz;
          return (
            <Pressable
              key={sz}
              onPress={() => onChange(sz)}
              style={{
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 6,
                backgroundColor: isSelected ? activeColor : primaryBg,
                borderWidth: 1,
                borderColor: isSelected ? activeColor : borderColor,
                minWidth: 34,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: isSelected ? '#FFFFFF' : textColor }}>
                {sz}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
});

interface TamilLabelFieldProps {
  label: string;
  hint: string;
  fieldKey: keyof InvoiceLabels;
}
const TamilLabelField = React.memo(function TamilLabelField({
  label,
  hint,
  fieldKey,
}: TamilLabelFieldProps) {
  const { theme } = useTheme();
  const { template, updateTamilLabel, resetTamilLabel } = useContext(InvoiceEditorContext);

  const customValue = template.customTamilLabels?.[fieldKey];
  const preset = template.tamilTerminologyPreset || 'brick_construction';
  const presetDict = preset === 'standard' ? STANDARD_COMMERCE_TAMIL_LABELS : BRICK_CONSTRUCTION_TAMIL_LABELS;
  const defaultValue = presetDict[fieldKey] || TAMIL_INVOICE_LABELS[fieldKey] || '';
  const isCustomized = customValue !== undefined && customValue !== defaultValue && customValue.trim() !== '';

  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <Text style={{ fontSize: 11, fontWeight: '700', marginBottom: 0, color: theme.colors.text.muted }}>
          {label}
        </Text>
        {isCustomized ? (
          <Pressable
            onPress={() => resetTamilLabel(fieldKey)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
          >
            <Text style={{ fontSize: 10, fontWeight: '700', color: theme.colors.accent.primary }}>
              ✓ Custom (Reset)
            </Text>
          </Pressable>
        ) : null}
      </View>
      <TextInput
        style={{
          height: 40,
          borderRadius: 10,
          borderWidth: 1,
          paddingHorizontal: 12,
          fontSize: 13,
          backgroundColor: theme.colors.bg.primary,
          borderColor: isCustomized ? theme.colors.accent.primary : theme.colors.border.subtle,
          color: theme.colors.text.primary,
        }}
        value={customValue !== undefined ? customValue : defaultValue}
        onChangeText={(val) => updateTamilLabel(fieldKey, val)}
        placeholder={hint}
        placeholderTextColor={theme.colors.text.muted}
      />
    </View>
  );
});

function InvoiceManagementScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { colors } = theme;

  const [docType, setDocType] = useState<'standard' | 'appa_estimate'>('standard');
  const [appaPreviewTheme, setAppaPreviewTheme] = useState<AppaBillTheme>('classic');
  const [template, setTemplate] = useState<InvoiceTemplate>(DEFAULT_INVOICE_TEMPLATE);
  const [shareSettings, setShareSettings] = useState<ShareSettings>(DEFAULT_SHARE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('HEADER');
  const [previewHtml, setPreviewHtml] = useState('');
  const [localImagesModalVisible, setLocalImagesModalVisible] = useState(false);
  const [localImagesList, setLocalImagesList] = useState<LocalImageFile[]>([]);
  const [showTamilCustomizer, setShowTamilCustomizer] = useState(false);

  // Bank Accounts state & handlers
  const [bankModalVisible, setBankModalVisible] = useState(false);
  const [editingBankAccountId, setEditingBankAccountId] = useState<string | null>(null);
  const [modalBankName, setModalBankName] = useState('');
  const [modalAccountNo, setModalAccountNo] = useState('');
  const [modalIfscCode, setModalIfscCode] = useState('');
  const [modalAccountHolderName, setModalAccountHolderName] = useState('');
  const [signatoryPadModalVisible, setSignatoryPadModalVisible] = useState(false);
  const { profile: userProfile } = (useContext(UserContext) as any) || {};

  const handlePickAppaLogoFromGallery = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Gallery permission is required to select logo image.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      if (!result.canceled && result.assets && result.assets[0]?.uri) {
        updateAppaField('companyLogoUri', result.assets[0].uri);
      }
    } catch (e: any) {
      console.error('Gallery pick logo error:', e);
      Alert.alert('Error', 'Failed to pick logo image.');
    }
  };

  const handlePickAppaLogoFromCamera = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Camera permission is required to capture logo image.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      if (!result.canceled && result.assets && result.assets[0]?.uri) {
        updateAppaField('companyLogoUri', result.assets[0].uri);
      }
    } catch (e: any) {
      console.error('Camera pick logo error:', e);
      Alert.alert('Error', 'Failed to capture logo image.');
    }
  };

  const handlePickSignatureFromGallery = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Gallery permission is required to select signature image.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [3, 1],
        quality: 0.9,
      });
      if (!result.canceled && result.assets && result.assets[0]?.uri) {
        updateAppaField('signatureImageUri', result.assets[0].uri);
      }
    } catch (e: any) {
      console.error('Gallery pick error:', e);
      Alert.alert('Error', 'Failed to pick signature image.');
    }
  };

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

  const updateTamilLabel = useCallback((key: keyof InvoiceLabels, val: string) => {
    setTemplate((prev) => ({
      ...prev,
      customTamilLabels: {
        ...(prev.customTamilLabels || {}),
        [key]: val,
      },
    }));
    setHasChanges(true);
  }, []);

  const applyTamilPreset = useCallback((preset: 'brick_construction' | 'standard') => {
    const presetLabels = preset === 'standard' ? STANDARD_COMMERCE_TAMIL_LABELS : BRICK_CONSTRUCTION_TAMIL_LABELS;
    setTemplate((prev) => ({
      ...prev,
      tamilTerminologyPreset: preset,
      customTamilLabels: {
        ...(presetLabels as Record<string, string>),
      },
    }));
    setShareSettings((prev) => ({
      ...prev,
      tamilTerminologyPreset: preset,
      customTamilLabels: {
        ...(presetLabels as Record<string, string>),
      },
    }));
    setHasChanges(true);
  }, []);

  const updateColumnLabel = useCallback((col: 'index' | 'item' | 'qty' | 'rate' | 'amount', val: string) => {
    setTemplate((prev) => ({
      ...prev,
      customColumnLabels: {
        ...(prev.customColumnLabels || {}),
        [col]: val,
      },
    }));
    setHasChanges(true);
  }, []);

  const resetTamilLabels = useCallback(() => {
    Alert.alert(
      'Reset Tamil Words?',
      'Restore all Tamil words to their standard defaults (இயல்புநிலைக்கு மீட்டமைக்கவா)?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            setTemplate((prev) => {
              const updated = { ...prev };
              delete updated.customTamilLabels;
              updated.tamilTerminologyPreset = 'brick_construction';
              return updated;
            });
            setShareSettings((prev) => {
              const updated = { ...prev };
              delete updated.customTamilLabels;
              updated.tamilTerminologyPreset = 'brick_construction';
              return updated;
            });
            setHasChanges(true);
          },
        },
      ]
    );
  }, []);

  const appaSettings: AppaEstimateBillSettings = useMemo(() => ({
    ...DEFAULT_APPA_ESTIMATE_BILL_SETTINGS,
    ...(template.appaBillSettings || {}),
  }), [template.appaBillSettings]);

  const effectiveAppaLogoUri = appaSettings.companyLogoUri || userProfile?.company?.logoUrl || userProfile?.photoURL || userProfile?.logoUrl || '';

  const updateAppaField = useCallback(<K extends keyof AppaEstimateBillSettings>(key: K, value: AppaEstimateBillSettings[K]) => {
    setTemplate((prev) => ({
      ...prev,
      appaBillSettings: {
        ...DEFAULT_APPA_ESTIMATE_BILL_SETTINGS,
        ...(prev.appaBillSettings || {}),
        [key]: value,
      },
    }));
    setHasChanges(true);
  }, []);

  const updateAppaColumnLabel = useCallback((colKey: keyof AppaEstimateBillSettings['columnLabels'], val: string) => {
    setTemplate((prev) => {
      const current = prev.appaBillSettings || DEFAULT_APPA_ESTIMATE_BILL_SETTINGS;
      return {
        ...prev,
        appaBillSettings: {
          ...current,
          columnLabels: {
            ...DEFAULT_APPA_ESTIMATE_BILL_SETTINGS.columnLabels,
            ...(current.columnLabels || {}),
            [colKey]: val,
          },
        },
      };
    });
    setHasChanges(true);
  }, []);

  const resetAppaSettings = useCallback(() => {
    Alert.alert(
      'Reset Appa Estimate Bill?',
      'Restore all Appa Estimate Bill settings to their original traditional defaults (பாரம்பரிய இயல்புநிலைக்கு மீட்டமைக்கவா)?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            setTemplate((prev) => ({
              ...prev,
              appaBillSettings: DEFAULT_APPA_ESTIMATE_BILL_SETTINGS,
            }));
            setHasChanges(true);
          },
        },
      ]
    );
  }, []);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const [updatedTpl, updatedShare] = await Promise.all([
        invoiceTemplateService.saveTemplate(template),
        shareSettingsService.saveSettingsSilent({
          ...shareSettings,
          upiId: shareSettings.upiId,
          isTamilLanguage: template.isTamilLanguage,
          isBilingual: template.isBilingual,
          showCustomerHonorificTamil: template.showCustomerHonorificTamil,
          tamilTerminologyPreset: template.tamilTerminologyPreset,
          customTamilLabels: template.customTamilLabels,
          termsAndConditions: template.termsAndConditions,
          thankYouNote: template.thankYouNote,
          watermarkEnabled: template.watermarkEnabled,
          watermarkText: template.watermarkText,
          signatureTitle: template.signatureTitle,
          paperSize: template.paperSize,
        }),
      ]);
      if (updatedTpl) {
        setTemplate(updatedTpl);
      }
      if (updatedShare) {
        setShareSettings(updatedShare);
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

  const resetTamilLabel = useCallback((fieldKey: keyof InvoiceLabels) => {
    setTemplate((prev) => {
      const nextCustom = { ...(prev.customTamilLabels || {}) };
      delete nextCustom[fieldKey];
      return { ...prev, customTamilLabels: nextCustom };
    });
    setHasChanges(true);
  }, []);

  const editorContextValue = useMemo(() => ({
    template,
    updateTamilLabel,
    resetTamilLabel,
  }), [template, updateTamilLabel, resetTamilLabel]);

  const phoneList: string[] = useMemo(() => {
    if (appaSettings.phoneNumbers && Array.isArray(appaSettings.phoneNumbers) && appaSettings.phoneNumbers.length > 0) {
      return appaSettings.phoneNumbers;
    }
    if (appaSettings.customPhones?.trim()) {
      return appaSettings.customPhones.split(/[•,]/).map((p) => p.trim()).filter(Boolean);
    }
    return ['99430 51509', '99430 51209'];
  }, [appaSettings.phoneNumbers, appaSettings.customPhones]);

  const handleUpdatePhone = useCallback((index: number, val: string) => {
    const current = (appaSettings.phoneNumbers && appaSettings.phoneNumbers.length > 0)
      ? [...appaSettings.phoneNumbers]
      : (appaSettings.customPhones?.trim()
          ? appaSettings.customPhones.split(/[•,]/).map((p) => p.trim()).filter(Boolean)
          : ['99430 51509', '99430 51209']);
    current[index] = val;
    setTemplate((prev) => ({
      ...prev,
      appaBillSettings: {
        ...DEFAULT_APPA_ESTIMATE_BILL_SETTINGS,
        ...(prev.appaBillSettings || {}),
        phoneNumbers: current,
        customPhones: current.filter(Boolean).join(' • '),
      },
    }));
    setHasChanges(true);
  }, [appaSettings.phoneNumbers, appaSettings.customPhones]);

  const handleAddPhone = useCallback(() => {
    const current = (appaSettings.phoneNumbers && appaSettings.phoneNumbers.length > 0)
      ? [...appaSettings.phoneNumbers]
      : (appaSettings.customPhones?.trim()
          ? appaSettings.customPhones.split(/[•,]/).map((p) => p.trim()).filter(Boolean)
          : ['99430 51509', '99430 51209']);
    current.push('');
    setTemplate((prev) => ({
      ...prev,
      appaBillSettings: {
        ...DEFAULT_APPA_ESTIMATE_BILL_SETTINGS,
        ...(prev.appaBillSettings || {}),
        phoneNumbers: current,
        customPhones: current.filter(Boolean).join(' • '),
      },
    }));
    setHasChanges(true);
  }, [appaSettings.phoneNumbers, appaSettings.customPhones]);

  const handleRemovePhone = useCallback((index: number) => {
    const current = (appaSettings.phoneNumbers && appaSettings.phoneNumbers.length > 0)
      ? [...appaSettings.phoneNumbers]
      : (appaSettings.customPhones?.trim()
          ? appaSettings.customPhones.split(/[•,]/).map((p) => p.trim()).filter(Boolean)
          : ['99430 51509', '99430 51209']);
    if (current.length <= 1) {
      current[0] = '';
    } else {
      current.splice(index, 1);
    }
    setTemplate((prev) => ({
      ...prev,
      appaBillSettings: {
        ...DEFAULT_APPA_ESTIMATE_BILL_SETTINGS,
        ...(prev.appaBillSettings || {}),
        phoneNumbers: current,
        customPhones: current.filter(Boolean).join(' • '),
      },
    }));
    setHasChanges(true);
  }, [appaSettings.phoneNumbers, appaSettings.customPhones]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg.primary }]}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
        <Text style={[styles.loadingText, { color: subTextColor }]}>Loading Invoice Settings...</Text>
      </View>
    );
  }

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
      <InvoiceEditorContext.Provider value={editorContextValue}>
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

        {/* Document Type Switcher: Standard Invoice vs Appa Estimate Bill */}
        <View style={[styles.docTypeSwitcherContainer, { backgroundColor: cardBg, borderBottomColor: borderColor }]}>
          <Pressable
            onPress={() => setDocType('standard')}
            style={[
              styles.docTypeTab,
              docType === 'standard' && [styles.docTypeTabActive, { backgroundColor: colors.accent.primary + '15', borderColor: colors.accent.primary }],
            ]}
          >
            <MaterialIcons
              name="receipt-long"
              size={20}
              color={docType === 'standard' ? colors.accent.primary : subTextColor}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.docTypeTabText,
                  { color: docType === 'standard' ? colors.accent.primary : textColor, fontWeight: docType === 'standard' ? '800' : '600' },
                ]}
              >
                Standard Invoice
              </Text>
              <Text style={{ fontSize: 10, color: subTextColor }}>விலைப்பட்டியல் & GST</Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => setDocType('appa_estimate')}
            style={[
              styles.docTypeTab,
              docType === 'appa_estimate' && [styles.docTypeTabActive, { backgroundColor: '#B91C1C15', borderColor: '#B91C1C' }],
            ]}
          >
            <MaterialIcons
              name="history-edu"
              size={20}
              color={docType === 'appa_estimate' ? '#B91C1C' : subTextColor}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.docTypeTabText,
                  { color: docType === 'appa_estimate' ? '#B91C1C' : textColor, fontWeight: docType === 'appa_estimate' ? '800' : '600' },
                ]}
              >
                Appa Estimate Bill
              </Text>
              <Text style={{ fontSize: 10, color: subTextColor }}>அப்பா எஸ்டிமேட் பில்</Text>
            </View>
          </Pressable>
        </View>

        {docType === 'standard' ? (
          <>
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
          <ScrollView
            style={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews={false}
          >
            {/* ────────── TAB 1: HEADER & BRANDING ────────── */}
            {activeTab === 'HEADER' && (
              <View style={styles.sectionContainer}>
                <SectionHeading text="LANGUAGE & LOCALIZATION" />
                <Card>
                  <ToggleRow
                    title="Tamil Version (தமிழ் பதிப்பு)"
                    subtitle="Render bills, invoice tables, charges & bank details in Tamil"
                    value={Boolean(template.isTamilLanguage)}
                    onToggle={(v) => {
                      updateField('isTamilLanguage', v);
                      setShareSettings((prev) => ({ ...prev, isTamilLanguage: v }));
                    }}
                    isLast={!template.isTamilLanguage}
                  />

                  {Boolean(template.isTamilLanguage) && (
                    <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: borderColor }}>
                      {/* Bilingual Mode Toggle */}
                      <ToggleRow
                        title="Bilingual Mode (இருமொழி ரசீது - English & தமிழ்)"
                        subtitle="Display headers and table columns in both English & Tamil (e.g., ITEM / பொருள்)"
                        value={Boolean(template.isBilingual)}
                        onToggle={(v) => {
                          updateField('isBilingual', v);
                          setShareSettings((prev) => ({ ...prev, isBilingual: v }));
                        }}
                      />

                      {/* Customer Honorific Toggle */}
                      <ToggleRow
                        title="Customer Honorific (பெயருக்கு பின் 'அவர்கள்' சேர்த்தல்)"
                        subtitle="Automatically attach 'அவர்கள்' suffix after customer name on bills (e.g. முருகன் அவர்கள்)"
                        value={Boolean(template.showCustomerHonorificTamil !== false)}
                        onToggle={(v) => {
                          updateField('showCustomerHonorificTamil', v);
                          setShareSettings((prev) => ({ ...prev, showCustomerHonorificTamil: v }));
                        }}
                      />

                      {/* Industry Terminology Presets */}
                      <View style={{ marginVertical: 12 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: textColor, marginBottom: 4 }}>
                          ⚡ Terminology Preset (துறை சார்ந்த தமிழ் வழக்கு)
                        </Text>
                        <Text style={{ fontSize: 11, color: subTextColor, marginBottom: 8 }}>
                          Select your industry style to automatically load the most suitable terminology:
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <Pressable
                            style={{
                              flex: 1,
                              padding: 10,
                              borderRadius: 10,
                              borderWidth: 1.5,
                              borderColor: (template.tamilTerminologyPreset || 'brick_construction') === 'brick_construction'
                                ? colors.accent.primary
                                : borderColor,
                              backgroundColor: (template.tamilTerminologyPreset || 'brick_construction') === 'brick_construction'
                                ? (isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.08)')
                                : (isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC'),
                            }}
                            onPress={() => applyTamilPreset('brick_construction')}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                              <Text style={{ fontSize: 14 }}>🧱</Text>
                              <Text style={{ fontSize: 12, fontWeight: '700', color: textColor }}>
                                செங்கல் & கட்டுமானம்
                              </Text>
                            </View>
                            <Text style={{ fontSize: 10, color: subTextColor, lineHeight: 14 }}>
                              வண்டி வாடகை, ஏற்றுக்கூலி, இறக்குக்கூலி, பழைய பாக்கி, மீதி பாக்கி
                            </Text>
                          </Pressable>

                          <Pressable
                            style={{
                              flex: 1,
                              padding: 10,
                              borderRadius: 10,
                              borderWidth: 1.5,
                              borderColor: template.tamilTerminologyPreset === 'standard'
                                ? colors.accent.primary
                                : borderColor,
                              backgroundColor: template.tamilTerminologyPreset === 'standard'
                                ? (isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.08)')
                                : (isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC'),
                            }}
                            onPress={() => applyTamilPreset('standard')}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                              <Text style={{ fontSize: 14 }}>🏢</Text>
                              <Text style={{ fontSize: 12, fontWeight: '700', color: textColor }}>
                                பொது வணிக முறை
                              </Text>
                            </View>
                            <Text style={{ fontSize: 10, color: subTextColor, lineHeight: 14 }}>
                              போக்குவரத்து கட்டணம், துணை மொத்தம், நிலுவை தொகை
                            </Text>
                          </Pressable>
                        </View>
                      </View>

                      {/* Customize Tamil Words Accordion */}
                      <Pressable
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingVertical: 10,
                          paddingHorizontal: 12,
                          backgroundColor: isDark ? 'rgba(59, 130, 246, 0.12)' : 'rgba(59, 130, 246, 0.08)',
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: isDark ? 'rgba(59, 130, 246, 0.3)' : 'rgba(59, 130, 246, 0.2)',
                          marginTop: 6,
                        }}
                        onPress={() => setShowTamilCustomizer((prev) => !prev)}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                          <MaterialIcons name="translate" size={18} color={colors.accent.primary} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: textColor }}>
                              Customize Tamil Words (சொற்களை திருத்து)
                            </Text>
                            <Text style={{ fontSize: 11, color: subTextColor }}>
                              {Object.keys(template.customTamilLabels || {}).length > 0
                                ? `${Object.keys(template.customTamilLabels || {}).length} words customized`
                                : 'Using preset terms (Tap to view or edit individual terms)'}
                            </Text>
                          </View>
                        </View>
                        <MaterialIcons
                          name={showTamilCustomizer ? 'expand-less' : 'expand-more'}
                          size={22}
                          color={colors.accent.primary}
                        />
                      </Pressable>

                      {showTamilCustomizer && (
                        <View style={{ marginTop: 14 }}>
                          <Text style={{ fontSize: 11, color: subTextColor, marginBottom: 12, lineHeight: 16 }}>
                            Customize any bill or receipt label below to match your regional terminology. Leaving a field blank or resetting will use the active preset default.
                          </Text>

                          {/* Category 1: Document Titles */}
                          <Text style={{ fontSize: 12, fontWeight: '800', color: colors.accent.primary, marginBottom: 8, marginTop: 4 }}>
                            🏷️ ஆவண தலைப்புகள் (Document & Invoice Titles)
                          </Text>
                          <TamilLabelField
                            label="Invoice Title (விலைப்பட்டியல் / ரசீது தலைப்பு)"
                            hint="Default: விலைப்பட்டியல்"
                            fieldKey="invoice"
                          />
                          <TamilLabelField
                            label="Tax Invoice Title (வரி ரசீது)"
                            hint="Default: வரி விலைப்பட்டியல்"
                            fieldKey="taxInvoice"
                          />
                          <TamilLabelField
                            label="Bill Title (பில்)"
                            hint="Default: பில்"
                            fieldKey="bill"
                          />
                          <TamilLabelField
                            label="Estimate Title (மதிப்பீடு)"
                            hint="Default: மதிப்பீடு"
                            fieldKey="estimate"
                          />
                          <TamilLabelField
                            label="Receipt Title (ரசீது)"
                            hint="Default: ரசீது"
                            fieldKey="receipt"
                          />

                          {/* Category 2: Date & Invoice Numbers */}
                          <Text style={{ fontSize: 12, fontWeight: '800', color: colors.accent.primary, marginBottom: 8, marginTop: 14 }}>
                            📅 தேதி & எண்கள் (Date, Number & Payment Mode)
                          </Text>
                          <TamilLabelField
                            label="Invoice No (ரசீது எண்)"
                            hint="Default: ரசீது எண்"
                            fieldKey="invoiceNo"
                          />
                          <TamilLabelField
                            label="Date (தேதி)"
                            hint="Default: தேதி"
                            fieldKey="invoiceDate"
                          />
                          <TamilLabelField
                            label="Due Date (கெடு தேதி)"
                            hint="Default: கெடு தேதி"
                            fieldKey="dueDate"
                          />
                          <TamilLabelField
                            label="Payment Mode (கட்டண முறை)"
                            hint="Default: செலுத்தும் முறை"
                            fieldKey="paymentMode"
                          />

                          {/* Category 3: Customer Details */}
                          <Text style={{ fontSize: 12, fontWeight: '800', color: colors.accent.primary, marginBottom: 8, marginTop: 14 }}>
                            👤 வாடிக்கையாளர் விவரங்கள் (Customer Details & Honorific)
                          </Text>
                          <TamilLabelField
                            label="Billed To (பெறுநர்)"
                            hint="Default: பெறுநர்"
                            fieldKey="billedTo"
                          />
                          <TamilLabelField
                            label="Customer Details (வாடிக்கையாளர் விவரம்)"
                            hint="Default: வாடிக்கையாளர் விவரம்"
                            fieldKey="customerDetails"
                          />
                          <TamilLabelField
                            label="Phone (தொலைபேசி)"
                            hint="Default: தொலைபேசி"
                            fieldKey="phone"
                          />
                          <TamilLabelField
                            label="Address (முகவரி)"
                            hint="Default: முகவரி"
                            fieldKey="address"
                          />
                          <TamilLabelField
                            label="GSTIN (GST எண்)"
                            hint="Default: GST எண்"
                            fieldKey="gstin"
                          />
                          <TamilLabelField
                            label="Honorific Suffix (மரியாதை சொல்)"
                            hint="Default: அவர்கள்"
                            fieldKey="avargal"
                          />

                          {/* Category 4: Table Columns */}
                          <Text style={{ fontSize: 12, fontWeight: '800', color: colors.accent.primary, marginBottom: 8, marginTop: 14 }}>
                            📋 அட்டவணை தலைப்புகள் (Table Columns)
                          </Text>
                          <TamilLabelField
                            label="Item / Product (பொருள்)"
                            hint="Default: பொருள்"
                            fieldKey="item"
                          />
                          <TamilLabelField
                            label="Quantity (அளவு / எண்ணிக்கை)"
                            hint="Default: அளவு"
                            fieldKey="qty"
                          />
                          <TamilLabelField
                            label="Rate / Price (விலை)"
                            hint="Default: விலை"
                            fieldKey="rate"
                          />
                          <TamilLabelField
                            label="Amount / Total (தொகை)"
                            hint="Default: மொத்தம்"
                            fieldKey="total"
                          />
                          <TamilLabelField
                            label="Items & Description (பொருட்கள் மற்றும் விவரம்)"
                            hint="Default: பொருள் மற்றும் விவரம்"
                            fieldKey="itemsAndDescription"
                          />

                          {/* Category 5: Charges & Calculations */}
                          <Text style={{ fontSize: 12, fontWeight: '800', color: colors.accent.primary, marginBottom: 8, marginTop: 14 }}>
                            💰 கட்டணம் & கணக்கீடுகள் (Charges, Dues & Calculations)
                          </Text>
                          <TamilLabelField
                            label="Subtotal (துணை மொத்தம் / பொருட்கள் தொகை)"
                            hint="Default: கூட்டுத்தொகை"
                            fieldKey="subtotal"
                          />
                          <TamilLabelField
                            label="Delivery / Freight (டெலிவரி / வண்டி வாடகை)"
                            hint="Default: வண்டி வாடகை"
                            fieldKey="deliveryCharge"
                          />
                          <TamilLabelField
                            label="Loading Charge (ஏற்று கூலி)"
                            hint="Default: ஏற்றுக்கூலி"
                            fieldKey="loadingCharge"
                          />
                          <TamilLabelField
                            label="Unloading Charge (இறக்கு கூலி)"
                            hint="Default: இறக்குக்கூலி"
                            fieldKey="unloadingCharge"
                          />
                          <TamilLabelField
                            label="Extra Charges (இதர கட்டணம் / செலவு)"
                            hint="Default: கூடுதல் கட்டணம்"
                            fieldKey="extraCharge"
                          />
                          <TamilLabelField
                            label="Tax / GST (வரி)"
                            hint="Default: வரி / GST"
                            fieldKey="taxGst"
                          />
                          <TamilLabelField
                            label="Discount (தள்ளுபடி)"
                            hint="Default: தள்ளுபடி"
                            fieldKey="discount"
                          />
                          <TamilLabelField
                            label="Current Bill Total (நடப்பு பில் தொகை)"
                            hint="Default: நடப்பு பில் தொகை"
                            fieldKey="currentBillTotal"
                          />
                          <TamilLabelField
                            label="Old Balance Due (பழைய பாக்கி)"
                            hint="Default: பழைய பாக்கி"
                            fieldKey="oldBalanceDue"
                          />
                          <TamilLabelField
                            label="Total Amount (மொத்த தொகை)"
                            hint="Default: மொத்த தொகை"
                            fieldKey="totalAmount"
                          />
                          <TamilLabelField
                            label="Paid Amount (செலுத்திய தொகை)"
                            hint="Default: செலுத்திய தொகை"
                            fieldKey="paidAmount"
                          />
                          <TamilLabelField
                            label="Balance Due (மீதி பாக்கி / நிலுவை)"
                            hint="Default: மீதி பாக்கி"
                            fieldKey="balanceDue"
                          />
                          <TamilLabelField
                            label="Total Balance Due (மொத்த பாக்கி)"
                            hint="Default: மொத்த பாக்கி"
                            fieldKey="totalBalanceDue"
                          />
                          <TamilLabelField
                            label="Grand Total incl Dues (மொத்த தொகை - பாக்கி சேர்த்து)"
                            hint="Default: மொத்த தொகை (பாக்கி சேர்த்து)"
                            fieldKey="grandTotalInclDues"
                          />

                          {/* Category 6: Bank Details */}
                          <Text style={{ fontSize: 12, fontWeight: '800', color: colors.accent.primary, marginBottom: 8, marginTop: 14 }}>
                            🏦 வங்கி விவரங்கள் (Bank & Payment Details)
                          </Text>
                          <TamilLabelField
                            label="Bank Details Heading (வங்கி கட்டண விவரங்கள்)"
                            hint="Default: வங்கி விவரங்கள்"
                            fieldKey="bankPaymentDetails"
                          />
                          <TamilLabelField
                            label="Bank Name (வங்கி)"
                            hint="Default: வங்கி"
                            fieldKey="bankName"
                          />
                          <TamilLabelField
                            label="Account No (கணக்கு எண்)"
                            hint="Default: கணக்கு எண்"
                            fieldKey="accountNo"
                          />
                          <TamilLabelField
                            label="IFSC Code (IFSC குறியீடு)"
                            hint="Default: IFSC குறியீடு"
                            fieldKey="ifscCode"
                          />
                          <TamilLabelField
                            label="Account Holder Name (கணக்கு பெயர்)"
                            hint="Default: கணக்கு பெயர்"
                            fieldKey="accountHolder"
                          />
                          <TamilLabelField
                            label="Scan To Pay (ஸ்கேன் செய்து செலுத்தவும்)"
                            hint="Default: ஸ்கேன் செய்து செலுத்தவும்"
                            fieldKey="scanToPay"
                          />

                          {/* Category 7: Status, Notes & Footer */}
                          <Text style={{ fontSize: 12, fontWeight: '800', color: colors.accent.primary, marginBottom: 8, marginTop: 14 }}>
                            🚦 நிலை, அடிக்குறிப்பு & கையொப்பம் (Status, Notes & Signatory)
                          </Text>
                          <TamilLabelField
                            label="Paid Status (செலுத்தப்பட்டது)"
                            hint="Default: செலுத்தப்பட்டது"
                            fieldKey="statusPaid"
                          />
                          <TamilLabelField
                            label="Partially Paid Status (பகுதி செலுத்தப்பட்டது)"
                            hint="Default: பகுதி செலுத்தப்பட்டது"
                            fieldKey="statusPartiallyPaid"
                          />
                          <TamilLabelField
                            label="Pending Status (நிலுவை)"
                            hint="Default: நிலுவை"
                            fieldKey="statusPending"
                          />
                          <TamilLabelField
                            label="Overdue Status (கெடு முடிந்தது)"
                            hint="Default: கெடு முடிந்தது"
                            fieldKey="statusOverdue"
                          />
                          <TamilLabelField
                            label="Notes Heading (குறிப்பு)"
                            hint="Default: குறிப்பு"
                            fieldKey="notes"
                          />
                          <TamilLabelField
                            label="Terms & Conditions (விதிமுறைகள் மற்றும் நிபந்தனைகள்)"
                            hint="Default: விதிமுறைகள் & நிபந்தனைகள்"
                            fieldKey="termsAndConditions"
                          />
                          <TamilLabelField
                            label="Authorized Signatory (அங்கீகரிக்கப்பட்ட கையொப்பம்)"
                            hint="Default: அங்கீகரிக்கப்பட்ட கையொப்பம்"
                            fieldKey="authorizedSignatory"
                          />
                          <TamilLabelField
                            label="Thank You Note (நன்றி குறிப்பு)"
                            hint="Default: தங்களின் மேலான ஆதரவிற்கு மிக்க நன்றி! 🙏"
                            fieldKey="thankYouNote"
                          />

                          {/* Reset button */}
                          <Pressable
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 6,
                              paddingVertical: 10,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: borderColor,
                              backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9',
                              marginTop: 10,
                            }}
                            onPress={resetTamilLabels}
                          >
                            <MaterialIcons name="restore" size={16} color={subTextColor} />
                            <Text style={{ fontSize: 12, fontWeight: '600', color: subTextColor }}>
                              Reset to Default Terms (இயல்புநிலைக்கு மீட்டமை)
                            </Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  )}
                </Card>

                <SectionHeading text="AUSPICIOUS INVOCATION (மங்கல தலைப்பு)" marginTop={20} />
                <Card>
                  <ToggleRow
                    title="Divine Invocation / Header Blessing"
                    subtitle="Display a sacred or motivational blessing at the very top of the invoice"
                    value={Boolean(template.showInvocation)}
                    onToggle={(v) => updateField('showInvocation', v)}
                    isLast={!template.showInvocation}
                  />
                  {Boolean(template.showInvocation) && (
                    <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: borderColor }}>
                      <Text style={[styles.inputLabel, { color: subTextColor }]}>Invocation Text</Text>
                      <TextInput
                        value={template.invocationText || ''}
                        onChangeText={(val) => updateField('invocationText', val)}
                        placeholder="e.g. ஸ்ரீ சொக்கநாச்சி அம்மன் துணை"
                        placeholderTextColor={subTextColor}
                        style={[styles.input, { backgroundColor: colors.bg.primary, color: textColor, borderColor }]}
                      />
                      <View style={styles.quickTags}>
                        {[
                          'ஸ்ரீ சொக்கநாச்சி அம்மன் துணை',
                          'ஓம் முருகா துணை',
                          'சுப லாபம்',
                          'Quality & Trust',
                          'In the Name of God',
                        ].map((t) => (
                          <Pressable
                            key={t}
                            onPress={() => updateField('invocationText', t)}
                            style={[
                              styles.quickTag,
                              {
                                backgroundColor: template.invocationText === t ? colors.accent.primary : colors.bg.primary,
                                borderColor: template.invocationText === t ? colors.accent.primary : borderColor,
                              },
                            ]}
                          >
                            <Text style={[styles.quickTagText, { color: template.invocationText === t ? '#FFF' : textColor }]}>{t}</Text>
                          </Pressable>
                        ))}
                      </View>

                      <View style={{ marginTop: 12 }}>
                        <Text style={[styles.inputLabel, { color: subTextColor }]}>Invocation Banner Color</Text>
                        <ColorPicker
                          colors={['#B91C1C', '#D97706', '#2563EB', '#059669', '#7C3AED', '#0F172A']}
                          selected={template.invocationColor || '#B91C1C'}
                          onSelect={(c) => updateField('invocationColor', c)}
                        />
                      </View>
                    </View>
                  )}
                </Card>

                <SectionHeading text="HEADER LAYOUT" marginTop={20} />
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

                <SectionHeading text="BUSINESS SLOGAN & LOGO SIZE" marginTop={20} />
                <Card>
                  <ToggleRow
                    title="Company Slogan / Tagline"
                    subtitle="Show subtitle under business name"
                    value={Boolean(template.showCompanyTagline)}
                    onToggle={(v) => updateField('showCompanyTagline', v)}
                  />
                  {Boolean(template.showCompanyTagline) && (
                    <View style={{ marginTop: 10, marginBottom: 12 }}>
                      <Text style={[styles.inputLabel, { color: subTextColor }]}>Slogan / Tagline Text</Text>
                      <TextInput
                        value={template.companyTagline || ''}
                        onChangeText={(val) => updateField('companyTagline', val)}
                        placeholder="e.g. Quality Red Bricks & Masonry"
                        placeholderTextColor={subTextColor}
                        style={[styles.input, { backgroundColor: colors.bg.primary, color: textColor, borderColor }]}
                      />
                      <View style={styles.quickTags}>
                        {[
                          'Quality Red Bricks & Masonry',
                          'Building Trust Since 1998',
                          'Direct Manufacturer & Wholesale Supplier',
                        ].map((t) => (
                          <Pressable
                            key={t}
                            onPress={() => updateField('companyTagline', t)}
                            style={[
                              styles.quickTag,
                              {
                                backgroundColor: template.companyTagline === t ? colors.accent.primary : colors.bg.primary,
                                borderColor: template.companyTagline === t ? colors.accent.primary : borderColor,
                              },
                            ]}
                          >
                            <Text style={[styles.quickTagText, { color: template.companyTagline === t ? '#FFF' : textColor }]}>{t}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  )}

                  <View style={{ marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: borderColor }}>
                    <Text style={[styles.inputLabel, { color: subTextColor }]}>Logo & Avatar Display Size</Text>
                    <ChipSelector<'small' | 'medium' | 'large'>
                      options={['small', 'medium', 'large']}
                      selected={template.logoSize || 'medium'}
                      onSelect={(v) => updateField('logoSize', v)}
                      renderLabel={(v) => v === 'small' ? 'Small (38px)' : v === 'large' ? 'Large (80px)' : 'Medium (58px)'}
                    />
                  </View>
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
                  {/* Default Notes */}
                  <ToggleRow
                    title="Default Notes"
                    subtitle="Show transaction notes or delivery instructions"
                    value={template.showNotes}
                    onToggle={(v) => updateField('showNotes', v)}
                  />
                  {template.showNotes && (
                    <View style={{ marginTop: 8, marginBottom: 12, padding: 12, backgroundColor: colors.bg.primary, borderRadius: 12, borderWidth: 1, borderColor }}>
                      <Text style={[styles.inputLabel, { color: subTextColor }]}>Default Invoice Notes</Text>
                      <TextInput
                        value={template.defaultNotes || ''}
                        onChangeText={(val) => updateField('defaultNotes', val)}
                        placeholder="e.g. Goods once dispatched cannot be returned or redirected."
                        placeholderTextColor={subTextColor}
                        multiline
                        numberOfLines={3}
                        style={[styles.input, { backgroundColor: cardBg, color: textColor, borderColor, height: 68, textAlignVertical: 'top', paddingTop: 8 }]}
                      />
                      <View style={styles.quickTags}>
                        {[
                          'Goods once dispatched cannot be returned.',
                          'Breakage during transport at buyer\'s risk.',
                          'Site unloading must be completed within 2 hours.',
                        ].map((t) => (
                          <Pressable
                            key={t}
                            onPress={() => updateField('defaultNotes', t)}
                            style={[
                              styles.quickTag,
                              {
                                backgroundColor: template.defaultNotes === t ? colors.accent.primary : cardBg,
                                borderColor: template.defaultNotes === t ? colors.accent.primary : borderColor,
                              },
                            ]}
                          >
                            <Text style={[styles.quickTagText, { color: template.defaultNotes === t ? '#FFF' : textColor, fontSize: 10 }]}>{t}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* Terms & Conditions */}
                  <ToggleRow
                    title="Terms & Conditions"
                    subtitle="Show terms & conditions block on invoice"
                    value={template.showTerms}
                    onToggle={(v) => updateField('showTerms', v)}
                  />
                  {template.showTerms && (
                    <View style={{ marginTop: 8, marginBottom: 12, padding: 12, backgroundColor: colors.bg.primary, borderRadius: 12, borderWidth: 1, borderColor }}>
                      <Text style={[styles.inputLabel, { color: subTextColor }]}>Terms & Conditions Text</Text>
                      <TextInput
                        value={template.termsAndConditions || ''}
                        onChangeText={(val) => updateField('termsAndConditions', val)}
                        placeholder="Enter invoice terms & conditions..."
                        placeholderTextColor={subTextColor}
                        multiline
                        numberOfLines={4}
                        style={[styles.input, { backgroundColor: cardBg, color: textColor, borderColor, height: 85, textAlignVertical: 'top', paddingTop: 8 }]}
                      />
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        <Pressable
                          onPress={() => updateField('termsAndConditions', '1. Goods once sold will not be taken back.\n2. Payment due within 15 days from date of invoice.\n3. Subject to local jurisdiction.')}
                          style={[styles.quickTag, { backgroundColor: cardBg, borderColor }]}
                        >
                          <Text style={[styles.quickTagText, { color: textColor }]}>⚡ Standard Commerce</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => updateField('termsAndConditions', '1. செங்கல் இறக்கும் போது வாடிக்கையாளர் சரிபார்த்துக் கொள்ள வேண்டும்.\n2. வாகனம் வந்த 2 மணி நேரத்திற்குள் இறக்கப்பட வேண்டும்.\n3. நிலுவைத் தொகை உடனே செலுத்தப்பட வேண்டும்.')}
                          style={[styles.quickTag, { backgroundColor: cardBg, borderColor }]}
                        >
                          <Text style={[styles.quickTagText, { color: textColor }]}>⚡ Brick & Construction</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => updateField('termsAndConditions', '1. Payment due upon receipt.\n2. 18% annual interest charged on overdue balances past 15 days.\n3. Disputes subject to judicial jurisdiction.')}
                          style={[styles.quickTag, { backgroundColor: cardBg, borderColor }]}
                        >
                          <Text style={[styles.quickTagText, { color: textColor }]}>⚡ Overdue Penalty</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}

                  {/* Signature & Rubber Stamp */}
                  <ToggleRow
                    title="Authorized Signature"
                    subtitle="Show signature block and signatory details"
                    value={template.showSignature}
                    onToggle={(v) => updateField('showSignature', v)}
                  />
                  {template.showSignature && (
                    <View style={{ marginTop: 8, marginBottom: 12, padding: 12, backgroundColor: colors.bg.primary, borderRadius: 12, borderWidth: 1, borderColor }}>
                      <Text style={[styles.inputLabel, { color: subTextColor }]}>Signatory Designation / Title</Text>
                      <TextInput
                        value={template.signatureTitle || ''}
                        onChangeText={(val) => updateField('signatureTitle', val)}
                        placeholder="e.g. Authorized Signatory / மேலாளர்"
                        placeholderTextColor={subTextColor}
                        style={[styles.input, { backgroundColor: cardBg, color: textColor, borderColor, height: 40, marginBottom: 10 }]}
                      />
                      <Text style={[styles.inputLabel, { color: subTextColor }]}>Signatory Person Name (Optional)</Text>
                      <TextInput
                        value={template.signatoryName || ''}
                        onChangeText={(val) => updateField('signatoryName', val)}
                        placeholder="e.g. Managing Partner / Proprietor"
                        placeholderTextColor={subTextColor}
                        style={[styles.input, { backgroundColor: cardBg, color: textColor, borderColor, height: 40, marginBottom: 12 }]}
                      />

                      <ToggleRow
                        title="Rubber Stamp / Seal (முத்திரை)"
                        subtitle="Show circular approval stamp in signature box"
                        value={Boolean(template.showRubberSeal)}
                        onToggle={(v) => updateField('showRubberSeal', v)}
                        isLast={!template.showRubberSeal}
                      />
                      {Boolean(template.showRubberSeal) && (
                        <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: borderColor }}>
                          <Text style={[styles.inputLabel, { color: subTextColor }]}>Stamp Text</Text>
                          <TextInput
                            value={template.rubberSealText || ''}
                            onChangeText={(val) => updateField('rubberSealText', val)}
                            placeholder="e.g. ★ SEAL / முத்திரை ★"
                            placeholderTextColor={subTextColor}
                            style={[styles.input, { backgroundColor: cardBg, color: textColor, borderColor, height: 40 }]}
                          />
                          <View style={styles.quickTags}>
                            {['★ SEAL / முத்திரை ★', '★ VERIFIED & APPROVED ★', '★ FOR BUSINESS CORP ★'].map((t) => (
                              <Pressable
                                key={t}
                                onPress={() => updateField('rubberSealText', t)}
                                style={[
                                  styles.quickTag,
                                  {
                                    backgroundColor: template.rubberSealText === t ? colors.accent.primary : cardBg,
                                    borderColor: template.rubberSealText === t ? colors.accent.primary : borderColor,
                                  },
                                ]}
                              >
                                <Text style={[styles.quickTagText, { color: template.rubberSealText === t ? '#FFF' : textColor, fontSize: 10 }]}>{t}</Text>
                              </Pressable>
                            ))}
                          </View>
                        </View>
                      )}
                    </View>
                  )}

                  {/* QR Code */}
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

                  {/* Thank You Note */}
                  <ToggleRow
                    title="Thank You Note"
                    subtitle="Show footer thank you message"
                    value={template.showThankYouNote}
                    onToggle={(v) => updateField('showThankYouNote', v)}
                  />
                  {template.showThankYouNote && (
                    <View style={{ marginTop: 8, marginBottom: 12, padding: 12, backgroundColor: colors.bg.primary, borderRadius: 12, borderWidth: 1, borderColor }}>
                      <Text style={[styles.inputLabel, { color: subTextColor }]}>Thank You Note Text</Text>
                      <TextInput
                        value={template.thankYouNote || ''}
                        onChangeText={(val) => updateField('thankYouNote', val)}
                        placeholder="e.g. Thank you for your business! 🙏"
                        placeholderTextColor={subTextColor}
                        style={[styles.input, { backgroundColor: cardBg, color: textColor, borderColor, height: 42 }]}
                      />
                      <View style={styles.quickTags}>
                        {[
                          'Thank you for your business! 🙏',
                          'தங்களின் மேலான ஆதரவிற்கு மிக்க நன்றி! 🙏',
                          'We appreciate your prompt payment! Have a great day.',
                        ].map((t) => (
                          <Pressable
                            key={t}
                            onPress={() => updateField('thankYouNote', t)}
                            style={[
                              styles.quickTag,
                              {
                                backgroundColor: template.thankYouNote === t ? colors.accent.primary : cardBg,
                                borderColor: template.thankYouNote === t ? colors.accent.primary : borderColor,
                              },
                            ]}
                          >
                            <Text style={[styles.quickTagText, { color: template.thankYouNote === t ? '#FFF' : textColor, fontSize: 10.5 }]}>{t}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* Footer Branding */}
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

                {/* Watermark Section */}
                <SectionHeading text="WATERMARK" marginTop={20} />
                <Card>
                  <ToggleRow
                    title="Invoice Watermark"
                    subtitle="Display faint diagonal watermark across invoice background"
                    value={Boolean(template.watermarkEnabled)}
                    onToggle={(v) => updateField('watermarkEnabled', v)}
                    isLast={!template.watermarkEnabled}
                  />
                  {Boolean(template.watermarkEnabled) && (
                    <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: borderColor }}>
                      <Text style={[styles.inputLabel, { color: subTextColor }]}>Watermark Text</Text>
                      <TextInput
                        value={template.watermarkText || ''}
                        onChangeText={(val) => updateField('watermarkText', val.toUpperCase())}
                        placeholder="e.g. ORIGINAL, PAID, ESTIMATE, DUPLICATE"
                        placeholderTextColor={subTextColor}
                        autoCapitalize="characters"
                        style={[styles.input, { backgroundColor: colors.bg.primary, color: textColor, borderColor }]}
                      />
                      <View style={styles.quickTags}>
                        {['PAID', 'ESTIMATE', 'ORIGINAL', 'DUPLICATE', 'CONFIDENTIAL', 'SAMPLE'].map((t) => (
                          <Pressable
                            key={t}
                            onPress={() => updateField('watermarkText', t)}
                            style={[
                              styles.quickTag,
                              {
                                backgroundColor: template.watermarkText === t ? colors.accent.primary : colors.bg.primary,
                                borderColor: template.watermarkText === t ? colors.accent.primary : borderColor,
                              },
                            ]}
                          >
                            <Text style={[styles.quickTagText, { color: template.watermarkText === t ? '#FFF' : textColor }]}>{t}</Text>
                          </Pressable>
                        ))}
                      </View>

                      <View style={{ marginTop: 12 }}>
                        <Text style={[styles.inputLabel, { color: subTextColor }]}>Watermark Intensity / Opacity</Text>
                        <View style={styles.chipRow}>
                          {[
                            { label: 'Faint (6%)', val: 0.06 },
                            { label: 'Subtle (12%)', val: 0.12 },
                            { label: 'Normal (18%)', val: 0.18 },
                            { label: 'Bold (25%)', val: 0.25 },
                          ].map((op) => {
                            const isSel = (template.watermarkOpacity !== undefined ? template.watermarkOpacity : 0.12) === op.val;
                            return (
                              <Pressable
                                key={op.label}
                                onPress={() => updateField('watermarkOpacity', op.val)}
                                style={[
                                  styles.chip,
                                  {
                                    backgroundColor: isSel ? colors.accent.primary : colors.bg.primary,
                                    borderColor: isSel ? colors.accent.primary : borderColor,
                                  },
                                ]}
                              >
                                <Text style={[styles.chipText, { color: isSel ? '#FFF' : textColor, fontSize: 11 }]}>{op.label}</Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
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
                <SectionHeading text="TABLE STYLE & DENSITY" />
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

                  <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: borderColor }}>
                    <Text style={[styles.inputLabel, { color: subTextColor }]}>Row Density & Spacing</Text>
                    <ChipSelector<TableDensity>
                      options={['compact', 'normal', 'relaxed']}
                      selected={template.tableDensity || 'normal'}
                      onSelect={(v) => updateField('tableDensity', v)}
                      renderLabel={(v) => v === 'compact' ? 'Compact (6px)' : v === 'relaxed' ? 'Relaxed (14px)' : 'Standard (10px)'}
                    />
                  </View>
                </Card>

                <SectionHeading text="TABLE COLUMNS" marginTop={20} />
                <Card>
                  <ToggleRow title="Row Index (#)" subtitle="Show item number column" value={template.showItemIndex} onToggle={(v) => updateField('showItemIndex', v)} />
                  <ToggleRow title="Unit Column" subtitle="Show unit alongside quantity (pcs, kg, etc.)" value={template.showItemUnit} onToggle={(v) => updateField('showItemUnit', v)} />
                  <ToggleRow title="Rate Column" subtitle="Show per-unit price column" value={template.showItemRate} onToggle={(v) => updateField('showItemRate', v)} isLast />
                </Card>

                <SectionHeading text="CUSTOM COLUMN HEADINGS" marginTop={20} />
                <Card>
                  <Text style={[styles.cardTitle, { color: textColor }]}>Rename Table Columns</Text>
                  <Text style={[styles.cardDesc, { color: subTextColor }]}>
                    Customize the header text displayed for each column in the items table.
                  </Text>

                  <View style={{ gap: 10 }}>
                    <View>
                      <Text style={[styles.inputLabel, { color: subTextColor }]}># / S.No Column Label</Text>
                      <TextInput
                        value={template.customColumnLabels?.index || ''}
                        onChangeText={(val) => updateColumnLabel('index', val)}
                        placeholder="Default: # or எண்"
                        placeholderTextColor={subTextColor}
                        style={[styles.input, { backgroundColor: colors.bg.primary, color: textColor, borderColor, height: 40 }]}
                      />
                    </View>

                    <View>
                      <Text style={[styles.inputLabel, { color: subTextColor }]}>Item & Description Column Label</Text>
                      <TextInput
                        value={template.customColumnLabels?.item || ''}
                        onChangeText={(val) => updateColumnLabel('item', val)}
                        placeholder="Default: Item & Description or பொருள்"
                        placeholderTextColor={subTextColor}
                        style={[styles.input, { backgroundColor: colors.bg.primary, color: textColor, borderColor, height: 40 }]}
                      />
                    </View>

                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.inputLabel, { color: subTextColor }]}>Quantity Column Label</Text>
                        <TextInput
                          value={template.customColumnLabels?.qty || ''}
                          onChangeText={(val) => updateColumnLabel('qty', val)}
                          placeholder="Default: Qty or அளவு"
                          placeholderTextColor={subTextColor}
                          style={[styles.input, { backgroundColor: colors.bg.primary, color: textColor, borderColor, height: 40 }]}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.inputLabel, { color: subTextColor }]}>Unit Rate Column Label</Text>
                        <TextInput
                          value={template.customColumnLabels?.rate || ''}
                          onChangeText={(val) => updateColumnLabel('rate', val)}
                          placeholder="Default: Rate or விலை"
                          placeholderTextColor={subTextColor}
                          style={[styles.input, { backgroundColor: colors.bg.primary, color: textColor, borderColor, height: 40 }]}
                        />
                      </View>
                    </View>

                    <View>
                      <Text style={[styles.inputLabel, { color: subTextColor }]}>Amount / Total Column Label</Text>
                      <TextInput
                        value={template.customColumnLabels?.amount || ''}
                        onChangeText={(val) => updateColumnLabel('amount', val)}
                        placeholder="Default: Amount or மொத்தம்"
                        placeholderTextColor={subTextColor}
                        style={[styles.input, { backgroundColor: colors.bg.primary, color: textColor, borderColor, height: 40 }]}
                      />
                    </View>

                    {template.customColumnLabels && Object.keys(template.customColumnLabels).length > 0 && (
                      <Pressable
                        onPress={() => {
                          setTemplate((prev) => {
                            const updated = { ...prev };
                            delete updated.customColumnLabels;
                            return updated;
                          });
                          setHasChanges(true);
                        }}
                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 4, paddingVertical: 8 }}
                      >
                        <MaterialIcons name="restore" size={16} color={colors.accent.primary} />
                        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.accent.primary }}>
                          Reset Column Headings to Default
                        </Text>
                      </Pressable>
                    )}
                  </View>
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
                <SectionHeading text="PAPER SIZE & MARGINS" />
                <Card>
                  <Text style={[styles.cardTitle, { color: textColor }]}>Page Format</Text>
                  <Text style={[styles.cardDesc, { color: subTextColor }]}>
                    Choose the target paper size for PDF downloads and printing.
                  </Text>
                  <ChipSelector<'A4' | 'LETTER' | 'THERMAL_80MM'>
                    options={['A4', 'LETTER', 'THERMAL_80MM']}
                    selected={template.paperSize || 'A4'}
                    onSelect={(v) => updateField('paperSize', v)}
                    renderLabel={(v) => v === 'THERMAL_80MM' ? 'Thermal 80mm' : v}
                  />

                  <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: borderColor }}>
                    <Text style={[styles.inputLabel, { color: subTextColor }]}>Page Margins</Text>
                    <ChipSelector<PageMargin>
                      options={['compact', 'normal', 'wide']}
                      selected={template.pageMargin || 'normal'}
                      onSelect={(v) => updateField('pageMargin', v)}
                      renderLabel={(v) => v === 'compact' ? 'Compact (10mm)' : v === 'wide' ? 'Generous (25mm)' : 'Standard (20mm)'}
                    />
                  </View>
                </Card>

                <SectionHeading text="CURRENCY & NUMBER FORMATTING" marginTop={20} />
                <Card>
                  <Text style={[styles.cardTitle, { color: textColor }]}>Currency Symbol</Text>
                  <Text style={[styles.cardDesc, { color: subTextColor }]}>
                    Symbol prepended to monetary amounts across the invoice.
                  </Text>
                  <View style={styles.chipRow}>
                    {['₹', 'Rs.', 'INR', '$', 'None'].map((sym) => {
                      const isSel = (template.currencySymbol ?? '₹') === sym;
                      return (
                        <Pressable
                          key={sym}
                          onPress={() => updateField('currencySymbol', sym)}
                          style={[
                            styles.chip,
                            {
                              backgroundColor: isSel ? colors.accent.primary : colors.bg.primary,
                              borderColor: isSel ? colors.accent.primary : borderColor,
                            },
                          ]}
                        >
                          <Text style={[styles.chipText, { color: isSel ? '#FFF' : textColor, fontWeight: isSel ? '700' : '500' }]}>
                            {sym}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: borderColor }}>
                    <Text style={[styles.inputLabel, { color: subTextColor }]}>Decimal Places</Text>
                    <View style={styles.chipRow}>
                      {[
                        { label: '2 Decimals (e.g. ₹1,250.00)', val: 2 },
                        { label: 'No Decimals (e.g. ₹1,250)', val: 0 },
                      ].map((dp) => {
                        const isSel = (template.decimalPlaces ?? 2) === dp.val;
                        return (
                          <Pressable
                            key={dp.val}
                            onPress={() => updateField('decimalPlaces', dp.val)}
                            style={[
                              styles.chip,
                              {
                                backgroundColor: isSel ? colors.accent.primary : colors.bg.primary,
                                borderColor: isSel ? colors.accent.primary : borderColor,
                              },
                            ]}
                          >
                            <Text style={[styles.chipText, { color: isSel ? '#FFF' : textColor, fontWeight: isSel ? '700' : '500' }]}>
                              {dp.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </Card>

                <SectionHeading text="TYPOGRAPHY" marginTop={20} />
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
                    options={['solid', 'dashed', 'double', 'none']}
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
      </>
    ) : (
      /* ═══════════════════════ APPA ESTIMATE BILL DEDICATED VIEW ═══════════════════════ */
      <ScrollView
        style={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews={false}
      >
        <View style={styles.sectionContainer}>
          {/* Banner / Info Card */}
          <View
            style={{
              backgroundColor: '#B91C1C10',
              borderRadius: 12,
              borderWidth: 1,
              borderColor: '#B91C1C30',
              padding: 12,
              marginBottom: 16,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <MaterialIcons name="auto-stories" size={24} color="#B91C1C" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#B91C1C' }}>
                Appa Estimate Bill Settings (அப்பா எஸ்டிமேட் அமைப்புகள்)
              </Text>
              <Text style={{ fontSize: 11, color: textColor, marginTop: 2 }}>
                Customize divine invocation, branding, contact numbers, 6-column headings, and bill theme for account statements.
              </Text>
            </View>
            <Pressable
              onPress={resetAppaSettings}
              style={{
                paddingHorizontal: 8,
                paddingVertical: 5,
                borderRadius: 8,
                backgroundColor: '#EF444418',
              }}
              hitSlop={8}
            >
              <MaterialIcons name="restart-alt" size={16} color="#EF4444" />
            </Pressable>
          </View>

          {/* 1. DIVINE INVOCATION (கடவுள் வாழ்த்து) */}
          <SectionHeading text="1. DIVINE INVOCATION (கடவுள் வாழ்த்து)" />
          <Card>
            <Text style={[styles.inputLabel, { color: subTextColor }]}>
              Invocation Heading (மங்கள வாழ்த்து வாசகம்)
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bg.primary, borderColor, color: textColor }]}
              value={appaSettings.invocationText}
              onChangeText={(val) => updateAppaField('invocationText', val)}
              placeholder="|| ஸ்ரீ சொக்கநாச்சி அம்மன் துணை ||"
              placeholderTextColor={subTextColor}
            />

            <Text style={[styles.inputLabel, { color: subTextColor, marginTop: 12 }]}>
              Quick Presets (தேர்ந்தெடுக்கவும்):
            </Text>
            <View style={styles.quickTags}>
              {[
                '|| ஸ்ரீ சொக்கநாச்சி அம்மன் துணை ||',
                '|| ஸ்ரீ விநாயகர் துணை ||',
                '|| ஸ்ரீ முருகன் துணை ||',
                '|| ஓம் நமசிவாய ||',
                '|| ஸ்ரீ கருப்பண்ணசாமி துணை ||',
              ].map((preset) => (
                <Pressable
                  key={preset}
                  onPress={() => updateAppaField('invocationText', preset)}
                  style={[
                    styles.quickTag,
                    {
                      backgroundColor: appaSettings.invocationText === preset ? '#B91C1C20' : colors.bg.primary,
                      borderColor: appaSettings.invocationText === preset ? '#B91C1C' : borderColor,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.quickTagText,
                      { color: appaSettings.invocationText === preset ? '#B91C1C' : textColor },
                    ]}
                  >
                    {preset}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.inputLabel, { color: subTextColor, marginTop: 14 }]}>
              Invocation Text Color (எழுத்து வண்ணம்)
            </Text>
            <ColorPicker
              colors={['#B91C1C', '#881337', '#B45309', '#1E3A8A', '#064E3B', '#0F172A']}
              selected={appaSettings.invocationColor || '#B91C1C'}
              onSelect={(c) => updateAppaField('invocationColor', c)}
            />

            <FontSizeController
              label="Divine Invocation Size (வாழ்த்து எழுத்து அளவு)"
              value={appaSettings.invocationFontSize || 14}
              min={10}
              max={26}
              presets={[12, 14, 16, 18, 20, 22]}
              onChange={(sz) => updateAppaField('invocationFontSize', sz)}
              accentColor={appaSettings.invocationColor || '#B91C1C'}
            />
          </Card>

          {/* 2. BUSINESS BRANDING, ADDRESS & PHONES */}
          <SectionHeading text="2. BUSINESS BRANDING, ADDRESS & PHONES (நிறுவனம், முகவரி & தொலைபேசி)" marginTop={16} />
          <Card>
            {/* Company Logo in Header */}
            <ToggleRow
              title="Company Logo (நிறுவன லோகோ)"
              subtitle="Show business logo at top-left corner of the bill"
              value={Boolean(appaSettings.showCompanyLogo !== false)}
              onToggle={(v) => updateAppaField('showCompanyLogo', v)}
            />

            {appaSettings.showCompanyLogo !== false && (
              <View style={{ marginTop: 10, marginBottom: 14, padding: 12, borderRadius: 10, backgroundColor: isDark ? '#1E293B30' : '#F8FAFC', borderWidth: 1, borderColor }}>
                <Text style={[styles.inputLabel, { color: subTextColor, marginBottom: 8 }]}>
                  Logo Preview & Upload (லோகோ முன்னோட்டம் & பதிவேற்றம்)
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  {effectiveAppaLogoUri ? (
                    <View style={{ width: 68, height: 68, borderRadius: 8, borderWidth: 1, borderColor, backgroundColor: colors.bg.primary, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                      <Image source={{ uri: effectiveAppaLogoUri }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
                    </View>
                  ) : (
                    <View style={{ width: 68, height: 68, borderRadius: 8, borderWidth: 1.5, borderStyle: 'dashed', borderColor, alignItems: 'center', justifyContent: 'center' }}>
                      <MaterialIcons name="image" size={28} color={subTextColor} />
                      <Text style={{ fontSize: 9, color: subTextColor, marginTop: 2 }}>No Logo</Text>
                    </View>
                  )}
                  <View style={{ flex: 1, gap: 6 }}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <Pressable
                        onPress={handlePickAppaLogoFromGallery}
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, backgroundColor: colors.accent.primary }}
                      >
                        <MaterialIcons name="photo-library" size={16} color="#FFF" />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFF' }}>Gallery</Text>
                      </Pressable>
                      <Pressable
                        onPress={handlePickAppaLogoFromCamera}
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, backgroundColor: isDark ? '#334155' : '#E2E8F0' }}
                      >
                        <MaterialIcons name="photo-camera" size={16} color={textColor} />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: textColor }}>Camera</Text>
                      </Pressable>
                    </View>
                    {appaSettings.companyLogoUri ? (
                      <Pressable
                        onPress={() => updateAppaField('companyLogoUri', '')}
                        style={{ paddingVertical: 4, alignItems: 'center' }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#EF4444' }}>
                          Reset to Profile Logo
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </View>
            )}

            <Text style={[styles.inputLabel, { color: subTextColor }]}>
              Company Name Override (நிறுவனப் பெயர்)
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bg.primary, borderColor, color: textColor }]}
              value={appaSettings.customCompanyName || ''}
              onChangeText={(val) => updateAppaField('customCompanyName', val)}
              placeholder="Default: அம்மன் ஹாலோ பிரிக்ஸ்"
              placeholderTextColor={subTextColor}
            />

            <Text style={[styles.inputLabel, { color: subTextColor, marginTop: 10 }]}>
              Company Name Color (பெயர் எழுத்து வண்ணம்)
            </Text>
            <ColorPicker
              colors={['#0F172A', '#1E3A8A', '#B91C1C', '#064E3B', '#451A03', '#4C1D95', '#B45309']}
              selected={appaSettings.companyNameColor || '#0F172A'}
              onSelect={(c) => updateAppaField('companyNameColor', c)}
            />

            <FontSizeController
              label="Company Name Font Size (பெயர் எழுத்து அளவு)"
              value={appaSettings.companyNameFontSize || 20}
              min={14}
              max={32}
              presets={[16, 18, 20, 22, 24, 28]}
              onChange={(sz) => updateAppaField('companyNameFontSize', sz)}
              accentColor={appaSettings.companyNameColor || '#0F172A'}
            />

            <Text style={[styles.inputLabel, { color: subTextColor, marginTop: 14 }]}>
              Company Address Override (நிறுவன முகவரி)
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bg.primary, borderColor, color: textColor }]}
              value={appaSettings.customAddress || ''}
              onChangeText={(val) => updateAppaField('customAddress', val)}
              placeholder="Default: 11, கரூர் மெயின் ரோடு, தளவாபாளையம்"
              placeholderTextColor={subTextColor}
            />

            <Text style={[styles.inputLabel, { color: subTextColor, marginTop: 10 }]}>
              Company Address Color (முகவரி எழுத்து வண்ணம்)
            </Text>
            <ColorPicker
              colors={['#475569', '#0F172A', '#1E3A8A', '#B91C1C', '#064E3B', '#78350F']}
              selected={appaSettings.companyAddressColor || '#475569'}
              onSelect={(c) => updateAppaField('companyAddressColor', c)}
            />

            <FontSizeController
              label="Company Address Font Size (முகவரி எழுத்து அளவு)"
              value={appaSettings.companyAddressFontSize || 12}
              min={9}
              max={18}
              presets={[10, 11, 12, 13, 14, 16]}
              onChange={(sz) => updateAppaField('companyAddressFontSize', sz)}
              accentColor={appaSettings.companyAddressColor || '#475569'}
            />

            <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: borderColor }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={[styles.inputLabel, { color: subTextColor, marginBottom: 0 }]}>
                  Contact Phone Numbers (தொடர்பு எண்கள்)
                </Text>
                <Pressable
                  onPress={handleAddPhone}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 8,
                    backgroundColor: colors.accent.primary + '18',
                    borderWidth: 1,
                    borderColor: colors.accent.primary + '40',
                  }}
                >
                  <MaterialIcons name="add-call" size={16} color={colors.accent.primary} />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.accent.primary }}>
                    + Add Phone (எண் சேர்)
                  </Text>
                </Pressable>
              </View>

              <View style={{ gap: 8 }}>
                {phoneList.map((phone, idx) => (
                  <View
                    key={idx}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <View
                      style={{
                        width: 34,
                        height: 42,
                        borderRadius: 8,
                        backgroundColor: colors.bg.primary,
                        borderWidth: 1,
                        borderColor,
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '800', color: colors.accent.primary }}>
                        #{idx + 1}
                      </Text>
                    </View>
                    <TextInput
                      style={[
                        styles.input,
                        {
                          flex: 1,
                          backgroundColor: colors.bg.primary,
                          borderColor,
                          color: textColor,
                          height: 42,
                        },
                      ]}
                      value={phone}
                      onChangeText={(val) => handleUpdatePhone(idx, val)}
                      placeholder={`Phone ${idx + 1} (e.g. 99430 51509)`}
                      placeholderTextColor={subTextColor}
                      keyboardType="phone-pad"
                    />
                    <Pressable
                      onPress={() => handleRemovePhone(idx)}
                      style={{
                        width: 38,
                        height: 42,
                        borderRadius: 8,
                        backgroundColor: '#EF444415',
                        borderWidth: 1,
                        borderColor: '#EF444430',
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                      hitSlop={6}
                    >
                      <MaterialIcons name="delete-outline" size={20} color="#EF4444" />
                    </Pressable>
                  </View>
                ))}
              </View>

              <Text style={{ fontSize: 10, color: subTextColor, marginTop: 8 }}>
                All added phone numbers will appear stacked one-by-one in the bill header.
              </Text>
            </View>
          </Card>

          {/* 3. TITLES & CUSTOMER HONORIFIC */}
          <SectionHeading text="3. BILL TITLES & CUSTOMER HONORIFIC (தலைப்பு & அவர்கள் விபரம்)" marginTop={16} />
          <Card>
            <Text style={[styles.inputLabel, { color: subTextColor }]}>
              English Title (ஆங்கிலத் தலைப்பு)
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bg.primary, borderColor, color: textColor }]}
              value={appaSettings.titleEnglish}
              onChangeText={(val) => updateAppaField('titleEnglish', val)}
              placeholder="ESTEEMATE"
              placeholderTextColor={subTextColor}
            />

            <Text style={[styles.inputLabel, { color: subTextColor, marginTop: 10 }]}>
              English Title Color (ஆங்கிலத் தலைப்பு வண்ணம்)
            </Text>
            <ColorPicker
              colors={['#0F172A', '#1E3A8A', '#B91C1C', '#064E3B', '#451A03', '#4C1D95', '#D97706']}
              selected={appaSettings.titleEnglishColor || '#0F172A'}
              onSelect={(c) => updateAppaField('titleEnglishColor', c)}
            />

            <FontSizeController
              label="English Title Font Size (ஆங்கிலத் தலைப்பு அளவு)"
              value={appaSettings.titleEnglishFontSize || 28}
              min={18}
              max={38}
              presets={[22, 24, 28, 30, 32, 36]}
              onChange={(sz) => updateAppaField('titleEnglishFontSize', sz)}
              accentColor={appaSettings.titleEnglishColor || '#0F172A'}
            />

            <Text style={[styles.inputLabel, { color: subTextColor, marginTop: 14 }]}>
              Tamil Subtitle (தமிழ் துணைத்தலைப்பு)
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bg.primary, borderColor, color: textColor }]}
              value={appaSettings.titleTamil}
              onChangeText={(val) => updateAppaField('titleTamil', val)}
              placeholder="மதிப்பீட்டு பில் / ESTIMATE BILL"
              placeholderTextColor={subTextColor}
            />

            <Text style={[styles.inputLabel, { color: subTextColor, marginTop: 10 }]}>
              Tamil Subtitle Color (துணைத்தலைப்பு வண்ணம்)
            </Text>
            <ColorPicker
              colors={['#475569', '#0F172A', '#1E3A8A', '#B91C1C', '#064E3B', '#78350F']}
              selected={appaSettings.titleTamilColor || '#475569'}
              onSelect={(c) => updateAppaField('titleTamilColor', c)}
            />

            <FontSizeController
              label="Tamil Subtitle Font Size (துணைத்தலைப்பு அளவு)"
              value={appaSettings.titleTamilFontSize || 11}
              min={9}
              max={18}
              presets={[9, 10, 11, 12, 13, 14]}
              onChange={(sz) => updateAppaField('titleTamilFontSize', sz)}
              accentColor={appaSettings.titleTamilColor || '#475569'}
            />

            <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: borderColor }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: textColor, marginBottom: 4 }}>
                Customer Honorific ('அவர்கள்' மரியாதை சொல் விபரம்)
              </Text>
              <Text style={{ fontSize: 11, color: subTextColor, marginBottom: 10 }}>
                வாடிக்கையாளர் பெயரின் இறுதியில் வரும் 'அவர்கள்' என்பதற்கான வண்ணம் மற்றும் எழுத்து அளவு.
              </Text>

              <Text style={[styles.inputLabel, { color: subTextColor }]}>
                Customer Honorific Color ('அவர்கள்' வண்ணம்)
              </Text>
              <ColorPicker
                colors={['#64748B', '#0F172A', '#1E3A8A', '#B91C1C', '#064E3B', '#78350F', '#4C1D95']}
                selected={appaSettings.customerHonorificColor || '#64748B'}
                onSelect={(c) => updateAppaField('customerHonorificColor', c)}
              />

              <FontSizeController
                label="Customer Honorific Font Size ('அவர்கள்' அளவு)"
                value={appaSettings.customerHonorificFontSize || 12}
                min={9}
                max={20}
                presets={[10, 11, 12, 13, 14, 16]}
                onChange={(sz) => updateAppaField('customerHonorificFontSize', sz)}
                accentColor={appaSettings.customerHonorificColor || '#64748B'}
              />
            </View>
          </Card>

          {/* 4. DEFAULT BILL THEME */}
          <SectionHeading text="4. DEFAULT BILL THEME (இயல்புநிலை பில் வண்ணம்)" marginTop={16} />
          <Card>
            <Text style={[styles.inputLabel, { color: subTextColor, marginBottom: 8 }]}>
              Choose Default Color Scheme for Appa Estimate Bill:
            </Text>
            <View style={{ gap: 8 }}>
              {[
                { key: 'classic', label: 'Classic Parchment (பாரம்பரிய காகிதம்)', color: '#F6F2E5', border: '#0F2942' },
                { key: 'blue', label: 'Ledger Blue (நீல லெட்ஜர்)', color: '#DBEAFE', border: '#1E3A8A' },
                { key: 'sepia', label: 'Vintage Sepia (பழைய பழுப்பு தாள்)', color: '#FAF3E3', border: '#451A03' },
                { key: 'emerald', label: 'Emerald Green (மங்கள மரகத பச்சை)', color: '#D1FAE5', border: '#064E3B' },
                { key: 'dark', label: 'Dark Slate (கருமை)', color: '#1E293B', border: '#64748B' },
              ].map((item) => {
                const isSelected = (appaSettings.defaultTheme || 'classic') === item.key;
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => {
                      updateAppaField('defaultTheme', item.key as AppaBillTheme);
                      setAppaPreviewTheme(item.key as AppaBillTheme);
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      padding: 10,
                      borderRadius: 10,
                      borderWidth: 1.5,
                      borderColor: isSelected ? colors.accent.primary : borderColor,
                      backgroundColor: isSelected ? colors.accent.primary + '12' : colors.bg.primary,
                    }}
                  >
                    <View
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 6,
                        backgroundColor: item.color,
                        borderWidth: 1,
                        borderColor: item.border,
                        marginRight: 10,
                      }}
                    />
                    <Text style={{ flex: 1, fontSize: 13, fontWeight: isSelected ? '800' : '600', color: textColor }}>
                      {item.label}
                    </Text>
                    {isSelected && <MaterialIcons name="check-circle" size={18} color={colors.accent.primary} />}
                  </Pressable>
                );
              })}
            </View>
          </Card>

          {/* 5. 6-COLUMN TABLE HEADINGS */}
          <SectionHeading text="5. 6-COLUMN TABLE HEADINGS (அட்டவணை தலைப்புகள்)" marginTop={16} />
          <Card>
            <View style={{ gap: 10 }}>
              <View>
                <Text style={[styles.inputLabel, { color: subTextColor }]}>Col 1: Serial No (வ. எண் / S.No)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.bg.primary, borderColor, color: textColor }]}
                  value={appaSettings.columnLabels?.sno}
                  onChangeText={(v) => updateAppaColumnLabel('sno', v)}
                  placeholder="வ. எண்"
                  placeholderTextColor={subTextColor}
                />
              </View>
              <View>
                <Text style={[styles.inputLabel, { color: subTextColor }]}>Col 2: Date (தேதி / Date)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.bg.primary, borderColor, color: textColor }]}
                  value={appaSettings.columnLabels?.date}
                  onChangeText={(v) => updateAppaColumnLabel('date', v)}
                  placeholder="தேதி"
                  placeholderTextColor={subTextColor}
                />
              </View>
              <View>
                <Text style={[styles.inputLabel, { color: subTextColor }]}>Col 3: Particulars (விபரம் / Particulars)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.bg.primary, borderColor, color: textColor }]}
                  value={appaSettings.columnLabels?.description}
                  onChangeText={(v) => updateAppaColumnLabel('description', v)}
                  placeholder="விபரம் (பொருட்கள் / கூலி விவரம்)"
                  placeholderTextColor={subTextColor}
                />
              </View>
              <View>
                <Text style={[styles.inputLabel, { color: subTextColor }]}>Col 4: Debit (+) (பற்று / Debit)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.bg.primary, borderColor, color: textColor }]}
                  value={appaSettings.columnLabels?.debit}
                  onChangeText={(v) => updateAppaColumnLabel('debit', v)}
                  placeholder="பற்று (+)"
                  placeholderTextColor={subTextColor}
                />
              </View>
              <View>
                <Text style={[styles.inputLabel, { color: subTextColor }]}>Col 5: Credit (-) (வரவு / Credit)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.bg.primary, borderColor, color: textColor }]}
                  value={appaSettings.columnLabels?.credit}
                  onChangeText={(v) => updateAppaColumnLabel('credit', v)}
                  placeholder="வரவு (-)"
                  placeholderTextColor={subTextColor}
                />
              </View>
              <View>
                <Text style={[styles.inputLabel, { color: subTextColor }]}>Col 6: Balance (பாக்கி / Balance)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.bg.primary, borderColor, color: textColor }]}
                  value={appaSettings.columnLabels?.balance}
                  onChangeText={(v) => updateAppaColumnLabel('balance', v)}
                  placeholder="பாக்கி"
                  placeholderTextColor={subTextColor}
                />
              </View>

              <Pressable
                onPress={() => {
                  setTemplate((prev) => ({
                    ...prev,
                    appaBillSettings: {
                      ...DEFAULT_APPA_ESTIMATE_BILL_SETTINGS,
                      ...(prev.appaBillSettings || {}),
                      columnLabels: DEFAULT_APPA_ESTIMATE_BILL_SETTINGS.columnLabels,
                    },
                  }));
                  setHasChanges(true);
                }}
                style={{
                  alignSelf: 'flex-start',
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 8,
                  backgroundColor: colors.accent.primary + '15',
                  marginTop: 4,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.accent.primary }}>
                  ↺ Reset Column Headings to Tamil Defaults
                </Text>
              </Pressable>
            </View>
          </Card>

          {/* 6. PAYMENT QR, SIGNATORY & FOOTER NOTES */}
          <SectionHeading text="6. FOOTER, QR & ACKNOWLEDGMENT (கீழ்க்குறிப்பு & முத்திரை)" marginTop={16} />
          <Card>
            <ToggleRow
              title="Show UPI Payment QR Code"
              subtitle="Display GPay / PhonePe QR code on statement when balance is due"
              value={Boolean(appaSettings.showQrCode !== false)}
              onToggle={(v) => updateAppaField('showQrCode', v)}
            />

            <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: borderColor }}>
              <Text style={[styles.inputLabel, { color: subTextColor }]}>
                Authorized Signatory Text (கையொப்ப வாசகம்)
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.bg.primary, borderColor, color: textColor }]}
                value={appaSettings.signatoryText}
                onChangeText={(v) => updateAppaField('signatoryText', v)}
                placeholder="அங்கீகரிக்கப்பட்ட கையொப்பம்"
                placeholderTextColor={subTextColor}
              />
            </View>

            {/* SIGNATORY PAD & SIGNATURE SECTION */}
            <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: borderColor }}>
              <Text style={[styles.inputLabel, { color: textColor, fontWeight: '700', fontSize: 12 }]}>
                AUTHORIZED SIGNATURE (கையொப்ப பலகை / கையொப்பம்)
              </Text>
              <Text style={[styles.cardDesc, { color: subTextColor, marginBottom: 10, fontSize: 11 }]}>
                Draw your signature on the digital pad or upload a signature image to display on the estimate bill.
              </Text>

              {/* Signature Preview Box */}
              <View style={{ alignItems: 'center', marginBottom: 12 }}>
                {appaSettings.signatureImageUri ? (
                  <View
                    style={{
                      width: 220,
                      height: 80,
                      borderRadius: 10,
                      borderWidth: 1.5,
                      borderColor: colors.accent.primary,
                      backgroundColor: '#FFFFFF',
                      padding: 6,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <Image
                      source={{ uri: appaSettings.signatureImageUri }}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="contain"
                    />
                  </View>
                ) : (
                  <View
                    style={{
                      width: 220,
                      height: 80,
                      borderRadius: 10,
                      borderWidth: 1.5,
                      borderColor: borderColor,
                      borderStyle: 'dashed',
                      backgroundColor: colors.bg.primary,
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <MaterialIcons name="gesture" size={28} color={subTextColor} />
                    <Text style={{ fontSize: 11, color: subTextColor, fontWeight: '600' }}>
                      No Signature Saved (கையொப்பம் இல்லை)
                    </Text>
                  </View>
                )}
              </View>

              {/* Action Buttons: Draw, Upload, Remove */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                <Pressable
                  onPress={() => setSignatoryPadModalVisible(true)}
                  style={[
                    styles.presetBtn,
                    { backgroundColor: '#B91C1C15', borderColor: '#B91C1C', paddingHorizontal: 12 },
                  ]}
                >
                  <MaterialIcons name="gesture" size={16} color="#B91C1C" />
                  <Text style={{ color: '#B91C1C', fontSize: 12, fontWeight: '700' }}>
                    Draw Signature (கையொப்பம் வரைய)
                  </Text>
                </Pressable>

                <Pressable
                  onPress={handlePickSignatureFromGallery}
                  style={[
                    styles.presetBtn,
                    { backgroundColor: '#2563EB15', borderColor: '#2563EB' },
                  ]}
                >
                  <MaterialIcons name="photo-library" size={15} color="#2563EB" />
                  <Text style={{ color: '#2563EB', fontSize: 12, fontWeight: '600' }}>Upload Image</Text>
                </Pressable>

                {appaSettings.signatureImageUri ? (
                  <Pressable
                    onPress={() => updateAppaField('signatureImageUri', '')}
                    style={[
                      styles.presetBtn,
                      { backgroundColor: '#EF444415', borderColor: '#EF4444' },
                    ]}
                  >
                    <MaterialIcons name="delete-outline" size={15} color="#EF4444" />
                    <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '600' }}>Remove</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: borderColor }}>
              <ToggleRow
                title="Show Goods Acknowledgment & Notes"
                subtitle="Display goods received acknowledgment & thank you notes at the bottom"
                value={Boolean(appaSettings.showGoodsAcknowledgment !== false)}
                onToggle={(v) => updateAppaField('showGoodsAcknowledgment', v)}
              />
              {appaSettings.showGoodsAcknowledgment !== false && (
                <View style={{ marginTop: 10 }}>
                  <Text style={[styles.inputLabel, { color: subTextColor }]}>
                    Goods Acknowledgment & Thank You Notes (ஒப்புதல் & நன்றியுரை)
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: colors.bg.primary,
                        borderColor,
                        color: textColor,
                        height: 70,
                        paddingTop: 8,
                      },
                    ]}
                    multiline
                    numberOfLines={3}
                    value={appaSettings.footerNotes || ''}
                    onChangeText={(v) => updateAppaField('footerNotes', v)}
                    placeholder="• சரக்குகள் சரியான முறையில் கிடைக்கப்பெற்றது.&#10;• தங்களின் மேலான ஆதரவிற்கு மிக்க நன்றி! மீண்டும் வருக!"
                    placeholderTextColor={subTextColor}
                  />
                </View>
              )}
            </View>
          </Card>

          {/* 7. LIVE INTERACTIVE APPA ESTIMATE BILL PREVIEW */}
          <SectionHeading text="7. LIVE PREVIEW (நேரடி முன்னோட்டம்)" marginTop={20} />
          <View style={{ marginBottom: 30 }}>
            {/* Theme switcher tabs for preview */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: subTextColor }}>PREVIEW THEME:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {(['classic', 'blue', 'sepia', 'emerald', 'dark'] as AppaBillTheme[]).map((thm) => {
                  const isSel = appaPreviewTheme === thm;
                  return (
                    <Pressable
                      key={thm}
                      onPress={() => setAppaPreviewTheme(thm)}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: isSel ? colors.accent.primary : borderColor,
                        backgroundColor: isSel ? colors.accent.primary : colors.bg.card,
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: isSel ? '#FFF' : textColor }}>
                        {thm.toUpperCase()}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={true} style={{ borderWidth: 1, borderColor, borderRadius: 12, overflow: 'hidden' }}>
              <AppaEstimateBillView
                data={SAMPLE_CUSTOMER_STATEMENT_DATA}
                company={{
                  name: appaSettings.customCompanyName || 'அம்மன் ஹாலோ பிரிக்ஸ்',
                  phone: appaSettings.customPhones || '99430 51509',
                  alternatePhone: '99430 51209',
                  address: appaSettings.customAddress || '11, கரூர் மெயின் ரோடு, வெங்கமேடு, தளவாபாளையம்',
                  upiId: shareSettings.upiId || 'ammanbricks@upi',
                  logoUrl: effectiveAppaLogoUri,
                }}
                settings={shareSettings}
                template={template}
                isDark={isDark}
                billTheme={appaPreviewTheme}
                billNo="1"
                appaBillSettings={appaSettings}
              />
            </ScrollView>
          </View>
        </View>
      </ScrollView>
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

        {/* Signatory Pad Modal */}
        <SignaturePadModal
          visible={signatoryPadModalVisible}
          onClose={() => setSignatoryPadModalVisible(false)}
          onSave={(uri) => {
            updateAppaField('signatureImageUri', uri);
          }}
          initialSignatureUri={appaSettings.signatureImageUri}
          themeColors={{
            cardBg,
            textColor,
            subTextColor,
            borderColor,
            primary: colors.accent.primary,
          }}
        />
        </View>
      </InvoiceEditorContext.Provider>
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
    docTypeSwitcherContainer: {
      flexDirection: 'row',
      paddingHorizontal: 12,
      paddingVertical: 8,
      gap: 10,
      borderBottomWidth: 1,
    },
    docTypeTab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    docTypeTabActive: {
      elevation: 1,
    },
    docTypeTabText: {
      fontSize: 13,
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
