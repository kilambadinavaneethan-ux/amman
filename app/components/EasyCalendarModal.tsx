import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";

interface EasyCalendarModalProps {
  visible: boolean;
  date: Date;
  onSelectDate: (selectedDate: Date) => void;
  onClose: () => void;
  title?: string;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export default function EasyCalendarModal({
  visible,
  date,
  onSelectDate,
  onClose,
  title = "Select Date",
}: EasyCalendarModalProps) {
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => getStyles(theme), [theme]);

  // View state: "days" grid or "monthYear" matrix selector
  const [viewMode, setViewMode] = useState<"days" | "monthYear">("days");

  // Temporary date for calendar navigation while modal is active
  const [navDate, setNavDate] = useState<Date>(date || new Date());

  // Keep navDate synchronized when modal becomes visible
  React.useEffect(() => {
    if (visible) {
      setNavDate(date ? new Date(date) : new Date());
      setViewMode("days");
    }
  }, [visible, date]);

  const today = new Date();

  const isSameDay = (d1: Date, d2: Date) =>
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

  const handleSelectDay = (dayNum: number) => {
    const now = new Date();
    const isDateOnly = (d?: Date | null) => {
      if (!d || isNaN(d.getTime())) return true;
      return (
        (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) ||
        (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0)
      );
    };

    const timeSource = (date && !isDateOnly(date)) ? date : now;
    const currentHours = timeSource.getHours();
    const currentMinutes = timeSource.getMinutes();
    const currentSeconds = timeSource.getSeconds();
    const currentMs = timeSource.getMilliseconds();
    const nextDate = new Date(
      navDate.getFullYear(),
      navDate.getMonth(),
      dayNum,
      currentHours,
      currentMinutes,
      currentSeconds,
      currentMs
    );
    onSelectDate(nextDate);
    onClose();
  };

  const handleApplyPreset = (preset: "today" | "yesterday" | "tomorrow" | "firstOfMonth") => {
    const target = new Date();
    if (preset === "yesterday") {
      target.setDate(target.getDate() - 1);
    } else if (preset === "tomorrow") {
      target.setDate(target.getDate() + 1);
    } else if (preset === "firstOfMonth") {
      target.setDate(1);
    }
    onSelectDate(target);
    onClose();
  };

  const handlePrevMonth = () => {
    setNavDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setNavDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const daysInMonth = new Date(navDate.getFullYear(), navDate.getMonth() + 1, 0).getDate();
  const firstDayOfWeek = new Date(navDate.getFullYear(), navDate.getMonth(), 1).getDay();

  const renderDaysGrid = () => {
    const weeks = [];
    let days = [];

    // Padding for empty start cells
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(<View key={`empty-start-${i}`} style={styles.emptyCell} />);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const cellDate = new Date(navDate.getFullYear(), navDate.getMonth(), d);
      const isSelected = isSameDay(cellDate, date);
      const isTodayCell = isSameDay(cellDate, today);

      days.push(
        <Pressable
          key={`day-${d}`}
          style={({ pressed }) => [
            styles.dayCell,
            isSelected && styles.selectedDayCell,
            isTodayCell && !isSelected && styles.todayDayCell,
            pressed && { opacity: 0.7 },
          ]}
          onPress={() => handleSelectDay(d)}
        >
          <Text
            style={[
              styles.dayText,
              isSelected && styles.selectedDayText,
              isTodayCell && !isSelected && styles.todayDayText,
            ]}
          >
            {d}
          </Text>
          {isTodayCell && !isSelected && <View style={styles.todayDot} />}
        </Pressable>
      );

      if (days.length === 7) {
        weeks.push(<View key={`week-${d}`} style={styles.weekRow}>{days}</View>);
        days = [];
      }
    }

    if (days.length > 0) {
      while (days.length < 7) {
        days.push(<View key={`empty-end-${days.length}`} style={styles.emptyCell} />);
      }
      weeks.push(<View key="week-end" style={styles.weekRow}>{days}</View>);
    }

    return (
      <View>
        <View style={styles.weekdayHeader}>
          {WEEKDAYS.map(wd => (
            <Text key={wd} style={styles.weekdayText}>{wd}</Text>
          ))}
        </View>
        <View style={styles.gridContainer}>{weeks}</View>
      </View>
    );
  };

