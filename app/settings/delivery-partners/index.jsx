import React, { useContext, useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { DeliveryPartnerContext } from "../../context/DeliveryPartnerContext";
import ProtectedRoute from "../../components/ProtectedRoute";
import BackButton from "../../components/BackButton";
import { useTheme } from "../../context/ThemeContext";
import { useScrollRestoration } from "../../context/ScrollContext";

const STATUS_FILTERS = [
  { label: "All Partners", value: "All" },
  { label: "⭐ Preferred", value: "Preferred" },
  { label: "Active", value: "Active" },
  { label: "Inactive", value: "Inactive" },
];

const VEHICLE_ICONS = {
  "Mini Truck": "local-shipping",
  "Pickup": "airport-shuttle",
  "Tractor": "agriculture",
  "Lorry": "rv-hookup",
  "Auto": "electric-rickshaw",
  "Other": "directions-car",
};

function DeliveryPartnersListScreen() {
  const { theme } = useTheme();
  const { colors, spacing, radius, shadows } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);
  const router = useRouter();
  const { scrollViewRef, handleScroll, handleContentSizeChange } = useScrollRestoration("/settings/delivery-partners");
  const { partners, loading, toggleFavoritePartner } = useContext(DeliveryPartnerContext);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  };

  const filteredPartners = useMemo(() => {
    const list = partners.filter((partner) => {
      const matchesSearch = 
        (partner.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (partner.mobile || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (partner.vehicleNumber || "").toLowerCase().includes(searchQuery.toLowerCase());

      if (selectedStatus === "All") {
        return matchesSearch;
      } else if (selectedStatus === "Preferred") {
        return matchesSearch && partner.isFavorite;
      } else {
        return matchesSearch && partner.status === selectedStatus;
      }
    });

    list.sort((a, b) => {
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      return 0;
    });

    return list;
  }, [partners, searchQuery, selectedStatus]);

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#16a34a" />
        <Text style={styles.loadingText}>Loading delivery partners...</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView 
        ref={scrollViewRef}
        contentContainerStyle={styles.container}
        scrollEventThrottle={32}
        onScroll={handleScroll}
        onContentSizeChange={handleContentSizeChange}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={["#16a34a"]} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <BackButton label="Settings" onPress={() => router.push("/settings")} />
            <Pressable
              style={({ pressed }) => [styles.addButton, pressed && styles.buttonPressed]}
              onPress={() => router.push("/settings/delivery-partners/add")}
            >
              <MaterialIcons name="add" size={20} color={colors.bg.card} />
              <Text style={styles.addButtonText}>Add Partner</Text>
            </Pressable>
          </View>
          <Text style={styles.title}>Delivery Partners</Text>
          <Text style={styles.subtitle}>Manage drivers, logistics fleets, status, and orders.</Text>
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <MaterialIcons name="search" size={20} color={colors.text.muted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by name, phone, vehicle number..."
            placeholderTextColor={colors.text.muted}
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery("")}>
              <MaterialIcons name="close" size={20} color={colors.text.muted} />
            </Pressable>
          ) : null}
        </View>

        {/* Filter Pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          <View style={styles.filterRow}>
            {STATUS_FILTERS.map((filter) => {
              const isSelected = selectedStatus === filter.value;
              return (
                <Pressable
                  key={filter.value}
                  style={[styles.filterPill, isSelected && styles.filterPillSelected]}
                  onPress={() => setSelectedStatus(filter.value)}
                >
                  <Text style={[styles.filterText, isSelected && styles.filterTextSelected]}>
                    {filter.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        {/* Partners list */}
        <View style={styles.listContainer}>
          {filteredPartners.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrapper}>
                <MaterialIcons name="local-shipping" size={48} color={colors.border.medium} />
              </View>
              <Text style={styles.emptyTitle}>No Partners Found</Text>
              <Text style={styles.emptyDesc}>
                {searchQuery || selectedStatus !== "All"
                  ? "No delivery partners match your active search terms or status filters."
                  : "Your delivery fleet list is empty. Register drivers to handle orders dispatch."}
              </Text>
              {searchQuery || selectedStatus !== "All" ? (
                <Pressable
                  style={styles.clearFiltersBtn}
                  onPress={() => {
                    setSearchQuery("");
                    setSelectedStatus("All");
                  }}
                >
                  <Text style={styles.clearFiltersBtnText}>Reset Filters</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={styles.emptyCta}
                  onPress={() => router.push("/settings/delivery-partners/add")}
                >
                  <MaterialIcons name="add" size={20} color={colors.bg.card} />
                  <Text style={styles.emptyCtaText}>Add Delivery Partner</Text>
                </Pressable>
              )}
            </View>
          ) : (
            filteredPartners.map((partner) => {
              const isActive = partner.status === "Active";
              const vehicleIconName = VEHICLE_ICONS[partner.vehicleType] || "directions-car";

              return (
                <Pressable
                  key={partner.id}
                  style={({ pressed }) => [styles.partnerCard, pressed && styles.cardPressed]}
                  onPress={() => router.push({ pathname: "/settings/delivery-partners/details", params: { id: partner.id } })}
                >
                  <View style={[styles.iconWrapper, isActive ? styles.iconActive : styles.iconInactive]}>
                    <MaterialIcons name={vehicleIconName} size={26} color={isActive ? "#16a34a" : colors.text.muted} />
                  </View>
                  <View style={styles.partnerDetails}>
                    <View style={styles.partnerHeader}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                        <Text selectable={true} style={styles.partnerName} numberOfLines={1}>{partner.name}</Text>
                        <Pressable
                          onPress={(e) => {
                            e.stopPropagation();
                            toggleFavoritePartner(partner.id);
                          }}
                          hitSlop={8}
                          style={{ padding: 2 }}
                        >
                          <MaterialIcons
                            name={partner.isFavorite ? "star" : "star-border"}
                            size={18}
                            color={partner.isFavorite ? "#f59e0b" : colors.text.muted}
                          />
                        </Pressable>
                      </View>
                      <View style={[styles.statusBadge, isActive ? styles.statusActive : styles.statusInactive]}>
                        <Text style={[styles.statusBadgeText, isActive ? styles.statusActiveText : styles.statusInactiveText]}>
                          {partner.status}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.partnerMetaRow}>
                      <MaterialIcons name="phone" size={13} color={colors.text.muted} />
                      <Text selectable={true} style={styles.partnerMetaText}>{partner.mobile}</Text>
                    </View>
                    <View style={styles.partnerMetaRow}>
                      <MaterialIcons name="directions-car" size={13} color={colors.text.muted} />
                      <Text selectable={true} style={styles.partnerMetaText}>
                        {partner.vehicleType} {partner.vehicleNumber ? `— ${partner.vehicleNumber}` : ""}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.chevronIcon}>
                    <MaterialIcons name="chevron-right" size={24} color={colors.border.medium} />
                  </View>
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Floating Action Button */}
      <Pressable 
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={() => router.push("/settings/delivery-partners/add")}
      >
        <MaterialIcons name="add" size={28} color={colors.bg.card} />
      </Pressable>
    </View>
  );
}

