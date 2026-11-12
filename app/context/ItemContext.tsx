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
import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { db, normalizeDateValue, storage } from "../../src/config/firebase";
import type { InventoryItem } from "../../src/types/models";

export interface ItemContextType {
  items: InventoryItem[];
  loading: boolean;
  addItem: (itemData: Partial<InventoryItem> & Record<string, any>) => Promise<string | null>;
  updateItem: (
    itemId: string,
    itemData: Partial<InventoryItem> & Record<string, any>,
  ) => Promise<boolean>;
  deleteItem: (itemId: string) => Promise<boolean>;
  uploadItemImage: (uri: string | null | undefined) => Promise<string | null>;
}

export const ItemContext = createContext<ItemContextType>({
  items: [],
  loading: true,
  addItem: async () => null,
  updateItem: async () => false,
  deleteItem: async () => false,
  uploadItemImage: async () => null,
});

export function ItemProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const uid = "default_user";
    setLoading(true);
    const itemsCollection = collection(db, "items");
    const q = query(itemsCollection, where("userId", "==", uid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const dbItems = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            ...data,
            createdAt: normalizeDateValue(data.createdAt),
            updatedAt: normalizeDateValue(data.updatedAt),
          } as InventoryItem & { createdAt: Date; updatedAt: Date };
        });

        // Sort in memory by createdAt descending
        dbItems.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        setItems(dbItems);
        setLoading(false);
      },
      () => {
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  const addItem = useCallback(
    async (itemData: Partial<InventoryItem> & Record<string, any>): Promise<string | null> => {
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
      } catch {
        return null;
      }
    },
    [],
  );

  const updateItem = useCallback(
    async (
      itemId: string,
      itemData: Partial<InventoryItem> & Record<string, any>,
    ): Promise<boolean> => {
      try {
        const itemRef = doc(db, "items", itemId);

        // Fetch current stock to compare
        const itemSnap = await getDoc(itemRef);
        let previousStock = 0;
        let newStock = Number(
          itemData.openingStock !== undefined ? itemData.openingStock : 0,
        );
        let itemName = itemData.itemName || "";
        let itemType = itemData.itemType || "product";

        if (itemSnap.exists()) {
          const currentData = itemSnap.data();
          previousStock = Number(
            currentData.openingStock !== undefined
              ? currentData.openingStock
              : currentData.stock || 0,
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
      } catch {
        return false;
      }
    },
    [],
  );

  const deleteItem = useCallback(async (itemId: string): Promise<boolean> => {
    try {
      const itemRef = doc(db, "items", itemId);
      await deleteDoc(itemRef);
      return true;
    } catch {
      return false;
    }
  }, []);

  const uploadItemImage = useCallback(
    async (uri: string | null | undefined): Promise<string | null> => {
      if (!uri) return null;
      const uid = "default_user";
      let blob: (Blob & { close?: () => void }) | null = null;
      try {
        const response = await fetch(uri);
        blob = (await response.blob()) as Blob & { close?: () => void };
        const imageRef = ref(storage, `items/${uid}/item_${Date.now()}.jpg`);
        await uploadBytes(imageRef, blob);
        const downloadUrl = await getDownloadURL(imageRef);
        return downloadUrl;
      } catch {
        // Offline or upload failed — return local URI so the item can still be created
        return uri;
      } finally {
        try {
          blob?.close?.();
        } catch {
          // ignore close failures
        }
      }
    },
    [],
  );

  const contextValue = useMemo<ItemContextType>(
    () => ({
      items,
      loading,
      addItem,
      updateItem,
      deleteItem,
      uploadItemImage,
    }),
    [items, loading, addItem, updateItem, deleteItem, uploadItemImage],
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

