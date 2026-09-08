import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    onSnapshot,
    query,
    updateDoc,
    where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { createContext, useEffect, useState, useMemo } from "react";
import { db, normalizeDateValue, storage } from "../../src/config/firebase";

export const ItemContext = createContext(null);

export function ItemProvider({ children }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const uid = "default_user";
    setLoading(true);
    const itemsCollection = collection(db, "items");
    const q = query(itemsCollection, where("userId", "==", uid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const dbItems = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            createdAt: normalizeDateValue(data.createdAt),
            updatedAt: normalizeDateValue(data.updatedAt),
          };
        });

        // Sort in memory by createdAt descending
        dbItems.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        setItems(dbItems);
        setLoading(false);
      },
      (error) => {
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  const addItem = async (itemData) => {
    const uid = "default_user";
    try {
      const finalOpeningStock = Number(itemData.openingStock || 0);

      const docRef = await addDoc(collection(db, "items"), {
        status: "Active",
        ...itemData,
        openingStock: finalOpeningStock,
        openingStockSlots: itemData.openingStockSlots || [],
        userId: uid,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Log initial stock movement
      const initialStock = finalOpeningStock;
      await addDoc(collection(db, "item_stock_logs"), {
        itemId: docRef.id,
        itemName: itemData.itemName,
        itemType: itemData.itemType || "product",
        type: "initial",
        quantity: initialStock,
        previousStock: 0,
        newStock: initialStock,
        notes: "Initial stock registration",
        date: new Date(),
        createdAt: new Date(),
      });

      return docRef.id;
    } catch (error) {
      return null;
    }
  };

  const updateItem = async (itemId, itemData) => {
    try {
      const itemRef = doc(db, "items", itemId);
      
      // Fetch current stock to compare
      const itemSnap = await getDoc(itemRef);
      let previousStock = 0;
      let newStock = Number(itemData.openingStock !== undefined ? itemData.openingStock : 0);
      let itemName = itemData.itemName || "";
      let itemType = itemData.itemType || "product";

      if (itemSnap.exists()) {
        const currentData = itemSnap.data();
        previousStock = Number(
          currentData.openingStock !== undefined ? currentData.openingStock : (currentData.stock || 0)
        );
        if (itemData.openingStock === undefined) {
          newStock = previousStock;
        }
        if (!itemName) itemName = currentData.itemName;
        if (!itemData.itemType) itemType = currentData.itemType || "product";
      }

      await updateDoc(itemRef, {
        ...itemData,
        updatedAt: new Date(),
      });

      // If stock has changed, log adjustment
      if (itemData.openingStock !== undefined) {
        const diff = newStock - previousStock;
        if (diff !== 0) {
          await addDoc(collection(db, "item_stock_logs"), {
            itemId,
            itemName,
            itemType,
            type: "adjustment",
            quantity: diff,
            previousStock,
            newStock,
            notes: "Manual adjustment in settings",
            date: new Date(),
            createdAt: new Date(),
          });
        }
      }

      return true;
    } catch (error) {
      return false;
    }
  };

  const deleteItem = async (itemId) => {
    try {
      const itemRef = doc(db, "items", itemId);
      await deleteDoc(itemRef);
      return true;
    } catch (error) {
      return false;
    }
  };

  const uploadItemImage = async (uri) => {
    if (!uri) return null;
    const uid = "default_user";
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const imageRef = ref(storage, `items/${uid}/item_${Date.now()}.jpg`);
      await uploadBytes(imageRef, blob);
      const downloadUrl = await getDownloadURL(imageRef);
      return downloadUrl;
    } catch (error) {
      // Offline or upload failed — return local URI so the item can still be created
      return uri;
    }
  };

  const contextValue = useMemo(
    () => ({
      items,
      loading,
      addItem,
      updateItem,
      deleteItem,
      uploadItemImage,
    }),
    [items, loading],
  );

  return (
    <ItemContext.Provider value={contextValue}>
      {children}
    </ItemContext.Provider>
  );
}

export default function ItemRoutePlaceholder() {
  return null;
}