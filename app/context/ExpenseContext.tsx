import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  writeBatch,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
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
import { db, normalizeDateValue, storage } from "../../src/config/firebase";
import type {
  Expense,
  ExpenseBudget,
  ExpensePayment,
  RecurringExpense,
} from "../../src/types/models";
import { roundCurrency } from "../../utils/currency";

export interface ExpenseContextType {
  expenses: Expense[];
  loading: boolean;
  addExpense: (expenseData: Partial<Expense> & Record<string, any>) => Promise<string | null>;
  updateExpense: (
    id: string,
    expenseData: Partial<Expense> & Record<string, any>,
  ) => Promise<boolean>;
  deleteExpense: (id: string) => Promise<boolean>;
  todayExpenses: number;

  expensePayments: ExpensePayment[];
  paymentsLoading: boolean;
  addExpensePayment: (
    expenseId: string,
    paymentData: Record<string, any>,
  ) => Promise<boolean>;
  undoExpensePayment: (paymentId: string) => Promise<boolean>;

  expenseBudgets: ExpenseBudget[];
  budgetsLoading: boolean;
  setBudget: (category: string, monthlyLimit: number) => Promise<boolean>;
  deleteBudget: (budgetId: string) => Promise<boolean>;
  getBudget: (category: string) => number;

  recurringExpenses: RecurringExpense[];
  recurringLoading: boolean;
  addRecurringExpense: (data: Partial<RecurringExpense> & Record<string, any>) => Promise<string | null>;
  updateRecurringExpense: (
    id: string,
    data: Partial<RecurringExpense> & Record<string, any>,
  ) => Promise<boolean>;
  deleteRecurringExpense: (id: string) => Promise<boolean>;
  logRecurringExpense: (recurringId: string) => Promise<string | null>;

  getMonthlyExpenses: (month: number, year: number) => Expense[];
  getCategoryTotals: (monthExpenses?: Expense[]) => Record<string, number>;
  getExpensesByDateRange: (startDate: Date, endDate: Date) => Expense[];
}

export const ExpenseContext = createContext<ExpenseContextType>({
  expenses: [],
  loading: true,
  addExpense: async () => null,
  updateExpense: async () => false,
  deleteExpense: async () => false,
  todayExpenses: 0,
  expensePayments: [],
  paymentsLoading: true,
  addExpensePayment: async () => false,
  undoExpensePayment: async () => false,
  expenseBudgets: [],
  budgetsLoading: true,
  setBudget: async () => false,
  deleteBudget: async () => false,
  getBudget: () => 0,
  recurringExpenses: [],
  recurringLoading: true,
  addRecurringExpense: async () => null,
  updateRecurringExpense: async () => false,
  deleteRecurringExpense: async () => false,
  logRecurringExpense: async () => null,
  getMonthlyExpenses: () => [],
  getCategoryTotals: () => ({}),
  getExpensesByDateRange: () => [],
});

