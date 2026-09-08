import React, { useState, useEffect, useCallback, useMemo } from "react";
import { MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const CUSTOM_MARKINGS_STORAGE_KEY = "@custom_profile_markings_v1";

export interface MarkingPreset {
  id: string;
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  lightColor: string;
  lightBg: string;
  lightBorder: string;
  darkColor: string;
  darkBg: string;
  darkBorder: string;
  isCustom?: boolean;
}

export const PRESET_MARKINGS: MarkingPreset[] = [
  {
    id: "engineer",
    label: "Engineer",
    icon: "engineering",
    lightColor: "#0369A1",
    lightBg: "#E0F2FE",
    lightBorder: "#BAE6FD",
    darkColor: "#38BDF8",
    darkBg: "#0C4A6E40",
    darkBorder: "#0284C7",
  },
  {
    id: "ministry",
    label: "Ministry",
    icon: "account-balance",
    lightColor: "#6D28D9",
    lightBg: "#EDE9FE",
    lightBorder: "#DDD6FE",
    darkColor: "#A78BFA",
    darkBg: "#4C1D9540",
    darkBorder: "#7C3AED",
  },
  {
    id: "contractor",
    label: "Contractor",
    icon: "handyman",
    lightColor: "#B45309",
    lightBg: "#FEF3C7",
    lightBorder: "#FDE68A",
    darkColor: "#FBBF24",
    darkBg: "#78350F40",
    darkBorder: "#D97706",
  },
  {
    id: "architect",
    label: "Architect",
    icon: "architecture",
    lightColor: "#0F766E",
    lightBg: "#CCFBF1",
    lightBorder: "#99F6E4",
    darkColor: "#2DD4BF",
    darkBg: "#134E4A40",
    darkBorder: "#0D9488",
  },
  {
    id: "builder",
    label: "Builder",
    icon: "business",
    lightColor: "#BE123C",
    lightBg: "#FFE4E6",
    lightBorder: "#FECDD3",
    darkColor: "#FB7185",
    darkBg: "#88133740",
    darkBorder: "#E11D48",
  },
  {
    id: "government",
    label: "Government",
    icon: "policy",
    lightColor: "#334155",
    lightBg: "#F1F5F9",
    lightBorder: "#CBD5E1",
    darkColor: "#94A3B8",
    darkBg: "#1E293B60",
    darkBorder: "#475569",
  },
  {
    id: "vip",
    label: "VIP",
    icon: "stars",
    lightColor: "#A16207",
    lightBg: "#FEF9C3",
    lightBorder: "#FEF08A",
    darkColor: "#FACC15",
    darkBg: "#713F1240",
    darkBorder: "#CA8A04",
  },
  {
    id: "wholesale",
    label: "Wholesale",
    icon: "inventory-2",
    lightColor: "#047857",
    lightBg: "#D1FAE5",
    lightBorder: "#A7F3D0",
    darkColor: "#34D399",
    darkBg: "#064E3B40",
    darkBorder: "#059669",
  },
  {
    id: "retail",
    label: "Retail",
    icon: "storefront",
    lightColor: "#1D4ED8",
    lightBg: "#DBEAFE",
    lightBorder: "#BFDBFE",
    darkColor: "#60A5FA",
    darkBg: "#1E3A8A40",
    darkBorder: "#2563EB",
  },
];

const PALETTE = [
  { lightColor: "#0369A1", lightBg: "#E0F2FE", lightBorder: "#BAE6FD", darkColor: "#38BDF8", darkBg: "#0C4A6E40", darkBorder: "#0284C7" },
  { lightColor: "#6D28D9", lightBg: "#EDE9FE", lightBorder: "#DDD6FE", darkColor: "#A78BFA", darkBg: "#4C1D9540", darkBorder: "#7C3AED" },
  { lightColor: "#B45309", lightBg: "#FEF3C7", lightBorder: "#FDE68A", darkColor: "#FBBF24", darkBg: "#78350F40", darkBorder: "#D97706" },
  { lightColor: "#0F766E", lightBg: "#CCFBF1", lightBorder: "#99F6E4", darkColor: "#2DD4BF", darkBg: "#134E4A40", darkBorder: "#0D9488" },
  { lightColor: "#BE123C", lightBg: "#FFE4E6", lightBorder: "#FECDD3", darkColor: "#FB7185", darkBg: "#88133740", darkBorder: "#E11D48" },
  { lightColor: "#047857", lightBg: "#D1FAE5", lightBorder: "#A7F3D0", darkColor: "#34D399", darkBg: "#064E3B40", darkBorder: "#059669" },
  { lightColor: "#C026D3", lightBg: "#FAE8FF", lightBorder: "#F5D0FE", darkColor: "#E879F9", darkBg: "#701A7540", darkBorder: "#C026D3" },
  { lightColor: "#4338CA", lightBg: "#EEF2FF", lightBorder: "#E0E7FF", darkColor: "#818CF8", darkBg: "#312E8140", darkBorder: "#4F46E5" },
];

// In-memory cache & event listeners for real-time synchronization
let cachedCustomMarkings: string[] | null = null;
const listeners: Set<() => void> = new Set();

const notifyListeners = () => {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (e) {
      console.warn("Listener notification error:", e);
    }
  });
};

