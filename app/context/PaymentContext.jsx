import {
    collection,
    deleteDoc,
    doc,
    getDoc,
    onSnapshot,
    orderBy,
    query,
    updateDoc,
    writeBatch,
} from "firebase/firestore";
import { createContext, useEffect, useState, useMemo } from "react";
import { db, normalizeDateValue } from "../../src/config/firebase";

export const PaymentContext = createContext(null);

export function PaymentProvider({ children }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const paymentsCollection = collection(db, "payments");
    const q = query(paymentsCollection, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const dbPayments = snapshot.docs.map((doc) => {
          const data = doc.data();
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
            id: doc.id,
            ...data,
            amount: amt,
            amountReceived: amt,
            createdAt: normalizeDateValue(rawDate),
          };
        });
        setPayments(dbPayments);
        setLoading(false);
      },
      (error) => {
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  const addPayment = async (paymentData) => {
    try {
      const { customerId, customerName, amountReceived, discountAmount, paymentMethod, notes } =
        paymentData;

      // Read customer doc (serves from cache when offline)
      const customerRef = doc(db, "customers", customerId);
      const customerDoc = await getDoc(customerRef);
      if (!customerDoc.exists()) {
        throw new Error("Customer record does not exist.");
      }

      const customerData = customerDoc.data();
      const pendingBefore = Number(
        customerData.totalPending !== undefined
          ? customerData.totalPending
          : customerData.balance || 0,
      );
      const totalPaidBefore = Number(customerData.totalPaid || 0);

      const amtRec = Number(amountReceived || 0);
      const discAmt = Number(discountAmount || 0);
      const totalBalanceReduction = amtRec + discAmt;

      const pendingAfter = pendingBefore - totalBalanceReduction;
      const totalPaidAfter = totalPaidBefore + amtRec;

      // Batch write (queued offline, synced when back online)
      const batch = writeBatch(db);

      const paymentColRef = collection(db, "payments");
      const paymentDocRef = doc(paymentColRef);
      const paymentId = paymentDocRef.id;

      batch.update(customerRef, {
        balance: pendingAfter,
        totalPending: pendingAfter,
        totalPaid: totalPaidAfter,
        lastTransactionDate: new Date(),
      });

      let paymentDate = normalizeDateValue(
        paymentData.createdAt ||
          paymentData.paymentDate ||
          paymentData.date ||
          paymentData.timestamp,
      );
      const isDateOnly = (d) => {
        if (!d || isNaN(d.getTime())) return true;
        const isLocalMidnight = d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0;
        const isUtcMidnight = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
        const isIstUtcMidnight = d.getHours() === 5 && d.getMinutes() === 30 && d.getSeconds() === 0 && d.getMilliseconds() === 0;
        return isLocalMidnight || isUtcMidnight || isIstUtcMidnight;
      };
      if (isDateOnly(paymentDate)) {
        const now = new Date();
        paymentDate = new Date(paymentDate);
        paymentDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
      }

      batch.set(paymentDocRef, {
        customerId,
        customerName,
        pendingBefore,
        amountReceived: amtRec,
        discountAmount: discAmt,
        pendingAfter,
        paymentMethod: paymentMethod || "Cash",
        notes: notes || "",
        createdAt: paymentDate,
        date: paymentDate,
        paymentDate: paymentDate,
        collectorId: customerData.collectorId || null,
        collectorName: customerData.collectorName || null,
      });

      await batch.commit();
      return paymentId;
    } catch (error) {
      return null;
    }
  };

  const deletePayment = async (paymentId) => {
    try {
      // Read payment doc (serves from cache when offline)
      const paymentRef = doc(db, "payments", paymentId);
      const paymentDoc = await getDoc(paymentRef);
      if (!paymentDoc.exists()) {
        throw new Error("Payment record does not exist.");
      }

      const paymentData = paymentDoc.data();
      const { customerId, amountReceived, discountAmount, orderId } = paymentData;
      const amtRec = Number(amountReceived || 0);
      const discAmt = Number(discountAmount || 0);
      const totalBalanceReduction = amtRec + discAmt;

      const batch = writeBatch(db);

      // Reverse customer balance ONLY for direct payments (no orderId).
      // Order payments created via Order page Pay button use addDoc directly
      // and never modified the customer balance, so we must not reverse it.
      if (!orderId && customerId && typeof customerId === "string" && customerId.trim() !== "") {
        const customerRef = doc(db, "customers", customerId);
        const customerDoc = await getDoc(customerRef);
        if (customerDoc.exists()) {
          const customerData = customerDoc.data();
          const pendingBefore = Number(
            customerData.totalPending !== undefined
              ? customerData.totalPending
              : customerData.balance || 0,
          );
          const totalPaidBefore = Number(customerData.totalPaid || 0);

          const pendingAfter = pendingBefore + totalBalanceReduction;
          const totalPaidAfter = Math.max(0, totalPaidBefore - amtRec);

          batch.update(customerRef, {
            balance: pendingAfter,
            totalPending: pendingAfter,
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
  };

  const editPayment = async (paymentId, updatedData, oldData) => {
    try {
      const paymentRef = doc(db, "payments", paymentId);
      const { amountReceived: newAmount, discountAmount: newDiscount, paymentMethod, notes, createdAt } = updatedData;
      const oldAmount = oldData.amountReceived || 0;
      const oldDiscount = oldData.discountAmount || 0;
      const customerId = oldData.customerId || updatedData.customerId;

      const batch = writeBatch(db);

      // Read customer doc (serves from cache when offline)
      if (customerId && typeof customerId === "string" && customerId.trim() !== "") {
        const customerRef = doc(db, "customers", customerId);
        const customerDoc = await getDoc(customerRef);
        if (customerDoc.exists()) {
          const customerData = customerDoc.data();
          const pendingBefore = Number(
            customerData.totalPending !== undefined
              ? customerData.totalPending
              : customerData.balance || 0,
          );
          const totalPaidBefore = Number(customerData.totalPaid || 0);

          const oldTotalRed = Number(oldAmount) + Number(oldDiscount);
          const newTotalRed = Number(newAmount || 0) + Number(newDiscount || 0);
          const diffPending = newTotalRed - oldTotalRed;

          const pendingAfter = pendingBefore - diffPending;
          const diffPaid = Number(newAmount || 0) - Number(oldAmount);
          const totalPaidAfter = Math.max(0, totalPaidBefore + diffPaid);

          batch.update(customerRef, {
            balance: pendingAfter,
            totalPending: pendingAfter,
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
      const isDateOnly = (d) => {
        if (!d || isNaN(d.getTime())) return true;
        const isLocalMidnight = d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0;
        const isUtcMidnight = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
        const isIstUtcMidnight = d.getHours() === 5 && d.getMinutes() === 30 && d.getSeconds() === 0 && d.getMilliseconds() === 0;
        return isLocalMidnight || isUtcMidnight || isIstUtcMidnight;
      };
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
          editPayDate.setHours(oldCreated.getHours(), oldCreated.getMinutes(), oldCreated.getSeconds(), oldCreated.getMilliseconds());
        } else {
          const now = new Date();
          editPayDate = new Date(editPayDate);
          editPayDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
        }
      }

      batch.update(paymentRef, {
        amountReceived: Number(newAmount || 0),
        discountAmount: Number(newDiscount || 0),
        paymentMethod: paymentMethod || "Cash",
        notes: notes || "",
        createdAt: editPayDate,
        date: editPayDate,
        paymentDate: editPayDate,
        collectorId: updatedData.collectorId !== undefined ? updatedData.collectorId : (oldData.collectorId || null),
        collectorName: updatedData.collectorName !== undefined ? updatedData.collectorName : (oldData.collectorName || null),
      });

      await batch.commit();
      return true;
    } catch (error) {
      console.error("editPayment error:", error);
      return false;
    }
  };

  const contextValue = useMemo(
    () => ({
      payments,
      loading,
      addPayment,
      editPayment,
      deletePayment,
    }),
    [payments, loading],
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