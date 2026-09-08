import React, { memo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";

interface LedgerItemCardProps {
  entry: any;
  colors: any;
  onPress: (entry: any) => void;
  onOpenEditProfile: () => void;
}

const LedgerItemCardComponent: React.FC<LedgerItemCardProps> = ({
  entry,
  colors,
  onPress,
  onOpenEditProfile,
}) => {
  const isOpening = entry.type === "opening";
  let dateDisplay = "";
  if (entry.type === "order") {
    const orderDateStr = entry.orderDate
      ? (entry.orderDate instanceof Date ? entry.orderDate : new Date(entry.orderDate)).toLocaleDateString([], { day: "2-digit", month: "2-digit" })
      : "";
    const delDateStr = entry.deliveryDate
      ? (entry.deliveryDate instanceof Date ? entry.deliveryDate : new Date(entry.deliveryDate)).toLocaleDateString([], { day: "2-digit", month: "2-digit" })
      : (entry.original?.status === "cancelled" ? "Can" : "Pen");
    dateDisplay = `O: ${orderDateStr}\nD: ${delDateStr}`;
  } else if (entry.date) {
    const d = entry.date instanceof Date ? entry.date : new Date(entry.date);
    dateDisplay = d.toLocaleDateString([], { day: "2-digit", month: "2-digit" });
  }

  const handlePress = () => {
    if (isOpening) {
      onOpenEditProfile();
    } else {
      onPress(entry);
    }
  };

  return (
    <Pressable
      style={[
        styles.row,
        { borderBottomColor: colors.border.subtle },
        isOpening && { opacity: 0.8 },
      ]}
      onPress={handlePress}
    >
      <Text
        style={[
          styles.cell,
          { flex: 1.4, fontSize: 10, lineHeight: 14, color: colors.text.muted },
        ]}
        numberOfLines={2}
      >
        {dateDisplay}
      </Text>
      <View style={{ flex: 2.2 }}>
        <Text
          style={{ fontSize: 12, fontWeight: "600", color: colors.text.primary }}
          numberOfLines={3}
        >
          {entry.description}
        </Text>
        {entry.type === "order" && (
          <View style={{ marginTop: 2 }}>
            {entry.deliveryPartnerName && (
              <Text style={{ fontSize: 9, color: colors.text.muted }}>
                🚚 {entry.deliveryPartnerName}
                {entry.original?.shipmentCharge > 0 ? ` (₹${entry.original.shipmentCharge})` : ""}
              </Text>
            )}
            {entry.original?.collectorName && (
              <Text style={{ fontSize: 9, color: colors.text.muted }}>
                👤 Collector: {entry.original.collectorName}
              </Text>
            )}
            {(entry.original?.loadingWorkerName || entry.original?.unloadingWorkerName) && (
              <Text style={{ fontSize: 9, color: colors.text.muted }}>
                🏗️ {[entry.original.loadingWorkerName, entry.original.unloadingWorkerName].filter(Boolean).join(", ")}
              </Text>
            )}
            {entry.original?.extraAmount > 0 && (
              <Text style={{ fontSize: 9, color: colors.text.muted }}>
                ➕ Extra: ₹{entry.original.extraAmount} ({entry.original.extraAmountDescription || "No desc"})
              </Text>
            )}
            {(entry.original?.discountAmount > 0 || entry.original?.discount > 0) && (
              <Text style={{ fontSize: 9, color: colors.accent.success, fontWeight: "600" }}>
                🏷️ Discount: -₹{entry.original.discountAmount || entry.original.discount}
              </Text>
            )}
            {entry.original?.deliveries && entry.original.deliveries.length > 0 && (
              <View style={{ marginTop: 2, paddingLeft: 4, borderLeftWidth: 1, borderLeftColor: colors.border.medium }}>
                <Text style={{ fontSize: 8.5, fontWeight: "600", color: colors.text.muted }}>Deliveries:</Text>
                {entry.original.deliveries.map((del: any, idx: number) => {
                  const delDate = del.date ? (del.date.toDate ? del.date.toDate() : new Date(del.date)) : new Date();
                  return (
                    <Text key={idx} style={{ fontSize: 8.5, color: colors.text.muted }}>
                      ✓ {del.quantity} bricks on {delDate.toLocaleDateString("en-IN")}
                    </Text>
                  );
                })}
              </View>
            )}
          </View>
        )}
        {entry.type === "payment" && (
          <View style={{ marginTop: 2 }}>
            {(entry.discountAmount > 0 || entry.original?.discountAmount > 0) && (
              <Text style={{ fontSize: 9, color: colors.accent.success, fontWeight: "600" }}>
                🏷️ Discount: ₹{(entry.discountAmount || entry.original?.discountAmount).toLocaleString("en-IN")}
              </Text>
            )}
            {entry.original?.collectorName && (
              <Text style={{ fontSize: 9, color: colors.text.muted }}>
                👤 Collector: {entry.original.collectorName}
              </Text>
            )}
            {entry.original?.notes && (
              <Text style={{ fontSize: 9, color: colors.text.muted }} numberOfLines={1}>
                📝 {entry.original.notes}
              </Text>
            )}
          </View>
        )}
      </View>
      <Text style={[styles.cell, { flex: 1.5, textAlign: "right", color: colors.text.secondary }]} numberOfLines={1} adjustsFontSizeToFit>
        {entry.orderAmount > 0 ? `₹${entry.orderAmount.toLocaleString("en-IN")}` : "—"}
      </Text>
      <Text
        style={[
          styles.cell,
          {
            flex: 1.5,
            textAlign: "right",
            color: entry.type === "cancellation" ? colors.accent.danger : colors.accent.success,
            fontWeight: "700",
          },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {entry.type === "cancellation"
          ? `-₹${Math.abs(entry.balanceChange).toLocaleString("en-IN")}`
          : entry.paymentReceived > 0
          ? `₹${entry.paymentReceived.toLocaleString("en-IN")}`
          : entry.discountAmount > 0
          ? `Disc: ₹${entry.discountAmount.toLocaleString("en-IN")}`
          : "—"}
      </Text>
      <Text
        style={[
          styles.cell,
          {
            flex: 1.5,
            textAlign: "right",
            fontWeight: "700",
            color: colors.accent.danger,
          },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        ₹{(entry.runningBalance || 0).toLocaleString("en-IN")}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
  cell: {
    fontSize: 11.5,
  },
});

export const LedgerItemCard = memo(LedgerItemCardComponent);
export default LedgerItemCard;
