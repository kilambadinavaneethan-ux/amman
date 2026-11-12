export interface FirestoreTimestampLike {
  toDate?: () => Date;
  seconds?: number;
  nanoseconds?: number;
}

export type DateInput = Date | string | number | FirestoreTimestampLike | null | undefined;

export interface CustomerDueDate {
  id: string;
  date: string;
  notes?: string;
  status?: string;
  amount?: number;
  completedAt?: DateInput;
  [key: string]: unknown;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  phoneNumbers?: string[];
  mobile?: string;
  address?: string;
  city?: string;
  gstin?: string;
  gstNo?: string;
  email?: string;
  notes?: string;
  balance?: number;
  totalPending?: number;
  openingBalance?: number;
  previousBalance?: number;
  advanceAmount?: number;
  isFavorite?: boolean;
  isSpecial?: boolean;
  dueDates?: CustomerDueDate[];
  dueDateAlertsEnabled?: boolean;
  collectorId?: string | null;
  collectorName?: string | null;
  profileMarkings?: string[];
  markings?: string[];
  markingProfile?: string;
  createdAt?: DateInput;
  updatedAt?: DateInput;
  [key: string]: unknown;
}

export interface OrderLineItem {
  itemId?: string;
  itemName?: string;
  name?: string;
  quantity: number;
  deliveredQuantity?: number;
  rate?: number;
  unitPrice?: number;
  price?: number;
  rateType?: string;
  unit?: string;
  total?: number;
  totalPrice?: number;
  costPrice?: number;
  [key: string]: unknown;
}

export interface OrderDelivery {
  date?: DateInput;
  quantity: number;
  deliveryPartnerId?: string | null;
  deliveryPartnerName?: string | null;
  notes?: string;
  [key: string]: unknown;
}

export interface Order {
  id: string;
  customerId?: string | null;
  customerName?: string;
  customerPhone?: string;
  customerPhoneNumbers?: string[];
  customerAddress?: string;
  customerGst?: string;
  items?: OrderLineItem[];
  itemId?: string;
  itemName?: string;
  quantity?: number;
  deliveredQuantity?: number;
  rate?: number;
  unitPrice?: number;
  price?: number;
  rateType?: string;
  unit?: string;
  grossTotal?: number;
  total: number;
  paidAmount?: number;
  amountPaid?: number;
  advancePaid?: number;
  balanceDue?: number;
  advanceAmount?: number;
  excessAdvance?: number;
  previousBalance?: number;
  discount?: number;
  discountType?: "amount" | "percent" | "per_brick" | string;
  discountAmount?: number;
  shipmentCharge?: number;
  shipmentDistance?: number;
  loadingCharge?: number;
  unloadingCharge?: number;
  extraAmount?: number;
  extraAmountDescription?: string;
  taxAmount?: number;
  tax?: number;
  gstAmount?: number;
  paymentMethod?: string;
  paymentMode?: string;
  paymentType?: string;
  status?: "pending" | "in-transit" | "completed" | "cancelled" | string;
  isCancelled?: boolean;
  deliveryPartnerId?: string | null;
  deliveryPartnerName?: string | null;
  loadingWorkerId?: string | null;
  loadingWorkerName?: string | null;
  unloadingWorkerId?: string | null;
  unloadingWorkerName?: string | null;
  collectorId?: string | null;
  collectorName?: string | null;
  deliveries?: OrderDelivery[];
  deliveryDate?: DateInput;
  orderedDate?: DateInput;
  completedAt?: DateInput;
  createdAt?: DateInput;
  updatedAt?: DateInput;
  notes?: string;
  description?: string;
  [key: string]: unknown;
}

export interface Expense {
  id: string;
  title?: string;
  category?: string;
  amount: number;
  paidAmount?: number;
  remainingAmount?: number;
  paymentMethod?: string;
  expenseDate?: DateInput;
  imageUrl?: string | null;
  notes?: string;
  createdAt?: DateInput;
  updatedAt?: DateInput;
  [key: string]: unknown;
}

