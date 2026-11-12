import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { db, normalizeDateValue } from "../../src/config/firebase";
import type { Order } from "../../src/types/models";
import { getDocsOfflineSafe } from "../../src/utils/offlineHelpers";
import { roundCurrency } from "../../utils/currency";

export interface OrderContextType {
  orders: Order[];
  loading: boolean;
  addOrder: (orderData: Partial<Order> & Record<string, any>) => Promise<string | null>;
  editOrder: (
    orderId: string,
    newOrderData: Partial<Order> & Record<string, any>,
    oldOrderData: Partial<Order> & Record<string, any>,
  ) => Promise<boolean>;
  deleteOrder: (orderId: string, orderData?: Partial<Order> & Record<string, any>) => Promise<boolean>;
  updateOrderStatus: (orderId: string, status: string) => Promise<boolean>;
  assignDeliveryPartner: (
    orderId: string,
    partnerId: string | null,
    partnerName: string | null,
  ) => Promise<boolean>;
  todaySales: number;
  todayOrdersCount: number;
}

export const OrderContext = createContext<OrderContextType>({
  orders: [],
  loading: true,
  addOrder: async () => null,
  editOrder: async () => false,
  deleteOrder: async () => false,
  updateOrderStatus: async () => false,
  assignDeliveryPartner: async () => false,
  todaySales: 0,
  todayOrdersCount: 0,
});

function isDateOnly(d: Date): boolean {
  if (!d || isNaN(d.getTime())) return true;
  return (
    (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) ||
    (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0)
  );
}

async function adjustItemStockAndLog(
  itemId: string,
  changeQty: number,
  type: string,
  notes: string,
  customDate: unknown = null,
): Promise<void> {
  try {
    const itemRef = doc(db, "items", itemId);
    const itemSnap = await getDoc(itemRef);
    if (!itemSnap.exists()) return;

    const itemData = itemSnap.data();
    const currentStock = Number(
      itemData.openingStock !== undefined ? itemData.openingStock : itemData.stock || 0,
    );
    const newStock = currentStock + changeQty;
    const timestamp = customDate ? normalizeDateValue(customDate) : new Date();

    // Adjust slot-wise stock breakdown if slots exist
    let updatedSlots: Record<string, any>[] = Array.isArray(itemData.openingStockSlots)
      ? itemData.openingStockSlots.map((s: Record<string, any>) => ({ ...s }))
      : [];

    if (updatedSlots.length > 0) {
      if (changeQty < 0) {
        let deductRemaining = Math.abs(changeQty);
        const initialCount = updatedSlots.length;

        while (deductRemaining > 0 && updatedSlots.length > 0) {
          const firstQty = Number(updatedSlots[0].quantity || 0);
          if (firstQty <= deductRemaining) {
            deductRemaining -= firstQty;
            updatedSlots.shift();
          } else {
            updatedSlots[0].quantity = firstQty - deductRemaining;
            deductRemaining = 0;
          }
        }

        const deletedCount = initialCount - updatedSlots.length;
        if (deletedCount > 0) {
          for (let k = 0; k < deletedCount; k++) {
            updatedSlots.push({
              id: (Date.now() + k).toString(),
              slotName: `Slot ${updatedSlots.length + 1}`,
              quantity: 0,
            });
          }
        }
      } else if (changeQty > 0) {
        if (type === "production" || type === "manufacturing") {
          const lastIdx = updatedSlots.length - 1;
          const currentQty = Number(updatedSlots[lastIdx].quantity || 0);
          updatedSlots[lastIdx].quantity = currentQty + changeQty;
        } else {
          const currentQty = Number(updatedSlots[0].quantity || 0);
          updatedSlots[0].quantity = currentQty + changeQty;
        }
      }

      const total = updatedSlots.length;
      updatedSlots = updatedSlots.map((s, idx) => ({
        ...s,
        slotName:
          s.slotName && !String(s.slotName).startsWith("Slot ")
            ? s.slotName
            : `Slot ${idx + 1}`,
        slotType: idx === 0 ? "-" : idx === total - 1 && total > 1 ? "+" : "o",
      }));
    }

    const batch = writeBatch(db);

    batch.update(itemRef, {
      openingStock: newStock,
      openingStockSlots: updatedSlots,
      updatedAt: timestamp,
    });

    const logDocRef = doc(collection(db, "item_stock_logs"));
    batch.set(logDocRef, {
      itemId,
      itemName: itemData.itemName || "Unknown Item",
      itemType: itemData.itemType || "product",
      type,
      quantity: changeQty,
      previousStock: currentStock,
      newStock,
      notes,
      date: timestamp,
      createdAt: timestamp,
    });

    await batch.commit();
  } catch {
    // Ignore stock sync error
  }
}

async function adjustEntityOrderBalance(
  dbInstance: Firestore,
  customerId: string | null | undefined,
  balanceChange: number,
  customerType: string | undefined,
  meta: { createdAt?: unknown; collectorId?: string | null; collectorName?: string | null } = {},
): Promise<void> {
  if (!customerId) return;
  const numChange = roundCurrency(Number(balanceChange || 0));

  let type = customerType;
  if (!type) {
    if (customerId.startsWith("worker_") || customerId.startsWith("w_")) type = "worker";
    else if (customerId.startsWith("supplier_") || customerId.startsWith("sup_"))
      type = "supplier";
    else if (customerId.startsWith("partner_") || customerId.startsWith("dp_"))
      type = "delivery_partner";
  }

  // 1. Worker balance offset (Worker pending wages - order balance due)
  if (type === "worker") {
    try {
      const workerRef = doc(dbInstance, "workers", customerId);
      const snap = await getDoc(workerRef);
      if (snap.exists()) {
        const data = snap.data();
        const currentPending =
          data.totalPending !== undefined
            ? Number(data.totalPending)
            : Number(data.totalWages || 0) - Number(data.totalPaid || 0);

        const newPending = roundCurrency(currentPending - numChange);
        await updateDoc(workerRef, {
          totalPending: newPending,
          lastTransactionDate: normalizeDateValue(meta.createdAt),
        });
        return;
      }
    } catch (e) {
      console.warn("Failed to update worker order balance:", e);
    }
  }

  // 2. Raw Material Supplier offset
  if (type === "supplier") {
    try {
      const supplierRef = doc(dbInstance, "raw_material_suppliers", customerId);
      const snap = await getDoc(supplierRef);
      if (snap.exists()) {
        const data = snap.data();
        const currentBal = Number(data.balance || 0);
        const newBal = roundCurrency(currentBal - numChange);
        await updateDoc(supplierRef, {
          balance: newBal,
          updatedAt: normalizeDateValue(meta.createdAt),
        });
        return;
      }
    } catch (e) {
      console.warn("Failed to update supplier order balance:", e);
    }
  }

  // 3. Delivery Partner offset
  if (
    type === "delivery_partner" ||
    (!type && (customerId.startsWith("partner_") || customerId.startsWith("dp_")))
  ) {
    try {
      const cleanPartnerId = customerId.replace(/^partner_/, "").replace(/^dp_/, "");
      let partnerRef = doc(dbInstance, "deliveryPartners", cleanPartnerId);
      let snap = await getDoc(partnerRef);
      if (!snap.exists()) {
        partnerRef = doc(dbInstance, "deliveryPartners", customerId);
        snap = await getDoc(partnerRef);
      }
      if (snap.exists()) {
        const data = snap.data();
        const currentPending = Number(data.totalPending || 0);
        const newPending = roundCurrency(currentPending - numChange);
        await updateDoc(partnerRef, {
          totalPending: newPending,
          lastTransactionDate: normalizeDateValue(meta.createdAt),
          updatedAt: new Date(),
        });
        return;
      }
    } catch (e) {
      console.warn("Failed to update partner order balance:", e);
    }
  }

  // 4. Default: Standard Customer
  try {
    const customerRef = doc(dbInstance, "customers", customerId);
    const customerSnap = await getDoc(customerRef);
    if (customerSnap.exists()) {
      const updateData: Record<string, any> = {
        lastTransactionDate: normalizeDateValue(meta.createdAt),
      };
      if (meta.collectorId) updateData.collectorId = meta.collectorId;
      if (meta.collectorName) updateData.collectorName = meta.collectorName;

      if (numChange !== 0) {
        updateData.balance = increment(numChange);
        updateData.totalPending = increment(numChange);
      }

      await updateDoc(customerRef, updateData);
    }
  } catch {
    // Ignore customer update error
  }
}

