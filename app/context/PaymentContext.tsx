import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  writeBatch,
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
import type { PaymentRecord } from "../../src/types/models";
import { roundCurrency } from "../../utils/currency";

export interface PaymentContextType {
  payments: PaymentRecord[];
  loading: boolean;
  addPayment: (paymentData: Partial<PaymentRecord> & Record<string, any>) => Promise<string | null>;
  refundCustomerAdvance: (
    refundData: Partial<PaymentRecord> & Record<string, any>,
  ) => Promise<string | null>;
  editPayment: (
    paymentId: string,
    updatedData: Partial<PaymentRecord> & Record<string, any>,
    oldData: Partial<PaymentRecord> & Record<string, any>,
  ) => Promise<boolean>;
  deletePayment: (paymentId: string) => Promise<boolean>;
}

export const PaymentContext = createContext<PaymentContextType>({
  payments: [],
  loading: true,
  addPayment: async () => null,
  refundCustomerAdvance: async () => null,
  editPayment: async () => false,
  deletePayment: async () => false,
});

function isDateOnly(d: Date): boolean {
  if (!d || isNaN(d.getTime())) return true;
  const isLocalMidnight =
    d.getHours() === 0 &&
    d.getMinutes() === 0 &&
    d.getSeconds() === 0 &&
    d.getMilliseconds() === 0;
  const isUtcMidnight =
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0;
  const isIstUtcMidnight =
    d.getHours() === 5 &&
    d.getMinutes() === 30 &&
    d.getSeconds() === 0 &&
    d.getMilliseconds() === 0;
  return isLocalMidnight || isUtcMidnight || isIstUtcMidnight;
}

