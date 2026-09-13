import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    onSnapshot,
    updateDoc,
    writeBatch,
} from "firebase/firestore";
import { createContext, useEffect, useState, useMemo, useCallback, useRef } from "react";
import { db } from "../../src/config/firebase";
import { getDocsOfflineSafe } from "../../src/utils/offlineHelpers";

export const CustomerContext = createContext(null);

export function CustomerProvider({ children }) {
  const [customers, setCustomers] = useState([]);
  const customersRef = useRef(customers);
  useEffect(() => {
    customersRef.current = customers;
  }, [customers]);

  useEffect(() => {
    const customersCollection = collection(db, "customers");
    const unsubscribe = onSnapshot(
      customersCollection,
      (snapshot) => {
        const dbCustomers = snapshot.docs.map((doc) => {
          const data = doc.data();
          const balanceVal =
            data.totalPending !== undefined
              ? Number(data.totalPending)
              : Number(data.balance || 0);
          return {
            id: doc.id,
            ...data,
            balance: balanceVal,
            totalPending: balanceVal,
            totalPaid: Number(data.totalPaid || 0),
            dueDates: data.dueDates || [],
          };
        });
        setCustomers(dbCustomers);
      },
      (error) => {
      },
    );

    return () => unsubscribe();
  }, []);

  const totalCustomers = useMemo(() => customers.length, [customers]);
  const totalBalance = useMemo(
    () =>
      customers.reduce(
        (sum, customer) => sum + Number(customer.balance || 0),
        0,
      ),
    [customers],
  );

  const addCustomer = useCallback(async (customer) => {
    // Safety check for duplicate phone number
    const trimmedPhone = (customer.phone || "").trim();
    if (trimmedPhone) {
      const p1 = trimmedPhone.replace(/[^\d]/g, "");
      const duplicate = (customersRef.current || []).find((c) => {
        const p2 = (c.phone || "").replace(/[^\d]/g, "");
        if (!p1 || !p2) return false;
        if (p1 === p2) return true;
        if (p1.length >= 10 && p2.length >= 10) {
          return p1.slice(-10) === p2.slice(-10);
        }
        return false;
      });

      if (duplicate) {
        return false;
      }
    }

    try {
      const balanceVal =
        customer.totalPending !== undefined
          ? customer.totalPending
          : customer.balance || 0;
      const customerPayload = {
        ...customer,
        balance: Number(balanceVal),
        totalPending: Number(balanceVal),
        totalPaid: Number(customer.totalPaid || 0),
      };
      await addDoc(collection(db, "customers"), customerPayload);
      return true;
    } catch (error) {
      return false;
    }
  }, []);

  const updateCustomerBalance = useCallback(async (id, newBalance) => {
    setCustomers((prevCustomers) =>
      prevCustomers.map((customer) =>
        customer.id === id
          ? {
              ...customer,
              balance: Number(newBalance),
              totalPending: Number(newBalance),
            }
          : customer,
      ),
    );

    try {
      const customerRef = doc(db, "customers", id);
      const customerSnap = await getDoc(customerRef);
      if (customerSnap.exists()) {
        await updateDoc(customerRef, {
          balance: Number(newBalance),
          totalPending: Number(newBalance),
        });
      }
    } catch (error) {
    }
  }, []);

  const deleteCustomer = useCallback(async (id) => {
    setCustomers((prevCustomers) =>
      prevCustomers.filter((customer) => customer.id !== id),
    );

    try {
      const customerRef = doc(db, "customers", id);
      await deleteDoc(customerRef);
    } catch (error) {
    }
  }, []);

  const clearAllCustomers = useCallback(async () => {
    try {
      const querySnapshot = await getDocsOfflineSafe(collection(db, "customers"));
      const batch = writeBatch(db);
      querySnapshot.forEach((document) => batch.delete(document.ref));
      await batch.commit();
    } catch (error) {
      setCustomers([]);
    }
  }, []);

  const updateCustomerCollector = useCallback(async (
    customerId,
    collectorId,
    collectorName,
  ) => {
    try {
      const payload = {
        collectorId: collectorId || null,
        collectorName: collectorName || null,
      };

      const customerRef = doc(db, "customers", customerId);
      const customerSnap = await getDoc(customerRef);
      if (customerSnap.exists()) {
        await updateDoc(customerRef, payload);
        return true;
      }

      const partnerRef = doc(db, "deliveryPartners", customerId);
      const partnerSnap = await getDoc(partnerRef);
      if (partnerSnap.exists()) {
        await updateDoc(partnerRef, payload);
        return true;
      }

      const workerRef = doc(db, "workers", customerId);
      const workerSnap = await getDoc(workerRef);
      if (workerSnap.exists()) {
        await updateDoc(workerRef, payload);
        return true;
      }

      const supplierRef = doc(db, "raw_material_suppliers", customerId);
      const supplierSnap = await getDoc(supplierRef);
      if (supplierSnap.exists()) {
        await updateDoc(supplierRef, payload);
        return true;
      }

      return false;
    } catch (error) {
      return false;
    }
  }, []);

  const batchUpdateCustomerCollector = useCallback(async (
    customerIds,
    collectorId,
    collectorName,
  ) => {
    try {
      const batch = writeBatch(db);
      customerIds.forEach((id) => {
        const customerRef = doc(db, "customers", id);
        batch.update(customerRef, {
          collectorId: collectorId || null,
          collectorName: collectorName || null,
        });
      });
      await batch.commit();
      return true;
    } catch (error) {
      return false;
    }
  }, []);

  const updateCustomerDueDates = useCallback(async (customerId, dueDates) => {
    try {
      const payload = { dueDates };

      const customerRef = doc(db, "customers", customerId);
      const customerSnap = await getDoc(customerRef);
      if (customerSnap.exists()) {
        await updateDoc(customerRef, payload);
        return true;
      }

      const partnerRef = doc(db, "deliveryPartners", customerId);
      const partnerSnap = await getDoc(partnerRef);
      if (partnerSnap.exists()) {
        await updateDoc(partnerRef, payload);
        return true;
      }

      const workerRef = doc(db, "workers", customerId);
      const workerSnap = await getDoc(workerRef);
      if (workerSnap.exists()) {
        await updateDoc(workerRef, payload);
        return true;
      }

      const supplierRef = doc(db, "raw_material_suppliers", customerId);
      const supplierSnap = await getDoc(supplierRef);
      if (supplierSnap.exists()) {
        await updateDoc(supplierRef, payload);
        return true;
      }

      return false;
    } catch (error) {
      return false;
    }
  }, []);

  const updateCustomerDueAlerts = useCallback(async (customerId, enabled) => {
    try {
      const payload = { dueAlertsEnabled: enabled };

      const customerRef = doc(db, "customers", customerId);
      const customerSnap = await getDoc(customerRef);
      if (customerSnap.exists()) {
        await updateDoc(customerRef, payload);
        return true;
      }

      const partnerRef = doc(db, "deliveryPartners", customerId);
      const partnerSnap = await getDoc(partnerRef);
      if (partnerSnap.exists()) {
        await updateDoc(partnerRef, payload);
        return true;
      }

      const workerRef = doc(db, "workers", customerId);
      const workerSnap = await getDoc(workerRef);
      if (workerSnap.exists()) {
        await updateDoc(workerRef, payload);
        return true;
      }

      const supplierRef = doc(db, "raw_material_suppliers", customerId);
      const supplierSnap = await getDoc(supplierRef);
      if (supplierSnap.exists()) {
        await updateDoc(supplierRef, payload);
        return true;
      }

      return false;
    } catch (error) {
      return false;
    }
  }, []);

  const toggleFavoriteCustomer = useCallback(async (id) => {
    try {
      const customerRef = doc(db, "customers", id);
      const customerSnap = await getDoc(customerRef);
      if (customerSnap.exists()) {
        const nextFav = !customerSnap.data()?.isFavorite;
        setCustomers((prev) =>
          prev.map((c) => (c.id === id ? { ...c, isFavorite: nextFav } : c))
        );
        await updateDoc(customerRef, {
          isFavorite: nextFav,
        });
        return true;
      }

      const partnerRef = doc(db, "deliveryPartners", id);
      const partnerSnap = await getDoc(partnerRef);
      if (partnerSnap.exists()) {
        const nextFav = !partnerSnap.data()?.isFavorite;
        await updateDoc(partnerRef, {
          isFavorite: nextFav,
        });
        return true;
      }

      const workerRef = doc(db, "workers", id);
      const workerSnap = await getDoc(workerRef);
      if (workerSnap.exists()) {
        const nextFav = !workerSnap.data()?.isFavorite;
        await updateDoc(workerRef, {
          isFavorite: nextFav,
        });
        return true;
      }

      const supplierRef = doc(db, "raw_material_suppliers", id);
      const supplierSnap = await getDoc(supplierRef);
      if (supplierSnap.exists()) {
        const nextFav = !supplierSnap.data()?.isFavorite;
        await updateDoc(supplierRef, {
          isFavorite: nextFav,
        });
        return true;
      }

      return false;
    } catch (error) {
      console.error("Error toggling favorite customer:", error);
      return false;
    }
  }, []);

  const updateCustomerDetails = useCallback(async (id, updatedFields) => {
    try {
      const customerRef = doc(db, "customers", id);
      const customerSnap = await getDoc(customerRef);
      if (customerSnap.exists()) {
        await updateDoc(customerRef, updatedFields);
        return true;
      }

      const partnerRef = doc(db, "deliveryPartners", id);
      const partnerSnap = await getDoc(partnerRef);
      if (partnerSnap.exists()) {
        await updateDoc(partnerRef, updatedFields);
        return true;
      }

      const workerRef = doc(db, "workers", id);
      const workerSnap = await getDoc(workerRef);
      if (workerSnap.exists()) {
        await updateDoc(workerRef, updatedFields);
        return true;
      }

      const supplierRef = doc(db, "raw_material_suppliers", id);
      const supplierSnap = await getDoc(supplierRef);
      if (supplierSnap.exists()) {
        await updateDoc(supplierRef, updatedFields);
        return true;
      }

      return false;
    } catch (error) {
      console.error("Error updating customer details:", error);
      return false;
    }
  }, []);

  const contextValue = useMemo(
    () => ({
      customers,
      totalCustomers,
      totalBalance,
      addCustomer,
      updateCustomerBalance,
      deleteCustomer,
      clearAllCustomers,
      updateCustomerCollector,
      batchUpdateCustomerCollector,
      updateCustomerDueDates,
      updateCustomerDueAlerts,
      toggleFavoriteCustomer,
      updateCustomerDetails,
    }),
    [
      customers,
      totalCustomers,
      totalBalance,
      addCustomer,
      updateCustomerBalance,
      deleteCustomer,
      clearAllCustomers,
      updateCustomerCollector,
      batchUpdateCustomerCollector,
      updateCustomerDueDates,
      updateCustomerDueAlerts,
      toggleFavoriteCustomer,
      updateCustomerDetails,
    ]
  );

  return (
    <CustomerContext.Provider value={contextValue}>
      {children}
    </CustomerContext.Provider>
  );
}

export default function CustomerRoutePlaceholder() {
  return null;
}