import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  updateDoc,
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
import { db } from "../../src/config/firebase";
import type { Customer, CustomerDueDate } from "../../src/types/models";
import { getDocsOfflineSafe } from "../../src/utils/offlineHelpers";
import { roundCurrency } from "../../utils/currency";

export interface CustomerContextType {
  customers: Customer[];
  totalCustomers: number;
  totalBalance: number;
  addCustomer: (customer: Partial<Customer> & Record<string, any>) => Promise<boolean>;
  updateCustomerBalance: (id: string, newBalance: number) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
  clearAllCustomers: () => Promise<void>;
  updateCustomerCollector: (
    customerId: string,
    collectorId: string | null,
    collectorName: string | null,
  ) => Promise<boolean>;
  batchUpdateCustomerCollector: (
    customerIds: string[],
    collectorId: string | null,
    collectorName: string | null,
  ) => Promise<boolean>;
  updateCustomerDueDates: (
    customerId: string,
    dueDates: CustomerDueDate[],
  ) => Promise<boolean>;
  updateCustomerDueAlerts: (customerId: string, enabled: boolean) => Promise<boolean>;
  toggleFavoriteCustomer: (id: string) => Promise<boolean>;
  updateCustomerDetails: (
    id: string,
    updatedFields: Record<string, any>,
  ) => Promise<boolean>;
}

export const CustomerContext = createContext<CustomerContextType>({
  customers: [],
  totalCustomers: 0,
  totalBalance: 0,
  addCustomer: async () => false,
  updateCustomerBalance: async () => {},
  deleteCustomer: async () => {},
  clearAllCustomers: async () => {},
  updateCustomerCollector: async () => false,
  batchUpdateCustomerCollector: async () => false,
  updateCustomerDueDates: async () => false,
  updateCustomerDueAlerts: async () => false,
  toggleFavoriteCustomer: async () => false,
  updateCustomerDetails: async () => false,
});

