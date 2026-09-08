import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  updateDoc,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import BackButton from "../../components/BackButton";
import ProtectedRoute from "../../components/ProtectedRoute";
import { useTheme } from "../../context/ThemeContext";
import { db, normalizeDateValue } from "../../../src/config/firebase";

const CARD_CATEGORIES = [
  { id: "All", label: "All Cards", icon: "badge" },
  { id: "Crusher", label: "Stone Crushers", icon: "domain" },
  { id: "Mistry", label: "Mistry & Masons", icon: "handyman" },
  { id: "Driver", label: "Drivers & Transport", icon: "local-shipping" },
  { id: "Worker", label: "Workers & Labor", icon: "groups" },
  { id: "Customer", label: "Customers & Retailers", icon: "person" },
  { id: "Mechanic", label: "Mechanics & Services", icon: "build" },
  { id: "Other", label: "Others", icon: "more-horiz" },
];

const CATEGORY_COLORS = {
  Crusher: "#8b5cf6",
  Mistry: "#f59e0b",
  Driver: "#3b82f6",
  Worker: "#10b981",
  Customer: "#ec4899",
  Mechanic: "#6366f1",
  Other: "#64748b",
};

export default function VisitingCardsManager() {
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const router = useRouter();

  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  // Form Modal State (Add / Edit)
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingCardId, setEditingCardId] = useState(null);
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState("Crusher");
  const [formContactPerson, setFormContactPerson] = useState("");
  const [formMobile, setFormMobile] = useState("");
  const [formAltMobile, setFormAltMobile] = useState("");
  const [formServices, setFormServices] = useState("");
  const [formProducts, setFormProducts] = useState([{ id: "1", name: "", rate: "" }]);
  const [formAddress, setFormAddress] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Detail Modal State
  const [selectedCard, setSelectedCard] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Subscribe to real-time visiting cards Firestore collection
  useEffect(() => {
    const q = query(collection(db, "visiting_cards"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          createdAt: normalizeDateValue(d.data().createdAt),
        }));

        list.sort((a, b) => {
          const tA = a.createdAt ? a.createdAt.getTime() : 0;
          const tB = b.createdAt ? b.createdAt.getTime() : 0;
          return tB - tA;
        });

        setCards(list);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching visiting cards:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Filtered Cards
  const filteredCards = useMemo(() => {
    return cards.filter((card) => {
      const matchesCategory =
        selectedCategory === "All" || card.category === selectedCategory;

      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        (card.name || "").toLowerCase().includes(q) ||
        (card.contactPerson || "").toLowerCase().includes(q) ||
        (card.mobile || "").toLowerCase().includes(q) ||
        (card.services || "").toLowerCase().includes(q) ||
        (card.address || "").toLowerCase().includes(q);

      return matchesCategory && matchesSearch;
    });
  }, [cards, selectedCategory, searchQuery]);

  // Product List Handlers
  const handleAddFormProduct = () => {
    setFormProducts((prev) => [
      ...prev,
      { id: String(Date.now()), name: "", rate: "" },
    ]);
  };

  const handleRemoveFormProduct = (index) => {
    setFormProducts((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdateFormProduct = (index, field, value) => {
    setFormProducts((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  // Reset Form
  const resetForm = () => {
    setEditingCardId(null);
    setFormName("");
    setFormCategory("Crusher");
    setFormContactPerson("");
    setFormMobile("");
    setFormAltMobile("");
    setFormServices("");
    setFormProducts([{ id: "1", name: "", rate: "" }]);
    setFormAddress("");
    setFormNotes("");
  };

  const handleOpenAddModal = () => {
    resetForm();
    setShowFormModal(true);
  };

  const handleOpenEditModal = (card) => {
    setEditingCardId(card.id);
    setFormName(card.name || "");
    setFormCategory(card.category || "Crusher");
    setFormContactPerson(card.contactPerson || "");
    setFormMobile(card.mobile || "");
    setFormAltMobile(card.altMobile || "");
    setFormServices(card.services || "");
    setFormProducts(
      Array.isArray(card.products) && card.products.length > 0
        ? card.products
        : [{ id: "1", name: "", rate: "" }]
    );
    setFormAddress(card.address || "");
    setFormNotes(card.notes || "");
    setShowDetailModal(false);
    setShowFormModal(true);
  };

  const handleSaveCard = async () => {
    if (!formName.trim()) {
      Alert.alert("Error", "Please enter a Name or Business Name.");
      return;
    }

    if (!formMobile.trim()) {
      Alert.alert("Error", "Please enter a Mobile Number.");
      return;
    }

    setSaving(true);
    try {
      const validProducts = formProducts.filter((p) => p.name.trim() !== "");
      const productsStr = validProducts
        .map((p) => (p.rate.trim() ? `${p.name.trim()} (₹${p.rate.trim()})` : p.name.trim()))
        .join(", ");

      const finalServices = [formServices.trim(), productsStr]
        .filter(Boolean)
        .join(", ");

      const payload = {
        name: formName.trim(),
        category: formCategory,
        contactPerson: formContactPerson.trim(),
        mobile: formMobile.trim(),
        altMobile: formAltMobile.trim(),
        services: finalServices,
        products: validProducts,
        address: formAddress.trim(),
        notes: formNotes.trim(),
        updatedAt: new Date(),
      };

      if (editingCardId) {
        await updateDoc(doc(db, "visiting_cards", editingCardId), payload);
        Alert.alert("Success", "Visiting card updated successfully.");
      } else {
        await addDoc(collection(db, "visiting_cards"), {
          ...payload,
          createdAt: new Date(),
        });
        Alert.alert("Success", "New visiting card saved successfully.");
      }

      setShowFormModal(false);
      resetForm();
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Failed to save visiting card.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCard = (card) => {
    Alert.alert(
      "Delete Visiting Card",
      `Are you sure you want to permanently delete "${card.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteDoc(doc(db, "visiting_cards", card.id));
              setShowDetailModal(false);
              Alert.alert("Deleted", "Visiting card removed.");
            } catch (e) {
              console.error(e);
              Alert.alert("Error", "Could not delete card.");
            }
          },
        },
      ]
    );
  };

  const handleCall = (phone) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`);
  };

  const handleWhatsApp = (phone) => {
    if (!phone) return;
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    const formatted = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    Linking.openURL(`whatsapp://send?phone=${formatted}`);
  };

  return (
    <ProtectedRoute>
      <View style={styles.container}>
        {/* Top Header */}
        <View style={styles.header}>
          <BackButton label="Settings" onPress={() => router.back()} />
          <Pressable style={styles.addCardBtn} onPress={handleOpenAddModal}>
            <MaterialIcons name="add" size={20} color="#FFFFFF" />
            <Text style={styles.addCardBtnText}>Add Card</Text>
          </Pressable>
        </View>

        <Text style={styles.pageTitle}>Visiting Cards Storage</Text>
        <Text style={styles.pageSubtitle}>
          Store & manage digital business cards for Crushers, Mistries, Drivers, Workers & Suppliers.
        </Text>

        {/* Search Bar */}
        <View style={styles.searchBox}>
          <MaterialIcons name="search" size={20} color={colors.text.muted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by name, phone, product, service, city..."
            placeholderTextColor={colors.text.muted}
            style={styles.searchInput}
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery("")}>
              <MaterialIcons name="close" size={18} color={colors.text.muted} />
            </Pressable>
          ) : null}
        </View>

        {/* Horizontal Category Scroll Filter */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScroll}
        >
          {CARD_CATEGORIES.map((cat) => {
            const active = selectedCategory === cat.id;
            const count =
              cat.id === "All"
                ? cards.length
                : cards.filter((c) => c.category === cat.id).length;

            return (
              <Pressable
                key={cat.id}
                style={[
                  styles.categoryPill,
                  active && styles.categoryPillActive,
                ]}
                onPress={() => setSelectedCategory(cat.id)}
              >
                <MaterialIcons
                  name={cat.icon}
                  size={16}
                  color={active ? "#FFFFFF" : colors.text.muted}
                />
                <Text
                  style={[
                    styles.categoryText,
                    active && styles.categoryTextActive,
                  ]}
                >
                  {cat.label} ({count})
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Cards List Grid */}
        {loading ? (
          <View style={styles.centeredView}>
            <ActivityIndicator size="large" color={colors.accent.primary} />
            <Text style={styles.loadingText}>Loading visiting cards...</Text>
          </View>
        ) : filteredCards.length === 0 ? (
          <View style={styles.emptyView}>
            <MaterialIcons name="badge" size={48} color={colors.text.muted} />
            <Text style={styles.emptyTitle}>No Visiting Cards Found</Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery
                ? "Try searching for a different keyword or category."
                : 'Tap "+ Add Card" above to save your first visiting card.'}
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.cardsGrid}>
            {filteredCards.map((card) => {
              const catColor = CATEGORY_COLORS[card.category] || "#64748b";
              const catLabel =
                (CARD_CATEGORIES.find((c) => c.id === card.category) || {})
                  .label || card.category;

              return (
                <Pressable
                  key={card.id}
                  style={({ pressed }) => [
                    styles.visitingCard,
                    pressed && { opacity: 0.8 },
                  ]}
                  onPress={() => {
                    setSelectedCard(card);
                    setShowDetailModal(true);
                  }}
                >
                  {/* Category Accent Header */}
                  <View style={[styles.cardHeader, { backgroundColor: catColor }]}>
                    <Text style={styles.cardCategoryText}>{catLabel}</Text>
                    <MaterialIcons name="badge" size={16} color="#FFFFFF" />
                  </View>

                  <View style={styles.cardBody}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {card.name}
                    </Text>

                    {card.contactPerson ? (
                      <View style={styles.cardMetaRow}>
                        <MaterialIcons name="person" size={14} color={colors.text.muted} />
                        <Text style={styles.cardMetaText} numberOfLines={1}>
                          {card.contactPerson}
                        </Text>
                      </View>
                    ) : null}

                    <View style={styles.cardMetaRow}>
                      <MaterialIcons name="phone" size={14} color={colors.accent.primary} />
                      <Text style={[styles.cardMetaText, { color: colors.text.primary, fontWeight: "600" }]}>
                        {card.mobile}
                      </Text>
                    </View>

                    {card.services ? (
                      <View style={styles.cardMetaRow}>
                        <MaterialIcons name="build" size={14} color={colors.text.muted} />
                        <Text style={styles.cardMetaText} numberOfLines={1}>
                          {card.services}
                        </Text>
                      </View>
                    ) : null}

                    {card.address ? (
                      <View style={styles.cardMetaRow}>
                        <MaterialIcons name="place" size={14} color={colors.text.muted} />
                        <Text style={styles.cardMetaText} numberOfLines={1}>
                          {card.address}
                        </Text>
                      </View>
                    ) : null}

                    {/* Quick Call / WhatsApp Action Buttons */}
                    <View style={styles.cardActionsRow}>
                      <Pressable
                        style={[styles.quickBtn, { backgroundColor: "#10b98115" }]}
                        onPress={() => handleCall(card.mobile)}
                      >
                        <MaterialIcons name="call" size={16} color="#10b981" />
                        <Text style={[styles.quickBtnText, { color: "#10b981" }]}>Call</Text>
                      </Pressable>

                      <Pressable
                        style={[styles.quickBtn, { backgroundColor: "#25D36615" }]}
                        onPress={() => handleWhatsApp(card.mobile)}
                      >
                        <MaterialIcons name="chat" size={16} color="#25D366" />
                        <Text style={[styles.quickBtnText, { color: "#25D366" }]}>WhatsApp</Text>
                      </Pressable>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* Add / Edit Form Modal */}
        <Modal visible={showFormModal} transparent animationType="fade">
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalBg}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>
                  {editingCardId ? "Edit Visiting Card" : "Add Visiting Card"}
                </Text>
                <Pressable onPress={() => setShowFormModal(false)}>
                  <MaterialIcons name="close" size={22} color={colors.text.muted} />
                </Pressable>
              </View>

              <ScrollView style={{ maxHeight: 440 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={styles.label}>Category / Role *</Text>
                <View style={styles.categoryPickerRow}>
                  {CARD_CATEGORIES.filter((c) => c.id !== "All").map((c) => {
                    const active = formCategory === c.id;
                    return (
                      <Pressable
                        key={c.id}
                        style={[
                          styles.categoryChoiceBtn,
                          active && {
                            backgroundColor: CATEGORY_COLORS[c.id] || colors.accent.primary,
                            borderColor: CATEGORY_COLORS[c.id] || colors.accent.primary,
                          },
                        ]}
                        onPress={() => setFormCategory(c.id)}
                      >
                        <Text
                          style={[
                            styles.categoryChoiceText,
                            active && { color: "#FFFFFF", fontWeight: "700" },
                          ]}
                        >
                          {c.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.label}>Business / Entity / Person Name *</Text>
                <TextInput
                  value={formName}
                  onChangeText={setFormName}
                  placeholder="e.g. Sri Balaji Stone Crusher / Ramesh Mistry"
                  placeholderTextColor={colors.text.muted}
                  style={styles.input}
                />

                <Text style={styles.label}>Contact Person Name</Text>
                <TextInput
                  value={formContactPerson}
                  onChangeText={setFormContactPerson}
                  placeholder="e.g. Kumar (Owner / Operator)"
                  placeholderTextColor={colors.text.muted}
                  style={styles.input}
                />

                <Text style={styles.label}>Primary Mobile Number *</Text>
                <TextInput
                  value={formMobile}
                  onChangeText={setFormMobile}
                  keyboardType="phone-pad"
                  placeholder="e.g. 9876543210"
                  placeholderTextColor={colors.text.muted}
                  style={styles.input}
                />

                <Text style={styles.label}>Alternate / WhatsApp Number</Text>
                <TextInput
                  value={formAltMobile}
                  onChangeText={setFormAltMobile}
                  keyboardType="phone-pad"
                  placeholder="e.g. 9123456789"
                  placeholderTextColor={colors.text.muted}
                  style={styles.input}
                />

                {/* Multi-Product Entry Section */}
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8, marginBottom: 6 }}>
                  <Text style={styles.label}>Specific Products & Rates</Text>
                  <Pressable
                    style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.accent.primary + "15", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}
                    onPress={handleAddFormProduct}
                  >
                    <MaterialIcons name="add-circle" size={16} color={colors.accent.primary} />
                    <Text style={{ fontSize: 12, fontWeight: "700", color: colors.accent.primary }}>+ Add More Product</Text>
                  </Pressable>
                </View>

                {formProducts.map((prod, idx) => (
                  <View key={prod.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <TextInput
                      style={[styles.input, { flex: 2, marginBottom: 0 }]}
                      value={prod.name}
                      onChangeText={(v) => handleUpdateFormProduct(idx, "name", v)}
                      placeholder={`Product ${idx + 1} (e.g. 20mm Jelly)`}
                      placeholderTextColor={colors.text.muted}
                    />
                    <TextInput
                      style={[styles.input, { flex: 1, marginBottom: 0 }]}
                      value={prod.rate}
                      onChangeText={(v) => handleUpdateFormProduct(idx, "rate", v)}
                      keyboardType="numeric"
                      placeholder="Rate (₹)"
                      placeholderTextColor={colors.text.muted}
                    />
                    {formProducts.length > 1 && (
                      <Pressable onPress={() => handleRemoveFormProduct(idx)} hitSlop={8}>
                        <MaterialIcons name="delete" size={18} color={colors.accent.danger} />
                      </Pressable>
                    )}
                  </View>
                ))}

                <Text style={styles.label}>Products / Services Overview</Text>
                <TextInput
                  value={formServices}
                  onChangeText={setFormServices}
                  placeholder="e.g. 20mm Jelly, Stone Dust, Tipper Transport, Brick Laying"
                  placeholderTextColor={colors.text.muted}
                  style={styles.input}
                />

                {/* Quick Tag Suggestions */}
                <View style={{ marginBottom: 10 }}>
                  <Text style={{ fontSize: 11, fontWeight: "600", color: colors.text.muted, marginBottom: 4 }}>Quick Tags (Tap to add):</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                    {(
                      {
                        Crusher: ["20mm Jelly", "12mm Jelly", "Stone Dust", "M Sand", "P Sand", "40mm Jelly"],
                        Mistry: ["Masonry Work", "Block Laying", "Plastering", "Concrete", "Tile Work"],
                        Driver: ["Tipper Driver", "Tractor Driver", "Lorry Transport", "Heavy Tipper"],
                        Worker: ["Loading Staff", "Unloading Staff", "General Helper", "Operator"],
                        Customer: ["Retail Buyer", "Contractor", "Builder", "Wholesaler"],
                        Mechanic: ["Machine Maintenance", "Electrical", "Hydraulics", "Welding"],
                        Other: ["Raw Materials", "Equipment", "Supplies"],
                      }[formCategory] || ["Raw Materials", "Services"]
                    ).map((tag) => (
                      <Pressable
                        key={tag}
                        style={{ backgroundColor: colors.bg.primary, borderWidth: 1, borderColor: colors.border.subtle, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12 }}
                        onPress={() => {
                          if (!formServices) {
                            setFormServices(tag);
                          } else if (!formServices.includes(tag)) {
                            setFormServices(`${formServices}, ${tag}`);
                          }
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: "600", color: colors.accent.primary }}>+ {tag}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>

                <Text style={styles.label}>City / Location / Address</Text>
                <TextInput
                  value={formAddress}
                  onChangeText={setFormAddress}
                  placeholder="e.g. Industrial Area, Mysuru"
                  placeholderTextColor={colors.text.muted}
                  style={styles.input}
                />

                <Text style={styles.label}>Notes / Remarks (Optional)</Text>
                <TextInput
                  value={formNotes}
                  onChangeText={setFormNotes}
                  placeholder="e.g. High quality jelly supplier, credit available"
                  placeholderTextColor={colors.text.muted}
                  style={styles.input}
                />
              </ScrollView>

              <View style={styles.modalActions}>
                <Pressable
                  style={styles.modalCancelBtn}
                  onPress={() => setShowFormModal(false)}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={styles.modalSaveBtn}
                  onPress={handleSaveCard}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.modalSaveText}>Save Card</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* View Card Detail Modal */}
        {selectedCard && (
          <Modal visible={showDetailModal} transparent animationType="fade">
            <View style={styles.modalBg}>
              <View style={[styles.modalContent, { padding: 0, overflow: "hidden" }]}>
                {/* Visual Digital Business Card Header */}
                <View
                  style={{
                    backgroundColor:
                      CATEGORY_COLORS[selectedCard.category] || colors.accent.primary,
                    padding: 20,
                    alignItems: "center",
                  }}
                >
                  <MaterialIcons name="badge" size={40} color="#FFFFFF" />
                  <Text style={{ fontSize: 20, fontWeight: "800", color: "#FFFFFF", marginTop: 6, textAlign: "center" }}>
                    {selectedCard.name}
                  </Text>
                  <Text style={{ fontSize: 13, color: "#FFFFFF", opacity: 0.9, marginTop: 2 }}>
                    {(CARD_CATEGORIES.find((c) => c.id === selectedCard.category) || {}).label || selectedCard.category}
                  </Text>
                </View>

                {/* Card Information Body */}
                <ScrollView style={{ padding: 16, maxHeight: 350 }}>
                  {selectedCard.contactPerson ? (
                    <View style={styles.detailRow}>
                      <MaterialIcons name="person" size={18} color={colors.accent.primary} />
                      <View>
                        <Text style={styles.detailLabel}>Contact Person</Text>
                        <Text style={styles.detailValue}>{selectedCard.contactPerson}</Text>
                      </View>
                    </View>
                  ) : null}

                  <View style={styles.detailRow}>
                    <MaterialIcons name="phone" size={18} color={colors.accent.primary} />
                    <View>
                      <Text style={styles.detailLabel}>Primary Mobile</Text>
                      <Text style={[styles.detailValue, { fontWeight: "700" }]}>{selectedCard.mobile}</Text>
                    </View>
                  </View>

                  {selectedCard.altMobile ? (
                    <View style={styles.detailRow}>
                      <MaterialIcons name="phone-android" size={18} color={colors.accent.primary} />
                      <View>
                        <Text style={styles.detailLabel}>Alternate / WhatsApp</Text>
                        <Text style={styles.detailValue}>{selectedCard.altMobile}</Text>
                      </View>
                    </View>
                  ) : null}

                  {selectedCard.services ? (
                    <View style={styles.detailRow}>
                      <MaterialIcons name="build" size={18} color={colors.accent.primary} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.detailLabel}>Products & Services Offered</Text>
                        <Text style={styles.detailValue}>{selectedCard.services}</Text>
                      </View>
                    </View>
                  ) : null}

                  {selectedCard.address ? (
                    <View style={styles.detailRow}>
                      <MaterialIcons name="place" size={18} color={colors.accent.primary} />
                      <View>
                        <Text style={styles.detailLabel}>Address / Location</Text>
                        <Text style={styles.detailValue}>{selectedCard.address}</Text>
                      </View>
                    </View>
                  ) : null}

                  {selectedCard.notes ? (
                    <View style={styles.detailRow}>
                      <MaterialIcons name="notes" size={18} color={colors.accent.primary} />
                      <View>
                        <Text style={styles.detailLabel}>Notes & Remarks</Text>
                        <Text style={styles.detailValue}>{selectedCard.notes}</Text>
                      </View>
                    </View>
                  ) : null}
                </ScrollView>

                {/* Call & WhatsApp Quick Buttons */}
                <View style={{ flexDirection: "row", paddingHorizontal: 16, gap: 10, marginBottom: 12 }}>
                  <Pressable
                    style={[styles.bigActionBtn, { backgroundColor: "#10b981", flex: 1 }]}
                    onPress={() => handleCall(selectedCard.mobile)}
                  >
                    <MaterialIcons name="call" size={18} color="#FFFFFF" />
                    <Text style={styles.bigActionBtnText}>Call Now</Text>
                  </Pressable>

                  <Pressable
                    style={[styles.bigActionBtn, { backgroundColor: "#25D366", flex: 1 }]}
                    onPress={() => handleWhatsApp(selectedCard.mobile)}
                  >
                    <MaterialIcons name="chat" size={18} color="#FFFFFF" />
                    <Text style={styles.bigActionBtnText}>WhatsApp</Text>
                  </Pressable>
                </View>

                {/* Edit & Delete Action Row */}
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 14, backgroundColor: colors.bg.primary, borderTopWidth: 1, borderTopColor: colors.border.subtle }}>
                  <Pressable
                    style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                    onPress={() => handleDeleteCard(selectedCard)}
                  >
                    <MaterialIcons name="delete" size={18} color={colors.accent.danger} />
                    <Text style={{ color: colors.accent.danger, fontWeight: "700", fontSize: 13 }}>Delete</Text>
                  </Pressable>

                  <Pressable
                    style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                    onPress={() => handleOpenEditModal(selectedCard)}
                  >
                    <MaterialIcons name="edit" size={18} color={colors.accent.primary} />
                    <Text style={{ color: colors.accent.primary, fontWeight: "700", fontSize: 13 }}>Edit Card</Text>
                  </Pressable>

                  <Pressable onPress={() => setShowDetailModal(false)}>
                    <Text style={{ color: colors.text.muted, fontWeight: "700", fontSize: 13 }}>Close</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>
        )}
      </View>
    </ProtectedRoute>
  );
}

const getStyles = (theme) => {
  const { colors } = theme;
  return StyleSheet.create({
    container: {
      flex: 1,
      padding: 16,
      backgroundColor: colors.bg.card,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    addCardBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.accent.primary,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
    },
    addCardBtnText: {
      color: "#FFFFFF",
      fontWeight: "700",
      fontSize: 13,
    },
    pageTitle: {
      fontSize: 22,
      fontWeight: "800",
      color: colors.text.primary,
    },
    pageSubtitle: {
      fontSize: 13,
      color: colors.text.muted,
      marginBottom: 14,
    },
    searchBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: 12,
      paddingHorizontal: 12,
      height: 42,
      marginBottom: 12,
    },
    searchInput: {
      flex: 1,
      color: colors.text.primary,
      fontSize: 14,
    },
    categoryScroll: {
      gap: 8,
      paddingBottom: 12,
    },
    categoryPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    categoryPillActive: {
      backgroundColor: colors.accent.primary,
      borderColor: colors.accent.primary,
    },
    categoryText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.text.primary,
    },
    categoryTextActive: {
      color: "#FFFFFF",
      fontWeight: "700",
    },
    cardsGrid: {
      gap: 12,
      paddingBottom: 24,
    },
    visitingCard: {
      backgroundColor: colors.bg.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      overflow: "hidden",
      elevation: 2,
    },
    cardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 6,
    },
    cardCategoryText: {
      fontSize: 11,
      fontWeight: "800",
      color: "#FFFFFF",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    cardBody: {
      padding: 14,
      gap: 6,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: colors.text.primary,
    },
    cardMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    cardMetaText: {
      fontSize: 13,
      color: colors.text.secondary,
      flex: 1,
    },
    cardActionsRow: {
      flexDirection: "row",
      gap: 8,
      marginTop: 8,
    },
    quickBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
    },
    quickBtnText: {
      fontSize: 12,
      fontWeight: "700",
    },
    centeredView: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      marginTop: 40,
    },
    loadingText: {
      marginTop: 8,
      color: colors.text.muted,
      fontSize: 13,
    },
    emptyView: {
      alignItems: "center",
      justifyContent: "center",
      padding: 30,
      marginTop: 20,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text.primary,
      marginTop: 8,
    },
    emptySubtitle: {
      fontSize: 13,
      color: colors.text.muted,
      textAlign: "center",
      marginTop: 4,
    },
    modalBg: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.65)",
      justifyContent: "center",
      alignItems: "center",
      padding: 16,
    },
    modalContent: {
      width: "100%",
      maxWidth: 440,
      backgroundColor: colors.bg.card,
      borderRadius: 16,
      padding: 16,
      elevation: 5,
    },
    modalHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: "800",
      color: colors.text.primary,
    },
    label: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text.secondary,
      marginTop: 10,
      marginBottom: 4,
    },
    input: {
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 14,
      color: colors.text.primary,
    },
    categoryPickerRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginBottom: 6,
    },
    categoryChoiceBtn: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    categoryChoiceText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.text.primary,
    },
    modalActions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 10,
      marginTop: 16,
    },
    modalCancelBtn: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
    },
    modalCancelText: {
      fontWeight: "700",
      color: colors.text.muted,
    },
    modalSaveBtn: {
      backgroundColor: colors.accent.primary,
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 10,
    },
    modalSaveText: {
      fontWeight: "700",
      color: "#FFFFFF",
    },
    detailRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      marginBottom: 12,
    },
    detailLabel: {
      fontSize: 11,
      color: colors.text.muted,
      fontWeight: "600",
    },
    detailValue: {
      fontSize: 14,
      color: colors.text.primary,
      fontWeight: "500",
    },
    bigActionBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 10,
      borderRadius: 10,
    },
    bigActionBtnText: {
      color: "#FFFFFF",
      fontWeight: "700",
      fontSize: 13,
    },
  });
};