export function ExpenseProvider({ children }: { children: ReactNode }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const expensesRef = useRef<Expense[]>(expenses);
  useEffect(() => {
    expensesRef.current = expenses;
  }, [expenses]);

  // New collections state
  const [expensePayments, setExpensePayments] = useState<ExpensePayment[]>([]);
  const [expenseBudgets, setExpenseBudgets] = useState<ExpenseBudget[]>([]);
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState<boolean>(true);
  const [budgetsLoading, setBudgetsLoading] = useState<boolean>(true);
  const [recurringLoading, setRecurringLoading] = useState<boolean>(true);

  const expenseBudgetsRef = useRef<ExpenseBudget[]>(expenseBudgets);
  useEffect(() => {
    expenseBudgetsRef.current = expenseBudgets;
  }, [expenseBudgets]);

  const recurringExpensesRef = useRef<RecurringExpense[]>(recurringExpenses);
  useEffect(() => {
    recurringExpensesRef.current = recurringExpenses;
  }, [recurringExpenses]);

  // Defer secondary expense listeners to reduce startup load
  const _deferReady = useDeferredInit();

  // ─── Expenses Listener (incremental updates via docChanges) ───
  const isInitialExpensesLoadRef = useRef<boolean>(true);
  useEffect(() => {
    setLoading(true);
    isInitialExpensesLoadRef.current = true;
    const expensesCollection = collection(db, "expenses");
    const q = query(expensesCollection, orderBy("expenseDate", "desc"));

    const normalizeExpenseDoc = (docSnap: QueryDocumentSnapshot): Expense => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        expenseDate: normalizeDateValue(data.expenseDate),
        createdAt: normalizeDateValue(data.createdAt),
      } as Expense;
    };

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (isInitialExpensesLoadRef.current) {
          isInitialExpensesLoadRef.current = false;
          const initial = snapshot.docs.map(normalizeExpenseDoc);
          expensesRef.current = initial;
          setExpenses(initial);
          setLoading(false);
          return;
        }

        const changes = snapshot.docChanges();
        if (changes.length === 0) return;

        setExpenses((prev) => {
          const map = new Map<string, Expense>(prev.map((e) => [e.id, e]));
          changes.forEach((change) => {
            if (change.type === "added" || change.type === "modified") {
              map.set(change.doc.id, normalizeExpenseDoc(change.doc));
            } else if (change.type === "removed") {
              map.delete(change.doc.id);
            }
          });
          const updated = Array.from(map.values());
          updated.sort((a, b) => {
            const timeA = a.expenseDate instanceof Date ? a.expenseDate.getTime() : 0;
            const timeB = b.expenseDate instanceof Date ? b.expenseDate.getTime() : 0;
            return timeB - timeA;
          });
          expensesRef.current = updated;
          return updated;
        });
        setLoading(false);
      },
      (error) => {
        console.warn("Expenses listener error:", error);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  // ─── Expense Payments Listener (deferred — not needed for dashboard) ───
  const isInitialPaymentsLoadRef = useRef<boolean>(true);
  useEffect(() => {
    if (!_deferReady) {
      setPaymentsLoading(false);
      return;
    }
    setPaymentsLoading(true);
    isInitialPaymentsLoadRef.current = true;
    const paymentsCollection = collection(db, "expense_payments");
    const q = query(paymentsCollection, orderBy("paidAt", "desc"));

    const normalizePaymentDoc = (d: QueryDocumentSnapshot): ExpensePayment => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        paidAt: normalizeDateValue(data.paidAt),
        createdAt: normalizeDateValue(data.createdAt),
      } as ExpensePayment;
    };

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (isInitialPaymentsLoadRef.current) {
          isInitialPaymentsLoadRef.current = false;
          const initial = snapshot.docs.map(normalizePaymentDoc);
          setExpensePayments(initial);
          setPaymentsLoading(false);
          return;
        }

        const changes = snapshot.docChanges();
        if (changes.length === 0) return;

        setExpensePayments((prev) => {
          const map = new Map<string, ExpensePayment>(prev.map((p) => [p.id, p]));
          changes.forEach((change) => {
            if (change.type === "added" || change.type === "modified") {
              map.set(change.doc.id, normalizePaymentDoc(change.doc));
            } else if (change.type === "removed") {
              map.delete(change.doc.id);
            }
          });
          const updated = Array.from(map.values());
          updated.sort((a, b) => {
            const timeA = a.paidAt instanceof Date ? a.paidAt.getTime() : 0;
            const timeB = b.paidAt instanceof Date ? b.paidAt.getTime() : 0;
            return timeB - timeA;
          });
          return updated;
        });
        setPaymentsLoading(false);
      },
      (error) => {
        console.warn("Expense payments listener error:", error);
        setPaymentsLoading(false);
      },
    );

    return () => unsubscribe();
  }, [_deferReady]);

  // ─── Expense Budgets Listener (deferred) ───
  useEffect(() => {
    if (!_deferReady) {
      setBudgetsLoading(false);
      return;
    }
    setBudgetsLoading(true);
    const budgetsCollection = collection(db, "expense_budgets");

    const unsubscribe = onSnapshot(
      budgetsCollection,
      (snapshot) => {
        const dbBudgets = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as ExpenseBudget[];
        expenseBudgetsRef.current = dbBudgets;
        setExpenseBudgets(dbBudgets);
        setBudgetsLoading(false);
      },
      () => {
        setBudgetsLoading(false);
      },
    );

    return () => unsubscribe();
  }, [_deferReady]);

  // ─── Recurring Expenses Listener (deferred) ───
  useEffect(() => {
    if (!_deferReady) {
      setRecurringLoading(false);
      return;
    }
    setRecurringLoading(true);
    const recurringCollection = collection(db, "recurring_expenses");

    const unsubscribe = onSnapshot(
      recurringCollection,
      (snapshot) => {
        const dbRecurring = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            amount: Number(data.amount || 0),
            nextDueDate: normalizeDateValue(data.nextDueDate),
            createdAt: normalizeDateValue(data.createdAt),
          } as RecurringExpense;
        });
        recurringExpensesRef.current = dbRecurring;
        setRecurringExpenses(dbRecurring);
        setRecurringLoading(false);
      },
      () => {
        setRecurringLoading(false);
      },
    );

    return () => unsubscribe();
  }, [_deferReady]);

  // ─── Image Upload ───
  const uploadExpenseImage = useCallback(async (uri: string): Promise<string> => {
    if (!uri) return "";
    if (uri.startsWith("http://") || uri.startsWith("https://")) {
      return uri;
    }
    const uid = "default_user";
    let blob: (Blob & { close?: () => void }) | null = null;
    try {
      const response = await fetch(uri);
      blob = (await response.blob()) as Blob & { close?: () => void };
      const imageRef = ref(storage, `expenses/${uid}/expense_${Date.now()}.jpg`);
      await uploadBytes(imageRef, blob);
      const downloadUrl = await getDownloadURL(imageRef);
      return downloadUrl;
    } catch {
      // Offline or upload failed — return local URI so the expense can still be created
      return uri;
    } finally {
      try {
        blob?.close?.();
      } catch {
        // Ignore blob close failures
      }
    }
  }, []);

  // ─── Expense CRUD ───
  const addExpense = useCallback(
    async (expenseData: Partial<Expense> & Record<string, any>): Promise<string | null> => {
      try {
        let finalImageUrl = "";
        if (expenseData.billImageUri) {
          finalImageUrl = await uploadExpenseImage(expenseData.billImageUri);
        }

        const expensePayload = {
          title: expenseData.title || "",
          amount: roundCurrency(Number(expenseData.amount || 0)),
          totalAmount: roundCurrency(
            Number(
              expenseData.totalAmount !== undefined
                ? expenseData.totalAmount
                : expenseData.amount || 0,
            ),
          ),
          paidAmount: roundCurrency(
            Number(
              expenseData.paidAmount !== undefined
                ? expenseData.paidAmount
                : expenseData.amount || 0,
            ),
          ),
          remainingAmount: roundCurrency(
            Number(
              expenseData.remainingAmount !== undefined ? expenseData.remainingAmount : 0,
            ),
          ),
          status: expenseData.status || "Paid",
          category: expenseData.category || "Miscellaneous",
          paymentMethod: expenseData.paymentMethod || "Cash",
          description: expenseData.description || "",
          billImageUrl: finalImageUrl,
          expenseDate: normalizeDateValue(expenseData.expenseDate),
          createdAt: new Date(),
        };

        const docRef = await addDoc(collection(db, "expenses"), expensePayload);
        return docRef.id;
      } catch {
        return null;
      }
    },
    [uploadExpenseImage],
  );

  const updateExpense = useCallback(
    async (
      id: string,
      expenseData: Partial<Expense> & Record<string, any>,
    ): Promise<boolean> => {
      try {
        let finalImageUrl = expenseData.billImageUrl || "";
        if (expenseData.billImageUri) {
          finalImageUrl = await uploadExpenseImage(expenseData.billImageUri);
        }

        const expenseRef = doc(db, "expenses", id);
        const expensePayload = {
          title: expenseData.title,
          amount: roundCurrency(Number(expenseData.amount || 0)),
          totalAmount: roundCurrency(
            Number(
              expenseData.totalAmount !== undefined
                ? expenseData.totalAmount
                : expenseData.amount || 0,
            ),
          ),
          paidAmount: roundCurrency(
            Number(
              expenseData.paidAmount !== undefined
                ? expenseData.paidAmount
                : expenseData.amount || 0,
            ),
          ),
          remainingAmount: roundCurrency(
            Number(
              expenseData.remainingAmount !== undefined ? expenseData.remainingAmount : 0,
            ),
          ),
          status: expenseData.status || "Paid",
          category: expenseData.category,
          paymentMethod: expenseData.paymentMethod,
          description: expenseData.description || "",
          billImageUrl: finalImageUrl,
          expenseDate: normalizeDateValue(expenseData.expenseDate),
          updatedAt: new Date(),
        };

        await updateDoc(expenseRef, expensePayload);
        return true;
      } catch {
        return false;
      }
    },
    [uploadExpenseImage],
  );

  const deleteExpense = useCallback(async (id: string): Promise<boolean> => {
    try {
      const expenseRef = doc(db, "expenses", id);
      await deleteDoc(expenseRef);
      return true;
    } catch {
      return false;
    }
  }, []);

  // ─── Expense Payments CRUD ───
  const addExpensePayment = useCallback(
    async (expenseId: string, paymentData: Record<string, any>): Promise<boolean> => {
      try {
        const expenseRef = doc(db, "expenses", expenseId);
        const expenseSnap = await getDoc(expenseRef);

        if (!expenseSnap.exists()) {
          throw new Error("Expense not found");
        }

        const expenseDoc = expenseSnap.data();
        const currentPaid = roundCurrency(Number(expenseDoc.paidAmount || 0));
        const payAmount = roundCurrency(Number(paymentData.amount || 0));
        const newPaidAmount = roundCurrency(currentPaid + payAmount);
        const totalAmount = roundCurrency(
          Number(expenseDoc.totalAmount || expenseDoc.amount || 0),
        );
        const newRemainingAmount = Math.max(
          0,
          roundCurrency(totalAmount - newPaidAmount),
        );
        const newStatus = newRemainingAmount === 0 ? "Paid" : "Balance";

        const batch = writeBatch(db);

        batch.update(expenseRef, {
          paidAmount: newPaidAmount,
          remainingAmount: newRemainingAmount,
          status: newStatus,
          updatedAt: new Date(),
        });

        const paymentDocRef = doc(collection(db, "expense_payments"));
        const paymentDate = paymentData.paidAt
          ? normalizeDateValue(paymentData.paidAt)
          : paymentData.date
            ? normalizeDateValue(paymentData.date)
            : new Date();

        batch.set(paymentDocRef, {
          expenseId,
          expenseTitle: expenseDoc.title || "",
          expenseCategory: expenseDoc.category || "Miscellaneous",
          amount: payAmount,
          paymentMethod: paymentData.paymentMethod || "Cash",
          notes: paymentData.notes || "",
          paidAt: paymentDate,
          createdAt: new Date(),
        });

        await batch.commit();
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  const undoExpensePayment = useCallback(async (paymentId: string): Promise<boolean> => {
    try {
      const paymentRef = doc(db, "expense_payments", paymentId);
      const paymentSnap = await getDoc(paymentRef);

      if (!paymentSnap.exists()) {
        throw new Error("Payment record not found");
      }

      const paymentDoc = paymentSnap.data();
      const payAmount = roundCurrency(Number(paymentDoc.amount || 0));
      const expenseId = paymentDoc.expenseId;

      const batch = writeBatch(db);

      const expenseRef = doc(db, "expenses", expenseId);
      const expenseSnap = await getDoc(expenseRef);

      if (expenseSnap.exists()) {
        const expenseDoc = expenseSnap.data();
        const currentPaid = roundCurrency(Number(expenseDoc.paidAmount || 0));
        const totalAmount = roundCurrency(
          Number(expenseDoc.totalAmount || expenseDoc.amount || 0),
        );
        const newPaidAmount = Math.max(0, roundCurrency(currentPaid - payAmount));
        const newRemainingAmount = Math.max(
          0,
          roundCurrency(totalAmount - newPaidAmount),
        );
        const newStatus = newRemainingAmount === 0 ? "Paid" : "Balance";

        batch.update(expenseRef, {
          paidAmount: newPaidAmount,
          remainingAmount: newRemainingAmount,
          status: newStatus,
          updatedAt: new Date(),
        });
      }

      batch.delete(paymentRef);
      await batch.commit();

      return true;
    } catch {
      return false;
    }
  }, []);

  // ─── Budget CRUD ───
  const setBudget = useCallback(
    async (category: string, monthlyLimit: number): Promise<boolean> => {
      try {
        const existing = (expenseBudgetsRef.current || []).find(
          (b) => b.category === category,
        );
        if (existing) {
          const budgetRef = doc(db, "expense_budgets", existing.id);
          await updateDoc(budgetRef, {
            monthlyLimit: roundCurrency(Number(monthlyLimit)),
            updatedAt: new Date(),
          });
        } else {
          await addDoc(collection(db, "expense_budgets"), {
            category,
            monthlyLimit: roundCurrency(Number(monthlyLimit)),
            createdAt: new Date(),
          });
        }
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  const deleteBudget = useCallback(async (budgetId: string): Promise<boolean> => {
    try {
      await deleteDoc(doc(db, "expense_budgets", budgetId));
      return true;
    } catch {
      return false;
    }
  }, []);

  const getBudget = useCallback((category: string): number => {
    const budget = (expenseBudgetsRef.current || []).find((b) => b.category === category);
    return budget ? Number(budget.monthlyLimit || 0) : 0;
  }, []);

  // ─── Recurring Expenses CRUD ───
  const addRecurringExpense = useCallback(
    async (data: Partial<RecurringExpense> & Record<string, any>): Promise<string | null> => {
      try {
        const payload = {
          title: data.title || "",
          amount: roundCurrency(Number(data.amount || 0)),
          category: data.category || "Miscellaneous",
          frequency: data.frequency || "monthly",
          paymentMethod: data.paymentMethod || "Cash",
          description: data.description || "",
          nextDueDate: data.nextDueDate ? normalizeDateValue(data.nextDueDate) : new Date(),
          isActive: true,
          createdAt: new Date(),
        };
        const docRef = await addDoc(collection(db, "recurring_expenses"), payload);
        return docRef.id;
      } catch {
        return null;
      }
    },
    [],
  );

  const updateRecurringExpense = useCallback(
    async (
      id: string,
      data: Partial<RecurringExpense> & Record<string, any>,
    ): Promise<boolean> => {
      try {
        const recRef = doc(db, "recurring_expenses", id);
        await updateDoc(recRef, {
          title: data.title,
          amount: roundCurrency(Number(data.amount || 0)),
          category: data.category,
          frequency: data.frequency,
          paymentMethod: data.paymentMethod || "Cash",
          description: data.description || "",
          nextDueDate: data.nextDueDate ? normalizeDateValue(data.nextDueDate) : new Date(),
          isActive: data.isActive !== undefined ? data.isActive : true,
          updatedAt: new Date(),
        });
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  const deleteRecurringExpense = useCallback(async (id: string): Promise<boolean> => {
    try {
      await deleteDoc(doc(db, "recurring_expenses", id));
      return true;
    } catch {
      return false;
    }
  }, []);

  const logRecurringExpense = useCallback(
    async (recurringId: string): Promise<string | null> => {
      const template = (recurringExpensesRef.current || []).find(
        (r) => r.id === recurringId,
      );
      if (!template) return null;

      // Create expense from template
      const newExpenseId = await addExpense({
        title: template.title,
        amount: template.amount,
        totalAmount: template.amount,
        paidAmount: template.amount,
        remainingAmount: 0,
        status: "Paid",
        category: template.category,
        paymentMethod:
          typeof template.paymentMethod === "string" ? template.paymentMethod : "Cash",
        description:
          template.description || `Auto-logged from recurring: ${template.title}`,
        expenseDate: new Date(),
      });

      if (newExpenseId) {
        // Advance next due date
        const currentDue =
          template.nextDueDate instanceof Date
            ? template.nextDueDate
            : normalizeDateValue(template.nextDueDate);
        const nextDue = new Date(currentDue);
        if (template.frequency === "weekly") {
          nextDue.setDate(nextDue.getDate() + 7);
        } else {
          nextDue.setMonth(nextDue.getMonth() + 1);
        }

        await updateRecurringExpense(recurringId, {
          ...template,
          nextDueDate: nextDue,
        });
      }

      return newExpenseId;
    },
    [addExpense, updateRecurringExpense],
  );

  // ─── Helper Functions ───
  const getMonthlyExpenses = useCallback((month: number, year: number): Expense[] => {
    return (expensesRef.current || []).filter((e) => {
      const d =
        e.expenseDate instanceof Date ? e.expenseDate : normalizeDateValue(e.expenseDate);
      return d.getMonth() === month && d.getFullYear() === year;
    });
  }, []);

  const getCategoryTotals = useCallback(
    (monthExpenses?: Expense[]): Record<string, number> => {
      const list = monthExpenses || expensesRef.current || [];
      return list.reduce<Record<string, number>>((acc, e) => {
        const cat = e.category || "Miscellaneous";
        acc[cat] = roundCurrency((acc[cat] || 0) + Number(e.amount || 0));
        return acc;
      }, {});
    },
    [],
  );

  const getExpensesByDateRange = useCallback(
    (startDate: Date, endDate: Date): Expense[] => {
      return (expensesRef.current || []).filter((e) => {
        const d =
          e.expenseDate instanceof Date ? e.expenseDate : normalizeDateValue(e.expenseDate);
        return d >= startDate && d <= endDate;
      });
    },
    [],
  );

  const todayExpenses = useMemo(() => {
    const todayStr = new Date().toDateString();
    return roundCurrency(
      expenses
        .filter((e) => {
          const d =
            e.expenseDate instanceof Date
              ? e.expenseDate
              : normalizeDateValue(e.expenseDate);
          return d.toDateString() === todayStr;
        })
        .reduce((sum, e) => sum + Number(e.amount || 0), 0),
    );
  }, [expenses]);

  const contextValue = useMemo<ExpenseContextType>(
    () => ({
      expenses,
      loading,
      addExpense,
      updateExpense,
      deleteExpense,
      todayExpenses,

      expensePayments,
      paymentsLoading,
      addExpensePayment,
      undoExpensePayment,

      expenseBudgets,
      budgetsLoading,
      setBudget,
      deleteBudget,
      getBudget,

      recurringExpenses,
      recurringLoading,
      addRecurringExpense,
      updateRecurringExpense,
      deleteRecurringExpense,
      logRecurringExpense,

      getMonthlyExpenses,
      getCategoryTotals,
      getExpensesByDateRange,
    }),
    [
      expenses,
      loading,
      addExpense,
      updateExpense,
      deleteExpense,
      todayExpenses,
      expensePayments,
      paymentsLoading,
      addExpensePayment,
      undoExpensePayment,
      expenseBudgets,
      budgetsLoading,
      setBudget,
      deleteBudget,
      getBudget,
      recurringExpenses,
      recurringLoading,
      addRecurringExpense,
      updateRecurringExpense,
      deleteRecurringExpense,
      logRecurringExpense,
      getMonthlyExpenses,
      getCategoryTotals,
      getExpensesByDateRange,
    ],
  );

  return (
    <ExpenseContext.Provider value={contextValue}>
      {children}
    </ExpenseContext.Provider>
  );
}

export default function ExpenseRoutePlaceholder() {
  return null;
}
