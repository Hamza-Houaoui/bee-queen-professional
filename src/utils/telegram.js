import { db } from '../db';
import { exportDB } from 'dexie-export-import';

/**
 * Sends a message to the configured Telegram channel.
 */
export async function sendTelegramMessage(text, options = {}) {
  const { forcedChatId = null, status = null } = options;
  const settings = await db.settings.get(1);
  if (!settings?.tgBotToken) return;

  let targetChatId = forcedChatId;
  if (!targetChatId) {
    if (status === 'paid' || status === 'invoice' || status === 'draft') targetChatId = settings.tgInvoiceChatId || settings.tgReportChatId;
    else if (status === 'deposit') targetChatId = settings.tgDepositChatId || settings.tgReportChatId;
    else targetChatId = settings.tgReportChatId;
  }
  
  if (!targetChatId) return;

  try {
    const url = `https://api.telegram.org/bot${settings.tgBotToken}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChatId,
        text: text,
        parse_mode: 'HTML'
      })
    });
    return await response.json();
  } catch (err) {
    console.error('Telegram Message Error:', err);
  }
}

/**
 * Sends a file (as Blob or Base64) to the configured Telegram channel.
 */
export async function sendTelegramDocument(blob, fileName, caption = '', options = {}) {
  const { forcedChatId = null, status = null } = options;
  const settings = await db.settings.get(1);
  if (!settings?.tgBotToken) return;

  let targetChatId = forcedChatId;
  if (!targetChatId) {
    if (status === 'paid' || status === 'invoice' || status === 'draft') targetChatId = settings.tgInvoiceChatId || settings.tgReportChatId;
    else if (status === 'deposit') targetChatId = settings.tgDepositChatId || settings.tgReportChatId;
    else targetChatId = settings.tgReportChatId;
  }
  
  if (!targetChatId) return;

  try {
    const url = `https://api.telegram.org/bot${settings.tgBotToken}/sendDocument`;
    const formData = new FormData();
    formData.append('chat_id', targetChatId);
    formData.append('document', blob, fileName);
    if (caption) formData.append('caption', caption);

    const response = await fetch(url, {
      method: 'POST',
      body: formData
    });
    return await response.json();
  } catch (err) {
    console.error('Telegram Document Error:', err);
  }
}

/**
 * Generates and sends a full backup (JSON file) to Telegram.
 */
export async function performTelegramBackup() {
  const settings = await db.settings.get(1);
  if (!settings?.tgBotToken || !settings?.tgReportChatId) return;

  try {
    const blob = await exportDB(db, { prettyJson: false });
    
    // Telegram Bot API limit is exactly 50 MB
    if (blob.size > 49.5 * 1024 * 1024) {
      console.warn('Backup is too large for Telegram API (> 50MB). Skipping upload to prevent errors.');
      return { ok: false, description: 'File too large (> 50MB). Please clean old media from settings.' };
    }

    const fileName = `BeeQueen_FullBackup_${new Date().toISOString().split('T')[0]}.json`;

    const res = await sendTelegramDocument(blob, fileName, `🐝 👑 Bee Queen Full System Backup\n📅 ${new Date().toLocaleString()}`);
    
    if (res?.ok) {
      await db.settings.update(1, { lastBackupDate: new Date().toISOString().split('T')[0] });
    }
    return res;
  } catch (err) {
    console.error('Backup Error:', err);
  }
}

/**
 * Sends a weekly performance report to Telegram.
 */
