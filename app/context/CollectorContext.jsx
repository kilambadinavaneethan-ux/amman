import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    onSnapshot,
    updateDoc,
} from "firebase/firestore";
import { createContext, useEffect, useState, useMemo } from "react";
import { db, normalizeDateValue } from "../../src/config/firebase";

export const CollectorContext = createContext(null);

export function CollectorProvider({ children }) {
  const [collectors, setCollectors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const collectorsCollection = collection(db, "moneyCollectors");

    const unsubscribe = onSnapshot(
      collectorsCollection,
      (snapshot) => {
        const dbCollectors = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            createdAt: normalizeDateValue(data.createdAt),
          };
        });

        // Sort by creation date descending
        dbCollectors.sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
        );

        setCollectors(dbCollectors);
        setLoading(false);
      },
      (error) => {
        console.error("Failed to load money collectors from Firestore", error);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  const addCollector = async (collectorData) => {
    try {
      const docRef = await addDoc(collection(db, "moneyCollectors"), {
        ...collectorData,
        createdAt: new Date(),
      });
      return docRef.id;
    } catch (error) {
      console.error("Failed to add money collector", error);
      return null;
    }
  };

  const updateCollector = async (collectorId, collectorData) => {
    try {
      const collectorRef = doc(db, "moneyCollectors", collectorId);
      await updateDoc(collectorRef, {
        ...collectorData,
        updatedAt: new Date(),
      });
      return true;
    } catch (error) {
      console.error("Failed to update money collector", error);
      return false;
    }
  };

  const deleteCollector = async (collectorId) => {
    try {
      const collectorRef = doc(db, "moneyCollectors", collectorId);
      await deleteDoc(collectorRef);
      return true;
    } catch (error) {
      console.error("Failed to delete money collector", error);
      return false;
    }
  };

  const contextValue = useMemo(
    () => ({
      collectors,
      loading,
      addCollector,
      updateCollector,
      deleteCollector,
    }),
    [collectors, loading],
  );

  return (
    <CollectorContext.Provider value={contextValue}>
      {children}
    </CollectorContext.Provider>
  );
}

export default function CollectorRoutePlaceholder() {
  return null;
}