export function CustomerProvider({ children }: { children: ReactNode }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const customersRef = useRef<Customer[]>(customers);

  useEffect(() => {
    customersRef.current = customers;
  }, [customers]);

  const isInitialLoadRef = useRef<boolean>(false);

  useEffect(() => {
    isInitialLoadRef.current = true;
    const customersCollection = collection(db, "customers");

    const normalizeCustomerDoc = (docSnapshot: QueryDocumentSnapshot): Customer => {
      const data = docSnapshot.data();
      const balanceVal = roundCurrency(
        data.totalPending !== undefined
          ? Number(data.totalPending)
          : Number(data.balance || 0),
      );
      return {
        id: docSnapshot.id,
        name: String(data.name || ""),
        ...data,
        balance: balanceVal,
        totalPending: balanceVal,
        totalPaid: roundCurrency(Number(data.totalPaid || 0)),
        dueDates: (data.dueDates as CustomerDueDate[]) || [],
      } as Customer;
    };

    const unsubscribe = onSnapshot(
      customersCollection,
      (snapshot) => {
        if (isInitialLoadRef.current) {
          const dbCustomers = snapshot.docs.map(normalizeCustomerDoc);
          customersRef.current = dbCustomers;
          setCustomers(dbCustomers);
          isInitialLoadRef.current = false;
        } else {
          const changes = snapshot.docChanges();
          if (changes.length > 0) {
            setCustomers((prev) => {
              const updated = [...prev];
              for (const change of changes) {
                const customerData = normalizeCustomerDoc(change.doc);
                if (change.type === "added") {
                  const existIdx = updated.findIndex((c) => c.id === customerData.id);
                  if (existIdx === -1) {
                    updated.push(customerData);
                  } else {
                    updated[existIdx] = customerData;
                  }
                } else if (change.type === "modified") {
                  const idx = updated.findIndex((c) => c.id === customerData.id);
                  if (idx !== -1) {
                    updated[idx] = customerData;
                  }
                } else if (change.type === "removed") {
                  const idx = updated.findIndex((c) => c.id === customerData.id);
                  if (idx !== -1) {
                    updated.splice(idx, 1);
                  }
                }
              }
              return updated;
            });
          }
        }
      },
      () => {},
    );

    return () => unsubscribe();
  }, []);

  const totalCustomers = useMemo(() => customers.length, [customers]);
  const totalBalance = useMemo(
    () =>
      roundCurrency(
        customers.reduce((sum, customer) => sum + Number(customer.balance || 0), 0),
      ),
    [customers],
  );

  const addCustomer = useCallback(
    async (customer: Partial<Customer> & Record<string, any>): Promise<boolean> => {
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
        const balanceVal = roundCurrency(
          Number(
            customer.totalPending !== undefined
              ? customer.totalPending
              : customer.balance || 0,
          ),
        );
        const customerPayload = {
          ...customer,
          balance: balanceVal,
          totalPending: balanceVal,
          totalPaid: roundCurrency(Number(customer.totalPaid || 0)),
        };
        await addDoc(collection(db, "customers"), customerPayload);
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  const updateCustomerBalance = useCallback(
    async (id: string, newBalance: number): Promise<void> => {
      const rounded = roundCurrency(Number(newBalance));
      setCustomers((prevCustomers) =>
        prevCustomers.map((customer) =>
          customer.id === id
            ? {
                ...customer,
                balance: rounded,
                totalPending: rounded,
              }
            : customer,
        ),
      );

      try {
        const customerRef = doc(db, "customers", id);
        const customerSnap = await getDoc(customerRef);
        if (customerSnap.exists()) {
          await updateDoc(customerRef, {
            balance: rounded,
            totalPending: rounded,
          });
        }
      } catch {
        // Ignore Firestore sync failure
      }
    },
    [],
  );

  const deleteCustomer = useCallback(async (id: string): Promise<void> => {
    setCustomers((prevCustomers) =>
      prevCustomers.filter((customer) => customer.id !== id),
    );

    try {
      const customerRef = doc(db, "customers", id);
      await deleteDoc(customerRef);
    } catch {
      // Ignore delete error
    }
  }, []);

  const clearAllCustomers = useCallback(async (): Promise<void> => {
    try {
      const querySnapshot = await getDocsOfflineSafe(collection(db, "customers"));
      const batch = writeBatch(db);
      querySnapshot.forEach((document: any) => batch.delete(document.ref));
      await batch.commit();
    } catch {
      setCustomers([]);
    }
  }, []);

  const updateCustomerCollector = useCallback(
    async (
      customerId: string,
      collectorId: string | null,
      collectorName: string | null,
    ): Promise<boolean> => {
      try {
        const payload = {
          collectorId: collectorId || null,
          collectorName: collectorName || null,
        };

        const collections = [
          "customers",
          "deliveryPartners",
          "workers",
          "raw_material_suppliers",
        ];
        for (const colName of collections) {
          const targetRef = doc(db, colName, customerId);
          const targetSnap = await getDoc(targetRef);
          if (targetSnap.exists()) {
            await updateDoc(targetRef, payload);
            return true;
          }
        }

        return false;
      } catch {
        return false;
      }
    },
    [],
  );

  const batchUpdateCustomerCollector = useCallback(
    async (
      customerIds: string[],
      collectorId: string | null,
      collectorName: string | null,
    ): Promise<boolean> => {
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
      } catch {
        return false;
      }
    },
    [],
  );

  const updateCustomerDueDates = useCallback(
    async (customerId: string, dueDates: CustomerDueDate[]): Promise<boolean> => {
      try {
        const payload = { dueDates };
        const collections = [
          "customers",
          "deliveryPartners",
          "workers",
          "raw_material_suppliers",
        ];
        for (const colName of collections) {
          const targetRef = doc(db, colName, customerId);
          const targetSnap = await getDoc(targetRef);
          if (targetSnap.exists()) {
            await updateDoc(targetRef, payload);
            return true;
          }
        }

        return false;
      } catch {
        return false;
      }
    },
    [],
  );

  const updateCustomerDueAlerts = useCallback(
    async (customerId: string, enabled: boolean): Promise<boolean> => {
      try {
        const payload = { dueAlertsEnabled: enabled };
        const collections = [
          "customers",
          "deliveryPartners",
          "workers",
          "raw_material_suppliers",
        ];
        for (const colName of collections) {
          const targetRef = doc(db, colName, customerId);
          const targetSnap = await getDoc(targetRef);
          if (targetSnap.exists()) {
            await updateDoc(targetRef, payload);
            return true;
          }
        }

        return false;
      } catch {
        return false;
      }
    },
    [],
  );

  const toggleFavoriteCustomer = useCallback(async (id: string): Promise<boolean> => {
    try {
      const customerRef = doc(db, "customers", id);
      const customerSnap = await getDoc(customerRef);
      if (customerSnap.exists()) {
        const nextFav = !customerSnap.data()?.isFavorite;
        setCustomers((prev) =>
          prev.map((c) => (c.id === id ? { ...c, isFavorite: nextFav } : c)),
        );
        await updateDoc(customerRef, {
          isFavorite: nextFav,
        });
        return true;
      }

      const secondaryCollections = ["deliveryPartners", "workers", "raw_material_suppliers"];
      for (const colName of secondaryCollections) {
        const targetRef = doc(db, colName, id);
        const targetSnap = await getDoc(targetRef);
        if (targetSnap.exists()) {
          const nextFav = !targetSnap.data()?.isFavorite;
          await updateDoc(targetRef, {
            isFavorite: nextFav,
          });
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error("Error toggling favorite customer:", error);
      return false;
    }
  }, []);

  const updateCustomerDetails = useCallback(
    async (id: string, updatedFields: Record<string, any>): Promise<boolean> => {
      try {
        const collections = [
          "customers",
          "deliveryPartners",
          "workers",
          "raw_material_suppliers",
        ];
        for (const colName of collections) {
          const targetRef = doc(db, colName, id);
          const targetSnap = await getDoc(targetRef);
          if (targetSnap.exists()) {
            await updateDoc(targetRef, updatedFields);
            return true;
          }
        }

        return false;
      } catch (error) {
        console.error("Error updating customer details:", error);
        return false;
      }
    },
    [],
  );

  const contextValue = useMemo<CustomerContextType>(
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
    ],
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
