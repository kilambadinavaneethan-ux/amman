import React, { memo } from "react";
import { View, Text, Pressable, StyleSheet, Alert } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

interface OrderItemCardProps {
  order: any;
  colors: any;
  styles: any;
  customers: any[];
  getStatusColor: (status: string) => string;
  onEdit: (order: any) => void;
  onDelete: (order: any) => void;
  onPay?: (order: any) => void;
  onToggleExpand?: (orderId: string) => void;
  isExpanded?: boolean;
}

const OrderItemCardComponent: React.FC<OrderItemCardProps> = ({
  order,
  colors,
  styles,
  customers,
  getStatusColor,
  onEdit,
  onDelete,
  onPay,
  onToggleExpand,
  isExpanded,
}) => {
  const router = useRouter();
  const isRaw = !!order.isRawMaterialOrder;
  const statusColor = getStatusColor(order.status);

  const customerObj = (customers || []).find(
    (c: any) =>
      (order.customerId && c.id === order.customerId) ||
      (c.name && order.customerName && c.name.trim().toLowerCase() === order.customerName.trim().toLowerCase()) ||
      (c.phone && order.customerPhone && c.phone.trim() === order.customerPhone.trim())
  );

  const handleOpenCustomerProfile = () => {
    if (isRaw) return;
    const targetId = customerObj?.id || order.customerId;
    if (targetId) {
      router.push({
        pathname: "/customer-profile" as any,
        params: { id: targetId },
      });
    } else {
      Alert.alert("Customer Profile", "No customer profile found for this order.");
    }
  };

  const customerCurrentPending = customerObj
    ? (customerObj.totalPending !== undefined ? Number(customerObj.totalPending) : Number(customerObj.balance || 0))
    : 0;

  const thisOrderUnpaid = Number(order.balanceDue || 0);
  const oldBalanceDue = order.previousBalance !== undefined
    ? Number(order.previousBalance)
    : Math.max(0, customerCurrentPending - thisOrderUnpaid);

  const thisOrderTotal = Number(order.total || 0);
  const totalAmountWithOldDues = thisOrderTotal + oldBalanceDue;
  const paidAmountVal = Number(order.paidAmount !== undefined ? order.paidAmount : (thisOrderTotal - thisOrderUnpaid) || 0);
  const totalBalanceUnpaid = oldBalanceDue + thisOrderUnpaid;

  return (
    <View style={[styles.orderCard, isRaw && { borderColor: "#d97706" }]}>
      <Pressable style={styles.cardHeader} onPress={handleOpenCustomerProfile}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={[styles.customerName, { flexShrink: 1 }]} numberOfLines={1} ellipsizeMode="tail">
              {isRaw ? `🪵 ${order.customerName}` : order.customerName}
            </Text>
            {!isRaw && (
              <MaterialIcons name="chevron-right" size={18} color={colors.accent?.primary || "#3B82F6"} />
            )}
            {isRaw && (
              <View style={{ backgroundColor: "#fef3c7", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, flexShrink: 0 }}>
                <Text style={{ fontSize: 9.5, fontWeight: "700", color: "#b45309" }}>RAW MATERIAL</Text>
              </View>
            )}
          </View>
          {order.customerPhone ? (
            <Text style={styles.customerPhone} numberOfLines={1}>📞 {order.customerPhone}</Text>
          ) : null}
        </View>

        <View style={[styles.statusBadge, { backgroundColor: `${statusColor}15`, flexShrink: 0 }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>{order.status}</Text>
        </View>
      </Pressable>

      <View style={styles.divider} />

      <View style={styles.cardBody}>
        {order.items && order.items.length > 0 ? (
          <View style={{ gap: 6 }}>
            <Text style={[styles.bodyLabel, { fontWeight: "700", color: colors.text.primary }]}>Items</Text>
            {order.items.map((item: any, idx: number) => {
              const itemTotal = Number(item.grossTotal) || (Number(item.quantity || 0) * Number(item.rate || 0));
              return (
                <View key={idx} style={styles.detailRow}>
                  <Text style={[styles.bodyValue, { fontWeight: "500", color: colors.text.primary, flex: 1, marginRight: 8 }]}>
                    • {item.itemName}
                  </Text>
                  <Text style={[styles.bodyValue, { fontWeight: "700", color: colors.text.primary }]}>
                    {item.quantity} x {item.rate} = ₹{itemTotal.toLocaleString("en-IN")}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : (
          <>
            <View style={styles.detailRow}>
              <Text style={styles.bodyLabel}>Product Name</Text>
              <Text style={styles.bodyValue}>{order.itemName}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.bodyLabel}>Quantity x Price</Text>
              <Text style={[styles.bodyValue, { fontWeight: "700" }]}>
                {order.quantity} x {order.rate} = ₹{(Number(order.quantity || 0) * Number(order.rate || 0)).toLocaleString("en-IN")}
              </Text>
            </View>
          </>
        )}

        <View style={[styles.divider, { marginVertical: 8 }]} />

        {/* Breakdown Box */}
        <View style={{ padding: 10, backgroundColor: colors.bg.primary, borderRadius: 10, borderWidth: 1, borderColor: colors.border.subtle }}>
          <Text style={{ fontSize: 11, fontWeight: "700", color: colors.text.primary, marginBottom: 8 }}>
            Full Total Breakdown
          </Text>

          {(order.grossTotal || (order.items && order.items.length > 0)) ? (
            <View style={[styles.detailRow, { marginBottom: 4 }]}>
              <Text style={styles.bodyLabel}>Items Subtotal</Text>
              <Text style={[styles.bodyValue, { fontWeight: "600" }]}>
                ₹{(Number(order.grossTotal) || (order.items ? order.items.reduce((s: number, i: any) => s + (Number(i.quantity || 0) * Number(i.rate || 0)), 0) : (Number(order.quantity || 0) * Number(order.rate || 0)))).toLocaleString("en-IN")}
              </Text>
            </View>
          ) : null}

          {Number(order.shipmentCharge) > 0 ? (
            <View style={[styles.detailRow, { marginBottom: 4 }]}>
              <Text style={styles.bodyLabel}>
                Shipment Charge {order.shipmentDistance ? `(${order.shipmentDistance} km)` : ""}
              </Text>
              <Text style={[styles.bodyValue, { fontWeight: "600", color: colors.accent.primary }]}>
                +₹{Number(order.shipmentCharge).toLocaleString("en-IN")}
              </Text>
            </View>
          ) : null}

          {Number(order.loadingCharge) > 0 ? (
            <View style={[styles.detailRow, { marginBottom: 4 }]}>
              <Text style={styles.bodyLabel}>
                Loading {order.loadingWorkerName ? `(${order.loadingWorkerName})` : ""}
              </Text>
              <Text style={[styles.bodyValue, { fontWeight: "600", color: colors.accent.primary }]}>
                +₹{Number(order.loadingCharge).toLocaleString("en-IN")}
              </Text>
            </View>
          ) : null}

          {Number(order.unloadingCharge) > 0 ? (
            <View style={[styles.detailRow, { marginBottom: 4 }]}>
              <Text style={styles.bodyLabel}>
                Unloading {order.unloadingWorkerName ? `(${order.unloadingWorkerName})` : ""}
              </Text>
              <Text style={[styles.bodyValue, { fontWeight: "600", color: colors.accent.primary }]}>
                +₹{Number(order.unloadingCharge).toLocaleString("en-IN")}
              </Text>
            </View>
          ) : null}

          {Number(order.extraAmount) > 0 ? (
            <View style={[styles.detailRow, { marginBottom: 4 }]}>
              <Text style={styles.bodyLabel}>
                Extra Charge {order.extraAmountDescription ? `(${order.extraAmountDescription})` : ""}
              </Text>
              <Text style={[styles.bodyValue, { fontWeight: "600", color: colors.accent.primary }]}>
                +₹{Number(order.extraAmount).toLocaleString("en-IN")}
              </Text>
            </View>
          ) : null}

          <View style={[styles.detailRow, { marginBottom: 4 }]}>
            <Text style={styles.bodyLabel}>Current Order Subtotal</Text>
            <Text style={[styles.bodyValue, { fontWeight: "600" }]}>
              ₹{thisOrderTotal.toLocaleString("en-IN")}
            </Text>
          </View>

          {oldBalanceDue > 0 ? (
            <View style={[styles.detailRow, { marginBottom: 4 }]}>
              <Text style={[styles.bodyLabel, { color: colors.accent.danger, fontWeight: "600" }]}>
                Old Balance Due (Previous)
              </Text>
              <Text style={[styles.bodyValue, { fontWeight: "700", color: colors.accent.danger }]}>
                +₹{oldBalanceDue.toLocaleString("en-IN")}
              </Text>
            </View>
          ) : null}

          <View style={[styles.divider, { marginVertical: 6 }]} />

          <View style={[styles.detailRow, { marginBottom: 4 }]}>
            <Text style={[styles.bodyLabel, { fontWeight: "800", color: colors.text.primary }]}>
              {isRaw ? "Total Purchase Cost" : "Total Order Amount (incl. Old Dues)"}
            </Text>
            <Text style={[styles.totalValue, { fontSize: 16, fontWeight: "800", color: colors.accent.primary }]}>
              ₹{totalAmountWithOldDues.toLocaleString("en-IN")}
            </Text>
          </View>

          <View style={[styles.detailRow, { marginBottom: 4 }]}>
            <Text style={styles.bodyLabel}>Amount Paid</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={[styles.bodyValue, { fontWeight: "700", color: colors.accent.success }]}>
                - ₹{paidAmountVal.toLocaleString("en-IN")}
              </Text>
              {(order.paymentMethod || order.paymentMode || order.paymentType) && paidAmountVal > 0 && (
                <View style={{ backgroundColor: `${colors.accent.primary}18`, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                  <Text style={{ fontSize: 10, fontWeight: "700", color: colors.accent.primary }}>
                    {order.paymentMethod || order.paymentMode || order.paymentType}
                  </Text>
                </View>
              )}
            </View>
          </View>

          <View style={[styles.detailRow, { marginTop: 2, paddingTop: 4, borderTopWidth: 1, borderTopColor: colors.border.subtle }]}>
            <Text style={[styles.bodyLabel, { fontWeight: "800", color: colors.accent.danger }]}>
              Remaining Unpaid Dues
            </Text>
            <Text style={[styles.bodyValue, { fontSize: 14, fontWeight: "800", color: colors.accent.danger }]}>
              ₹{totalBalanceUnpaid.toLocaleString("en-IN")}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.cardActions}>
        <Pressable
          style={[styles.actionBtn, { backgroundColor: colors.accent.primary + "15" }]}
          onPress={() => onEdit(order)}
        >
          <MaterialIcons name="edit" size={16} color={colors.accent.primary} />
          <Text style={[styles.actionBtnText, { color: colors.accent.primary }]} numberOfLines={1}>Edit</Text>
        </Pressable>

        <Pressable
          style={[styles.actionBtn, { backgroundColor: colors.accent.danger + "15" }]}
          onPress={() => onDelete(order)}
        >
          <MaterialIcons name="delete" size={16} color={colors.accent.danger} />
          <Text style={[styles.actionBtnText, { color: colors.accent.danger }]} numberOfLines={1}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
};

export const OrderItemCard = memo(OrderItemCardComponent);
export default OrderItemCard;
