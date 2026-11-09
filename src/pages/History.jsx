import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, generateId } from '../db';
import { SyncEngine } from '../SyncEngine';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { generateInvoicePDF, generateReceiptPDF } from '../utils/pdf';
import { FileText, Search, Edit3, DollarSign, CornerDownLeft, X, ChevronDown, MessageCircle } from 'lucide-react';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileOpener } from '@capacitor-community/file-opener';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { sendTelegramMessage } from '../utils/telegram';
import ModelImage from '../components/ModelImage';
import { Accounting } from '../utils/accounting';

const STATUS_BADGE = { confirmed: 'badge-success', draft: 'badge-warning', returned: 'badge-danger', paid: 'badge-gold' };

function BalanceDisplay({ customerId, orderBalance }) {
  const fullBalance = useLiveQuery(() => Accounting.getCustomerBalance(customerId), [customerId]);
  return (
    <div className="flex flex-col">
      <span style={{ fontWeight: 700, color: orderBalance > 0 ? 'var(--danger)' : 'var(--success)' }}>
        Inv: ${Number(orderBalance || 0).toFixed(2)}
      </span>
      {fullBalance !== undefined && (
        <span className="text-[10px] text-muted font-bold uppercase" style={{ marginTop: -2 }}>
          Total: ${fullBalance.toFixed(2)}
        </span>
      )}
    </div>
  );
}

