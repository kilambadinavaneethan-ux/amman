import { TransactionData, TransactionItem, formatCustomerPhoneNumbers, formatCustomerPhonesDisplay } from '../types/sharing';

export function adaptToTransactionData(
  rawItem: any,
  type: 'order' | 'invoice' | 'expense' | 'purchase' | 'payment' = 'order',
  userProfile?: any
): TransactionData {
  const companyDetails = {
    name: userProfile?.businessName || userProfile?.fullName || 'My Business',
    phone: userProfile?.mobile || '',
    email: userProfile?.email || '',
    address: userProfile?.address || '',
    gstNo: userProfile?.taxId || userProfile?.gstNo || '',
    logoUrl: userProfile?.photoURL || userProfile?.logoUrl || '',
    signatureUrl: userProfile?.signatureUrl || '',
  };

  if (!rawItem) {
    return {
      id: 'TX-000',
      invoiceNumber: 'INV-000',
      date: new Date(),
      customer: { name: 'Customer', phone: '', phoneNumbers: [] },
      items: [],
      subtotal: 0,
      totalAmount: 0,
      paidAmount: 0,
      pendingAmount: 0,
      paymentStatus: 'PAID',
      company: companyDetails,
    };
  }

  // Handle Expense transactions
  if (type === 'expense' || rawItem.category || rawItem.expenseName) {
    const amount = Number(rawItem.amount || rawItem.totalAmount || 0);
    const expPhonesList = formatCustomerPhoneNumbers(rawItem.phone, rawItem.phoneNumbers);
    const expPhoneStr = formatCustomerPhonesDisplay(rawItem.phone, rawItem.phoneNumbers);
    return {
      id: String(rawItem.id || `EXP-${Date.now()}`),
      transactionType: 'expense',
      invoiceNumber: rawItem.receiptNo || rawItem.expenseNo || `EXP-${(rawItem.id || '').slice(-6) || '001'}`,
      date: rawItem.date || rawItem.createdAt || new Date(),
      customer: {
        name: rawItem.paidTo || rawItem.payee || rawItem.category || 'Expense Receiver',
        phone: expPhoneStr,
        phoneNumbers: expPhonesList,
      },
      items: [
        {
          name: rawItem.expenseName || rawItem.title || rawItem.category || 'Business Expense',
          quantity: 1,
          unitPrice: amount,
          totalPrice: amount,
        },
      ],
      subtotal: amount,
      totalAmount: amount,
      paidAmount: amount,
      pendingAmount: 0,
      paymentStatus: 'PAID',
      paymentMethod: rawItem.paymentMethod || 'Cash',
      notes: rawItem.notes || rawItem.description || '',
      company: companyDetails,
    };
  }

  // Handle Orders / Invoices / Raw Material Purchases
  const rawItemsList = rawItem.items || rawItem.products || [];
  let mappedItems: TransactionItem[] = Array.isArray(rawItemsList) && rawItemsList.length > 0
    ? rawItemsList.map((it: any) => {
        const qty = Number(it.quantity || it.qty || 1);
        const rate = Number(it.rate || it.unitPrice || it.costPerUnit || it.price || 0);
        const total = Number(it.totalPrice || it.amount || qty * rate);
        return {
          name: it.itemName || it.name || it.materialName || 'Product / Item',
          quantity: qty,
          unitPrice: rate,
          totalPrice: total,
          unit: it.unit || it.rateType || 'pcs',
        };
      })
    : [];

  if (mappedItems.length === 0 && (rawItem.itemName || rawItem.title || rawItem.productName || rawItem.materialName)) {
    const qty = Number(rawItem.quantity || rawItem.qty || 1);
    const rate = Number(rawItem.rate || rawItem.unitPrice || rawItem.costPerUnit || rawItem.price || 0);
    const total = Number(rawItem.grossTotal || rawItem.total || (qty * rate));
    mappedItems = [
      {
        name: rawItem.itemName || rawItem.title || rawItem.productName || rawItem.materialName,
        quantity: qty,
        unitPrice: rate,
        totalPrice: total,
        unit: rawItem.rateType || rawItem.unit || 'pcs',
      }
    ];
  }

  const itemsSubtotal = mappedItems.reduce((sum, item) => sum + item.totalPrice, 0);

  const shipmentCharge = Number(rawItem.shipmentCharge || rawItem.deliveryCharge || rawItem.shippingCharge || 0);
  const loadingCharge = Number(rawItem.loadingCharge || rawItem.loadingFee || 0);
  const unloadingCharge = Number(rawItem.unloadingCharge || rawItem.unloadingFee || 0);
  const extraAmount = Number(rawItem.extraAmount || rawItem.extraCharge || rawItem.otherCharges || 0);
  const extraAmountDescription = rawItem.extraAmountDescription || rawItem.extraChargeDescription || rawItem.extraDesc || '';
  const customChargesList = Array.isArray(rawItem.charges) ? rawItem.charges : [];

  const subtotal = rawItem.subtotal !== undefined
    ? Number(rawItem.subtotal)
    : (rawItem.grossTotal !== undefined
        ? Number(rawItem.grossTotal)
        : (itemsSubtotal > 0 ? itemsSubtotal : Number(rawItem.totalAmount || rawItem.total || 0)));

  const taxAmount = Number(rawItem.taxAmount || rawItem.tax || rawItem.gstAmount || 0);
  const discountAmount = Number(rawItem.discountAmount || rawItem.discount || 0);

  const totalAmount = Number(
    rawItem.totalAmount !== undefined
      ? rawItem.totalAmount
      : (rawItem.total !== undefined
          ? rawItem.total
          : subtotal + shipmentCharge + loadingCharge + unloadingCharge + extraAmount + taxAmount - discountAmount)
  );

  let paidAmount = Number(rawItem.paidAmount || rawItem.paid || rawItem.receivedAmount || 0);
  let pendingAmount = rawItem.balanceDue !== undefined
    ? Number(rawItem.balanceDue)
    : (rawItem.remainingBalance !== undefined
        ? Number(rawItem.remainingBalance)
        : Math.max(0, totalAmount - paidAmount));

  // If status is completed/paid or balanceDue is explicitly 0
  const isExplicitlyZeroBalance = (rawItem.balanceDue !== undefined && Number(rawItem.balanceDue) === 0) ||
    (rawItem.remainingBalance !== undefined && Number(rawItem.remainingBalance) === 0) ||
    (String(rawItem.status).toUpperCase() === 'COMPLETED' && (rawItem.balanceDue === undefined || Number(rawItem.balanceDue) === 0));

  if (isExplicitlyZeroBalance && paidAmount === 0 && totalAmount > 0) {
    paidAmount = totalAmount;
    pendingAmount = 0;
  }

  let paymentStatus = rawItem.status || rawItem.paymentStatus || 'PENDING';
  if ((paidAmount >= totalAmount && totalAmount > 0) || (pendingAmount === 0 && totalAmount > 0)) {
    paymentStatus = 'PAID';
  } else if (paidAmount > 0 && pendingAmount > 0) {
    paymentStatus = 'PARTIAL';
  }

  const invoiceNo =
    rawItem.invoiceNumber ||
    rawItem.orderNo ||
    (rawItem.id ? `INV-${String(rawItem.id).slice(-6)}` : `INV-${Date.now().toString().slice(-6)}`);

  const rawPhonesList = rawItem.customerPhoneNumbers || rawItem.phoneNumbers || rawItem.customerPhones || rawItem.customer?.phoneNumbers;
  const rawSinglePhone = rawItem.customerPhone || rawItem.supplierPhone || rawItem.phone || rawItem.mobile || rawItem.customer?.phone;
  const phoneNumbersList = formatCustomerPhoneNumbers(rawSinglePhone, rawPhonesList);
  const formattedPhonesStr = formatCustomerPhonesDisplay(rawSinglePhone, rawPhonesList);

  return {
    id: String(rawItem.id || Date.now()),
    transactionType: type,
    invoiceNumber: invoiceNo,
    date: rawItem.date || rawItem.createdAt || rawItem.orderDate || new Date(),
    dueDate: rawItem.dueDate,
    customer: {
      name: rawItem.customerName || rawItem.supplierName || rawItem.customer?.name || 'Valued Customer',
      phone: formattedPhonesStr,
      phoneNumbers: phoneNumbersList,
      address: rawItem.customerAddress || rawItem.address || rawItem.customer?.address || '',
      gstNo: rawItem.customerGst || rawItem.gstNo || rawItem.gstin || rawItem.customer?.gstin || rawItem.customer?.gstNo || '',
      email: rawItem.customerEmail || rawItem.email || rawItem.customer?.email || '',
    },
    items: mappedItems,
    subtotal: subtotal,
    shipmentCharge,
    loadingCharge,
    unloadingCharge,
    extraAmount,
    extraAmountDescription,
    charges: customChargesList,
    taxAmount,
    discountAmount,
    totalAmount,
    paidAmount,
    pendingAmount,
    previousBalance: Number(
      rawItem.previousBalance !== undefined
        ? rawItem.previousBalance
        : (rawItem.oldBalanceDue !== undefined
            ? rawItem.oldBalanceDue
            : (rawItem.oldBalance !== undefined
                ? rawItem.oldBalance
                : (rawItem.customerPreviousBalance !== undefined
                    ? rawItem.customerPreviousBalance
                    : (rawItem.customer?.balance !== undefined
                        ? rawItem.customer?.balance
                        : (rawItem.customer?.totalPending !== undefined
                            ? rawItem.customer?.totalPending
                            : 0)))))
    ),
    paymentStatus,
    paymentMethod: rawItem.paymentMethod || 'Cash',
    notes: rawItem.notes || rawItem.remarks || '',
    company: companyDetails,
  };
}
