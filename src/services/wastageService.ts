import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../config/firebase";

export interface WastageItemData {
  id?: string;
  itemName: string;
  itemType: string;
  category: string;
  isWastage: boolean;
  rawMaterialId: string;
  rateType: string;
  costPrice: number;
  sellingRate: number;
  openingStock: number;
  status: "Active" | "Inactive";
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Creates or updates a paired sellable Wastage product in the `items` collection.
 */
export async function createOrUpdateWastageProduct(
  rawMaterialId: string,
  rawMaterialName: string,
  wastageName: string,
  trackWastage: boolean,
  wastageSellingRate: number = 0,
  existingWastageItemId?: string,
  rateType: string = "bag"
): Promise<string | null> {
  const uid = "default_user";
  try {
    let targetDocId = existingWastageItemId || null;
    let targetDocData: any = null;

    if (targetDocId) {
      const snap = await getDoc(doc(db, "items", targetDocId));
      if (snap.exists()) {
        targetDocData = snap.data();
      } else {
        targetDocId = null;
      }
    }

    // Fallback: search by rawMaterialId and isWastage flag
    if (!targetDocId) {
      const q = query(
        collection(db, "items"),
        where("rawMaterialId", "==", rawMaterialId),
        where("isWastage", "==", true)
      );
      const querySnap = await getDocs(q);
      if (!querySnap.empty) {
        targetDocId = querySnap.docs[0].id;
        targetDocData = querySnap.docs[0].data();
      }
    }

    const finalWastageName = (wastageName || "").trim() || `${rawMaterialName.trim()} Wastage`;

    if (trackWastage) {
      if (targetDocId) {
        // Update existing wastage product
        await updateDoc(doc(db, "items", targetDocId), {
          itemName: finalWastageName,
          status: "Active",
          sellingRate: Number(wastageSellingRate) || 0,
          rateType: rateType || "bag",
          updatedAt: new Date(),
        });
        return targetDocId;
      } else {
        // Create new wastage product
        const newProductRef = await addDoc(collection(db, "items"), {
          itemName: finalWastageName,
          itemType: "product",
          category: "Wastage",
          isWastage: true,
          rawMaterialId,
          rateType: rateType || "bag",
          costPrice: 0,
          sellingRate: Number(wastageSellingRate) || 0,
          openingStock: 0,
          status: "Active",
          userId: uid,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        // Add initial stock audit record
        await addDoc(collection(db, "item_stock_logs"), {
          itemId: newProductRef.id,
          itemName: finalWastageName,
          itemType: "product",
          type: "initial",
          quantity: 0,
          previousStock: 0,
          newStock: 0,
          notes: `Wastage product initialized for raw material "${rawMaterialName}"`,
          date: new Date(),
          createdAt: new Date(),
        });

        return newProductRef.id;
      }
    } else {
      // Wastage tracking toggled OFF
      if (targetDocId) {
        await updateDoc(doc(db, "items", targetDocId), {
          status: "Inactive",
          updatedAt: new Date(),
        });
        return targetDocId;
      }
      return null;
    }
  } catch (error) {
    console.error("Error in createOrUpdateWastageProduct:", error);
    return null;
  }
}

/**
 * Synchronizes wastage product stock when raw material consumption occurs or is rolled back.
 * e.g., 2 bags of Cement used -> adds +2 units to the linked wastage product stock.
 */
export async function syncWastageStockOnConsumption(
  rawMaterialId: string,
  consumptionQty: number,
  notes?: string
): Promise<boolean> {
  if (!rawMaterialId || consumptionQty === 0 || isNaN(consumptionQty)) {
    return false;
  }

  try {
    // 1. Fetch raw material to check if trackWastage is enabled
    const rmRef = doc(db, "items", rawMaterialId);
    const rmSnap = await getDoc(rmRef);
    if (!rmSnap.exists()) return false;

    const rmData = rmSnap.data();
    if (!rmData.trackWastage) {
      return false;
    }

    // 2. Find the linked wastage product
    let wastageDocId = rmData.wastageItemId || null;
    let wastageDocData: any = null;

    if (wastageDocId) {
      const wSnap = await getDoc(doc(db, "items", wastageDocId));
      if (wSnap.exists()) {
        wastageDocData = wSnap.data();
      }
    }

    if (!wastageDocData) {
      const q = query(
        collection(db, "items"),
        where("rawMaterialId", "==", rawMaterialId),
        where("isWastage", "==", true)
      );
      const querySnap = await getDocs(q);
      if (!querySnap.empty) {
        wastageDocId = querySnap.docs[0].id;
        wastageDocData = querySnap.docs[0].data();
      }
    }

    // If no wastage product exists yet, create one
    if (!wastageDocId || !wastageDocData) {
      wastageDocId = await createOrUpdateWastageProduct(
        rawMaterialId,
        rmData.itemName || "Raw Material",
        rmData.wastageName || `${rmData.itemName || "Raw Material"} Wastage`,
        true,
        rmData.wastageSellingRate || 0,
        undefined,
        rmData.rateType || "bag"
      );
      if (wastageDocId) {
        const freshSnap = await getDoc(doc(db, "items", wastageDocId));
        if (freshSnap.exists()) {
          wastageDocData = freshSnap.data();
          // Update raw material with wastageItemId
          await updateDoc(rmRef, {
            wastageItemId: wastageDocId,
            updatedAt: new Date(),
          });
        }
      }
    }

    if (!wastageDocId || !wastageDocData) {
      return false;
    }

    const currentWastageStock = Number(
      wastageDocData.openingStock !== undefined
        ? wastageDocData.openingStock
        : wastageDocData.stock || 0
    );

    const newWastageStock = Math.max(0, currentWastageStock + consumptionQty);

    // 3. Update stock in items collection
    await updateDoc(doc(db, "items", wastageDocId), {
      openingStock: newWastageStock,
      updatedAt: new Date(),
    });

    // 4. Record stock movement log
    await addDoc(collection(db, "item_stock_logs"), {
      itemId: wastageDocId,
      itemName: wastageDocData.itemName || "Wastage",
      itemType: "product",
      type: consumptionQty > 0 ? "wastage_in" : "wastage_out",
      quantity: Math.abs(consumptionQty),
      previousStock: currentWastageStock,
      newStock: newWastageStock,
      notes:
        notes ||
        (consumptionQty > 0
          ? `Wastage added from consumption of ${consumptionQty} ${rmData.itemName || "material"}`
          : `Wastage adjusted from consumption rollback (${consumptionQty})`),
      date: new Date(),
      createdAt: new Date(),
    });

    return true;
  } catch (error) {
    console.error("Error in syncWastageStockOnConsumption:", error);
    return false;
  }
}

