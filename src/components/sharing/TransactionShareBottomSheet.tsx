import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  useWindowDimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { ShareSettings, TransactionData, InvoiceTemplate, DEFAULT_INVOICE_TEMPLATE } from '../../types/sharing';
import { shareSettingsService } from '../../services/sharing/shareSettingsService';
import { invoiceTemplateService } from '../../services/sharing/invoiceTemplateService';
import { shareService } from '../../services/sharing/shareService';
import { TransactionReceiptView } from './TransactionReceiptView';
import { ShareSettingsModal } from './ShareSettingsModal';

interface Props {
  visible: boolean;
  transaction: TransactionData | null;
  isDark?: boolean;
  onClose: () => void;
}

export function TransactionShareBottomSheet({
  visible,
  transaction,
  isDark = false,
  onClose,
}: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const [settings, setSettings] = useState<ShareSettings | null>(null);
  const [template, setTemplate] = useState<InvoiceTemplate | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [salutation, setSalutation] = useState<'None' | 'Mr.' | 'Mrs.' | 'Ms.' | 'M/s' | 'Dr.'>('None');
  const [useAvargal, setUseAvargal] = useState<boolean>(false);

  const translateY = useRef(new Animated.Value(800)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const receiptViewRef = useRef<View>(null);

  // Load share settings and invoice template whenever sheet becomes visible or mounts
  const loadSettingsAndTemplate = async () => {
    try {
      const [s, t] = await Promise.all([
        shareSettingsService.getSettings(),
        invoiceTemplateService.getTemplate(),
      ]);
      setSettings(s);
      setTemplate(t);
    } catch (e) {
      console.warn('Failed loading share settings or template:', e);
    }
  };

  useEffect(() => {
    if (visible && transaction) {
      loadSettingsAndTemplate();

      const origName = transaction.customer?.name || '';
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
  }, [visible, transaction]);

  // Handle opening and closing animations
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          tension: 65,
          friction: 11,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: windowHeight || 800,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, backdropOpacity, translateY, windowHeight]);

  const processedTransaction: TransactionData | null = useMemo(() => {
    if (!transaction) return null;
    const origName = transaction.customer?.name || '';
    const cleanName = origName
      .replace(/^(Mr\.|Mrs\.|Ms\.|M\/s|Dr\.)\s+/i, '')
      .replace(/\s+அவர்கள்$/i, '')
      .trim();

    let formattedCustomerName = cleanName;
    if (salutation && salutation !== 'None') {
      formattedCustomerName = `${salutation} ${formattedCustomerName}`;
    }
    if (useAvargal) {
      formattedCustomerName = `${formattedCustomerName} அவர்கள்`;
    }

    return {
      ...transaction,
      customer: {
        ...transaction.customer,
        name: formattedCustomerName,
      },
    };
  }, [transaction, salutation, useAvargal]);

  if (!visible || !transaction || !processedTransaction) return null;

  const activeSettings = settings || {
    defaultFormat: 'IMAGE',
    includeLogo: true,
    includeSignature: true,
    includeQrCode: true,
    includeGst: true,
    includeCustomerAddress: true,
    highQualityImage: true,
    watermarkEnabled: false,
    watermarkText: 'CONFIDENTIAL',
  };

  const activeTemplate = template || DEFAULT_INVOICE_TEMPLATE;

  const handleShareImage = async () => {
    setLoading(true);
    setLoadingText('Generating receipt image...');
    try {
      await shareService.shareAsImage(processedTransaction, activeSettings, receiptViewRef);
    } catch (error) {
      console.error('Share image failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSharePdf = async () => {
    setLoading(true);
    setLoadingText('Creating PDF invoice...');
    try {
      await shareService.shareAsPdf(processedTransaction, activeSettings);
    } catch (error) {
      console.error('Share PDF failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleShareText = async () => {
    setLoading(true);
    setLoadingText('Preparing text summary...');
    try {
      await shareService.shareAsText(processedTransaction, activeSettings);
    } catch (error) {
      console.error('Share text failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleShareWhatsApp = async () => {
    setLoading(true);
    setLoadingText('Connecting to WhatsApp...');
    try {
      await shareService.shareToWhatsApp(
        processedTransaction,
        activeSettings,
        receiptViewRef,
        activeSettings.defaultFormat
      );
    } catch (error) {
      console.error('WhatsApp share failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleShareSms = async () => {
    setLoading(true);
    setLoadingText('Opening SMS app...');
    try {
      await shareService.shareViaSms(processedTransaction);
    } catch (error) {
      console.error('SMS share failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleShareSystem = async () => {
    setLoading(true);
    setLoadingText('Opening share options...');
    try {
      await shareService.shareSystem(
        processedTransaction,
        activeSettings,
        receiptViewRef,
        activeSettings.defaultFormat
      );
    } catch (error) {
      console.error('System share failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const sheetBg = isDark ? '#0F172A' : '#FFFFFF';
  const cardBg = isDark ? '#1E293B' : '#F8FAFC';
  const textColor = isDark ? '#F8FAFC' : '#0F172A';
  const subTextColor = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? '#334155' : '#E2E8F0';

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        {/* Backdrop dismiss */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
          <Animated.View
            style={[
              styles.backdrop,
              {
                opacity: backdropOpacity.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 0.65],
                }),
              },
            ]}
          />
        </Pressable>

        {/* Off-screen hidden view for image capture */}
        <View
          collapsable={false}
          style={styles.offscreenCaptureContainer}
          pointerEvents="none"
        >
          <TransactionReceiptView
            ref={receiptViewRef}
            transaction={processedTransaction}
            settings={activeSettings}
            template={activeTemplate}
            isDark={isDark}
          />
        </View>

        {/* Bottom Sheet Animated Panel */}
        <Animated.View
          style={[
            styles.sheetContainer,
            {
              backgroundColor: sheetBg,
              borderColor,
              maxHeight: Math.min(windowHeight * 0.9, 740),
              transform: [{ translateY }],
            },
          ]}
        >
          {/* Drag Handle Indicator */}
          <View style={styles.dragHandleContainer}>
            <View style={[styles.dragHandle, { backgroundColor: isDark ? '#475569' : '#CBD5E1' }]} />
          </View>

          {/* Sheet Header */}
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={[styles.headerTitle, { color: textColor }]} numberOfLines={1}>
                Share Transaction
              </Text>
              {(() => {
                const custName = processedTransaction.customer?.name || '';
                const hasAvargal = custName.endsWith('அவர்கள்');
                const mainName = hasAvargal ? custName.replace(/\s+அவர்கள்$/, '').trim() : custName;
                return (
                  <Text style={[styles.headerSub, { color: subTextColor }]} numberOfLines={1} ellipsizeMode="tail">
                    Invoice #{processedTransaction.invoiceNumber} • {mainName}
                    {hasAvargal && (
                      <Text style={{ fontSize: 10.5, fontWeight: '600', color: subTextColor }}> அவர்கள்</Text>
                    )}
                  </Text>
                );
              })()}
            </View>

            <View style={styles.headerActions}>
              <Pressable
                onPress={() => setShowSettingsModal(true)}
                style={[styles.iconBtn, { backgroundColor: cardBg, borderColor }]}
                hitSlop={8}
              >
                <MaterialIcons name="tune" size={20} color={textColor} />
              </Pressable>

              <Pressable
                onPress={onClose}
                style={[styles.iconBtn, { backgroundColor: cardBg, borderColor }]}
                hitSlop={8}
              >
                <MaterialIcons name="close" size={20} color={subTextColor} />
              </Pressable>
            </View>
          </View>

          {/* Scrollable content to avoid cut-offs on any screen size */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={styles.sheetScrollContent}
          >
            {/* Client Title / Salutation (Mr. / Mrs.) & Suffix (அவர்கள்) Bar */}
            <View style={styles.clientTitleContainer}>
              <Text style={[styles.clientTitleLabel, { color: subTextColor }]}>CLIENT TITLE:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.clientTitleScroll}>
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
                    style={[
                      styles.salutationChip,
                      {
                        backgroundColor: salutation === t.id ? '#2563EB' : (isDark ? '#334155' : '#F1F5F9'),
                      },
                    ]}
                  >
                    <Text style={[styles.salutationChipText, { color: salutation === t.id ? '#FFF' : textColor }]}>
                      {t.label}
                    </Text>
                  </Pressable>
                ))}

                <View style={[styles.titleDivider, { backgroundColor: borderColor }]} />

                {/* Tamil Suffix: அவர்கள் */}
                <Pressable
                  onPress={() => setUseAvargal(!useAvargal)}
                  style={[
                    styles.avargalChip,
                    {
                      borderColor: useAvargal ? '#8B5CF6' : borderColor,
                      backgroundColor: useAvargal ? '#8B5CF6' : (isDark ? '#334155' : '#F1F5F9'),
                    },
                  ]}
                >
                  <Text style={[styles.avargalChipText, { color: useAvargal ? '#FFF' : (isDark ? '#C084FC' : '#7C3AED') }]}>
                    + அவர்கள் {useAvargal ? '✓' : ''}
                  </Text>
                </Pressable>
              </ScrollView>
            </View>

            {/* Action Buttons Grid */}
            <View style={styles.grid}>
              {/* Share as Image */}
              <Pressable
                onPress={handleShareImage}
                disabled={loading}
                style={({ pressed }) => [
                  styles.gridCard,
                  { backgroundColor: isDark ? '#1E293B' : '#EFF6FF', borderColor: '#BFDBFE' },
                  pressed && styles.cardPressed,
                ]}
              >
                <View style={[styles.cardIconBox, { backgroundColor: '#3B82F6' }]}>
                  <MaterialIcons name="photo-camera" size={18} color="#FFFFFF" />
                </View>
                <View style={styles.cardTextBox}>
                  <Text style={[styles.cardTitle, { color: textColor }]} numberOfLines={1}>Share as Image</Text>
                  <Text style={[styles.cardSub, { color: subTextColor }]} numberOfLines={1}>Receipt image</Text>
                </View>
              </Pressable>

              {/* Share as PDF */}
              <Pressable
                onPress={handleSharePdf}
                disabled={loading}
                style={({ pressed }) => [
                  styles.gridCard,
                  { backgroundColor: isDark ? '#1E293B' : '#FEF2F2', borderColor: '#FECACA' },
                  pressed && styles.cardPressed,
                ]}
              >
                <View style={[styles.cardIconBox, { backgroundColor: '#EF4444' }]}>
                  <MaterialIcons name="picture-as-pdf" size={18} color="#FFFFFF" />
                </View>
                <View style={styles.cardTextBox}>
                  <Text style={[styles.cardTitle, { color: textColor }]} numberOfLines={1}>Share as PDF</Text>
                  <Text style={[styles.cardSub, { color: subTextColor }]} numberOfLines={1}>PDF document</Text>
                </View>
              </Pressable>

              {/* Share to WhatsApp */}
              <Pressable
                onPress={handleShareWhatsApp}
                disabled={loading}
                style={({ pressed }) => [
                  styles.gridCard,
                  { backgroundColor: isDark ? '#1E293B' : '#ECFDF5', borderColor: '#A7F3D0' },
                  pressed && styles.cardPressed,
                ]}
              >
                <View style={[styles.cardIconBox, { backgroundColor: '#10B981' }]}>
                  <MaterialIcons name="chat" size={18} color="#FFFFFF" />
                </View>
                <View style={styles.cardTextBox}>
                  <Text style={[styles.cardTitle, { color: textColor }]} numberOfLines={1}>WhatsApp</Text>
                  <Text style={[styles.cardSub, { color: subTextColor }]} numberOfLines={1}>Direct chat</Text>
                </View>
              </Pressable>

              {/* Share via SMS */}
              <Pressable
                onPress={handleShareSms}
                disabled={loading}
                style={({ pressed }) => [
                  styles.gridCard,
                  { backgroundColor: isDark ? '#1E293B' : '#FFFBEB', borderColor: '#FDE68A' },
                  pressed && styles.cardPressed,
                ]}
              >
                <View style={[styles.cardIconBox, { backgroundColor: '#F59E0B' }]}>
                  <MaterialIcons name="sms" size={18} color="#FFFFFF" />
                </View>
                <View style={styles.cardTextBox}>
                  <Text style={[styles.cardTitle, { color: textColor }]} numberOfLines={1}>SMS Message</Text>
                  <Text style={[styles.cardSub, { color: subTextColor }]} numberOfLines={1}>Text message</Text>
                </View>
              </Pressable>

              {/* Share as TEXT */}
              <Pressable
                onPress={handleShareText}
                disabled={loading}
                style={({ pressed }) => [
                  styles.gridCard,
                  { backgroundColor: isDark ? '#1E293B' : '#F5F3FF', borderColor: '#DDD6FE' },
                  pressed && styles.cardPressed,
                ]}
              >
                <View style={[styles.cardIconBox, { backgroundColor: '#8B5CF6' }]}>
                  <MaterialIcons name="article" size={18} color="#FFFFFF" />
                </View>
                <View style={styles.cardTextBox}>
                  <Text style={[styles.cardTitle, { color: textColor }]} numberOfLines={1}>Share Text</Text>
                  <Text style={[styles.cardSub, { color: subTextColor }]} numberOfLines={1}>Plain summary</Text>
                </View>
              </Pressable>

              {/* More Apps / System Share */}
              <Pressable
                onPress={handleShareSystem}
                disabled={loading}
                style={({ pressed }) => [
                  styles.gridCard,
                  { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor },
                  pressed && styles.cardPressed,
                ]}
              >
                <View style={[styles.cardIconBox, { backgroundColor: '#64748B' }]}>
                  <MaterialIcons name="share" size={18} color="#FFFFFF" />
                </View>
                <View style={styles.cardTextBox}>
                  <Text style={[styles.cardTitle, { color: textColor }]} numberOfLines={1}>More Apps</Text>
                  <Text style={[styles.cardSub, { color: subTextColor }]} numberOfLines={1}>System menu</Text>
                </View>
              </Pressable>
            </View>
          </ScrollView>

          {/* Loading Indicator Overlay */}
          {loading && (
            <View style={[styles.loadingOverlay, { backgroundColor: sheetBg }]}>
              <ActivityIndicator size="large" color="#2563EB" />
              <Text style={[styles.loadingText, { color: textColor }]}>{loadingText}</Text>
            </View>
          )}
        </Animated.View>
      </View>

      {/* Share Settings Modal */}
      <ShareSettingsModal
        visible={showSettingsModal}
        settings={activeSettings}
        isDark={isDark}
        onClose={() => setShowSettingsModal(false)}
        onSettingsUpdated={(newSettings) => {
          setSettings(newSettings);
          loadSettingsAndTemplate();
        }}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000000',
  },
  offscreenCaptureContainer: {
    position: 'absolute',
    left: -4000,
    top: 0,
    width: 360,
    opacity: 1,
    zIndex: -999,
  },
  sheetContainer: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    position: 'relative',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 20,
  },
  sheetScrollContent: {
    paddingBottom: 20,
  },
  dragHandleContainer: {
    alignItems: 'center',
    paddingVertical: 5,
  },
  dragHandle: {
    width: 38,
    height: 4,
    borderRadius: 3,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  headerSub: {
    fontSize: 11.5,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clientTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    marginTop: 2,
  },
  clientTitleLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  clientTitleScroll: {
    gap: 6,
    alignItems: 'center',
  },
  salutationChip: {
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 10,
  },
  salutationChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  titleDivider: {
    width: 1,
    height: 16,
    marginHorizontal: 2,
    alignSelf: 'center',
  },
  avargalChip: {
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 10,
    borderWidth: 1,
  },
  avargalChipText: {
    fontSize: 10,
    fontWeight: '800',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
    marginTop: 4,
  },
  gridCard: {
    width: '48.5%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  cardPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },
  cardIconBox: {
    width: 34,
    height: 34,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTextBox: {
    flex: 1,
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  cardSub: {
    fontSize: 9.5,
    marginTop: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    fontWeight: '600',
  },
});