function getPartnerTripCompensation(order: Record<string, any> | null | undefined) {
  if (!order) return { total: 0, base: 0, loading: 0, unloading: 0 };
  const base = roundCurrency(Number(order.shipmentCharge || 0));
  const loading =
    order.loadingByDeliveryPartner ||
      (!order.loadingWorkerId && Number(order.loadingCharge || 0) > 0)
      ? roundCurrency(Number(order.loadingCharge || 0))
      : 0;
  const unloading =
    order.unloadingByDeliveryPartner ||
      (!order.unloadingWorkerId && Number(order.unloadingCharge || 0) > 0)
      ? roundCurrency(Number(order.unloadingCharge || 0))
      : 0;
  return {
    total: roundCurrency(base + loading + unloading),
    base,
    loading,
    unloading,
  };
}

function formatTripItemString(
  finalItems: Record<string, any>[],
  fallbackItemName?: string,
  fallbackQty?: number,
): string {
  if (Array.isArray(finalItems) && finalItems.length > 0) {
    if (finalItems.length === 1) {
      const itm = finalItems[0];
      const name = itm.itemName || itm.name || "Item";
      const qty = itm.quantity !== undefined ? itm.quantity : itm.qty;
      return qty ? `${name} (${Number(qty).toLocaleString("en-IN")} pcs)` : name;
    }
    return finalItems
      .map((itm) => {
        const name = itm.itemName || itm.name || "Item";
        const qty = itm.quantity !== undefined ? itm.quantity : itm.qty;
        return qty ? `${name} (${Number(qty).toLocaleString("en-IN")})` : name;
      })
      .join(", ");
  }
  if (fallbackItemName) {
    const qty = fallbackQty ? Number(fallbackQty).toLocaleString("en-IN") : "";
    return qty ? `${fallbackItemName} (${qty} pcs)` : fallbackItemName;
  }
  return "";
}

