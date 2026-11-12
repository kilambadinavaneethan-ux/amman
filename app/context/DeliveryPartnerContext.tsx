import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  updateDoc,
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
import { useDeferredInit } from "../../hooks/useDeferredInit";
import { db, normalizeDateValue } from "../../src/config/firebase";
import type { DeliveryPartner } from "../../src/types/models";
import { roundCurrency } from "../../utils/currency";

export interface DeliveryPartnerContextType {
  partners: DeliveryPartner[];
  loading: boolean;
  addPartner: (
    partnerData: Partial<DeliveryPartner> & Record<string, any>,
  ) => Promise<string | null>;
  updatePartner: (
    partnerId: string,
    partnerData: Partial<DeliveryPartner> & Record<string, any>,
  ) => Promise<boolean>;
  deletePartner: (partnerId: string) => Promise<boolean>;
  logPartnerBonus: (
    partnerId: string,
    bonusData: Record<string, any>,
  ) => Promise<string | null>;
  updatePartnerBonus: (
    bonusId: string,
    partnerId: string,
    newBonusData: Record<string, any>,
    oldBonusData?: Record<string, any>,
  ) => Promise<boolean>;
  deletePartnerBonus: (
    bonusId: string,
    partnerId: string,
    bonusData?: Record<string, any>,
  ) => Promise<boolean>;
  reconcilePartnerBalance: (
    partnerId: string,
    balances: { totalPayable: number; totalPaid: number; totalPending: number },
  ) => Promise<boolean>;
  toggleFavoritePartner: (id: string) => Promise<boolean>;
}

export const DeliveryPartnerContext = createContext<DeliveryPartnerContextType>({
  partners: [],
  loading: true,
  addPartner: async () => null,
  updatePartner: async () => false,
  deletePartner: async () => false,
  logPartnerBonus: async () => null,
  updatePartnerBonus: async () => false,
  deletePartnerBonus: async () => false,
  reconcilePartnerBalance: async () => false,
  toggleFavoritePartner: async () => false,
});

