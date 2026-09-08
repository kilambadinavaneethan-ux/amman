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
import { createContext, useEffect, useState, useMemo } from "react";
import { db, normalizeDateValue } from "../../src/config/firebase";

export const RawMaterialSupplierContext = createContext(null);

export function RawMaterialSupplierProvider({ children }) {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const uid = "default_user";
    setLoading(true);
    const suppliersCollection = collection(db, "raw_material_suppliers");
    const q = query(suppliersCollection, where("userId", "==", uid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const dbSuppliers = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            createdAt: normalizeDateValue(data.createdAt),
            updatedAt: normalizeDateValue(data.updatedAt),
          };
        });

        // Sort alphabetically by supplier name
        dbSuppliers.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

        setSuppliers(dbSuppliers);
        setLoading(false);
      },
      (error) => {
        console.error(
          "Failed to load raw material suppliers from Firestore",
          error,
        );
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  const addSupplier = async (supplierData) => {
    const uid = "default_user";
    try {
      const docRef = await addDoc(collection(db, "raw_material_suppliers"), {
        ...supplierData,
        userId: uid,
        balance: Number(supplierData.balance || 0),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return docRef.id;
    } catch (error) {
      console.error("Failed to add supplier to Firestore", error);
      return null;
    }
  };

  const updateSupplier = async (supplierId, supplierData) => {
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
  };

  const deleteSupplier = async (supplierId) => {
    try {
      const supplierRef = doc(db, "raw_material_suppliers", supplierId);
      await deleteDoc(supplierRef);
      return true;
    } catch (error) {
      console.error("Failed to delete supplier from Firestore", error);
      return false;
    }
  };

  const contextValue = useMemo(
    () => ({
      suppliers,
      loading,
      addSupplier,
      updateSupplier,
      deleteSupplier,
    }),
    [suppliers, loading],
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
