import { MaterialIcons } from "@expo/vector-icons";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View, type AlertButton } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  FadeIn,
  FadeInUp,
  FadeOut,
  FadeOutUp,
  ZoomIn,
  ZoomOut,
} from "react-native-reanimated";
import { useTheme } from "./ThemeContext";

export type PopupType = "success" | "error" | "warning" | "confirm" | "info";

export interface DialogConfig {
  title?: string;
  message?: string;
  type?: PopupType;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export interface PopupContextType {
  showToast: (message: string, type?: PopupType, duration?: number) => void;
  showDialog: (config: DialogConfig) => void;
}

interface ToastState {
  message: string;
  type: PopupType;
}

interface DialogState {
  title: string;
  message: string;
  type: PopupType;
  confirmText: string;
  cancelText: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const PopupContext = createContext<PopupContextType | null>(null);

export function PopupProvider({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => getStyles(theme), [theme]);

  // Toast State
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dialog State
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const showToast = useCallback(
    (message: string, type: PopupType = "success", duration = 3000) => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
      setToast({ message, type });
      toastTimeoutRef.current = setTimeout(() => {
        setToast(null);
      }, duration);
    },
    [],
  );

  const showDialog = useCallback((config: DialogConfig) => {
    setDialog({
      title: config.title || "Alert",
      message: config.message || "",
      type: config.type || "info",
      confirmText: config.confirmText || "OK",
      cancelText: config.cancelText || "Cancel",
      onConfirm: () => {
        if (config.onConfirm) config.onConfirm();
        setDialog(null);
      },
      onCancel: () => {
        if (config.onCancel) config.onCancel();
        setDialog(null);
      },
    });
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // Override native Alert.alert globally to use premium custom dialogs
    const originalAlert = Alert.alert;
    const globalObj = globalThis as typeof globalThis & { alert?: (msg?: unknown) => void };
    const originalGlobalAlert = globalObj.alert;

    Alert.alert = (
      title: string,
      message?: string,
      buttons?: AlertButton[],
    ) => {
      const hasButtons = buttons && buttons.length > 0;

      let onConfirm = () => {};
      let onCancel = () => {};
      let confirmText = "OK";
      let cancelText = "Cancel";
      let type: PopupType = "info";

      const titleLower = String(title || "").toLowerCase();
      const msgLower = String(message || "").toLowerCase();

      if (
        titleLower.includes("success") ||
        msgLower.includes("successfully") ||
        titleLower.includes("complete")
      ) {
        type = "success";
      } else if (
        titleLower.includes("error") ||
        titleLower.includes("failed") ||
        msgLower.includes("failed") ||
        msgLower.includes("invalid") ||
        titleLower.includes("wrong")
      ) {
        type = "error";
      } else if (
        titleLower.includes("warning") ||
        titleLower.includes("caution") ||
        msgLower.includes("warning") ||
        msgLower.includes("delete") ||
        msgLower.includes("remove") ||
        msgLower.includes("rollback")
      ) {
        type = "warning";
      }

      if (hasButtons && buttons) {
        if (buttons.length === 1) {
          const btn = buttons[0];
          confirmText = btn.text || "OK";
          onConfirm = () => {
            if (btn.onPress) btn.onPress();
          };
          showDialog({
            title: String(title || ""),
            message: String(message || ""),
            type,
            confirmText,
            onConfirm,
          });
        } else {
          let cancelBtn = buttons.find((b) => b.style === "cancel");
          let confirmBtn = buttons.find((b) => b.style !== "cancel");

          if (!cancelBtn && !confirmBtn) {
            cancelBtn = buttons[0];
            confirmBtn = buttons[1];
          } else if (!cancelBtn) {
            cancelBtn = buttons.filter((b) => b !== confirmBtn)[0];
          } else if (!confirmBtn) {
            confirmBtn = buttons.filter((b) => b !== cancelBtn)[0];
          }

          confirmText = confirmBtn?.text || "Confirm";
          cancelText = cancelBtn?.text || "Cancel";

          onConfirm = () => {
            if (confirmBtn?.onPress) confirmBtn.onPress();
          };
          onCancel = () => {
            if (cancelBtn?.onPress) cancelBtn.onPress();
          };

          showDialog({
            title: String(title || ""),
            message: String(message || ""),
            type: "confirm",
            confirmText,
            cancelText,
            onConfirm,
            onCancel,
          });
        }
      } else {
        showDialog({
          title: String(title || ""),
          message: String(message || ""),
          type,
          confirmText: "OK",
        });
      }
    };

    globalObj.alert = (msg?: unknown) => {
      Alert.alert("Notification", String(msg));
    };

    return () => {
      Alert.alert = originalAlert;
      if (originalGlobalAlert) {
        globalObj.alert = originalGlobalAlert;
      }
    };
  }, [colors, theme, showDialog]);

  const getIconName = useCallback((type: PopupType): keyof typeof MaterialIcons.glyphMap => {
    switch (type) {
      case "success":
        return "check-circle";
      case "error":
        return "error";
      case "warning":
        return "warning";
      case "confirm":
        return "help";
      default:
        return "info";
    }
  }, []);