export function PaymentProvider({ children }: { children: ReactNode }) {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const isInitialLoadRef = useRef<boolean>(false);

  useEffect(() => {
    setLoading(true);
    isInitialLoadRef.current = true;
    const paymentsCollection = collection(db, "payments");
    const q = query(paymentsCollection, orderBy("createdAt", "desc"));

    const normalizePaymentDoc = (docSnapshot: QueryDocumentSnapshot): PaymentRecord => {
      const data = docSnapshot.data();
      const amt =
        data.amountReceived !== undefined
          ? Number(data.amountReceived)
          : Number(data.amount || 0);
      const rawDate =
        data.createdAt ||
        data.paymentDate ||
        data.date ||
        data.timestamp ||
        data.updatedAt;
      return {
        id: docSnapshot.id,
        ...data,
        amount: amt,
        amountReceived: amt,
        createdAt: normalizeDateValue(rawDate),
      } as PaymentRecord;
    };

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (isInitialLoadRef.current) {
          const dbPayments = snapshot.docs.map(normalizePaymentDoc);
          setPayments(dbPayments);
          isInitialLoadRef.current = false;
        } else {
          const changes = snapshot.docChanges();
          if (changes.length > 0) {
            setPayments((prev) => {
              const updated = [...prev];
              for (const change of changes) {
                const paymentData = normalizePaymentDoc(change.doc);
                if (change.type === "added") {
                  const existIdx = updated.findIndex((p) => p.id === paymentData.id);
                  if (existIdx === -1) {
                    updated.unshift(paymentData);
                  } else {
                    updated[existIdx] = paymentData;
                  }
                } else if (change.type === "modified") {
                  const idx = updated.findIndex((p) => p.id === paymentData.id);
                  if (idx !== -1) {
                    updated[idx] = paymentData;
                  }
                } else if (change.type === "removed") {
                  const idx = updated.findIndex((p) => p.id === paymentData.id);
                  if (idx !== -1) {
                    updated.splice(idx, 1);
                  }
                }
              }
              return updated;
            });
          }
        }
        setLoading(false);
      },
      () => {
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  const addPayment = useCallback(
    async (
      paymentData: Partial<PaymentRecord> & Record<string, any>,
    ): Promise<string | null> => {
      try {
        const {
          customerId,
          customerName,
          amountReceived,
          discountAmount,
          paymentMethod,
          notes,
        } = paymentData;

        if (!customerId || typeof customerId !== "string") {
          throw new Error("Customer ID is required.");
        }

        // Read customer doc (serves from cache when offline)
        const customerRef = doc(db, "customers", customerId);
        const customerDoc = await getDoc(customerRef);
        if (!customerDoc.exists()) {
          throw new Error("Customer record does not exist.");
        }

        const customerData = customerDoc.data();
        const pendingBefore = roundCurrency(
          Number(
            customerData.totalPending !== undefined
              ? customerData.totalPending
              : customerData.balance || 0,
          ),
        );
        const totalPaidBefore = roundCurrency(Number(customerData.totalPaid || 0));

        const amtRec = roundCurrency(Number(amountReceived || 0));
        const discAmt = roundCurrency(Number(discountAmount || 0));
        const totalBalanceReduction = roundCurrency(amtRec + discAmt);

        const pendingAfter = roundCurrency(pendingBefore - totalBalanceReduction);
        const totalPaidAfter = roundCurrency(totalPaidBefore + amtRec);
        const advanceAmount = pendingAfter < 0 ? roundCurrency(Math.abs(pendingAfter)) : 0;

        // Batch write (queued offline, synced when back online)
        const batch = writeBatch(db);

        const paymentColRef = collection(db, "payments");
        const paymentDocRef = doc(paymentColRef);
        const paymentId = paymentDocRef.id;

        batch.update(customerRef, {
          balance: pendingAfter,
          totalPending: pendingAfter,
          advanceAmount,
          totalPaid: totalPaidAfter,
          lastTransactionDate: new Date(),
        });

        let paymentDate = normalizeDateValue(
          paymentData.createdAt ||
            paymentData.paymentDate ||
            paymentData.date ||
            paymentData.timestamp,
        );
        if (isDateOnly(paymentDate)) {
          const now = new Date();
          paymentDate = new Date(paymentDate);
          paymentDate.setHours(
            now.getHours(),
            now.getMinutes(),
            now.getSeconds(),
            now.getMilliseconds(),
          );
        }

        batch.set(paymentDocRef, {
          customerId,
          customerName,
          pendingBefore,
          amountReceived: amtRec,
          discountAmount: discAmt,
          pendingAfter,
          advanceAmount,
          paymentMethod: paymentMethod || "Cash",
          notes: notes || "",
          createdAt: paymentDate,
          date: paymentDate,
          paymentDate,
          collectorId: customerData.collectorId || null,
          collectorName: customerData.collectorName || null,
        });

        await batch.commit();
        return paymentId;
      } catch {
        return null;
      }
    },
    [],
  );

  const deletePayment = useCallback(async (paymentId: string): Promise<boolean> => {
    try {
      // Read payment doc (serves from cache when offline)
      const paymentRef = doc(db, "payments", paymentId);
      const paymentDoc = await getDoc(paymentRef);
      if (!paymentDoc.exists()) {
        throw new Error("Payment record does not exist.");
      }

      const paymentData = paymentDoc.data();
      const { customerId, amountReceived, discountAmount, orderId } = paymentData;
      const amtRec = roundCurrency(Number(amountReceived || 0));
      const discAmt = roundCurrency(Number(discountAmount || 0));
      const totalBalanceReduction = roundCurrency(amtRec + discAmt);

      const batch = writeBatch(db);

      // Reverse customer balance ONLY for direct payments (no orderId).
      // Order payments created via Order page Pay button use addDoc directly
      // and never modified the customer balance, so we must not reverse it.
      if (!orderId && customerId && typeof customerId === "string" && customerId.trim() !== "") {
        const customerRef = doc(db, "customers", customerId);
        const customerDoc = await getDoc(customerRef);
        if (customerDoc.exists()) {
          const customerData = customerDoc.data();
          const pendingBefore = roundCurrency(
            Number(
              customerData.totalPending !== undefined
                ? customerData.totalPending
                : customerData.balance || 0,
            ),
          );
          const totalPaidBefore = roundCurrency(Number(customerData.totalPaid || 0));

          let pendingAfter: number;
          let totalPaidAfter: number;
          if (paymentData.type === "advance_refund") {
            const refundAmt = roundCurrency(
              Number(paymentData.refundAmount || Math.abs(paymentData.amountReceived || 0)),
            );
            pendingAfter = roundCurrency(pendingBefore - refundAmt);
            totalPaidAfter = roundCurrency(totalPaidBefore + refundAmt);
          } else {
            pendingAfter = roundCurrency(pendingBefore + totalBalanceReduction);
            totalPaidAfter = Math.max(0, roundCurrency(totalPaidBefore - amtRec));
          }
          const advanceAmount = pendingAfter < 0 ? roundCurrency(Math.abs(pendingAfter)) : 0;

          batch.update(customerRef, {
            balance: pendingAfter,
            totalPending: pendingAfter,
            advanceAmount,
            totalPaid: totalPaidAfter,
            lastTransactionDate: new Date(),
          });
        }
      }

      batch.delete(paymentRef);
      await batch.commit();

      return true;
    } catch (error) {
      console.error("deletePayment error:", error);
      return false;
    }
  }, []);

  const refundCustomerAdvance = useCallback(
    async (
      refundData: Partial<PaymentRecord> & Record<string, any>,
    ): Promise<string | null> => {
      try {
        const {
          customerId,
          customerName,
          refundAmount,
          paymentMethod,
          notes,
          createdAt,
        } = refundData;
        if (!customerId || typeof customerId !== "string") {
          throw new Error("Customer ID is required.");
        }

        const customerRef = doc(db, "customers", customerId);
        const customerDoc = await getDoc(customerRef);
        if (!customerDoc.exists()) {
          throw new Error("Customer record does not exist.");
        }

        const customerData = customerDoc.data();
        const pendingBefore = roundCurrency(
          Number(
            customerData.totalPending !== undefined
              ? customerData.totalPending
              : customerData.balance || 0,
          ),
        );
        const availableAdvance = roundCurrency(Math.abs(Math.min(0, pendingBefore)));
        const refundAmt = roundCurrency(Number(refundAmount || 0));

        if (refundAmt <= 0) {
          throw new Error("Refund amount must be greater than zero.");
        }
        if (refundAmt > availableAdvance) {
          throw new Error(
            `Refund cannot exceed available advance of ₹${availableAdvance.toLocaleString("en-IN")}.`,
          );
        }

        const pendingAfter = roundCurrency(pendingBefore + refundAmt);
        const advanceAmount = pendingAfter < 0 ? roundCurrency(Math.abs(pendingAfter)) : 0;
        const totalPaidBefore = roundCurrency(Number(customerData.totalPaid || 0));
        const totalPaidAfter = Math.max(0, roundCurrency(totalPaidBefore - refundAmt));

        const batch = writeBatch(db);

        batch.update(customerRef, {
          balance: pendingAfter,
          totalPending: pendingAfter,
          advanceAmount,
          totalPaid: totalPaidAfter,
          lastTransactionDate: new Date(),
        });

        const paymentColRef = collection(db, "payments");
        const paymentDocRef = doc(paymentColRef);
        const paymentId = paymentDocRef.id;

        let refundDate = normalizeDateValue(createdAt);
        if (!refundDate || isNaN(refundDate.getTime())) refundDate = new Date();

        batch.set(paymentDocRef, {
          customerId,
          customerName: customerName || customerData.name || "Customer",
          type: "advance_refund",
          amountReceived: -refundAmt,
          refundAmount: refundAmt,
          discountAmount: 0,
          pendingBefore,
          pendingAfter,
          advanceAmount,
          paymentMethod: paymentMethod || "Cash",
          notes: notes ? String(notes).trim() : "Advance Refund returned to customer",
          createdAt: refundDate,
          date: refundDate,
          paymentDate: refundDate,
          collectorId: customerData.collectorId || null,
          collectorName: customerData.collectorName || null,
        });

        await batch.commit();
        return paymentId;
      } catch (error) {
        console.error("refundCustomerAdvance error:", error);
        return null;
      }
    },
    [],
  );

  const editPayment = useCallback(
    async (
      paymentId: string,
      updatedData: Partial<PaymentRecord> & Record<string, any>,
      oldData: Partial<PaymentRecord> & Record<string, any>,
    ): Promise<boolean> => {
      try {
        const paymentRef = doc(db, "payments", paymentId);
        const {
          amountReceived: newAmount,
          discountAmount: newDiscount,
          paymentMethod,
          notes,
          createdAt,
        } = updatedData;
        const oldAmount = Number(oldData.amountReceived || 0);
        const oldDiscount = Number(oldData.discountAmount || 0);
        const customerId = oldData.customerId || updatedData.customerId;

        const batch = writeBatch(db);
        let finalPendingAfter: number | null = null;
        let finalAdvanceAmount: number | null = null;

        // Read customer doc (serves from cache when offline)
        if (customerId && typeof customerId === "string" && customerId.trim() !== "") {
          const customerRef = doc(db, "customers", customerId);
          const customerDoc = await getDoc(customerRef);
          if (customerDoc.exists()) {
            const customerData = customerDoc.data();
            const pendingBefore = roundCurrency(
              Number(
                customerData.totalPending !== undefined
                  ? customerData.totalPending
                  : customerData.balance || 0,
              ),
            );
            const totalPaidBefore = roundCurrency(Number(customerData.totalPaid || 0));

            const oldTotalRed = roundCurrency(Number(oldAmount) + Number(oldDiscount));
            const newTotalRed = roundCurrency(
              Number(newAmount || 0) + Number(newDiscount || 0),
            );
            const diffPending = roundCurrency(newTotalRed - oldTotalRed);

            const pendingAfter = roundCurrency(pendingBefore - diffPending);
            const diffPaid = roundCurrency(Number(newAmount || 0) - Number(oldAmount));
            const totalPaidAfter = Math.max(0, roundCurrency(totalPaidBefore + diffPaid));
            const advanceAmount = pendingAfter < 0 ? roundCurrency(Math.abs(pendingAfter)) : 0;
            finalPendingAfter = pendingAfter;
            finalAdvanceAmount = advanceAmount;

            batch.update(customerRef, {
              balance: pendingAfter,
              totalPending: pendingAfter,
              advanceAmount,
              totalPaid: totalPaidAfter,
              lastTransactionDate: new Date(),
            });
          }
        }

        let editPayDate = normalizeDateValue(
          createdAt ||
            updatedData.paymentDate ||
            updatedData.date ||
            updatedData.timestamp,
        );
        if (isDateOnly(editPayDate)) {
          const oldCreated = oldData?.createdAt
            ? normalizeDateValue(
                oldData.createdAt ||
                  oldData.paymentDate ||
                  oldData.date ||
                  oldData.timestamp,
              )
            : null;
          if (oldCreated && !isDateOnly(oldCreated)) {
            editPayDate = new Date(editPayDate);
            editPayDate.setHours(
              oldCreated.getHours(),
              oldCreated.getMinutes(),
              oldCreated.getSeconds(),
              oldCreated.getMilliseconds(),
            );
          } else {
            const now = new Date();
            editPayDate = new Date(editPayDate);
            editPayDate.setHours(
              now.getHours(),
              now.getMinutes(),
              now.getSeconds(),
              now.getMilliseconds(),
            );
          }
        }

        const paymentUpdateData: Record<string, any> = {
          amountReceived: roundCurrency(Number(newAmount || 0)),
          discountAmount: roundCurrency(Number(newDiscount || 0)),
          paymentMethod: paymentMethod || "Cash",
          notes: notes || "",
          createdAt: editPayDate,
          date: editPayDate,
          paymentDate: editPayDate,
          collectorId:
            updatedData.collectorId !== undefined
              ? updatedData.collectorId
              : oldData.collectorId || null,
          collectorName:
            updatedData.collectorName !== undefined
              ? updatedData.collectorName
              : oldData.collectorName || null,
        };
        if (finalPendingAfter !== null) {
          paymentUpdateData.pendingAfter = finalPendingAfter;
          paymentUpdateData.advanceAmount = finalAdvanceAmount;
        }

        batch.update(paymentRef, paymentUpdateData);

        await batch.commit();

        setPayments((prev) =>
          prev.map((p) =>
            p.id === paymentId ? { ...p, ...paymentUpdateData, id: paymentId } : p,
          ),
        );

        return true;
      } catch (error) {
        console.error("editPayment error:", error);
        return false;
      }
    },
    [],
  );

  const contextValue = useMemo<PaymentContextType>(
    () => ({
      payments,
      loading,
      addPayment,
      refundCustomerAdvance,
      editPayment,
      deletePayment,
    }),
    [payments, loading, addPayment, refundCustomerAdvance, editPayment, deletePayment],
  );

  return (
    <PaymentContext.Provider value={contextValue}>
      {children}
    </PaymentContext.Provider>
  );
}

export default function PaymentRoutePlaceholder() {
  return null;
}