export async function performWeeklyReport() {
  const settings = await db.settings.get(1);
  if (!settings?.tgBotToken) return;
  const targetChatId = settings.tgReportChatId || settings.tgChatId;
  if (!targetChatId) return;

  try {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const orders = await db.orders.filter(o => new Date(o.date) >= oneWeekAgo && o.status !== 'draft').toArray();
    const payments = await db.payments.filter(p => new Date(p.date) >= oneWeekAgo).toArray();
    const customers = await db.customers.toArray();

    const revenueFromOrders = orders.reduce((sum, o) => sum + Number(o.deposit || 0), 0);
    const extraPayments = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const totalRevenue = revenueFromOrders + extraPayments;
    const manualDebts = customers.reduce((sum, c) => sum + Number(c.accountBalance || 0), 0);
    const orderDebts = (await db.orders.filter(o => o.status !== 'draft' && o.status !== 'returned').toArray()).reduce((sum, o) => sum + Number(o.balance || 0), 0);
    const totalDebts = manualDebts + orderDebts;
    const totalItems = orders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0), 0);

    const modelSales = {};
    orders.forEach(o => {
      o.items.forEach(i => {
        modelSales[i.modelCode] = (modelSales[i.modelCode] || 0) + i.quantity;
      });
    });
    const topModels = Object.entries(modelSales).sort((a, b) => b[1] - a[1]).slice(0, 5);
    
    let topModelsText = '';
    topModels.forEach(([code, qty], i) => {
      topModelsText += `${i + 1}. ${code}: ${qty} units\n`;
    });

    const models = await db.models.toArray();
    
    let totalCost = 0;
    orders.forEach(o => {
      o.items.forEach(i => {
        const m = models.find(mod => mod.code === i.modelCode);
        const costPrice = i.purchasePrice !== undefined ? i.purchasePrice : (m?.purchasePrice || 0);
        totalCost += costPrice * i.quantity;
      });
    });
    const estProfit = totalRevenue - totalCost;

    const reportText = `📈 <b>WEEKLY BUSINESS PERFORMANCE</b>\n` +
      `----------------------------------\n` +
      `💰 <b>Total Revenue:</b> $${Math.round(totalRevenue).toLocaleString()}\n` +
      `📉 <b>Total Costs:</b> $${Math.round(totalCost).toLocaleString()}\n` +
      `💹 <b>Est. Profit:</b> $${Math.round(estProfit).toLocaleString()}\n` +
      `💸 <b>Pending Debts:</b> $${Math.round(totalDebts).toLocaleString()}\n` +
      `📦 <b>Units Sold:</b> ${totalItems.toLocaleString()}\n` +
      `----------------------------------\n` +
      `🏆 <b>Top Selling Models:</b>\n${topModelsText || 'No sales data'}\n` +
      `----------------------------------\n` +
      `📅 <i>Weekly Report: ${oneWeekAgo.toLocaleDateString()} - ${now.toLocaleDateString()}</i>`;

    // Strictly use Report Chat ID as requested
    const targetChatId = settings.tgReportChatId;
    if (!targetChatId) {
      console.warn('Weekly Report skipped: tgReportChatId not configured');
      return;
    }

    const res = await sendTelegramMessage(reportText, { forcedChatId: targetChatId });
    if (res?.ok) {
      // Get current week number or just date string
      const reportKey = `W${Math.ceil(now.getDate() / 7)}_${now.getMonth() + 1}_${now.getFullYear()}`;
      await db.settings.update(1, { lastWeeklyReportDate: reportKey });
    }
    return res;
  } catch (err) {
    console.error('Weekly Report Error:', err);
  }
}

/**
 * Sends a detailed inventory report (Stock levels) to Telegram.
 */
export async function sendInventoryReport() {
  const settings = await db.settings.get(1);
  if (!settings?.tgBotToken || !settings?.tgReportChatId) return;

  try {
    const stockItems = await db.stock.filter(s => s.quantity > 0).toArray();
    if (stockItems.length === 0) {
      return await sendTelegramMessage("📦 <b>Bee Queen Inventory Report</b>\nInventory is currently empty.", { forcedChatId: settings.tgReportChatId });
    }

    // Group by model code
    const grouped = stockItems.reduce((acc, item) => {
      if (!acc[item.modelCode]) acc[item.modelCode] = [];
      acc[item.modelCode].push(item);
      return acc;
    }, {});

    const sortedModels = Object.keys(grouped).sort();

    let header = `📦 <b>INVENTORY REPORT</b>\n` +
                 `📅 ${new Date().toLocaleString()}\n` +
                 `----------------------------------\n`;
    
    let messages = [];
    let currentMessage = header;
    let totalQty = 0;

    for (const code of sortedModels) {
      let modelBlock = `<b>${code}:</b>\n`;
      for (const item of grouped[code]) {
        const sizeStr = item.size ? ` (${item.size})` : '';
        modelBlock += `  • ${item.color}${sizeStr}: <b>${item.quantity}</b>\n`;
        totalQty += item.quantity;
      }
      modelBlock += `\n`;

      if ((currentMessage + modelBlock).length > 3900) {
        messages.push(currentMessage);
        currentMessage = modelBlock;
      } else {
        currentMessage += modelBlock;
      }
    }

    const footer = `----------------------------------\n` +
                   `📊 <b>Total Items in Stock: ${totalQty}</b>`;
    
    if ((currentMessage + footer).length > 3900) {
      messages.push(currentMessage);
      messages.push(footer);
    } else {
      currentMessage += footer;
      messages.push(currentMessage);
    }

    let allOk = true;
    for (const msg of messages) {
      const res = await sendTelegramMessage(msg, { forcedChatId: settings.tgReportChatId });
      if (!res?.ok) allOk = false;
    }

    if (allOk) {
      await db.settings.update(1, { lastInventoryReportDate: new Date().toISOString().split('T')[0] });
    }

    return allOk;
  } catch (err) {
    console.error('Inventory Report Error:', err);
  }
}

