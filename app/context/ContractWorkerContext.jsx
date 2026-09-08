import {
    addDoc,
    collection,
    doc,
    onSnapshot,
    updateDoc,
} from "firebase/firestore";
import { createContext, useEffect, useState, useMemo } from "react";
import { db, normalizeDateValue } from "../../src/config/firebase";

export const ContractWorkerContext = createContext(null);

export function ContractWorkerProvider({ children }) {
  const [contractWorkers, setContractWorkers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const coll = collection(db, "contractWorkers");
    const unsub = onSnapshot(
      coll,
      (snap) => {
        const list = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            createdAt: normalizeDateValue(data.createdAt),
          };
        });
        setContractWorkers(list);
        setLoading(false);
      },
      (err) => {
        console.error("Failed to load contract workers", err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  const logContractPayment = async (contractWorkerId, paymentData) => {
    try {
      const docRef = await addDoc(collection(db, "contractPayments"), {
        contractWorkerId,
        ...paymentData,
        createdAt: new Date(),
      });

      const cw = contractWorkers.find((c) => c.id === contractWorkerId);
      if (cw) {
        const cwRef = doc(db, "contractWorkers", contractWorkerId);
        await updateDoc(cwRef, {
          totalPaid:
            (cw.totalPaid || 0) +
            Number(paymentData.amountPaid || paymentData.amount || 0),
          totalPending: Math.max(
            0,
            (cw.totalPending || 0) -
              Number(paymentData.amountPaid || paymentData.amount || 0),
          ),
          updatedAt: new Date(),
        });
      }

      return docRef.id;
    } catch (e) {
      console.error("Failed to log contract payment", e);
      return null;
    }
  };

  const contextValue = useMemo(
    () => ({ contractWorkers, loading, logContractPayment }),
    [contractWorkers, loading],
  );

  return (
    <ContractWorkerContext.Provider value={contextValue}>
      {children}
    </ContractWorkerContext.Provider>
  );
}

export default function ContractWorkerRoutePlaceholder() {
  return null;
}