/**
 * Loads custom markings from AsyncStorage
 */
export async function getCustomMarkings(): Promise<string[]> {
  if (cachedCustomMarkings !== null) {
    return [...cachedCustomMarkings];
  }
  try {
    const raw = await AsyncStorage.getItem(CUSTOM_MARKINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        cachedCustomMarkings = parsed.map((s) => String(s).trim()).filter(Boolean);
        return [...cachedCustomMarkings];
      }
    }
  } catch (err) {
    console.warn("Failed to load custom markings from storage:", err);
  }
  cachedCustomMarkings = [];
  return [];
}

/**
 * Saves a new custom marking into persistent storage
 */
export async function saveCustomMarking(label: string): Promise<string[]> {
  const trimmed = (label || "").trim();
  if (!trimmed) return getCustomMarkings();

  // If already a default preset, no need to add as custom
  const isPreset = PRESET_MARKINGS.some(
    (p) => p.label.toLowerCase() === trimmed.toLowerCase() || p.id.toLowerCase() === trimmed.toLowerCase()
  );
  if (isPreset) return getCustomMarkings();

  const current = await getCustomMarkings();
  const exists = current.some((m) => m.toLowerCase() === trimmed.toLowerCase());
  if (exists) return current;

  const updated = [...current, trimmed];
  cachedCustomMarkings = updated;
  try {
    await AsyncStorage.setItem(CUSTOM_MARKINGS_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn("Failed to save custom marking to storage:", err);
  }

  notifyListeners();
  return updated;
}

/**
 * Removes a custom marking from persistent storage
 */
export async function removeCustomMarking(label: string): Promise<string[]> {
  const trimmed = (label || "").trim().toLowerCase();
  const current = await getCustomMarkings();
  const updated = current.filter((m) => m.toLowerCase() !== trimmed);
  cachedCustomMarkings = updated;
  try {
    await AsyncStorage.setItem(CUSTOM_MARKINGS_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn("Failed to remove custom marking from storage:", err);
  }

  notifyListeners();
  return updated;
}

/**
 * Normalizes markings from customer data structure
 */
export function normalizeMarkings(customer: any): string[] {
  if (!customer) return [];
  const tags: string[] = [];

  if (Array.isArray(customer.profileMarkings)) {
    customer.profileMarkings.forEach((t: any) => {
      if (typeof t === "string" && t.trim()) {
        const trimmed = t.trim();
        if (!tags.includes(trimmed)) tags.push(trimmed);
      }
    });
  }

  if (typeof customer.markingProfile === "string" && customer.markingProfile.trim()) {
    const trimmed = customer.markingProfile.trim();
    if (!tags.includes(trimmed)) {
      tags.push(trimmed);
    }
  }

  return tags;
}

/**
 * Gets styling configuration and icon for a given marking tag
 */
export function getMarkingConfig(tag: string, isDark: boolean = false): {
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  color: string;
  bg: string;
  border: string;
} {
  const cleanTag = (tag || "").trim();
  const lower = cleanTag.toLowerCase();

  const preset = PRESET_MARKINGS.find(
    (p) => p.label.toLowerCase() === lower || p.id.toLowerCase() === lower
  );

  if (preset) {
    return {
      label: preset.label,
      icon: preset.icon,
      color: isDark ? preset.darkColor : preset.lightColor,
      bg: isDark ? preset.darkBg : preset.lightBg,
      border: isDark ? preset.darkBorder : preset.lightBorder,
    };
  }

  // Dynamic hash for custom tags
  let hash = 0;
  for (let i = 0; i < cleanTag.length; i++) {
    hash = cleanTag.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colorIndex = Math.abs(hash) % PALETTE.length;
  const p = PALETTE[colorIndex];

  return {
    label: cleanTag,
    icon: "bookmark",
    color: isDark ? p.darkColor : p.lightColor,
    bg: isDark ? p.darkBg : p.lightBg,
    border: isDark ? p.darkBorder : p.lightBorder,
  };
}

/**
 * Merges standard presets with stored custom markings and any customer-discovered markings
 */
export function getAllMarkingPresets(customMarkings: string[] = []): MarkingPreset[] {
  const presets: MarkingPreset[] = [...PRESET_MARKINGS];
  const seen = new Set(presets.map((p) => p.label.toLowerCase()));

  customMarkings.forEach((tag) => {
    const clean = tag.trim();
    if (!clean || seen.has(clean.toLowerCase())) return;
    seen.add(clean.toLowerCase());

    const lightCfg = getMarkingConfig(clean, false);
    const darkCfg = getMarkingConfig(clean, true);

    presets.push({
      id: `custom_${clean.toLowerCase().replace(/\s+/g, "_")}`,
      label: clean,
      icon: "bookmark",
      lightColor: lightCfg.color,
      lightBg: lightCfg.bg,
      lightBorder: lightCfg.border,
      darkColor: darkCfg.color,
      darkBg: darkCfg.bg,
      darkBorder: darkCfg.border,
      isCustom: true,
    });
  });

  return presets;
}

/**
 * React hook to access and manage custom markings in any component
 */
export function useCustomMarkings(existingCustomersList?: any[]) {
  const [customList, setCustomList] = useState<string[]>(cachedCustomMarkings || []);

  const refresh = useCallback(async () => {
    const list = await getCustomMarkings();
    
    // Also discover any markings present on existing customers that aren't yet in storage
    if (Array.isArray(existingCustomersList) && existingCustomersList.length > 0) {
      const discovered = new Set<string>();
      existingCustomersList.forEach((c) => {
        const marks = normalizeMarkings(c);
        marks.forEach((m) => {
          const isPreset = PRESET_MARKINGS.some(
            (p) => p.label.toLowerCase() === m.toLowerCase() || p.id.toLowerCase() === m.toLowerCase()
          );
          if (!isPreset && !list.some((existing) => existing.toLowerCase() === m.toLowerCase())) {
            discovered.add(m);
          }
        });
      });

      if (discovered.size > 0) {
        for (const newTag of Array.from(discovered)) {
          await saveCustomMarking(newTag);
        }
        const updatedList = await getCustomMarkings();
        setCustomList(updatedList);
        return;
      }
    }

    setCustomList(list);
  }, [existingCustomersList]);

  useEffect(() => {
    refresh();
    const handleUpdate = () => {
      getCustomMarkings().then((list) => setCustomList(list));
    };
    listeners.add(handleUpdate);
    return () => {
      listeners.delete(handleUpdate);
    };
  }, [refresh]);

  const addMarking = useCallback(async (label: string) => {
    const updated = await saveCustomMarking(label);
    setCustomList(updated);
    return true;
  }, []);

  const deleteMarking = useCallback(async (label: string) => {
    const updated = await removeCustomMarking(label);
    setCustomList(updated);
    return true;
  }, []);

  const allPresets = useMemo(() => {
    return getAllMarkingPresets(customList);
  }, [customList]);

  return {
    customMarkings: customList,
    allPresets,
    addCustomMarking: addMarking,
    removeCustomMarking: deleteMarking,
    refreshCustomMarkings: refresh,
  };
}