export function DeliveryPartnerProvider({ children }: { children: ReactNode }) {
  const [partners, setPartners] = useState<DeliveryPartner[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const partnersRef = useRef<DeliveryPartner[]>([]);

  useEffect(() => {
    partnersRef.current = partners;
  }, [partners]);

  // Defer Firestore listener to reduce startup load
  const _deferReady = useDeferredInit();

  useEffect(() => {
    if (!_deferReady) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const partnersCollection = collection(db, "deliveryPartners");

    const unsubscribe = onSnapshot(
      partnersCollection,
      (snapshot) => {
        const dbPartners = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            ...data,
            createdAt: normalizeDateValue(data.createdAt),
          } as DeliveryPartner & { createdAt: Date };
        });

        // Sort by creation date descending
        dbPartners.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        partnersRef.current = dbPartners;
        setPartners(dbPartners);
        setLoading(false);
      },
      (error) => {
        console.error("Failed to load delivery partners from Firestore", error);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [_deferReady]);

  const addPartner = useCallback(
    async (
      partnerData: Partial<DeliveryPartner> & Record<string, any>,
    ): Promise<string | null> => {
      try {
        const docRef = await addDoc(collection(db, "deliveryPartners"), {
          ...partnerData,
          totalPayable: 0,
          totalPaid: 0,
          totalPending: 0,
          createdAt: new Date(),
        });
        return docRef.id;
      } catch (error) {
        console.error("Failed to add delivery partner", error);
        return null;
      }
    },
    [],
  );

  const updatePartner = useCallback(
    async (
      partnerId: string,
      partnerData: Partial<DeliveryPartner> & Record<string, any>,
    ): Promise<boolean> => {
      try {
        const partnerRef = doc(db, "deliveryPartners", partnerId);
        await updateDoc(partnerRef, {
          ...partnerData,
          updatedAt: new Date(),
        });
        return true;
      } catch (error) {
        console.error("Failed to update delivery partner", error);
        return false;
      }
    },
    [],
  );

  const deletePartner = useCallback(async (partnerId: string): Promise<boolean> => {
    try {
      const partnerRef = doc(db, "deliveryPartners", partnerId);
      await deleteDoc(partnerRef);
      return true;
    } catch (error) {
      console.error("Failed to delete delivery partner", error);
      return false;
    }
  }, []);

  const logPartnerBonus = useCallback(
    async (partnerId: string, bonusData: Record<string, any>): Promise<string | null> => {
      try {
        const amount = roundCurrency(Number(bonusData.amount || 0));
        const createdAt = bonusData.createdAt ? new Date(bonusData.createdAt) : new Date();

        const docRef = await addDoc(collection(db, "deliveryPartnerBonuses"), {
          partnerId,
          amount,
          reason: bonusData.reason || "Performance Bonus",
          notes: bonusData.notes || "",
          createdAt,
        });

        // Bonus is an awarded reward and does not inflate pending delivery wage debt/dues
        if (partnerId) {
          try {
            const partnerRef = doc(db, "deliveryPartners", partnerId);
            await updateDoc(partnerRef, {
              updatedAt: new Date(),
            });
          } catch (syncErr) {
            console.warn("Failed to touch partner updatedAt on bonus log:", syncErr);
          }
        }

        return docRef.id;
      } catch (error) {
        console.error("Failed to log partner bonus", error);
        return null;
      }
    },
    [],
  );

  const updatePartnerBonus = useCallback(
    async (
      bonusId: string,
      partnerId: string,
      newBonusData: Record<string, any>,
      _oldBonusData?: Record<string, any>,
    ): Promise<boolean> => {
      try {
        const newAmt = roundCurrency(Number(newBonusData.amount || 0));

        const updateData: Record<string, any> = {
          amount: newAmt,
          reason: newBonusData.reason || "Performance Bonus",
          notes: newBonusData.notes || "",
          updatedAt: new Date(),
        };
        if (newBonusData.createdAt) {
          updateData.createdAt = new Date(newBonusData.createdAt);
        }

        await updateDoc(doc(db, "deliveryPartnerBonuses", bonusId), updateData);

        if (partnerId) {
          try {
            const partnerRef = doc(db, "deliveryPartners", partnerId);
            await updateDoc(partnerRef, {
              updatedAt: new Date(),
            });
          } catch (syncErr) {
            console.warn("Failed to touch partner updatedAt on bonus update:", syncErr);
          }
        }

        return true;
      } catch (error) {
        console.error("Failed to update partner bonus", error);
        return false;
      }
    },
    [],
  );

  const deletePartnerBonus = useCallback(
    async (
      bonusId: string,
      partnerId: string,
      _bonusData?: Record<string, any>,
    ): Promise<boolean> => {
      try {
        await deleteDoc(doc(db, "deliveryPartnerBonuses", bonusId));

        if (partnerId) {
          try {
            const partnerRef = doc(db, "deliveryPartners", partnerId);
            await updateDoc(partnerRef, {
              updatedAt: new Date(),
            });
          } catch (syncErr) {
            console.warn("Failed to touch partner updatedAt on bonus delete:", syncErr);
          }
        }

        return true;
      } catch (error) {
        console.error("Failed to delete partner bonus", error);
        return false;
      }
    },
    [],
  );

  const reconcilePartnerBalance = useCallback(
    async (
      partnerId: string,
      {
        totalPayable,
        totalPaid,
        totalPending,
      }: { totalPayable: number; totalPaid: number; totalPending: number },
    ): Promise<boolean> => {
      try {
        if (!partnerId) return false;
        const partnerRef = doc(db, "deliveryPartners", partnerId);
        await updateDoc(partnerRef, {
          totalPayable: roundCurrency(Number(totalPayable || 0)),
          totalPaid: roundCurrency(Number(totalPaid || 0)),
          totalPending: roundCurrency(Number(totalPending || 0)),
          updatedAt: new Date(),
        });
        return true;
      } catch (err) {
        console.error("Failed to reconcile partner balance:", err);
        return false;
      }
    },
    [],
  );

  const toggleFavoritePartner = useCallback(async (id: string): Promise<boolean> => {
    const target = partnersRef.current.find((p) => p.id === id);
    if (!target) return false;

    const newFavState = !target.isFavorite;

    setPartners((prev) =>
      prev.map((p) => (p.id === id ? { ...p, isFavorite: newFavState } : p)),
    );

    try {
      const partnerRef = doc(db, "deliveryPartners", id);
      await updateDoc(partnerRef, {
        isFavorite: newFavState,
        updatedAt: new Date(),
      });
      return true;
    } catch (error) {
      console.error("Failed to toggle favorite delivery partner", error);
      return false;
    }
  }, []);

  const contextValue = useMemo<DeliveryPartnerContextType>(
    () => ({
      partners,
      loading,
      addPartner,
      updatePartner,
      deletePartner,
      logPartnerBonus,
      updatePartnerBonus,
      deletePartnerBonus,
      reconcilePartnerBalance,
      toggleFavoritePartner,
    }),
    [
      partners,
      loading,
      addPartner,
      updatePartner,
      deletePartner,
      logPartnerBonus,
      updatePartnerBonus,
      deletePartnerBonus,
      reconcilePartnerBalance,
      toggleFavoritePartner,
    ],
  );

  return (
    <DeliveryPartnerContext.Provider value={contextValue}>
      {children}
    </DeliveryPartnerContext.Provider>
  );
}

export default function DeliveryPartnerRoutePlaceholder() {
  return null;
}

