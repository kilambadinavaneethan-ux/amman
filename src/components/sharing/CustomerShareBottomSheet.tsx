import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { CustomerShareData, ShareSettings, InvoiceTemplate, DEFAULT_SHARE_SETTINGS, DEFAULT_INVOICE_TEMPLATE } from '../../types/sharing';
import { customerShareService } from '../../services/sharing/customerShareService';
import { CustomerStatementView } from './CustomerStatementView';
import { shareSettingsService } from '../../services/sharing/shareSettingsService';
import { invoiceTemplateService } from '../../services/sharing/invoiceTemplateService';
import { ShareSettingsModal } from './ShareSettingsModal';

interface CustomerShareBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  customerData: CustomerShareData;
  company?: any;
  isDark?: boolean;
}

type TabType = 'TEXT' | 'IMAGE' | 'PDF' | 'OPTIONS';

export function CustomerShareBottomSheet({
  visible,
  onClose,
  customerData,
  company = {},
  isDark = false,
}: CustomerShareBottomSheetProps) {
  const [activeTab, setActiveTab] = useState<TabType>('IMAGE');
  const [settings, setSettings] = useState<ShareSettings>(DEFAULT_SHARE_SETTINGS);
  const [template, setTemplate] = useState<InvoiceTemplate>(DEFAULT_INVOICE_TEMPLATE);
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [customMessage, setCustomMessage] = useState('');
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);

  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'this_week' | 'this_month' | 'last_30' | 'this_year' | 'custom'>('all');
  const [customDays, setCustomDays] = useState<number>(7);
  const [orderCountFilter, setOrderCountFilter] = useState<'all' | '1' | '3' | '5' | '10' | '15' | '20' | 'custom'>('all');
  const [customOrderCount, setCustomOrderCount] = useState<number>(5);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [includeProfileInfo, setIncludeProfileInfo] = useState(true);
  const [includeDueDates, setIncludeDueDates] = useState(false);
  const [includeSummary, setIncludeSummary] = useState(true);
  const [includeLedger, setIncludeLedger] = useState(true);
  const [salutation, setSalutation] = useState<'None' | 'Mr.' | 'Mrs.' | 'Ms.' | 'M/s' | 'Dr.'>('None');
  const [useAvargal, setUseAvargal] = useState<boolean>(false);
  const [editableCustomerName, setEditableCustomerName] = useState<string>('');

  const viewShotRef = useRef<View>(null);

  useEffect(() => {
    if (visible) {
      setActiveTab('IMAGE');
      setIncludeDueDates(false);
      setOrderCountFilter('all');
      setCustomOrderCount(5);
      loadSettings();

      const origName = customerData?.customer?.name || '';
      const clean = origName.replace(/^(Mr\.|Mrs\.|Ms\.|M\/s|Dr\.)\s+/i, '').replace(/\s+அவர்கள்$/i, '').trim();
      setEditableCustomerName(clean);

      if (/^Mr\.\s+/i.test(origName)) setSalutation('Mr.');
      else if (/^Mrs\.\s+/i.test(origName)) setSalutation('Mrs.');
      else if (/^Ms\.\s+/i.test(origName)) setSalutation('Ms.');
      else if (/^M\/s\s+/i.test(origName)) setSalutation('M/s');
      else if (/^Dr\.\s+/i.test(origName)) setSalutation('Dr.');
      else setSalutation('None');

      if (/\s+அவர்கள்$/i.test(origName) || origName.endsWith('அவர்கள்')) {
        setUseAvargal(true);
      } else {
        setUseAvargal(false);
      }
    }
  }, [visible, customerData]);

  const loadSettings = async () => {
    try {
      const [s, t] = await Promise.all([
        shareSettingsService.getSettings(),
        invoiceTemplateService.getTemplate(),
      ]);
      setSettings(s);
      setTemplate(t);
    } catch (e) {
      console.error('Error loading customer share settings:', e);
    }
  };

  const processedData: CustomerShareData = useMemo(() => {
    let filteredLedger = customerData.ledger || [];
    if (dateFilter !== 'all') {
      const now = new Date();
      filteredLedger = filteredLedger.filter((item) => {
        const d = item.date instanceof Date ? item.date : new Date(item.date);
        if (isNaN(d.getTime())) return true;

        if (dateFilter === 'today') {
          return (
            d.getFullYear() === now.getFullYear() &&
            d.getMonth() === now.getMonth() &&
            d.getDate() === now.getDate()
          );
        }

        if (dateFilter === 'this_week') {
          const firstDayOfWeek = new Date(now);
          const day = now.getDay();
          const diff = now.getDate() - day + (day === 0 ? -6 : 1);
          firstDayOfWeek.setDate(diff);
          firstDayOfWeek.setHours(0, 0, 0, 0);
          return d.getTime() >= firstDayOfWeek.getTime();
        }

        if (dateFilter === 'this_month') {
          return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
        }

        if (dateFilter === 'last_30') {
          const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
          thirtyDaysAgo.setHours(0, 0, 0, 0);
          return d.getTime() >= thirtyDaysAgo.getTime();
        }

        if (dateFilter === 'this_year') {
          return d.getFullYear() === now.getFullYear();
        }

        if (dateFilter === 'custom') {
          const pastDate = new Date(now.getTime() - (customDays || 7) * 86400000);
          pastDate.setHours(0, 0, 0, 0);
          return d.getTime() >= pastDate.getTime();
        }

        return true;
      });
    }

    // Apply Order Count Filter
    if (orderCountFilter !== 'all') {
      const countLimit = orderCountFilter === 'custom' ? (customOrderCount || 5) : parseInt(orderCountFilter, 10);
      if (countLimit > 0) {
        const orderEntries = filteredLedger.filter((item) => item.type === 'order');
        const sortedOrderEntries = [...orderEntries].sort((a, b) => {
          const da = a.date instanceof Date ? a.date : new Date(a.date);
          const db = b.date instanceof Date ? b.date : new Date(b.date);
          return db.getTime() - da.getTime();
        });
        const topOrders = sortedOrderEntries.slice(0, countLimit);
        const topOrderIds = new Set(topOrders.map((o) => o.id));
        const earliestOrderTime = topOrders.length > 0
          ? Math.min(...topOrders.map((o) => (o.date instanceof Date ? o.date.getTime() : new Date(o.date).getTime())))
          : 0;

        filteredLedger = filteredLedger.filter((item) => {
          if (item.type === 'opening') return true;
          if (item.type === 'order') return topOrderIds.has(item.id);
          if (item.type === 'payment') {
            const d = item.date instanceof Date ? item.date : new Date(item.date);
            return !isNaN(d.getTime()) && d.getTime() >= earliestOrderTime;
          }
          return true;
        });
      }
    }

    // Apply Sort Order to Ledger
    let sortedLedger = [...filteredLedger];
    const opening = sortedLedger.find((e: any) => e.type === 'opening');
    const rest = sortedLedger.filter((e: any) => e.type !== 'opening');

    rest.sort((a, b) => {
      const da = a.date instanceof Date ? a.date : new Date(a.date);
      const db = b.date instanceof Date ? b.date : new Date(b.date);
      const diff = da.getTime() - db.getTime();

      if (sortOrder === 'desc') {
        if (diff !== 0) return db.getTime() - da.getTime();
        if (a.type === 'order' && b.type === 'payment') return -1;
        if (a.type === 'payment' && b.type === 'order') return 1;
        return 0;
      } else {
        if (diff !== 0) return da.getTime() - db.getTime();
        if (a.type === 'order' && b.type === 'payment') return -1;
        if (a.type === 'payment' && b.type === 'order') return 1;
        return 0;
      }
    });

    if (sortOrder === 'desc') {
      sortedLedger = opening ? [...rest, opening] : rest;
    } else {
      sortedLedger = opening ? [opening, ...rest] : rest;
    }

    const totalOrders = sortedLedger.filter((l) => l.type === 'order').length;
    const totalSales = sortedLedger.filter((l) => l.type === 'order').reduce((sum, l) => sum + (l.amount || 0), 0);
    const totalPaid = sortedLedger.reduce((sum, l) => sum + (l.paid || 0), 0);

    const origName = customerData.customer?.name || '';
    const origClean = origName.replace(/^(Mr\.|Mrs\.|Ms\.|M\/s|Dr\.)\s+/i, '').replace(/\s+அவர்கள்$/i, '').trim();
    const effectiveBaseName = editableCustomerName !== undefined && editableCustomerName !== null ? editableCustomerName : origClean;
    const cleanName = effectiveBaseName.trim() || origClean || 'Customer';

    let formattedCustomerName = cleanName;
    if (salutation && salutation !== 'None') {
      formattedCustomerName = `${salutation} ${formattedCustomerName}`;
    }
    if (useAvargal) {
      formattedCustomerName = `${formattedCustomerName} அவர்கள்`;
    }

    return {
      ...customerData,
      customer: {
        ...customerData.customer,
        name: formattedCustomerName,
        salutation: salutation !== 'None' ? salutation : undefined,
        suffix: useAvargal ? 'அவர்கள்' : undefined,
      },
      summary: {
        ...customerData.summary,
        totalOrdersCount: (dateFilter === 'all' && orderCountFilter === 'all') ? customerData.summary.totalOrdersCount : totalOrders,
        totalSalesAmount: (dateFilter === 'all' && orderCountFilter === 'all') ? customerData.summary.totalSalesAmount : totalSales,
        totalPaidAmount: (dateFilter === 'all' && orderCountFilter === 'all') ? customerData.summary.totalPaidAmount : totalPaid,
      },
      ledger: sortedLedger,
      options: {
        includeProfileInfo,
        includeDueDates,
        includeSummary,
        includeLedger,
      },
    };
  }, [customerData, dateFilter, customDays, orderCountFilter, customOrderCount, sortOrder, includeProfileInfo, includeDueDates, includeSummary, includeLedger, salutation, useAvargal, editableCustomerName]);

  const origCleanName = useMemo(() => {
    const orig = customerData?.customer?.name || '';
    return orig.replace(/^(Mr\.|Mrs\.|Ms\.|M\/s|Dr\.)\s+/i, '').replace(/\s+அவர்கள்$/i, '').trim();
  }, [customerData]);

  const isNameModified = editableCustomerName.trim() !== origCleanName;

  useEffect(() => {
    if (visible && settings) {
      const text = customerShareService.formatCustomerShareText(processedData, company, settings);
      setCustomMessage(text);
    }
  }, [processedData, visible, settings]);

  const handleShareText = async (via: 'whatsapp' | 'sms' | 'copy' | 'share') => {
    setSharing(true);
    try {
      await customerShareService.shareCustomerAsText(processedData, company, settings, customMessage, via);
    } finally {
      setSharing(false);
    }
  };

  const handleShareImage = async () => {
    if (!viewShotRef.current) {
      Alert.alert('Error', 'Image view not ready for capture.');
      return;
    }
    setSharing(true);
    try {
      const uri = await captureRef(viewShotRef, {
        format: 'png',
        quality: 0.95,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: `Statement - ${processedData.customer.name}`,
        });
      } else {
        Alert.alert('Image Saved', `Statement image saved to:\n${uri}`);
      }
    } catch (err: any) {
      console.error('Capture statement image error:', err);
      Alert.alert('Sharing Failed', err?.message || 'Could not capture statement image.');
    } finally {
      setSharing(false);
    }
  };

  const handleExportPdf = async () => {
    setSharing(true);
    try {
      await customerShareService.shareCustomerAsPdf(processedData, company, settings, template);
    } finally {
      setSharing(false);
    }
  };

  const cardBg = isDark ? '#1E293B' : '#FFFFFF';
  const textColor = isDark ? '#F8FAFC' : '#0F172A';
  const subTextColor = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? '#334155' : '#E2E8F0';
  const accentColor = settings.themeColor || '#2563EB';

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.sheetContainer, { backgroundColor: cardBg, borderColor }]}>
          {/* Sheet Handle & Header */}
          <View style={styles.sheetHeader}>
            <View style={styles.handle} />
            <View style={styles.headerTitleRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetTitle, { color: textColor }]}>Share Customer Statement</Text>
                <Text style={[styles.sheetSubTitle, { color: subTextColor }]}>
                  {processedData.customer.name.endsWith('அவர்கள்') ? (
                    <>
                      {processedData.customer.name.replace(/\s+அவர்கள்$/, '')}{' '}
                      <Text style={{ fontSize: 9.5, fontWeight: '600' }}>அவர்கள்</Text>
                    </>
                  ) : processedData.customer.name} • Net Due: ₹{processedData.summary.netBalanceDue.toLocaleString('en-IN')}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Pressable
                  onPress={() => setSettingsModalVisible(true)}
                  style={[styles.closeBtn, { backgroundColor: accentColor + '15' }]}
                  hitSlop={8}
                >
                  <MaterialIcons name="settings" size={20} color={accentColor} />
                </Pressable>
                <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
                  <MaterialIcons name="close" size={22} color={subTextColor} />
                </Pressable>
              </View>
            </View>

            {/* Tab Bar */}
            <View style={[styles.tabBar, { borderBottomColor: borderColor }]}>
              <Pressable
                onPress={() => setActiveTab('TEXT')}
                style={[styles.tabItem, activeTab === 'TEXT' && { borderBottomColor: accentColor, borderBottomWidth: 2 }]}
              >
                <MaterialIcons name="chat" size={18} color={activeTab === 'TEXT' ? accentColor : subTextColor} />
                <Text style={[styles.tabLabel, { color: activeTab === 'TEXT' ? accentColor : subTextColor, fontWeight: activeTab === 'TEXT' ? '700' : '500' }]}>
                  WhatsApp / Text
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setActiveTab('IMAGE')}
                style={[styles.tabItem, activeTab === 'IMAGE' && { borderBottomColor: accentColor, borderBottomWidth: 2 }]}
              >
                <MaterialIcons name="image" size={18} color={activeTab === 'IMAGE' ? accentColor : subTextColor} />
                <Text style={[styles.tabLabel, { color: activeTab === 'IMAGE' ? accentColor : subTextColor, fontWeight: activeTab === 'IMAGE' ? '700' : '500' }]}>
                  Image Receipt
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setActiveTab('PDF')}
                style={[styles.tabItem, activeTab === 'PDF' && { borderBottomColor: accentColor, borderBottomWidth: 2 }]}
              >
                <MaterialIcons name="picture-as-pdf" size={18} color={activeTab === 'PDF' ? accentColor : subTextColor} />
                <Text style={[styles.tabLabel, { color: activeTab === 'PDF' ? accentColor : subTextColor, fontWeight: activeTab === 'PDF' ? '700' : '500' }]}>
                  PDF Statement
                </Text>
              </Pressable>
            </View>

            {/* SECTIONS & FILTERS TOOLBAR */}
            <View style={{ width: '100%', paddingTop: 10, paddingBottom: 6 }}>
              {/* Date Filter Bar */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: subTextColor }}>DATE FILTER:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {[
                    { id: 'all', label: 'All Time' },
                    { id: 'today', label: 'Today (This Day)' },
                    { id: 'this_week', label: 'This Week' },
                    { id: 'this_month', label: 'This Month' },
                    { id: 'last_30', label: 'Last 30 Days' },
                    { id: 'this_year', label: 'This Year' },
                    { id: 'custom', label: `Custom (${customDays} Days)` },
                  ].map((f) => (
                    <Pressable
                      key={f.id}
                      onPress={() => setDateFilter(f.id as any)}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 12,
                        backgroundColor: dateFilter === f.id ? accentColor : (isDark ? '#334155' : '#F1F5F9'),
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: dateFilter === f.id ? '#FFF' : textColor }}>
                        {f.label}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              {/* Custom Days Selector Bar */}
              {dateFilter === 'custom' && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: subTextColor }}>CUSTOM DAYS:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, alignItems: 'center', paddingRight: 16 }}>
                    {[7, 15, 30, 45, 60, 90].map((d) => (
                      <Pressable
                        key={d}
                        onPress={() => setCustomDays(d)}
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: customDays === d ? accentColor : borderColor,
                          backgroundColor: customDays === d ? (accentColor + '20') : 'transparent',
                        }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: '700', color: customDays === d ? accentColor : textColor }}>
                          {d}d
                        </Text>
                      </Pressable>
                    ))}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 4 }}>
                      <TextInput
                        defaultValue={String(customDays)}
                        onEndEditing={(e) => {
                          const num = parseInt(e.nativeEvent.text, 10);
                          if (!isNaN(num) && num > 0) {
                            setCustomDays(num);
                          }
                        }}
                        keyboardType="numeric"
                        selectTextOnFocus
                        returnKeyType="done"
                        placeholder="Days"
                        placeholderTextColor={subTextColor}
                        style={{
                          width: 50,
                          height: 28,
                          borderRadius: 6,
                          borderWidth: 1,
                          borderColor: accentColor,
                          backgroundColor: isDark ? '#0F172A' : '#FFF',
                          color: textColor,
                          fontSize: 12,
                          fontWeight: '700',
                          textAlign: 'center',
                          padding: 0,
                        }}
                      />
                      <Text style={{ fontSize: 10, color: subTextColor }}>days</Text>
                    </View>
                  </ScrollView>
                </View>
              )}

              {/* Order Count Filter Bar */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: subTextColor }}>ORDER COUNT:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {[
                    { id: 'all', label: 'All Orders' },
                    { id: '1', label: 'Last 1 Order' },
                    { id: '3', label: 'Last 3 Orders' },
                    { id: '5', label: 'Last 5 Orders' },
                    { id: '10', label: 'Last 10 Orders' },
                    { id: '15', label: 'Last 15 Orders' },
                    { id: '20', label: 'Last 20 Orders' },
                    { id: 'custom', label: `Custom (${customOrderCount} Orders)` },
                  ].map((f) => (
                    <Pressable
                      key={f.id}
                      onPress={() => setOrderCountFilter(f.id as any)}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 12,
                        backgroundColor: orderCountFilter === f.id ? accentColor : (isDark ? '#334155' : '#F1F5F9'),
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: orderCountFilter === f.id ? '#FFF' : textColor }}>
                        {f.label}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              {/* Custom Order Count Selector Bar */}
              {orderCountFilter === 'custom' && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: subTextColor }}>CUSTOM COUNT:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, alignItems: 'center', paddingRight: 16 }}>
                    {[2, 4, 6, 8, 12, 25, 50].map((c) => (
                      <Pressable
                        key={c}
                        onPress={() => setCustomOrderCount(c)}
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: customOrderCount === c ? accentColor : borderColor,
                          backgroundColor: customOrderCount === c ? (accentColor + '20') : 'transparent',
                        }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: '700', color: customOrderCount === c ? accentColor : textColor }}>
                          {c} orders
                        </Text>
                      </Pressable>
                    ))}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 4 }}>
                      <TextInput
                        defaultValue={String(customOrderCount)}
                        onEndEditing={(e) => {
                          const num = parseInt(e.nativeEvent.text, 10);
                          if (!isNaN(num) && num > 0) {
                            setCustomOrderCount(num);
                          }
                        }}
                        keyboardType="numeric"
                        selectTextOnFocus
                        returnKeyType="done"
                        placeholder="Count"
                        placeholderTextColor={subTextColor}
                        style={{
                          width: 50,
                          height: 28,
                          borderRadius: 6,
                          borderWidth: 1,
                          borderColor: accentColor,
                          backgroundColor: isDark ? '#0F172A' : '#FFF',
                          color: textColor,
                          fontSize: 12,
                          fontWeight: '700',
                          textAlign: 'center',
                          padding: 0,
                        }}
                      />
                      <Text style={{ fontSize: 10, color: subTextColor }}>orders</Text>
                    </View>
                  </ScrollView>
                </View>
              )}

              {/* Sort Order Selector Bar */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: subTextColor }}>SORT LEDGER:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {[
                    { id: 'desc', label: 'Newest First ⬆' },
                    { id: 'asc', label: 'Oldest First ⬇' },
                  ].map((s) => (
                    <Pressable
                      key={s.id}
                      onPress={() => setSortOrder(s.id as any)}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 12,
                        backgroundColor: sortOrder === s.id ? accentColor : (isDark ? '#334155' : '#F1F5F9'),
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: sortOrder === s.id ? '#FFF' : textColor }}>
                        {s.label}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              {/* Customer Name Changeable Bar */}
              <View style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <MaterialIcons name="badge" size={13} color={accentColor} />
                    <Text style={{ fontSize: 10, fontWeight: '800', color: subTextColor }}>
                      CUSTOMER NAME (STATEMENT DISPLAY):
                    </Text>
                  </View>
                  {isNameModified ? (
                    <Pressable
                      onPress={() => setEditableCustomerName(origCleanName)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 3,
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 6,
                        backgroundColor: accentColor + '18',
                      }}
                      hitSlop={6}
                    >
                      <MaterialIcons name="restore" size={12} color={accentColor} />
                      <Text style={{ fontSize: 10, fontWeight: '700', color: accentColor }}>Reset Original</Text>
                    </Pressable>
                  ) : null}
                </View>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: isNameModified ? accentColor : borderColor,
                    borderRadius: 10,
                    backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                    paddingHorizontal: 10,
                    height: 38,
                  }}
                >
                  <MaterialIcons
                    name="edit"
                    size={16}
                    color={isNameModified ? accentColor : subTextColor}
                    style={{ marginRight: 6 }}
                  />
                  <TextInput
                    value={editableCustomerName}
                    onChangeText={setEditableCustomerName}
                    placeholder="Enter customer name for statement"
                    placeholderTextColor={subTextColor}
                    style={{
                      flex: 1,
                      color: textColor,
                      fontSize: 13,
                      fontWeight: '700',
                      paddingVertical: 0,
                    }}
                    returnKeyType="done"
                    selectTextOnFocus
                  />
                  {editableCustomerName ? (
                    <Pressable
                      onPress={() => setEditableCustomerName('')}
                      hitSlop={8}
                      style={{ padding: 4 }}
                    >
                      <MaterialIcons name="close" size={16} color={subTextColor} />
                    </Pressable>
                  ) : null}
                </View>
              </View>

              {/* Client Title / Salutation (Mr. / Mrs.) & Suffix (அவர்கள்) Bar */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: subTextColor }}>CLIENT TITLE:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {[
                    { id: 'None', label: 'Default' },
                    { id: 'Mr.', label: 'Mr.' },
                    { id: 'Mrs.', label: 'Mrs.' },
                    { id: 'Ms.', label: 'Ms.' },
                    { id: 'M/s', label: 'M/s' },
                    { id: 'Dr.', label: 'Dr.' },
                  ].map((t) => (
                    <Pressable
                      key={t.id}
                      onPress={() => setSalutation(t.id as any)}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 12,
                        backgroundColor: salutation === t.id ? accentColor : (isDark ? '#334155' : '#F1F5F9'),
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: salutation === t.id ? '#FFF' : textColor }}>
                        {t.label}
                      </Text>
                    </Pressable>
                  ))}

                  <View style={{ width: 1, height: 16, backgroundColor: borderColor, marginHorizontal: 2, alignSelf: 'center' }} />

                  {/* Tamil Suffix: அவர்கள் */}
                  <Pressable
                    onPress={() => setUseAvargal(!useAvargal)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: useAvargal ? '#8B5CF6' : borderColor,
                      backgroundColor: useAvargal ? '#8B5CF6' : (isDark ? '#334155' : '#F1F5F9'),
                    }}
                  >
                    <Text style={{ fontSize: 9.5, fontWeight: '800', color: useAvargal ? '#FFF' : (isDark ? '#C084FC' : '#7C3AED') }}>
                      + அவர்கள் {useAvargal ? '✓' : ''}
                    </Text>
                  </Pressable>
                </ScrollView>
              </View>

              {/* Section Toggles */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: subTextColor }}>SECTIONS:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  <Pressable
                    onPress={() => setIncludeProfileInfo(!includeProfileInfo)}
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: includeProfileInfo ? accentColor : borderColor,
                      backgroundColor: includeProfileInfo ? (accentColor + '15') : 'transparent',
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '700', color: includeProfileInfo ? accentColor : subTextColor }}>
                      👤 Profile Info {includeProfileInfo ? '✓' : ''}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setIncludeDueDates(!includeDueDates)}
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: includeDueDates ? '#D97706' : borderColor,
                      backgroundColor: includeDueDates ? '#F59E0B15' : 'transparent',
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '700', color: includeDueDates ? '#D97706' : subTextColor }}>
                      ⏰ Due Dates {includeDueDates ? '✓' : ''}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setIncludeSummary(!includeSummary)}
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: includeSummary ? '#10B981' : borderColor,
                      backgroundColor: includeSummary ? '#10B98115' : 'transparent',
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '700', color: includeSummary ? '#10B981' : subTextColor }}>
                      📊 Summary {includeSummary ? '✓' : ''}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setIncludeLedger(!includeLedger)}
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: includeLedger ? '#6C5CE7' : borderColor,
                      backgroundColor: includeLedger ? '#6C5CE715' : 'transparent',
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '700', color: includeLedger ? '#6C5CE7' : subTextColor }}>
                      📜 Ledger {includeLedger ? '✓' : ''}
                    </Text>
                  </Pressable>
                </ScrollView>
              </View>
            </View>
          </View>

          {/* Content Area */}
          <ScrollView style={styles.contentScroll} contentContainerStyle={{ padding: 16 }}>
            {/* ────────── TAB 1: TEXT / WHATSAPP ────────── */}
            {activeTab === 'TEXT' && (
              <View>
                <Text style={[styles.inputLabel, { color: subTextColor }]}>MESSAGE PREVIEW & CUSTOMIZER</Text>
                <TextInput
                  value={customMessage}
                  onChangeText={setCustomMessage}
                  multiline
                  numberOfLines={10}
                  style={[
                    styles.messageInput,
                    { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', color: textColor, borderColor }
                  ]}
                />

                <View style={styles.actionBtnRow}>
                  <Pressable
                    onPress={() => handleShareText('whatsapp')}
                    disabled={sharing}
                    style={[styles.primaryActionBtn, { backgroundColor: '#25D366' }]}
                  >
                    <MaterialIcons name="chat" size={20} color="#FFF" />
                    <Text style={styles.primaryActionText}>Send on WhatsApp</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => handleShareText('share')}
                    disabled={sharing}
                    style={[styles.secondaryActionBtn, { backgroundColor: accentColor }]}
                  >
                    <MaterialIcons name="share" size={20} color="#FFF" />
                    <Text style={styles.secondaryActionText}>System Share</Text>
                  </Pressable>
                </View>

                <View style={styles.subActionRow}>
                  <Pressable onPress={() => handleShareText('copy')} style={styles.subBtn}>
                    <MaterialIcons name="content-copy" size={16} color={subTextColor} />
                    <Text style={[styles.subBtnText, { color: subTextColor }]}>Copy Text</Text>
                  </Pressable>
                  <Pressable onPress={() => handleShareText('sms')} style={styles.subBtn}>
                    <MaterialIcons name="textsms" size={16} color={subTextColor} />
                    <Text style={[styles.subBtnText, { color: subTextColor }]}>Send SMS</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* ────────── TAB 2: IMAGE RECEIPT ────────── */}
            {activeTab === 'IMAGE' && (
              <View>
                <Text style={[styles.inputLabel, { color: subTextColor, marginBottom: 10 }]}>STATEMENT IMAGE PREVIEW</Text>
                
                <CustomerStatementView
                  ref={viewShotRef}
                  data={processedData}
                  company={company}
                  settings={settings}
                  template={template}
                  isDark={isDark}
                />

                <View style={[styles.actionBtnRow, { marginTop: 16 }]}>
                  <Pressable
                    onPress={handleShareImage}
                    disabled={sharing}
                    style={[styles.primaryActionBtn, { backgroundColor: accentColor }]}
                  >
                    {sharing ? (
                      <ActivityIndicator color="#FFF" size="small" />
                    ) : (
                      <>
                        <MaterialIcons name="share" size={20} color="#FFF" />
                        <Text style={styles.primaryActionText}>Share Statement Image</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
            )}

            {/* ────────── TAB 3: PDF STATEMENT ────────── */}
            {activeTab === 'PDF' && (
              <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                <View style={[styles.pdfIconBg, { backgroundColor: '#EF444415' }]}>
                  <MaterialIcons name="picture-as-pdf" size={48} color="#EF4444" />
                </View>
                <Text style={[styles.pdfTitle, { color: textColor }]}>Formal Account Statement (PDF)</Text>
                <Text style={[styles.pdfDesc, { color: subTextColor }]}>
                  Generates an A4 Customer Statement with full ledger history table, itemized order records, payments, running balance, and signature.
                </Text>

                <Pressable
                  onPress={handleExportPdf}
                  disabled={sharing}
                  style={[styles.primaryActionBtn, { backgroundColor: '#EF4444', width: '100%', marginTop: 20 }]}
                >
                  {sharing ? (
                    <ActivityIndicator color="#FFF" size="small" />
                  ) : (
                    <>
                      <MaterialIcons name="picture-as-pdf" size={20} color="#FFF" />
                      <Text style={styles.primaryActionText}>Export & Share PDF</Text>
                    </>
                  )}
                </Pressable>
              </View>
            )}
          </ScrollView>
        </View>
      </View>

      <ShareSettingsModal
        visible={settingsModalVisible}
        onClose={() => setSettingsModalVisible(false)}
        settings={settings}
        onSettingsUpdated={(newSettings) => {
          setSettings(newSettings);
          const text = customerShareService.formatCustomerShareText(processedData, company, newSettings);
          setCustomMessage(text);
        }}
        isDark={isDark}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    maxHeight: '90%',
    flexShrink: 1,
  },
  sheetHeader: {
    alignItems: 'center',
    paddingTop: 8,
    paddingHorizontal: 16,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    marginBottom: 10,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  sheetSubTitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  tabBar: {
    flexDirection: 'row',
    width: '100%',
    borderBottomWidth: 1,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  tabLabel: {
    fontSize: 12,
  },
  contentScroll: {
    flexGrow: 1,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  messageInput: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    fontSize: 13,
    minHeight: 160,
    textAlignVertical: 'top',
  },
  actionBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  primaryActionBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  secondaryActionBtn: {
    paddingHorizontal: 16,
    height: 46,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  secondaryActionText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  subActionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 14,
  },
  subBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 8,
  },
  subBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  pdfIconBg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  pdfTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  pdfDesc: {
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 18,
  },
});