/**
 * Sends a professional daily report for all manufacturers at 18:00
 */
export async function sendFactoryReport() {
  const settings = await db.settings.get(1);
  if (!settings?.tgBotToken || !settings?.tgReportChatId) return;

  try {
    const factories = await db.factories.toArray();
    const supplies = await db.factorySupplies.toArray();
    const items = await db.factoryItems.toArray();
    const payments = await db.factoryPayments.toArray();
    const returns = await db.factoryReturns.toArray();
    const models = await db.models.toArray();
    const orders = await db.orders.toArray();

    if (factories.length === 0) return;

    for (const factory of factories) {
      // 1. Calculate Ledger
      const fSupplies = supplies.filter(s => s.factoryId === factory.id);
      const fPayments = payments.filter(p => p.factoryId === factory.id);
      const fReturns = returns.filter(r => r.factoryId === factory.id);

      const totalPaid = fPayments.reduce((sum, p) => sum + Number(p.amount), 0);
      const totalReturnsAmount = fReturns.reduce((sum, r) => sum + Number(r.amountCredited), 0);
      
      const supplyValue = fSupplies.reduce((sum, s) => {
        const val = items.filter(i => i.supplyId === s.id).reduce((isum, i) => isum + (i.priceAtTime * i.quantity), 0);
        return sum + val;
      }, 0);

      const debt = (factory.initialDebt || 0) + supplyValue - totalPaid - totalReturnsAmount;

      // 2. Calculate Total Sales (at cost)
      const fModels = models.filter(m => m.factoryId === factory.id);
      const fCodes = new Set(fModels.map(m => m.code));
      let totalSalesAtCost = 0;
      orders.forEach(o => {
        if (o.status === 'confirmed' || o.status === 'paid') {
          (o.items || []).forEach(item => {
            if (fCodes.has(item.modelCode)) {
              const m = fModels.find(mod => mod.code === item.modelCode);
              totalSalesAtCost += (m?.purchasePrice || 0) * Number(item.quantity);
            }
          });
        }
      });

      const reportText = `🏭 <b>MANUFACTURER DAILY REPORT</b>\n` +
        `🏢 <b>Factory:</b> ${factory.name}\n` +
        `----------------------------------\n` +
        `📦 <b>Total Purchases:</b> $${supplyValue.toLocaleString()}\n` +
        `💰 <b>Total Paid:</b> $${totalPaid.toLocaleString()}\n` +
        `🔄 <b>Returns:</b> $${totalReturnsAmount.toLocaleString()}\n` +
        `📈 <b>Total Sales (Cost):</b> $${totalSalesAtCost.toLocaleString()}\n` +
        `🚨 <b>TOTAL DEBT OWED:</b> <b>$${debt.toLocaleString()}</b>\n` +
        `----------------------------------\n` +
        `📅 <i>Date: ${new Date().toLocaleDateString()}</i>`;

      await sendTelegramMessage(reportText, { forcedChatId: settings.tgReportChatId });
    }
    
    await db.settings.update(1, { lastFactoryReportDate: new Date().toISOString().split('T')[0] });
    return true;
  } catch (err) {
    console.error('Factory Report Error:', err);
  }
}

/**
 * Sends a full professional financial report (Counts) at 19:30
 */