export default function History() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [detail, setDetail] = useState(null);
  const [pdfFrame, setPdfFrame] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchParams] = useSearchParams();
  const customerIdFilter = searchParams.get('customerId');

  const settings = useLiveQuery(() => db.settings.get(1));
  const colorsList = useLiveQuery(() => db.colors.toArray());

  const orders = useLiveQuery(async () => {
    let list = await db.orders.orderBy('date').reverse().toArray();
    list = await Promise.all(list.map(async o => ({ ...o, customer: await db.customers.get(o.customerId) })));
    if (customerIdFilter) {
      list = list.filter(o => String(o.customerId) === String(customerIdFilter));
    }
    if (search) list = list.filter(o =>
      o.customer?.name?.toLowerCase().includes(search.toLowerCase()) ||
      o.customer?.phone?.includes(search) || String(o.id) === search
    );
    if (dateFilter) list = list.filter(o => o.date?.startsWith(dateFilter));
    if (statusFilter) list = list.filter(o => o.status === statusFilter);
    return list;
  }, [search, dateFilter, customerIdFilter, statusFilter]);

  const customerName = useLiveQuery(() => 
    customerIdFilter ? db.customers.get(Number(customerIdFilter)).then(c => c?.name) : null
  , [customerIdFilter]);

  const overdueDebtors = useLiveQuery(() => Accounting.getOverdueDebtors(7), []);

  const openPDF = async (order, e) => {
    e?.stopPropagation();
    let data = order.pdfData;
    if (!data) {
      toast.info('Generating PDF...');
      try {
        data = await generateInvoicePDF(order, settings);
        if (!data) return;
        await db.orders.update(order.id, { pdfData: data });
      } catch (err) {
        console.error(err);
        if (err.message === 'SettingsMissing') {
          toast.error('يرجى إضافة بيانات المحل والشعار في الإعدادات أولاً');
          navigate('/settings');
        } else if (err.message === 'PDFGenerationFailed') {
          toast.error('فشل في توليد الفاتورة، يرجى التحقق من حجم الشعار');
        } else {
          toast.error('Error generating PDF');
        }
        return;
      }
    }
    if (Capacitor.isNativePlatform()) {
      try {
        const fileName = `Invoice_${order.id}_${Date.now()}.pdf`;
        const res = await Filesystem.writeFile({
          path: fileName,
          data: data.split(',')[1],
          directory: Directory.Cache,
        });
        await Share.share({
          title: `Invoice #${order.id}`,
          text: `Invoice for ${order.customer?.name}`,
          url: res.uri,
        });
      } catch (err) { 
        console.error('PDF Share error:', err);
        toast.error('Cannot open/share PDF'); 
      }
    } else { 
      const link = document.createElement('a');
      link.href = data;
      link.download = `Invoice_${order.id}.pdf`;
      link.click();
      toast.success('PDF Downloaded');
    }
  };

  const handleSettle = async (order, e) => {
    e?.stopPropagation();
    if (order.balance <= 0) { toast.info('Already paid'); return; }
    if (!confirm(`Settle $${order.balance.toFixed(2)} for ${order.customer?.name}?`)) return;
    await db.orders.update(order.id, { balance: 0, status: 'paid' });
    const pid = await generateId('payments');
    await db.payments.add({ id: pid, orderId: order.id, amount: order.balance, type: 'full', date: new Date().toISOString() });
    SyncEngine.saveForSync().catch(e => console.warn('Sync failed', e));
    toast.success('Balance settled!');
    // receipt PDF
    const rec = await generateReceiptPDF({ ...order, amountPaid: order.balance }, settings);
    if (Capacitor.isNativePlatform() && rec) {
      try {
        const fileName = `Receipt_${order.id}_${Date.now()}.pdf`;
        const res = await Filesystem.writeFile({
          path: fileName,
          data: rec.split(',')[1],
          directory: Directory.Cache,
        });
        await Share.share({
          title: `Receipt #${order.id}`,
          url: res.uri,
        });
      } catch (err) {
        console.error('Receipt Share error:', err);
      }
    } else if (rec) { 
      const link = document.createElement('a');
      link.href = rec;
      link.download = `Receipt_${order.id}.pdf`;
      link.click();
      toast.success('Receipt Downloaded');
    }

    // Telegram Notification
    const d = new Date();
    const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    const policyMsg = "Note : no return or change after two weeks from purchase date.";
    const tgText = `💰 <b>Paid</b>\n` +
      `----------------------------------\n` +
      `🆔 <b>Order #:</b> ${order.id}\n` +
      `📅 <b>Date:</b> ${dateStr}\n` +
      `👤 <b>Customer:</b> <b>${(order.customer?.name || 'N/A').toUpperCase()}</b>\n` +
      `💳 <b>Settle:</b> $${Math.round(order.balance)}\n` +
      `📉 <b>Balance:</b> $0\n` +
      `📝 <i>${policyMsg}</i>`;
    sendTelegramMessage(tgText, { status: 'paid' });
  };

  const handleReturn = async (order, e) => {
    e?.stopPropagation();
    if (order.status === 'returned') { toast.info('Already returned'); return; }
    if (!confirm('Process full return? This will restore stock.')) return;
    
    let finalDeposit = order.deposit || 0;
    if (finalDeposit > 0) {
      const depositRefunded = confirm(`Was the deposit ($${finalDeposit}) refunded to the customer? Click OK if refunded, Cancel to keep it as shop revenue.`);
      if (depositRefunded) {
        finalDeposit = 0;
        await db.walletEntries.add({
          label: `Refund for Order #${order.id}`,
          category: 'other',
          amount: order.deposit,
          currency: 'USD',
          type: 'expense',
          date: new Date().toISOString()
        });
      }
    }

    if (order.status !== 'draft') {
      for (const item of order.items || []) {
        const s = await db.stock.where({ modelCode: item.modelCode, color: item.color }).first();
        if (s) await db.stock.update(s.id, { quantity: s.quantity + Number(item.quantity) });
        else await db.stock.add({ modelCode: item.modelCode, color: item.color, size: item.size || '', quantity: Number(item.quantity) });
      }
    }

    await db.orders.update(order.id, { status: 'returned', balance: 0, deposit: finalDeposit, pdfData: null });
    SyncEngine.saveForSync().catch(e => console.warn('Sync failed', e));
    toast.success('Return processed — stock restored');

    // Telegram Notification
    const d = new Date(order.date);
    const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    const policyMsg = "Note : no return or change after two weeks from purchase date.";
    const tgText = `📝 <b>Returned</b>\n` +
      `----------------------------------\n` +
      `🆔 <b>Order #:</b> ${order.id}\n` +
      `📅 <b>Date:</b> ${dateStr}\n` +
      `👤 <b>Customer:</b> <b>${(order.customer?.name || 'N/A').toUpperCase()}</b>\n` +
      `💵 <b>Total:</b> $${Math.round(order.total)}\n` +
      `📉 <b>Status:</b> Returned\n` +
      `📝 <i>${policyMsg}</i>`;
    sendTelegramMessage(tgText, { status: 'invoice' });
  };

  const handleExchange = async (order, e) => {
    e?.stopPropagation();
    if (!confirm('Start an exchange for this order? Current cart will be cleared and old items returned to stock.')) return;
    
    if (order.status !== 'returned') {
      if (order.status !== 'draft') {
        for (const item of order.items || []) {
          const s = await db.stock.where({ modelCode: item.modelCode, color: item.color }).first();
          if (s) await db.stock.update(s.id, { quantity: s.quantity + Number(item.quantity) });
          else await db.stock.add({ modelCode: item.modelCode, color: item.color, size: item.size || '', quantity: Number(item.quantity) });
        }
      }
      await db.orders.update(order.id, { status: 'returned', balance: 0, pdfData: null });
    }
    
    await db.cart.clear();
    const newItems = (order.items || []).map(i => ({
      modelCode: i.modelCode, color: i.color, size: i.size || '', quantity: i.quantity, discount: i.discount || 0
    }));
    await db.cart.bulkAdd(newItems);
    navigate(`/order?customerId=${order.customerId}&note=${encodeURIComponent('Exchanged from Inv #' + order.id)}`);
  };

  const shareSMS = async (orderData) => {
    const customerName = orderData.customer?.name || 'Customer';
    const total = Number(orderData.total || 0).toFixed(2);
    const deposit = Number(orderData.deposit || 0).toFixed(2);
    const balance = Number(orderData.balance || 0).toFixed(2);
    const status = Number(orderData.balance || 0) <= 0 ? 'Paid' : 'Balance Pending';

    let itemsText = '';
    const totalQty = (orderData.items || []).reduce((s, i) => s + Number(i.quantity), 0);
    const isWholesale = totalQty >= 4;

    (orderData.items || []).forEach(i => {
      const price = isWholesale ? (i.wholesalePrice || 0) : (i.retailPrice || 0);
      const unitPrice = Math.max(0, price - (i.discount || 0)).toFixed(2);
      itemsText += `Model: ${i.modelCode} x ${i.quantity}\n`;
      itemsText += `${unitPrice} x ${i.quantity}\n`;
      itemsText += `color: ${i.color}\n\n`;
    });

    let text = `BEE QUEEN\n`;
    text += `------------------\n`;
    text += `Thank you for your purchase, \n`;
    text += `Mr/Ms : ${customerName}\n\n`;
    text += `Your order :\n`;
    text += itemsText;
    if (orderData.note) text += `Note: ${orderData.note}\n`;
    if (Number(orderData.deposit || 0) > 0) {
      text += `Deposit: $${deposit}\n`;
    }
    text += `Total: $${total}\n`;
    text += `------------------\n`;
    if (Number(orderData.balance || 0) > 0) {
      text += `Balance: $${balance}\n`;
    }
    text += `\nOrder has successfully confirmed.\n`;
    text += `Note: no return or change after two weeks from purchase date.\n\n`;
    text += `We appreciate your business. 🐝👑`;

    if (Capacitor.isNativePlatform()) {
      try { await Share.share({ title: 'Invoice', text, dialogTitle: 'Share Invoice' }); } catch {}
    } else {
      navigator.clipboard.writeText(text);
      toast.info('Invoice template copied to clipboard!');
    }
  };

  const shareWhatsApp = async (orderData) => {
    const phone = orderData.customer?.phone?.replace(/\+/g, '').replace(/ /g, '');
    if (!phone) { toast.error('Customer phone missing'); return; }

    const customerName = orderData.customer?.name || 'Customer';
    const total = Math.round(orderData.total || 0);
    const deposit = Math.round(orderData.deposit || 0);
    const balance = Math.round(orderData.balance || 0);
    const prevDebt = Math.round(orderData.customer?.accountBalance || 0);

    const d = new Date(orderData.date);
    const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

    let itemsText = '';
    const totalQty = (orderData.items || []).reduce((s, i) => s + Number(i.quantity), 0);
    const isWholesale = totalQty >= 4;

    (orderData.items || []).forEach(i => {
      const price = isWholesale ? (i.wholesalePrice || 0) : (i.retailPrice || 0);
      const unitPrice = Math.round(Math.max(0, price - (i.discount || 0)));
      itemsText += `• ${i.modelCode} | ${i.color} | Qty: ${i.quantity} | $${unitPrice}%0A`;
    });

    let header = orderData.status === 'returned' ? 'Returned' : (balance === 0 ? 'Paid' : 'Deposit');
    if (orderData.status === 'draft') header = 'Invoice';

    let text = `📝 *${header}*\n`;
    text += `------------------\n`;
    text += `🆔 *Order #:* ${orderData.id}\n`;
    text += `📅 *Date:* ${dateStr}\n`;
    text += `👤 *Customer:* *${customerName.toUpperCase()}*\n`;
    text += `📞 *Phone:* +${phone}\n`;
    text += `💳 *Prev. Debt:* $${prevDebt}\n`;
    text += `------------------\n`;
    text += `📦 *Items:*\n`;
    text += itemsText.replace(/%0A/g, '\n');
    text += `------------------\n`;
    text += `💵 *Total:* *$${total}*\n`;
    if (deposit > 0) {
      text += `📥 *Deposit:* $${deposit}\n`;
    }
    text += `📉 *Balance:* $${balance}\n`;
    
    let finalNote = orderData.note || '';
    const policyMsg = "Note : no return or change after two weeks from purchase date.";
    finalNote = finalNote ? `${finalNote}\n_${policyMsg}_` : `_${policyMsg}_`;
    text += `📝 *Note:* ${finalNote}`;

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="animate-in">
      <div className="page-header">
        <h2>{t('History')} {customerName && `— ${customerName}`}</h2>
        <div className="page-actions">
          <button className={`btn btn-sm ${statusFilter === 'confirmed' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setStatusFilter(statusFilter === 'confirmed' ? '' : 'confirmed')}>Deposit</button>
          <button className={`btn btn-sm ${statusFilter === 'draft' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setStatusFilter(statusFilter === 'draft' ? '' : 'draft')}>Invoice</button>
          <button className={`btn btn-sm ${statusFilter === 'returned' ? 'btn-danger' : 'btn-ghost'}`} onClick={() => setStatusFilter(statusFilter === 'returned' ? '' : 'returned')}>Returned</button>
          <input type="date" className="input" value={dateFilter}
            onChange={e => setDateFilter(e.target.value)} style={{ width: 155 }} />
          <div className="search-wrap">
            <Search size={16} className="search-icon" />
            <input className="input" placeholder="Name, phone or #ID" value={search}
              onChange={e => setSearch(e.target.value)} style={{ width: 180 }} />
          </div>
        </div>
      </div>

      {overdueDebtors?.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <p className="text-xs text-danger mb-2" style={{ fontWeight: 800 }}>⚠️ Overdue Debts (&gt; 1 week):</p>
          <div className="flex gap-2 overflow-x-auto pb-2" style={{ whiteSpace: 'nowrap' }}>
            {overdueDebtors.map(c => (
              <button 
                key={c.id} 
                className="btn btn-sm btn-ghost" 
                style={{ background: 'var(--danger-dim)', border: '1px solid var(--danger)', color: 'var(--danger)', fontSize: '11px', borderRadius: 'var(--r-full)' }}
                onClick={() => setSearch(c.name)}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('Date')}</th><th>Status</th>
              <th>{t('Customer')}</th><th>{t('Total')}</th>
              <th>{t('Balance')}</th><th>{t('Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {orders?.map(order => (
              <tr key={order.id} style={{ cursor: 'pointer' }} onClick={() => setDetail(order)}>
                <td className="text-sm">
                  {new Date(order.date).toLocaleDateString('en-GB')}
                </td>
                <td>
                  <span className={`badge ${STATUS_BADGE[order.status] || 'badge-muted'}`}>
                    {t(order.status === 'confirmed' ? 'Deposit' : order.status === 'draft' ? 'Invoice' : order.status === 'returned' ? 'Returned' : 'Paid')}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                    <div className="avatar" style={{ width: 28, height: 28 }}>
                      {order.customer?.photo
                        ? <img src={order.customer.photo} alt={order.customer.name} />
                        : <span style={{ fontSize: '.8rem' }}>👤</span>}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }}>{order.customer?.name}</div>
                      <div className="text-xs text-muted">{order.customer?.phone}</div>
                    </div>
                  </div>
                </td>
                <td style={{ fontWeight: 700 }}>${Number(order.total || 0).toFixed(2)}</td>
                <td>
                  <BalanceDisplay customerId={order.customerId} orderBalance={order.balance} />
                </td>
                <td onClick={e => e.stopPropagation()}>
                  <div className="flex gap-1">
                    <button className="btn btn-gold btn-icon" title="View PDF" onClick={e => openPDF(order, e)}>
                      <FileText size={15} />
                    </button>
                    {order.customer?.phone && (
                      <button 
                        className="btn btn-icon" 
                        style={{ color: '#25D366' }} 
                        title="WhatsApp" 
                        onClick={e => { e.stopPropagation(); shareWhatsApp(order); }}
                      >
                        <MessageCircle size={15} />
                      </button>
                    )}
                    {order.balance > 0 && order.status !== 'returned' && (
                      <button className="btn btn-success btn-icon" title="Settle Balance" onClick={e => handleSettle(order, e)}>
                        <DollarSign size={15} />
                      </button>
                    )}
                    {order.status !== 'returned' && order.status !== 'draft' && (
                      <button className="btn btn-danger btn-icon" title="Return" onClick={e => handleReturn(order, e)}>
                        <CornerDownLeft size={15} />
                      </button>
                    )}
                    <button className="btn btn-warning btn-icon" title="Exchange" onClick={e => handleExchange(order, e)}>
                      <Edit3 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {orders?.length === 0 && (
              <tr><td colSpan={7}>
                <div className="empty-state"><FileText size={40} /><p>No orders found</p></div>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {detail && (
        <div className="modal-backdrop" onClick={() => setDetail(null)} style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal" style={{ maxWidth: 560, margin: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Order #{String(detail.id).padStart(5, '0')} — {detail.customer?.name}</span>
              <button className="btn btn-ghost btn-icon" onClick={() => setDetail(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="flex gap-3 flex-wrap mb-2">
                <div><div className="form-label">Date</div>{new Date(detail.date).toLocaleString()}</div>
                <div><div className="form-label">Status</div>
                  <span className={`badge ${STATUS_BADGE[detail.status] || 'badge-muted'}`}>{detail.status}</span>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th style={{ width: 44 }}>Img</th><th>Code</th><th>Color</th><th>Qty</th><th>Disc.</th><th>Unit</th></tr></thead>
                  <tbody>
                    {detail.items?.map((item, i) => {
                      const colorDef = colorsList?.find(c => c.name.toLowerCase() === item.color?.toLowerCase());
                      return (
                        <tr key={i}>
                          <td><ModelImage modelCode={item.modelCode} style={{ width: 32, height: 32, borderRadius: 4 }} /></td>
                          <td style={{ fontWeight: 700 }}>{item.modelCode}</td>
                          <td>
                            <div className="flex items-center gap-1">
                              {colorDef && <span className="color-dot" style={{ background: colorDef.hex, width: 10, height: 10 }} />}
                              {item.color}
                            </div>
                          </td>
                          <td>{item.quantity}</td>
                          <td className="text-danger">{item.discount > 0 ? `-$${item.discount}` : '—'}</td>
                          <td>${item.wholesalePrice}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ background: 'var(--s2)', borderRadius: 'var(--r-md)', padding: '1rem' }}>
                <div className="flex justify-between mb-2"><span className="text-muted">Total</span><span style={{ fontWeight: 600 }}>${Number(detail.total || 0).toFixed(2)}</span></div>
                <div className="flex justify-between mb-2"><span className="text-muted">Deposit</span><span style={{ color: 'var(--success)' }}>-${Number(detail.deposit || 0).toFixed(2)}</span></div>
                <div className="divider" style={{ margin: '.5rem 0' }} />
                <div className="flex justify-between">
                  <span style={{ fontWeight: 700 }}>Balance</span>
                  <span style={{ fontWeight: 800, fontSize: 'var(--fs-lg)', color: detail.balance > 0 ? 'var(--danger)' : 'var(--success)' }}>
                    ${Number(detail.balance || 0).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
            <div className="modal-footer flex-wrap" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '.5rem' }}>
              <button className="btn btn-primary" onClick={e => openPDF(detail, e)}><FileText size={15} /> PDF</button>
              {detail.customer?.phone && (
                <button className="btn" style={{ background: '#25D366', color: '#fff' }} onClick={() => shareWhatsApp(detail)}>
                  <MessageCircle size={15} /> WhatsApp
                </button>
              )}
              <button className="btn btn-success" onClick={() => shareSMS(detail)}>Share</button>
              <button className="btn btn-warning" onClick={e => { handleExchange(detail, e); setDetail(null); }}><Edit3 size={15} /> Exchange</button>
              {detail.balance > 0 && <button className="btn btn-success" onClick={e => { handleSettle(detail, e); setDetail(null); }}><DollarSign size={15} /> Settle</button>}
              {detail.status !== 'returned' && <button className="btn btn-danger" onClick={e => { handleReturn(detail, e); setDetail(null); }}><CornerDownLeft size={15} /> Return</button>}
            </div>
          </div>
        </div>
      )}

      {/* PDF preview removed as per request */}
    </div>
  );
}