  const getIconColor = useCallback(
    (type: PopupType): string => {
      switch (type) {
        case "success":
          return "#10b981";
        case "error":
          return "#ef4444";
        case "warning":
          return "#f59e0b";
        case "confirm":
          return colors.accent.primary;
        default:
          return colors.accent.info || "#3b82f6";
      }
    },
    [colors],
  );

  const contextValue = useMemo<PopupContextType>(
    () => ({ showToast, showDialog }),
    [showToast, showDialog],
  );

  return (
    <PopupContext.Provider value={contextValue}>
      {children}

      {/* Global Toast Notification */}
      {toast && (
        <Animated.View
          entering={FadeInUp}
          exiting={FadeOutUp}
          style={[
            styles.toastContainer,
            {
              top: Math.max(insets.top + 8, 16),
              backgroundColor: colors.bg.card,
            },
          ]}
        >
          <View
            style={[
              styles.toastBar,
              { backgroundColor: getIconColor(toast.type) },
            ]}
          />
          <MaterialIcons
            name={getIconName(toast.type)}
            size={22}
            color={getIconColor(toast.type)}
          />
          <Text style={[styles.toastText, { color: colors.text.primary }]}>
            {toast.message}
          </Text>
          <Pressable
            onPress={() => setToast(null)}
            style={styles.toastCloseBtn}
          >
            <MaterialIcons name="close" size={16} color={colors.text.muted} />
          </Pressable>
        </Animated.View>
      )}

      {/* Global Dialog Modal */}
      {dialog && (
        <Modal
          transparent
          animationType="none"
          visible={!!dialog}
          onRequestClose={dialog.onCancel}
        >
          <Animated.View
            entering={FadeIn}
            exiting={FadeOut}
            style={styles.modalOverlay}
          >
            <Animated.View
              entering={ZoomIn.springify().damping(18)}
              exiting={ZoomOut}
              style={[styles.dialogBox, { backgroundColor: colors.bg.card }]}
            >
              <View
                style={[
                  styles.iconContainer,
                  { backgroundColor: `${getIconColor(dialog.type)}15` },
                ]}
              >
                <MaterialIcons
                  name={getIconName(dialog.type)}
                  size={32}
                  color={getIconColor(dialog.type)}
                />
              </View>

              <Text style={[styles.dialogTitle, { color: colors.text.primary }]}>
                {dialog.title}
              </Text>
              <Text style={[styles.dialogDesc, { color: colors.text.secondary }]}>
                {dialog.message}
              </Text>

              <View style={styles.btnRow}>
                {dialog.type === "confirm" && (
                  <Pressable
                    style={[
                      styles.btn,
                      styles.cancelBtn,
                      { borderColor: colors.border.subtle },
                    ]}
                    onPress={dialog.onCancel}
                  >
                    <Text
                      style={[
                        styles.cancelBtnText,
                        { color: colors.text.secondary },
                      ]}
                    >
                      {dialog.cancelText}
                    </Text>
                  </Pressable>
                )}

                <Pressable
                  style={[
                    styles.btn,
                    { backgroundColor: getIconColor(dialog.type) },
                  ]}
                  onPress={dialog.onConfirm}
                >
                  <Text style={styles.confirmBtnText}>{dialog.confirmText}</Text>
                </Pressable>
              </View>
            </Animated.View>
          </Animated.View>
        </Modal>
      )}
    </PopupContext.Provider>
  );
}

export function usePopup(): PopupContextType {
  const context = useContext(PopupContext);
  if (!context) {
    throw new Error("usePopup must be used within a PopupProvider");
  }
  return context;
}

const getStyles = (theme: any) =>
  StyleSheet.create({
    toastContainer: {
      position: "absolute",
      top: 50,
      left: 20,
      right: 20,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      zIndex: 9999,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.15,
      shadowRadius: 10,
      elevation: 8,
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
    },
    toastBar: {
      position: "absolute",
      left: 0,
      top: 12,
      bottom: 12,
      width: 4,
      borderTopRightRadius: 4,
      borderBottomRightRadius: 4,
    },
    toastText: {
      fontSize: 14,
      fontWeight: "600",
      flex: 1,
    },
    toastCloseBtn: {
      padding: 2,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.45)",
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    dialogBox: {
      width: "92%",
      maxWidth: 420,
      maxHeight: "88%",
      borderRadius: 24,
      padding: 24,
      alignItems: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.25,
      shadowRadius: 15,
      elevation: 10,
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
    },
    iconContainer: {
      width: 64,
      height: 64,
      borderRadius: 32,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 16,
    },
    dialogTitle: {
      fontSize: 18,
      fontWeight: "800",
      textAlign: "center",
      marginBottom: 8,
    },
    dialogDesc: {
      fontSize: 14,
      textAlign: "center",
      lineHeight: 20,
      marginBottom: 24,
    },
    btnRow: {
      flexDirection: "row",
      gap: 12,
      width: "100%",
    },
    btn: {
      flex: 1,
      height: 48,
      borderRadius: 14,
      justifyContent: "center",
      alignItems: "center",
    },
    cancelBtn: {
      borderWidth: 1.5,
      backgroundColor: "transparent",
    },
    cancelBtnText: {
      fontWeight: "700",
      fontSize: 14,
    },
    confirmBtnText: {
      color: "#ffffff",
      fontWeight: "700",
      fontSize: 14,
    },
  });

export default function PopupRoutePlaceholder() {
  return null;
}

