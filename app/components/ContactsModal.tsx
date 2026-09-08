import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  FlatList,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import * as Contacts from "expo-contacts/legacy";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface ContactsModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectContact: (contact: { name: string; phone: string }) => void;
}

const AVATAR_COLORS = [
  "#00D68F", // green
  "#3B82F6", // blue
  "#EF4444", // red
  "#F59E0B", // amber
  "#8B5CF6", // purple
  "#EC4899", // pink
  "#10B981", // emerald
  "#06B6D4", // cyan
];

// Module-level in-memory cache to load contacts instantly on subsequent modal opens
let cachedContacts: Contacts.Contact[] | null = null;

const getAvatarColor = (name: string) => {
  const code = name.charCodeAt(0) || 0;
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
};

const cleanPhoneNumber = (number: string) => {
  // Remove formatting characters: spaces, parentheses, dashes, etc.
  return number.replace(/[^\d+]/g, "");
};

// Memoized contact row component to prevent redundant list item updates
const ContactRow = React.memo(({
  item,
  onSelect,
}: {
  item: Contacts.Contact;
  onSelect: (contact: { name: string; phone: string }) => void;
}) => {
  const phone = item.phoneNumbers?.[0]?.number || "";
  const cleanedPhone = cleanPhoneNumber(phone);
  const initial = item.name.substring(0, 1).toUpperCase();
  const avatarBg = getAvatarColor(item.name);

  return (
    <Pressable
      style={({ pressed }) => [styles.contactRow, pressed && styles.rowPressed]}
      onPress={() => onSelect({ name: item.name, phone: cleanedPhone })}
    >
      <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
        <Text style={styles.avatarText}>{initial}</Text>
      </View>
      <View style={styles.contactDetails}>
        <Text selectable={true} style={styles.contactName}>{item.name}</Text>
        <Text selectable={true} style={styles.contactPhone}>{phone}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={20} color="#363B4D" />
    </Pressable>
  );
});
ContactRow.displayName = "ContactRow";

export default function ContactsModal({
  visible,
  onClose,
  onSelectContact,
}: ContactsModalProps) {
  const insets = useSafeAreaInsets();
  const [contacts, setContacts] = useState<Contacts.Contact[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);

  useEffect(() => {
    if (visible) {
      loadContacts();
    }
  }, [visible]);

  const loadContacts = async () => {
    // If cache exists, set contacts immediately to bypass loading screen
    if (cachedContacts && cachedContacts.length > 0) {
      setContacts(cachedContacts);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status === "granted") {
        setPermissionGranted(true);
        
        let allContacts: Contacts.Contact[] = [];
        let pageOffset = 0;
        const pageSize = 5000; // Drastically reduces number of bridge calls (5000 per request)
        let hasNextPage = true;
        let iterations = 0;

        while (hasNextPage && iterations < 3) { // Up to 15,000 contacts
          const response = await Contacts.getContactsAsync({
            fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
            sort: Contacts.SortTypes.UserDefault,
            pageSize,
            pageOffset,
          });

          if (response.data && response.data.length > 0) {
            allContacts = [...allContacts, ...response.data];
          }

          hasNextPage = !!(response.hasNextPage && response.data && response.data.length > 0);
          pageOffset += pageSize;
          iterations++;
        }

        // Filter out contacts without phone numbers or names
        const validContacts = allContacts.filter(
          (c) => c.name && c.phoneNumbers && c.phoneNumbers.length > 0
        );

        // Silently update state and cache in the background
        cachedContacts = validContacts;
        setContacts(validContacts);
      } else {
        setPermissionGranted(false);
      }
    } catch (err) {
      console.error("Failed to load contacts", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectContact = useCallback((contact: { name: string; phone: string }) => {
    onSelectContact(contact);
    onClose();
  }, [onSelectContact, onClose]);

  // Support searching by name or phone numbers (original formatted format and cleaned digits)
  const filteredContacts = contacts.filter((c) => {
    const searchLower = search.trim().toLowerCase();
    if (!searchLower) return true;

    // Check name matching
    if (c.name.toLowerCase().includes(searchLower)) return true;

    // Check phone numbers matching
    if (c.phoneNumbers) {
      for (const phoneObj of c.phoneNumbers) {
        if (phoneObj.number) {
          if (phoneObj.number.toLowerCase().includes(searchLower)) return true;
          const cleanPhone = phoneObj.number.replace(/[^\d+]/g, "");
          if (cleanPhone.includes(searchLower)) return true;
        }
      }
    }

    return false;
  });

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalBg}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Select Contact</Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <MaterialIcons name="close" size={24} color="#5A5F72" />
            </Pressable>
          </View>

          {/* Search Bar */}
          <View style={styles.searchContainer}>
            <MaterialIcons name="search" size={20} color="#5A5F72" style={styles.searchIcon} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search contacts..."
              placeholderTextColor="#5A5F72"
              style={styles.searchInput}
            />
          </View>

          {/* Contact List */}
          {loading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color="#00D68F" />
              <Text style={styles.statusText}>Reading device contacts...</Text>
            </View>
          ) : permissionGranted === false ? (
            <View style={styles.centerContainer}>
              <MaterialIcons name="contacts" size={48} color="#ef4444" />
              <Text style={styles.errorTitle}>Contacts Access Blocked</Text>
              <Text style={styles.errorDesc}>
                Allow access to contacts to quickly select and add customers. Change this in settings.
              </Text>
              <Pressable style={styles.retryBtn} onPress={loadContacts}>
                <Text style={styles.retryBtnText}>Grant Permission</Text>
              </Pressable>
            </View>
          ) : filteredContacts.length === 0 ? (
            <View style={styles.centerContainer}>
              <MaterialIcons name="contact-phone" size={48} color="#363B4D" />
              <Text style={styles.errorTitle}>No Contacts Found</Text>
              <Text style={styles.errorDesc}>
                {search ? `No contact matching "${search}"` : "Your address book appears empty."}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredContacts}
              keyExtractor={(item: any) => item.id || `${item.name}-${item.phoneNumbers?.[0]?.number || ""}`}
              contentContainerStyle={[styles.list, { paddingBottom: Math.max(insets.bottom + 20, 40) }]}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <ContactRow item={item} onSelect={handleSelectContact} />
              )}
              getItemLayout={(_, index) => ({
                length: 65,
                offset: 65 * index,
                index,
              })}
              initialNumToRender={20}
              maxToRenderPerBatch={20}
              windowSize={10}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}


const styles = StyleSheet.create({
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  container: {
    height: "85%",
    backgroundColor: "#1A1D27",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#F8F9FA",
  },
  closeBtn: {
    padding: 4,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2A2E3B",
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 16,
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#F8F9FA",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 36,
  },
  statusText: {
    marginTop: 12,
    color: "#5A5F72",
    fontSize: 14,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#F8F9FA",
    marginTop: 16,
  },
  errorDesc: {
    fontSize: 13,
    color: "#5A5F72",
    textAlign: "center",
    lineHeight: 20,
    marginTop: 6,
    marginBottom: 16,
  },
  retryBtn: {
    backgroundColor: "#00D68F",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  retryBtnText: {
    color: "#1A1D27",
    fontWeight: "700",
    fontSize: 14,
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#2A2E3B",
  },
  rowPressed: {
    backgroundColor: "#0F1117",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    color: "#1A1D27",
    fontSize: 15,
    fontWeight: "700",
  },
  contactDetails: {
    flex: 1,
    marginLeft: 14,
  },
  contactName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#F8F9FA",
  },
  contactPhone: {
    fontSize: 12,
    color: "#5A5F72",
    marginTop: 2,
  },
});
