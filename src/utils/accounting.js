import { db } from '../db';

/**
 * Professional Accounting Logic for Bee Queen
 */

export const Accounting = {
  /**
   * Calculates a customer's full balance
   * Balance = (Sum of confirmed orders + manual balance + commissions) - Payments - Returns
   */
  getCustomerBalance: async (customerId) => {
    const customer = await db.customers.get(customerId);
    if (!customer) return 0;

    const orders = await db.orders.where('customerId').equals(customerId).toArray();
    const payments = await db.payments.where('customerId').equals(customerId).toArray(); // Assuming we link payments to customers too
    const returns = await db.returns.where('customerId').equals(customerId).toArray();

    const confirmedOrders = orders.filter(o => o.status !== 'draft' && o.status !== 'returned');
    const totalOrdered = confirmedOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const totalDeposits = confirmedOrders.reduce((sum, o) => sum + Number(o.deposit || 0), 0);
    
    // We need to be careful: are payments already counted in 'deposit'? 
    // Usually 'deposit' is the payment made at the time of order.
    // 'payments' table handles subsequent payments.
    
    const extraPayments = (await db.payments.filter(p => p.customerId === customerId).toArray())
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
      
    const totalReturns = returns.reduce((sum, r) => sum + Number(r.totalRefund || 0), 0);
    
    const initialBalance = Number(customer.accountBalance || 0);
    const commissions = Number(customer.commission || 0);

    // Current Debt = (Initial + Total Ordered) - Deposits - Extra Payments - Returns + Commissions
    return initialBalance + totalOrdered - totalDeposits - extraPayments - totalReturns + commissions;
  },

  /**
   * Calculates a factory's ledger balance
   * Balance = (Initial Debt + Total Supplies) - Total Payments - Total Returns
   */
  getFactoryBalance: async (factoryId) => {
    const factory = await db.factories.get(factoryId);
    if (!factory) return 0;

    const supplies = await db.factorySupplies.where('factoryId').equals(factoryId).toArray();
    const payments = await db.factoryPayments.where('factoryId').equals(factoryId).toArray();
    const returns = await db.factoryReturns.where('factoryId').equals(factoryId).toArray();
    
    let supplyValue = 0;
    for (const supply of supplies) {
      const items = await db.factoryItems.where('supplyId').equals(supply.id).toArray();
      supplyValue += items.reduce((sum, item) => sum + (Number(item.priceAtTime || 0) * Number(item.quantity || 0)), 0);
    }

    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const totalReturns = returns.reduce((sum, r) => sum + Number(r.amountCredited || 0), 0);
    
    const initialDebt = Number(factory.initialDebt || 0);

    return initialDebt + supplyValue - totalPaid - totalReturns;
  },

  /**
   * Daily Kasa (Case) Summary
   */
  getDailyKasaReport: async (dateStr) => {
    const entries = await db.walletEntries.where('date').equals(dateStr).toArray();
    
    const income = entries.filter(e => e.type === 'income').reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const expense = entries.filter(e => e.type === 'expense').reduce((sum, e) => sum + Number(e.amount || 0), 0);
    
    // Previous balance (Opening)
    const prevDate = new Date(dateStr);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDateStr = prevDate.toISOString().split('T')[0];
    
    const openingEntry = await db.walletEntries
      .where('[date+type]')
      .equals([dateStr, 'opening'])
      .first();
      
    return {
      opening: openingEntry?.amount || 0,
      income,
      expense,
      closing: (openingEntry?.amount || 0) + income - expense
    };
  },

  /**
   * Get all customers with overdue debts (> X days)
   */
  getOverdueDebtors: async (days = 7) => {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - days);
    
    const customers = await db.customers.toArray();
    const overdue = [];
    
    for (const c of customers) {
      const balance = await Accounting.getCustomerBalance(c.id);
      if (balance > 0) {
        // Check if there's any confirmed order older than threshold with balance > 0
        const oldOrders = await db.orders
          .where('customerId').equals(c.id)
          .filter(o => o.status !== 'draft' && o.status !== 'returned' && o.balance > 0 && new Date(o.date) < threshold)
          .toArray();
          
        if (oldOrders.length > 0 || (c.createdAt && new Date(c.createdAt) < threshold)) {
          overdue.push({ ...c, currentBalance: balance });
        }
      }
    }
    return overdue;
  },

  /**
   * Profit Analysis for a given period
   */
  getProfitAnalysis: async (startDate, endDate) => {
    const orders = await db.orders
      .where('date').between(startDate, endDate, true, true)
      .filter(o => o.status !== 'draft' && o.status !== 'returned')
      .toArray();
      
    let totalRevenue = 0;
    let totalCost = 0;
    
    orders.forEach(o => {
      totalRevenue += Number(o.finalTotal || 0);
      o.items.forEach(i => {
        totalCost += Number(i.purchasePrice || 0) * Number(i.quantity || 0);
      });
    });
    
    const expenses = (await db.walletEntries
      .where('date').between(startDate, endDate, true, true)
      .filter(e => e.type === 'expense')
      .toArray())
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);
      
    return {
      revenue: totalRevenue,
      cost: totalCost,
      expenses,
      netProfit: totalRevenue - totalCost - expenses
    };
  },

  /**
   * Universal Transaction Adder
   * Handles manual debt adjustments and payments
   */
  addTransaction: async (customerId, { type, amount, note }) => {
    // We treat manual adjustments as special payments or "extra" orders
    if (type === 'payment') {
      await db.payments.add({
        customerId,
        amount: Number(amount),
        type: 'manual',
        note: note || 'Manual Payment',
        date: new Date().toISOString()
      });
    } else if (type === 'loan') {
      // For loans/extra debt, we could add a dummy order or a negative payment.
      // Better to have a 'transactions' table, but let's use accountBalance update for now
      // or add a negative payment to the payments table.
      const customer = await db.customers.get(customerId);
      const current = Number(customer.accountBalance || 0);
      await db.customers.update(customerId, { accountBalance: current + Number(amount) });
    }
  }
};
