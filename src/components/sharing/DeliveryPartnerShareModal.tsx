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
  Platform,
  Clipboard,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import {
  deliveryPartnerShareService,
  DeliveryPartnerShareData,
  DeliveryTripItem,
  DeliveryPaymentItem,
  DeliveryBonusItem,
  DeliveryPartnerPurchasedOrderItem,
} from '../../services/sharing/deliveryPartnerShareService';
import { useTheme } from '../../../app/context/ThemeContext';

interface DeliveryPartnerShareModalProps {
  visible: boolean;
  onClose: () => void;
  partner: any;
  trips: DeliveryTripItem[];
  payments: DeliveryPaymentItem[];
  bonuses: DeliveryBonusItem[];
  purchasedOrders?: DeliveryPartnerPurchasedOrderItem[];
  company?: any;
  initialDateFilter?: string;
}

type TabType = 'TEXT' | 'PDF' | 'IMAGE';

export function DeliveryPartnerShareModal({
  visible,
  onClose,
  partner,
  trips = [],
  payments = [],
  bonuses = [],
  purchasedOrders = [],
  company = {},
  initialDateFilter = 'all',
}: DeliveryPartnerShareModalProps) {
  const { theme } = useTheme();
  const { colors, isDark } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);

  const [activeTab, setActiveTab] = useState<TabType>('TEXT');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all');
  const [sharing, setSharing] = useState(false);
  const [customText, setCustomText] = useState('');
  const [copied, setCopied] = useState(false);

  // Options toggles
  const [includeTrips, setIncludeTrips] = useState(true);
  const [includePayments, setIncludePayments] = useState(true);
  const [includeBonuses, setIncludeBonuses] = useState(true);
  const [includePurchasedOrders, setIncludePurchasedOrders] = useState(true);

  const viewShotRef = useRef<View>(null);

  useEffect(() => {
    if (visible) {
      setActiveTab('TEXT');
      setSelectedPeriod(initialDateFilter || 'all');
      setCopied(false);
    }
  }, [visible, initialDateFilter]);

  // Filter items based on selected period
  const filteredData = useMemo(() => {
    const isDateInFilter = (dateVal?: Date | string) => {
      if (selectedPeriod === 'all') return true;
      if (!dateVal) return false;
      const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
      if (isNaN(d.getTime())) return false;
      const now = new Date();

      if (selectedPeriod === 'today') {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        return d >= start && d <= end;
      }

      if (selectedPeriod === 'week') {
        const day = now.getDay();
        const diffToMon = (day === 0 ? -6 : 1) - day;
        const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMon);
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        return d >= mon && d <= end;
      }

      if (selectedPeriod === 'month') {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        return d >= start && d <= end;
      }

      if (selectedPeriod === 'year') {
        const start = new Date(now.getFullYear(), 0, 1);
        const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
        return d >= start && d <= end;
      }

      return true;
    };

    const selTrips = trips.filter((t) => isDateInFilter(t.createdAt));
    const selPayments = payments.filter((p) => isDateInFilter(p.createdAt));
    const selBonuses = bonuses.filter((b) => isDateInFilter(b.createdAt));
    const selPurchasedOrders = purchasedOrders.filter((o) => isDateInFilter(o.createdAt));

    const totalPayable = selTrips.reduce((sum, t) => sum + Number(t.deliveryCharge || 0), 0);
    const totalPaid = selPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const totalBonuses = selBonuses.reduce((sum, b) => sum + Number(b.amount || 0), 0);

    let totalOrderVal = 0;
    let totalOrderPaid = 0;
    let totalOrderDue = 0;
    let totalOrderItemsCount = 0;

    selPurchasedOrders.forEach((ord) => {
      totalOrderVal += Number(ord.total || 0);
      totalOrderPaid += Number(ord.paidAmount || 0);
      totalOrderDue += Number(ord.balanceDue || 0);
      const qty = ord.items && ord.items.length > 0
        ? ord.items.reduce((s, itm) => s + Number(itm.quantity || itm.qty || 0), 0)
        : Number(ord.quantity || 0);
      totalOrderItemsCount += qty;
    });

    // If 'all' and partner has global totalPending, we can respect that or calculate dynamic
    const netPending = selectedPeriod === 'all' && partner?.totalPending !== undefined
      ? Number(partner.totalPending)
      : totalPayable - totalPaid;

    const shareData: DeliveryPartnerShareData = {
      partner: {
        id: partner?.id || '',
        name: partner?.name || 'Delivery Partner',
        mobile: partner?.mobile || '',
        vehicleType: partner?.vehicleType || '',
        vehicleNumber: partner?.vehicleNumber || '',
        address: partner?.address || '',
        deliveryRateType: partner?.deliveryRateType || '',
        deliveryRate: partner?.deliveryRate || 0,
        minimumRate: partner?.minimumRate || 0,
        status: partner?.status || 'Active',
      },
      trips: selTrips,
      payments: selPayments,
      bonuses: selBonuses,
      purchasedOrders: selPurchasedOrders,
      summary: {
        totalTrips: selTrips.length,
        totalPayable,
        totalBonuses,
        totalPaid,
        netPending,
        totalOrdersPurchased: selPurchasedOrders.length,
        totalOrderValue: totalOrderVal,
        totalOrderPaid,
        totalOrderDue,
        totalOrderItemsCount,
      },
      options: {
        includeTrips,
        includePayments,
        includeBonuses,
        includePurchasedOrders,
      },
    };

    return shareData;
  }, [trips, payments, bonuses, purchasedOrders, partner, selectedPeriod, includeTrips, includePayments, includeBonuses, includePurchasedOrders]);

  const periodLabels: Record<string, string> = {
    all: 'All Time',
    today: 'Today',
    week: 'This Week',
    month: 'This Month',
    year: 'This Year',
  };
  const currentPeriodLabel = periodLabels[selectedPeriod] || 'All Time';

  // Sync formatted text when dependencies change
  useEffect(() => {
    if (visible && partner) {
      const generated = deliveryPartnerShareService.formatPartnerStatementText(
        filteredData,
        company,
        currentPeriodLabel
      );
      setCustomText(generated);
    }
  }, [visible, partner, filteredData, company, currentPeriodLabel]);

  // Handlers
  const handleShareWhatsApp = async () => {
    setSharing(true);
    try {
      await deliveryPartnerShareService.shareText(
        customText,
        partner?.name || 'Partner',
        partner?.mobile
      );
    } finally {
      setSharing(false);
    }
  };

  const handleCopyText = async () => {
    try {
      Clipboard.setString(customText);
      setCopied(true);
      Alert.alert('Copied ✓', 'Statement message copied to clipboard.');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      Alert.alert('Error', 'Failed to copy text.');
    }
  };

  const handleSharePdf = async () => {
    setSharing(true);
    try {
      await deliveryPartnerShareService.sharePdf(filteredData, company, currentPeriodLabel);
    } finally {
      setSharing(false);
    }
  };

  const handlePrint = async () => {
    setSharing(true);
    try {
      await deliveryPartnerShareService.printStatement(filteredData, company, currentPeriodLabel);
    } finally {
      setSharing(false);
    }
  };

  const handleShareImage = async () => {
    if (!viewShotRef.current) {
      Alert.alert('Error', 'Statement view is not ready to capture.');
      return;
    }
    setSharing(true);
    try {
      const uri = await captureRef(viewShotRef, {
        format: 'png',
        quality: 0.95,
        result: 'tmpfile',
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: `Statement - ${partner?.name || 'Partner'}`,
        });
      } else {
        Alert.alert('Image Saved', `Statement image generated at:\n${uri}`);
      }
    } catch (err: any) {
      console.error('Capture statement image error:', err);
      Alert.alert('Sharing Failed', err?.message || 'Could not capture statement image.');
    } finally {
      setSharing(false);
    }
  };

  if (!partner) return null;

  const isAdvance = filteredData.summary.netPending < 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBg}>
        <View style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <View style={styles.headerIconBg}>
                <MaterialIcons name="share" size={20} color={colors.accent.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>Share Partner Statement</Text>
                <Text style={styles.sheetSubtitle} numberOfLines={1}>
                  {partner.name} {partner.vehicleNumber ? `(${partner.vehicleNumber})` : ''}
                </Text>
              </View>
            </View>
            <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8}>
              <MaterialIcons name="close" size={22} color={colors.text.muted} />
            </Pressable>
          </View>

          {/* Period Selector Pills */}
          <View style={styles.periodBarContainer}>
            <Text style={styles.periodBarLabel}>PERIOD:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periodPillsRow}>
              {[
                { id: 'all', label: 'All Time' },
                { id: 'today', label: 'Today' },
                { id: 'week', label: 'This Week' },
                { id: 'month', label: 'This Month' },
                { id: 'year', label: 'This Year' },
              ].map((p) => {
                const active = selectedPeriod === p.id;
                return (
                  <Pressable
                    key={p.id}
                    style={[styles.periodPill, active && styles.periodPillActive]}
                    onPress={() => setSelectedPeriod(p.id)}
                  >
                    <Text style={[styles.periodPillText, active && styles.periodPillTextActive]}>
                      {p.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Format Tabs (Text, PDF, Image) */}
          <View style={styles.tabBar}>
            <Pressable
              style={[styles.tabItem, activeTab === 'TEXT' && styles.tabItemActive]}
              onPress={() => setActiveTab('TEXT')}
            >
              <MaterialIcons
                name="chat"
                size={18}
                color={activeTab === 'TEXT' ? colors.accent.primary : colors.text.muted}
              />
              <Text style={[styles.tabText, activeTab === 'TEXT' && styles.tabTextActive]}>
                WhatsApp / Text
              </Text>
            </Pressable>

            <Pressable
              style={[styles.tabItem, activeTab === 'PDF' && styles.tabItemActive]}
              onPress={() => setActiveTab('PDF')}
            >
              <MaterialIcons
                name="picture-as-pdf"
                size={18}
                color={activeTab === 'PDF' ? colors.accent.primary : colors.text.muted}
              />
              <Text style={[styles.tabText, activeTab === 'PDF' && styles.tabTextActive]}>
                PDF Statement
              </Text>
            </Pressable>

            <Pressable
              style={[styles.tabItem, activeTab === 'IMAGE' && styles.tabItemActive]}
              onPress={() => setActiveTab('IMAGE')}
            >
              <MaterialIcons
                name="image"
                size={18}
                color={activeTab === 'IMAGE' ? colors.accent.primary : colors.text.muted}
              />
              <Text style={[styles.tabText, activeTab === 'IMAGE' && styles.tabTextActive]}>
                Statement Card
              </Text>
            </Pressable>
          </View>

          {/* Body Content by Active Tab */}
          <ScrollView style={styles.bodyScroll} contentContainerStyle={{ paddingBottom: 24 }}>
            {/* ────────── TAB 1: WHATSAPP / TEXT ────────── */}
            {activeTab === 'TEXT' && (
              <View style={styles.tabContent}>
                <View style={styles.previewInfoRow}>
                  <MaterialIcons name="visibility" size={14} color={colors.accent.primary} />
                  <Text style={styles.previewInfoText}>
                    Ready-to-share message preview. You can edit before sending:
                  </Text>
                </View>

                <TextInput
                  style={styles.messageInput}
                  multiline
                  value={customText}
                  onChangeText={setCustomText}
                  textAlignVertical="top"
                  placeholderTextColor={colors.text.muted}
                />

                <View style={styles.actionBtnRow}>
                  <Pressable
                    style={[styles.actionBtn, { backgroundColor: copied ? '#059669' : colors.bg.card, borderWidth: 1, borderColor: colors.border.medium }]}
                    onPress={handleCopyText}
                  >
                    <MaterialIcons name={copied ? 'check' : 'content-copy'} size={18} color={copied ? '#FFFFFF' : colors.text.primary} />
                    <Text style={[styles.actionBtnText, { color: copied ? '#FFFFFF' : colors.text.primary }]}>
                      {copied ? 'Copied!' : 'Copy Text'}
                    </Text>
                  </Pressable>

                  <Pressable
                    style={[styles.actionBtn, { backgroundColor: '#25D366', flex: 1.5 }]}
                    onPress={handleShareWhatsApp}
                    disabled={sharing}
                  >
                    {sharing ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <MaterialIcons name="send" size={18} color="#FFFFFF" />
                        <Text style={[styles.actionBtnText, { color: '#FFFFFF' }]}>
                          Share via WhatsApp
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
            )}

            {/* ────────── TAB 2: PDF STATEMENT ────────── */}
            {activeTab === 'PDF' && (
              <View style={styles.tabContent}>
                {/* PDF Summary Banner */}
                <View style={styles.pdfBannerCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <View style={styles.pdfIconBg}>
                      <MaterialIcons name="description" size={28} color="#EF4444" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pdfBannerTitle}>Official Account Statement (A4 PDF)</Text>
                      <Text style={styles.pdfBannerSub}>
                        Trips ledger, product orders, payments, bonuses, and signatory footer.
                      </Text>
                    </View>
                  </View>

                  {/* Summary Pills Grid */}
                  <View style={styles.summaryMiniGrid}>
                    <View style={styles.summaryMiniCard}>
                      <Text style={styles.summaryMiniLabel}>TRIPS</Text>
                      <Text style={styles.summaryMiniVal}>{filteredData.summary.totalTrips}</Text>
                    </View>
                    <View style={styles.summaryMiniCard}>
                      <Text style={styles.summaryMiniLabel}>EARNINGS</Text>
                      <Text style={[styles.summaryMiniVal, { color: '#16A34A' }]}>
                        ₹{filteredData.summary.totalPayable.toLocaleString('en-IN')}
                      </Text>
                    </View>
                    <View style={styles.summaryMiniCard}>
                      <Text style={styles.summaryMiniLabel}>PAID</Text>
                      <Text style={styles.summaryMiniVal}>
                        ₹{filteredData.summary.totalPaid.toLocaleString('en-IN')}
                      </Text>
                    </View>
                    <View style={[styles.summaryMiniCard, { backgroundColor: isAdvance ? '#ECFDF5' : '#FEF2F2' }]}>
                      <Text style={[styles.summaryMiniLabel, { color: isAdvance ? '#047857' : '#B91C1C' }]}>
                        {isAdvance ? 'ADVANCE' : 'DUE'}
                      </Text>
                      <Text style={[styles.summaryMiniVal, { color: isAdvance ? '#059669' : '#DC2626' }]}>
                        ₹{Math.abs(filteredData.summary.netPending).toLocaleString('en-IN')}
                      </Text>
                    </View>
                  </View>

                  {/* Product Orders Mini Info */}
                  {filteredData.purchasedOrders && filteredData.purchasedOrders.length > 0 && (
                    <View style={styles.purchasedOrderMiniBanner}>
                      <MaterialIcons name="shopping-bag" size={14} color="#0284C7" />
                      <Text style={styles.purchasedOrderMiniText}>
                        Includes {filteredData.purchasedOrders.length} product purchases (Total: ₹{(filteredData.summary.totalOrderValue || 0).toLocaleString('en-IN')} | Due: ₹{(filteredData.summary.totalOrderDue || 0).toLocaleString('en-IN')})
                      </Text>
                    </View>
                  )}
                </View>

                {/* Inclusion Options */}
                <View style={styles.optionsContainer}>
                  <Text style={styles.optionsTitle}>STATEMENT INCLUSIONS</Text>

                  <Pressable
                    style={styles.optionRow}
                    onPress={() => setIncludeTrips(!includeTrips)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <MaterialIcons name="local-shipping" size={18} color={colors.accent.primary} />
                      <Text style={styles.optionText}>Itemized Deliveries Ledger ({filteredData.trips.length})</Text>
                    </View>
                    <MaterialIcons
                      name={includeTrips ? 'check-box' : 'check-box-outline-blank'}
                      size={22}
                      color={includeTrips ? colors.accent.primary : colors.text.muted}
                    />
                  </Pressable>

                  <Pressable
                    style={styles.optionRow}
                    onPress={() => setIncludePurchasedOrders(!includePurchasedOrders)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <MaterialIcons name="shopping-bag" size={18} color="#0284C7" />
                      <Text style={styles.optionText}>Product Orders Purchased ({(filteredData.purchasedOrders || []).length})</Text>
                    </View>
                    <MaterialIcons
                      name={includePurchasedOrders ? 'check-box' : 'check-box-outline-blank'}
                      size={22}
                      color={includePurchasedOrders ? '#0284C7' : colors.text.muted}
                    />
                  </Pressable>

                  <Pressable
                    style={styles.optionRow}
                    onPress={() => setIncludePayments(!includePayments)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <MaterialIcons name="payment" size={18} color="#059669" />
                      <Text style={styles.optionText}>Payment Records ({filteredData.payments.length})</Text>
                    </View>
                    <MaterialIcons
                      name={includePayments ? 'check-box' : 'check-box-outline-blank'}
                      size={22}
                      color={includePayments ? colors.accent.primary : colors.text.muted}
                    />
                  </Pressable>

                  <Pressable
                    style={[styles.optionRow, { borderBottomWidth: 0 }]}
                    onPress={() => setIncludeBonuses(!includeBonuses)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <MaterialIcons name="stars" size={18} color="#8B5CF6" />
                      <Text style={styles.optionText}>Bonus Rewards ({filteredData.bonuses.length})</Text>
                    </View>
                    <MaterialIcons
                      name={includeBonuses ? 'check-box' : 'check-box-outline-blank'}
                      size={22}
                      color={includeBonuses ? colors.accent.primary : colors.text.muted}
                    />
                  </Pressable>
                </View>

                {/* Actions */}
                <View style={styles.actionBtnRow}>
                  <Pressable
                    style={[styles.actionBtn, { backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.medium }]}
                    onPress={handlePrint}
                    disabled={sharing}
                  >
                    <MaterialIcons name="print" size={18} color={colors.text.primary} />
                    <Text style={[styles.actionBtnText, { color: colors.text.primary }]}>
                      Print Statement
                    </Text>
                  </Pressable>

                  <Pressable
                    style={[styles.actionBtn, { backgroundColor: '#EF4444', flex: 1.4 }]}
                    onPress={handleSharePdf}
                    disabled={sharing}
                  >
                    {sharing ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <MaterialIcons name="picture-as-pdf" size={18} color="#FFFFFF" />
                        <Text style={[styles.actionBtnText, { color: '#FFFFFF' }]}>
                          Share PDF Statement
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
            )}

            {/* ────────── TAB 3: IMAGE STATEMENT ────────── */}
            {activeTab === 'IMAGE' && (
              <View style={styles.tabContent}>
                <View style={styles.previewInfoRow}>
                  <MaterialIcons name="info-outline" size={14} color={colors.accent.primary} />
                  <Text style={styles.previewInfoText}>
                    Visual card snapshot for instant sharing in chats:
                  </Text>
                </View>

                {/* Renderable ViewShot Card */}
                <View
                  ref={viewShotRef}
                  collapsable={false}
                  style={[
                    styles.imageCardContainer,
                    { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' },
                  ]}
                >
                  {/* Company Top Bar */}
                  <View style={styles.imageCardHeader}>
                    <View>
                      <Text style={styles.imageCardCompany}>
                        {company?.businessName || company?.fullName || company?.name || 'My Business App'}
                      </Text>
                      <Text style={styles.imageCardCompanySub}>
                        {company?.mobile ? `📞 ${company.mobile}` : 'Delivery Partner Account Statement'}
                      </Text>
                    </View>
                    <View style={styles.imageCardBadge}>
                      <Text style={styles.imageCardBadgeText}>STATEMENT</Text>
                    </View>
                  </View>

                  <View style={styles.imageCardDivider} />

                  {/* Partner Info */}
                  <View style={styles.imageCardPartnerRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.imageCardPartnerName}>{partner.name}</Text>
                      <Text style={styles.imageCardPartnerSub}>
                        🚛 {partner.vehicleType || 'Vehicle'} {partner.vehicleNumber ? `(${partner.vehicleNumber})` : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.imageCardPeriodTag}>Period: {currentPeriodLabel}</Text>
                      <Text style={styles.imageCardDateTag}>{new Date().toLocaleDateString('en-IN')}</Text>
                    </View>
                  </View>

                  {/* Financial Grid */}
                  <View style={styles.imageCardMetricsGrid}>
                    <View style={styles.imageCardMetric}>
                      <Text style={styles.imageCardMetricLabel}>TRIPS</Text>
                      <Text style={styles.imageCardMetricVal}>{filteredData.summary.totalTrips}</Text>
                    </View>
                    <View style={styles.imageCardMetric}>
                      <Text style={styles.imageCardMetricLabel}>EARNINGS</Text>
                      <Text style={[styles.imageCardMetricVal, { color: '#16A34A' }]}>
                        ₹{filteredData.summary.totalPayable.toLocaleString('en-IN')}
                      </Text>
                    </View>
                    <View style={styles.imageCardMetric}>
                      <Text style={styles.imageCardMetricLabel}>PAID</Text>
                      <Text style={styles.imageCardMetricVal}>
                        ₹{filteredData.summary.totalPaid.toLocaleString('en-IN')}
                      </Text>
                    </View>
                  </View>

                  {/* Highlight Balance Card */}
                  <View
                    style={[
                      styles.imageCardBalanceBox,
                      { backgroundColor: isAdvance ? '#ECFDF5' : '#FEF2F2', borderColor: isAdvance ? '#A7F3D0' : '#FECACA' },
                    ]}
                  >
                    <Text style={[styles.imageCardBalanceLabel, { color: isAdvance ? '#047857' : '#B91C1C' }]}>
                      {isAdvance ? 'ADVANCE PAID TO PARTNER' : 'NET DELIVERY DUE TO PARTNER'}
                    </Text>
                    <Text style={[styles.imageCardBalanceVal, { color: isAdvance ? '#059669' : '#DC2626' }]}>
                      ₹{Math.abs(filteredData.summary.netPending).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </Text>
                  </View>

                  {/* Purchased Orders Snippet (if any) */}
                  {filteredData.purchasedOrders && filteredData.purchasedOrders.length > 0 && (
                    <View style={styles.purchasedOrderImageCardSection}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={styles.purchasedOrderImageTitle}>
                          🛒 PRODUCT PURCHASES ({filteredData.purchasedOrders.length})
                        </Text>
                        <Text style={styles.purchasedOrderImageValue}>
                          ₹{(filteredData.summary.totalOrderValue || 0).toLocaleString('en-IN')}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 9.5, color: (filteredData.summary.totalOrderDue || 0) > 0 ? '#DC2626' : '#059669', fontWeight: '700', marginTop: 1 }}>
                        {(filteredData.summary.totalOrderDue || 0) > 0 ? `Balance Due: ₹${(filteredData.summary.totalOrderDue || 0).toLocaleString('en-IN')}` : 'Purchases Fully Paid ✓'}
                      </Text>
                    </View>
                  )}

                  {/* Recent Deliveries Snippet */}
                  {filteredData.trips.length > 0 && (
                    <View style={{ marginTop: 8 }}>
                      <Text style={styles.imageCardSnippetTitle}>
                        RECENT DELIVERIES ({Math.min(3, filteredData.trips.length)} of {filteredData.trips.length})
                      </Text>
                      {filteredData.trips.slice(0, 3).map((t, idx) => (
                        <View key={t.id || idx} style={styles.imageCardSnippetRow}>
                          <Text style={styles.imageCardSnippetText} numberOfLines={1}>
                            • {t.customerName || 'General Client'} {t.deliveredItem ? `(${t.deliveredItem})` : ''}
                          </Text>
                          <Text style={styles.imageCardSnippetAmount}>
                            ₹{Number(t.deliveryCharge || 0).toLocaleString('en-IN')}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Card Footer */}
                  <View style={styles.imageCardFooter}>
                    <Text style={styles.imageCardFooterText}>Generated via My Business App</Text>
                    <Text style={styles.imageCardFooterText}>Thank you for your service! 🚚</Text>
                  </View>
                </View>

                {/* Share Image Action Button */}
                <View style={[styles.actionBtnRow, { marginTop: 16 }]}>
                  <Pressable
                    style={[styles.actionBtn, { backgroundColor: colors.accent.primary }]}
                    onPress={handleShareImage}
                    disabled={sharing}
                  >
                    {sharing ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <MaterialIcons name="share" size={18} color="#FFFFFF" />
                        <Text style={[styles.actionBtnText, { color: '#FFFFFF' }]}>
                          Share Statement Image
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function getStyles(theme: any) {
  const { colors } = theme;
  return StyleSheet.create({
    modalBg: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'flex-end',
    },
    sheetContainer: {
      backgroundColor: colors.bg.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: '92%',
      width: '100%',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -3 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 10,
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    headerIconBg: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.accent.primary + '18',
      alignItems: 'center',
      justifyContent: 'center',
    },
    sheetTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.text.primary,
    },
    sheetSubtitle: {
      fontSize: 12,
      color: colors.text.muted,
      marginTop: 1,
    },
    closeBtn: {
      padding: 6,
    },
    periodBarContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: colors.bg.primary,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    periodBarLabel: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.text.muted,
      marginRight: 8,
      letterSpacing: 0.5,
    },
    periodPillsRow: {
      flexDirection: 'row',
      gap: 6,
    },
    periodPill: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 14,
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    periodPillActive: {
      backgroundColor: colors.accent.primary,
      borderColor: colors.accent.primary,
    },
    periodPillText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    periodPillTextActive: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
    tabBar: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    tabItem: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 12,
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
    },
    tabItemActive: {
      borderBottomColor: colors.accent.primary,
    },
    tabText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text.muted,
    },
    tabTextActive: {
      color: colors.accent.primary,
      fontWeight: '700',
    },
    bodyScroll: {
      flexGrow: 1,
      maxHeight: '80%',
    },
    tabContent: {
      paddingHorizontal: 16,
      paddingTop: 14,
    },
    previewInfoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 8,
    },
    previewInfoText: {
      fontSize: 11,
      color: colors.text.muted,
      flex: 1,
    },
    messageInput: {
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.medium,
      borderRadius: 12,
      padding: 12,
      fontSize: 12,
      fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
      color: colors.text.primary,
      height: 200,
      lineHeight: 18,
    },
    actionBtnRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 14,
    },
    actionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 12,
      borderRadius: 12,
    },
    actionBtnText: {
      fontSize: 13,
      fontWeight: '700',
    },
    pdfBannerCard: {
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: 14,
      padding: 14,
      marginBottom: 12,
    },
    pdfIconBg: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: '#FEF2F2',
      borderWidth: 1,
      borderColor: '#FECACA',
      alignItems: 'center',
      justifyContent: 'center',
    },
    pdfBannerTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text.primary,
    },
    pdfBannerSub: {
      fontSize: 11,
      color: colors.text.muted,
      marginTop: 2,
    },
    summaryMiniGrid: {
      flexDirection: 'row',
      gap: 6,
    },
    summaryMiniCard: {
      flex: 1,
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: 8,
      padding: 6,
      alignItems: 'center',
    },
    summaryMiniLabel: {
      fontSize: 8.5,
      fontWeight: '700',
      color: colors.text.muted,
      marginBottom: 2,
    },
    summaryMiniVal: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.text.primary,
    },
    purchasedOrderMiniBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 10,
      backgroundColor: '#F0F9FF',
      borderWidth: 1,
      borderColor: '#BAE6FD',
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
    purchasedOrderMiniText: {
      fontSize: 10.5,
      color: '#0369A1',
      fontWeight: '600',
      flex: 1,
    },
    optionsContainer: {
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
    },
    optionsTitle: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.text.muted,
      letterSpacing: 0.5,
      marginBottom: 8,
    },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    optionText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text.primary,
    },
    imageCardContainer: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border.medium,
      padding: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 6,
      elevation: 3,
    },
    imageCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    imageCardCompany: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.text.primary,
    },
    imageCardCompanySub: {
      fontSize: 11,
      color: colors.text.muted,
      marginTop: 1,
    },
    imageCardBadge: {
      backgroundColor: colors.accent.primary,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
    },
    imageCardBadgeText: {
      color: '#FFFFFF',
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    imageCardDivider: {
      height: 1,
      backgroundColor: colors.border.subtle,
      marginVertical: 10,
    },
    imageCardPartnerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    imageCardPartnerName: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text.primary,
    },
    imageCardPartnerSub: {
      fontSize: 11,
      color: colors.text.muted,
      marginTop: 1,
    },
    imageCardPeriodTag: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.accent.primary,
    },
    imageCardDateTag: {
      fontSize: 9.5,
      color: colors.text.muted,
      marginTop: 1,
    },
    imageCardMetricsGrid: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: 10,
    },
    imageCardMetric: {
      flex: 1,
      backgroundColor: colors.bg.primary,
      borderRadius: 8,
      padding: 6,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    imageCardMetricLabel: {
      fontSize: 8.5,
      fontWeight: '700',
      color: colors.text.muted,
      marginBottom: 2,
    },
    imageCardMetricVal: {
      fontSize: 12.5,
      fontWeight: '800',
      color: colors.text.primary,
    },
    imageCardBalanceBox: {
      borderRadius: 10,
      borderWidth: 1,
      padding: 10,
      alignItems: 'center',
      marginBottom: 6,
    },
    imageCardBalanceLabel: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    imageCardBalanceVal: {
      fontSize: 16,
      fontWeight: '900',
    },
    purchasedOrderImageCardSection: {
      backgroundColor: '#F0F9FF',
      borderWidth: 1,
      borderColor: '#BAE6FD',
      borderRadius: 8,
      padding: 8,
      marginTop: 4,
      marginBottom: 4,
    },
    purchasedOrderImageTitle: {
      fontSize: 9.5,
      fontWeight: '800',
      color: '#0369A1',
      letterSpacing: 0.5,
    },
    purchasedOrderImageValue: {
      fontSize: 11,
      fontWeight: '800',
      color: '#0369A1',
    },
    imageCardSnippetTitle: {
      fontSize: 9.5,
      fontWeight: '800',
      color: colors.text.muted,
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    imageCardSnippetRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 2,
    },
    imageCardSnippetText: {
      fontSize: 10.5,
      color: colors.text.secondary,
      flex: 1,
      marginRight: 8,
    },
    imageCardSnippetAmount: {
      fontSize: 10.5,
      fontWeight: '700',
      color: colors.text.primary,
    },
    imageCardFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      borderTopWidth: 1,
      borderTopColor: colors.border.subtle,
      marginTop: 10,
      paddingTop: 6,
    },
    imageCardFooterText: {
      fontSize: 9,
      color: colors.text.muted,
    },
  });
}
