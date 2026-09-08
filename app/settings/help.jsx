import React, { useState, useContext, useMemo } from "react";
import { useTheme } from "../context/ThemeContext";
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { collection, addDoc } from "firebase/firestore";
import { db } from "../../src/config/firebase";
import { AuthContext } from "../context/AuthContext";
import ProtectedRoute from "../components/ProtectedRoute";
import BackButton from "../components/BackButton";

const FAQS = [
  {
    question: "How do I upload an item image?",
    answer: "Go to Item Management, click 'Add Item', and tap the image box at the top. The app will request gallery permissions. Select a product image and it will automatically upload to Firebase Storage.",
  },
  {
    question: "What does the 'Low Stock Alert' mean?",
    answer: "By default, the app flags items in yellow/orange alerts when their stock quantity falls to 5 units or lower, helping you quickly identify when products need restocking.",
  },
  {
    question: "Is my business data shared with anyone?",
    answer: "No, all customer logs, balance data, and items catalogs are linked specifically to your unique user ID and are protected via Firebase Security Rules.",
  },
  {
    question: "Can I manage different branches?",
    answer: "Currently, Hollow Block supports a single business dashboard per login. Multiple branch features will be introduced in future updates.",
  },
];

function HelpScreen() {
  const { theme } = useTheme();
  const { colors, spacing, radius, shadows } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const router = useRouter();
  const { user } = useContext(AuthContext);

  const [activeFaq, setActiveFaq] = useState(null);
  const [ticketMessage, setTicketMessage] = useState("");
  const [priority, setPriority] = useState("Medium");
  
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const toggleFaq = (index) => {
    if (activeFaq === index) {
      setActiveFaq(null);
    } else {
      setActiveFaq(index);
    }
  };

  const handleSendTicket = async () => {
    setError("");
    setSuccess(false);

    if (!ticketMessage.trim()) {
      setError("Please describe your issue or question before submitting.");
      return;
    }

    setSending(true);
    try {
      await addDoc(collection(db, "supportTickets"), {
        userId: user.uid,
        message: ticketMessage.trim(),
        priority,
        status: "open",
        createdAt: new Date(),
      });
      
      setTicketMessage("");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError("Failed to submit support request. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {/* Header */}
      <View style={styles.header}>
        <BackButton label="Settings" onPress={() => router.push("/settings")} />
        <Text style={styles.title}>Help & Support</Text>
      </View>

      {/* FAQs Accordion */}
      <Text style={styles.sectionHeading}>Frequently Asked Questions</Text>
      <View style={styles.faqCard}>
        {FAQS.map((faq, index) => {
          const isOpen = activeFaq === index;
          return (
            <View key={index} style={[styles.faqItem, index === FAQS.length - 1 && styles.lastFaqItem]}>
              <Pressable style={styles.faqQuestionRow} onPress={() => toggleFaq(index)}>
                <Text style={styles.faqQuestion}>{faq.question}</Text>
                <MaterialIcons
                  name={isOpen ? "keyboard-arrow-up" : "keyboard-arrow-down"}
                  size={22}
                  color={colors.text.muted}
                />
              </Pressable>
              {isOpen && (
                <View style={styles.faqAnswerContainer}>
                  <Text style={styles.faqAnswer}>{faq.answer}</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* Ticket form */}
      <Text style={styles.sectionHeading}>Submit a Support Ticket</Text>
      <View style={styles.formCard}>
        <Text style={styles.label}>Tell us how we can help</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={ticketMessage}
          onChangeText={setTicketMessage}
          placeholder="Describe your question or issue in detail..."
          placeholderTextColor={colors.text.muted}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          editable={!sending}
        />

        <Text style={styles.label}>Priority Level</Text>
        <View style={styles.priorityRow}>
          {["Low", "Medium", "High"].map((level) => {
            const isSelected = priority === level;
            return (
              <Pressable
                key={level}
                style={[
                  styles.priorityPill,
                  isSelected && styles.priorityPillSelected,
                  isSelected && level === "High" && styles.priorityHigh,
                  isSelected && level === "Medium" && styles.priorityMedium,
                  isSelected && level === "Low" && styles.priorityLow,
                ]}
                onPress={() => setPriority(level)}
                disabled={sending}
              >
                <Text style={[styles.priorityText, isSelected && styles.priorityTextSelected]}>
                  {level}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {error ? (
          <View style={styles.errorAlert}>
            <MaterialIcons name="error" size={18} color={colors.accent.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {success ? (
          <View style={styles.successAlert}>
            <MaterialIcons name="check-circle" size={18} color={colors.accent.success} />
            <Text style={styles.successText}>Ticket submitted successfully! Our support agents will email you shortly.</Text>
          </View>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.submitButton,
            sending && styles.submitButtonDisabled,
            pressed && !sending && styles.buttonPressed,
          ]}
          onPress={handleSendTicket}
          disabled={sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color={colors.text.inverse} />
          ) : (
            <>
              <MaterialIcons name="send" size={20} color={colors.text.inverse} />
              <Text style={styles.submitButtonText}>Submit Ticket</Text>
            </>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

export default function HelpRoute() {
  return (
    <ProtectedRoute>
      <HelpScreen />
    </ProtectedRoute>
  );
}



const getStyles = (theme) => {
  const { colors, spacing, radius, shadows } = theme;
  return StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: colors.bg.card,
    flexGrow: 1,
  },
  header: {
    marginBottom: 20,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text.primary,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    color: colors.text.muted,
    letterSpacing: 0.8,
    marginBottom: 12,
    marginLeft: 2,
  },
  faqCard: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 16,
    marginBottom: 24,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  faqItem: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  lastFaqItem: {
    borderBottomWidth: 0,
  },
  faqQuestionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
  },
  faqQuestion: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text.primary,
    flex: 1,
    marginRight: 16,
  },
  faqAnswerContainer: {
    backgroundColor: colors.bg.primary,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  faqAnswer: {
    fontSize: 14,
    color: colors.text.muted,
    lineHeight: 22,
  },
  formCard: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.secondary,
    marginBottom: 8,
    marginLeft: 2,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border.medium,
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    marginBottom: 16,
    backgroundColor: colors.bg.primary,
    color: colors.text.primary,
  },
  textArea: {
    height: 100,
  },
  priorityRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 20,
  },
  priorityPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border.subtle,
    backgroundColor: colors.bg.primary,
    alignItems: "center",
  },
  priorityPillSelected: {
    borderColor: "#3b82f6",
    backgroundColor: colors.accent.primaryMuted,
  },
  priorityLow: {
    borderColor: "#10b981",
    backgroundColor: "#ecfdf5",
  },
  priorityMedium: {
    borderColor: "#d97706",
    backgroundColor: "#fffbeb",
  },
  priorityHigh: {
    borderColor: colors.accent.danger,
    backgroundColor: colors.accent.dangerMuted,
  },
  priorityText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.secondary,
  },
  priorityTextSelected: {
    color: colors.text.primary,
    fontWeight: "700",
  },
  errorAlert: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.accent.dangerMuted,
    borderWidth: 1,
    borderColor: "#fca5a5",
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  errorText: {
    color: colors.accent.danger,
    fontSize: 14,
    fontWeight: "500",
    marginLeft: 8,
    flex: 1,
  },
  successAlert: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#6ee7b7",
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  successText: {
    color: colors.accent.success,
    fontSize: 14,
    fontWeight: "500",
    marginLeft: 8,
    flex: 1,
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent.primary,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 8,
  },
  submitButtonDisabled: {
    backgroundColor: "#93c5fd",
  },
  submitButtonText: {
    color: colors.text.inverse,
    fontWeight: "700",
    fontSize: 15,
    marginLeft: 8,
  },
  buttonPressed: {
    opacity: 0.85,
  },
});
};