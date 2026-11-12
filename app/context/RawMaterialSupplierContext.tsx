import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useDeferredInit } from "../../hooks/useDeferredInit";
import { db, normalizeDateValue } from "../../src/config/firebase";
import type { RawMaterialSupplier } from "../../src/types/models";
import { roundCurrency } from "../../utils/currency";

export interface RawMaterialSupplierContextType {
  suppliers: RawMaterialSupplier[];
  loading: boolean;
  addSupplier: (
    supplierData: Partial<RawMaterialSupplier> & Record<string, any>,
  ) => Promise<string | null>;
  updateSupplier: (
    supplierId: string,
    supplierData: Partial<RawMaterialSupplier> & Record<string, any>,
  ) => Promise<boolean>;
  deleteSupplier: (supplierId: string) => Promise<boolean>;
}

export const RawMaterialSupplierContext = createContext<RawMaterialSupplierContextType>({
  suppliers: [],
  loading: true,
  addSupplier: async () => null,
  updateSupplier: async () => false,
  deleteSupplier: async () => false,
});

export function RawMaterialSupplierProvider({ children }: { children: ReactNode }) {
  const [suppliers, setSuppliers] = useState<RawMaterialSupplier[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Defer Firestore listener to reduce startup load
  const _deferReady = useDeferredInit();

  useEffect(() => {
    if (!_deferReady) {
      setLoading(false);
      return;
    }
    const uid = "default_user";
    setLoading(true);
    const suppliersCollection = collection(db, "raw_material_suppliers");
    const q = query(suppliersCollection, where("userId", "==", uid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const dbSuppliers = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            ...data,
            createdAt: normalizeDateValue(data.createdAt),
            updatedAt: normalizeDateValue(data.updatedAt),
          } as RawMaterialSupplier;
        });

        // Sort alphabetically by supplier name
        dbSuppliers.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

        setSuppliers(dbSuppliers);
        setLoading(false);
      },
      (error) => {
        console.error("Failed to load raw material suppliers from Firestore", error);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [_deferReady]);

  const addSupplier = useCallback(
    async (
      supplierData: Partial<RawMaterialSupplier> & Record<string, any>,
    ): Promise<string | null> => {
      const uid = "default_user";
      try {
        const bal = roundCurrency(Number(supplierData.balance || 0));
        const openingBal = roundCurrency(
          Number(
            supplierData.openingBalance !== undefined ? supplierData.openingBalance : bal,
          ),
        );
        const docRef = await addDoc(collection(db, "raw_material_suppliers"), {
          ...supplierData,
          userId: uid,
          balance: bal,
          openingBalance: openingBal,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        return docRef.id;
      } catch (error) {
        console.error("Failed to add supplier to Firestore", error);
        return null;
      }
    },
    [],
  );

  const updateSupplier = useCallback(
    async (
      supplierId: string,
      supplierData: Partial<RawMaterialSupplier> & Record<string, any>,
    ): Promise<boolean> => {
      try {
        const supplierRef = doc(db, "raw_material_suppliers", supplierId);
        await updateDoc(supplierRef, {
          ...supplierData,
          updatedAt: new Date(),
        });
        return true;
      } catch (error) {
        console.error("Failed to update supplier in Firestore", error);
        return false;
      }
    },
    [],
  );

  const deleteSupplier = useCallback(async (supplierId: string): Promise<boolean> => {
    try {
      const supplierRef = doc(db, "raw_material_suppliers", supplierId);
      await deleteDoc(supplierRef);
      return true;
    } catch (error) {
      console.error("Failed to delete supplier from Firestore", error);
      return false;
    }
  }, []);

  const contextValue = useMemo<RawMaterialSupplierContextType>(
    () => ({
      suppliers,
      loading,
      addSupplier,
      updateSupplier,
      deleteSupplier,
    }),
    [suppliers, loading, addSupplier, updateSupplier, deleteSupplier],
  );

  return (
    <RawMaterialSupplierContext.Provider value={contextValue}>
      {children}
    </RawMaterialSupplierContext.Provider>
  );
}

export default function RawMaterialSupplierRoutePlaceholder() {
  return null;
}

