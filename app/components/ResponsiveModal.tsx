import React from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ModalProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ms } from "../../utils/responsive";

export interface ResponsiveModalProps extends Omit<ModalProps, "children"> {
  children: React.ReactNode;
  variant?: "dialog" | "sheet";
  scrollable?: boolean;
  onBackdropPress?: () => void;
  overlayStyle?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  scrollContentStyle?: StyleProp<ViewStyle>;
  maxWidth?: number;
  backgroundColor?: string;
}

/**
 * Shared responsive modal shell enforcing width: '92%', maxWidth: 480,
 * maxHeight: '88%', safe-area bottom inset clearance, and KeyboardAvoidingView
 * + ScrollView with keyboardShouldPersistTaps='handled'.
 */
export function ResponsiveModal({
  visible,
  onRequestClose,
  onBackdropPress,
  animationType = "fade",
  transparent = true,
  variant = "dialog",
  scrollable = true,
  children,
  overlayStyle,
  contentStyle,
  scrollContentStyle,
  maxWidth = 480,
  backgroundColor,
  ...rest
}: ResponsiveModalProps) {
  const insets = useSafeAreaInsets();
  const isSheet = variant === "sheet";
  const bottomSafePad = Math.max(insets.bottom, ms(12));

  return (
    <Modal
      visible={visible}
      transparent={transparent}
      animationType={animationType}
      onRequestClose={onRequestClose}
      statusBarTranslucent
      {...rest}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={[
          styles.overlay,
          isSheet ? styles.sheetOverlay : styles.dialogOverlay,
          {
            paddingTop: Math.max(insets.top, ms(16)),
            paddingBottom: isSheet ? 0 : bottomSafePad,
          },
          overlayStyle,
        ]}
      >
        {onBackdropPress ? (
          <Pressable style={StyleSheet.absoluteFill} onPress={onBackdropPress} />
        ) : null}

        <View
          style={[
            isSheet ? styles.sheetCard : styles.dialogCard,
            isSheet
              ? {
                  paddingBottom: bottomSafePad + ms(8),
                  maxHeight: "90%",
                }
              : {
                  width: "92%",
                  maxWidth,
                  maxHeight: "88%",
                },
            backgroundColor ? { backgroundColor } : null,
            contentStyle,
          ]}
        >
          {scrollable ? (
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              bounces={false}
              contentContainerStyle={scrollContentStyle}
            >
              {children}
            </ScrollView>
          ) : (
            children
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  dialogOverlay: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: "4%",
  },
  sheetOverlay: {
    justifyContent: "flex-end",
  },
  dialogCard: {
    width: "92%",
    maxWidth: 480,
    maxHeight: "88%",
    borderRadius: 20,
    overflow: "hidden",
  },
  sheetCard: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    maxHeight: "90%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
});

export default ResponsiveModal;
