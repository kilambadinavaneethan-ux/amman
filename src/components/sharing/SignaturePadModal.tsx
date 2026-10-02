import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  PanResponder,
  ActivityIndicator,
  Alert,
  LayoutChangeEvent,
  GestureResponderEvent,
  PanResponderGestureState,
} from 'react-native';
import Svg, { Path, Line } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

interface Stroke {
  d: string;
  color: string;
  width: number;
}

interface SignaturePadModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (signatureUri: string) => void;
  initialSignatureUri?: string;
  themeColors?: {
    cardBg?: string;
    textColor?: string;
    subTextColor?: string;
    borderColor?: string;
    primary?: string;
  };
}

const PEN_COLORS = [
  { label: 'Dark Navy', color: '#0F2942' },
  { label: 'Black', color: '#000000' },
  { label: 'Royal Blue', color: '#1D4ED8' },
  { label: 'Crimson', color: '#B91C1C' },
];

const STROKE_WIDTHS = [
  { label: 'Fine', width: 2 },
  { label: 'Medium', width: 3.5 },
  { label: 'Bold', width: 5 },
];

export function SignaturePadModal({
  visible,
  onClose,
  onSave,
  initialSignatureUri,
  themeColors = {},
}: SignaturePadModalProps) {
  const [paths, setPaths] = useState<Stroke[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [penColor, setPenColor] = useState<string>('#0F2942');
  const [penWidth, setPenWidth] = useState<number>(3.5);
  const [saving, setSaving] = useState<boolean>(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<string>('');
  const [canvasDimensions, setCanvasDimensions] = useState<{ width: number; height: number }>({
    width: 340,
    height: 180,
  });

  const canvasRef = useRef<View>(null);
  const activeStrokeRef = useRef<string>('');
  const canvasOriginRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const penColorRef = useRef(penColor);
  penColorRef.current = penColor;
  const penWidthRef = useRef(penWidth);
  penWidthRef.current = penWidth;

  const canvasDimRef = useRef(canvasDimensions);
  canvasDimRef.current = canvasDimensions;

  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => {
        canvasRef.current?.measureInWindow((x, y, w, h) => {
          if (w > 0 && h > 0) {
            canvasOriginRef.current = { x, y };
          }
        });
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  // Cleanup auto-save timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, []);

  const cancelAutoSave = () => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    setAutoSaveStatus('');
  };

  const scheduleAutoSave = () => {
    cancelAutoSave();
    setAutoSaveStatus('Auto-saving in 1.5s...');
    autoSaveTimerRef.current = setTimeout(async () => {
      if (!canvasRef.current) return;
      setSaving(true);
      setAutoSaveStatus('Saving...');
      try {
        // Small delay to let saving state hide the baseline
        await new Promise((r) => setTimeout(r, 50));
        const uri = await captureRef(canvasRef, {
          format: 'png',
          quality: 1.0,
        });
        onSaveRef.current(uri);
        setAutoSaveStatus('Saved ✓');
        // Brief success flash, then close
        setTimeout(() => {
          setPaths([]);
          setCurrentPath('');
          activeStrokeRef.current = '';
          setAutoSaveStatus('');
          onCloseRef.current();
        }, 400);
      } catch (err: any) {
        console.error('Auto-save signature error:', err);
        setAutoSaveStatus('Auto-save failed — use Save button');
      } finally {
        setSaving(false);
      }
    }, 1500);
  };

  const handleCanvasLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setCanvasDimensions({ width: Math.round(width), height: Math.round(height) });
    }
    canvasRef.current?.measureInWindow((x, y, w, h) => {
      if (w > 0 && h > 0) {
        canvasOriginRef.current = { x, y };
      }
    });
  };

  const getCanvasPoint = (evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
    const pageX = evt.nativeEvent.pageX ?? gestureState.moveX;
    const pageY = evt.nativeEvent.pageY ?? gestureState.moveY;

    let x: number;
    let y: number;

    if (canvasOriginRef.current.x > 0 || canvasOriginRef.current.y > 0) {
      x = pageX - canvasOriginRef.current.x;
      y = pageY - canvasOriginRef.current.y;
    } else if (typeof evt.nativeEvent.locationX === 'number' && !isNaN(evt.nativeEvent.locationX)) {
      x = evt.nativeEvent.locationX;
      y = evt.nativeEvent.locationY;
    } else {
      x = gestureState.dx;
      y = gestureState.dy;
    }

    if (!isFinite(x)) x = 0;
    if (!isFinite(y)) y = 0;

    const clampedX = Math.round(Math.max(0, Math.min(x, canvasDimRef.current.width)));
    const clampedY = Math.round(Math.max(0, Math.min(y, canvasDimRef.current.height)));

    return { x: clampedX, y: clampedY };
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (evt, gestureState) => {
          const { locationX, locationY, pageX, pageY } = evt.nativeEvent;
          if (
            typeof locationX === 'number' &&
            typeof pageX === 'number' &&
            !isNaN(locationX) &&
            !isNaN(pageX)
          ) {
            canvasOriginRef.current = {
              x: pageX - locationX,
              y: pageY - locationY,
            };
          }

          const pt = getCanvasPoint(evt, gestureState);
          // Initial segment with matching end point so single taps render a clean circular dot
          const startD = `M ${pt.x} ${pt.y} L ${pt.x} ${pt.y}`;
          activeStrokeRef.current = startD;
          setCurrentPath(startD);
        },
        onPanResponderMove: (evt, gestureState) => {
          const pt = getCanvasPoint(evt, gestureState);
          const newD = `${activeStrokeRef.current} L ${pt.x} ${pt.y}`;
          activeStrokeRef.current = newD;
          setCurrentPath(newD);
        },
        onPanResponderRelease: () => {
          if (activeStrokeRef.current) {
            setPaths((prev) => [
              ...prev,
              {
                d: activeStrokeRef.current,
                color: penColorRef.current,
                width: penWidthRef.current,
              },
            ]);
            activeStrokeRef.current = '';
            setCurrentPath('');
            // Schedule debounced auto-save
            scheduleAutoSave();
          }
        },
        onPanResponderTerminate: () => {
          if (activeStrokeRef.current) {
            setPaths((prev) => [
              ...prev,
              {
                d: activeStrokeRef.current,
                color: penColorRef.current,
                width: penWidthRef.current,
              },
            ]);
            activeStrokeRef.current = '';
            setCurrentPath('');
            // Schedule debounced auto-save
            scheduleAutoSave();
          }
        },
      }),
    []
  );

  const handleClear = () => {
    cancelAutoSave();
    setPaths([]);
    setCurrentPath('');
    activeStrokeRef.current = '';
  };

  const handleUndo = () => {
    cancelAutoSave();
    setPaths((prev) => prev.slice(0, -1));
  };

  const handleSave = async () => {
    cancelAutoSave();
    if (paths.length === 0) {
      Alert.alert('Empty Signature', 'Please draw your signature before saving.');
      return;
    }
    if (!canvasRef.current) return;

    setSaving(true);
    try {
      await new Promise((r) => setTimeout(r, 50));
      const uri = await captureRef(canvasRef, {
        format: 'png',
        quality: 1.0,
      });
      onSave(uri);
      handleClear();
      onClose();
    } catch (err: any) {
      console.error('Error capturing signature pad:', err);
      Alert.alert('Save Failed', 'Could not save signature drawing. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handlePickFromGallery = async () => {
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
        onSave(result.assets[0].uri);
        handleClear();
        onClose();
      }
    } catch (e: any) {
      console.error('Gallery pick error:', e);
      Alert.alert('Error', 'Failed to pick image from gallery.');
    }
  };

  const colors = {
    cardBg: themeColors.cardBg || '#FFFFFF',
    textColor: themeColors.textColor || '#0F172A',
    subTextColor: themeColors.subTextColor || '#64748B',
    borderColor: themeColors.borderColor || '#E2E8F0',
    primary: themeColors.primary || '#B91C1C',
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
          {/* Header */}
          <View style={[styles.modalHeader, { borderBottomColor: colors.borderColor }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MaterialIcons name="gesture" size={22} color={colors.primary} />
              <View>
                <Text style={[styles.modalTitle, { color: colors.textColor }]}>
                  Signatory Pad (கையொப்ப பலகை)
                </Text>
                <Text style={[styles.modalSub, { color: colors.subTextColor }]}>
                  Draw signature with finger or stylus
                </Text>
              </View>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <MaterialIcons name="close" size={22} color={colors.subTextColor} />
            </Pressable>
          </View>

          {/* Color & Stroke Size Selectors */}
          <View style={styles.toolsBar}>
            {/* Color Swatches */}
            <View style={styles.toolGroup}>
              <Text style={[styles.toolGroupLabel, { color: colors.subTextColor }]}>Color:</Text>
              <View style={styles.colorRow}>
                {PEN_COLORS.map((c) => (
                  <Pressable
                    key={c.color}
                    onPress={() => setPenColor(c.color)}
                    style={[
                      styles.colorDot,
                      { backgroundColor: c.color },
                      penColor === c.color && styles.colorDotSelected,
                    ]}
                  />
                ))}
              </View>
            </View>

            {/* Thickness selector */}
            <View style={styles.toolGroup}>
              <Text style={[styles.toolGroupLabel, { color: colors.subTextColor }]}>Thickness:</Text>
              <View style={styles.widthRow}>
                {STROKE_WIDTHS.map((w) => (
                  <Pressable
                    key={w.width}
                    onPress={() => setPenWidth(w.width)}
                    style={[
                      styles.widthChip,
                      { borderColor: penWidth === w.width ? colors.primary : colors.borderColor },
                      penWidth === w.width && { backgroundColor: colors.primary + '15' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.widthChipText,
                        { color: penWidth === w.width ? colors.primary : colors.textColor },
                      ]}
                    >
                      {w.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          {/* Touch Drawing Canvas */}
          <View style={styles.canvasContainer}>
            <View
              ref={canvasRef}
              collapsable={false}
              style={[
                styles.canvas,
                { width: canvasDimensions.width, height: canvasDimensions.height },
              ]}
              onLayout={handleCanvasLayout}
              {...panResponder.panHandlers}
            >
              <Svg
                width={canvasDimensions.width}
                height={canvasDimensions.height}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              >
                {/* Subtle baseline for signing - hidden during save */}
                {!saving && (
                  <Line
                    x1="20"
                    y1={canvasDimensions.height - 35}
                    x2={canvasDimensions.width - 20}
                    y2={canvasDimensions.height - 35}
                    stroke="#E2E8F0"
                    strokeWidth="1.5"
                    strokeDasharray="4, 4"
                  />
                )}

                {/* Saved strokes */}
                {paths.map((p, idx) => (
                  <Path
                    key={idx}
                    d={p.d}
                    stroke={p.color}
                    strokeWidth={p.width}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                ))}

                {/* Active ongoing stroke */}
                {currentPath ? (
                  <Path
                    d={currentPath}
                    stroke={penColor}
                    strokeWidth={penWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                ) : null}
              </Svg>

              {paths.length === 0 && !currentPath && (
                <View style={styles.canvasPlaceholder} pointerEvents="none">
                  <MaterialIcons name="edit" size={24} color="#94A3B8" />
                  <Text style={styles.canvasPlaceholderText}>Sign here / இங்கே கையொப்பமிடவும்</Text>
                </View>
              )}
            </View>

            {/* Auto-save status indicator */}
            {autoSaveStatus ? (
              <View style={styles.autoSaveRow} pointerEvents="none">
                {autoSaveStatus === 'Saving...' ? (
                  <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 4 }} />
                ) : autoSaveStatus === 'Saved ✓' ? (
                  <MaterialIcons name="check-circle" size={14} color="#16A34A" style={{ marginRight: 4 }} />
                ) : autoSaveStatus.includes('failed') ? (
                  <MaterialIcons name="error-outline" size={14} color="#EF4444" style={{ marginRight: 4 }} />
                ) : (
                  <MaterialIcons name="schedule" size={14} color={colors.subTextColor} style={{ marginRight: 4 }} />
                )}
                <Text style={[
                  styles.autoSaveText,
                  {
                    color: autoSaveStatus === 'Saved ✓'
                      ? '#16A34A'
                      : autoSaveStatus.includes('failed')
                        ? '#EF4444'
                        : colors.subTextColor,
                  },
                ]}>
                  {autoSaveStatus}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Controls: Undo, Clear, Gallery Upload */}
          <View style={[styles.canvasToolbar, { borderTopColor: colors.borderColor }]}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={handleUndo}
                disabled={paths.length === 0}
                style={[
                  styles.toolBtn,
                  { borderColor: colors.borderColor },
                  paths.length === 0 && { opacity: 0.4 },
                ]}
              >
                <MaterialIcons name="undo" size={18} color={colors.textColor} />
                <Text style={[styles.toolBtnText, { color: colors.textColor }]}>Undo</Text>
              </Pressable>

              <Pressable
                onPress={handleClear}
                disabled={paths.length === 0 && !currentPath}
                style={[
                  styles.toolBtn,
                  { borderColor: colors.borderColor },
                  paths.length === 0 && !currentPath && { opacity: 0.4 },
                ]}
              >
                <MaterialIcons name="delete-outline" size={18} color="#EF4444" />
                <Text style={[styles.toolBtnText, { color: '#EF4444' }]}>Clear</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={handlePickFromGallery}
              style={[styles.toolBtn, { borderColor: colors.borderColor }]}
            >
              <MaterialIcons name="photo-library" size={18} color={colors.primary} />
              <Text style={[styles.toolBtnText, { color: colors.primary }]}>Upload Image</Text>
            </Pressable>
          </View>

          {/* Bottom Actions: Cancel & Save Now */}
          <View style={[styles.modalFooter, { borderTopColor: colors.borderColor }]}>
            <Pressable
              onPress={() => {
                cancelAutoSave();
                handleClear();
                onClose();
              }}
              style={[styles.actionBtn, styles.cancelBtn, { borderColor: colors.borderColor }]}
            >
              <Text style={[styles.actionBtnText, { color: colors.textColor }]}>Cancel</Text>
            </Pressable>

            <Pressable
              onPress={handleSave}
              disabled={saving || paths.length === 0}
              style={[
                styles.actionBtn,
                styles.saveBtn,
                { backgroundColor: colors.primary },
                (saving || paths.length === 0) && { opacity: 0.5 },
              ]}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <MaterialIcons name="save" size={18} color="#FFF" />
                  <Text style={[styles.actionBtnText, { color: '#FFF' }]}>
                    Save Now (இப்போது சேமி)
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  modalSub: {
    fontSize: 11,
    marginTop: 1,
  },
  closeBtn: {
    padding: 4,
  },
  toolsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  toolGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toolGroupLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  colorRow: {
    flexDirection: 'row',
    gap: 6,
  },
  colorDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorDotSelected: {
    borderColor: '#F59E0B',
    transform: [{ scale: 1.15 }],
  },
  widthRow: {
    flexDirection: 'row',
    gap: 4,
  },
  widthChip: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  widthChipText: {
    fontSize: 10,
    fontWeight: '700',
  },
  canvasContainer: {
    padding: 16,
    alignItems: 'center',
  },
  canvas: {
    width: 340,
    height: 180,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    position: 'relative',
    overflow: 'hidden',
  },
  canvasPlaceholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  canvasPlaceholderText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
  },
  canvasToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  toolBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  cancelBtn: {
    borderWidth: 1,
  },
  saveBtn: {},
  actionBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  autoSaveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
  },
  autoSaveText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