export default function DeliveryRoute() {
  return (
    <ProtectedRoute>
      <DeliveryPartnersListScreen />
    </ProtectedRoute>
  );
}

const getStyles = (theme) => {
  const { colors, spacing, radius, shadows } = theme;
  return StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg.card,
  },
  container: {
    padding: 16,
    backgroundColor: colors.bg.card,
    flexGrow: 1,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.bg.card,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    color: colors.text.secondary,
    fontSize: 16,
    fontWeight: "500",
  },
  header: {
    marginBottom: 16,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
  },
  backText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text.secondary,
    marginLeft: 6,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#16a34a",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  addButtonText: {
    color: colors.bg.card,
    fontWeight: "700",
    fontSize: 13,
    marginLeft: 4,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.text.muted,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border.medium,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
    backgroundColor: colors.bg.primary,
    marginBottom: 16,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text.primary,
  },
  filterScroll: {
    marginBottom: 16,
    flexDirection: "row",
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
  },
  filterPill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: colors.bg.card,
    borderWidth: 1.5,
    borderColor: colors.border.subtle,
  },
  filterPillSelected: {
    backgroundColor: "#f0fdf4",
    borderColor: "#16a34a",
  },
  filterText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text.secondary,
  },
  filterTextSelected: {
    color: "#16a34a",
    fontWeight: "700",
  },
  listContainer: {
    gap: 12,
    marginBottom: 80, // Padding for FAB
  },
  partnerCard: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 16,
    padding: 12,
    backgroundColor: colors.bg.card,
    alignItems: "center",
  },
  cardPressed: {
    backgroundColor: colors.bg.primary,
    borderColor: colors.border.medium,
  },
  iconWrapper: {
    width: 52,
    height: 52,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  iconActive: {
    backgroundColor: "#f0fdf4",
  },
  iconInactive: {
    backgroundColor: colors.border.subtle,
  },
  partnerDetails: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  partnerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  partnerName: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text.primary,
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusActive: {
    backgroundColor: "#dcfce7",
  },
  statusInactive: {
    backgroundColor: colors.border.subtle,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  statusActiveText: {
    color: "#15803d",
  },
  statusInactiveText: {
    color: colors.text.secondary,
  },
  partnerMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3,
  },
  partnerMetaText: {
    fontSize: 12,
    color: colors.text.muted,
    marginLeft: 6,
  },
  chevronIcon: {
    justifyContent: "center",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 16,
  },
  emptyIconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.bg.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 14,
    color: colors.text.muted,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  emptyCta: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#16a34a",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  emptyCtaText: {
    color: colors.bg.card,
    fontWeight: "700",
    fontSize: 14,
    marginLeft: 6,
  },
  clearFiltersBtn: {
    borderWidth: 1.5,
    borderColor: colors.border.medium,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
  },
  clearFiltersBtnText: {
    color: colors.text.secondary,
    fontWeight: "600",
    fontSize: 14,
  },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    backgroundColor: "#16a34a",
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  fabPressed: {
    backgroundColor: "#15803d",
    opacity: 0.9,
  },
})
};
;
