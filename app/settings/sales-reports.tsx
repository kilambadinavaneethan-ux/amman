import React, { useState, useMemo, useContext, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  Dimensions,
  Share as RNShare,
  Platform,
  Switch,
} from 'react-native';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { OrderContext } from '../context/OrderContext';
import { CustomerContext } from '../context/CustomerContext';
import { ItemContext } from '../context/ItemContext';
import { DeliveryPartnerContext } from '../context/DeliveryPartnerContext';
import { UserContext } from '../context/UserContext';
import ProtectedRoute from '../components/ProtectedRoute';
import BackButton from '../components/BackButton';
import {
  ReportPeriod,
  SalesReportFilter,
  SalesReportConfig,
  DEFAULT_SALES_REPORT_CONFIG,
  computeSalesReportData,
  exportSalesReportPdf,
  exportSalesReportCsv,
  printSalesReport,
  formatSalesReportWhatsApp,
  loadSalesReportConfig,
  saveSalesReportConfig,
  formatCurrency,
  formatCurrencyCompact,
  formatDate,
  formatDateShort,
} from '../../src/services/sharing/salesReportService';
import { adaptToTransactionData } from '../../src/utils/transactionAdapter';
import { TransactionShareBottomSheet } from '../../src/components/sharing/TransactionShareBottomSheet';
import { TransactionData } from '../../src/types/sharing';

const PERIOD_OPTIONS: { id: ReportPeriod; label: string; icon: keyof typeof MaterialIcons.glyphMap }[] = [
  { id: 'today', label: 'Today', icon: 'today' },
  { id: 'yesterday', label: 'Yesterday', icon: 'history' },
  { id: 'this_week', label: 'This Week', icon: 'date-range' },
  { id: 'last_week', label: 'Last Week', icon: 'event-repeat' },
  { id: 'this_month', label: 'This Month', icon: 'calendar-month' },
  { id: 'last_month', label: 'Last Month', icon: 'event-note' },
  { id: 'this_quarter', label: 'Quarterly', icon: 'bar-chart' },
  { id: 'this_year', label: 'Yearly', icon: 'calendar-today' },
  { id: 'all_time', label: 'All Time', icon: 'all-inclusive' },
  { id: 'custom', label: 'Custom', icon: 'tune' },
];

const TAB_OPTIONS = [
  { id: 'overview', label: 'Overview', icon: 'insights' },
  { id: 'customers', label: 'Customers', icon: 'people-alt' },
  { id: 'items', label: 'Products', icon: 'inventory-2' },
  { id: 'logistics', label: 'Logistics', icon: 'local-shipping' },
  { id: 'orders', label: 'Invoices', icon: 'receipt-long' },
];

type TrendGranularity = 'day' | 'month' | 'quarter' | 'year';

const GRANULARITY_OPTIONS: { id: TrendGranularity; label: string; icon: keyof typeof MaterialIcons.glyphMap }[] = [
  { id: 'day', label: 'Day Wise', icon: 'today' },
  { id: 'month', label: 'Month Wise', icon: 'calendar-month' },
  { id: 'quarter', label: 'Quarter Wise', icon: 'pie-chart' },
  { id: 'year', label: 'Year Wise', icon: 'bar-chart' },
];

