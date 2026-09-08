import AsyncStorage from "@react-native-async-storage/async-storage";
import { File, Directory, Paths } from "expo-file-system";
import { collection, getDocs } from "firebase/firestore";
export interface FirebaseConfig {
  projectId: string;
  projectName?: string;
  [key: string]: any;
}

export interface BackupRecord {
  id: string;
  projectId: string;
  projectName: string;
  timestamp: string;
  fileName: string;
  fileUri: string;
  fileSize: number;
}

const BACKUPS_LIST_KEY = "hollow_block_backups_list";
const BACKUP_COLLECTIONS = [
  "customers",
  "items",
  "item_stock_logs",
  "orders",
  "payments",
  "expenses",
  "expense_payments",
  "expense_budgets",
  "recurring_expenses",
  "workers",
  "contractWorkers",
  "workerPayments",
  "workerAttendance",
  "automation_attendance_logs",
  "deliveryPartners",
  "deliveryTrips",
  "deliveryPayments",
  "moneyCollectors",
  "automations",
  "alarms",
  "profitTransactions",
  "profitSummary",
  "crusherContacts",
  "raw_material_suppliers",
  "raw_material_logs",
  "supportTickets",
  "notifications"
];

/**
 * Loads the list of backups created locally.
 */
export async function loadBackupsList(): Promise<BackupRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(BACKUPS_LIST_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

/**
 * Saves the list of backup records to AsyncStorage.
 */
export async function saveBackupsList(list: BackupRecord[]): Promise<boolean> {
  try {
    await AsyncStorage.setItem(BACKUPS_LIST_KEY, JSON.stringify(list));
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Creates a database backup file for the current project.
 */
export async function createDatabaseBackup(
  dbInstance: any,
  config: FirebaseConfig
): Promise<{ success: boolean; backup?: BackupRecord; error?: string }> {
  try {
    const backupData: Record<string, any[]> = {};
    
    // Fetch Firestore data in parallel for optimal backup performance
    const collectionPromises = BACKUP_COLLECTIONS.map(async (colName) => {
      try {
        const colRef = collection(dbInstance, colName);
        const snapshot = await getDocs(colRef);
        return {
          colName,
          docs: snapshot.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          })),
        };
      } catch (colErr) {
        return { colName, docs: [] };
      }
    });

    const results = await Promise.all(collectionPromises);
    for (const res of results) {
      backupData[res.colName] = res.docs;
    }

    const formattedDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const fileName = `${config.projectId || "firebase"}_backup_${Date.now()}.json`;
    const dir = new Directory(Paths.document);
    const file = new File(dir, fileName);
    const jsonContent = JSON.stringify(backupData, null, 2);

    // Save to filesystem
    file.create({ overwrite: true });
    file.write(jsonContent);

    const fileSize = file.exists ? file.size || 0 : jsonContent.length;

    const newBackup: BackupRecord = {
      id: `backup_${Date.now()}`,
      projectId: config.projectId,
      projectName: config.projectName || config.projectId,
      timestamp: formattedDate,
      fileName,
      fileUri: file.uri,
      fileSize,
    };

    const currentList = await loadBackupsList();
    await saveBackupsList([newBackup, ...currentList]);

    return { success: true, backup: newBackup };
  } catch (error: any) {
    return { success: false, error: error?.message || "Failed to create database backup." };
  }
}

/**
 * Deletes a local backup record and file.
 */
export async function deleteBackupFile(id: string): Promise<boolean> {
  try {
    const list = await loadBackupsList();
    const backup = list.find(b => b.id === id);
    if (!backup) return false;

    // Delete file
    try {
      const file = new File(backup.fileUri);
      if (file.exists) {
        file.delete();
      }
    } catch (e) {
    }

    const updated = list.filter(b => b.id !== id);
    await saveBackupsList(updated);
    return true;
  } catch (error) {
    return false;
  }
}