export interface ExpensePayment {
  id: string;
  expenseId?: string;
  expenseTitle?: string;
  amount: number;
  paymentMethod?: string;
  notes?: string;
  paidAt?: DateInput;
  createdAt?: DateInput;
  [key: string]: unknown;
}

export interface ExpenseBudget {
  id: string;
  category: string;
  monthlyLimit: number;
  updatedAt?: DateInput;
  [key: string]: unknown;
}

export interface RecurringExpense {
  id: string;
  title?: string;
  category?: string;
  amount: number;
  frequency?: string;
  nextDueDate?: DateInput;
  lastLoggedAt?: DateInput;
  isActive?: boolean;
  notes?: string;
  [key: string]: unknown;
}

export interface RawMaterialPurchase {
  id: string;
  materialId?: string;
  materialName?: string;
  type: "purchase" | "consumption" | "payment" | "opening" | "adjustment" | string;
  quantity?: number;
  unit?: string;
  costPerUnit?: number;
  totalCost?: number;
  amount?: number;
  amountPaid?: number;
  remainingBalance?: number;
  supplierId?: string | null;
  supplierName?: string | null;
  paymentMethod?: string;
  notes?: string;
  date?: DateInput;
  createdAt?: DateInput;
  updatedAt?: DateInput;
  [key: string]: unknown;
}

export type RawMaterialLog = RawMaterialPurchase;

export interface RawMaterialSupplier {
  id: string;
  userId?: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  mobile?: string;
  address?: string;
  balance?: number;
  openingBalance?: number;
  status?: "active" | "inactive" | string;
  isFavorite?: boolean;
  isSpecial?: boolean;
  dueDates?: CustomerDueDate[];
  collectorId?: string | null;
  collectorName?: string | null;
  notes?: string;
  profileMarkings?: string[];
  createdAt?: DateInput;
  updatedAt?: DateInput;
  [key: string]: unknown;
}

export type WorkerAttendanceStatus = "present" | "half-day" | "absent" | string;

export interface Worker {
  id: string;
  name: string;
  fullName?: string;
  role?: string;
  phone?: string;
  mobile?: string;
  address?: string;
  billingSystem?: "Time-Based" | "Piece-Rate" | string;
  dailyWage?: number;
  overtimeRate?: number;
  pieceRate?: number;
  loadingCost?: number;
  unloadingCost?: number;
  defaultPiecesPerDay?: number;
  totalWages?: number;
  totalPaid?: number;
  totalPending?: number;
  advanceAmount?: number;
  status?: "Active" | "Inactive" | string;
  isFavorite?: boolean;
  isSpecial?: boolean;
  dueDates?: CustomerDueDate[];
  collectorId?: string | null;
  collectorName?: string | null;
  notes?: string;
  profileMarkings?: string[];
  createdAt?: DateInput;
  updatedAt?: DateInput;
  [key: string]: unknown;
}

export interface WorkerAttendance {
  id: string;
  workerId: string;
  workerName?: string;
  status: WorkerAttendanceStatus;
  date?: DateInput;
  dateKey?: string;
  overtimeHours?: number;
  piecesProduced?: number;
  wageEarned?: number;
  notes?: string;
  createdAt?: DateInput;
  updatedAt?: DateInput;
  [key: string]: unknown;
}

export interface WorkerPayment {
  id: string;
  workerId: string;
  workerName?: string;
  amount: number;
  paymentMethod?: string;
  notes?: string;
  date?: DateInput;
  createdAt?: DateInput;
  [key: string]: unknown;
}

export interface ContractWorker {
  id: string;
  name: string;
  role?: string;
  phone?: string;
  totalAgreed?: number;
  totalPaid?: number;
  totalPending?: number;
  notes?: string;
  createdAt?: DateInput;
  updatedAt?: DateInput;
  [key: string]: unknown;
}

