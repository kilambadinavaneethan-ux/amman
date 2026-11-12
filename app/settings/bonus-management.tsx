import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  ListRenderItem,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

// Theme & Navigation
import { useResponsive } from "../../utils/responsive";
import BackButton from "../components/BackButton";
import EasyCalendarModal from "../components/EasyCalendarModal";
import ProtectedRoute from "../components/ProtectedRoute";
import { useScrollRestoration } from "../context/ScrollContext";
import { useTheme } from "../context/ThemeContext";

// Contexts & Firebase
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { db, normalizeDateValue } from "../../src/config/firebase";
import { BonusEntry } from "../../src/types/models";
import { getMarkingConfig, normalizeMarkings } from "../../src/utils/markingUtils";
import { roundCurrency } from "../../utils/currency";
import {
  buildUnifiedBonuses,
  computeBonusStats,
  filterAndSortBonuses,
} from "../../utils/ledgerCalculations";
import { CustomerContext } from "../context/CustomerContext";
import { DeliveryPartnerContext } from "../context/DeliveryPartnerContext";
import { UserContext } from "../context/UserContext";
import { WorkerContext } from "../context/WorkerContext";

type BonusItem = BonusEntry;

const OTHER_ROLES = [
  { id: "police", label: "Police", icon: "local-police" as const, emoji: "👮" },
  { id: "lineman", label: "Lineman / EB", icon: "bolt" as const, emoji: "⚡" },
  { id: "sanitation", label: "Municipal / Sanitation", icon: "cleaning-services" as const, emoji: "🧹" },
  { id: "security", label: "Security / Watchman", icon: "security" as const, emoji: "🛡️" },
  { id: "postman", label: "Postman / Courier", icon: "local-post-office" as const, emoji: "📮" },
  { id: "inspector", label: "Local Authority / Inspector", icon: "account-balance" as const, emoji: "🏛️" },
  { id: "custom", label: "Custom / Other", icon: "edit" as const, emoji: "✍️" },
];

const OTHER_REASONS = [
  "Festival Gift (Diwali / Pongal)",
  "Goodwill & Public Relations Perk",
  "Emergency / Priority Service Tip",
  "Maintenance & Support Tip",
  "New Year Greeting Perk",
  "Appreciation Gratuity",
  "Custom",
];