export async function sendCountsReport() {
  const settings = await db.settings.get(1);
  if (!settings?.tgBotToken || !settings?.tgReportChatId) return;

  try {
    const orders = await db.orders.toArray();
    const customers = await db.customers.toArray();
    const models = await db.models.toArray();

    const confirmedOrders = orders.filter(o => o.status !== 'draft' && o.status !== 'returned');
    const allPayments = await db.payments.toArray();
    
    const totalDeposits = confirmedOrders.reduce((sum, o) => sum + Number(o.deposit || 0), 0);
    const totalLaterPayments = allPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const totalRevenue = totalDeposits + totalLaterPayments;
    
    const manualDebts = customers.reduce((sum, c) => sum + Number(c.accountBalance || 0), 0);
    const orderDebts = confirmedOrders.reduce((sum, o) => sum + Number(o.balance || 0), 0);
    const totalDebts = manualDebts + orderDebts;
    
    const totalItems = confirmedOrders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0), 0);

    let totalCost = 0;
    confirmedOrders.forEach(o => {
      o.items.forEach(i => {
        const m = models.find(mod => mod.code === i.modelCode);
        const costPrice = i.purchasePrice !== undefined ? i.purchasePrice : (m?.purchasePrice || 0);
        totalCost += costPrice * i.quantity;
      });
    });
    
    const estProfit = totalRevenue - totalCost;

    const reportText = `💎 <b>DAILY FINANCIAL SUMMARY</b>\n` +
      `----------------------------------\n` +
      `💰 <b>TOTAL REVENUE:</b> $${totalRevenue.toLocaleString()}\n` +
      `📉 <b>TOTAL COSTS:</b> $${totalCost.toLocaleString()}\n` +
      `💹 <b>NET PROFIT:</b> $${estProfit.toLocaleString()}\n` +
      `💸 <b>PENDING DEBTS:</b> $${totalDebts.toLocaleString()}\n` +
      `📦 <b>UNITS SOLD:</b> ${totalItems.toLocaleString()}\n` +
      `----------------------------------\n` +
      `📅 <i>Command Center Daily Report: ${new Date().toLocaleDateString()}</i>`;

    await sendTelegramMessage(reportText, { forcedChatId: settings.tgReportChatId });
    await db.settings.update(1, { lastCountsReportDate: new Date().toISOString().split('T')[0] });
    return true;
  } catch (err) {
    console.error('Counts Report Error:', err);
  }
}

/**
 * Sends a detailed daily Kasa (Cash Flow) report
 */
export async function sendDailyKasaReport() {
  const settings = await db.settings.get(1);
  if (!settings?.tgBotToken || !settings?.tgReportChatId) return;

  try {
    const today = new Date().toISOString().split('T')[0];
    const entries = await db.walletEntries.where('date').startsWith(today).toArray();
    
    const incomes = entries.filter(e => e.type === 'income');
    const expenses = entries.filter(e => e.type === 'expense');
    const opening = entries.find(e => e.type === 'opening');

    const totalIncome = incomes.reduce((s, e) => s + Number(e.amount), 0);
    const totalExpense = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const openingBal = Number(opening?.amount || 0);
    const closingBal = openingBal + totalIncome - totalExpense;

    let incomeText = incomes.map(i => `   • ${i.label}: $${i.amount}`).join('\n') || '   None';
    let expenseText = expenses.map(e => `   • ${e.label}: $${e.amount}`).join('\n') || '   None';

    const reportText = `💰 <b>DAILY KASA REPORT / تقرير الكاسة اليومي</b>\n` +
      `📅 ${new Date().toLocaleDateString()}\n` +
      `----------------------------------\n` +
      `💵 <b>Opening Balance:</b> $${openingBal.toLocaleString()}\n` +
      `📥 <b>Total Incomes:</b> $${totalIncome.toLocaleString()}\n` +
      `${incomeText}\n` +
      `📤 <b>Total Expenses:</b> $${totalExpense.toLocaleString()}\n` +
      `${expenseText}\n` +
      `----------------------------------\n` +
      `💎 <b>CLOSING BALANCE:</b> <b>$${closingBal.toLocaleString()}</b>\n` +
      `----------------------------------\n` +
      `🐝 <i>Bee Queen Professional System</i>`;

    return await sendTelegramMessage(reportText, { forcedChatId: settings.tgReportChatId });
  } catch (err) {
    console.error('Kasa Report Error:', err);
  }
}