export interface DeliveryPartner {
  id: string;
  name: string;
  partnerName?: string;
  phone?: string;
  mobile?: string;
  vehicleNo?: string;
  vehicleNumber?: string;
  deliveryRateType?: "fixed amount" | "per brick" | "per km" | string;
  deliveryRate?: number;
  minimumRate?: number;
  hasLoading?: boolean;
  loadingRateType?: string;
  loadingRate?: number;
  hasUnloading?: boolean;
  unloadingRateType?: string;
  unloadingRate?: number;
  totalPayable?: number;
  totalPaid?: number;
  totalPending?: number;
  status?: "Active" | "Inactive" | string;
  isFavorite?: boolean;
  isSpecial?: boolean;
  dueDates?: CustomerDueDate[];
  collectorId?: string | null;
  collectorName?: string | null;
  notes?: string;
  profileMarkings?: string[];
  createdAt?: DateInput;
  updatedAt?: DateInput;
  [key: string]: unknown;
}

export interface DeliveryTrip {
  id: string;
  partnerId: string;
  orderId?: string;
  deliveryCharge?: number;
  baseDeliveryCharge?: number;
  loadingCharge?: number;
  unloadingCharge?: number;
  destination?: string;
  tripDate?: DateInput;
  createdAt?: DateInput;
  notes?: string;
  [key: string]: unknown;
}

export interface DeliveryPayment {
  id: string;
  partnerId: string;
  partnerName?: string;
  amount: number;
  isRepayment?: boolean;
  paymentMethod?: string;
  notes?: string;
  date?: DateInput;
  createdAt?: DateInput;
  [key: string]: unknown;
}

export interface Collector {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
  isActive?: boolean;
  createdAt?: DateInput;
  updatedAt?: DateInput;
  [key: string]: unknown;
}

export interface PaymentRecord {
  id: string;
  customerId?: string | null;
  customerName?: string;
  amountReceived?: number;
  amount?: number;
  discountAmount?: number;
  refundAmount?: number;
  advanceAmount?: number;
  pendingBefore?: number;
  pendingAfter?: number;
  paymentMethod?: string;
  paymentMode?: string;
  paymentType?: string;
  collectorId?: string | null;
  collectorName?: string | null;
  orderId?: string | null;
  type?: string;
  notes?: string;
  paymentDate?: DateInput;
  date?: DateInput;
  createdAt?: DateInput;
  updatedAt?: DateInput;
  [key: string]: unknown;
}

export type BonusRecipientType = "worker" | "delivery" | "customer" | "other";

export interface BonusEntry {
  id: string;
  type: BonusRecipientType;
  recipientId: string;
  recipientName: string;
  recipientPhone?: string;
  recipientRole?: string;
  markings?: string[];
  amount: number;
  reason: string;
  notes?: string;
  createdAt: Date;
  updatedAt?: Date;
  rawData?: unknown;
}

export interface InventoryItem {
  id: string;
  itemName: string;
  itemType?: "finished_product" | "raw_material" | string;
  description?: string;
  openingStock?: number;
  stock?: number;
  reorderLevel?: number;
  rate?: number;
  sellingRate?: number;
  sellingPrice?: number;
  costPrice?: number;
  rateType?: string;
  unit?: string;
  status?: string;
  imageUrl?: string | null;
  createdAt?: DateInput;
  updatedAt?: DateInput;
  [key: string]: unknown;
}

export interface CompanyInfo {
  name?: string;
  businessName?: string;
  companyName?: string;
  phone?: string;
  email?: string;
  address?: string;
  gstin?: string;
  logoUrl?: string;
  [key: string]: unknown;
}

export interface UserProfile {
  id?: string;
  uid?: string;
  fullName?: string;
  businessName?: string;
  companyName?: string;
  name?: string;
  company?: CompanyInfo;
  email?: string;
  mobile?: string;
  phone?: string;
  address?: string;
  gstin?: string;
  gstNo?: string;
  taxId?: string;
  photoURL?: string;
  logoUrl?: string;
  currency?: string;
  provider?: string;
  role?: string;
  createdAt?: DateInput;
  updatedAt?: DateInput;
  [key: string]: unknown;
}
