import { addDoc, collection, doc, onSnapshot, updateDoc } from "firebase/firestore";
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useDeferredInit } from "../../hooks/useDeferredInit";
import { db, normalizeDateValue } from "../../src/config/firebase";
import type { ContractWorker } from "../../src/types/models";
import { roundCurrency } from "../../utils/currency";

export interface ContractPaymentPayload {
  amountPaid?: number;
  amount?: number;
  paymentMethod?: string;
  notes?: string;
  [key: string]: unknown;
}

export interface ContractWorkerContextType {
  contractWorkers: ContractWorker[];
  loading: boolean;
  logContractPayment: (
    contractWorkerId: string,
    paymentData: ContractPaymentPayload,
  ) => Promise<string | null>;
}

export const ContractWorkerContext = createContext<ContractWorkerContextType>({
  contractWorkers: [],
  loading: true,
  logContractPayment: async () => null,
});

export function ContractWorkerProvider({ children }: { children: ReactNode }) {
  const [contractWorkers, setContractWorkers] = useState<ContractWorker[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const contractWorkersRef = useRef<ContractWorker[]>([]);

  useEffect(() => {
    contractWorkersRef.current = contractWorkers;
  }, [contractWorkers]);

  // Defer Firestore listener to reduce startup load
  const _deferReady = useDeferredInit();

  useEffect(() => {
    if (!_deferReady) {
      setLoading(false);
      return;
    }
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
          } as ContractWorker;
        });
        contractWorkersRef.current = list;
        setContractWorkers(list);
        setLoading(false);
      },
      (err) => {
        console.error("Failed to load contract workers", err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [_deferReady]);

  const logContractPayment = useCallback(
    async (
      contractWorkerId: string,
      paymentData: ContractPaymentPayload,
    ): Promise<string | null> => {
      try {
        const docRef = await addDoc(collection(db, "contractPayments"), {
          contractWorkerId,
          ...paymentData,
          createdAt: new Date(),
        });

        const cw = contractWorkersRef.current.find((c) => c.id === contractWorkerId);
        if (cw) {
          const paidDelta = roundCurrency(
            Number(paymentData.amountPaid || paymentData.amount || 0),
          );
          const cwRef = doc(db, "contractWorkers", contractWorkerId);
          await updateDoc(cwRef, {
            totalPaid: roundCurrency((cw.totalPaid || 0) + paidDelta),
            totalPending: Math.max(0, roundCurrency((cw.totalPending || 0) - paidDelta)),
            updatedAt: new Date(),
          });
        }

        return docRef.id;
      } catch (e) {
        console.error("Failed to log contract payment", e);
        return null;
      }
    },
    [],
  );

  const contextValue = useMemo<ContractWorkerContextType>(
    () => ({ contractWorkers, loading, logContractPayment }),
    [contractWorkers, loading, logContractPayment],
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

