import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    increment,
    onSnapshot,
    updateDoc,
} from "firebase/firestore";
import { createContext, useEffect, useState, useMemo } from "react";
import { db, normalizeDateValue } from "../../src/config/firebase";

export const DeliveryPartnerContext = createContext(null);

export function DeliveryPartnerProvider({ children }) {
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const partnersCollection = collection(db, "deliveryPartners");

    const unsubscribe = onSnapshot(
      partnersCollection,
      (snapshot) => {
        const dbPartners = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            createdAt: normalizeDateValue(data.createdAt),
          };
        });

        // Sort by creation date descending
        dbPartners.sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
        );

        setPartners(dbPartners);
        setLoading(false);
      },
      (error) => {
        console.error("Failed to load delivery partners from Firestore", error);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  const addPartner = async (partnerData) => {
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
  };

  const updatePartner = async (partnerId, partnerData) => {
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
  };

  const deletePartner = async (partnerId) => {
    try {
      const partnerRef = doc(db, "deliveryPartners", partnerId);
      await deleteDoc(partnerRef);
      return true;
    } catch (error) {
      console.error("Failed to delete delivery partner", error);
      return false;
    }
  };

  const logPartnerBonus = async (partnerId, bonusData) => {
    try {
      const amount = Number(bonusData.amount || 0);
      const createdAt = bonusData.createdAt ? new Date(bonusData.createdAt) : new Date();

      const docRef = await addDoc(collection(db, "deliveryPartnerBonuses"), {
        partnerId,
        amount,
        reason: bonusData.reason || "Performance Bonus",
        notes: bonusData.notes || "",
        createdAt,
      });

      return docRef.id;
    } catch (error) {
      console.error("Failed to log partner bonus", error);
      return null;
    }
  };

  const updatePartnerBonus = async (bonusId, partnerId, newBonusData, oldBonusData) => {
    try {
      const newAmt = Number(newBonusData.amount || 0);

      const updateData = {
        amount: newAmt,
        reason: newBonusData.reason || "Performance Bonus",
        notes: newBonusData.notes || "",
        updatedAt: new Date(),
      };
      if (newBonusData.createdAt) {
        updateData.createdAt = new Date(newBonusData.createdAt);
      }

      await updateDoc(doc(db, "deliveryPartnerBonuses", bonusId), updateData);
      return true;
    } catch (error) {
      console.error("Failed to update partner bonus", error);
      return false;
    }
  };

  const deletePartnerBonus = async (bonusId, partnerId, bonusData) => {
    try {
      await deleteDoc(doc(db, "deliveryPartnerBonuses", bonusId));
      return true;
    } catch (error) {
      console.error("Failed to delete partner bonus", error);
      return false;
    }
  };

  const toggleFavoritePartner = async (id) => {
    const target = partners.find((p) => p.id === id);
    if (!target) return false;

    const newFavState = !target.isFavorite;

    setPartners((prev) =>
      prev.map((p) => (p.id === id ? { ...p, isFavorite: newFavState } : p))
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
  };

  const contextValue = useMemo(
    () => ({
      partners,
      loading,
      addPartner,
      updatePartner,
      deletePartner,
      logPartnerBonus,
      updatePartnerBonus,
      deletePartnerBonus,
      toggleFavoritePartner,
    }),
    [partners, loading],
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
