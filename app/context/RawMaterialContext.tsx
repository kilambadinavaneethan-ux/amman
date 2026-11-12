import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
  writeBatch,
  type DocumentData,
  type DocumentReference,
} from "firebase/firestore";
import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useDeferredInit } from "../../hooks/useDeferredInit";
import { db, normalizeDateValue } from "../../src/config/firebase";
import { syncWastageStockOnConsumption } from "../../src/services/wastageService";
import type { RawMaterialPurchase } from "../../src/types/models";
import { roundCurrency } from "../../utils/currency";

export interface RawMaterialContextType {
  logs: RawMaterialPurchase[];
  loading: boolean;
  addTransaction: (txData: Partial<RawMaterialPurchase> & Record<string, any>) => Promise<boolean>;
  deleteTransaction: (logId: string) => Promise<boolean>;
  updateTransaction: (
    logId: string,
    updatedData: Partial<RawMaterialPurchase> & Record<string, any>,
  ) => Promise<boolean>;
}

export const RawMaterialContext = createContext<RawMaterialContextType>({
  logs: [],
  loading: true,
  addTransaction: async () => false,
  deleteTransaction: async () => false,
  updateTransaction: async () => false,
});

export function RawMaterialProvider({ children }: { children: ReactNode }) {
  const [logs, setLogs] = useState<RawMaterialPurchase[]>([]);
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
    const logsCollection = collection(db, "raw_material_logs");
    const q = query(logsCollection, where("userId", "==", uid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const dbLogs = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            ...data,
            date: normalizeDateValue(data.date),
            createdAt: normalizeDateValue(data.createdAt),
          } as RawMaterialPurchase & { date: Date; createdAt: Date };
        });

        // Sort in memory by date descending (to avoid composite index requirement)
        dbLogs.sort((a, b) => b.date.getTime() - a.date.getTime());

        setLogs(dbLogs);
        setLoading(false);
      },
      () => {
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [_deferReady]);

  const addTransaction = useCallback(
    async (txData: Partial<RawMaterialPurchase> & Record<string, any>): Promise<boolean> => {
      const uid = "default_user";
      const batch = writeBatch(db);

      // --- READS (served from cache when offline) ---
      let itemData: DocumentData | null = null;
      let itemRef: DocumentReference | null = null;
      if (txData.materialId) {
        itemRef = doc(db, "items", txData.materialId);
        const itemSnap = await getDoc(itemRef);
        if (itemSnap.exists()) itemData = itemSnap.data();
      }

      let supplierData: DocumentData | null = null;
      let supplierRef: DocumentReference | null = null;
      if (txData.supplierId) {
        supplierRef = doc(db, "raw_material_suppliers", txData.supplierId);
        const supplierSnap = await getDoc(supplierRef);
        if (supplierSnap.exists()) supplierData = supplierSnap.data();
      }

      // --- WRITES (queued offline) ---
      // 1. Update material stock if item exists
      if (itemData && itemRef) {
        const currentStock = Number(
          itemData.openingStock !== undefined ? itemData.openingStock : itemData.stock || 0,
        );
        const txQty = Number(txData.quantity);

        if (txData.type === "consumption") {
          const reorderThreshold = Number(
            itemData.reorderLevel !== undefined ? itemData.reorderLevel : 5,
          );
          if (currentStock <= reorderThreshold) {
            throw new Error(
              `Material "${itemData.itemName || "Raw Material"}" is in Low Stock (${currentStock} <= threshold ${reorderThreshold}). Consumption not allowed.`,
            );
          }
          if (txQty > currentStock) {
            throw new Error(
              `Insufficient stock for "${itemData.itemName || "Raw Material"}". Available: ${currentStock}, Requested: ${txQty}`,
            );
          }
          if (currentStock - txQty < reorderThreshold) {
            throw new Error(
              `Consumption would drop stock of "${itemData.itemName || "Raw Material"}" to ${currentStock - txQty}, which is below the reorder threshold (${reorderThreshold}). Transaction blocked.`,
            );
          }
        }

        let newStock = currentStock;
        if (txData.type === "purchase") {
          newStock = currentStock + txQty;
        } else if (txData.type === "consumption") {
          newStock = Math.max(0, currentStock - txQty);
        } else if (txData.type === "adjustment") {
          newStock = txQty;
        }

        batch.update(itemRef, {
          openingStock: newStock,
          updatedAt: new Date(),
        });

        // Log stock movement
        const itemStockLogRef = doc(collection(db, "item_stock_logs"));
        batch.set(itemStockLogRef, {
          itemId: txData.materialId,
          itemName: itemData.itemName || "Unknown Material",
          itemType: "raw_material",
          type: txData.type,
          quantity: txData.type === "consumption" ? -txQty : txQty,
          previousStock: currentStock,
          newStock,
          notes: txData.notes || `Logged raw material ${txData.type}`,
          date: txData.date ? normalizeDateValue(txData.date) : new Date(),
          createdAt: new Date(),
        });
      }

      // 2. Update Supplier balance if supplier exists
      if (supplierData && supplierRef) {
        const currentBalance = roundCurrency(Number(supplierData.balance || 0));
        let newBalance = currentBalance;

        if (txData.type === "purchase" && txData.remainingBalance) {
          newBalance = roundCurrency(currentBalance + Number(txData.remainingBalance));
        } else if (txData.type === "payment" && txData.amount) {
          newBalance = roundCurrency(currentBalance - Number(txData.amount));
        }

        batch.update(supplierRef, {
          balance: newBalance,
          updatedAt: new Date(),
        });
      }

      // 3. Create new log document
      const logDocRef = doc(collection(db, "raw_material_logs"));
      batch.set(logDocRef, {
        ...txData,
        userId: uid,
        date: txData.date ? normalizeDateValue(txData.date) : new Date(),
        createdAt: new Date(),
      });

      await batch.commit();

      // Synchronize wastage stock if this transaction is consumption
      if (txData.type === "consumption" && txData.materialId) {
        try {
          await syncWastageStockOnConsumption(
            txData.materialId,
            Number(txData.quantity),
            txData.notes || `Consumption of ${txData.quantity} units`,
          );
        } catch (wastageErr) {
          console.error("Error syncing wastage on consumption:", wastageErr);
        }
      }

      return true;
    },
    [],
  );

  const deleteTransaction = useCallback(async (logId: string): Promise<boolean> => {
    try {
      const logRef = doc(db, "raw_material_logs", logId);
      const logSnap = await getDoc(logRef);
      if (!logSnap.exists()) {
        throw new Error("Transaction log does not exist!");
      }

      const logData = logSnap.data();
      const batch = writeBatch(db);

      // --- READS ---
      let itemData: DocumentData | null = null;
      let itemRef: DocumentReference | null = null;
      if (logData.materialId) {
        itemRef = doc(db, "items", logData.materialId);
        const itemSnap = await getDoc(itemRef);
        if (itemSnap.exists()) itemData = itemSnap.data();
      }

      let supplierData: DocumentData | null = null;
      let supplierRef: DocumentReference | null = null;
      if (logData.supplierId) {
        supplierRef = doc(db, "raw_material_suppliers", logData.supplierId);
        const supplierSnap = await getDoc(supplierRef);
        if (supplierSnap.exists()) supplierData = supplierSnap.data();
      }

      // --- WRITES ---
      // 1. Rollback stock
      if (itemData && itemRef) {
        const currentStock = Number(
          itemData.openingStock !== undefined ? itemData.openingStock : itemData.stock || 0,
        );
        const logQty = Number(logData.quantity);

        let rollbackedStock = currentStock;
        if (logData.type === "purchase") {
          rollbackedStock = Math.max(0, currentStock - logQty);
        } else if (logData.type === "consumption") {
          rollbackedStock = currentStock + logQty;
        }

        batch.update(itemRef, {
          openingStock: rollbackedStock,
          updatedAt: new Date(),
        });

        // Log stock rollback
        const itemStockLogRef = doc(collection(db, "item_stock_logs"));
        batch.set(itemStockLogRef, {
          itemId: logData.materialId,
          itemName: itemData.itemName || "Unknown Material",
          itemType: "raw_material",
          type: "rollback",
          quantity: logData.type === "purchase" ? -logQty : logQty,
          previousStock: currentStock,
          newStock: rollbackedStock,
          notes: `Deleted raw material transaction: rollback of ${logData.type}`,
          date: new Date(),
          createdAt: new Date(),
        });
      }

      // 2. Rollback supplier balance
      if (supplierData && supplierRef) {
        const currentBalance = roundCurrency(Number(supplierData.balance || 0));
        let rollbackedBalance = currentBalance;

        if (logData.type === "purchase" && logData.remainingBalance) {
          rollbackedBalance = Math.max(
            0,
            roundCurrency(currentBalance - Number(logData.remainingBalance)),
          );
        } else if (logData.type === "payment" && logData.amount) {
          rollbackedBalance = roundCurrency(currentBalance + Number(logData.amount));
        } else if (logData.type === "opening" && logData.amount) {
          rollbackedBalance = Math.max(
            0,
            roundCurrency(currentBalance - Number(logData.amount)),
          );
        }

        batch.update(supplierRef, {
          balance: rollbackedBalance,
          updatedAt: new Date(),
        });
      }

      // 3. Delete the log entry
      batch.delete(logRef);
      await batch.commit();

      // Synchronize wastage stock rollback if this deleted transaction was consumption
      if (logData.type === "consumption" && logData.materialId) {
        try {
          await syncWastageStockOnConsumption(
            logData.materialId,
            -Number(logData.quantity),
            `Rollback: deleted consumption log of ${logData.quantity}`,
          );
        } catch (wastageErr) {
          console.error("Error rolling back wastage on log delete:", wastageErr);
        }
      }

      return true;
    } catch {
      return false;
    }
  }, []);

  const updateTransaction = useCallback(
    async (
      logId: string,
      updatedData: Partial<RawMaterialPurchase> & Record<string, any>,
    ): Promise<boolean> => {
      try {
        const logRef = doc(db, "raw_material_logs", logId);
        const logSnap = await getDoc(logRef);
        if (!logSnap.exists()) {
          throw new Error("Transaction log does not exist!");
        }

        const oldData = logSnap.data();
        const batch = writeBatch(db);

        // --- READS ---
        let oldItemData: DocumentData | null = null;
        let oldItemRef: DocumentReference | null = null;
        if (oldData.materialId) {
          oldItemRef = doc(db, "items", oldData.materialId);
          const oldItemSnap = await getDoc(oldItemRef);
          if (oldItemSnap.exists()) oldItemData = oldItemSnap.data();
        }

        let newItemData: DocumentData | null = null;
        let newItemRef: DocumentReference | null = null;
        const newMaterialId = updatedData.materialId || oldData.materialId;
        if (newMaterialId) {
          if (newMaterialId === oldData.materialId) {
            newItemRef = oldItemRef;
            newItemData = oldItemData;
          } else {
            newItemRef = doc(db, "items", newMaterialId);
            const newItemSnap = await getDoc(newItemRef);
            if (newItemSnap.exists()) newItemData = newItemSnap.data();
          }
        }

        let oldSupplierData: DocumentData | null = null;
        let oldSupplierRef: DocumentReference | null = null;
        if (oldData.supplierId) {
          oldSupplierRef = doc(db, "raw_material_suppliers", oldData.supplierId);
          const oldSupplierSnap = await getDoc(oldSupplierRef);
          if (oldSupplierSnap.exists()) oldSupplierData = oldSupplierSnap.data();
        }

        let newSupplierData: DocumentData | null = null;
        let newSupplierRef: DocumentReference | null = null;
        const newSupplierId =
          updatedData.supplierId !== undefined ? updatedData.supplierId : oldData.supplierId;
        if (newSupplierId) {
          if (newSupplierId === oldData.supplierId) {
            newSupplierRef = oldSupplierRef;
            newSupplierData = oldSupplierData;
          } else {
            newSupplierRef = doc(db, "raw_material_suppliers", newSupplierId);
            const newSupplierSnap = await getDoc(newSupplierRef);
            if (newSupplierSnap.exists()) newSupplierData = newSupplierSnap.data();
          }
        }

        // --- WRITES ---
        // 1. Reconcile stock for old/new items
        if (oldItemData && oldItemRef) {
          let currentStock = Number(
            oldItemData.openingStock !== undefined
              ? oldItemData.openingStock
              : oldItemData.stock || 0,
          );

          if (oldData.type === "purchase") {
            currentStock = currentStock - Number(oldData.quantity);
          } else if (oldData.type === "consumption") {
            currentStock = currentStock + Number(oldData.quantity);
          }

          if (newMaterialId === oldData.materialId) {
            const newQty = Number(
              updatedData.quantity !== undefined ? updatedData.quantity : oldData.quantity,
            );
            if (oldData.type === "purchase") {
              currentStock = Math.max(0, currentStock + newQty);
            } else if (oldData.type === "consumption") {
              currentStock = Math.max(0, currentStock - newQty);
            }
            batch.update(oldItemRef, {
              openingStock: currentStock,
              updatedAt: new Date(),
            });
          } else {
            batch.update(oldItemRef, {
              openingStock: currentStock,
              updatedAt: new Date(),
            });

            if (newItemData && newItemRef) {
              let newStock = Number(
                newItemData.openingStock !== undefined
                  ? newItemData.openingStock
                  : newItemData.stock || 0,
              );
              const newQty = Number(
                updatedData.quantity !== undefined ? updatedData.quantity : oldData.quantity,
              );
              if (oldData.type === "purchase") {
                newStock = newStock + newQty;
              } else if (oldData.type === "consumption") {
                newStock = Math.max(0, newStock - newQty);
              }
              batch.update(newItemRef, {
                openingStock: newStock,
                updatedAt: new Date(),
              });
            }
          }
        }

        // 2. Reconcile supplier balance
        if (oldSupplierData && oldSupplierRef) {
          let oldBalance = roundCurrency(Number(oldSupplierData.balance || 0));

          if (oldData.type === "purchase" && oldData.remainingBalance) {
            oldBalance = Math.max(
              0,
              roundCurrency(oldBalance - Number(oldData.remainingBalance)),
            );
          } else if (oldData.type === "payment" && oldData.amount) {
            oldBalance = roundCurrency(oldBalance + Number(oldData.amount));
          } else if (oldData.type === "opening" && oldData.amount) {
            oldBalance = roundCurrency(oldBalance - Number(oldData.amount));
          }

          if (newSupplierId === oldData.supplierId) {
            if (oldData.type === "purchase") {
              const newRemaining = Number(
                updatedData.remainingBalance !== undefined
                  ? updatedData.remainingBalance
                  : oldData.remainingBalance,
              );
              oldBalance = roundCurrency(oldBalance + newRemaining);
            } else if (oldData.type === "payment") {
              const newAmount = Number(
                updatedData.amount !== undefined ? updatedData.amount : oldData.amount,
              );
              oldBalance = Math.max(0, roundCurrency(oldBalance - newAmount));
            } else if (oldData.type === "opening") {
              const newAmount = Number(
                updatedData.amount !== undefined ? updatedData.amount : oldData.amount,
              );
              oldBalance = roundCurrency(oldBalance + newAmount);
            }
            batch.update(oldSupplierRef, {
              balance: oldBalance,
              updatedAt: new Date(),
            });
          } else {
            batch.update(oldSupplierRef, {
              balance: oldBalance,
              updatedAt: new Date(),
            });

            if (newSupplierData && newSupplierRef) {
              let newBalance = roundCurrency(Number(newSupplierData.balance || 0));
              if (oldData.type === "purchase") {
                const newRemaining = Number(
                  updatedData.remainingBalance !== undefined
                    ? updatedData.remainingBalance
                    : oldData.remainingBalance,
                );
                newBalance = roundCurrency(newBalance + newRemaining);
              } else if (oldData.type === "payment") {
                const newAmount = Number(
                  updatedData.amount !== undefined ? updatedData.amount : oldData.amount,
                );
                newBalance = Math.max(0, roundCurrency(newBalance - newAmount));
              }
              batch.update(newSupplierRef, {
                balance: newBalance,
                updatedAt: new Date(),
              });
            }
          }
        } else if (newSupplierId && newSupplierId !== oldData.supplierId) {
          if (newSupplierData && newSupplierRef) {
            let newBalance = roundCurrency(Number(newSupplierData.balance || 0));
            if (oldData.type === "purchase") {
              const newRemaining = Number(
                updatedData.remainingBalance !== undefined
                  ? updatedData.remainingBalance
                  : oldData.remainingBalance,
              );
              newBalance = roundCurrency(newBalance + newRemaining);
            } else if (oldData.type === "payment") {
              const newAmount = Number(
                updatedData.amount !== undefined ? updatedData.amount : oldData.amount,
              );
              newBalance = Math.max(0, roundCurrency(newBalance - newAmount));
            }
            batch.update(newSupplierRef, {
              balance: newBalance,
              updatedAt: new Date(),
            });
          }
        }

        // 3. Update the log document itself
        batch.update(logRef, {
          ...updatedData,
          updatedAt: new Date(),
        });

        await batch.commit();

        if (oldData.type === "consumption") {
          const oldQty = Number(oldData.quantity || 0);
          const newQty = Number(
            updatedData.quantity !== undefined ? updatedData.quantity : oldQty,
          );
          const diff = newQty - oldQty;
          if (diff !== 0 && oldData.materialId) {
            try {
              await syncWastageStockOnConsumption(
                oldData.materialId,
                diff,
                `Consumption quantity updated (${oldQty} -> ${newQty})`,
              );
            } catch (wastageErr) {
              console.error("Error updating wastage on transaction edit:", wastageErr);
            }
          }
        }

        setLogs((prev) =>
          prev.map((l) =>
            l.id === logId
              ? ({ ...l, ...updatedData, id: logId, updatedAt: new Date() } as RawMaterialPurchase)
              : l,
          ),
        );
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  const contextValue = useMemo<RawMaterialContextType>(
    () => ({
      logs,
      loading,
      addTransaction,
      deleteTransaction,
      updateTransaction,
    }),
    [logs, loading, addTransaction, deleteTransaction, updateTransaction],
  );

  return (
    <RawMaterialContext.Provider value={contextValue}>
      {children}
    </RawMaterialContext.Provider>
  );
}

export default function RawMaterialRoutePlaceholder() {
  return null;
}

