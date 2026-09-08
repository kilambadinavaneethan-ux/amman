import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { ShareFormat, ShareSettings } from '../../types/sharing';
import { shareSettingsService } from '../../services/sharing/shareSettingsService';

interface Props {
  visible: boolean;
  settings: ShareSettings;
  isDark?: boolean;
  onClose: () => void;
  onSettingsUpdated: (updated: ShareSettings) => void;
}

export function ShareSettingsModal({
  visible,
  settings: initialSettings,
  isDark = false,
  onClose,
  onSettingsUpdated,
}: Props) {
  const [localSettings, setLocalSettings] = useState<ShareSettings>(initialSettings);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    setLocalSettings(initialSettings);
  }, [initialSettings, visible]);

  const toggleSwitch = (key: keyof ShareSettings) => {
    setLocalSettings((prev) => {
      const newVal = !prev[key];
      let updatedMode = prev.paymentDisplayMode;
      if (key === 'includeQrCode') {
        const hasBank = prev.includeBankDetails !== false && prev.paymentDisplayMode !== 'NONE' && prev.paymentDisplayMode !== 'QR';
        updatedMode = newVal ? (hasBank ? 'BOTH' : 'QR') : (hasBank ? 'BANK' : 'NONE');
      } else if (key === 'includeBankDetails') {
        const hasQr = prev.includeQrCode !== false && prev.paymentDisplayMode !== 'NONE' && prev.paymentDisplayMode !== 'BANK';
        updatedMode = newVal ? (hasQr ? 'BOTH' : 'BANK') : (hasQr ? 'QR' : 'NONE');
      }
      return {
        ...prev,
        [key]: newVal,
        paymentDisplayMode: updatedMode,
      };
    });
  };

  const setFormat = (format: ShareFormat) => {
    setLocalSettings((prev) => ({
      ...prev,
      defaultFormat: format,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await shareSettingsService.saveSettings(localSettings);
      onSettingsUpdated(saved);
      onClose();
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const cardBg = isDark ? '#1E293B' : '#FFFFFF';
  const textColor = isDark ? '#F8FAFC' : '#0F172A';
  const subTextColor = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? '#334155' : '#E2E8F0';
  const inputBg = isDark ? '#0F172A' : '#F8FAFC';
  const accentColor = '#2563EB';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: cardBg, borderColor }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: borderColor }]}>
            <View style={styles.headerLeft}>
              <MaterialIcons name="settings" size={24} color={accentColor} />
              <Text style={[styles.title, { color: textColor }]}>Sharing Settings</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <MaterialIcons name="close" size={22} color={subTextColor} />
            </Pressable>
          </View>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* Default Format Selection */}
            <Text style={[styles.sectionTitle, { color: subTextColor }]}>DEFAULT SHARE FORMAT</Text>
            <View style={styles.formatRow}>
              {(['IMAGE', 'PDF', 'TEXT'] as ShareFormat[]).map((fmt) => {
                const isSelected = localSettings.defaultFormat === fmt;
                return (
                  <Pressable
                    key={fmt}
                    onPress={() => setFormat(fmt)}
                    style={[
                      styles.formatChip,
                      {
                        backgroundColor: isSelected ? accentColor : inputBg,
                        borderColor: isSelected ? accentColor : borderColor,
                      },
                    ]}
                  >
                    <MaterialIcons
                      name={fmt === 'IMAGE' ? 'image' : fmt === 'PDF' ? 'picture-as-pdf' : 'description'}
                      size={18}
                      color={isSelected ? '#FFFFFF' : subTextColor}
                    />
                    <Text
                      style={[
                        styles.formatText,
                        { color: isSelected ? '#FFFFFF' : textColor, fontWeight: isSelected ? '700' : '500' },
                      ]}
                    >
                      {fmt}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Toggle Switches */}
            <Text style={[styles.sectionTitle, { color: subTextColor, marginTop: 16 }]}>RECEIPT & INVOICE CONTENT</Text>

            <View style={[styles.toggleRow, { borderBottomColor: borderColor }]}>
              <View style={styles.toggleTextContainer}>
                <Text style={[styles.toggleTitle, { color: textColor }]}>Company Logo</Text>
                <Text style={[styles.toggleSub, { color: subTextColor }]}>Show company logo on receipts/PDFs</Text>
              </View>
              <Switch
                value={localSettings.includeLogo}
                onValueChange={() => toggleSwitch('includeLogo')}
                trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                thumbColor={localSettings.includeLogo ? accentColor : '#F1F5F9'}
              />
            </View>

            <View style={[styles.toggleRow, { borderBottomColor: borderColor }]}>
              <View style={styles.toggleTextContainer}>
                <Text style={[styles.toggleTitle, { color: textColor }]}>Authorized Signature</Text>
                <Text style={[styles.toggleSub, { color: subTextColor }]}>Include signature line & image</Text>
              </View>
              <Switch
                value={localSettings.includeSignature}
                onValueChange={() => toggleSwitch('includeSignature')}
                trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                thumbColor={localSettings.includeSignature ? accentColor : '#F1F5F9'}
              />
            </View>

            <View style={[styles.toggleRow, { borderBottomColor: borderColor }]}>
              <View style={styles.toggleTextContainer}>
                <Text style={[styles.toggleTitle, { color: textColor }]}>Payment QR Code</Text>
                <Text style={[styles.toggleSub, { color: subTextColor }]}>Include scannable payment QR code</Text>
              </View>
              <Switch
                value={localSettings.includeQrCode}
                onValueChange={() => toggleSwitch('includeQrCode')}
                trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                thumbColor={localSettings.includeQrCode ? accentColor : '#F1F5F9'}
              />
            </View>
            {localSettings.includeQrCode && (
              <View style={{ paddingHorizontal: 12, paddingBottom: 12, paddingTop: 4 }}>
                <Text style={[styles.sectionTitle, { color: subTextColor, fontSize: 11, marginBottom: 4 }]}>UPI VPA / PhonePe / GPay ID</Text>
                <TextInput
                  value={localSettings.upiId || ''}
                  onChangeText={(text) => setLocalSettings((prev) => ({ ...prev, upiId: text }))}
                  placeholder="e.g. company@upi or 9876543210@paytm"
                  placeholderTextColor={subTextColor}
                  style={[
                    styles.textInput,
                    { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', color: textColor, borderColor }
                  ]}
                />
              </View>
            )}

            <View style={[styles.toggleRow, { borderBottomColor: borderColor }]}>
              <View style={styles.toggleTextContainer}>
                <Text style={[styles.toggleTitle, { color: textColor }]}>Bank Account Details</Text>
                <Text style={[styles.toggleSub, { color: subTextColor }]}>Include Bank Name, Account & IFSC Code</Text>
              </View>
              <Switch
                value={localSettings.includeBankDetails !== false}
                onValueChange={() => toggleSwitch('includeBankDetails' as any)}
                trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                thumbColor={localSettings.includeBankDetails !== false ? accentColor : '#F1F5F9'}
              />
            </View>
            {localSettings.includeBankDetails !== false && (
              <View style={{ paddingHorizontal: 12, paddingBottom: 12, paddingTop: 4, gap: 8 }}>
                <TextInput
                  value={localSettings.bankName || ''}
                  onChangeText={(text) => setLocalSettings((prev) => ({ ...prev, bankName: text }))}
                  placeholder="Bank Name (e.g. SBI / HDFC)"
                  placeholderTextColor={subTextColor}
                  style={[
                    styles.textInput,
                    { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', color: textColor, borderColor }
                  ]}
                />
                <TextInput
                  value={localSettings.accountNo || ''}
                  onChangeText={(text) => setLocalSettings((prev) => ({ ...prev, accountNo: text }))}
                  placeholder="Account Number"
                  placeholderTextColor={subTextColor}
                  keyboardType="numeric"
                  style={[
                    styles.textInput,
                    { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', color: textColor, borderColor }
                  ]}
                />
                <TextInput
                  value={localSettings.ifscCode || ''}
                  onChangeText={(text) => setLocalSettings((prev) => ({ ...prev, ifscCode: text.toUpperCase() }))}
                  placeholder="IFSC Code"
                  placeholderTextColor={subTextColor}
                  autoCapitalize="characters"
                  style={[
                    styles.textInput,
                    { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', color: textColor, borderColor }
                  ]}
                />
                <TextInput
                  value={localSettings.accountHolderName || ''}
                  onChangeText={(text) => setLocalSettings((prev) => ({ ...prev, accountHolderName: text }))}
                  placeholder="Account Holder Name (e.g. Company Name)"
                  placeholderTextColor={subTextColor}
                  style={[
                    styles.textInput,
                    { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', color: textColor, borderColor }
                  ]}
                />
              </View>
            )}

            <View style={[styles.toggleRow, { borderBottomColor: borderColor }]}>
              <View style={styles.toggleTextContainer}>
                <Text style={[styles.toggleTitle, { color: textColor }]}>GST Details</Text>
                <Text style={[styles.toggleSub, { color: subTextColor }]}>Show GSTIN numbers for tax invoices</Text>
              </View>
              <Switch
                value={localSettings.includeGst}
                onValueChange={() => toggleSwitch('includeGst')}
                trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                thumbColor={localSettings.includeGst ? accentColor : '#F1F5F9'}
              />
            </View>

            <View style={[styles.toggleRow, { borderBottomColor: borderColor }]}>
              <View style={styles.toggleTextContainer}>
                <Text style={[styles.toggleTitle, { color: textColor }]}>Customer Address</Text>
                <Text style={[styles.toggleSub, { color: subTextColor }]}>Include full billing address</Text>
              </View>
              <Switch
                value={localSettings.includeCustomerAddress}
                onValueChange={() => toggleSwitch('includeCustomerAddress')}
                trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                thumbColor={localSettings.includeCustomerAddress ? accentColor : '#F1F5F9'}
              />
            </View>

            <Text style={[styles.sectionTitle, { color: subTextColor, marginTop: 16 }]}>QUALITY & WATERMARK</Text>

            <View style={[styles.toggleRow, { borderBottomColor: borderColor }]}>
              <View style={styles.toggleTextContainer}>
                <Text style={[styles.toggleTitle, { color: textColor }]}>High Quality Image</Text>
                <Text style={[styles.toggleSub, { color: subTextColor }]}>Generate ultra crisp receipt images</Text>
              </View>
              <Switch
                value={localSettings.highQualityImage}
                onValueChange={() => toggleSwitch('highQualityImage')}
                trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                thumbColor={localSettings.highQualityImage ? accentColor : '#F1F5F9'}
              />
            </View>

            <View style={[styles.toggleRow, { borderBottomColor: borderColor }]}>
              <View style={styles.toggleTextContainer}>
                <Text style={[styles.toggleTitle, { color: textColor }]}>Watermark</Text>
                <Text style={[styles.toggleSub, { color: subTextColor }]}>Add diagonal text overlay on documents</Text>
              </View>
              <Switch
                value={localSettings.watermarkEnabled}
                onValueChange={() => toggleSwitch('watermarkEnabled')}
                trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                thumbColor={localSettings.watermarkEnabled ? accentColor : '#F1F5F9'}
              />
            </View>

            {localSettings.watermarkEnabled && (
              <View style={styles.inputBox}>
                <Text style={[styles.inputLabel, { color: subTextColor }]}>Watermark Text</Text>
                <TextInput
                  value={localSettings.watermarkText}
                  onChangeText={(text) => setLocalSettings((p) => ({ ...p, watermarkText: text }))}
                  placeholder="e.g. DUPLICATE, PAID, CONFIDENTIAL"
                  placeholderTextColor={subTextColor}
                  style={[styles.textInput, { backgroundColor: inputBg, color: textColor, borderColor }]}
                />
              </View>
            )}
          </ScrollView>

          {/* Footer Save Actions */}
          <View style={[styles.footer, { borderTopColor: borderColor }]}>
            <Pressable onPress={onClose} style={[styles.btn, styles.cancelBtn, { borderColor }]}>
              <Text style={[styles.btnText, { color: textColor }]}>Cancel</Text>
            </Pressable>
            <Pressable onPress={handleSave} disabled={saving} style={[styles.btn, styles.saveBtn]}>
              {saving ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={[styles.btnText, { color: '#FFFFFF', fontWeight: '700' }]}>Save Settings</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  container: {
    maxHeight: '85%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingTop: 16,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  formatRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  formatChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  formatText: {
    fontSize: 13,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  toggleTextContainer: {
    flex: 1,
    paddingRight: 12,
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  toggleSub: {
    fontSize: 11,
    marginTop: 2,
  },
  inputBox: {
    marginTop: 10,
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  textInput: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 13,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  btn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtn: {
    borderWidth: 1,
  },
  saveBtn: {
    backgroundColor: '#2563EB',
  },
  btnText: {
    fontSize: 14,
  },
});