export function OrderProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const ordersRef = useRef<Order[]>(orders);

  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  // Real-time listener for orders (incremental updates via docChanges)
  const isInitialLoadRef = useRef<boolean>(true);
  useEffect(() => {
    setLoading(true);
    isInitialLoadRef.current = true;
    const ordersCollection = collection(db, "orders");
    const q = query(ordersCollection, orderBy("createdAt", "desc"));

    const normalizeOrderDoc = (docSnapshot: QueryDocumentSnapshot): Order => {
      const data = docSnapshot.data();
      const createdAtVal = data.createdAt ? normalizeDateValue(data.createdAt) : null;
      const orderedDateVal = data.orderedDate ? normalizeDateValue(data.orderedDate) : null;
      return {
        id: docSnapshot.id,
        total: Number(data.total || 0),
        ...data,
        createdAt: createdAtVal || orderedDateVal || new Date(),
        orderedDate: orderedDateVal || createdAtVal || new Date(),
        completedAt: data.completedAt ? normalizeDateValue(data.completedAt) : null,
      } as Order;
    };

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (isInitialLoadRef.current) {
          const dbOrders = snapshot.docs.map(normalizeOrderDoc);
          ordersRef.current = dbOrders;
          setOrders(dbOrders);
          isInitialLoadRef.current = false;
        } else {
          const changes = snapshot.docChanges();
          if (changes.length > 0) {
            setOrders((prev) => {
              const updated = [...prev];
              for (const change of changes) {
                const orderData = normalizeOrderDoc(change.doc);
                if (change.type === "added") {
                  const existIdx = updated.findIndex((o) => o.id === orderData.id);
                  if (existIdx === -1) {
                    updated.unshift(orderData);
                  } else {
                    updated[existIdx] = orderData;
                  }
                } else if (change.type === "modified") {
                  const idx = updated.findIndex((o) => o.id === orderData.id);
                  if (idx !== -1) {
                    updated[idx] = orderData;
                  }
                } else if (change.type === "removed") {
                  const idx = updated.findIndex((o) => o.id === orderData.id);
                  if (idx !== -1) {
                    updated.splice(idx, 1);
                  }
                }
              }
              ordersRef.current = updated;
              return updated;
            });
          }
        }
        setLoading(false);
      },
      (error) => {
        console.error("Failed to load orders:", error);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  const addOrder = useCallback(
    async (orderData: Partial<Order> & Record<string, any>): Promise<string | null> => {
      try {
        const {
          customerId,
          customerName,
          customerType,
          itemId,
          itemName,
          quantity,
          rateType,
          rate,
          total,
          paidAmount,
          balanceDue,
          deliveryPartnerId,
          items,
          extraAmountDescription,
          collectorId,
          collectorName,
          createdAt,
          loadingWorkerId,
          loadingWorkerName,
          loadingCharge,
          unloadingWorkerId,
          unloadingWorkerName,
          unloadingCharge,
          discount,
          discountType,
          discountAmount,
          paymentMethod,
          paymentMode,
          paymentType,
        } = orderData;

        const finalItems: Record<string, any>[] = items || [];
        const hasMultipleItems = finalItems.length > 0;

        const finalItemId = hasMultipleItems ? finalItems[0].itemId : itemId || null;
        const finalItemName = hasMultipleItems
          ? finalItems.length === 1
            ? finalItems[0].itemName
            : `${finalItems[0].itemName} (+${finalItems.length - 1} more)`
          : itemName || "";
        const finalQuantity = hasMultipleItems
          ? finalItems.reduce((sum, itm) => sum + Number(itm.quantity || 0), 0)
          : Number(quantity || 0);
        const finalRateType = hasMultipleItems
          ? finalItems[0].rateType || "piece"
          : rateType || "piece";
        const finalRate = hasMultipleItems
          ? Number(finalItems[0].rate || 0)
          : Number(rate || 0);

        const cd = normalizeDateValue(createdAt);
        if (isDateOnly(cd)) {
          const now = new Date();
          cd.setHours(
            now.getHours(),
            now.getMinutes(),
            now.getSeconds(),
            now.getMilliseconds(),
          );
        }

        // 1. Create order record
        const orderPayload: Record<string, any> = {
          customerId,
          customerName,
          customerType:
            customerType ||
            (customerId?.startsWith("worker_")
              ? "worker"
              : customerId?.startsWith("sup_")
                ? "supplier"
                : customerId?.startsWith("dp_")
                  ? "delivery_partner"
                  : "customer"),
          itemId: finalItemId,
          itemName: finalItemName,
          quantity: finalQuantity,
          rateType: finalRateType,
          rate: finalRate,
          grossTotal: roundCurrency(Number(orderData.grossTotal || total || 0)),
          shipmentCharge: roundCurrency(Number(orderData.shipmentCharge || 0)),
          extraAmount: roundCurrency(Number(orderData.extraAmount || 0)),
          extraAmountDescription: extraAmountDescription || "",
          description: orderData.description
            ? String(orderData.description).trim()
            : orderData.notes
              ? String(orderData.notes).trim()
              : "",
          notes: orderData.notes
            ? String(orderData.notes).trim()
            : orderData.description
              ? String(orderData.description).trim()
              : "",
          discount: roundCurrency(Number(discount || 0)),
          discountType: discountType || "amount",
          discountAmount: roundCurrency(Number(discountAmount || 0)),
          total: roundCurrency(Number(total || 0)),
          paidAmount: roundCurrency(Number(paidAmount || 0)),
          paymentMethod: paymentMethod || paymentMode || paymentType || "Cash",
          paymentMode: paymentMode || paymentMethod || paymentType || "Cash",
          paymentType: paymentType || paymentMethod || paymentMode || "Cash",
          balanceDue: roundCurrency(Number(balanceDue || 0)),
          status: deliveryPartnerId ? "in-transit" : "pending",
          deliveryPartnerId: deliveryPartnerId || null,
          deliveryPartnerName: orderData.deliveryPartnerName || null,
          shipmentDistance: Number(orderData.shipmentDistance || 0),
          deliveryRateType: orderData.deliveryRateType || "fixed amount",
          deliveryRate: Number(
            orderData.deliveryRate !== undefined ? orderData.deliveryRate : 0,
          ),
          deliveryMinRate: Number(
            orderData.deliveryMinRate !== undefined ? orderData.deliveryMinRate : 0,
          ),
          collectorId: collectorId || null,
          collectorName: collectorName || null,
          createdAt: cd,
          orderedDate: normalizeDateValue(createdAt),
          items: finalItems,
          loadingWorkerId: loadingWorkerId || null,
          loadingWorkerName: loadingWorkerName || null,
          loadingCharge: roundCurrency(Number(loadingCharge || 0)),
          unloadingWorkerId: unloadingWorkerId || null,
          unloadingWorkerName: unloadingWorkerName || null,
          unloadingCharge: roundCurrency(Number(unloadingCharge || 0)),
          deliveredQuantity: Number(orderData.deliveredQuantity || 0),
          deliveries: orderData.deliveries || [],
        };

        const docRef = await addDoc(collection(db, "orders"), orderPayload);

        // 2. Adjust Customer / Worker / Supplier / Partner balance (ONLY if completed)
        if (customerId && orderPayload.status === "completed") {
          await adjustEntityOrderBalance(
            db,
            customerId,
            Number(balanceDue || 0),
            orderPayload.customerType,
            {
              createdAt,
              collectorId,
              collectorName,
            },
          );
        }

        // 3. Deduct stock from physical inventory
        if (hasMultipleItems) {
          for (const itm of finalItems) {
            if (itm.itemId && Number(itm.quantity || 0) > 0) {
              await adjustItemStockAndLog(
                itm.itemId,
                -Number(itm.quantity),
                "sale",
                `Order sale: Order #${docRef.id.slice(-6).toUpperCase()}`,
                createdAt,
              );
            }
          }
        } else if (itemId && Number(quantity || 0) > 0) {
          await adjustItemStockAndLog(
            itemId,
            -Number(quantity),
            "sale",
            `Order sale: Order #${docRef.id.slice(-6).toUpperCase()}`,
            createdAt,
          );
        }

        // 4. Create delivery trip and update partner balances if deliveryPartnerId is assigned (ONLY if completed)
        const partnerTripComp = getPartnerTripCompensation({
          ...orderPayload,
          loadingByDeliveryPartner: orderData.loadingByDeliveryPartner,
          unloadingByDeliveryPartner: orderData.unloadingByDeliveryPartner,
          loadingCharge: orderData.loadingCharge,
          unloadingCharge: orderData.unloadingCharge,
          loadingWorkerId: orderData.loadingWorkerId,
          unloadingWorkerId: orderData.unloadingWorkerId,
        });

        if (
          deliveryPartnerId &&
          partnerTripComp.total > 0 &&
          orderPayload.status === "completed"
        ) {
          try {
            const itemStr = formatTripItemString(finalItems, finalItemName, finalQuantity);

            await addDoc(collection(db, "deliveryTrips"), {
              partnerId: deliveryPartnerId,
              customerName: customerName || "General Client",
              orderId: docRef.id,
              deliveryCharge: partnerTripComp.total,
              baseDeliveryCharge: partnerTripComp.base,
              loadingCharge: partnerTripComp.loading,
              unloadingCharge: partnerTripComp.unloading,
              paymentStatus: "Pending",
              deliveredItem: itemStr,
              itemName: finalItemName || "",
              quantity: finalQuantity || 0,
              items: finalItems || [],
              createdAt: normalizeDateValue(createdAt),
            });

            const partnerRef = doc(db, "deliveryPartners", deliveryPartnerId);
            await updateDoc(partnerRef, {
              totalPayable: increment(partnerTripComp.total),
              totalPending: increment(partnerTripComp.total),
              updatedAt: new Date(),
            });
          } catch (tripError) {
            console.error("Error creating delivery trip in addOrder:", tripError);
          }
        }

        // 5. Credit wages to Loading/Unloading workers if assigned
        if (loadingWorkerId && Number(loadingCharge) > 0) {
          try {
            const workerRef = doc(db, "workers", loadingWorkerId);
            await updateDoc(workerRef, {
              totalWages: increment(roundCurrency(Number(loadingCharge))),
              totalPending: increment(roundCurrency(Number(loadingCharge))),
              updatedAt: new Date(),
            });
          } catch (e) {
            console.error("Error updating loading worker wage:", e);
          }
        }
        if (unloadingWorkerId && Number(unloadingCharge) > 0) {
          try {
            const workerRef = doc(db, "workers", unloadingWorkerId);
            await updateDoc(workerRef, {
              totalWages: increment(roundCurrency(Number(unloadingCharge))),
              totalPending: increment(roundCurrency(Number(unloadingCharge))),
              updatedAt: new Date(),
            });
          } catch (e) {
            console.error("Error updating unloading worker wage:", e);
          }
        }

        return docRef.id;
      } catch {
        return null;
      }
    },
    [],
  );

  const updateOrderStatus = useCallback(
    async (orderId: string, status: string): Promise<boolean> => {
      try {
        const orderRef = doc(db, "orders", orderId);
        const orderSnap = await getDoc(orderRef);
        if (!orderSnap.exists()) return false;

        const orderData = orderSnap.data();
        const oldStatus = orderData.status;

        if (oldStatus === status) {
          return true;
        }

        const {
          customerId,
          balanceDue,
          items,
          itemId,
          quantity,
          deliveryPartnerId,
          shipmentCharge,
          loadingWorkerId,
          loadingCharge,
          unloadingWorkerId,
          unloadingCharge,
          customerName,
        } = orderData;

        // 1. If transitioning from ACTIVE -> CANCELLED
        if (status === "cancelled" && oldStatus !== "cancelled") {
          if (oldStatus === "completed" && customerId && Number(balanceDue) > 0) {
            await adjustEntityOrderBalance(
              db,
              customerId,
              -Number(balanceDue),
              orderData.customerType,
              {
                createdAt: new Date(),
              },
            );
          }

          const finalItems: Record<string, any>[] = items || [];
          if (finalItems.length > 0) {
            for (const itm of finalItems) {
              if (itm.itemId && Number(itm.quantity) > 0) {
                await adjustItemStockAndLog(
                  itm.itemId,
                  Number(itm.quantity),
                  "rollback",
                  `Order cancelled: Order #${orderId.slice(-6).toUpperCase()}`,
                );
              }
            }
          } else if (itemId && Number(quantity) > 0) {
            await adjustItemStockAndLog(
              itemId,
              Number(quantity),
              "rollback",
              `Order cancelled: Order #${orderId.slice(-6).toUpperCase()}`,
            );
          }

          if (oldStatus === "completed") {
            try {
              const tripsRef = collection(db, "deliveryTrips");
              const q = query(tripsRef, where("orderId", "==", orderId));
              const tripSnap = await getDocsOfflineSafe(q);
              for (const docObj of tripSnap.docs) {
                const tripData = docObj.data();
                const pId = tripData.partnerId || deliveryPartnerId;
                const charge = roundCurrency(
                  Number(tripData.deliveryCharge || tripData.amount || shipmentCharge || 0),
                );

                await deleteDoc(doc(db, "deliveryTrips", docObj.id));

                if (pId && charge > 0) {
                  try {
                    const partnerRef = doc(db, "deliveryPartners", pId);
                    await updateDoc(partnerRef, {
                      totalPayable: increment(-charge),
                      totalPending: increment(-charge),
                      updatedAt: new Date(),
                    });
                  } catch (pErr) {
                    console.error("Error updating partner totals on order cancel:", pErr);
                  }
                }
              }
            } catch (tripError) {
              console.error("Error deleting order delivery trips on cancel:", tripError);
            }
          }

          if (loadingWorkerId && Number(loadingCharge) > 0) {
            try {
              const workerRef = doc(db, "workers", loadingWorkerId);
              await updateDoc(workerRef, {
                totalWages: increment(-roundCurrency(Number(loadingCharge))),
                totalPending: increment(-roundCurrency(Number(loadingCharge))),
                updatedAt: new Date(),
              });
            } catch (e) {
              console.error("Error reverting loading worker wage:", e);
            }
          }
          if (unloadingWorkerId && Number(unloadingCharge) > 0) {
            try {
              const workerRef = doc(db, "workers", unloadingWorkerId);
              await updateDoc(workerRef, {
                totalWages: increment(-roundCurrency(Number(unloadingCharge))),
                totalPending: increment(-roundCurrency(Number(unloadingCharge))),
                updatedAt: new Date(),
              });
            } catch (e) {
              console.error("Error reverting unloading worker wage:", e);
            }
          }
        }

        // 2. If transitioning from CANCELLED -> ACTIVE
        if (oldStatus === "cancelled" && status !== "cancelled") {
          if (status === "completed" && customerId && Number(balanceDue) > 0) {
            await adjustEntityOrderBalance(
              db,
              customerId,
              Number(balanceDue),
              orderData.customerType,
              {
                createdAt: new Date(),
              },
            );
          }

          const finalItems: Record<string, any>[] = items || [];
          if (finalItems.length > 0) {
            for (const itm of finalItems) {
              if (itm.itemId && Number(itm.quantity) > 0) {
                await adjustItemStockAndLog(
                  itm.itemId,
                  -Number(itm.quantity),
                  "sale",
                  `Order restored: Order #${orderId.slice(-6).toUpperCase()}`,
                );
              }
            }
          } else if (itemId && Number(quantity) > 0) {
            await adjustItemStockAndLog(
              itemId,
              -Number(quantity),
              "sale",
              `Order restored: Order #${orderId.slice(-6).toUpperCase()}`,
            );
          }

          const partnerTripComp = getPartnerTripCompensation(orderData);
          if (status === "completed" && deliveryPartnerId && partnerTripComp.total > 0) {
            try {
              await addDoc(collection(db, "deliveryTrips"), {
                partnerId: deliveryPartnerId,
                customerName: customerName || "General Client",
                orderId,
                deliveryCharge: partnerTripComp.total,
                baseDeliveryCharge: partnerTripComp.base,
                loadingCharge: partnerTripComp.loading,
                unloadingCharge: partnerTripComp.unloading,
                paymentStatus: "Pending",
                createdAt: new Date(),
              });

              const partnerRef = doc(db, "deliveryPartners", deliveryPartnerId);
              await updateDoc(partnerRef, {
                totalPayable: increment(partnerTripComp.total),
                totalPending: increment(partnerTripComp.total),
                updatedAt: new Date(),
              });
            } catch (tripError) {
              console.error("Error re-creating delivery trip on order un-cancel:", tripError);
            }
          }

          if (loadingWorkerId && Number(loadingCharge) > 0) {
            try {
              const workerRef = doc(db, "workers", loadingWorkerId);
              await updateDoc(workerRef, {
                totalWages: increment(roundCurrency(Number(loadingCharge))),
                totalPending: increment(roundCurrency(Number(loadingCharge))),
                updatedAt: new Date(),
              });
            } catch (e) {
              console.error("Error restoring loading worker wage:", e);
            }
          }
          if (unloadingWorkerId && Number(unloadingCharge) > 0) {
            try {
              const workerRef = doc(db, "workers", unloadingWorkerId);
              await updateDoc(workerRef, {
                totalWages: increment(roundCurrency(Number(unloadingCharge))),
                totalPending: increment(roundCurrency(Number(unloadingCharge))),
                updatedAt: new Date(),
              });
            } catch (e) {
              console.error("Error restoring unloading worker wage:", e);
            }
          }
        }

        // 3. Balance adjustments for transitions between non-completed and completed states
        if (oldStatus !== "cancelled" && status !== "cancelled") {
          if (status === "completed" && oldStatus !== "completed") {
            if (customerId && Number(balanceDue) > 0) {
              await adjustEntityOrderBalance(
                db,
                customerId,
                Number(balanceDue),
                orderData.customerType,
                {
                  createdAt: new Date(),
                },
              );
            }

            const partnerTripComp = getPartnerTripCompensation(orderData);
            if (deliveryPartnerId && partnerTripComp.total > 0) {
              try {
                const tripsRef = collection(db, "deliveryTrips");
                const q = query(tripsRef, where("orderId", "==", orderId));
                const tripSnap = await getDocsOfflineSafe(q);
                if (tripSnap.empty) {
                  const finalItemsList: Record<string, any>[] = items || [];
                  const itemStr = formatTripItemString(
                    finalItemsList,
                    orderData.itemName,
                    orderData.quantity,
                  );

                  await addDoc(collection(db, "deliveryTrips"), {
                    partnerId: deliveryPartnerId,
                    customerName: customerName || "General Client",
                    orderId,
                    deliveryCharge: partnerTripComp.total,
                    baseDeliveryCharge: partnerTripComp.base,
                    loadingCharge: partnerTripComp.loading,
                    unloadingCharge: partnerTripComp.unloading,
                    paymentStatus: "Pending",
                    deliveredItem: itemStr,
                    itemName: orderData.itemName || "",
                    quantity: orderData.quantity || 0,
                    items: finalItemsList,
                    createdAt: new Date(),
                  });

                  const partnerRef = doc(db, "deliveryPartners", deliveryPartnerId);
                  await updateDoc(partnerRef, {
                    totalPayable: increment(partnerTripComp.total),
                    totalPending: increment(partnerTripComp.total),
                    updatedAt: new Date(),
                  });
                }
              } catch (tErr) {
                console.error("Error creating delivery trip on completion:", tErr);
              }
            }
          } else if (oldStatus === "completed" && status !== "completed") {
            if (customerId && Number(balanceDue) > 0) {
              await adjustEntityOrderBalance(
                db,
                customerId,
                -Number(balanceDue),
                orderData.customerType,
                {
                  createdAt: new Date(),
                },
              );
            }

            try {
              const tripsRef = collection(db, "deliveryTrips");
              const q = query(tripsRef, where("orderId", "==", orderId));
              const tripSnap = await getDocsOfflineSafe(q);
              for (const docObj of tripSnap.docs) {
                const tripData = docObj.data();
                const pId = tripData.partnerId || deliveryPartnerId;
                const charge = roundCurrency(
                  Number(tripData.deliveryCharge || tripData.amount || shipmentCharge || 0),
                );

                await deleteDoc(doc(db, "deliveryTrips", docObj.id));

                if (pId && charge > 0) {
                  try {
                    const partnerRef = doc(db, "deliveryPartners", pId);
                    await updateDoc(partnerRef, {
                      totalPayable: increment(-charge),
                      totalPending: increment(-charge),
                      updatedAt: new Date(),
                    });
                  } catch (pErr) {
                    console.error(
                      "Error updating partner totals on order demotion:",
                      pErr,
                    );
                  }
                }
              }
            } catch (tErr) {
              console.error("Error removing delivery trips on status demotion:", tErr);
            }
          }
        }

        if (status === "completed") {
          const totalQty =
            orderData.items && orderData.items.length > 0
              ? orderData.items.reduce(
                (sum: number, itm: Record<string, any>) => sum + Number(itm.quantity || 0),
                0,
              )
              : Number(orderData.quantity || 0);
          const currentDelivered = Number(orderData.deliveredQuantity || 0);
          const remainingToDeliver = totalQty - currentDelivered;

          if (remainingToDeliver > 0) {
            const newDeliveries = [
              ...(orderData.deliveries || []),
              {
                date: new Date(),
                quantity: remainingToDeliver,
              },
            ];
            await updateDoc(orderRef, {
              status,
              deliveredQuantity: totalQty,
              deliveries: newDeliveries,
              completedAt: new Date(),
              updatedAt: new Date(),
            });
            return true;
          }
        }

        await updateDoc(orderRef, {
          status,
          ...(status === "completed" ? { completedAt: new Date() } : {}),
          updatedAt: new Date(),
        });
        return true;
      } catch (error) {
        console.error("Error in updateOrderStatus:", error);
        return false;
      }
    },
    [],
  );

  const assignDeliveryPartner = useCallback(
    async (
      orderId: string,
      partnerId: string | null,
      partnerName: string | null,
    ): Promise<boolean> => {
      try {
        const orderRef = doc(db, "orders", orderId);
        await updateDoc(orderRef, {
          deliveryPartnerId: partnerId,
          deliveryPartnerName: partnerName,
          status: "in-transit",
          updatedAt: new Date(),
        });
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  const deleteOrder = useCallback(
    async (
      orderId: string,
      orderData?: Partial<Order> & Record<string, any>,
    ): Promise<boolean> => {
      try {
        const orderPayload: Record<string, any> | undefined =
          orderData || (ordersRef.current || []).find((o) => o.id === orderId);
        if (!orderPayload) {
          const orderRef = doc(db, "orders", orderId);
          await deleteDoc(orderRef);
          return true;
        }

        const {
          status,
          customerId,
          balanceDue,
          items,
          itemId,
          quantity,
          deliveryPartnerId,
          shipmentCharge,
          loadingWorkerId,
          loadingCharge,
          unloadingWorkerId,
          unloadingCharge,
        } = orderPayload;

        if (status !== "cancelled") {
          // 1. Revert Customer balance (only if order was completed)
          if (status === "completed" && customerId && Number(balanceDue || 0) > 0) {
            try {
              await adjustEntityOrderBalance(
                db,
                customerId,
                -Number(balanceDue),
                orderPayload.customerType,
                {
                  createdAt: new Date(),
                },
              );
            } catch (cErr) {
              console.error("Error reverting entity balance on order delete:", cErr);
            }
          }

          // 2. Revert inventory stock
          try {
            const finalItems: Record<string, any>[] = items || [];
            if (finalItems.length > 0) {
              for (const itm of finalItems) {
                if (itm.itemId && Number(itm.quantity || 0) > 0) {
                  await adjustItemStockAndLog(
                    itm.itemId,
                    Number(itm.quantity),
                    "rollback",
                    `Order deleted: Order #${orderId.slice(-6).toUpperCase()}`,
                  );
                }
              }
            } else if (itemId && Number(quantity || 0) > 0) {
              await adjustItemStockAndLog(
                itemId,
                Number(quantity),
                "rollback",
                `Order deleted: Order #${orderId.slice(-6).toUpperCase()}`,
              );
            }
          } catch (sErr) {
            console.error("Error reverting item stock on order delete:", sErr);
          }

          // 3. Revert and delete associated delivery trips and partner totals (only if completed)
          try {
            const tripsCollection = collection(db, "deliveryTrips");
            const q = query(tripsCollection, where("orderId", "==", orderId));
            const querySnapshot = await getDocsOfflineSafe(q);

            for (const tripDoc of querySnapshot.docs) {
              const tripData = tripDoc.data();
              const pId = tripData.partnerId || deliveryPartnerId;
              const charge = roundCurrency(
                Number(tripData.deliveryCharge || tripData.amount || shipmentCharge || 0),
              );

              await deleteDoc(tripDoc.ref);

              if (status === "completed" && pId && charge > 0) {
                try {
                  const partnerRef = doc(db, "deliveryPartners", pId);
                  const partnerSnap = await getDoc(partnerRef);
                  if (partnerSnap.exists()) {
                    await updateDoc(partnerRef, {
                      totalPayable: increment(-charge),
                      totalPending: increment(-charge),
                      updatedAt: new Date(),
                    });
                  }
                } catch (pErr) {
                  console.error("Error updating partner totals on trip deletion:", pErr);
                }
              }
            }
          } catch (tripError) {
            console.error("Error deleting order delivery trips:", tripError);
          }

          // 4. Revert Loading & Unloading Worker wages
          if (loadingWorkerId && Number(loadingCharge) > 0) {
            try {
              const workerRef = doc(db, "workers", loadingWorkerId);
              const workerSnap = await getDoc(workerRef);
              if (workerSnap.exists()) {
                await updateDoc(workerRef, {
                  totalWages: increment(-roundCurrency(Number(loadingCharge))),
                  totalPending: increment(-roundCurrency(Number(loadingCharge))),
                  updatedAt: new Date(),
                });
              }
            } catch (e) {
              console.error("Error reverting loading worker wage:", e);
            }
          }
          if (unloadingWorkerId && Number(unloadingCharge) > 0) {
            try {
              const workerRef = doc(db, "workers", unloadingWorkerId);
              const workerSnap = await getDoc(workerRef);
              if (workerSnap.exists()) {
                await updateDoc(workerRef, {
                  totalWages: increment(-roundCurrency(Number(unloadingCharge))),
                  totalPending: increment(-roundCurrency(Number(unloadingCharge))),
                  updatedAt: new Date(),
                });
              }
            } catch (e) {
              console.error("Error reverting unloading worker wage:", e);
            }
          }
        }

        // 5. Delete the order document itself
        const orderRef = doc(db, "orders", orderId);
        await deleteDoc(orderRef);

        return true;
      } catch (error) {
        console.error("Error in deleteOrder:", error);
        try {
          const orderRef = doc(db, "orders", orderId);
          await deleteDoc(orderRef);
          return true;
        } catch (fallbackErr) {
          console.error("Fallback deleteDoc failed:", fallbackErr);
          return false;
        }
      }
    },
    [],
  );

  const editOrder = useCallback(
    async (
      orderId: string,
      newOrderData: Partial<Order> & Record<string, any>,
      oldOrderData: Partial<Order> & Record<string, any>,
    ): Promise<boolean> => {
      try {
        const oldStatus = oldOrderData.status;
        const newStatus = newOrderData.status || oldOrderData.status;

        const isOldCancelled = oldStatus === "cancelled";
        const isNewCancelled = newStatus === "cancelled";

        const oldItems: Record<string, any>[] = oldOrderData.items || [];
        const newItems: Record<string, any>[] = newOrderData.items || [];

        // 1. Calculate and update inventory stock differences
        if (isOldCancelled && !isNewCancelled) {
          if (newItems.length > 0) {
            for (const itm of newItems) {
              if (itm.itemId && Number(itm.quantity) > 0) {
                await adjustItemStockAndLog(
                  itm.itemId,
                  -Number(itm.quantity),
                  "sale",
                  `Order restored adjustment: Order #${orderId.slice(-6).toUpperCase()}`,
                );
              }
            }
          } else if (newOrderData.itemId && Number(newOrderData.quantity) > 0) {
            await adjustItemStockAndLog(
              newOrderData.itemId,
              -Number(newOrderData.quantity),
              "sale",
              `Order restored adjustment: Order #${orderId.slice(-6).toUpperCase()}`,
            );
          }
        } else if (!isOldCancelled && isNewCancelled) {
          if (oldItems.length > 0) {
            for (const itm of oldItems) {
              if (itm.itemId && Number(itm.quantity) > 0) {
                await adjustItemStockAndLog(
                  itm.itemId,
                  Number(itm.quantity),
                  "rollback",
                  `Order cancelled adjustment: Order #${orderId.slice(-6).toUpperCase()}`,
                );
              }
            }
          } else if (oldOrderData.itemId && Number(oldOrderData.quantity) > 0) {
            await adjustItemStockAndLog(
              oldOrderData.itemId,
              Number(oldOrderData.quantity),
              "rollback",
              `Order cancelled adjustment: Order #${orderId.slice(-6).toUpperCase()}`,
            );
          }
        } else if (!isOldCancelled && !isNewCancelled) {
          const stockChanges: Record<string, number> = {};
          if (oldItems.length > 0) {
            for (const itm of oldItems) {
              if (itm.itemId) {
                stockChanges[itm.itemId] =
                  (stockChanges[itm.itemId] || 0) + Number(itm.quantity || 0);
              }
            }
          } else if (oldOrderData.itemId) {
            stockChanges[oldOrderData.itemId] =
              (stockChanges[oldOrderData.itemId] || 0) +
              Number(oldOrderData.quantity || 0);
          }

          if (newItems.length > 0) {
            for (const itm of newItems) {
              if (itm.itemId) {
                stockChanges[itm.itemId] =
                  (stockChanges[itm.itemId] || 0) - Number(itm.quantity || 0);
              }
            }
          } else if (newOrderData.itemId) {
            stockChanges[newOrderData.itemId] =
              (stockChanges[newOrderData.itemId] || 0) -
              Number(newOrderData.quantity || 0);
          }

          for (const [itemIdKey, netChange] of Object.entries(stockChanges)) {
            const changeQty = Number(netChange);
            if (changeQty !== 0) {
              await adjustItemStockAndLog(
                itemIdKey,
                changeQty,
                changeQty > 0 ? "adjustment" : "sale",
                `Order edit adjustment: Order #${orderId.slice(-6).toUpperCase()}`,
              );
            }
          }
        }

        // 2. Customer balance adjustments (only applies when order status is completed)
        const oldCustId = oldOrderData.customerId;
        const newCustId = newOrderData.customerId;
        const oldBal =
          !isOldCancelled && oldOrderData.status === "completed"
            ? roundCurrency(Number(oldOrderData.balanceDue || 0))
            : 0;
        const newBal =
          !isNewCancelled && newOrderData.status === "completed"
            ? roundCurrency(Number(newOrderData.balanceDue || 0))
            : 0;

        if (oldCustId === newCustId) {
          if (oldCustId && oldBal !== newBal) {
            await adjustEntityOrderBalance(
              db,
              oldCustId,
              roundCurrency(newBal - oldBal),
              (newOrderData.customerType || oldOrderData.customerType) as string | undefined,
              { createdAt: new Date() },
            );
          }
        } else {
          if (oldCustId && oldBal > 0) {
            await adjustEntityOrderBalance(
              db,
              oldCustId,
              -oldBal,
              oldOrderData.customerType as string | undefined,
              { createdAt: new Date() },
            );
          }
          if (newCustId && newBal > 0) {
            await adjustEntityOrderBalance(
              db,
              newCustId,
              newBal,
              newOrderData.customerType as string | undefined,
              { createdAt: new Date() },
            );
          }
        }

        // 3. Delivery partner and trip adjustments
        const isOldCompleted = !isOldCancelled && oldOrderData.status === "completed";
        const isNewCompleted = !isNewCancelled && newOrderData.status === "completed";
        const oldPartnerId = isOldCompleted ? oldOrderData.deliveryPartnerId : null;
        const newPartnerId = isNewCompleted ? newOrderData.deliveryPartnerId : null;
        const oldTripComp = isOldCompleted
          ? getPartnerTripCompensation(oldOrderData)
          : { total: 0, base: 0, loading: 0, unloading: 0 };
        const newTripComp = isNewCompleted
          ? getPartnerTripCompensation(newOrderData)
          : { total: 0, base: 0, loading: 0, unloading: 0 };
        const oldShipment = oldTripComp.total;
        const newShipment = newTripComp.total;

        if (!isOldCompleted && isNewCompleted) {
          if (newPartnerId && newShipment > 0) {
            const newPartnerRef = doc(db, "deliveryPartners", newPartnerId);
            await updateDoc(newPartnerRef, {
              totalPayable: increment(newShipment),
              totalPending: increment(newShipment),
              updatedAt: new Date(),
            });

            await addDoc(collection(db, "deliveryTrips"), {
              partnerId: newPartnerId,
              customerName: newOrderData.customerName || "General Client",
              orderId,
              deliveryCharge: newShipment,
              baseDeliveryCharge: newTripComp.base,
              loadingCharge: newTripComp.loading,
              unloadingCharge: newTripComp.unloading,
              paymentStatus: "Pending",
              createdAt: new Date(),
            });
          }
        } else if (isOldCompleted && !isNewCompleted) {
          const tripsCollection = collection(db, "deliveryTrips");
          const q = query(tripsCollection, where("orderId", "==", orderId));
          const querySnapshot = await getDocsOfflineSafe(q);
          for (const tripDoc of querySnapshot.docs) {
            const tripData = tripDoc.data();
            const pId = tripData.partnerId || oldOrderData.deliveryPartnerId;
            const charge = roundCurrency(
              Number(tripData.deliveryCharge || tripData.amount || oldShipment || 0),
            );

            await deleteDoc(tripDoc.ref);

            if (pId && charge > 0) {
              try {
                const partnerRef = doc(db, "deliveryPartners", pId);
                await updateDoc(partnerRef, {
                  totalPayable: increment(-charge),
                  totalPending: increment(-charge),
                  updatedAt: new Date(),
                });
              } catch (pErr) {
                console.error(
                  "Error updating partner totals on order demotion edit:",
                  pErr,
                );
              }
            }
          }
        } else if (isOldCompleted && isNewCompleted) {
          if (oldPartnerId === newPartnerId) {
            if (oldPartnerId) {
              if (oldShipment !== newShipment) {
                const partnerRef = doc(db, "deliveryPartners", oldPartnerId);
                const diffShipment = roundCurrency(newShipment - oldShipment);
                await updateDoc(partnerRef, {
                  totalPayable: increment(diffShipment),
                  totalPending: increment(diffShipment),
                  updatedAt: new Date(),
                });

                const tripsCollection = collection(db, "deliveryTrips");
                const q = query(tripsCollection, where("orderId", "==", orderId));
                const querySnapshot = await getDocsOfflineSafe(q);
                if (!querySnapshot.empty) {
                  for (const tripDoc of querySnapshot.docs) {
                    await updateDoc(tripDoc.ref, {
                      deliveryCharge: newShipment,
                      baseDeliveryCharge: newTripComp.base,
                      loadingCharge: newTripComp.loading,
                      unloadingCharge: newTripComp.unloading,
                      customerName: newOrderData.customerName || "General Client",
                    });
                  }
                } else if (newShipment > 0) {
                  await addDoc(collection(db, "deliveryTrips"), {
                    partnerId: oldPartnerId,
                    customerName: newOrderData.customerName || "General Client",
                    orderId,
                    deliveryCharge: newShipment,
                    baseDeliveryCharge: newTripComp.base,
                    loadingCharge: newTripComp.loading,
                    unloadingCharge: newTripComp.unloading,
                    paymentStatus: "Pending",
                    createdAt: new Date(),
                  });
                }
              } else {
                const tripsCollection = collection(db, "deliveryTrips");
                const q = query(tripsCollection, where("orderId", "==", orderId));
                const querySnapshot = await getDocsOfflineSafe(q);
                for (const tripDoc of querySnapshot.docs) {
                  await updateDoc(tripDoc.ref, {
                    deliveryCharge: newShipment,
                    baseDeliveryCharge: newTripComp.base,
                    loadingCharge: newTripComp.loading,
                    unloadingCharge: newTripComp.unloading,
                    customerName: newOrderData.customerName || "General Client",
                  });
                }
              }
            }
          } else {
            if (oldPartnerId && oldShipment > 0) {
              const oldPartnerRef = doc(db, "deliveryPartners", oldPartnerId);
              await updateDoc(oldPartnerRef, {
                totalPayable: increment(-oldShipment),
                totalPending: increment(-oldShipment),
                updatedAt: new Date(),
              });

              const tripsCollection = collection(db, "deliveryTrips");
              const q = query(tripsCollection, where("orderId", "==", orderId));
              const querySnapshot = await getDocsOfflineSafe(q);
              for (const tripDoc of querySnapshot.docs) {
                await deleteDoc(tripDoc.ref);
              }
            }

            if (newPartnerId && newShipment > 0) {
              const newPartnerRef = doc(db, "deliveryPartners", newPartnerId);
              await updateDoc(newPartnerRef, {
                totalPayable: increment(newShipment),
                totalPending: increment(newShipment),
                updatedAt: new Date(),
              });

              await addDoc(collection(db, "deliveryTrips"), {
                partnerId: newPartnerId,
                customerName: newOrderData.customerName || "General Client",
                orderId,
                deliveryCharge: newShipment,
                baseDeliveryCharge: newTripComp.base,
                loadingCharge: newTripComp.loading,
                unloadingCharge: newTripComp.unloading,
                paymentStatus: "Pending",
                createdAt: new Date(),
              });
            }
          }
        }

        // 4. Loading & Unloading Worker wages adjustments
        const oldLoadingId = isOldCancelled ? null : oldOrderData.loadingWorkerId;
        const newLoadingId = isNewCancelled ? null : newOrderData.loadingWorkerId;
        const oldLoadingCharge = isOldCancelled
          ? 0
          : roundCurrency(Number(oldOrderData.loadingCharge || 0));
        const newLoadingCharge = isNewCancelled
          ? 0
          : roundCurrency(Number(newOrderData.loadingCharge || 0));

        if (oldLoadingId === newLoadingId) {
          if (oldLoadingId && oldLoadingCharge !== newLoadingCharge) {
            const workerRef = doc(db, "workers", oldLoadingId);
            const diffLoading = roundCurrency(newLoadingCharge - oldLoadingCharge);
            await updateDoc(workerRef, {
              totalWages: increment(diffLoading),
              totalPending: increment(diffLoading),
              updatedAt: new Date(),
            });
          }
        } else {
          if (oldLoadingId && oldLoadingCharge > 0) {
            const oldWorkerRef = doc(db, "workers", oldLoadingId);
            await updateDoc(oldWorkerRef, {
              totalWages: increment(-oldLoadingCharge),
              totalPending: increment(-oldLoadingCharge),
              updatedAt: new Date(),
            });
          }
          if (newLoadingId && newLoadingCharge > 0) {
            const newWorkerRef = doc(db, "workers", newLoadingId);
            await updateDoc(newWorkerRef, {
              totalWages: increment(newLoadingCharge),
              totalPending: increment(newLoadingCharge),
              updatedAt: new Date(),
            });
          }
        }

        const oldUnloadingId = isOldCancelled ? null : oldOrderData.unloadingWorkerId;
        const newUnloadingId = isNewCancelled ? null : newOrderData.unloadingWorkerId;
        const oldUnloadingCharge = isOldCancelled
          ? 0
          : roundCurrency(Number(oldOrderData.unloadingCharge || 0));
        const newUnloadingCharge = isNewCancelled
          ? 0
          : roundCurrency(Number(newOrderData.unloadingCharge || 0));

        if (oldUnloadingId === newUnloadingId) {
          if (oldUnloadingId && oldUnloadingCharge !== newUnloadingCharge) {
            const workerRef = doc(db, "workers", oldUnloadingId);
            const diffUnloading = roundCurrency(newUnloadingCharge - oldUnloadingCharge);
            await updateDoc(workerRef, {
              totalWages: increment(diffUnloading),
              totalPending: increment(diffUnloading),
              updatedAt: new Date(),
            });
          }
        } else {
          if (oldUnloadingId && oldUnloadingCharge > 0) {
            const oldWorkerRef = doc(db, "workers", oldUnloadingId);
            await updateDoc(oldWorkerRef, {
              totalWages: increment(-oldUnloadingCharge),
              totalPending: increment(-oldUnloadingCharge),
              updatedAt: new Date(),
            });
          }
          if (newUnloadingId && newUnloadingCharge > 0) {
            const newWorkerRef = doc(db, "workers", newUnloadingId);
            await updateDoc(newWorkerRef, {
              totalWages: increment(newUnloadingCharge),
              totalPending: increment(newUnloadingCharge),
              updatedAt: new Date(),
            });
          }
        }

        // Calculate aggregated fields for backward compatibility
        const hasMultipleItems = newItems.length > 0;
        const finalItemId = hasMultipleItems
          ? newItems[0].itemId
          : newOrderData.itemId || null;
        const finalItemName = hasMultipleItems
          ? newItems.length === 1
            ? newItems[0].itemName
            : `${newItems[0].itemName} (+${newItems.length - 1} more)`
          : newOrderData.itemName || "";
        const finalQuantity = hasMultipleItems
          ? newItems.reduce((sum, itm) => sum + Number(itm.quantity || 0), 0)
          : Number(newOrderData.quantity || 0);
        const finalRateType = hasMultipleItems
          ? newItems[0].rateType || "piece"
          : newOrderData.rateType || "piece";
        const finalRate = hasMultipleItems
          ? Number(newItems[0].rate || 0)
          : Number(newOrderData.rate || 0);

        // 5. Update the order document
        const orderRef = doc(db, "orders", orderId);
        const orderPayload: Record<string, any> = {
          customerId: newOrderData.customerId,
          customerName: newOrderData.customerName,
          itemId: finalItemId,
          itemName: finalItemName,
          quantity: finalQuantity,
          rateType: finalRateType,
          rate: finalRate,
          grossTotal: roundCurrency(
            Number(newOrderData.grossTotal || newOrderData.total || 0),
          ),
          shipmentCharge: roundCurrency(Number(newOrderData.shipmentCharge || 0)),
          shipmentDistance: Number(newOrderData.shipmentDistance || 0),
          deliveryRateType: newOrderData.deliveryRateType || "fixed amount",
          deliveryRate: Number(
            newOrderData.deliveryRate !== undefined ? newOrderData.deliveryRate : 0,
          ),
          deliveryMinRate: Number(
            newOrderData.deliveryMinRate !== undefined ? newOrderData.deliveryMinRate : 0,
          ),
          extraAmount: roundCurrency(Number(newOrderData.extraAmount || 0)),
          extraAmountDescription: newOrderData.extraAmountDescription || "",
          description:
            newOrderData.notes !== undefined
              ? String(newOrderData.notes).trim()
              : newOrderData.description !== undefined
                ? String(newOrderData.description).trim()
                : oldOrderData.description || "",
          notes:
            newOrderData.notes !== undefined
              ? String(newOrderData.notes).trim()
              : newOrderData.description !== undefined
                ? String(newOrderData.description).trim()
                : oldOrderData.notes || "",
          discount: roundCurrency(
            Number(
              newOrderData.discount !== undefined
                ? newOrderData.discount
                : oldOrderData.discount || 0,
            ),
          ),
          discountType:
            newOrderData.discountType || oldOrderData.discountType || "amount",
          discountAmount: roundCurrency(
            Number(
              newOrderData.discountAmount !== undefined
                ? newOrderData.discountAmount
                : oldOrderData.discountAmount || 0,
            ),
          ),
          total: roundCurrency(Number(newOrderData.total || 0)),
          paidAmount: roundCurrency(Number(newOrderData.paidAmount || 0)),
          amountPaid: roundCurrency(Number(newOrderData.paidAmount || 0)),
          advancePaid: roundCurrency(Number(newOrderData.paidAmount || 0)),
          paymentMethod:
            newOrderData.paymentMethod || oldOrderData.paymentMethod || "Cash",
          paymentMode:
            newOrderData.paymentMode ||
            newOrderData.paymentMethod ||
            oldOrderData.paymentMode ||
            "Cash",
          paymentType:
            newOrderData.paymentType ||
            newOrderData.paymentMethod ||
            oldOrderData.paymentType ||
            "Cash",
          balanceDue: roundCurrency(Number(newOrderData.balanceDue || 0)),
          paymentStatus:
            Number(newOrderData.paidAmount || 0) >= Number(newOrderData.total || 0) &&
              Number(newOrderData.total || 0) > 0
              ? "PAID"
              : Number(newOrderData.paidAmount || 0) > 0
                ? "PARTIAL"
                : "PENDING",
          status: newOrderData.status || oldOrderData.status,
          deliveryPartnerId: newOrderData.deliveryPartnerId || null,
          deliveryPartnerName:
            newOrderData.deliveryPartnerName !== undefined
              ? newOrderData.deliveryPartnerName
              : oldOrderData.deliveryPartnerName || null,
          collectorId:
            newOrderData.collectorId !== undefined
              ? newOrderData.collectorId
              : oldOrderData.collectorId || null,
          collectorName:
            newOrderData.collectorName !== undefined
              ? newOrderData.collectorName
              : oldOrderData.collectorName || null,
          loadingWorkerId:
            newOrderData.loadingWorkerId !== undefined
              ? newOrderData.loadingWorkerId
              : oldOrderData.loadingWorkerId || null,
          loadingWorkerName:
            newOrderData.loadingWorkerName !== undefined
              ? newOrderData.loadingWorkerName
              : oldOrderData.loadingWorkerName || null,
          loadingCharge: roundCurrency(
            newOrderData.loadingCharge !== undefined
              ? Number(newOrderData.loadingCharge)
              : Number(oldOrderData.loadingCharge || 0),
          ),
          unloadingWorkerId:
            newOrderData.unloadingWorkerId !== undefined
              ? newOrderData.unloadingWorkerId
              : oldOrderData.unloadingWorkerId || null,
          unloadingWorkerName:
            newOrderData.unloadingWorkerName !== undefined
              ? newOrderData.unloadingWorkerName
              : oldOrderData.unloadingWorkerName || null,
          unloadingCharge: roundCurrency(
            newOrderData.unloadingCharge !== undefined
              ? Number(newOrderData.unloadingCharge)
              : Number(oldOrderData.unloadingCharge || 0),
          ),
          items: newItems,
          deliveredQuantity:
            newOrderData.deliveredQuantity !== undefined
              ? Number(newOrderData.deliveredQuantity)
              : Number(oldOrderData.deliveredQuantity || 0),
          deliveries: newOrderData.deliveries || oldOrderData.deliveries || [],
          completedAt:
            newOrderData.status === "completed" ||
              (newOrderData.deliveredQuantity !== undefined &&
                Number(newOrderData.deliveredQuantity) >=
                Number(newOrderData.quantity || 0) &&
                Number(newOrderData.quantity || 0) > 0)
              ? oldOrderData.completedAt || new Date()
              : null,
          createdAt: newOrderData.createdAt
            ? normalizeDateValue(newOrderData.createdAt)
            : oldOrderData.orderedDate
              ? normalizeDateValue(oldOrderData.orderedDate)
              : oldOrderData.createdAt
                ? normalizeDateValue(oldOrderData.createdAt)
                : new Date(),
          orderedDate: newOrderData.orderedDate
            ? normalizeDateValue(newOrderData.orderedDate)
            : oldOrderData.orderedDate
              ? normalizeDateValue(oldOrderData.orderedDate)
              : oldOrderData.createdAt
                ? normalizeDateValue(oldOrderData.createdAt)
                : new Date(),
          updatedAt: new Date(),
        };

        await updateDoc(orderRef, orderPayload);
        setOrders((prev) =>
          prev.map((o) =>
            o.id === orderId ? ({ ...o, ...orderPayload, id: orderId } as Order) : o,
          ),
        );
        return true;
      } catch (error) {
        console.error("Error in editOrder:", error);
        return false;
      }
    },
    [],
  );

  const { todaySales, todayOrdersCount } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();

    let sales = 0;
    let count = 0;

    for (let i = 0; i < (orders || []).length; i++) {
      const o = orders[i];
      const createdDate =
        o.createdAt instanceof Date
          ? o.createdAt
          : normalizeDateValue(o.createdAt || Date.now());
      if (createdDate.getTime() >= todayTime) {
        count++;
      }

      const orderItems = Array.isArray(o.items) && o.items.length > 0 ? o.items : [];
      const totalQty =
        orderItems.length > 0
          ? orderItems.reduce((acc, itm) => acc + Number(itm.quantity || 0), 0)
          : Number(o.quantity || 0);
      const deliveredQty = Number(o.deliveredQuantity || 0);
      const isCancelled = o.status === "cancelled";
      const isFullyCompleted =
        !isCancelled &&
        (o.status === "completed" || (totalQty > 0 && deliveredQty >= totalQty));

      if (isFullyCompleted) {
        let completedTimeVal: unknown = o.createdAt;
        if (Array.isArray(o.deliveries) && o.deliveries.length > 0) {
          const lastDel = o.deliveries[o.deliveries.length - 1];
          if (lastDel && lastDel.date) {
            completedTimeVal = lastDel.date;
          }
        } else if (o.updatedAt) {
          completedTimeVal = o.updatedAt;
        }

        const compDate =
          completedTimeVal instanceof Date
            ? new Date(completedTimeVal)
            : normalizeDateValue(completedTimeVal);
        compDate.setHours(0, 0, 0, 0);

        if (compDate.getTime() === todayTime) {
          sales += Number(o.total || 0);
        }
      }
    }

    return { todaySales: roundCurrency(sales), todayOrdersCount: count };
  }, [orders]);

  const contextValue = useMemo<OrderContextType>(
    () => ({
      orders,
      loading,
      addOrder,
      editOrder,
      deleteOrder,
      updateOrderStatus,
      assignDeliveryPartner,
      todaySales,
      todayOrdersCount,
    }),
    [
      orders,
      loading,
      todaySales,
      todayOrdersCount,
      addOrder,
      editOrder,
      deleteOrder,
      updateOrderStatus,
      assignDeliveryPartner,
    ],
  );

  return (
    <OrderContext.Provider value={contextValue}>
      {children}
    </OrderContext.Provider>
  );
}

export default function OrderRoutePlaceholder() {
  return null;
}

