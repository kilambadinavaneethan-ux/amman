import { CustomerShareData } from '../types/sharing';
import { normalizeDateValue } from '../config/firebase';

/**
 * Builds standard CustomerShareData for Customer Statement generation (WhatsApp, PDF, Image)
 * used across both Customer Profile and Customers List screens.
 */
export function buildCustomerShareData(
  customer: any,
  orders: any[] = [],
  payments: any[] = [],
  partners: any[] = []
): CustomerShareData | null {
  if (!customer) return null;

  const id = customer.id;
  const partnerMap = new Map((partners || []).map((p: any) => [p.id, p.name]));

  // 1. Filter orders and payments for this specific customer entity
  const customerOrders = (orders || []).filter((o: any) =>
    o.customerId === id ||
    o.customerId === `worker_${id}` ||
    o.customerId === `sup_${id}` ||
    o.customerId === `supplier_${id}` ||
    o.customerId === `partner_${id}`
  );

  const customerPayments = (payments || []).filter((p: any) =>
    p.customerId === id ||
    p.customerId === `worker_${id}` ||
    p.customerId === `sup_${id}` ||
    p.customerId === `supplier_${id}` ||
    p.customerId === `partner_${id}`
  );

  // Helpers to resolve exact Date and Time for Orders and Payments
  const isDateOnlyValue = (d?: Date | null): boolean => {
    if (!d || isNaN(d.getTime())) return true;
    return (
      (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) ||
      (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) ||
      (d.getHours() === 5 && d.getMinutes() === 30 && d.getSeconds() === 0 && d.getMilliseconds() === 0)
    );
  };

  const resolveOrderDateTime = (order: any): Date => {
    const rawOrdered = order.orderedDate ? normalizeDateValue(order.orderedDate) : null;
    const rawCreated = order.createdAt ? normalizeDateValue(order.createdAt) : null;
    const rawDate = order.date ? normalizeDateValue(order.date) : null;

    if (rawOrdered && !isDateOnlyValue(rawOrdered)) {
      return rawOrdered;
    }

    if (rawOrdered) {
      const timeSource = (rawCreated && !isDateOnlyValue(rawCreated))
        ? rawCreated
        : (rawDate && !isDateOnlyValue(rawDate) ? rawDate : null);

      if (timeSource) {
        const merged = new Date(rawOrdered);
        merged.setHours(
          timeSource.getHours(),
          timeSource.getMinutes(),
          timeSource.getSeconds(),
          timeSource.getMilliseconds()
        );
        return merged;
      }
      return rawOrdered;
    }

    if (rawCreated) return rawCreated;
    if (rawDate) return rawDate;
    return new Date();
  };

  const resolvePaymentDateTime = (payment: any): Date => {
    const rawPayDate = payment.paymentDate ? normalizeDateValue(payment.paymentDate) : null;
    const rawDate = payment.date ? normalizeDateValue(payment.date) : null;
    const rawCreated = payment.createdAt ? normalizeDateValue(payment.createdAt) : null;

    const targetDate = rawPayDate || rawDate;

    if (targetDate && !isDateOnlyValue(targetDate)) {
      return targetDate;
    }

    if (targetDate) {
      const timeSource = (rawCreated && !isDateOnlyValue(rawCreated)) ? rawCreated : null;
      if (timeSource) {
        const merged = new Date(targetDate);
        merged.setHours(
          timeSource.getHours(),
          timeSource.getMinutes(),
          timeSource.getSeconds(),
          timeSource.getMilliseconds()
        );
        return merged;
      }
      return targetDate;
    }

    if (rawCreated) return rawCreated;
    return new Date();
  };

  // 2. Build entries
  const entries: any[] = [];

  customerOrders.forEach((order: any) => {
    const isCancelled = order.status === 'cancelled';
    const orderDateObj = resolveOrderDateTime(order);
    let deliveryDateObj = null;
    if (order.deliveryDate) {
      deliveryDateObj = normalizeDateValue(order.deliveryDate);
    } else if (order.status === 'completed') {
      deliveryDateObj = normalizeDateValue(order.updatedAt || order.createdAt);
    }

    const deliveryPartnerName = order.deliveryPartnerId
      ? (partnerMap.get(order.deliveryPartnerId) || null)
      : null;

    let itemDescription = '';
    if (order.items && order.items.length > 0) {
      itemDescription = order.items
        .map((itm: any) => `${itm.itemName || itm.name || 'Item'} (${itm.quantity || 1} qty)`)
        .join(', ');
    } else {
      itemDescription = order.itemName ? `${order.itemName} (${order.quantity || 1} qty)` : 'Invoice Created';
    }

    const orderPaid = Number(order.paidAmount || 0);
    const orderTotal = Number(order.total || 0);
    const orderExcess = Math.max(0, orderPaid - orderTotal);
    const orderUnpaid = order.balanceDue !== undefined
      ? Number(order.balanceDue)
      : Math.max(0, orderTotal - orderPaid);
    const balChange = isCancelled
      ? 0
      : (orderExcess > 0 ? -orderExcess : orderUnpaid);

    entries.push({
      id: order.id,
      date: orderDateObj,
      orderDate: orderDateObj,
      deliveryDate: deliveryDateObj,
      type: 'order',
      description: isCancelled ? `[CANCELLED] ${itemDescription}` : itemDescription,
      orderAmount: order.total || 0,
      paymentReceived: order.paidAmount || 0,
      balanceChange: balChange,
      deliveryPartnerName,
      original: order,
      isCancelled,
    });

    const wasCompletedBeforeCancel = !!order.completedAt || (order.deliveredQuantity && order.deliveredQuantity > 0);
    if (isCancelled && wasCompletedBeforeCancel) {
      const cancelDateObj = order.updatedAt
        ? normalizeDateValue(order.updatedAt)
        : new Date(orderDateObj.getTime() + 1000);

      entries.push({
        id: `${order.id}-cancellation`,
        date: cancelDateObj,
        orderDate: cancelDateObj,
        deliveryDate: null,
        type: 'cancellation',
        description: `🚫 Cancelled Reversal: ${itemDescription}`,
        orderAmount: 0,
        paymentReceived: 0,
        balanceChange: -(order.balanceDue || 0),
        deliveryPartnerName: null,
        original: order,
        isCancelled: true,
      });
    }
  });

  customerPayments.forEach((payment: any) => {
    const isOrderPayment = !!payment.orderId || (payment.notes && (
      payment.notes.toLowerCase().includes('order payment') ||
      payment.notes.toLowerCase().includes('payment for order') ||
      payment.notes.toLowerCase().includes('order #')
    ));
    if (isOrderPayment) return;

    const payDate = resolvePaymentDateTime(payment);
    const amtRec = Number(payment.amountReceived !== undefined ? payment.amountReceived : (payment.amount || 0));
    const discAmt = Number(payment.discountAmount || 0);
    const totalBalanceReduction = amtRec + discAmt;

    let desc = `Payment: ${payment.paymentMethod || 'Cash'}`;
    if (discAmt > 0) {
      if (amtRec > 0) {
        desc = `Payment: ${payment.paymentMethod || 'Cash'} (Disc: ₹${discAmt.toLocaleString('en-IN')})`;
      } else {
        desc = `Balance Discount: ₹${discAmt.toLocaleString('en-IN')}`;
      }
    }

    entries.push({
      id: payment.id,
      date: payDate,
      orderDate: payDate,
      deliveryDate: null,
      type: 'payment',
      description: desc,
      orderAmount: 0,
      paymentReceived: amtRec,
      discountAmount: discAmt,
      balanceChange: -totalBalanceReduction,
      original: payment,
    });
  });

  // Sort by exact date and time ascending (oldest first)
  entries.sort((a, b) => {
    const timeA = a.date instanceof Date ? a.date.getTime() : new Date(a.date).getTime();
    const timeB = b.date instanceof Date ? b.date.getTime() : new Date(b.date).getTime();
    const diff = timeA - timeB;
    if (diff !== 0) return diff;
    if (a.type === 'order' && b.type === 'payment') return -1;
    if (a.type === 'payment' && b.type === 'order') return 1;
    const idA = String(a.id || '');
    const idB = String(b.id || '');
    return idA.localeCompare(idB);
  });

  const sumChanges = entries.reduce((sum: number, entry: any) => sum + (entry.balanceChange || 0), 0);
  const customerPending = Number(
    customer.totalPending !== undefined ? customer.totalPending : (customer.balance || 0)
  );
  const openingBalance = customerPending - sumChanges;

  let runningBalance = openingBalance;
  const ledgerEntries = entries.map((entry) => {
    runningBalance += entry.balanceChange;
    return {
      ...entry,
      runningBalance,
    };
  });

  if (Math.abs(openingBalance) > 0.001) {
    const openingDate = customer.createdAt
      ? normalizeDateValue(customer.createdAt)
      : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    ledgerEntries.unshift({
      id: 'opening-bal',
      date: openingDate,
      orderDate: openingDate,
      deliveryDate: null,
      type: 'opening',
      description: openingBalance < 0 ? 'Opening Advance Balance' : 'Opening Balance',
      orderAmount: openingBalance > 0 ? openingBalance : 0,
      paymentReceived: openingBalance < 0 ? Math.abs(openingBalance) : 0,
      runningBalance: openingBalance,
    });
  }

  const totalSpent = customerOrders.reduce(
    (sum: number, o: any) => (o.status === 'cancelled' ? sum : sum + (o.total || 0)),
    0
  );
  const totalPaid = (ledgerEntries || []).reduce(
    (sum: number, l: any) => sum + (l.paymentReceived || 0),
    0
  );

  return {
    customer: {
      id: customer.id,
      name: customer.name || 'Customer',
      phone: customer.phone || '',
      phoneNumbers:
        customer.phoneNumbers && customer.phoneNumbers.length > 0
          ? customer.phoneNumbers
          : customer.phone
          ? [customer.phone]
          : [],
      address: customer.address || customer.city || '',
      gstin: customer.gstin || customer.gstNo || '',
      email: customer.email || '',
      isSpecial: !!customer.isSpecial,
      openingBalance,
      totalBalance: customerPending,
    },
    dueDates: (customer.dueDates || []).map((d: any) => ({
      id: d.id || String(Math.random()),
      date: d.date || '',
      notes: d.notes || '',
      status: d.status || 'Pending',
    })),
    summary: {
      totalOrdersCount: customerOrders.length,
      totalSalesAmount: totalSpent,
      totalPaidAmount: totalPaid,
      oldBalanceDue: openingBalance,
      netBalanceDue: customerPending,
    },
    ledger: ledgerEntries.map((l: any) => {
      const orig = l.original || {};
      const rawItems =
        orig.items && Array.isArray(orig.items) && orig.items.length > 0
          ? orig.items.map((i: any) => ({
              name: i.itemName || i.name || 'Item',
              quantity: Number(i.quantity || 1),
              rate: Number(i.unitPrice || i.rate || i.price || 0),
              unit: i.unit || 'pcs',
              total: Number(
                i.totalPrice || i.total || (i.quantity || 1) * (i.unitPrice || i.rate || i.price || 0)
              ),
            }))
          : undefined;

      const rawPaid = Number(
        l.paymentReceived || (l.type === 'payment' ? l.amount || l.paid : l.paid) || 0
      );
      const rawAmount = Number(l.orderAmount || (l.type === 'order' ? l.amount : 0) || 0);

      return {
        id: l.id || String(Math.random()),
        date: l.date || l.orderDate,
        type: l.type === 'payment' ? 'payment' : l.type === 'opening' ? 'opening' : 'order',
        description:
          l.description || (l.type === 'payment' ? 'Payment Received' : `Order #${l.id?.slice(0, 8)}`),
        notes: l.notes || orig.notes || orig.description || orig.note || orig.remarks || orig.paymentNotes || orig.paymentNote || '',
        amount: rawAmount,
        paid: rawPaid,
        balance: Number(l.runningBalance || 0),
        items: rawItems,
        rate: orig.unitPrice || orig.rate,
        quantity: orig.quantity,
        unit: orig.unit,
        shipmentCharge: orig.shipmentCharge,
        loadingCharge: orig.loadingCharge,
        unloadingCharge: orig.unloadingCharge,
        extraAmount: orig.extraAmount,
        extraAmountDescription: orig.extraAmountDescription,
        taxAmount: orig.taxAmount,
        discountAmount: orig.discountAmount || l.discountAmount,
      };
    }),
  };
}
