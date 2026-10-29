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
  const dateObj = entry.date
    ? (entry.date instanceof Date ? entry.date : new Date(entry.date))
    : null;
  const orderDateObj = entry.orderDate
    ? (entry.orderDate instanceof Date ? entry.orderDate : new Date(entry.orderDate))
    : dateObj;

  const dateStr = orderDateObj && !isNaN(orderDateObj.getTime())
    ? orderDateObj.toLocaleDateString([], { day: "2-digit", month: "2-digit" })
    : "";

  const timeStr = dateObj && !isNaN(dateObj.getTime())
    ? (() => {
        const isMidnight =
          (dateObj.getHours() === 0 && dateObj.getMinutes() === 0 && dateObj.getSeconds() === 0) ||
          (dateObj.getUTCHours() === 0 && dateObj.getUTCMinutes() === 0 && dateObj.getUTCSeconds() === 0) ||
          (dateObj.getHours() === 5 && dateObj.getMinutes() === 30 && dateObj.getSeconds() === 0);
        if (isMidnight) return "";
        return dateObj.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
      })()
    : "";

  let delDateStr = "";
  if (entry.type === "order") {
    delDateStr = entry.deliveryDate
      ? (entry.deliveryDate instanceof Date ? entry.deliveryDate : new Date(entry.deliveryDate)).toLocaleDateString([], { day: "2-digit", month: "2-digit" })
      : (entry.original?.status === "cancelled" ? "Can" : "Pen");
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
      <View style={{ flex: 1.5, paddingRight: 4, justifyContent: "center" }}>
        {isOpening ? (
          <Text style={{ fontSize: 10, fontWeight: "700", color: colors.text.muted }}>
            Opening
          </Text>
        ) : (
          <>
            <Text
              style={[
                styles.cell,
                { fontSize: 11, fontWeight: "700", color: colors.text.primary, lineHeight: 14 },
              ]}
              numberOfLines={1}
            >
              {dateStr}
            </Text>
            {timeStr ? (
              <Text
                style={{ fontSize: 9, color: colors.text.muted, marginTop: 1, fontWeight: "500" }}
                numberOfLines={1}
              >
                🕒 {timeStr}
              </Text>
            ) : null}
            {entry.type === "order" && delDateStr ? (
              <Text
                style={{ fontSize: 8.5, color: colors.accent.primary, marginTop: 1, fontWeight: "600" }}
                numberOfLines={1}
              >
                🚚 {delDateStr}
              </Text>
            ) : null}
          </>
        )}
      </View>
      <View style={{ flex: 2.1 }}>
        <Text
          style={{ fontSize: 12, fontWeight: "600", color: colors.text.primary }}
          numberOfLines={3}
        >
          {entry.description}
        </Text>
        {entry.type === "order" && (
          <View style={{ marginTop: 2 }}>
            {(entry.advanceAmount > 0 || (entry.original?.advanceAmount > 0) || (entry.paymentReceived > entry.orderAmount)) && (
              <Text style={{ fontSize: 9, color: colors.accent.success, fontWeight: "700" }}>
                ⭐ Adv: +₹{(entry.advanceAmount || entry.original?.advanceAmount || (entry.paymentReceived - entry.orderAmount)).toLocaleString("en-IN")} (Credited to Profile)
              </Text>
            )}
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
            {(() => {
              const orderNote = (entry.notes || entry.original?.notes || (entry.original?.description && !entry.original?.description.startsWith('Order #') ? entry.original.description : ''))?.trim();
              if (!orderNote) return null;
              return (
                <Text style={{ fontSize: 9, color: colors.text.muted, marginTop: 1 }} numberOfLines={2}>
                  📝 {orderNote}
                </Text>
              );
            })()}
          </View>
        )}
        {entry.type === "payment" && (
          <View style={{ marginTop: 2 }}>
            {(entry.original?.advanceAmount > 0 || (entry.paymentReceived > 0 && Number(entry.runningBalance || 0) < 0)) && (
              <Text style={{ fontSize: 9, color: colors.accent.success, fontWeight: "700" }}>
                ⭐ Adv: ₹{(entry.original?.advanceAmount ? Number(entry.original.advanceAmount) : Math.abs(Number(entry.runningBalance || 0))).toLocaleString("en-IN")}
              </Text>
            )}
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
        {entry.type === "refund" && (
          <View style={{ marginTop: 2 }}>
            <Text style={{ fontSize: 9, color: "#D97706", fontWeight: "700" }}>
              ↩️ Returned to Client ({entry.original?.paymentMethod || "Cash"})
            </Text>
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
            color: (entry.type === "cancellation" || entry.type === "refund") ? colors.accent.danger : colors.accent.success,
            fontWeight: "700",
          },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {entry.type === "cancellation"
          ? `-₹${Math.abs(entry.balanceChange).toLocaleString("en-IN")}`
          : entry.type === "refund"
          ? `-₹${Math.abs(entry.refundAmount || entry.paymentReceived || 0).toLocaleString("en-IN")}`
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
            color: Number(entry.runningBalance || 0) < 0 ? colors.accent.success : colors.accent.danger,
          },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {Number(entry.runningBalance || 0) < 0
          ? `Adv: ₹${Math.abs(Number(entry.runningBalance || 0)).toLocaleString("en-IN")}`
          : `₹${(entry.runningBalance || 0).toLocaleString("en-IN")}`}
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