export default function SalesReportScreen() {
  const { theme } = useTheme();
  const { colors, spacing, radius, shadows } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const router = useRouter();

  // Contexts
  const { orders = [], loading: loadingOrders } = (useContext(OrderContext) as any) || {};
  const { customers = [] } = (useContext(CustomerContext) as any) || {};
  const { items = [] } = (useContext(ItemContext) as any) || {};
  const { partners = [] } = (useContext(DeliveryPartnerContext) as any) || {};
  const { profile } = (useContext(UserContext) as any) || {};

  // Config State
  const [config, setConfig] = useState<SalesReportConfig>(DEFAULT_SALES_REPORT_CONFIG);
  const [configLoaded, setConfigLoaded] = useState(false);

  // Filter State
  const [selectedPeriod, setSelectedPeriod] = useState<ReportPeriod>('this_month');
  const [trendGranularity, setTrendGranularity] = useState<TrendGranularity>('day');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'pending' | 'partial' | 'cancelled'>('all');
  const [activeTab, setActiveTab] = useState('overview');

  // Custom Date Modal
  const [customModalVisible, setCustomModalVisible] = useState(false);
  const [customStartInput, setCustomStartInput] = useState('');
  const [customEndInput, setCustomEndInput] = useState('');
  const [customStartDate, setCustomStartDate] = useState<Date | null>(null);
  const [customEndDate, setCustomEndDate] = useState<Date | null>(null);

  // Settings & Target Modals
  const [targetModalVisible, setTargetModalVisible] = useState(false);
  const [targetInput, setTargetInput] = useState('500000');
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);

  // Order Details / Share Modal
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [shareBottomSheetVisible, setShareBottomSheetVisible] = useState(false);
  const [sharingTransactionData, setSharingTransactionData] = useState<TransactionData | null>(null);

  // Loading & Processing Flags
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

  // Load Saved Configuration
  useEffect(() => {
    loadSalesReportConfig().then((cfg) => {
      setConfig(cfg);
      if (cfg.defaultPeriod && cfg.defaultPeriod !== 'this_month') {
        setSelectedPeriod(cfg.defaultPeriod);
      }
      setTargetInput(String(cfg.monthlyTarget || 500000));
      setConfigLoaded(true);
    });
  }, []);

  // Filter Configuration
  const filter: SalesReportFilter = useMemo(
    () => ({
      period: selectedPeriod,
      customStartDate,
      customEndDate,
      searchQuery,
      statusFilter,
    }),
    [selectedPeriod, customStartDate, customEndDate, searchQuery, statusFilter]
  );

  // Compute Sales Report Data
  const reportData = useMemo(() => {
    return computeSalesReportData(orders, customers, items, partners, filter);
  }, [orders, customers, items, partners, filter]);

  // Active trend series based on granularity (Day / Month / Quarter / Year)
  const currentTrends = useMemo(() => {
    switch (trendGranularity) {
      case 'month':
        return reportData.monthlyTrends || [];
      case 'quarter':
        return reportData.quarterlyTrends || [];
      case 'year':
        return reportData.yearlyTrends || [];
      case 'day':
      default:
        return reportData.dailyTrends || [];
    }
  }, [reportData, trendGranularity]);

  const companyData = useMemo(() => {
    return {
      name: profile?.businessName || 'Business Suite Enterprise',
      businessName: profile?.businessName || 'Business Suite Enterprise',
      phone: profile?.phone || '',
      email: profile?.email || '',
      address: profile?.address || '',
      gstNo: config.companyGstNo || profile?.gstNo || '',
      upiId: profile?.upiId || '',
    };
  }, [profile, config]);

  // Dynamic Target Calculations tailored to the selected period & pacing
  const targetMetrics = useMemo(() => {
    const baseMonthlyTarget = Number(config.monthlyTarget) || 500000;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentDay = now.getDate();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysPassedInMonth = Math.max(1, currentDay);
    const daysRemainingInMonth = Math.max(0, daysInMonth - currentDay);

    let periodTarget = baseMonthlyTarget;
    let targetPeriodLabel = 'Monthly Sales Goal';
    let daysInPeriod = daysInMonth;
    let daysRemaining = daysRemainingInMonth;
    let daysPassed = daysPassedInMonth;

    if (selectedPeriod === 'today' || selectedPeriod === 'yesterday') {
      periodTarget = Math.round(baseMonthlyTarget / daysInMonth);
      targetPeriodLabel = selectedPeriod === 'today' ? "Today's Target" : "Yesterday's Target";
      daysInPeriod = 1;
      daysRemaining = selectedPeriod === 'today' ? 1 : 0;
      daysPassed = 1;
    } else if (selectedPeriod === 'this_week' || selectedPeriod === 'last_week') {
      periodTarget = Math.round(baseMonthlyTarget / 4.33);
      targetPeriodLabel = selectedPeriod === 'this_week' ? "This Week's Goal" : "Last Week's Target";
      daysInPeriod = 7;
      daysRemaining = selectedPeriod === 'this_week' ? Math.max(1, 7 - now.getDay()) : 0;
      daysPassed = Math.max(1, 7 - daysRemaining);
    } else if (selectedPeriod === 'this_quarter') {
      periodTarget = baseMonthlyTarget * 3;
      targetPeriodLabel = 'Quarterly Sales Goal';
      const quarterStartMonth = Math.floor(currentMonth / 3) * 3;
      const quarterEndDate = new Date(currentYear, quarterStartMonth + 3, 0);
      daysInPeriod = 91;
      daysPassed = Math.max(1, Math.round((now.getTime() - new Date(currentYear, quarterStartMonth, 1).getTime()) / (1000 * 60 * 60 * 24)));
      daysRemaining = Math.max(1, Math.round((quarterEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    } else if (selectedPeriod === 'this_year') {
      periodTarget = baseMonthlyTarget * 12;
      targetPeriodLabel = 'Annual Sales Goal';
      const startOfYear = new Date(currentYear, 0, 1);
      const endOfYear = new Date(currentYear, 11, 31);
      daysInPeriod = 365;
      daysPassed = Math.max(1, Math.round((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)));
      daysRemaining = Math.max(1, Math.round((endOfYear.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    } else if (selectedPeriod === 'last_month') {
      periodTarget = baseMonthlyTarget;
      targetPeriodLabel = "Last Month's Target";
      daysInPeriod = daysInMonth;
      daysRemaining = 0;
      daysPassed = daysInMonth;
    } else if (selectedPeriod === 'all_time') {
      periodTarget = baseMonthlyTarget * 12;
      targetPeriodLabel = 'All-Time Sales Target';
      daysInPeriod = 365;
      daysRemaining = 0;
      daysPassed = 365;
    } else if (selectedPeriod === 'custom' && customStartDate && customEndDate) {
      const daysCount = Math.max(1, Math.round((customEndDate.getTime() - customStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
      periodTarget = Math.round((baseMonthlyTarget / 30) * daysCount);
      targetPeriodLabel = `Custom Goal (${daysCount}d)`;
      daysInPeriod = daysCount;
      daysRemaining = Math.max(0, Math.round((customEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      daysPassed = Math.max(1, daysCount - daysRemaining);
    }

    const currentSales = reportData.metrics.totalSales;
    const achievedPercent = periodTarget > 0 ? (currentSales / periodTarget) * 100 : 0;
    const progressClamped = Math.min(100, Math.max(0, Math.round(achievedPercent)));
    const isGoalMet = currentSales >= periodTarget;
    const deficit = isGoalMet ? 0 : periodTarget - currentSales;
    const surplus = isGoalMet ? currentSales - periodTarget : 0;

    // Expected pace based on days elapsed in period
    const expectedPacePercent = daysInPeriod > 0 ? Math.min(100, (daysPassed / daysInPeriod) * 100) : 100;
    const expectedSalesToDate = (periodTarget * expectedPacePercent) / 100;
    const paceDifference = currentSales - expectedSalesToDate;

    let paceStatus: 'ahead' | 'on_track' | 'behind' | 'completed' = 'on_track';
    let paceStatusLabel = 'Pacing Steady 🎯';
    let paceStatusColor = colors.accent.primary;
    let paceIcon: keyof typeof MaterialIcons.glyphMap = 'trending-flat';

    if (isGoalMet) {
      paceStatus = 'completed';
      paceStatusLabel = 'Goal Crushed! 🏆';
      paceStatusColor = colors.accent.success;
      paceIcon = 'emoji-events';
    } else if (paceDifference >= periodTarget * 0.05) {
      paceStatus = 'ahead';
      paceStatusLabel = `Ahead by ${formatCurrencyCompact(paceDifference)} 🚀`;
      paceStatusColor = colors.accent.success;
      paceIcon = 'trending-up';
    } else if (paceDifference <= -periodTarget * 0.05) {
      paceStatus = 'behind';
      paceStatusLabel = `Behind by ${formatCurrencyCompact(Math.abs(paceDifference))} ⚠️`;
      paceStatusColor = colors.accent.danger;
      paceIcon = 'trending-down';
    } else {
      paceStatus = 'on_track';
      paceStatusLabel = 'Pacing Steady 🎯';
      paceStatusColor = colors.accent.primary;
      paceIcon = 'check-circle';
    }

    // Required daily run rate for remaining days
    const activeDaysLeft = Math.max(1, daysRemaining);
    const dailyRunRateNeeded = !isGoalMet && daysRemaining > 0 ? deficit / activeDaysLeft : 0;

    // Projected finish
    const currentDailyRate = daysPassed > 0 ? currentSales / daysPassed : currentSales;
    const projectedTotal = daysRemaining > 0 ? currentSales + currentDailyRate * daysRemaining : currentSales;
    const projectedPercent = periodTarget > 0 ? (projectedTotal / periodTarget) * 100 : 0;

    return {
      baseMonthlyTarget,
      periodTarget,
      targetPeriodLabel,
      currentSales,
      achievedPercent,
      progressClamped,
      isGoalMet,
      deficit,
      surplus,
      daysInPeriod,
      daysPassed,
      daysRemaining,
      dailyRunRateNeeded,
      expectedPacePercent,
      paceStatus,
      paceStatusLabel,
      paceStatusColor,
      paceIcon,
      projectedTotal,
      projectedPercent,
    };
  }, [config.monthlyTarget, selectedPeriod, reportData.metrics.totalSales, customStartDate, customEndDate, colors]);

  // Handle Export PDF
  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      await exportSalesReportPdf(reportData, companyData, config);
    } catch (e: any) {
      Alert.alert('Export Error', e?.message || 'Failed to export PDF');
    } finally {
      setExportingPdf(false);
    }
  };

  // Handle Export CSV
  const handleExportCsv = async () => {
    setExportingCsv(true);
    try {
      await exportSalesReportCsv(reportData, companyData);
    } catch (e: any) {
      Alert.alert('CSV Error', e?.message || 'Failed to export CSV');
    } finally {
      setExportingCsv(false);
    }
  };

  // Handle Direct Print
  const handlePrint = async () => {
    try {
      await printSalesReport(reportData, companyData, config);
    } catch (e: any) {
      Alert.alert('Print Error', e?.message || 'Failed to print');
    }
  };

  // Handle Share WhatsApp
  const handleShareWhatsApp = async () => {
    try {
      const text = formatSalesReportWhatsApp(reportData, companyData, config);
      await RNShare.share({
        message: text,
        title: `Sales Report (${reportData.formattedDateRange})`,
      });
    } catch (e: any) {
      Alert.alert('Share Error', e?.message || 'Failed to share');
    }
  };

  // Handle Save Target
  const handleSaveTarget = async () => {
    const num = parseFloat(targetInput);
    if (isNaN(num) || num <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid positive target amount.');
      return;
    }
    const updated = { ...config, monthlyTarget: num };
    setConfig(updated);
    await saveSalesReportConfig(updated);
    setTargetModalVisible(false);
    Alert.alert('Target Saved', `Monthly sales target set to ${formatCurrency(num)}.`);
  };

  // Handle Save Custom Date Range
  const handleApplyCustomDates = () => {
    if (!customStartInput || !customEndInput) {
      Alert.alert('Missing Dates', 'Please provide both start date and end date (YYYY-MM-DD).');
      return;
    }
    const start = new Date(customStartInput);
    const end = new Date(customEndInput);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      Alert.alert('Invalid Date Format', 'Please enter valid dates in YYYY-MM-DD format (e.g. 2026-02-01).');
      return;
    }
    if (start > end) {
      Alert.alert('Invalid Range', 'Start date cannot be after end date.');
      return;
    }
    setCustomStartDate(start);
    setCustomEndDate(end);
    setSelectedPeriod('custom');
    setCustomModalVisible(false);
  };

  // Handle Open Order Share
  const handleOpenOrderShare = (order: any) => {
    const adapted = adaptToTransactionData(order, 'invoice', profile);
    setSharingTransactionData(adapted);
    setShareBottomSheetVisible(true);
  };

  return (
    <ProtectedRoute>
      <View style={styles.screen}>
        {/* Top App Header */}
        <View style={styles.topHeader}>
          <View style={styles.headerLeft}>
            <BackButton />
            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">
                Sales Report
              </Text>
              <Text style={styles.headerSubtitle} numberOfLines={1} ellipsizeMode="tail">
                {reportData.formattedDateRange}
              </Text>
            </View>
          </View>

          {/* Header Right Quick Action: Settings Modal */}
          <Pressable
            style={({ pressed }) => [styles.headerSettingsBtn, pressed && styles.btnPressed]}
            onPress={() => setSettingsModalVisible(true)}
            accessibilityLabel="Report Settings"
          >
            <MaterialIcons name="tune" size={20} color={colors.text.primary} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Quick Action & Export Toolbar */}
          <View style={styles.actionToolbarContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.actionToolbarScroll}
            >
              {/* PDF Export */}
              <Pressable
                style={({ pressed }) => [
                  styles.actionToolbarCard,
                  styles.actionPdfCard,
                  pressed && styles.btnPressed,
                ]}
                onPress={handleExportPdf}
                disabled={exportingPdf}
              >
                {exportingPdf ? (
                  <ActivityIndicator size="small" color={colors.accent.primary} />
                ) : (
                  <View style={[styles.actionIconCircle, { backgroundColor: `${colors.accent.primary}18` }]}>
                    <MaterialIcons name="picture-as-pdf" size={18} color={colors.accent.primary} />
                  </View>
                )}
                <View style={styles.actionTextWrap}>
                  <Text style={[styles.actionToolbarTitle, { color: colors.accent.primary }]}>Export PDF</Text>
                  <Text style={styles.actionToolbarSub}>Official Report</Text>
                </View>
              </Pressable>

              {/* CSV Export */}
              <Pressable
                style={({ pressed }) => [
                  styles.actionToolbarCard,
                  styles.actionCsvCard,
                  pressed && styles.btnPressed,
                ]}
                onPress={handleExportCsv}
                disabled={exportingCsv}
              >
                {exportingCsv ? (
                  <ActivityIndicator size="small" color={colors.accent.success} />
                ) : (
                  <View style={[styles.actionIconCircle, { backgroundColor: `${colors.accent.success}18` }]}>
                    <MaterialIcons name="grid-on" size={18} color={colors.accent.success} />
                  </View>
                )}
                <View style={styles.actionTextWrap}>
                  <Text style={[styles.actionToolbarTitle, { color: colors.accent.success }]}>Excel / CSV</Text>
                  <Text style={styles.actionToolbarSub}>Spreadsheet</Text>
                </View>
              </Pressable>

              {/* WhatsApp Share */}
              <Pressable
                style={({ pressed }) => [
                  styles.actionToolbarCard,
                  styles.actionWaCard,
                  pressed && styles.btnPressed,
                ]}
                onPress={handleShareWhatsApp}
              >
                <View style={[styles.actionIconCircle, { backgroundColor: '#25D36618' }]}>
                  <MaterialIcons name="share" size={18} color="#25D366" />
                </View>
                <View style={styles.actionTextWrap}>
                  <Text style={[styles.actionToolbarTitle, { color: '#16a34a' }]}>WhatsApp</Text>
                  <Text style={styles.actionToolbarSub}>Summary</Text>
                </View>
              </Pressable>

              {/* Print */}
              <Pressable
                style={({ pressed }) => [
                  styles.actionToolbarCard,
                  styles.actionPrintCard,
                  pressed && styles.btnPressed,
                ]}
                onPress={handlePrint}
              >
                <View style={[styles.actionIconCircle, { backgroundColor: `${colors.text.secondary}15` }]}>
                  <MaterialIcons name="print" size={18} color={colors.text.primary} />
                </View>
                <View style={styles.actionTextWrap}>
                  <Text style={styles.actionToolbarTitle}>Print</Text>
                  <Text style={styles.actionToolbarSub}>Paper / POS</Text>
                </View>
              </Pressable>

              {/* Report Settings */}
              <Pressable
                style={({ pressed }) => [
                  styles.actionToolbarCard,
                  styles.actionSettingsCard,
                  pressed && styles.btnPressed,
                ]}
                onPress={() => setSettingsModalVisible(true)}
              >
                <View style={[styles.actionIconCircle, { backgroundColor: `${colors.accent.primary}12` }]}>
                  <MaterialIcons name="tune" size={18} color={colors.accent.primary} />
                </View>
                <View style={styles.actionTextWrap}>
                  <Text style={styles.actionToolbarTitle}>Settings</Text>
                  <Text style={styles.actionToolbarSub}>GST & Target</Text>
                </View>
              </Pressable>
            </ScrollView>
          </View>
          {/* Time Period Selector Chips */}
          <View style={styles.periodContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.periodScroll}
            >
              {PERIOD_OPTIONS.map((item) => {
                const isSelected = selectedPeriod === item.id;
                return (
                  <Pressable
                    key={item.id}
                    style={[
                      styles.periodChip,
                      isSelected && styles.periodChipActive,
                    ]}
                    onPress={() => {
                      if (item.id === 'custom') {
                        setCustomModalVisible(true);
                      } else {
                        setSelectedPeriod(item.id);
                      }
                    }}
                  >
                    <MaterialIcons
                      name={item.icon}
                      size={15}
                      color={isSelected ? '#FFFFFF' : colors.text.secondary}
                    />
                    <Text
                      style={[
                        styles.periodChipText,
                        isSelected && styles.periodChipTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Search & Status Filter Bar */}
          <View style={styles.filterSection}>
            <View style={styles.searchBar}>
              <MaterialIcons name="search" size={18} color={colors.text.muted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by customer, invoice #, phone..."
                placeholderTextColor={colors.text.muted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                clearButtonMode="while-editing"
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                  <MaterialIcons name="close" size={16} color={colors.text.muted} />
                </Pressable>
              )}
            </View>

            {/* Status Pills */}
            <View style={styles.statusPillsRow}>
              {[
                { id: 'all', label: 'All Statuses' },
                { id: 'completed', label: 'Paid' },
                { id: 'partial', label: 'Partial' },
                { id: 'pending', label: 'Unpaid' },
                { id: 'cancelled', label: 'Cancelled' },
              ].map((st: any) => {
                const isActive = statusFilter === st.id;
                return (
                  <Pressable
                    key={st.id}
                    style={[styles.statusPill, isActive && styles.statusPillActive]}
                    onPress={() => setStatusFilter(st.id)}
                  >
                    <Text style={[styles.statusPillText, isActive && styles.statusPillTextActive]}>
                      {st.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Navigation Tabs */}
          <View style={styles.tabNavContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabNavScroll}
            >
              {TAB_OPTIONS.map((tab) => {
                const isTabActive = activeTab === tab.id;
                return (
                  <Pressable
                    key={tab.id}
                    style={[styles.tabNavItem, isTabActive && styles.tabNavItemActive]}
                    onPress={() => setActiveTab(tab.id)}
                  >
                    <MaterialIcons
                      name={tab.icon as any}
                      size={16}
                      color={isTabActive ? colors.accent.primary : colors.text.secondary}
                    />
                    <Text style={[styles.tabNavText, isTabActive && styles.tabNavTextActive]}>
                      {tab.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Tab Content 1: Overview & Analytics */}
          {activeTab === 'overview' && (
            <View style={styles.tabContent}>
              {/* Sales Activity Timeline with Granularity Breakdown */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitleWrap}>
                    <MaterialIcons name="auto-graph" size={18} color={colors.accent.primary} />
                    <Text style={styles.sectionTitle}>Sales Activity Timeline</Text>
                  </View>
                  <Text style={styles.sectionMeta}>
                    {currentTrends.length} {trendGranularity === 'day' ? 'Active Days' : trendGranularity === 'month' ? 'Active Months' : trendGranularity === 'quarter' ? 'Active Quarters' : 'Active Years'}
                  </Text>
                </View>

                {/* Granularity Filter Selector: Day Wise / Month Wise / Quarter Wise / Year Wise */}
                <View style={styles.granularityContainer}>
                  {GRANULARITY_OPTIONS.map((g) => {
                    const isGActive = trendGranularity === g.id;
                    return (
                      <Pressable
                        key={g.id}
                        style={[styles.granularityPill, isGActive && styles.granularityPillActive]}
                        onPress={() => setTrendGranularity(g.id)}
                      >
                        <MaterialIcons
                          name={g.icon}
                          size={13}
                          color={isGActive ? '#FFFFFF' : colors.text.secondary}
                        />
                        <Text style={[styles.granularityText, isGActive && styles.granularityTextActive]}>
                          {g.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {currentTrends.length === 0 ? (
                  <View style={styles.emptyWrap}>
                    <MaterialIcons name="event-busy" size={32} color={colors.text.muted} />
                    <Text style={styles.emptyText}>No sales recorded for this timeframe.</Text>
                  </View>
                ) : (
                  <View style={styles.trendList}>
                    {currentTrends.map((trend) => {
                      const maxDaily = Math.max(...currentTrends.map((t) => t.salesAmount || 1));
                      const barPercent = Math.min(100, Math.max(6, Math.round((trend.salesAmount / maxDaily) * 100)));
                      return (
                        <View key={trend.key || trend.dateKey} style={styles.trendRow}>
                          <View style={styles.trendDateCol}>
                            <Text style={styles.trendDate} numberOfLines={1}>
                              {trend.label || trend.dateLabel}
                            </Text>
                            {trend.subLabel ? (
                              <Text style={styles.trendSubLabel} numberOfLines={1}>
                                {trend.subLabel}
                              </Text>
                            ) : null}
                          </View>
                          <View style={styles.trendBarContainer}>
                            <View
                              style={[
                                styles.trendBarFill,
                                {
                                  width: `${barPercent}%`,
                                  backgroundColor:
                                    trendGranularity === 'year'
                                      ? colors.accent.info
                                      : trendGranularity === 'quarter'
                                      ? '#8B5CF6'
                                      : trendGranularity === 'month'
                                      ? colors.accent.success
                                      : colors.accent.primary,
                                },
                              ]}
                            />
                          </View>
                          <View style={styles.trendMeta}>
                            <Text style={styles.trendAmount}>{formatCurrency(trend.salesAmount)}</Text>
                            <Text style={styles.trendOrdersCount}>
                              {trend.ordersCount} ord{trend.unitsCount ? ` • ${trend.unitsCount}u` : ''}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>


              {/* Key Business Performance Highlights */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitleWrap}>
                    <MaterialIcons name="stars" size={18} color={colors.accent.success} />
                    <Text style={styles.sectionTitle}>Executive Highlights</Text>
                  </View>
                </View>
                <View style={styles.highlightRow}>
                  <View style={styles.highlightBox}>
                    <Text style={styles.highlightLabel}>TOP CLIENT</Text>
                    <Text style={styles.highlightVal} numberOfLines={1}>
                      {reportData.customerSummaries[0]?.customerName || 'None'}
                    </Text>
                    <Text style={styles.highlightSub}>
                      {reportData.customerSummaries[0]
                        ? formatCurrency(reportData.customerSummaries[0].totalSales)
                        : '₹0'}
                    </Text>
                  </View>
                  <View style={styles.highlightBox}>
                    <Text style={styles.highlightLabel}>TOP PRODUCT</Text>
                    <Text style={styles.highlightVal} numberOfLines={1}>
                      {reportData.itemSummaries[0]?.itemName || 'None'}
                    </Text>
                    <Text style={styles.highlightSub}>
                      {reportData.itemSummaries[0]
                        ? `${reportData.itemSummaries[0].totalUnits} units sold`
                        : '0 units'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* Tab Content 2: By Customer */}
          {activeTab === 'customers' && (
            <View style={styles.tabContent}>
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitleWrap}>
                    <MaterialIcons name="people-alt" size={18} color={colors.accent.primary} />
                    <Text style={styles.sectionTitle}>Customer Ranking ({reportData.customerSummaries.length})</Text>
                  </View>
                </View>

                {reportData.customerSummaries.length === 0 ? (
                  <View style={styles.emptyWrap}>
                    <MaterialIcons name="person-off" size={32} color={colors.text.muted} />
                    <Text style={styles.emptyText}>No customer records in this period.</Text>
                  </View>
                ) : (
                  reportData.customerSummaries.map((c, idx) => (
                    <View key={c.customerId} style={styles.listItemCard}>
                      <View style={styles.rankBadge}>
                        <Text style={styles.rankText}>#{idx + 1}</Text>
                      </View>
                      <View style={styles.listItemMain}>
                        <View style={styles.listTitleRow}>
                          <Text style={styles.listItemTitle}>{c.customerName}</Text>
                          <Text style={styles.listItemAmount}>{formatCurrency(c.totalSales)}</Text>
                        </View>
                        <Text style={styles.listItemSub}>
                          {c.phone || 'No phone'} • {c.ordersCount} orders • {c.totalUnits} units
                        </Text>
                        <View style={styles.listProgressRow}>
                          <View style={styles.smallProgressTrack}>
                            <View
                              style={[
                                styles.smallProgressFill,
                                {
                                  width: `${Math.min(100, c.sharePercent)}%`,
                                  backgroundColor: colors.accent.primary,
                                },
                              ]}
                            />
                          </View>
                          <Text style={styles.listShareText}>{c.sharePercent.toFixed(1)}% share</Text>
                        </View>
                        <View style={styles.listBottomRow}>
                          <Text style={[styles.paidText, { color: colors.accent.success }]}>
                            Paid: {formatCurrency(c.totalPaid)}
                          </Text>
                          <Text
                            style={[
                              styles.dueText,
                              { color: c.balanceDue > 0 ? colors.accent.danger : colors.accent.success },
                            ]}
                          >
                            {c.balanceDue > 0 ? `Due: ${formatCurrency(c.balanceDue)}` : 'Fully Settled ✅'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))
                )}
              </View>
            </View>
          )}

          {/* Tab Content 3: By Product / Item */}
          {activeTab === 'items' && (
            <View style={styles.tabContent}>
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitleWrap}>
                    <MaterialIcons name="inventory-2" size={18} color={colors.accent.primary} />
                    <Text style={styles.sectionTitle}>Product Velocity ({reportData.itemSummaries.length})</Text>
                  </View>
                </View>

                {reportData.itemSummaries.length === 0 ? (
                  <View style={styles.emptyWrap}>
                    <MaterialIcons name="production-quantity-limits" size={32} color={colors.text.muted} />
                    <Text style={styles.emptyText}>No product sales in this period.</Text>
                  </View>
                ) : (
                  reportData.itemSummaries.map((item, idx) => (
                    <View key={item.itemId} style={styles.listItemCard}>
                      <View style={[styles.rankBadge, { backgroundColor: `${colors.accent.primary}15` }]}>
                        <Text style={[styles.rankText, { color: colors.accent.primary }]}>#{idx + 1}</Text>
                      </View>
                      <View style={styles.listItemMain}>
                        <View style={styles.listTitleRow}>
                          <Text style={styles.listItemTitle}>{item.itemName}</Text>
                          <Text style={styles.listItemAmount}>{formatCurrency(item.totalRevenue)}</Text>
                        </View>
                        <Text style={styles.listItemSub}>
                          {item.totalUnits} Units sold • Avg Rate: {formatCurrency(item.unitPriceAvg)} • {item.ordersCount} Orders
                        </Text>
                        <View style={styles.listProgressRow}>
                          <View style={styles.smallProgressTrack}>
                            <View
                              style={[
                                styles.smallProgressFill,
                                {
                                  width: `${Math.min(100, item.sharePercent)}%`,
                                  backgroundColor: colors.accent.success,
                                },
                              ]}
                            />
                          </View>
                          <Text style={styles.listShareText}>{item.sharePercent.toFixed(1)}% of sales</Text>
                        </View>
                      </View>
                    </View>
                  ))
                )}
              </View>
            </View>
          )}

          {/* Tab Content 4: Logistics & Partners */}
          {activeTab === 'logistics' && (
            <View style={styles.tabContent}>
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitleWrap}>
                    <MaterialIcons name="local-shipping" size={18} color={colors.accent.primary} />
                    <Text style={styles.sectionTitle}>Delivery Partners</Text>
                  </View>
                </View>

                {reportData.deliverySummaries.length === 0 ? (
                  <View style={styles.emptyWrap}>
                    <MaterialIcons name="no-transfer" size={32} color={colors.text.muted} />
                    <Text style={styles.emptyText}>No assigned delivery shipments in this period.</Text>
                  </View>
                ) : (
                  reportData.deliverySummaries.map((p, idx) => (
                    <View key={p.partnerId} style={styles.listItemCard}>
                      <View style={[styles.rankBadge, { backgroundColor: `${colors.accent.info}15` }]}>
                        <Text style={[styles.rankText, { color: colors.accent.info }]}>#{idx + 1}</Text>
                      </View>
                      <View style={styles.listItemMain}>
                        <View style={styles.listTitleRow}>
                          <Text style={styles.listItemTitle}>{p.partnerName}</Text>
                          <Text style={styles.listItemAmount}>{formatCurrency(p.freightTotal)}</Text>
                        </View>
                        <Text style={styles.listItemSub}>{p.ordersCount} Orders Delivered / Handled</Text>
                      </View>
                    </View>
                  ))
                )}
              </View>
            </View>
          )}

          {/* Tab Content 5: Invoices Registry */}
          {activeTab === 'orders' && (
            <View style={styles.tabContent}>
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitleWrap}>
                    <MaterialIcons name="receipt-long" size={18} color={colors.accent.primary} />
                    <Text style={styles.sectionTitle}>Invoices Ledger ({reportData.filteredOrders.length})</Text>
                  </View>
                </View>

                {reportData.filteredOrders.length === 0 ? (
                  <View style={styles.emptyWrap}>
                    <MaterialIcons name="receipt" size={32} color={colors.text.muted} />
                    <Text style={styles.emptyText}>No matching invoices found.</Text>
                  </View>
                ) : (
                  reportData.filteredOrders.map((o) => {
                    const total = Number(o.total || o.totalAmount || 0);
                    const paid = Number(o.paidAmount || o.paid || 0);
                    const due = Math.max(0, total - paid);
                    const invoiceNo = o.invoiceNumber || o.orderNumber || o.id.substring(0, 6).toUpperCase();

                    return (
                      <Pressable
                        key={o.id}
                        style={styles.orderCard}
                        onPress={() => setSelectedOrder(o)}
                      >
                        <View style={styles.orderCardHeader}>
                          <View>
                            <Text style={styles.orderInvoiceNo}>#{invoiceNo}</Text>
                            <Text style={styles.orderDate}>{formatDate(o._orderDate)}</Text>
                          </View>
                          <View
                            style={[
                              styles.statusTag,
                              {
                                backgroundColor:
                                  o._computedStatus === 'completed'
                                    ? '#DCFCE7'
                                    : o._computedStatus === 'partial'
                                    ? '#FEF3C7'
                                    : o._computedStatus === 'cancelled'
                                    ? '#F1F5F9'
                                    : '#FEE2E2',
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusTagText,
                                {
                                  color:
                                    o._computedStatus === 'completed'
                                      ? '#166534'
                                      : o._computedStatus === 'partial'
                                      ? '#92400E'
                                      : o._computedStatus === 'cancelled'
                                      ? '#475569'
                                      : '#991B1B',
                                },
                              ]}
                            >
                              {o._computedStatus.toUpperCase()}
                            </Text>
                          </View>
                        </View>

                        <Text style={styles.orderCustomer}>{o.customerName || 'Customer'}</Text>
                        <Text style={styles.orderItemsSummary} numberOfLines={1}>
                          {Array.isArray(o.items) && o.items.length > 0
                            ? o.items.map((i: any) => `${i.name || i.itemName} (x${i.quantity || i.qty || 1})`).join(', ')
                            : 'Standard Order'}
                        </Text>

                        <View style={styles.orderFooterRow}>
                          <View>
                            <Text style={styles.orderTotalLabel}>Total Amount</Text>
                            <Text style={styles.orderTotalVal}>{formatCurrency(total)}</Text>
                          </View>
                          <View style={styles.orderPaidDueWrap}>
                            <Text style={styles.orderPaidText}>Paid: {formatCurrency(paid)}</Text>
                            {due > 0 ? (
                              <Text style={styles.orderDueText}>Due: {formatCurrency(due)}</Text>
                            ) : (
                              <Text style={styles.orderSettledText}>Settled</Text>
                            )}
                          </View>
                          <Pressable
                            style={styles.orderShareBtn}
                            onPress={(e) => {
                              e.stopPropagation();
                              handleOpenOrderShare(o);
                            }}
                          >
                            <MaterialIcons name="share" size={16} color={colors.accent.primary} />
                          </Pressable>
                        </View>
                      </Pressable>
                    );
                  })
                )}
              </View>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>

        {/* Custom Date Range Modal */}
        <Modal visible={customModalVisible} transparent animationType="fade">
          <View style={styles.modalBg}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Custom Date Range</Text>
                <Pressable onPress={() => setCustomModalVisible(false)}>
                  <MaterialIcons name="close" size={20} color={colors.text.muted} />
                </Pressable>
              </View>

              <Text style={styles.inputLabel}>Start Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="2026-02-01"
                placeholderTextColor={colors.text.muted}
                value={customStartInput}
                onChangeText={setCustomStartInput}
              />

              <Text style={styles.inputLabel}>End Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="2026-02-28"
                placeholderTextColor={colors.text.muted}
                value={customEndInput}
                onChangeText={setCustomEndInput}
              />

              {/* Quick Presets */}
              <Text style={[styles.inputLabel, { marginTop: 12 }]}>Quick Date Presets</Text>
              <View style={styles.presetButtonsRow}>
                <Pressable
                  style={styles.presetBtn}
                  onPress={() => {
                    const end = new Date();
                    const start = new Date();
                    start.setDate(start.getDate() - 7);
                    setCustomStartInput(start.toISOString().split('T')[0]);
                    setCustomEndInput(end.toISOString().split('T')[0]);
                  }}
                >
                  <Text style={styles.presetBtnText}>Last 7d</Text>
                </Pressable>
                <Pressable
                  style={styles.presetBtn}
                  onPress={() => {
                    const end = new Date();
                    const start = new Date();
                    start.setDate(start.getDate() - 30);
                    setCustomStartInput(start.toISOString().split('T')[0]);
                    setCustomEndInput(end.toISOString().split('T')[0]);
                  }}
                >
                  <Text style={styles.presetBtnText}>Last 30d</Text>
                </Pressable>
                <Pressable
                  style={styles.presetBtn}
                  onPress={() => {
                    const end = new Date();
                    const start = new Date();
                    start.setDate(start.getDate() - 90);
                    setCustomStartInput(start.toISOString().split('T')[0]);
                    setCustomEndInput(end.toISOString().split('T')[0]);
                  }}
                >
                  <Text style={styles.presetBtnText}>Last 90d</Text>
                </Pressable>
              </View>

              <Pressable style={styles.modalPrimaryBtn} onPress={handleApplyCustomDates}>
                <Text style={styles.modalPrimaryBtnText}>Apply Filter</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        {/* Set Target Modal */}
        <Modal visible={targetModalVisible} transparent animationType="fade">
          <View style={styles.modalBg}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <MaterialIcons name="track-changes" size={22} color={colors.accent.primary} />
                  <Text style={styles.modalTitle}>Set Sales Target Goal</Text>
                </View>
                <Pressable onPress={() => setTargetModalVisible(false)}>
                  <MaterialIcons name="close" size={20} color={colors.text.muted} />
                </Pressable>
              </View>

              <Text style={styles.modalDesc}>
                Set your baseline monthly sales revenue target. Your daily pacing, milestone progress bars, and required run-rates will update automatically across all period views.
              </Text>

              <Text style={styles.inputLabel}>Monthly Target Goal (₹)</Text>
              <TextInput
                style={styles.modalInput}
                keyboardType="numeric"
                placeholder="500000"
                placeholderTextColor={colors.text.muted}
                value={targetInput}
                onChangeText={setTargetInput}
              />

              {/* Formatted Preview Badge */}
              {parseFloat(targetInput) > 0 && !isNaN(parseFloat(targetInput)) ? (
                <View style={styles.targetPreviewBadge}>
                  <MaterialIcons name="check-circle" size={14} color={colors.accent.success} />
                  <Text style={styles.targetPreviewText}>
                    Monthly Goal: <Text style={{ fontWeight: '800' }}>{formatCurrency(parseFloat(targetInput))}</Text> ({formatCurrencyCompact(parseFloat(targetInput))})
                  </Text>
                </View>
              ) : null}

              {/* Quick Presets */}
              <Text style={[styles.inputLabel, { marginTop: 12 }]}>Quick Presets</Text>
              <View style={styles.presetButtonsRow}>
                {[
                  { label: '₹1 Lakh', val: '100000' },
                  { label: '₹2.5 Lakh', val: '250000' },
                  { label: '₹5 Lakh', val: '500000' },
                  { label: '₹10 Lakh', val: '1000000' },
                  { label: '₹25 Lakh', val: '2500000' },
                  { label: '₹50 Lakh', val: '5000000' },
                  { label: '₹1 Crore', val: '10000000' },
                ].map((item) => {
                  const isPresetActive = targetInput === item.val;
                  return (
                    <Pressable
                      key={item.val}
                      style={[styles.presetBtn, isPresetActive && styles.presetBtnActive]}
                      onPress={() => setTargetInput(item.val)}
                    >
                      <Text style={[styles.presetBtnText, isPresetActive && styles.presetBtnTextActive]}>
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable style={styles.modalPrimaryBtn} onPress={handleSaveTarget}>
                <MaterialIcons name="flag" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.modalPrimaryBtnText}>Save Target Goal</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        {/* Report Preferences Modal */}
        <Modal visible={settingsModalVisible} transparent animationType="fade">
          <View style={styles.modalBg}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Report Preferences</Text>
                <Pressable onPress={() => setSettingsModalVisible(false)}>
                  <MaterialIcons name="close" size={20} color={colors.text.muted} />
                </Pressable>
              </View>

              <Text style={styles.inputLabel}>Business GSTIN (for PDF reports)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="33AAAAA0000A1Z5"
                placeholderTextColor={colors.text.muted}
                value={config.companyGstNo || ''}
                onChangeText={(t) => setConfig((prev) => ({ ...prev, companyGstNo: t }))}
              />

              <Text style={styles.inputLabel}>Custom Footer Note on PDF</Text>
              <TextInput
                style={[styles.modalInput, { height: 64, textAlignVertical: 'top' }]}
                multiline
                placeholder="Thank you for your business..."
                placeholderTextColor={colors.text.muted}
                value={config.customFooterNote || ''}
                onChangeText={(t) => setConfig((prev) => ({ ...prev, customFooterNote: t }))}
              />

              <Pressable
                style={styles.modalPrimaryBtn}
                onPress={async () => {
                  await saveSalesReportConfig(config);
                  setSettingsModalVisible(false);
                  Alert.alert('Preferences Saved', 'Report settings updated successfully.');
                }}
              >
                <Text style={styles.modalPrimaryBtnText}>Save Settings</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        {/* Order Drill-Down Detail Modal */}
        <Modal visible={!!selectedOrder} transparent animationType="fade">
          <View style={styles.modalBg}>
            <View style={[styles.modalContent, { maxHeight: '85%' }]}>
              {selectedOrder && (
                <ScrollView showsVerticalScrollIndicator={false}>
                  <View style={styles.modalHeader}>
                    <View>
                      <Text style={styles.modalTitle}>
                        Invoice #{selectedOrder.invoiceNumber || selectedOrder.orderNumber || selectedOrder.id.substring(0, 6).toUpperCase()}
                      </Text>
                      <Text style={styles.orderDate}>{formatDate(selectedOrder._orderDate)}</Text>
                    </View>
                    <Pressable onPress={() => setSelectedOrder(null)}>
                      <MaterialIcons name="close" size={22} color={colors.text.muted} />
                    </Pressable>
                  </View>

                  <View style={styles.drillSection}>
                    <Text style={styles.drillLabel}>Customer Details</Text>
                    {(() => {
                      const allPhones = (Array.isArray(selectedOrder.customerPhoneNumbers) && selectedOrder.customerPhoneNumbers.length > 0)
                        ? selectedOrder.customerPhoneNumbers.join(', ')
                        : (selectedOrder.customerPhone || '');
                      if (!allPhones) return null;
                      return <Text style={styles.drillSub}>📞 {allPhones}</Text>;
                    })()}
                  </View>

                  {/* Items list */}
                  <View style={styles.drillSection}>
                    <Text style={styles.drillLabel}>Purchased Items</Text>
                    {Array.isArray(selectedOrder.items) && selectedOrder.items.length > 0 ? (
                      selectedOrder.items.map((itm: any, idx: number) => (
                        <View key={idx} style={styles.drillItemRow}>
                          <Text style={styles.drillItemName}>
                            {itm.name || itm.itemName} x{itm.quantity || itm.qty || 1}
                          </Text>
                          <Text style={styles.drillItemPrice}>
                            {formatCurrency(itm.totalPrice || itm.total || (itm.quantity || 1) * (itm.unitPrice || 0))}
                          </Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.drillSub}>Standard Order</Text>
                    )}
                  </View>

                  {/* Financial summary */}
                  <View style={styles.drillSection}>
                    <Text style={styles.drillLabel}>Payment Summary</Text>
                    <View style={styles.drillItemRow}>
                      <Text style={styles.drillSub}>Total Amount</Text>
                      <Text style={styles.drillItemPrice}>
                        {formatCurrency(selectedOrder.total || selectedOrder.totalAmount)}
                      </Text>
                    </View>
                    <View style={styles.drillItemRow}>
                      <Text style={styles.drillSub}>Paid Amount</Text>
                      <Text style={[styles.drillItemPrice, { color: colors.accent.success }]}>
                        {formatCurrency(selectedOrder.paidAmount || selectedOrder.paid || 0)}
                      </Text>
                    </View>
                    <View style={styles.drillItemRow}>
                      <Text style={styles.drillSub}>Balance Due</Text>
                      <Text style={[styles.drillItemPrice, { color: colors.accent.danger }]}>
                        {formatCurrency(Math.max(0, (selectedOrder.total || 0) - (selectedOrder.paidAmount || 0)))}
                      </Text>
                    </View>
                  </View>

                  <Pressable
                    style={styles.modalPrimaryBtn}
                    onPress={() => {
                      const o = selectedOrder;
                      setSelectedOrder(null);
                      handleOpenOrderShare(o);
                    }}
                  >
                    <MaterialIcons name="share" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.modalPrimaryBtnText}>Share Customer Invoice</Text>
                  </Pressable>
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>

        {/* Transaction Share Bottom Sheet */}
        {sharingTransactionData && (
          <TransactionShareBottomSheet
            visible={shareBottomSheetVisible}
            onClose={() => {
              setShareBottomSheetVisible(false);
              setSharingTransactionData(null);
            }}
            transaction={sharingTransactionData}
          />
        )}
      </View>
    </ProtectedRoute>
  );
}

const getStyles = (theme: any) => {
  const { colors, spacing, radius, shadows } = theme;
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.bg.primary,
    },
    topHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
      backgroundColor: colors.bg.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
      ...shadows.subtle,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      flex: 1,
      minWidth: 0,
    },
    headerTitleWrap: {
      marginLeft: 4,
      flex: 1,
      minWidth: 0,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.text.primary,
      letterSpacing: -0.3,
    },
    headerSubtitle: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.text.muted,
      marginTop: 1,
    },
    headerSettingsBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.bg.elevated,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    btnPressed: {
      opacity: 0.7,
      transform: [{ scale: 0.95 }],
    },
    container: {
      flex: 1,
    },
    scrollContent: {
      padding: spacing.md,
    },

    // Action Toolbar
    actionToolbarContainer: {
      marginBottom: spacing.md,
    },
    actionToolbarScroll: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 2,
      paddingVertical: 2,
    },
    actionToolbarCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: radius.md,
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      ...shadows.subtle,
    },
    actionPdfCard: {
      borderColor: `${colors.accent.primary}35`,
      backgroundColor: `${colors.accent.primary}08`,
    },
    actionCsvCard: {
      borderColor: `${colors.accent.success}35`,
      backgroundColor: `${colors.accent.success}08`,
    },
    actionWaCard: {
      borderColor: '#25D36635',
      backgroundColor: '#25D36608',
    },
    actionPrintCard: {
      borderColor: colors.border.subtle,
      backgroundColor: colors.bg.card,
    },
    actionSettingsCard: {
      borderColor: colors.border.subtle,
      backgroundColor: colors.bg.card,
    },
    actionIconCircle: {
      width: 30,
      height: 30,
      borderRadius: 15,
      justifyContent: 'center',
      alignItems: 'center',
    },
    actionTextWrap: {
      justifyContent: 'center',
    },
    actionToolbarTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.text.primary,
    },
    actionToolbarSub: {
      fontSize: 9,
      fontWeight: '500',
      color: colors.text.muted,
      marginTop: 1,
    },

    // Period Chips
    periodContainer: {
      marginBottom: spacing.md,
    },
    periodScroll: {
      gap: 6,
      paddingHorizontal: 2,
    },
    periodChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 7,
      paddingHorizontal: 12,
      borderRadius: 20,
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    periodChipActive: {
      backgroundColor: colors.accent.primary,
      borderColor: colors.accent.primary,
    },
    periodChipText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    periodChipTextActive: {
      color: '#FFFFFF',
      fontWeight: '700',
    },

    // Sales Target Card (Executive Upgrade)
    targetCard: {
      backgroundColor: colors.bg.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: spacing.md,
      marginBottom: spacing.md,
      ...shadows.card,
    },
    targetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
      gap: 8,
    },
    targetHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      flex: 1,
      minWidth: 0,
    },
    targetHeaderRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    targetIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 10,
      justifyContent: 'center',
      alignItems: 'center',
    },
    targetTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.text.primary,
      letterSpacing: -0.2,
    },
    targetSub: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.text.primary,
      marginTop: 1,
    },
    targetAchievedBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: radius.sm,
    },
    targetAchievedText: {
      fontSize: 11,
      fontWeight: '800',
    },
    editTargetBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 5,
      paddingHorizontal: 8,
      borderRadius: radius.sm,
      backgroundColor: `${colors.accent.primary}12`,
      borderWidth: 1,
      borderColor: `${colors.accent.primary}25`,
    },
    editTargetText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.accent.primary,
    },

    // Progress Bar with Milestones
    progressBarWrapper: {
      marginBottom: 10,
    },
    progressBarTrack: {
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.bg.elevated,
      overflow: 'hidden',
      position: 'relative',
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    progressBarFill: {
      height: '100%',
      borderRadius: 5,
    },
    milestoneTick: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      width: 1.5,
      backgroundColor: colors.border.subtle,
    },
    milestoneLabelsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 4,
      paddingHorizontal: 2,
    },
    milestoneLabel: {
      fontSize: 9,
      fontWeight: '600',
      color: colors.text.muted,
    },

    // Pacing Banner
    pacingBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: radius.sm,
      borderWidth: 1,
      marginBottom: 12,
    },
    pacingLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      flex: 1,
    },
    pacingStatusText: {
      fontSize: 11,
      fontWeight: '800',
    },
    pacingProjectedText: {
      fontSize: 11,
      color: colors.text.secondary,
      fontWeight: '600',
    },

    // 4-Metric Grid
    targetMetricsGrid: {
      flexDirection: 'row',
      gap: 6,
    },
    targetMetricBox: {
      flex: 1,
      backgroundColor: colors.bg.elevated,
      borderRadius: radius.sm,
      paddingVertical: 8,
      paddingHorizontal: 6,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    targetMetricLabel: {
      fontSize: 8,
      fontWeight: '700',
      color: colors.text.muted,
      letterSpacing: 0.3,
      marginBottom: 2,
    },
    targetMetricVal: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.text.primary,
      marginBottom: 1,
    },
    targetMetricSub: {
      fontSize: 8,
      color: colors.text.muted,
      fontWeight: '500',
    },

    // KPI Grid
    kpiGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    kpiCard: {
      flexBasis: '48%',
      flexGrow: 1,
      backgroundColor: colors.bg.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: spacing.md,
      ...shadows.subtle,
    },
    kpiCardPrimary: {
      borderColor: `${colors.accent.primary}40`,
      backgroundColor: `${colors.accent.primary}06`,
    },
    kpiCardSuccess: {
      borderColor: `${colors.accent.success}40`,
      backgroundColor: `${colors.accent.success}06`,
    },
    kpiCardWarning: {
      borderColor: `${colors.accent.danger}40`,
      backgroundColor: `${colors.accent.danger}06`,
    },
    kpiTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    kpiLabel: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.text.muted,
      letterSpacing: 0.6,
    },
    growthBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 5,
      paddingVertical: 2,
      borderRadius: 10,
      gap: 2,
    },
    growthText: {
      fontSize: 10,
      fontWeight: '800',
    },
    kpiValue: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.text.primary,
      marginBottom: 4,
    },
    kpiFooterText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.text.secondary,
    },

    // Financial Grid
    financialGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    financialCard: {
      flexBasis: '48%',
      flexGrow: 1,
      backgroundColor: colors.bg.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: spacing.sm,
      ...shadows.subtle,
    },
    financialCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginBottom: 4,
    },
    stripLabel: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.text.muted,
    },
    stripValue: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text.primary,
    },

    // Search & Status Filters
    filterSection: {
      marginBottom: spacing.md,
      gap: spacing.sm,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: radius.md,
      paddingHorizontal: spacing.sm,
      height: 38,
      gap: spacing.xs,
    },
    searchInput: {
      flex: 1,
      fontSize: 13,
      color: colors.text.primary,
      paddingVertical: 0,
    },
    statusPillsRow: {
      flexDirection: 'row',
      gap: 6,
      flexWrap: 'wrap',
    },
    statusPill: {
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: 14,
      backgroundColor: colors.bg.elevated,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    statusPillActive: {
      backgroundColor: `${colors.accent.primary}18`,
      borderColor: colors.accent.primary,
    },
    statusPillText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    statusPillTextActive: {
      color: colors.accent.primary,
      fontWeight: '700',
    },

    // Tab Navigation
    tabNavContainer: {
      marginBottom: spacing.md,
    },
    tabNavScroll: {
      flexDirection: 'row',
      gap: 6,
      backgroundColor: colors.bg.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: 4,
    },
    tabNavItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: radius.sm,
      gap: 5,
    },
    tabNavItemActive: {
      backgroundColor: `${colors.accent.primary}15`,
    },
    tabNavText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    tabNavTextActive: {
      color: colors.accent.primary,
      fontWeight: '800',
    },

    // Tab Contents & Sections
    tabContent: {
      gap: spacing.md,
    },
    sectionCard: {
      backgroundColor: colors.bg.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: spacing.md,
      ...shadows.card,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
      paddingBottom: spacing.sm,
    },
    sectionTitleWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.text.primary,
    },
    sectionMeta: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.text.muted,
    },

    // Empty Wrap
    emptyWrap: {
      paddingVertical: 24,
      alignItems: 'center',
      gap: 8,
    },
    emptyText: {
      fontSize: 13,
      color: colors.text.muted,
      fontWeight: '500',
    },

    // Granularity Breakdown Pills
    granularityContainer: {
      flexDirection: 'row',
      backgroundColor: colors.bg.elevated,
      borderRadius: radius.md,
      padding: 3,
      marginBottom: spacing.md,
      gap: 4,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    granularityPill: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 6,
      paddingHorizontal: 4,
      borderRadius: radius.sm,
      gap: 4,
    },
    granularityPillActive: {
      backgroundColor: colors.accent.primary,
      ...shadows.subtle,
    },
    granularityText: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.text.secondary,
    },
    granularityTextActive: {
      color: '#FFFFFF',
      fontWeight: '800',
    },

    // Trend Timeline
    trendList: {
      gap: 10,
    },
    trendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    trendDateCol: {
      width: 78,
      justifyContent: 'center',
    },
    trendDate: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.text.primary,
    },
    trendSubLabel: {
      fontSize: 8,
      color: colors.text.muted,
      marginTop: 1,
      fontWeight: '500',
    },
    trendBarContainer: {
      flex: 1,
      height: 12,
      backgroundColor: colors.bg.elevated,
      borderRadius: 6,
      overflow: 'hidden',
    },
    trendBarFill: {
      height: '100%',
      backgroundColor: colors.accent.primary,
      borderRadius: 6,
    },
    trendMeta: {
      width: 90,
      alignItems: 'flex-end',
    },
    trendAmount: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.text.primary,
    },
    trendOrdersCount: {
      fontSize: 9,
      fontWeight: '500',
      color: colors.text.muted,
    },

    // Payment Summary Row
    paymentSummaryRow: {
      flexDirection: 'row',
      backgroundColor: colors.bg.elevated,
      borderRadius: radius.md,
      padding: spacing.sm,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      alignItems: 'center',
    },
    paymentSummaryItem: {
      flex: 1,
      alignItems: 'center',
    },
    paymentSummaryLabel: {
      fontSize: 9,
      fontWeight: '700',
      color: colors.text.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    paymentSummaryValue: {
      fontSize: 13,
      fontWeight: '800',
    },
    paymentSummaryDivider: {
      width: 1,
      height: 28,
      backgroundColor: colors.border.subtle,
    },

    // Stacked Horizontal Bar
    stackedBarContainer: {
      flexDirection: 'row',
      height: 14,
      borderRadius: 7,
      overflow: 'hidden',
      marginBottom: spacing.md,
      backgroundColor: colors.bg.elevated,
    },
    stackedBarSegment: {
      height: '100%',
    },

    // Payment Status Grid
    statusGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    statusItemCard: {
      flexBasis: '48%',
      flexGrow: 1,
      backgroundColor: colors.bg.elevated,
      borderRadius: radius.md,
      padding: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    statusItemHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 4,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    statusItemLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.text.secondary,
    },
    statusItemAmount: {
      fontSize: 14,
      fontWeight: '800',
      marginBottom: 2,
    },
    statusItemSubRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    statusItemOrders: {
      fontSize: 10,
      color: colors.text.muted,
      fontWeight: '600',
    },
    statusItemPercent: {
      fontSize: 10,
      fontWeight: '800',
    },
    statusMiniBarTrack: {
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.bg.primary,
      overflow: 'hidden',
    },
    statusMiniBarFill: {
      height: '100%',
      borderRadius: 2,
    },

    // Collection Rate Footer
    collectionRateFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: spacing.md,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border.subtle,
    },
    collectionRateText: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.accent.success,
    },

    // Highlights
    highlightRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    highlightBox: {
      flex: 1,
      backgroundColor: colors.bg.elevated,
      borderRadius: radius.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    highlightLabel: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.text.muted,
      letterSpacing: 0.6,
      marginBottom: 4,
    },
    highlightVal: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.text.primary,
      marginBottom: 2,
    },
    highlightSub: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.accent.primary,
    },

    // Ranked List Item Card (Customer / Product / Logistics)
    listItemCard: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
      gap: spacing.sm,
    },
    rankBadge: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.bg.elevated,
      justifyContent: 'center',
      alignItems: 'center',
    },
    rankText: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.text.secondary,
    },
    listItemMain: {
      flex: 1,
    },
    listTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    listItemTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text.primary,
      flex: 1,
      marginRight: 6,
    },
    listItemAmount: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.text.primary,
    },
    listItemSub: {
      fontSize: 11,
      color: colors.text.muted,
      marginTop: 2,
    },
    listProgressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 4,
    },
    smallProgressTrack: {
      flex: 1,
      height: 5,
      backgroundColor: colors.bg.elevated,
      borderRadius: 3,
      overflow: 'hidden',
    },
    smallProgressFill: {
      height: '100%',
      borderRadius: 3,
    },
    listShareText: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.text.muted,
    },
    listBottomRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 4,
    },
    paidText: {
      fontSize: 11,
      fontWeight: '600',
    },
    dueText: {
      fontSize: 11,
      fontWeight: '700',
    },

    // Order Card
    orderCard: {
      backgroundColor: colors.bg.elevated,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    orderCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 6,
    },
    orderInvoiceNo: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.accent.primary,
    },
    orderDate: {
      fontSize: 11,
      color: colors.text.muted,
      marginTop: 1,
    },
    statusTag: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
    },
    statusTagText: {
      fontSize: 9,
      fontWeight: '800',
    },
    orderCustomer: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text.primary,
      marginBottom: 2,
    },
    orderItemsSummary: {
      fontSize: 11,
      color: colors.text.secondary,
      marginBottom: 8,
    },
    orderFooterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderTopWidth: 1,
      borderTopColor: colors.border.subtle,
      paddingTop: 8,
    },
    orderTotalLabel: {
      fontSize: 10,
      color: colors.text.muted,
    },
    orderTotalVal: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.text.primary,
    },
    orderPaidDueWrap: {
      alignItems: 'flex-end',
    },
    orderPaidText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.accent.success,
    },
    orderDueText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.accent.danger,
    },
    orderSettledText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.accent.success,
    },
    orderShareBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: `${colors.accent.primary}15`,
      justifyContent: 'center',
      alignItems: 'center',
    },

    // Modals
    modalBg: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.lg,
    },
    modalContent: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: colors.bg.card,
      borderRadius: radius.xl,
      padding: spacing.xl,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      ...shadows.elevated,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
    },
    modalTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.text.primary,
    },
    modalDesc: {
      fontSize: 12,
      color: colors.text.secondary,
      lineHeight: 18,
      marginBottom: spacing.md,
    },
    inputLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.text.secondary,
      marginBottom: 4,
      marginTop: 6,
    },
    modalInput: {
      backgroundColor: colors.bg.elevated,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 8,
      fontSize: 13,
      color: colors.text.primary,
      marginBottom: spacing.sm,
    },
    targetPreviewBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: `${colors.accent.success}15`,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: `${colors.accent.success}30`,
      marginBottom: spacing.xs,
    },
    targetPreviewText: {
      fontSize: 12,
      color: colors.accent.success,
      fontWeight: '600',
    },
    presetButtonsRow: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: spacing.lg,
      flexWrap: 'wrap',
    },
    presetBtn: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: radius.sm,
      backgroundColor: colors.bg.elevated,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    presetBtnActive: {
      backgroundColor: colors.accent.primary,
      borderColor: colors.accent.primary,
    },
    presetBtnText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.text.secondary,
    },
    presetBtnTextActive: {
      color: '#FFFFFF',
      fontWeight: '800',
    },
    modalPrimaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.accent.primary,
      borderRadius: radius.md,
      paddingVertical: 12,
      marginTop: spacing.sm,
    },
    modalPrimaryBtnText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '800',
    },

    // Drilldown Details
    drillSection: {
      marginBottom: spacing.md,
      paddingBottom: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    drillLabel: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.text.muted,
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    drillVal: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text.primary,
    },
    drillSub: {
      fontSize: 12,
      color: colors.text.secondary,
      marginTop: 2,
    },
    drillItemRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 4,
    },
    drillItemName: {
      fontSize: 12,
      color: colors.text.primary,
      fontWeight: '600',
    },
    drillItemPrice: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.text.primary,
    },
  });
};
