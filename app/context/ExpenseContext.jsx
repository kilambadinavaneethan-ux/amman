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
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { createContext, useEffect, useState, useMemo } from "react";
import { db, normalizeDateValue, storage } from "../../src/config/firebase";

export const ExpenseContext = createContext(null);

export function ExpenseProvider({ children }) {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  // New collections state
  const [expensePayments, setExpensePayments] = useState([]);
  const [expenseBudgets, setExpenseBudgets] = useState([]);
  const [recurringExpenses, setRecurringExpenses] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [budgetsLoading, setBudgetsLoading] = useState(true);
  const [recurringLoading, setRecurringLoading] = useState(true);

  // ─── Expenses Listener (existing) ───
  useEffect(() => {
    setLoading(true);
    const expensesCollection = collection(db, "expenses");
    const q = query(expensesCollection, orderBy("expenseDate", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const dbExpenses = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            expenseDate: normalizeDateValue(data.expenseDate),
            createdAt: normalizeDateValue(data.createdAt),
          };
        });
        setExpenses(dbExpenses);
        setLoading(false);
      },
      (error) => {
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  // ─── Expense Payments Listener ───
  useEffect(() => {
    setPaymentsLoading(true);
    const paymentsCollection = collection(db, "expense_payments");
    const q = query(paymentsCollection, orderBy("paidAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const dbPayments = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            paidAt: normalizeDateValue(data.paidAt),
            createdAt: normalizeDateValue(data.createdAt),
          };
        });
        setExpensePayments(dbPayments);
        setPaymentsLoading(false);
      },
      (error) => {
        setPaymentsLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  // ─── Expense Budgets Listener ───
  useEffect(() => {
    setBudgetsLoading(true);
    const budgetsCollection = collection(db, "expense_budgets");

    const unsubscribe = onSnapshot(
      budgetsCollection,
      (snapshot) => {
        const dbBudgets = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setExpenseBudgets(dbBudgets);
        setBudgetsLoading(false);
      },
      (error) => {
        setBudgetsLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  // ─── Recurring Expenses Listener ───
  useEffect(() => {
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
            nextDueDate: normalizeDateValue(data.nextDueDate),
            createdAt: normalizeDateValue(data.createdAt),
          };
        });
        setRecurringExpenses(dbRecurring);
        setRecurringLoading(false);
      },
      (error) => {
        setRecurringLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  // ─── Image Upload (existing) ───
  const uploadExpenseImage = async (uri) => {
    if (!uri) return "";
    if (uri.startsWith("http://") || uri.startsWith("https://")) {
      return uri;
    }
    const uid = "default_user";
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const imageRef = ref(
        storage,
        `expenses/${uid}/expense_${Date.now()}.jpg`,
      );
      await uploadBytes(imageRef, blob);
      const downloadUrl = await getDownloadURL(imageRef);
      return downloadUrl;
    } catch (error) {
      // Offline or upload failed — return local URI so the expense can still be created
      return uri;
    }
  };

  // ─── Expense CRUD (existing, preserved) ───
  const addExpense = async (expenseData) => {
    try {
      let finalImageUrl = "";
      if (expenseData.billImageUri) {
        finalImageUrl = await uploadExpenseImage(expenseData.billImageUri);
      }

      const expensePayload = {
        title: expenseData.title || "",
        amount: Number(expenseData.amount),
        totalAmount: Number(
          expenseData.totalAmount !== undefined
            ? expenseData.totalAmount
            : expenseData.amount,
        ),
        paidAmount: Number(
          expenseData.paidAmount !== undefined
            ? expenseData.paidAmount
            : expenseData.amount,
        ),
        remainingAmount: Number(
          expenseData.remainingAmount !== undefined
            ? expenseData.remainingAmount
            : 0,
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
    } catch (error) {
      return null;
    }
  };

  const updateExpense = async (id, expenseData) => {
    try {
      let finalImageUrl = expenseData.billImageUrl || "";
      if (expenseData.billImageUri) {
        finalImageUrl = await uploadExpenseImage(expenseData.billImageUri);
      }

      const expenseRef = doc(db, "expenses", id);
      const expensePayload = {
        title: expenseData.title,
        amount: Number(expenseData.amount),
        totalAmount: Number(
          expenseData.totalAmount !== undefined
            ? expenseData.totalAmount
            : expenseData.amount,
        ),
        paidAmount: Number(
          expenseData.paidAmount !== undefined
            ? expenseData.paidAmount
            : expenseData.amount,
        ),
        remainingAmount: Number(
          expenseData.remainingAmount !== undefined
            ? expenseData.remainingAmount
            : 0,
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
    } catch (error) {
      return false;
    }
  };

  const deleteExpense = async (id) => {
    try {
      const expenseRef = doc(db, "expenses", id);
      await deleteDoc(expenseRef);
      return true;
    } catch (error) {
      return false;
    }
  };

  // ─── Expense Payments CRUD (NEW) ───
  const addExpensePayment = async (expenseId, paymentData) => {
    try {
      const expenseRef = doc(db, "expenses", expenseId);
      const expenseSnap = await getDoc(expenseRef);

      if (!expenseSnap.exists()) {
        throw new Error("Expense not found");
      }

      const expenseDoc = expenseSnap.data();
      const currentPaid = Number(expenseDoc.paidAmount || 0);
      const payAmount = Number(paymentData.amount);
      const newPaidAmount = currentPaid + payAmount;
      const totalAmount = Number(
        expenseDoc.totalAmount || expenseDoc.amount || 0,
      );
      const newRemainingAmount = Math.max(0, totalAmount - newPaidAmount);
      const newStatus = newRemainingAmount === 0 ? "Paid" : "Balance";

      const batch = writeBatch(db);

      batch.update(expenseRef, {
        paidAmount: newPaidAmount,
        remainingAmount: newRemainingAmount,
        status: newStatus,
        updatedAt: new Date(),
      });

      const paymentDocRef = doc(collection(db, "expense_payments"));
      batch.set(paymentDocRef, {
        expenseId: expenseId,
        expenseTitle: expenseDoc.title || "",
        expenseCategory: expenseDoc.category || "Miscellaneous",
        amount: payAmount,
        paymentMethod: paymentData.paymentMethod || "Cash",
        notes: paymentData.notes || "",
        paidAt: new Date(),
        createdAt: new Date(),
      });

      await batch.commit();
      return true;
    } catch (error) {
      return false;
    }
  };

  const undoExpensePayment = async (paymentId) => {
    try {
      const paymentRef = doc(db, "expense_payments", paymentId);
      const paymentSnap = await getDoc(paymentRef);

      if (!paymentSnap.exists()) {
        throw new Error("Payment record not found");
      }

      const paymentDoc = paymentSnap.data();
      const payAmount = Number(paymentDoc.amount || 0);
      const expenseId = paymentDoc.expenseId;

      const batch = writeBatch(db);

      const expenseRef = doc(db, "expenses", expenseId);
      const expenseSnap = await getDoc(expenseRef);

      if (expenseSnap.exists()) {
        const expenseDoc = expenseSnap.data();
        const currentPaid = Number(expenseDoc.paidAmount || 0);
        const totalAmount = Number(
          expenseDoc.totalAmount || expenseDoc.amount || 0,
        );
        const newPaidAmount = Math.max(0, currentPaid - payAmount);
        const newRemainingAmount = Math.max(0, totalAmount - newPaidAmount);
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
    } catch (error) {
      return false;
    }
  };

  // ─── Budget CRUD (NEW) ───
  const setBudget = async (category, monthlyLimit) => {
    try {
      // Check if budget already exists for this category
      const existing = expenseBudgets.find((b) => b.category === category);
      if (existing) {
        const budgetRef = doc(db, "expense_budgets", existing.id);
        await updateDoc(budgetRef, {
          monthlyLimit: Number(monthlyLimit),
          updatedAt: new Date(),
        });
      } else {
        await addDoc(collection(db, "expense_budgets"), {
          category,
          monthlyLimit: Number(monthlyLimit),
          createdAt: new Date(),
        });
      }
      return true;
    } catch (error) {
      return false;
    }
  };

  const deleteBudget = async (budgetId) => {
    try {
      await deleteDoc(doc(db, "expense_budgets", budgetId));
      return true;
    } catch (error) {
      return false;
    }
  };

  const getBudget = (category) => {
    const budget = expenseBudgets.find((b) => b.category === category);
    return budget ? Number(budget.monthlyLimit || 0) : 0;
  };

  // ─── Recurring Expenses CRUD (NEW) ───
  const addRecurringExpense = async (data) => {
    try {
      const payload = {
        title: data.title || "",
        amount: Number(data.amount),
        category: data.category || "Miscellaneous",
        frequency: data.frequency || "monthly", // "weekly" | "monthly"
        paymentMethod: data.paymentMethod || "Cash",
        description: data.description || "",
        nextDueDate: data.nextDueDate ? new Date(data.nextDueDate) : new Date(),
        isActive: true,
        createdAt: new Date(),
      };
      const docRef = await addDoc(
        collection(db, "recurring_expenses"),
        payload,
      );
      return docRef.id;
    } catch (error) {
      return null;
    }
  };

  const updateRecurringExpense = async (id, data) => {
    try {
      const recRef = doc(db, "recurring_expenses", id);
      await updateDoc(recRef, {
        title: data.title,
        amount: Number(data.amount),
        category: data.category,
        frequency: data.frequency,
        paymentMethod: data.paymentMethod || "Cash",
        description: data.description || "",
        nextDueDate: data.nextDueDate ? new Date(data.nextDueDate) : new Date(),
        isActive: data.isActive !== undefined ? data.isActive : true,
        updatedAt: new Date(),
      });
      return true;
    } catch (error) {
      return false;
    }
  };

  const deleteRecurringExpense = async (id) => {
    try {
      await deleteDoc(doc(db, "recurring_expenses", id));
      return true;
    } catch (error) {
      return false;
    }
  };

  const logRecurringExpense = async (recurringId) => {
    const template = recurringExpenses.find((r) => r.id === recurringId);
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
      paymentMethod: template.paymentMethod,
      description:
        template.description || `Auto-logged from recurring: ${template.title}`,
      expenseDate: new Date(),
    });

    if (newExpenseId) {
      // Advance next due date
      const currentDue =
        template.nextDueDate instanceof Date
          ? template.nextDueDate
          : new Date(template.nextDueDate);
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
  };

  // ─── Helper Functions (NEW) ───
  const getTodayExpenses = () => {
    const todayStr = new Date().toDateString();
    return expenses
      .filter((e) => {
        const d =
          e.expenseDate instanceof Date
            ? e.expenseDate
            : new Date(e.expenseDate);
        return d.toDateString() === todayStr;
      })
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);
  };

  const getMonthlyExpenses = (month, year) => {
    return expenses.filter((e) => {
      const d =
        e.expenseDate instanceof Date ? e.expenseDate : new Date(e.expenseDate);
      return d.getMonth() === month && d.getFullYear() === year;
    });
  };

  const getCategoryTotals = (monthExpenses) => {
    const list = monthExpenses || expenses;
    return list.reduce((acc, e) => {
      const cat = e.category || "Miscellaneous";
      acc[cat] = (acc[cat] || 0) + Number(e.amount || 0);
      return acc;
    }, {});
  };

  const getExpensesByDateRange = (startDate, endDate) => {
    return expenses.filter((e) => {
      const d =
        e.expenseDate instanceof Date ? e.expenseDate : new Date(e.expenseDate);
      return d >= startDate && d <= endDate;
    });
  };

  const todayExpenses = useMemo(() => {
    return getTodayExpenses();
  }, [expenses]);

  const contextValue = useMemo(
    () => ({
      // Existing
      expenses,
      loading,
      addExpense,
      updateExpense,
      deleteExpense,
      todayExpenses,

      // New: Expense Payments
      expensePayments,
      paymentsLoading,
      addExpensePayment,
      undoExpensePayment,

      // New: Budgets
      expenseBudgets,
      budgetsLoading,
      setBudget,
      deleteBudget,
      getBudget,

      // New: Recurring Expenses
      recurringExpenses,
      recurringLoading,
      addRecurringExpense,
      updateRecurringExpense,
      deleteRecurringExpense,
      logRecurringExpense,

      // New: Helpers
      getMonthlyExpenses,
      getCategoryTotals,
      getExpensesByDateRange,
    }),
    [
      expenses,
      loading,
      todayExpenses,
      expensePayments,
      paymentsLoading,
      expenseBudgets,
      budgetsLoading,
      recurringExpenses,
      recurringLoading,
    ]
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