function getOtherRoleDetails(role?: string) {
  const r = (role || "").toLowerCase();
  if (r.includes("polic") || r.includes("traffic") || r.includes("cop")) {
    return { label: role || "Police", icon: "local-police" as const, color: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE" };
  }
  if (r.includes("line") || r.includes("eb") || r.includes("electric") || r.includes("wireman") || r.includes("power")) {
    return { label: role || "Lineman / EB", icon: "bolt" as const, color: "#D97706", bg: "#FEF3C7", border: "#FDE68A" };
  }
  if (r.includes("sanit") || r.includes("municip") || r.includes("clean") || r.includes("garbage")) {
    return { label: role || "Municipal / Sanitation", icon: "cleaning-services" as const, color: "#059669", bg: "#ECFDF5", border: "#A7F3D0" };
  }
  if (r.includes("secur") || r.includes("guard") || r.includes("watch")) {
    return { label: role || "Security", icon: "security" as const, color: "#4B5563", bg: "#F3F4F6", border: "#E5E7EB" };
  }
  if (r.includes("post") || r.includes("mail") || r.includes("courier")) {
    return { label: role || "Postman", icon: "local-post-office" as const, color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" };
  }
  if (r.includes("inspect") || r.includes("offic") || r.includes("govt") || r.includes("author")) {
    return { label: role || "Authority", icon: "account-balance" as const, color: "#7C3AED", bg: "#F5F3FF", border: "#DDD6FE" };
  }
  return { label: role || "Other", icon: "groups" as const, color: "#9333EA", bg: "#FAF5FF", border: "#E9D5FF" };
}

interface BonusRowProps {
  item: BonusItem;
  isDark: boolean;
  styles: any;
  colors: any;
  onSelect: (item: BonusItem) => void;
}

const BonusRow = React.memo(function BonusRow({
  item,
  isDark,
  styles,
  colors,
  onSelect,
}: BonusRowProps) {
  const isWorker = item.type === "worker";
  const isDelivery = item.type === "delivery";
  const isCust = item.type === "customer";
  const isOther = item.type === "other";

  const otherRole = isOther ? getOtherRoleDetails(item.recipientRole) : null;

  const tagBg = isWorker
    ? `${colors.accent.primary}18`
    : isDelivery
      ? "#8B5CF618"
      : isCust
        ? "#10B98118"
        : otherRole?.bg || "#9333EA18";

  const tagColor = isWorker
    ? colors.accent.primary
    : isDelivery
      ? "#8B5CF6"
      : isCust
        ? "#10B981"
        : otherRole?.color || "#9333EA";

  const iconName = isWorker
    ? "engineering"
    : isDelivery
      ? "local-shipping"
      : isCust
        ? "loyalty"
        : (otherRole?.icon as any) || "groups";

  const roleLabel = isWorker
    ? "Worker"
    : isDelivery
      ? "Delivery"
      : isCust
        ? "Marked Cust."
        : item.recipientRole || "Other";

  return (
    <Pressable
      style={({ pressed }) => [
        styles.bonusCard,
        pressed && styles.bonusCardPressed,
      ]}
      onPress={() => onSelect(item)}
    >
      <View style={styles.cardHeaderRow}>
        <View style={styles.cardRecipientGroup}>
          <View style={[styles.recipientAvatar, { backgroundColor: tagBg }]}>
            <MaterialIcons name={iconName} size={20} color={tagColor} />
          </View>
          <View style={styles.bonusCardMain}>
            <View style={styles.nameBadgeRow}>
              <Text style={styles.recipientName} numberOfLines={1}>
                {item.recipientName}
              </Text>
              <View style={[styles.roleBadge, { backgroundColor: tagBg }]}>
                <Text style={[styles.roleBadgeText, { color: tagColor }]}>
                  {roleLabel}
                </Text>
              </View>
            </View>
            <Text style={styles.bonusDate}>
              {item.createdAt.toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </Text>
          </View>
        </View>

        <View style={styles.cardAmountGroup}>
          <Text style={styles.bonusAmount}>
            ₹{item.amount.toLocaleString("en-IN")}
          </Text>
          <View style={styles.verifiedStarPill}>
            <MaterialIcons name="stars" size={12} color="#F59E0B" />
            <Text style={styles.verifiedStarText}>Reward</Text>
          </View>
        </View>
      </View>

      {/* Active Markings chips if customer */}
      {isCust && item.markings && item.markings.length > 0 && (
        <View style={styles.markingsRow}>
          {item.markings.map((tag) => {
            const cfg = getMarkingConfig(tag, isDark);
            return (
              <View
                key={tag}
                style={[
                  styles.markingPill,
                  { backgroundColor: cfg.bg, borderColor: cfg.border },
                ]}
              >
                <MaterialIcons name={cfg.icon} size={11} color={cfg.color} />
                <Text style={[styles.markingPillText, { color: cfg.color }]}>
                  {tag}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.cardBody}>
        <View style={styles.reasonPill}>
          <MaterialIcons name="label" size={13} color="#D97706" />
          <Text style={styles.reasonText} numberOfLines={1}>
            {item.reason}
          </Text>
        </View>

        {item.notes ? (
          <Text style={styles.notesPreview} numberOfLines={2}>
            "{item.notes}"
          </Text>
        ) : null}
      </View>

      <View style={styles.cardFooter}>
        <Text style={styles.tapToViewText}>Tap for details, receipt & options</Text>
        <MaterialIcons name="chevron-right" size={18} color={colors.text.muted} />
      </View>
    </Pressable>
  );
});

const WORKER_REASONS = [
  "Festival Bonus",
  "Performance Bonus",
  "Overtime Incentive",
  "Attendance Reward",
  "Diwali / Pongal Gift",
  "Safety & Quality Reward",
  "Custom",
];

const DELIVERY_REASONS = [
  "On-Time Delivery Bonus",
  "Distance & Fuel Allowance",
  "Rain & Weather Allowance",
  "Peak Hours Incentive",
  "Festival Bonus",
  "Performance Reward",
  "Custom",
];

const CUSTOMER_REASONS = [
  "Contractor Commission",
  "Project Referral Incentive",
  "Festival Gift / Reward",
  "VIP Loyalty Bonus",
  "High Volume Turnover Bonus",
  "Architect / Engineer Perk",
  "Special Client Rebate",
  "Custom",
];

const QUICK_AMOUNTS = [500, 1000, 2000, 5000];

function BonusManagementContent() {
  const router = useRouter();
  const { theme } = useTheme();
  const { colors, spacing, radius, shadows } = theme;
  const { insets, kavBehavior, bottomFabOffset, scrollBottomPadding, currencyKpiTextProps } =
    useResponsive();
  const styles = useMemo(() => getStyles(theme), [theme]);
  const { scrollViewRef, handleScroll, handleContentSizeChange } =
    useScrollRestoration("/settings/bonus-management");

  // Contexts
  const {
    workers = [],
    logBonus,
    editWorkerBonus,
    deleteWorkerBonus,
  } = (useContext(WorkerContext) as any) || {};

  const {
    partners: deliveryPartners = [],
    logPartnerBonus,
    updatePartnerBonus,
    deletePartnerBonus,
  } = (useContext(DeliveryPartnerContext) as any) || {};

  const { customers = [] } = (useContext(CustomerContext) as any) || {};
  const { profile: userProfile } = (useContext(UserContext) as any) || {};

  // Real-time raw bonus logs
  const [workerBonusesRaw, setWorkerBonusesRaw] = useState<any[]>([]);
  const [deliveryBonusesRaw, setDeliveryBonusesRaw] = useState<any[]>([]);
  const [customerBonusesRaw, setCustomerBonusesRaw] = useState<any[]>([]);
  const [otherBonusesRaw, setOtherBonusesRaw] = useState<any[]>([]);
  const [loadingWorkerBonuses, setLoadingWorkerBonuses] = useState(true);
  const [loadingDeliveryBonuses, setLoadingDeliveryBonuses] = useState(true);
  const [loadingCustomerBonuses, setLoadingCustomerBonuses] = useState(true);
  const [loadingOtherBonuses, setLoadingOtherBonuses] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Active Marking Customers filter
  const activeMarkingCustomers = useMemo(() => {
    return (customers || []).filter((c: any) => {
      const marks = normalizeMarkings(c);
      return Array.isArray(marks) && marks.length > 0;
    });
  }, [customers]);

  // Filters & Search
  const [selectedTab, setSelectedTab] = useState<"all" | "worker" | "delivery" | "customer" | "other">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPeriod, setSelectedPeriod] = useState<"all" | "today" | "week" | "month" | "custom">("all");
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [calendarTarget, setCalendarTarget] = useState<"start" | "end" | "award" | "edit" | null>(null);
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "amount_desc" | "amount_asc">("newest");

  // Modals
  const [isAwardModalOpen, setIsAwardModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedBonus, setSelectedBonus] = useState<BonusItem | null>(null);

  // Award Bonus Form State
  const [awardType, setAwardType] = useState<"worker" | "delivery" | "customer" | "other">("worker");
  const [awardRecipientId, setAwardRecipientId] = useState("");
  const [recipientSearchText, setRecipientSearchText] = useState("");
  // Other recipient fields
  const [awardOtherName, setAwardOtherName] = useState("");
  const [awardOtherPhone, setAwardOtherPhone] = useState("");
  const [awardOtherRolePreset, setAwardOtherRolePreset] = useState("police");
  const [awardOtherRoleCustom, setAwardOtherRoleCustom] = useState("");

  const [awardAmount, setAwardAmount] = useState("");
  const [awardReasonPreset, setAwardReasonPreset] = useState("Festival Bonus");
  const [awardReasonCustom, setAwardReasonCustom] = useState("");
  const [awardNotes, setAwardNotes] = useState("");
  const [awardDate, setAwardDate] = useState<Date>(new Date());
  const [isSavingAward, setIsSavingAward] = useState(false);

  // Edit Bonus Form State
  const [editAmount, setEditAmount] = useState("");
  const [editOtherName, setEditOtherName] = useState("");
  const [editOtherRole, setEditOtherRole] = useState("");
  const [editOtherPhone, setEditOtherPhone] = useState("");
  const [editReasonPreset, setEditReasonPreset] = useState("");
  const [editReasonCustom, setEditReasonCustom] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editDate, setEditDate] = useState<Date>(new Date());
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Listen to workerBonuses
  useEffect(() => {
    setLoadingWorkerBonuses(true);
    const qWorker = query(collection(db, "workerBonuses"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      qWorker,
      (snapshot) => {
        const docs = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          createdAt: normalizeDateValue(d.data().createdAt),
        }));
        setWorkerBonusesRaw(docs);
        setLoadingWorkerBonuses(false);
      },
      (err) => {
        console.log("Error loading workerBonuses:", err);
        setLoadingWorkerBonuses(false);
      }
    );
    return () => unsub();
  }, []);

  // Listen to deliveryPartnerBonuses
  useEffect(() => {
    setLoadingDeliveryBonuses(true);
    const qDelivery = query(collection(db, "deliveryPartnerBonuses"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      qDelivery,
      (snapshot) => {
        const docs = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          createdAt: normalizeDateValue(d.data().createdAt),
        }));
        setDeliveryBonusesRaw(docs);
        setLoadingDeliveryBonuses(false);
      },
      (err) => {
        console.log("Error loading deliveryPartnerBonuses:", err);
        setLoadingDeliveryBonuses(false);
      }
    );
    return () => unsub();
  }, []);

  // Listen to customerBonuses
  useEffect(() => {
    setLoadingCustomerBonuses(true);
    const qCustomer = query(collection(db, "customerBonuses"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      qCustomer,
      (snapshot) => {
        const docs = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          createdAt: normalizeDateValue(d.data().createdAt),
        }));
        setCustomerBonusesRaw(docs);
        setLoadingCustomerBonuses(false);
      },
      (err) => {
        console.log("Error loading customerBonuses:", err);
        setLoadingCustomerBonuses(false);
      }
    );
    return () => unsub();
  }, []);

  // Listen to otherBonuses (Police, Lineman, Municipal, Security, etc.)
  useEffect(() => {
    setLoadingOtherBonuses(true);
    const qOther = query(collection(db, "otherBonuses"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      qOther,
      (snapshot) => {
        const docs = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          createdAt: normalizeDateValue(d.data().createdAt),
        }));
        setOtherBonusesRaw(docs);
        setLoadingOtherBonuses(false);
      },
      (err) => {
        console.log("Error loading otherBonuses:", err);
        setLoadingOtherBonuses(false);
      }
    );
    return () => unsub();
  }, []);

  // Name mapping maps
  const workerMap = useMemo(() => {
    const map = new Map<string, { name: string; phone?: string }>();
    (workers || []).forEach((w: any) => {
      map.set(w.id, {
        name: w.name || w.fullName || "Worker",
        phone: w.phone || w.mobile || "",
      });
    });
    return map;
  }, [workers]);

  const partnerMap = useMemo(() => {
    const map = new Map<string, { name: string; phone?: string }>();
    (deliveryPartners || []).forEach((p: any) => {
      map.set(p.id, {
        name: p.name || p.partnerName || "Delivery Partner",
        phone: p.phone || p.mobile || "",
      });
    });
    return map;
  }, [deliveryPartners]);

  const customerMap = useMemo(() => {
    const map = new Map<string, { name: string; phone?: string; markings: string[] }>();
    (customers || []).forEach((c: any) => {
      map.set(c.id, {
        name: c.name || "Customer",
        phone: c.phone || "",
        markings: normalizeMarkings(c),
      });
    });
    return map;
  }, [customers]);

  // Combined Unified Bonuses List
  const unifiedBonuses = useMemo<BonusItem[]>(
    () =>
      buildUnifiedBonuses({
        workerBonusesRaw,
        deliveryBonusesRaw,
        customerBonusesRaw,
        otherBonusesRaw,
        workerMap,
        partnerMap,
        customerMap,
      }),
    [
      workerBonusesRaw,
      deliveryBonusesRaw,
      customerBonusesRaw,
      otherBonusesRaw,
      workerMap,
      partnerMap,
      customerMap,
    ]
  );

  // Unique past 'Other' recipients for autocomplete / suggestions
  const pastOtherRecipients = useMemo(() => {
    const map = new Map<string, { name: string; phone?: string; role?: string }>();
    otherBonusesRaw.forEach((item) => {
      const name = (item.recipientName || "").trim();
      if (name && !map.has(name.toLowerCase())) {
        map.set(name.toLowerCase(), {
          name,
          phone: item.recipientPhone || "",
          role: item.recipientRole || "",
        });
      }
    });
    return Array.from(map.values());
  }, [otherBonusesRaw]);

  // Filtered recipients for award modal search
  const filteredAwardRecipients = useMemo(() => {
    const q = recipientSearchText.trim().toLowerCase();

    if (awardType === "worker") {
      return (workers || []).filter((w: any) => {
        if (!q) return true;
        const name = (w.name || w.fullName || "").toLowerCase();
        const phone = (w.phone || w.mobile || "").toLowerCase();
        const role = (w.role || "").toLowerCase();
        return name.includes(q) || phone.includes(q) || role.includes(q);
      });
    }

    if (awardType === "delivery") {
      return (deliveryPartners || []).filter((p: any) => {
        if (!q) return true;
        const name = (p.name || p.partnerName || "").toLowerCase();
        const phone = (p.phone || p.mobile || "").toLowerCase();
        const vehicle = (p.vehicleNumber || "").toLowerCase();
        return name.includes(q) || phone.includes(q) || vehicle.includes(q);
      });
    }

    // Marked Customers
    return (activeMarkingCustomers || []).filter((c: any) => {
      if (!q) return true;
      const name = (c.name || "").toLowerCase();
      const phone = (c.phone || "").toLowerCase();
      const marks = normalizeMarkings(c).map((m: string) => m.toLowerCase());
      return name.includes(q) || phone.includes(q) || marks.some((m: string) => m.includes(q));
    });
  }, [awardType, recipientSearchText, workers, deliveryPartners, activeMarkingCustomers]);

  // Selected recipient entity
  const selectedRecipientEntity = useMemo(() => {
    if (!awardRecipientId) return null;
    if (awardType === "worker") {
      return (workers || []).find((w: any) => w.id === awardRecipientId);
    }
    if (awardType === "delivery") {
      return (deliveryPartners || []).find((p: any) => p.id === awardRecipientId);
    }
    return (customers || []).find((c: any) => c.id === awardRecipientId);
  }, [awardRecipientId, awardType, workers, deliveryPartners, customers]);

  // Date period filtering helper
  const isDateInFilter = useCallback(
    (date: Date) => {
      if (!date || isNaN(date.getTime())) return false;
      const now = new Date();

      switch (selectedPeriod) {
        case "today": {
          const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
          const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
          return date >= startOfToday && date <= endOfToday;
        }
        case "week": {
          const startOfWeek = new Date(now);
          startOfWeek.setDate(now.getDate() - 7);
          startOfWeek.setHours(0, 0, 0, 0);
          return date >= startOfWeek;
        }
        case "month": {
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
          return date >= startOfMonth;
        }
        case "custom": {
          if (startDate && endDate) {
            const s = new Date(startDate);
            s.setHours(0, 0, 0, 0);
            const e = new Date(endDate);
            e.setHours(23, 59, 59, 999);
            return date >= s && date <= e;
          }
          if (startDate) {
            const s = new Date(startDate);
            s.setHours(0, 0, 0, 0);
            return date >= s;
          }
          if (endDate) {
            const e = new Date(endDate);
            e.setHours(23, 59, 59, 999);
            return date <= e;
          }
          return true;
        }
        case "all":
        default:
          return true;
      }
    },
    [selectedPeriod, startDate, endDate]
  );

  // Filtered & Sorted bonuses
  const filteredBonuses = useMemo(
    () =>
      filterAndSortBonuses({
        unifiedBonuses,
        selectedTab,
        searchQuery,
        sortBy,
        isDateInFilter,
      }),
    [unifiedBonuses, selectedTab, isDateInFilter, searchQuery, sortBy]
  );

  // Financial aggregates
  const stats = useMemo(
    () => computeBonusStats(unifiedBonuses, filteredBonuses),
    [unifiedBonuses, filteredBonuses]
  );

  const handleSelectBonus = useCallback((item: BonusItem) => {
    setSelectedBonus(item);
    setIsDetailModalOpen(true);
  }, []);

  const bonusKeyExtractor = useCallback((item: BonusItem) => `${item.type}-${item.id}`, []);

  const renderBonusItem: ListRenderItem<BonusItem> = useCallback(
    ({ item }) => (
      <BonusRow
        item={item}
        isDark={theme.isDark}
        styles={styles}
        colors={colors}
        onSelect={handleSelectBonus}
      />
    ),
    [theme.isDark, styles, colors, handleSelectBonus]
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  // Open Award Modal
  const handleOpenAwardModal = (type?: "worker" | "delivery" | "customer" | "other") => {
    const defaultType =
      type ||
      (selectedTab === "delivery"
        ? "delivery"
        : selectedTab === "customer"
          ? "customer"
          : selectedTab === "other"
            ? "other"
            : "worker");

    setAwardType(defaultType);
    setAwardRecipientId("");
    setRecipientSearchText("");
    setAwardOtherName("");
    setAwardOtherPhone("");
    setAwardOtherRolePreset("police");
    setAwardOtherRoleCustom("");
    setAwardAmount("");
    setAwardReasonPreset(
      defaultType === "worker"
        ? WORKER_REASONS[0]
        : defaultType === "delivery"
          ? DELIVERY_REASONS[0]
          : defaultType === "customer"
            ? CUSTOMER_REASONS[0]
            : OTHER_REASONS[0]
    );
    setAwardReasonCustom("");
    setAwardNotes("");
    setAwardDate(new Date());
    setIsAwardModalOpen(true);
  };

  // Submit Award Bonus
  const handleSaveAward = async () => {
    const amt = roundCurrency(parseFloat(awardAmount));
    if (isNaN(amt) || amt <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid bonus amount greater than zero.");
      return;
    }

    const finalReason =
      awardReasonPreset === "Custom"
        ? awardReasonCustom.trim() || "Incentive / Bonus"
        : awardReasonPreset;

    // Handle "other" recipient category
    if (awardType === "other") {
      const cleanName = awardOtherName.trim();
      if (!cleanName) {
        Alert.alert(
          "Recipient Name Required",
          "Please enter the recipient's name (e.g. Lineman Selvam, Officer Kumar, Municipal Supervisor)."
        );
        return;
      }

      const roleObj = OTHER_ROLES.find((r) => r.id === awardOtherRolePreset);
      const finalRole =
        awardOtherRolePreset === "custom"
          ? awardOtherRoleCustom.trim() || "Other"
          : roleObj?.label || "Other";

      setIsSavingAward(true);
      try {
        await addDoc(collection(db, "otherBonuses"), {
          recipientName: cleanName,
          recipientRole: finalRole,
          recipientPhone: awardOtherPhone.trim(),
          amount: amt,
          reason: finalReason,
          notes: awardNotes.trim(),
          createdAt: awardDate,
          updatedAt: new Date(),
        });

        setIsAwardModalOpen(false);
        Alert.alert(
          "Bonus Awarded ⭐",
          `Successfully awarded ₹${amt.toLocaleString("en-IN")} to ${cleanName} (${finalRole}).`
        );
      } catch (e: any) {
        console.error("Failed to award other bonus:", e);
        Alert.alert("Error", e?.message || "Failed to award bonus. Please try again.");
      } finally {
        setIsSavingAward(false);
      }
      return;
    }

    if (!awardRecipientId) {
      const typeLabel =
        awardType === "worker"
          ? "worker"
          : awardType === "delivery"
            ? "delivery partner"
            : "active marking customer";
      Alert.alert("Recipient Required", `Please select a ${typeLabel}.`);
      return;
    }

    setIsSavingAward(true);
    try {
      if (awardType === "worker") {
        if (!logBonus) {
          throw new Error("WorkerContext logBonus function is not available.");
        }
        await logBonus(awardRecipientId, {
          amount: amt,
          reason: finalReason,
          notes: awardNotes.trim(),
          createdAt: awardDate,
        });
      } else if (awardType === "delivery") {
        if (!logPartnerBonus) {
          throw new Error("DeliveryPartnerContext logPartnerBonus function is not available.");
        }
        await logPartnerBonus(awardRecipientId, {
          amount: amt,
          reason: finalReason,
          notes: awardNotes.trim(),
          createdAt: awardDate,
        });
      } else {
        // Customer bonus
        const targetCustomer = (customers || []).find((c: any) => c.id === awardRecipientId);
        const marks = targetCustomer ? normalizeMarkings(targetCustomer) : [];
        await addDoc(collection(db, "customerBonuses"), {
          customerId: awardRecipientId,
          customerName: targetCustomer?.name || "Customer",
          customerPhone: targetCustomer?.phone || "",
          markings: marks,
          amount: amt,
          reason: finalReason,
          notes: awardNotes.trim(),
          createdAt: awardDate,
          updatedAt: new Date(),
        });
      }

      setIsAwardModalOpen(false);
      const recipientDisplayName =
        awardType === "worker"
          ? workerMap.get(awardRecipientId)?.name || "Worker"
          : awardType === "delivery"
            ? partnerMap.get(awardRecipientId)?.name || "Delivery Partner"
            : customerMap.get(awardRecipientId)?.name || "Customer";

      Alert.alert(
        "Bonus Awarded ⭐",
        `Successfully awarded ₹${amt.toLocaleString("en-IN")} to ${recipientDisplayName}.`
      );
    } catch (e: any) {
      console.error("Failed to award bonus:", e);
      Alert.alert("Error", e?.message || "Failed to award bonus. Please try again.");
    } finally {
      setIsSavingAward(false);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (bonus: BonusItem) => {
    setSelectedBonus(bonus);
    setEditAmount(String(bonus.amount));
    if (bonus.type === "other") {
      setEditOtherName(bonus.recipientName);
      setEditOtherRole(bonus.recipientRole || "Other");
      setEditOtherPhone(bonus.recipientPhone || "");
    }
    const reasons =
      bonus.type === "worker"
        ? WORKER_REASONS
        : bonus.type === "delivery"
          ? DELIVERY_REASONS
          : bonus.type === "customer"
            ? CUSTOMER_REASONS
            : OTHER_REASONS;

    if (reasons.includes(bonus.reason)) {
      setEditReasonPreset(bonus.reason);
      setEditReasonCustom("");
    } else {
      setEditReasonPreset("Custom");
      setEditReasonCustom(bonus.reason);
    }
    setEditNotes(bonus.notes || "");
    setEditDate(bonus.createdAt);
    setIsDetailModalOpen(false);
    setIsEditModalOpen(true);
  };

  // Submit Edit Bonus
  const handleSaveEdit = async () => {
    if (!selectedBonus) return;
    const amt = roundCurrency(parseFloat(editAmount));
    if (isNaN(amt) || amt <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid bonus amount.");
      return;
    }

    const finalReason =
      editReasonPreset === "Custom"
        ? editReasonCustom.trim() || "Performance Bonus"
        : editReasonPreset;

    setIsSavingEdit(true);
    try {
      const newBonusData = {
        amount: amt,
        reason: finalReason,
        notes: editNotes.trim(),
        createdAt: editDate,
      };

      if (selectedBonus.type === "worker") {
        if (!editWorkerBonus) throw new Error("WorkerContext editWorkerBonus not available.");
        await editWorkerBonus(selectedBonus.id, newBonusData, selectedBonus.rawData);
      } else if (selectedBonus.type === "delivery") {
        if (!updatePartnerBonus) throw new Error("DeliveryPartnerContext updatePartnerBonus not available.");
        await updatePartnerBonus(
          selectedBonus.id,
          selectedBonus.recipientId,
          newBonusData,
          selectedBonus.rawData
        );
      } else if (selectedBonus.type === "customer") {
        // Customer bonus edit
        await updateDoc(doc(db, "customerBonuses", selectedBonus.id), {
          amount: amt,
          reason: finalReason,
          notes: editNotes.trim(),
          createdAt: editDate,
          updatedAt: new Date(),
        });
      } else {
        // Other bonus edit
        await updateDoc(doc(db, "otherBonuses", selectedBonus.id), {
          recipientName: editOtherName.trim() || selectedBonus.recipientName,
          recipientRole: editOtherRole.trim() || selectedBonus.recipientRole || "Other",
          recipientPhone: editOtherPhone.trim(),
          amount: amt,
          reason: finalReason,
          notes: editNotes.trim(),
          createdAt: editDate,
          updatedAt: new Date(),
        });
      }

      setIsEditModalOpen(false);
      setSelectedBonus(null);
      Alert.alert("Success", "Bonus record updated successfully.");
    } catch (e: any) {
      console.error("Failed to update bonus:", e);
      Alert.alert("Error", e?.message || "Failed to update bonus.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Delete Bonus
  const handleDeleteBonus = (bonus: BonusItem) => {
    Alert.alert(
      "Confirm Deletion",
      `Are you sure you want to delete the bonus of ₹${bonus.amount.toLocaleString(
        "en-IN"
      )} for ${bonus.recipientName}? This will automatically adjust any ledger balances.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Record",
          style: "destructive",
          onPress: async () => {
            setIsDeleting(true);
            try {
              if (bonus.type === "worker") {
                if (!deleteWorkerBonus) throw new Error("WorkerContext deleteWorkerBonus not available.");
                await deleteWorkerBonus(bonus.id, bonus.rawData);
              } else if (bonus.type === "delivery") {
                if (!deletePartnerBonus)
                  throw new Error("DeliveryPartnerContext deletePartnerBonus not available.");
                await deletePartnerBonus(bonus.id, bonus.recipientId, bonus.rawData);
              } else if (bonus.type === "customer") {
                // Delete from customerBonuses
                await deleteDoc(doc(db, "customerBonuses", bonus.id));
              } else {
                // Delete from otherBonuses
                await deleteDoc(doc(db, "otherBonuses", bonus.id));
              }
              setIsDetailModalOpen(false);
              setIsEditModalOpen(false);
              setSelectedBonus(null);
              Alert.alert("Deleted", "Bonus record was successfully removed.");
            } catch (e: any) {
              console.error("Failed to delete bonus:", e);
              Alert.alert("Error", e?.message || "Failed to delete bonus.");
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  // Share Bonus Receipt
  const handleShareReceipt = async (bonus: BonusItem) => {
    try {
      const bizName = userProfile?.businessName || "Our Business";
      const roleStr =
        bonus.type === "worker"
          ? "Worker"
          : bonus.type === "delivery"
            ? "Delivery Partner"
            : bonus.type === "customer"
              ? `Marked Customer (${(bonus.markings || []).join(", ") || "Special"})`
              : `${bonus.recipientRole || "Goodwill"} Recipient`;

      const message = [
        `⭐ *BONUS REWARD RECEIPT* ⭐`,
        `🏢 *${bizName}*`,
        `━━━━━━━━━━━━━━━━━━`,
        `👤 *Recipient:* ${bonus.recipientName} (${roleStr})`,
        `💰 *Amount Awarded:* ₹${bonus.amount.toLocaleString("en-IN")}`,
        `🎯 *Reason / Purpose:* ${bonus.reason}`,
        `📅 *Date:* ${bonus.createdAt.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })}`,
        bonus.notes ? `📝 *Notes:* ${bonus.notes}` : "",
        `━━━━━━━━━━━━━━━━━━`,
        `Thank you for your valuable collaboration! 🌟`,
      ]
        .filter(Boolean)
        .join("\n");

      await Share.share({ message });
    } catch (e) {
      console.log("Error sharing receipt:", e);
    }
  };

  const isLoading = loadingWorkerBonuses || loadingDeliveryBonuses || loadingCustomerBonuses || loadingOtherBonuses;

  const bonusListHeader = (
    <>
      {/* KPI Summary Cards */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsScroll}>
        <View style={[styles.statCard, { borderLeftColor: "#F59E0B", borderLeftWidth: 4 }]}>
          <View style={styles.statTopRow}>
            <Text style={styles.statLabel}>Total Bonuses</Text>
            <MaterialIcons name="stars" size={18} color="#F59E0B" />
          </View>
          <Text style={styles.statValue} {...currencyKpiTextProps}>₹{stats.totalAll.toLocaleString("en-IN")}</Text>
          <Text style={styles.statMeta}>{stats.totalCount} total rewards</Text>
        </View>

        <View style={[styles.statCard, { borderLeftColor: colors.accent.primary, borderLeftWidth: 4 }]}>
          <View style={styles.statTopRow}>
            <Text style={styles.statLabel}>Workers</Text>
            <MaterialIcons name="engineering" size={18} color={colors.accent.primary} />
          </View>
          <Text style={styles.statValue} {...currencyKpiTextProps}>₹{stats.totalWorker.toLocaleString("en-IN")}</Text>
          <Text style={styles.statMeta}>{stats.countWorker} rewards</Text>
        </View>

        <View style={[styles.statCard, { borderLeftColor: "#8B5CF6", borderLeftWidth: 4 }]}>
          <View style={styles.statTopRow}>
            <Text style={styles.statLabel}>Delivery</Text>
            <MaterialIcons name="local-shipping" size={18} color="#8B5CF6" />
          </View>
          <Text style={styles.statValue} {...currencyKpiTextProps}>₹{stats.totalDelivery.toLocaleString("en-IN")}</Text>
          <Text style={styles.statMeta}>{stats.countDelivery} rewards</Text>
        </View>

        <View style={[styles.statCard, { borderLeftColor: "#10B981", borderLeftWidth: 4 }]}>
          <View style={styles.statTopRow}>
            <Text style={styles.statLabel}>Marked Cust.</Text>
            <MaterialIcons name="loyalty" size={18} color="#10B981" />
          </View>
          <Text style={styles.statValue} {...currencyKpiTextProps}>₹{stats.totalCustomer.toLocaleString("en-IN")}</Text>
          <Text style={styles.statMeta}>{stats.countCustomer} rewards</Text>
        </View>

        <View style={[styles.statCard, { borderLeftColor: "#9333EA", borderLeftWidth: 4 }]}>
          <View style={styles.statTopRow}>
            <Text style={styles.statLabel}>Others</Text>
            <MaterialIcons name="groups" size={18} color="#9333EA" />
          </View>
          <Text style={styles.statValue} {...currencyKpiTextProps}>₹{stats.totalOther.toLocaleString("en-IN")}</Text>
          <Text style={styles.statMeta}>{stats.countOther} rewards</Text>
        </View>
      </ScrollView>

      {/* Tab Switcher */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScrollWrap}>
        <Pressable
          style={[styles.tabButton, selectedTab === "all" && styles.tabButtonActive]}
          onPress={() => setSelectedTab("all")}
        >
          <Text style={[styles.tabText, selectedTab === "all" && styles.tabTextActive]}>
            All ({unifiedBonuses.length})
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tabButton, selectedTab === "worker" && styles.tabButtonActive]}
          onPress={() => setSelectedTab("worker")}
        >
          <Text style={[styles.tabText, selectedTab === "worker" && styles.tabTextActive]}>
            👷 Workers ({workerBonusesRaw.length})
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tabButton, selectedTab === "delivery" && styles.tabButtonActive]}
          onPress={() => setSelectedTab("delivery")}
        >
          <Text style={[styles.tabText, selectedTab === "delivery" && styles.tabTextActive]}>
            🚚 Delivery ({deliveryBonusesRaw.length})
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tabButton, selectedTab === "customer" && styles.tabButtonActive]}
          onPress={() => setSelectedTab("customer")}
        >
          <Text style={[styles.tabText, selectedTab === "customer" && styles.tabTextActive]}>
            🏷️ Marked Cust. ({customerBonusesRaw.length})
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tabButton, selectedTab === "other" && styles.tabButtonActive]}
          onPress={() => setSelectedTab("other")}
        >
          <Text style={[styles.tabText, selectedTab === "other" && styles.tabTextActive]}>
            🤝 Others ({otherBonusesRaw.length})
          </Text>
        </Pressable>
      </ScrollView>

      {/* Search & Period Controls */}
      <View style={styles.filterCard}>
        <View style={styles.searchBar}>
          <MaterialIcons name="search" size={20} color={colors.text.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search recipient, marking, reason, or notes..."
            placeholderTextColor={colors.text.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
              <MaterialIcons name="close" size={18} color={colors.text.muted} />
            </Pressable>
          )}
        </View>

        {/* Period Filter Chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periodRow}>
          {(["all", "today", "week", "month", "custom"] as const).map((period) => {
            const active = selectedPeriod === period;
            const labels: Record<string, string> = {
              all: "All Time",
              today: "Today",
              week: "7 Days",
              month: "This Month",
              custom: "Custom Range",
            };
            return (
              <Pressable
                key={period}
                style={[styles.periodChip, active && styles.periodChipActive]}
                onPress={() => setSelectedPeriod(period)}
              >
                <Text style={[styles.periodChipText, active && styles.periodChipTextActive]}>
                  {labels[period]}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Custom Date Range Display */}
        {selectedPeriod === "custom" && (
          <View style={styles.customDateRow}>
            <Pressable
              style={styles.customDateBtn}
              onPress={() => setCalendarTarget("start")}
            >
              <MaterialIcons name="date-range" size={16} color={colors.accent.primary} />
              <Text style={styles.customDateText}>
                {startDate ? startDate.toLocaleDateString("en-IN") : "Start Date"}
              </Text>
            </Pressable>
            <Text style={styles.customDateSep}>to</Text>
            <Pressable
              style={styles.customDateBtn}
              onPress={() => setCalendarTarget("end")}
            >
              <MaterialIcons name="date-range" size={16} color={colors.accent.primary} />
              <Text style={styles.customDateText}>
                {endDate ? endDate.toLocaleDateString("en-IN") : "End Date"}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Sort Selector */}
        <View style={styles.sortRow}>
          <Text style={styles.sortLabel}>Showing {filteredBonuses.length} records</Text>
          <View style={styles.sortChips}>
            <Pressable
              style={[styles.sortChip, sortBy === "newest" && styles.sortChipActive]}
              onPress={() => setSortBy("newest")}
            >
              <Text style={[styles.sortChipText, sortBy === "newest" && styles.sortChipTextActive]}>
                Newest
              </Text>
            </Pressable>
            <Pressable
              style={[styles.sortChip, sortBy === "amount_desc" && styles.sortChipActive]}
              onPress={() => setSortBy("amount_desc")}
            >
              <Text style={[styles.sortChipText, sortBy === "amount_desc" && styles.sortChipTextActive]}>
                Highest ₹
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </>
  );

  const bonusListData = isLoading && unifiedBonuses.length === 0 ? [] : filteredBonuses;

  const bonusListEmpty =
    isLoading && unifiedBonuses.length === 0 ? (
      <View style={styles.loadingBox}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
        <Text style={styles.loadingText}>Loading bonus records...</Text>
      </View>
    ) : (
      <View style={styles.emptyCard}>
        <View style={styles.emptyIconCircle}>
          <MaterialIcons name="stars" size={36} color="#F59E0B" />
        </View>
        <Text style={styles.emptyTitle}>No Bonus Records Found</Text>
        <Text style={styles.emptyDesc}>
          {searchQuery || selectedPeriod !== "all"
            ? "No bonuses match your active filters. Try adjusting your search or date period."
            : "Acknowledge and reward your workforce and marked contractors/clients with festival gifts and performance perks."}
        </Text>
        <Pressable
          style={styles.emptyActionBtn}
          onPress={() => handleOpenAwardModal()}
        >
          <MaterialIcons name="add" size={18} color="#ffffff" />
          <Text style={styles.emptyActionBtnText}>Award First Bonus</Text>
        </Pressable>
      </View>
    );

  return (
    <View style={styles.screenWrapper}>
      {/* Top Header */}
      <View style={[styles.topHeader, { paddingTop: Math.max(insets.top + 8, spacing.md) }]}>
        <BackButton label="Settings" />
        <View style={styles.headerTitleGroup}>
          <View style={styles.headerIconWrap}>
            <MaterialIcons name="stars" size={20} color="#F59E0B" />
          </View>
          <View>
            <Text style={styles.headerTitle}>Bonus Management</Text>
            <Text style={styles.headerSubtitle}>Staff, drivers & marked customer perks</Text>
          </View>
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.headerAwardBtn,
            pressed && styles.headerAwardBtnPressed,
          ]}
          onPress={() => handleOpenAwardModal()}
        >
          <MaterialIcons name="add" size={18} color="#ffffff" />
          <Text style={styles.headerAwardBtnText}>Award</Text>
        </Pressable>
      </View>

      <FlatList
        ref={scrollViewRef}
        contentContainerStyle={[styles.container, { paddingBottom: scrollBottomPadding + 68 }]}
        data={bonusListData}
        keyExtractor={bonusKeyExtractor}
        renderItem={renderBonusItem}
        ListHeaderComponent={bonusListHeader}
        ListEmptyComponent={bonusListEmpty}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={32}
        onScroll={handleScroll}
        onContentSizeChange={handleContentSizeChange}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={true}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.accent.primary]} />
        }
      />

      {/* Floating Action Button */}
      <Pressable
        style={({ pressed }) => [
          styles.fab,
          { bottom: bottomFabOffset },
          pressed && styles.fabPressed,
        ]}
        onPress={() => handleOpenAwardModal()}
      >
        <MaterialIcons name="add" size={24} color="#ffffff" />
        <Text style={styles.fabText}>Award Bonus</Text>
      </Pressable>

      {/* Detail / Action Modal */}
      <Modal
        visible={isDetailModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsDetailModalOpen(false)}
      >
        <KeyboardAvoidingView behavior={kavBehavior} style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {selectedBonus && (
                <>
                  <View style={styles.modalReceiptHeader}>
                    <View style={styles.modalReceiptIconWrap}>
                      <MaterialIcons name="stars" size={32} color="#F59E0B" />
                    </View>
                    <Text style={styles.modalReceiptTitle}>Bonus Receipt</Text>
                    <Text style={styles.modalReceiptAmount}>
                      ₹{selectedBonus.amount.toLocaleString("en-IN")}
                    </Text>
                    <Text style={styles.modalReceiptRole}>
                      {selectedBonus.type === "worker"
                        ? "👷 Factory Worker"
                        : selectedBonus.type === "delivery"
                          ? "🚚 Delivery Driver"
                          : selectedBonus.type === "customer"
                            ? `🏷️ Marked Customer (${(selectedBonus.markings || []).join(", ") || "Client"})`
                            : `🤝 Other: ${selectedBonus.recipientRole || "Goodwill Recipient"}`}
                    </Text>
                  </View>

                  <View style={styles.modalReceiptDetails}>
                    <View style={styles.receiptRow}>
                      <Text style={styles.receiptLabel}>Recipient</Text>
                      <Text style={styles.receiptValue}>{selectedBonus.recipientName}</Text>
                    </View>
                    {selectedBonus.type === "other" && selectedBonus.recipientRole ? (
                      <View style={styles.receiptRow}>
                        <Text style={styles.receiptLabel}>Category / Role</Text>
                        <Text style={[styles.receiptValue, { color: colors.accent.primary, fontWeight: "700" }]}>
                          {selectedBonus.recipientRole}
                        </Text>
                      </View>
                    ) : null}
                    {selectedBonus.recipientPhone ? (
                      <View style={styles.receiptRow}>
                        <Text style={styles.receiptLabel}>Phone</Text>
                        <Text style={styles.receiptValue}>{selectedBonus.recipientPhone}</Text>
                      </View>
                    ) : null}
                    {selectedBonus.markings && selectedBonus.markings.length > 0 ? (
                      <View style={[styles.receiptRow, { alignItems: "center" }]}>
                        <Text style={styles.receiptLabel}>Markings</Text>
                        <View style={{ flexDirection: "row", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          {selectedBonus.markings.map((tag) => (
                            <View key={tag} style={styles.receiptMarkingTag}>
                              <Text style={styles.receiptMarkingTagText}>{tag}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    ) : null}
                    <View style={styles.receiptRow}>
                      <Text style={styles.receiptLabel}>Reason / Incentive</Text>
                      <Text style={[styles.receiptValue, { color: "#D97706", fontWeight: "700" }]}>
                        {selectedBonus.reason}
                      </Text>
                    </View>
                    <View style={styles.receiptRow}>
                      <Text style={styles.receiptLabel}>Date Awarded</Text>
                      <Text style={styles.receiptValue}>
                        {selectedBonus.createdAt.toLocaleDateString("en-IN", {
                          weekday: "short",
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                        })}
                      </Text>
                    </View>
                    {selectedBonus.notes ? (
                      <View style={[styles.receiptRow, { alignItems: "flex-start" }]}>
                        <Text style={styles.receiptLabel}>Notes</Text>
                        <Text style={[styles.receiptValue, { flex: 1, textAlign: "right" }]}>
                          {selectedBonus.notes}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Modal Action Buttons */}
                  <View style={styles.modalActionRow}>
                    <Pressable
                      style={styles.modalShareBtn}
                      onPress={() => handleShareReceipt(selectedBonus)}
                    >
                      <MaterialIcons name="share" size={18} color={colors.accent.primary} />
                      <Text style={styles.modalShareBtnText}>Share</Text>
                    </Pressable>

                    <Pressable
                      style={styles.modalEditBtn}
                      onPress={() => handleOpenEdit(selectedBonus)}
                    >
                      <MaterialIcons name="edit" size={18} color="#ffffff" />
                      <Text style={styles.modalEditBtnText}>Edit</Text>
                    </Pressable>

                    <Pressable
                      style={styles.modalDeleteBtn}
                      onPress={() => handleDeleteBonus(selectedBonus)}
                    >
                      <MaterialIcons name="delete-outline" size={18} color={colors.accent.danger} />
                    </Pressable>
                  </View>

                  <Pressable
                    style={styles.modalCloseBtn}
                    onPress={() => setIsDetailModalOpen(false)}
                  >
                    <Text style={styles.modalCloseBtnText}>Close</Text>
                  </Pressable>
                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Award Bonus Modal */}
      <Modal
        visible={isAwardModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!isSavingAward) setIsAwardModalOpen(false);
        }}
      >
        <KeyboardAvoidingView behavior={kavBehavior} style={styles.modalBackdrop}>
          <View style={[styles.formModalCard, { paddingBottom: Math.max(insets.bottom + 8, spacing.lg) }]}>
            <View style={styles.formHeader}>
              <View style={styles.formTitleRow}>
                <MaterialIcons name="stars" size={22} color="#F59E0B" />
                <Text style={styles.formTitle}>Award New Bonus</Text>
              </View>
              <Pressable
                onPress={() => {
                  if (!isSavingAward) setIsAwardModalOpen(false);
                }}
                hitSlop={8}
                disabled={isSavingAward}
              >
                <MaterialIcons name="close" size={22} color={colors.text.muted} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.formScroll}>
              {/* Recipient Type Toggle */}
              <Text style={styles.inputLabel}>Recipient Category *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeToggleRow}>
                <Pressable
                  style={[
                    styles.typeToggleBtn,
                    awardType === "worker" && styles.typeToggleBtnActive,
                  ]}
                  onPress={() => {
                    setAwardType("worker");
                    setAwardRecipientId("");
                    setRecipientSearchText("");
                    setAwardReasonPreset(WORKER_REASONS[0]);
                  }}
                  disabled={isSavingAward}
                >
                  <MaterialIcons
                    name="engineering"
                    size={16}
                    color={awardType === "worker" ? "#ffffff" : colors.text.secondary}
                  />
                  <Text
                    style={[
                      styles.typeToggleText,
                      awardType === "worker" && styles.typeToggleTextActive,
                    ]}
                  >
                    Worker ({workers.length})
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.typeToggleBtn,
                    awardType === "delivery" && styles.typeToggleBtnActive,
                  ]}
                  onPress={() => {
                    setAwardType("delivery");
                    setAwardRecipientId("");
                    setRecipientSearchText("");
                    setAwardReasonPreset(DELIVERY_REASONS[0]);
                  }}
                  disabled={isSavingAward}
                >
                  <MaterialIcons
                    name="local-shipping"
                    size={16}
                    color={awardType === "delivery" ? "#ffffff" : colors.text.secondary}
                  />
                  <Text
                    style={[
                      styles.typeToggleText,
                      awardType === "delivery" && styles.typeToggleTextActive,
                    ]}
                  >
                    Delivery ({deliveryPartners.length})
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.typeToggleBtn,
                    awardType === "customer" && styles.typeToggleBtnActive,
                  ]}
                  onPress={() => {
                    setAwardType("customer");
                    setAwardRecipientId("");
                    setRecipientSearchText("");
                    setAwardReasonPreset(CUSTOMER_REASONS[0]);
                  }}
                  disabled={isSavingAward}
                >
                  <MaterialIcons
                    name="loyalty"
                    size={16}
                    color={awardType === "customer" ? "#ffffff" : colors.text.secondary}
                  />
                  <Text
                    style={[
                      styles.typeToggleText,
                      awardType === "customer" && styles.typeToggleTextActive,
                    ]}
                  >
                    Marked Cust. ({activeMarkingCustomers.length})
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.typeToggleBtn,
                    awardType === "other" && styles.typeToggleBtnActive,
                  ]}
                  onPress={() => {
                    setAwardType("other");
                    setAwardRecipientId("");
                    setRecipientSearchText("");
                    setAwardReasonPreset(OTHER_REASONS[0]);
                  }}
                  disabled={isSavingAward}
                >
                  <MaterialIcons
                    name="groups"
                    size={16}
                    color={awardType === "other" ? "#ffffff" : colors.text.secondary}
                  />
                  <Text
                    style={[
                      styles.typeToggleText,
                      awardType === "other" && styles.typeToggleTextActive,
                    ]}
                  >
                    Others ({otherBonusesRaw.length})
                  </Text>
                </Pressable>
              </ScrollView>

              {awardType === "other" ? (
                <View style={styles.otherRecipientBox}>
                  {/* Category / Role Quick Chips */}
                  <Text style={styles.inputLabel}>Recipient Category / Role *</Text>
                  <View style={styles.otherRoleWrap}>
                    {OTHER_ROLES.map((r) => {
                      const isSel = awardOtherRolePreset === r.id;
                      return (
                        <Pressable
                          key={r.id}
                          style={[
                            styles.otherRoleChip,
                            isSel && styles.otherRoleChipActive,
                          ]}
                          onPress={() => setAwardOtherRolePreset(r.id)}
                          disabled={isSavingAward}
                        >
                          <MaterialIcons
                            name={r.icon as any}
                            size={16}
                            color={isSel ? "#ffffff" : colors.accent.primary}
                          />
                          <Text
                            style={[
                              styles.otherRoleChipText,
                              isSel && styles.otherRoleChipTextActive,
                            ]}
                          >
                            {r.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {awardOtherRolePreset === "custom" && (
                    <View style={{ marginTop: 6, marginBottom: 4 }}>
                      <Text style={styles.inputLabel}>Custom Designation / Role *</Text>
                      <TextInput
                        style={styles.textInput}
                        placeholder="e.g. Fire Service, Panchayat Staff, Sub-station Guard..."
                        placeholderTextColor={colors.text.muted}
                        value={awardOtherRoleCustom}
                        onChangeText={setAwardOtherRoleCustom}
                        editable={!isSavingAward}
                      />
                    </View>
                  )}

                  {/* Recipient Name Input */}
                  <Text style={styles.inputLabel}>Recipient Name *</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Lineman Murugan, SI Ramesh, Watchman Raju..."
                    placeholderTextColor={colors.text.muted}
                    value={awardOtherName}
                    onChangeText={setAwardOtherName}
                    editable={!isSavingAward}
                  />

                  {/* Suggestions from Previous Other Contacts */}
                  {pastOtherRecipients.length > 0 && !awardOtherName && (
                    <View style={styles.suggestionsContainer}>
                      <Text style={styles.suggestionsTitle}>Recent / Past Recipients:</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestionsRow}>
                        {pastOtherRecipients.slice(0, 10).map((p) => (
                          <Pressable
                            key={p.name}
                            style={styles.suggestionChip}
                            onPress={() => {
                              setAwardOtherName(p.name);
                              if (p.phone) setAwardOtherPhone(p.phone);
                              if (p.role) {
                                const matched = OTHER_ROLES.find(
                                  (r) => r.label.toLowerCase() === p.role?.toLowerCase()
                                );
                                if (matched) {
                                  setAwardOtherRolePreset(matched.id);
                                } else {
                                  setAwardOtherRolePreset("custom");
                                  setAwardOtherRoleCustom(p.role);
                                }
                              }
                            }}
                            disabled={isSavingAward}
                          >
                            <Text style={styles.suggestionChipName}>{p.name}</Text>
                            {p.role ? <Text style={styles.suggestionChipRole}>({p.role})</Text> : null}
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  )}

                  {/* Phone Number Input (Optional) */}
                  <Text style={styles.inputLabel}>Phone Number (Optional)</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. 9876543210"
                    placeholderTextColor={colors.text.muted}
                    keyboardType="phone-pad"
                    value={awardOtherPhone}
                    onChangeText={setAwardOtherPhone}
                    editable={!isSavingAward}
                  />
                </View>
              ) : (
                <>
                  {/* Recipient Selection Header */}
                  <Text style={styles.inputLabel}>
                    Select {awardType === "worker" ? "Worker" : awardType === "delivery" ? "Delivery Partner" : "Marked Customer"} *
                  </Text>

                  {/* Selected Recipient Banner (if chosen) */}
                  {selectedRecipientEntity && (
                    <View style={styles.selectedRecipientBanner}>
                      <View style={styles.selectedRecipientLeft}>
                        <View style={styles.selectedCheckCircle}>
                          <MaterialIcons name="check" size={16} color="#ffffff" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.selectedRecipientName} numberOfLines={1}>
                            {(selectedRecipientEntity as any).name ||
                              (selectedRecipientEntity as any).fullName ||
                              (selectedRecipientEntity as any).partnerName ||
                              "Selected"}
                          </Text>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                            {((selectedRecipientEntity as any).phone || (selectedRecipientEntity as any).mobile) ? (
                              <Text style={styles.selectedRecipientPhone}>
                                {(selectedRecipientEntity as any).phone || (selectedRecipientEntity as any).mobile}
                              </Text>
                            ) : null}
                            {awardType === "customer" && (
                              <Text style={styles.selectedRecipientMarkings}>
                                • {normalizeMarkings(selectedRecipientEntity).join(", ") || "Marked"}
                              </Text>
                            )}
                          </View>
                        </View>
                      </View>
                      <Pressable
                        style={styles.changeRecipientBtn}
                        onPress={() => setAwardRecipientId("")}
                        hitSlop={6}
                      >
                        <Text style={styles.changeRecipientText}>Change</Text>
                      </Pressable>
                    </View>
                  )}

                  {/* Recipient Search & Selector Box */}
                  <View style={styles.recipientSelectContainer}>
                    {/* Search Bar */}
                    <View style={styles.recipientSearchBar}>
                      <MaterialIcons name="search" size={18} color={colors.text.muted} />
                      <TextInput
                        style={styles.recipientSearchInput}
                        placeholder={
                          awardType === "worker"
                            ? "Search worker by name or phone..."
                            : awardType === "delivery"
                              ? "Search driver by name or phone..."
                              : "Search by name, phone, or marking tag..."
                        }
                        placeholderTextColor={colors.text.muted}
                        value={recipientSearchText}
                        onChangeText={setRecipientSearchText}
                        editable={!isSavingAward}
                      />
                      {recipientSearchText.length > 0 && (
                        <Pressable onPress={() => setRecipientSearchText("")} hitSlop={6}>
                          <MaterialIcons name="close" size={16} color={colors.text.muted} />
                        </Pressable>
                      )}
                    </View>

                    {/* Recipient Scrollable List */}
                    <ScrollView
                      style={styles.recipientResultsScroll}
                      nestedScrollEnabled={true}
                      showsVerticalScrollIndicator={true}
                      contentContainerStyle={styles.recipientResultsContent}
                    >
                      {filteredAwardRecipients.length === 0 ? (
                        <View style={styles.noResultsBox}>
                          <MaterialIcons name="search-off" size={24} color={colors.text.muted} />
                          <Text style={styles.noResultsText}>
                            {recipientSearchText
                              ? `No ${awardType === "worker" ? "workers" : awardType === "delivery" ? "drivers" : "marked customers"} found for "${recipientSearchText}".`
                              : `No ${awardType === "worker" ? "workers" : awardType === "delivery" ? "delivery partners" : "marked customers"} available.`}
                          </Text>
                        </View>
                      ) : (
                        filteredAwardRecipients.map((item: any) => {
                          const isSelected = awardRecipientId === item.id;
                          const displayName = item.name || item.fullName || item.partnerName || "Unnamed";
                          const phoneNum = item.phone || item.mobile || "";
                          const marks = awardType === "customer" ? normalizeMarkings(item) : [];

                          return (
                            <Pressable
                              key={item.id}
                              style={[
                                styles.recipientResultItem,
                                isSelected && styles.recipientResultItemSelected,
                              ]}
                              onPress={() => setAwardRecipientId(item.id)}
                              disabled={isSavingAward}
                            >
                              <View style={styles.resultItemLeft}>
                                <MaterialIcons
                                  name={
                                    isSelected
                                      ? "check-circle"
                                      : awardType === "worker"
                                        ? "engineering"
                                        : awardType === "delivery"
                                          ? "local-shipping"
                                          : "loyalty"
                                  }
                                  size={18}
                                  color={
                                    isSelected
                                      ? colors.accent.primary
                                      : awardType === "customer"
                                        ? "#10B981"
                                        : colors.text.secondary
                                  }
                                />
                                <View style={{ flex: 1 }}>
                                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                    <Text
                                      style={[
                                        styles.resultItemName,
                                        isSelected && styles.resultItemNameSelected,
                                      ]}
                                      numberOfLines={1}
                                    >
                                      {displayName}
                                    </Text>
                                    {marks.length > 0 && (
                                      <View style={styles.resultMarkingTag}>
                                        <Text style={styles.resultMarkingTagText} numberOfLines={1}>
                                          {marks[0]}
                                        </Text>
                                      </View>
                                    )}
                                  </View>
                                  {phoneNum ? (
                                    <Text style={styles.resultItemPhone}>{phoneNum}</Text>
                                  ) : null}
                                </View>
                              </View>
                              {isSelected && (
                                <MaterialIcons name="done" size={18} color={colors.accent.primary} />
                              )}
                            </Pressable>
                          );
                        })
                      )}
                    </ScrollView>
                  </View>
                </>
              )}

              {/* Amount Input */}
              <Text style={styles.inputLabel}>Bonus Amount (₹) *</Text>
              <View style={styles.amountInputRow}>
                <Text style={styles.currencyPrefix}>₹</Text>
                <TextInput
                  style={styles.amountInput}
                  keyboardType="numeric"
                  placeholder="0.00"
                  placeholderTextColor={colors.text.muted}
                  value={awardAmount}
                  onChangeText={setAwardAmount}
                  editable={!isSavingAward}
                />
              </View>

              {/* Quick Amount Chips */}
              <View style={styles.quickAmountRow}>
                {QUICK_AMOUNTS.map((amt) => (
                  <Pressable
                    key={amt}
                    style={styles.quickAmountChip}
                    onPress={() => setAwardAmount(String(amt))}
                    disabled={isSavingAward}
                  >
                    <Text style={styles.quickAmountText}>+₹{amt}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Reason Selector */}
              <Text style={styles.inputLabel}>Bonus Reason / Purpose *</Text>
              <View style={styles.reasonWrap}>
                {(awardType === "worker"
                  ? WORKER_REASONS
                  : awardType === "delivery"
                    ? DELIVERY_REASONS
                    : awardType === "customer"
                      ? CUSTOMER_REASONS
                      : OTHER_REASONS
                ).map((reason) => {
                  const selected = awardReasonPreset === reason;
                  return (
                    <Pressable
                      key={reason}
                      style={[styles.formReasonChip, selected && styles.formReasonChipActive]}
                      onPress={() => setAwardReasonPreset(reason)}
                      disabled={isSavingAward}
                    >
                      <Text
                        style={[
                          styles.formReasonChipText,
                          selected && styles.formReasonChipTextActive,
                        ]}
                      >
                        {reason}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {awardReasonPreset === "Custom" && (
                <View style={{ marginTop: 8 }}>
                  <Text style={styles.inputLabel}>Custom Reason Description *</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g., Contractor Special Project Bonus"
                    placeholderTextColor={colors.text.muted}
                    value={awardReasonCustom}
                    onChangeText={setAwardReasonCustom}
                    editable={!isSavingAward}
                  />
                </View>
              )}

              {/* Date Selector */}
              <Text style={styles.inputLabel}>Award Date *</Text>
              <Pressable
                style={styles.datePickerBtn}
                onPress={() => setCalendarTarget("award")}
                disabled={isSavingAward}
              >
                <MaterialIcons name="event" size={18} color={colors.accent.primary} />
                <Text style={styles.datePickerBtnText}>
                  {awardDate.toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </Text>
              </Pressable>

              {/* Notes Input */}
              <Text style={styles.inputLabel}>Notes / Remarks (Optional)</Text>
              <TextInput
                style={[styles.textInput, { height: 70, textAlignVertical: "top" }]}
                placeholder="Add any specific context or remarks..."
                placeholderTextColor={colors.text.muted}
                value={awardNotes}
                onChangeText={setAwardNotes}
                multiline
                numberOfLines={3}
                editable={!isSavingAward}
              />
            </ScrollView>

            <View style={styles.formFooter}>
              <Pressable
                style={styles.formCancelBtn}
                onPress={() => setIsAwardModalOpen(false)}
                disabled={isSavingAward}
              >
                <Text style={styles.formCancelText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[styles.formSubmitBtn, isSavingAward && { opacity: 0.7 }]}
                onPress={handleSaveAward}
                disabled={isSavingAward}
              >
                {isSavingAward ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <MaterialIcons name="stars" size={18} color="#ffffff" />
                    <Text style={styles.formSubmitText}>Confirm & Award</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Bonus Modal */}
      <Modal
        visible={isEditModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!isSavingEdit) setIsEditModalOpen(false);
        }}
      >
        <KeyboardAvoidingView behavior={kavBehavior} style={styles.modalBackdrop}>
          <View style={[styles.formModalCard, { paddingBottom: Math.max(insets.bottom + 8, spacing.lg) }]}>
            <View style={styles.formHeader}>
              <View style={styles.formTitleRow}>
                <MaterialIcons name="edit" size={20} color={colors.accent.primary} />
                <Text style={styles.formTitle}>Edit Bonus Record</Text>
              </View>
              <Pressable
                onPress={() => {
                  if (!isSavingEdit) setIsEditModalOpen(false);
                }}
                hitSlop={8}
                disabled={isSavingEdit}
              >
                <MaterialIcons name="close" size={22} color={colors.text.muted} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.formScroll}>
              {selectedBonus?.type === "other" && (
                <>
                  <Text style={styles.inputLabel}>Recipient Name *</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Recipient Name"
                    placeholderTextColor={colors.text.muted}
                    value={editOtherName}
                    onChangeText={setEditOtherName}
                    editable={!isSavingEdit}
                  />

                  <Text style={styles.inputLabel}>Category / Designation *</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Police, Lineman, Municipal, Security..."
                    placeholderTextColor={colors.text.muted}
                    value={editOtherRole}
                    onChangeText={setEditOtherRole}
                    editable={!isSavingEdit}
                  />

                  <Text style={styles.inputLabel}>Phone Number (Optional)</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Phone"
                    placeholderTextColor={colors.text.muted}
                    keyboardType="phone-pad"
                    value={editOtherPhone}
                    onChangeText={setEditOtherPhone}
                    editable={!isSavingEdit}
                  />
                </>
              )}

              <Text style={styles.inputLabel}>Bonus Amount (₹) *</Text>
              <View style={styles.amountInputRow}>
                <Text style={styles.currencyPrefix}>₹</Text>
                <TextInput
                  style={styles.amountInput}
                  keyboardType="numeric"
                  placeholder="0.00"
                  placeholderTextColor={colors.text.muted}
                  value={editAmount}
                  onChangeText={setEditAmount}
                  editable={!isSavingEdit}
                />
              </View>

              <Text style={styles.inputLabel}>Reason / Incentive *</Text>
              <View style={styles.reasonWrap}>
                {(selectedBonus?.type === "worker"
                  ? WORKER_REASONS
                  : selectedBonus?.type === "delivery"
                    ? DELIVERY_REASONS
                    : selectedBonus?.type === "customer"
                      ? CUSTOMER_REASONS
                      : OTHER_REASONS
                ).map((reason) => {
                  const selected = editReasonPreset === reason;
                  return (
                    <Pressable
                      key={reason}
                      style={[styles.formReasonChip, selected && styles.formReasonChipActive]}
                      onPress={() => setEditReasonPreset(reason)}
                      disabled={isSavingEdit}
                    >
                      <Text
                        style={[
                          styles.formReasonChipText,
                          selected && styles.formReasonChipTextActive,
                        ]}
                      >
                        {reason}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {editReasonPreset === "Custom" && (
                <View style={{ marginTop: 8 }}>
                  <Text style={styles.inputLabel}>Custom Reason Description *</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g., Festival Bonus"
                    placeholderTextColor={colors.text.muted}
                    value={editReasonCustom}
                    onChangeText={setEditReasonCustom}
                    editable={!isSavingEdit}
                  />
                </View>
              )}

              <Text style={styles.inputLabel}>Bonus Date *</Text>
              <Pressable
                style={styles.datePickerBtn}
                onPress={() => setCalendarTarget("edit")}
                disabled={isSavingEdit}
              >
                <MaterialIcons name="event" size={18} color={colors.accent.primary} />
                <Text style={styles.datePickerBtnText}>
                  {editDate.toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </Text>
              </Pressable>

              <Text style={styles.inputLabel}>Notes / Remarks (Optional)</Text>
              <TextInput
                style={[styles.textInput, { height: 70, textAlignVertical: "top" }]}
                placeholder="Remarks..."
                placeholderTextColor={colors.text.muted}
                value={editNotes}
                onChangeText={setEditNotes}
                multiline
                numberOfLines={3}
                editable={!isSavingEdit}
              />
            </ScrollView>

            <View style={styles.formFooter}>
              <Pressable
                style={styles.formCancelBtn}
                onPress={() => setIsEditModalOpen(false)}
                disabled={isSavingEdit}
              >
                <Text style={styles.formCancelText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[styles.formSubmitBtn, isSavingEdit && { opacity: 0.7 }]}
                onPress={handleSaveEdit}
                disabled={isSavingEdit}
              >
                {isSavingEdit ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.formSubmitText}>Save Changes</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Date Picker Modal (EasyCalendarModal) */}
      <EasyCalendarModal
        visible={calendarTarget !== null}
        date={
          calendarTarget === "award"
            ? awardDate
            : calendarTarget === "edit"
              ? editDate
              : calendarTarget === "start"
                ? startDate || new Date()
                : endDate || new Date()
        }
        title={
          calendarTarget === "award"
            ? "Select Award Date"
            : calendarTarget === "edit"
              ? "Edit Bonus Date"
              : calendarTarget === "start"
                ? "Select Start Date"
                : "Select End Date"
        }
        onSelectDate={(d) => {
          if (calendarTarget === "award") setAwardDate(d);
          else if (calendarTarget === "edit") setEditDate(d);
          else if (calendarTarget === "start") setStartDate(d);
          else if (calendarTarget === "end") setEndDate(d);
          setCalendarTarget(null);
        }}
        onClose={() => setCalendarTarget(null)}
      />
    </View>
  );
}

export default function BonusManagementScreen() {
  return (
    <ProtectedRoute>
      <BonusManagementContent />
    </ProtectedRoute>
  );
}

const getStyles = (theme: any) => {
  const { colors, spacing, radius, shadows } = theme;
  return StyleSheet.create({
    screenWrapper: {
      flex: 1,
      backgroundColor: colors.bg.primary,
    },
    topHeader: {
      backgroundColor: colors.bg.card,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      ...shadows.subtle,
    },
    headerTitleGroup: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      flex: 1,
      marginLeft: spacing.sm,
    },
    headerIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: "#FEF3C7",
      justifyContent: "center",
      alignItems: "center",
    },
    headerTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: colors.text.primary,
      letterSpacing: -0.3,
    },
    headerSubtitle: {
      fontSize: 11,
      color: colors.text.muted,
      fontWeight: "500",
    },
    headerAwardBtn: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#F59E0B",
      paddingVertical: 7,
      paddingHorizontal: 12,
      borderRadius: radius.full || 20,
      gap: 4,
      ...shadows.subtle,
    },
    headerAwardBtnPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.97 }],
    },
    headerAwardBtnText: {
      color: "#ffffff",
      fontSize: 13,
      fontWeight: "700",
    },
    container: {
      padding: spacing.lg,
      paddingBottom: 100,
    },

    // KPI Summary
    statsScroll: {
      flexDirection: "row",
      gap: spacing.sm,
      paddingBottom: spacing.sm,
      marginBottom: spacing.md,
    },
    statCard: {
      minWidth: 125,
      backgroundColor: colors.bg.card,
      borderRadius: radius.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      ...shadows.subtle,
    },
    statTopRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 4,
    },
    statLabel: {
      fontSize: 10,
      color: colors.text.muted,
      fontWeight: "700",
      textTransform: "uppercase",
    },
    statValue: {
      fontSize: 15,
      fontWeight: "800",
      color: colors.text.primary,
    },
    statMeta: {
      fontSize: 10,
      color: colors.text.secondary,
      marginTop: 2,
    },

    // Tabs
    tabScrollWrap: {
      flexDirection: "row",
      gap: 6,
      paddingBottom: 4,
      marginBottom: spacing.md,
    },
    tabButton: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.full || 18,
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      ...shadows.subtle,
    },
    tabButtonActive: {
      backgroundColor: colors.accent.primary,
      borderColor: colors.accent.primary,
    },
    tabText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text.secondary,
    },
    tabTextActive: {
      color: "#ffffff",
    },

    // Filter Card
    filterCard: {
      backgroundColor: colors.bg.card,
      borderRadius: radius.lg,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      marginBottom: spacing.lg,
      ...shadows.subtle,
    },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.bg.primary,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      height: 40,
      gap: spacing.sm,
      marginBottom: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    searchInput: {
      flex: 1,
      fontSize: 13,
      color: colors.text.primary,
      paddingVertical: 0,
    },
    periodRow: {
      flexDirection: "row",
      gap: spacing.xs,
      paddingVertical: 4,
    },
    periodChip: {
      paddingVertical: 5,
      paddingHorizontal: 12,
      borderRadius: radius.full || 16,
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    periodChipActive: {
      backgroundColor: colors.accent.primaryMuted || "#EBF5FF",
      borderColor: colors.accent.primary,
    },
    periodChipText: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    periodChipTextActive: {
      color: colors.accent.primary,
      fontWeight: "700",
    },
    customDateRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginTop: spacing.sm,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border.subtle,
    },
    customDateBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: spacing.sm,
      backgroundColor: colors.bg.primary,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    customDateText: {
      fontSize: 12,
      color: colors.text.primary,
      fontWeight: "600",
    },
    customDateSep: {
      fontSize: 12,
      color: colors.text.muted,
      fontWeight: "600",
    },
    sortRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: spacing.sm,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border.subtle,
    },
    sortLabel: {
      fontSize: 11,
      color: colors.text.muted,
      fontWeight: "600",
    },
    sortChips: {
      flexDirection: "row",
      gap: 6,
    },
    sortChip: {
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: 4,
      backgroundColor: colors.bg.primary,
    },
    sortChipActive: {
      backgroundColor: colors.accent.primary,
    },
    sortChipText: {
      fontSize: 11,
      color: colors.text.secondary,
      fontWeight: "600",
    },
    sortChipTextActive: {
      color: "#ffffff",
    },

    // Bonus List
    bonusList: {
      gap: spacing.sm,
    },
    bonusCard: {
      backgroundColor: colors.bg.card,
      borderRadius: radius.lg,
      padding: spacing.md,
      marginBottom: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      ...shadows.subtle,
    },
    bonusCardMain: {
      flex: 1,
    },
    bonusCardPressed: {
      backgroundColor: colors.bg.elevated || "#F9FAFB",
      transform: [{ scale: 0.99 }],
    },
    cardHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: spacing.xs,
    },
    cardRecipientGroup: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      flex: 1,
      marginRight: spacing.sm,
    },
    recipientAvatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      justifyContent: "center",
      alignItems: "center",
    },
    nameBadgeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    recipientName: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.text.primary,
      flexShrink: 1,
    },
    roleBadge: {
      paddingVertical: 1,
      paddingHorizontal: 6,
      borderRadius: 4,
    },
    roleBadgeText: {
      fontSize: 10,
      fontWeight: "700",
      textTransform: "uppercase",
    },
    bonusDate: {
      fontSize: 11,
      color: colors.text.muted,
      marginTop: 2,
    },
    cardAmountGroup: {
      alignItems: "flex-end",
    },
    bonusAmount: {
      fontSize: 17,
      fontWeight: "900",
      color: "#D97706",
    },
    verifiedStarPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      marginTop: 2,
    },
    verifiedStarText: {
      fontSize: 10,
      fontWeight: "700",
      color: "#F59E0B",
    },
    markingsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 4,
      marginTop: 4,
      marginBottom: 2,
    },
    markingPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      paddingVertical: 2,
      paddingHorizontal: 6,
      borderRadius: 4,
      borderWidth: 1,
    },
    markingPillText: {
      fontSize: 10,
      fontWeight: "700",
    },
    cardBody: {
      marginTop: spacing.xs,
      gap: 6,
    },
    reasonPill: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#FEF3C7",
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: 6,
      alignSelf: "flex-start",
      gap: 4,
    },
    reasonText: {
      fontSize: 11,
      fontWeight: "700",
      color: "#B45309",
    },
    notesPreview: {
      fontSize: 12,
      color: colors.text.secondary,
      fontStyle: "italic",
    },
    cardFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: spacing.sm,
      paddingTop: spacing.xs,
      borderTopWidth: 1,
      borderTopColor: colors.border.subtle,
    },
    tapToViewText: {
      fontSize: 11,
      color: colors.text.muted,
      fontWeight: "500",
    },

    // Empty & Loading
    emptyCard: {
      backgroundColor: colors.bg.card,
      borderRadius: radius.lg,
      padding: spacing.xl,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border.subtle,
      ...shadows.subtle,
      marginTop: spacing.md,
    },
    emptyIconCircle: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: "#FEF3C7",
      justifyContent: "center",
      alignItems: "center",
      marginBottom: spacing.md,
    },
    emptyTitle: {
      fontSize: 17,
      fontWeight: "800",
      color: colors.text.primary,
      marginBottom: 6,
    },
    emptyDesc: {
      fontSize: 13,
      color: colors.text.secondary,
      textAlign: "center",
      lineHeight: 18,
      marginBottom: spacing.lg,
    },
    emptyActionBtn: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#F59E0B",
      paddingVertical: 10,
      paddingHorizontal: 18,
      borderRadius: radius.md,
      gap: 6,
      ...shadows.subtle,
    },
    emptyActionBtnText: {
      color: "#ffffff",
      fontSize: 13,
      fontWeight: "700",
    },
    loadingBox: {
      padding: 40,
      alignItems: "center",
      justifyContent: "center",
    },
    loadingText: {
      fontSize: 13,
      color: colors.text.muted,
      marginTop: 8,
    },

    // FAB
    fab: {
      position: "absolute",
      right: 20,
      bottom: 24,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#F59E0B",
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 30,
      gap: 6,
      ...shadows.elevated,
    },
    fabPressed: {
      transform: [{ scale: 0.95 }],
      opacity: 0.9,
    },
    fabText: {
      color: "#ffffff",
      fontSize: 14,
      fontWeight: "800",
      letterSpacing: 0.3,
    },

    // Modals
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
      padding: spacing.lg,
    },
    modalCard: {
      backgroundColor: colors.bg.card,
      borderRadius: radius.xl,
      padding: spacing.xl,
      width: "100%",
      maxWidth: 440,
      maxHeight: "88%",
      borderWidth: 1,
      borderColor: colors.border.subtle,
      ...shadows.elevated,
    },
    modalReceiptHeader: {
      alignItems: "center",
      marginBottom: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
      paddingBottom: spacing.md,
    },
    modalReceiptIconWrap: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: "#FEF3C7",
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 8,
    },
    modalReceiptTitle: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text.muted,
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    modalReceiptAmount: {
      fontSize: 32,
      fontWeight: "900",
      color: "#D97706",
      marginVertical: 4,
    },
    modalReceiptRole: {
      fontSize: 13,
      color: colors.text.secondary,
      fontWeight: "600",
    },
    modalReceiptDetails: {
      gap: 10,
      marginBottom: spacing.lg,
    },
    receiptRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    receiptLabel: {
      fontSize: 13,
      color: colors.text.muted,
      fontWeight: "500",
    },
    receiptValue: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.text.primary,
    },
    receiptMarkingTag: {
      backgroundColor: "#10B98118",
      borderColor: "#10B98140",
      borderWidth: 1,
      paddingVertical: 2,
      paddingHorizontal: 6,
      borderRadius: 4,
    },
    receiptMarkingTagText: {
      color: "#059669",
      fontSize: 11,
      fontWeight: "700",
    },
    modalActionRow: {
      flexDirection: "row",
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    modalShareBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.accent.primaryMuted || "#EBF5FF",
      paddingVertical: 10,
      borderRadius: radius.md,
      gap: 6,
    },
    modalShareBtnText: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.accent.primary,
    },
    modalEditBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.accent.primary,
      paddingVertical: 10,
      borderRadius: radius.md,
      gap: 6,
    },
    modalEditBtnText: {
      fontSize: 13,
      fontWeight: "700",
      color: "#ffffff",
    },
    modalDeleteBtn: {
      width: 44,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.accent.dangerMuted || "#FEE2E2",
      borderRadius: radius.md,
    },
    modalCloseBtn: {
      paddingVertical: 10,
      alignItems: "center",
      borderRadius: radius.md,
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    modalCloseBtnText: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text.secondary,
    },

    // Form Modal
    formModalCard: {
      backgroundColor: colors.bg.card,
      borderRadius: radius.xl,
      padding: spacing.lg,
      width: "100%",
      maxWidth: 480,
      maxHeight: "88%",
      borderWidth: 1,
      borderColor: colors.border.subtle,
      ...shadows.elevated,
    },
    formHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.md,
      paddingBottom: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    formTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    formTitle: {
      fontSize: 17,
      fontWeight: "800",
      color: colors.text.primary,
    },
    formScroll: {
      gap: spacing.sm,
      paddingBottom: spacing.md,
    },
    inputLabel: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text.secondary,
      marginTop: 4,
    },
    typeToggleRow: {
      flexDirection: "row",
      gap: spacing.xs,
      paddingBottom: 4,
    },
    typeToggleBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      paddingVertical: 8,
      paddingHorizontal: 10,
      backgroundColor: colors.bg.primary,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    typeToggleBtnActive: {
      backgroundColor: colors.accent.primary,
      borderColor: colors.accent.primary,
    },
    typeToggleText: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.text.secondary,
    },
    typeToggleTextActive: {
      color: "#ffffff",
    },

    // Selected Recipient Banner
    selectedRecipientBanner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: "#FEF3C7",
      borderColor: "#F59E0B",
      borderWidth: 1.5,
      borderRadius: radius.md,
      paddingVertical: 8,
      paddingHorizontal: 12,
      marginBottom: 6,
    },
    selectedRecipientLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flex: 1,
      marginRight: 8,
    },
    selectedCheckCircle: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: "#D97706",
      alignItems: "center",
      justifyContent: "center",
    },
    selectedRecipientName: {
      fontSize: 13,
      fontWeight: "800",
      color: "#78350F",
    },
    selectedRecipientPhone: {
      fontSize: 11,
      fontWeight: "600",
      color: "#92400E",
    },
    selectedRecipientMarkings: {
      fontSize: 11,
      fontWeight: "700",
      color: "#059669",
    },
    changeRecipientBtn: {
      backgroundColor: "#ffffff",
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: "#D97706",
    },
    changeRecipientText: {
      fontSize: 11,
      fontWeight: "700",
      color: "#D97706",
    },

    // Searchable Recipient Picker Box
    recipientSelectContainer: {
      backgroundColor: colors.bg.primary,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      overflow: "hidden",
    },
    recipientSearchBar: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.bg.card,
      paddingHorizontal: 10,
      height: 38,
      gap: 6,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.subtle,
    },
    recipientSearchInput: {
      flex: 1,
      fontSize: 12,
      color: colors.text.primary,
      paddingVertical: 0,
    },
    recipientResultsScroll: {
      maxHeight: 160,
    },
    recipientResultsContent: {
      padding: 6,
      gap: 4,
    },
    recipientResultItem: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 7,
      paddingHorizontal: 10,
      borderRadius: radius.sm,
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    recipientResultItemSelected: {
      backgroundColor: colors.accent.primaryMuted || "#EBF5FF",
      borderColor: colors.accent.primary,
    },
    resultItemLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flex: 1,
      marginRight: 6,
    },
    resultItemName: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text.primary,
    },
    resultItemNameSelected: {
      color: colors.accent.primary,
    },
    resultItemPhone: {
      fontSize: 10,
      color: colors.text.muted,
      marginTop: 1,
    },
    resultMarkingTag: {
      backgroundColor: "#10B98118",
      borderColor: "#10B98140",
      borderWidth: 1,
      paddingVertical: 1,
      paddingHorizontal: 5,
      borderRadius: 4,
    },
    resultMarkingTagText: {
      color: "#059669",
      fontSize: 9,
      fontWeight: "700",
    },
    noResultsBox: {
      padding: 20,
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
    },
    noResultsText: {
      fontSize: 11,
      color: colors.text.muted,
      textAlign: "center",
    },

    amountInputRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.bg.primary,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: "#F59E0B",
      paddingHorizontal: spacing.md,
      height: 48,
    },
    currencyPrefix: {
      fontSize: 18,
      fontWeight: "800",
      color: "#D97706",
      marginRight: 6,
    },
    amountInput: {
      flex: 1,
      fontSize: 18,
      fontWeight: "800",
      color: colors.text.primary,
      paddingVertical: 0,
    },
    quickAmountRow: {
      flexDirection: "row",
      gap: 6,
    },
    quickAmountChip: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 5,
      backgroundColor: colors.bg.primary,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    quickAmountText: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.text.secondary,
    },
    reasonWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
    },
    formReasonChip: {
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: radius.sm,
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    formReasonChipActive: {
      backgroundColor: "#FEF3C7",
      borderColor: "#F59E0B",
    },
    formReasonChipText: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    formReasonChipTextActive: {
      color: "#B45309",
      fontWeight: "700",
    },
    textInput: {
      backgroundColor: colors.bg.primary,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      paddingHorizontal: spacing.md,
      paddingVertical: 8,
      fontSize: 13,
      color: colors.text.primary,
    },
    datePickerBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.bg.primary,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
    },
    datePickerBtnText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.text.primary,
    },
    formFooter: {
      flexDirection: "row",
      gap: spacing.sm,
      marginTop: spacing.md,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border.subtle,
    },
    formCancelBtn: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 11,
      borderRadius: radius.md,
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    formCancelText: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text.secondary,
    },
    formSubmitBtn: {
      flex: 2,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 11,
      borderRadius: radius.md,
      backgroundColor: "#F59E0B",
      gap: 6,
      ...shadows.subtle,
    },
    formSubmitText: {
      fontSize: 13,
      fontWeight: "800",
      color: "#ffffff",
    },

    // Other Recipient Styles
    otherRecipientBox: {
      gap: 2,
    },
    otherRoleWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginBottom: 6,
    },
    otherRoleChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: radius.md,
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    otherRoleChipActive: {
      backgroundColor: colors.accent.primary,
      borderColor: colors.accent.primary,
    },
    otherRoleChipText: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.text.secondary,
    },
    otherRoleChipTextActive: {
      color: "#ffffff",
    },
    suggestionsContainer: {
      marginTop: 4,
      marginBottom: 6,
      padding: 8,
      backgroundColor: colors.bg.primary,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    suggestionsTitle: {
      fontSize: 10,
      fontWeight: "700",
      color: colors.text.muted,
      textTransform: "uppercase",
      marginBottom: 6,
    },
    suggestionsRow: {
      flexDirection: "row",
      gap: 6,
    },
    suggestionChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.bg.card,
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: radius.full || 12,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    suggestionChipName: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.text.primary,
    },
    suggestionChipRole: {
      fontSize: 10,
      fontWeight: "600",
      color: colors.text.muted,
    },
  });
};
