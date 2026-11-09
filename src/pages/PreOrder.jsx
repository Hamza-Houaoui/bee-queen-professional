import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { 
  Search, Trash2, Edit3, MessageCircle, CheckCircle, 
  X, AlertTriangle, ClipboardList
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ModelImage from '../components/ModelImage';
import { Accounting } from '../utils/accounting';
import { smartSearch } from '../utils/search';

const STATUS_BADGE = { confirmed: 'badge-success', draft: 'badge-warning', paid: 'badge-gold' };

const ACTION_LABELS = {
  collected: { label: 'Collected', emoji: '✅', color: 'var(--success)' },
  edited:    { label: 'Edited',    emoji: '✏️', color: 'var(--warning)' },
};

export default function PreOrder() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [detail, setDetail] = useState(null);
  const [customerDebt, setCustomerDebt] = useState(0);
  const [stockInfo, setStockInfo] = useState({});
  const [confirmModal, setConfirmModal] = useState(null);
  const [showHistory, setShowHistory] = useState(false);

  const colorsList = useLiveQuery(() => db.colors.toArray());

  const preOrders = useLiveQuery(async () => {
    let list = await db.orders.toCollection().filter(o => !!o.isSparis && !o.isCollected).toArray();
    list.sort((a, b) => new Date(b.date) - new Date(a.date));
    list = await Promise.all(list.map(async o => ({
      ...o,
      customer: await db.customers.get(o.customerId)
    })));

    const now = new Date();
    if (filterType === 'day') {
      const today = now.toISOString().split('T')[0];
      list = list.filter(o => o.date.startsWith(today));
    } else if (filterType === 'week') {
      const weekAgo = new Date(); weekAgo.setDate(now.getDate() - 7);
      list = list.filter(o => new Date(o.date) >= weekAgo);
    } else if (filterType === 'month') {
      const monthAgo = new Date(); monthAgo.setMonth(now.getMonth() - 1);
      list = list.filter(o => new Date(o.date) >= monthAgo);
    }
    if (search) {
      list = smartSearch(list, search, ['id', 'customer.name', 'customer.phone']);
    }
    return list;
  }, [search, filterType]);

  // History log query
  const historyLogs = useLiveQuery(async () => {
    const logs = await db.preOrderLogs.orderBy('timestamp').reverse().limit(200).toArray();
    return await Promise.all(logs.map(async log => {
      const order = await db.orders.get(log.orderId);
      const customer = order ? await db.customers.get(order.customerId) : null;
      return { ...log, customer };
    }));
  }, [showHistory]);
  
  // Fetch additional info when modal opens
  React.useEffect(() => {
    if (detail) {
      Accounting.getCustomerBalance(detail.customerId).then(setCustomerDebt);
      
      const fetchStock = async () => {
        const info = {};
        for (const item of detail.items) {
          const s = await db.stock.where({ modelCode: item.modelCode, color: item.color }).first();
          info[`${item.modelCode}-${item.color}`] = s?.quantity || 0;
        }
        setStockInfo(info);
      };
      fetchStock();
    }
  }, [detail]);

  const logAction = async (orderId, action, customerName, total) => {
    await db.preOrderLogs.add({
      orderId,
      action,
      customerName,
      total,
      timestamp: new Date().toISOString(),
    });
  };

  const handleCollect = (order) => {
    setConfirmModal({
      title: t('Collect Order'),
      msg: t('Mark this order as collected? It will be removed from this list.'),
      action: async () => {
        await db.orders.update(order.id, { isCollected: true });
        await logAction(order.id, 'collected', order.customer?.name, order.finalTotal || order.total);
        toast.success(t('Order collected!'));
        setDetail(null);
      }
    });
  };

  const handleWhatsAppReady = (order) => {
    const phone = order.customer?.phone?.replace(/\+/g, '').replace(/ /g, '');
    if (!phone) { toast.error('Customer phone missing'); return; }
    const customerName = order.customer?.name || 'Customer';
    let text = `🐝 *BEE QUEEN*\n------------------\n`;
    text += `Hello *${customerName.toUpperCase()}*,\n`;
    text += `Your order *#${order.id}* is ready for pickup! 📦✅\n\n*Details:*\n`;
    order.items.forEach(i => { text += `• ${i.modelCode} | ${i.color} | Qty: ${i.quantity}\n`; });
    text += `\n*Balance:* $${Math.round(order.balance)}\n------------------\nWe are waiting for you! 🐝👑`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleExchange = (order) => {
    setConfirmModal({
      title: t('Edit Order'),
      msg: t('Start editing this order? Current cart will be cleared.'),
      action: async () => {
        await logAction(order.id, 'edited', order.customer?.name, order.finalTotal || order.total);
        await db.cart.clear();
        const newItems = (order.items || []).map(i => ({
          modelCode: i.modelCode, color: i.color, size: i.size || '', quantity: i.quantity, discount: i.discount || 0
        }));
        await db.cart.bulkAdd(newItems);
        navigate(`/order?customerId=${order.customerId}&note=${encodeURIComponent('Editing Pre-Order #' + order.id)}`);
      }
    });
  };

  const handleDelete = (orderId) => {
    setConfirmModal({
      title: t('Delete Order'),
      msg: t('Are you sure you want to delete this order permanently?'),
      action: async () => {
        await db.orders.delete(orderId);
        toast.success(t('Deleted'));
      }
    });
  };

  return (
    <div className="animate-in">
      <div className="page-header">
        <h2>{t('Pre Order')}</h2>
        <div className="page-actions">
          <div className="flex gap-1">
            <button className={`btn btn-sm ${filterType === 'day'   ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilterType('day')}>{t('Day')}</button>
            <button className={`btn btn-sm ${filterType === 'week'  ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilterType('week')}>{t('Week')}</button>
            <button className={`btn btn-sm ${filterType === 'month' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilterType('month')}>{t('Month')}</button>
            <button className={`btn btn-sm ${filterType === 'all'   ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilterType('all')}>{t('All')}</button>
          </div>
          <div className="search-wrap">
            <Search size={16} className="search-icon" />
            <input className="input" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 140 }} />
          </div>
          <button
            className="btn btn-ghost"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', border: '1px solid rgba(255,255,255,.12)' }}
            onClick={() => setShowHistory(true)}
          >
            <ClipboardList size={16} />
            <span className="text-sm font-bold">{t('History')}</span>
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('Date')}</th>
              <th>{t('Status')}</th>
              <th>{t('Customer')}</th>
              <th>{t('Total')}</th>
              <th>{t('Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {preOrders?.map(order => (
              <tr key={order.id}>
                <td className="text-sm" style={{ cursor: 'pointer' }} onClick={() => setDetail(order)}>
                  {new Date(order.date).toLocaleDateString()}
                </td>
                <td style={{ cursor: 'pointer' }} onClick={() => setDetail(order)}>
                  <span className={`badge ${STATUS_BADGE[order.status] || 'badge-muted'}`}>
                    {order.status === 'confirmed' ? 'Deposit' : order.status === 'draft' ? 'Invoice' : order.status === 'returned' ? 'Returned' : 'Paid'}
                  </span>
                </td>
                <td style={{ cursor: 'pointer' }} onClick={() => setDetail(order)}>
                  <div className="flex items-center gap-2">
                    <div className="avatar" style={{ width: 24, height: 24 }}>
                      {order.customer?.photo ? <img src={order.customer.photo} alt="" /> : <span>👤</span>}
                    </div>
                    <span style={{ fontWeight: 600 }}>{order.customer?.name}</span>
                  </div>
                </td>
                <td style={{ fontWeight: 700, cursor: 'pointer' }} onClick={() => setDetail(order)}>
                  ${(order.finalTotal || order.total || 0).toFixed(2)}
                </td>
                <td>
                  <div className="flex gap-1">
                    <button className="btn btn-icon" style={{ color: '#25D366' }} onClick={() => handleWhatsAppReady(order)} title="Order Ready">
                      <MessageCircle size={15} />
                    </button>
                    <button className="btn btn-success btn-icon" onClick={() => handleCollect(order)} title="Collect">
                      <CheckCircle size={15} />
                    </button>
                    <button className="btn btn-warning btn-icon" onClick={() => handleExchange(order)} title="Edit">
                      <Edit3 size={15} />
                    </button>
                    <button className="btn btn-danger btn-icon" onClick={() => handleDelete(order.id)} title="Delete">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {preOrders?.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>{t('No pre-orders found')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Order Detail Modal */}
      {detail && (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <div className="modal animate-in" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Pre-Order #{detail.id} — {detail.customer?.name}</span>
              <button className="btn btn-ghost btn-icon" onClick={() => setDetail(null)}><X size={18} /></button>
            </div>

            <div className="modal-body">
              <div className="table-wrap mb-3">
                <table>
                  <thead><tr><th>Img</th><th>Code</th><th>Color</th><th>Qty</th></tr></thead>
                  <tbody>
                    {detail.items?.map((item, i) => {
                      const colorDef = colorsList?.find(c => c.name.toLowerCase() === item.color?.toLowerCase());
                      return (
                        <tr key={i}>
                          <td><ModelImage modelCode={item.modelCode} style={{ width: 32, height: 32, borderRadius: 4 }} /></td>
                          <td style={{ fontWeight: 700 }}>
                            {item.modelCode}
                            <div className="text-[10px] text-muted">Stock: <span style={{ color: stockInfo[`${item.modelCode}-${item.color}`] >= item.quantity ? 'var(--success)' : 'var(--danger)' }}>{stockInfo[`${item.modelCode}-${item.color}`]}</span></div>
                          </td>
                          <td><div className="flex items-center gap-1">{colorDef && <span className="color-dot" style={{ background: colorDef.hex, width: 8, height: 8 }} />}{item.color}</div></td>
                          <td>{item.quantity}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3" style={{ background: 'var(--s2)', borderRadius: 'var(--r-md)', border: '1px solid var(--white-05)' }}>
                  <div className="text-[10px] text-muted uppercase font-bold mb-1">Order Balance</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: detail.balance > 0 ? 'var(--danger)' : 'var(--success)' }}>${detail.balance.toFixed(2)}</div>
                </div>
                <div className="p-3" style={{ background: 'var(--s2)', borderRadius: 'var(--r-md)', border: '1px solid var(--gold-dim)' }}>
                  <div className="text-[10px] text-gold uppercase font-bold mb-1">Total Customer Debt</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--white)' }}>${customerDebt.toFixed(2)}</div>
                </div>
              </div>
            </div>
            <div className="modal-footer flex gap-2">
              <button className="btn btn-success flex-1" onClick={() => handleCollect(detail)}>{t('Collect')}</button>
              <button className="btn flex-1" style={{ background: '#25D366', color: '#fff' }} onClick={() => handleWhatsAppReady(detail)}>WhatsApp Ready</button>
            </div>
          </div>
        </div>
      )}

      {/* History Panel */}
      {showHistory && (
        <div className="modal-backdrop" onClick={() => setShowHistory(false)}>
          <div className="modal animate-in" style={{ maxWidth: 560, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ flexShrink: 0 }}>
              <div className="flex items-center gap-2">
                <ClipboardList size={20} style={{ color: 'var(--gold)' }} />
                <span className="modal-title">{t('Pre-Order History')}</span>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowHistory(false)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ overflowY: 'auto', flex: 1, padding: '0.5rem 1rem' }}>
              {!historyLogs?.length && (
                <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>
                  <ClipboardList size={36} style={{ margin: '0 auto 0.5rem' }} />
                  <p>{t('No history yet')}</p>
                </div>
              )}
              {historyLogs?.map(log => {
                const meta = ACTION_LABELS[log.action] || { label: log.action, emoji: '📋', color: 'var(--text)' };
                const ts = new Date(log.timestamp);
                const dateStr = ts.toLocaleDateString();
                const timeStr = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return (
                  <div key={log.id} style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.75rem 0', borderBottom: '1px solid rgba(255,255,255,.06)'
                  }}>
                    <div style={{
                      width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                      background: `${meta.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '1.1rem'
                    }}>{meta.emoji}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                        {log.customer?.name || '—'}
                        <span style={{ marginLeft: '0.4rem', fontSize: '0.75rem', opacity: 0.6 }}>#{log.orderId}</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                        ${(log.total || 0).toFixed(2)} • {dateStr} {timeStr}
                      </div>
                    </div>
                    <span style={{
                      padding: '2px 10px', borderRadius: 'var(--r-full)',
                      fontSize: '0.72rem', fontWeight: 700,
                      background: `${meta.color}22`, color: meta.color, flexShrink: 0
                    }}>{meta.label}</span>
                  </div>
                );
              })}
            </div>
            {historyLogs?.length > 0 && (
              <div className="modal-footer" style={{ flexShrink: 0, justifyContent: 'flex-end' }}>
                <button className="btn btn-danger btn-sm" onClick={() => setConfirmModal({
                  title: 'Clear History',
                  msg: 'Delete all pre-order history logs?',
                  action: async () => { await db.preOrderLogs.clear(); toast.success('History cleared'); }
                })}>Clear All</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Custom Confirm Modal */}
      {confirmModal && (
        <div className="modal-backdrop" style={{ zIndex: 10001 }}>
          <div className="modal animate-in" style={{ maxWidth: 350 }}>
            <div className="modal-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
              <div className="flex items-center gap-2" style={{ color: 'var(--gold)' }}>
                <AlertTriangle size={20} />
                <span className="modal-title" style={{ fontSize: '1.05rem' }}>{confirmModal.title}</span>
              </div>
            </div>
            <div className="modal-body" style={{ paddingTop: '0.5rem' }}>
              <p className="text-sm" style={{ opacity: 0.8, lineHeight: 1.6 }}>{confirmModal.msg}</p>
            </div>
            <div className="modal-footer" style={{ borderTop: 'none', gap: '0.75rem' }}>
              <button className="btn btn-ghost flex-1" onClick={() => setConfirmModal(null)}>{t('Cancel')}</button>
              <button className="btn btn-primary flex-1" onClick={() => { confirmModal.action(); setConfirmModal(null); }}>{t('Confirm')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