  const renderMonthYearMatrix = () => {
    const currentYear = navDate.getFullYear();
    const currentMonth = navDate.getMonth();

    return (
      <View style={styles.monthYearContainer}>
        {/* Year Controls */}
        <View style={styles.yearRow}>
          <Pressable
            style={styles.yearBtn}
            onPress={() => setNavDate(new Date(currentYear - 1, currentMonth, 1))}
          >
            <MaterialIcons name="chevron-left" size={24} color={colors.text.primary} />
          </Pressable>
          <Text style={styles.yearTitle}>{currentYear}</Text>
          <Pressable
            style={styles.yearBtn}
            onPress={() => setNavDate(new Date(currentYear + 1, currentMonth, 1))}
          >
            <MaterialIcons name="chevron-right" size={24} color={colors.text.primary} />
          </Pressable>
        </View>

        {/* 12 Months Grid */}
        <View style={styles.monthGrid}>
          {MONTH_NAMES.map((mName, idx) => {
            const isSelMonth = currentMonth === idx;
            return (
              <Pressable
                key={mName}
                style={[
                  styles.monthTile,
                  isSelMonth && styles.monthTileSelected,
                ]}
                onPress={() => {
                  setNavDate(new Date(currentYear, idx, Math.min(navDate.getDate(), 28)));
                  setViewMode("days");
                }}
              >
                <Text
                  style={[
                    styles.monthTileText,
                    isSelMonth && styles.monthTileTextSelected,
                  ]}
                >
                  {mName.substring(0, 3)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={e => e.stopPropagation()}>
          {/* Top Hero Banner */}
          <View style={styles.heroBanner}>
            <View style={styles.heroRow}>
              <MaterialIcons name="event" size={22} color="#FFFFFF" />
              <Text style={styles.heroTitle}>{title}</Text>
            </View>
            <Text style={styles.heroDateFormatted}>
              {date.toLocaleDateString("en-IN", {
                weekday: "short",
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </Text>
          </View>

          {/* Quick Preset Badges */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.presetsRow}
          >
            <Pressable
              style={styles.presetChip}
              onPress={() => handleApplyPreset("today")}
            >
              <MaterialIcons name="today" size={14} color={colors.accent.primary} />
              <Text style={styles.presetChipText}>Today</Text>
            </Pressable>

            <Pressable
              style={styles.presetChip}
              onPress={() => handleApplyPreset("yesterday")}
            >
              <MaterialIcons name="history" size={14} color={colors.accent.primary} />
              <Text style={styles.presetChipText}>Yesterday</Text>
            </Pressable>

            <Pressable
              style={styles.presetChip}
              onPress={() => handleApplyPreset("tomorrow")}
            >
              <MaterialIcons name="update" size={14} color={colors.accent.primary} />
              <Text style={styles.presetChipText}>Tomorrow</Text>
            </Pressable>

            <Pressable
              style={styles.presetChip}
              onPress={() => handleApplyPreset("firstOfMonth")}
            >
              <MaterialIcons name="first-page" size={14} color={colors.accent.primary} />
              <Text style={styles.presetChipText}>1st of Month</Text>
            </Pressable>
          </ScrollView>

          {/* Month / Year Switcher Header */}
          <View style={styles.navHeader}>
            <Pressable style={styles.navNavBtn} onPress={handlePrevMonth}>
              <MaterialIcons name="chevron-left" size={26} color={colors.accent.primary} />
            </Pressable>

            <Pressable
              style={styles.monthToggleTitle}
              onPress={() => setViewMode(viewMode === "days" ? "monthYear" : "days")}
            >
              <Text style={styles.navHeaderTitle}>
                {MONTH_NAMES[navDate.getMonth()]} {navDate.getFullYear()}
              </Text>
              <MaterialIcons
                name={viewMode === "days" ? "arrow-drop-down" : "arrow-drop-up"}
                size={22}
                color={colors.accent.primary}
              />
            </Pressable>

            <Pressable style={styles.navNavBtn} onPress={handleNextMonth}>
              <MaterialIcons name="chevron-right" size={26} color={colors.accent.primary} />
            </Pressable>
          </View>

          {/* Main Body Grid */}
          {viewMode === "days" ? renderDaysGrid() : renderMonthYearMatrix()}

          {/* Footer Controls */}
          <View style={styles.footerRow}>
            <Pressable style={styles.footerBtnToday} onPress={() => handleApplyPreset("today")}>
              <Text style={styles.footerBtnTodayText}>Set Today</Text>
            </Pressable>
            <View style={{ flex: 1 }} />
            <Pressable style={styles.footerBtnClose} onPress={onClose}>
              <Text style={styles.footerBtnCloseText}>Close</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function getStyles(theme: any) {
  const { colors } = theme;
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.55)",
      justifyContent: "center",
      alignItems: "center",
      padding: 20,
    },
    modalCard: {
      width: "100%",
      maxWidth: 360,
      backgroundColor: colors.bg.card || "#FFFFFF",
      borderRadius: 22,
      overflow: "hidden",
      elevation: 12,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.2,
      shadowRadius: 16,
      paddingBottom: 16,
    },
    heroBanner: {
      backgroundColor: colors.accent.primary || "#3B82F6",
      paddingHorizontal: 20,
      paddingVertical: 16,
    },
    heroRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 4,
    },
    heroTitle: {
      fontSize: 13,
      fontWeight: "600",
      color: "rgba(255, 255, 255, 0.85)",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    heroDateFormatted: {
      fontSize: 22,
      fontWeight: "700",
      color: "#FFFFFF",
    },
    presetsRow: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 8,
      alignItems: "center",
    },
    presetChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.bg.primary || "#F3F4F6",
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border?.light || "#E5E7EB",
    },
    presetChipText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.text.primary || "#111827",
    },
    navHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      marginBottom: 8,
    },
    monthToggleTitle: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
    },
    navHeaderTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text.primary || "#111827",
      marginRight: 2,
    },
    navNavBtn: {
      padding: 6,
      borderRadius: 10,
    },
    weekdayHeader: {
      flexDirection: "row",
      paddingHorizontal: 16,
      marginBottom: 6,
    },
    weekdayText: {
      flex: 1,
      textAlign: "center",
      fontSize: 12,
      fontWeight: "700",
      color: colors.text.muted || "#6B7280",
    },
    gridContainer: {
      paddingHorizontal: 16,
      gap: 4,
    },
    weekRow: {
      flexDirection: "row",
      justifyContent: "space-between",
    },
    dayCell: {
      flex: 1,
      aspectRatio: 1,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 14,
      margin: 1,
      position: "relative",
    },
    selectedDayCell: {
      backgroundColor: colors.accent.primary || "#3B82F6",
      elevation: 3,
      shadowColor: colors.accent.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
    },
    todayDayCell: {
      borderWidth: 1.5,
      borderColor: colors.accent.primary || "#3B82F6",
    },
    dayText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text.primary || "#111827",
    },
    selectedDayText: {
      color: "#FFFFFF",
      fontWeight: "700",
    },
    todayDayText: {
      color: colors.accent.primary || "#3B82F6",
      fontWeight: "700",
    },
    todayDot: {
      position: "absolute",
      bottom: 4,
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.accent.primary || "#3B82F6",
    },
    emptyCell: {
      flex: 1,
      aspectRatio: 1,
    },
    monthYearContainer: {
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    yearRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 16,
      marginBottom: 16,
    },
    yearBtn: {
      padding: 6,
      borderRadius: 8,
      backgroundColor: colors.bg.primary || "#F3F4F6",
    },
    yearTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.text.primary || "#111827",
    },
    monthGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    monthTile: {
      width: "30%",
      paddingVertical: 12,
      borderRadius: 10,
      backgroundColor: colors.bg.primary || "#F3F4F6",
      alignItems: "center",
    },
    monthTileSelected: {
      backgroundColor: colors.accent.primary || "#3B82F6",
    },
    monthTileText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text.primary || "#111827",
    },
    monthTileTextSelected: {
      color: "#FFFFFF",
      fontWeight: "700",
    },
    footerRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
      marginTop: 16,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border?.light || "#F3F4F6",
    },
    footerBtnToday: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 8,
      backgroundColor: colors.accent.primary + "15" || "#E0EDFF",
    },
    footerBtnTodayText: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.accent.primary || "#3B82F6",
    },
    footerBtnClose: {
      paddingVertical: 6,
      paddingHorizontal: 12,
    },
    footerBtnCloseText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text.muted || "#6B7280",
    },
  });
}
