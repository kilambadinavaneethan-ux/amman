import { db } from "../../config/firebase";
import { collection, getCountFromServer } from "firebase/firestore";

export interface DatabaseStats {
  customers: number;
  orders: number;
  items: number;
  payments: number;
  expenses: number;
  workers: number;
  deliveryPartners: number;
  rawMaterialSuppliers: number;
  rawMaterialLogs: number;
  deliveryTrips: number;
  deliveryPayments: number;
  contractWorkers: number;
  profitTransactions: number;
  visitingCards: number;
  totalDocuments: number;
  collectionsCount: number;
  categoryBreakdown: {
    coreBusiness: number;
    workforce: number;
    expenses: number;
    delivery: number;
    operations: number;
    automations: number;
    mediaSystem: number;
  };
}

const ALL_COLLECTIONS = [
  { key: "customers", name: "customers", category: "coreBusiness" },
  { key: "orders", name: "orders", category: "coreBusiness" },
  { key: "items", name: "items", category: "coreBusiness" },
  { key: "payments", name: "payments", category: "coreBusiness" },
  { key: "profitTransactions", name: "profitTransactions", category: "coreBusiness" },
  { key: "profitSummary", name: "profitSummary", category: "coreBusiness" },
  { key: "users", name: "users", category: "coreBusiness" },

  { key: "workers", name: "workers", category: "workforce" },
  { key: "workerAttendance", name: "workerAttendance", category: "workforce" },
  { key: "workerPayments", name: "workerPayments", category: "workforce" },
  { key: "workerBonuses", name: "workerBonuses", category: "workforce" },
  { key: "contractWorkers", name: "contractWorkers", category: "workforce" },
  { key: "contractPayments", name: "contractPayments", category: "workforce" },

  { key: "expenses", name: "expenses", category: "expenses" },
  { key: "expensePayments", name: "expense_payments", category: "expenses" },
  { key: "expenseBudgets", name: "expense_budgets", category: "expenses" },
  { key: "recurringExpenses", name: "recurring_expenses", category: "expenses" },

  { key: "deliveryPartners", name: "deliveryPartners", category: "delivery" },
  { key: "deliveryTrips", name: "deliveryTrips", category: "delivery" },
  { key: "deliveryPayments", name: "deliveryPayments", category: "delivery" },
  { key: "deliveryPartnerBonuses", name: "deliveryPartnerBonuses", category: "delivery" },
  { key: "moneyCollectors", name: "moneyCollectors", category: "delivery" },

  { key: "rawMaterialSuppliers", name: "raw_material_suppliers", category: "operations" },
  { key: "rawMaterialLogs", name: "raw_material_logs", category: "operations" },
  { key: "crusherContacts", name: "crusherContacts", category: "operations" },
  { key: "itemStockLogs", name: "item_stock_logs", category: "operations" },

  { key: "automations", name: "automations", category: "automations" },
  { key: "automationAttendanceLogs", name: "automation_attendance_logs", category: "automations" },
  { key: "alarms", name: "alarms", category: "automations" },

  { key: "visitingCards", name: "visiting_cards", category: "mediaSystem" },
  { key: "supportTickets", name: "supportTickets", category: "mediaSystem" },
  { key: "notifications", name: "notifications", category: "mediaSystem" },
];

export async function fetchDatabaseStats(): Promise<DatabaseStats> {
  const counts: Record<string, number> = {
    customers: 0,
    orders: 0,
    items: 0,
    payments: 0,
    expenses: 0,
    workers: 0,
    deliveryPartners: 0,
    rawMaterialSuppliers: 0,
    rawMaterialLogs: 0,
    deliveryTrips: 0,
    deliveryPayments: 0,
    contractWorkers: 0,
    profitTransactions: 0,
    visitingCards: 0,
  };

  const categoryBreakdown = {
    coreBusiness: 0,
    workforce: 0,
    expenses: 0,
    delivery: 0,
    operations: 0,
    automations: 0,
    mediaSystem: 0,
  };

  let totalDocs = 0;

  await Promise.all(
    ALL_COLLECTIONS.map(async (col) => {
      try {
        const colRef = collection(db, col.name);
        const snapshot = await getCountFromServer(colRef);
        const c = snapshot.data().count;
        counts[col.key] = c;
        totalDocs += c;
        if (col.category in categoryBreakdown) {
          (categoryBreakdown as any)[col.category] += c;
        }
      } catch (e) {
        counts[col.key] = 0;
      }
    })
  );

  return {
    customers: counts.customers || 0,
    orders: counts.orders || 0,
    items: counts.items || 0,
    payments: counts.payments || 0,
    expenses: counts.expenses || 0,
    workers: counts.workers || 0,
    deliveryPartners: counts.deliveryPartners || 0,
    rawMaterialSuppliers: counts.rawMaterialSuppliers || 0,
    rawMaterialLogs: counts.rawMaterialLogs || 0,
    deliveryTrips: counts.deliveryTrips || 0,
    deliveryPayments: counts.deliveryPayments || 0,
    contractWorkers: counts.contractWorkers || 0,
    profitTransactions: counts.profitTransactions || 0,
    visitingCards: counts.visitingCards || 0,
    totalDocuments: totalDocs,
    collectionsCount: ALL_COLLECTIONS.length,
    categoryBreakdown,
  };
}
