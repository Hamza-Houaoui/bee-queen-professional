import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, User, ArrowRight, ClipboardList, Wallet, X } from 'lucide-react';
import { toast } from 'react-toastify';

export default function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [balanceModal, setBalanceModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [balAmount, setBalAmount] = useState('');
  const [balNote, setBalNote] = useState('');
  const [settleAmount, setSettleAmount] = useState('');

  const customers = useLiveQuery(async () => {
    const all = await db.customers.toArray();
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    const filtered = all.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.phone?.includes(q)
    );

    // Enrich with order balance sum
    const enriched = await Promise.all(filtered.map(async c => {
      const orders = await db.orders.where('customerId').equals(String(c.id)).toArray();
      const unpaidSum = orders.reduce((acc, o) => acc + (Number(o.balance) || 0), 0);
      return { ...c, orderBalanceSum: unpaidSum };
    }));

    return enriched;
  }, [search]);

  const overdueDebtors = useLiveQuery(async () => {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    const all = await db.customers.toArray();
    const overdue = [];
    
    for (const c of all) {
      if (Number(c.accountBalance || 0) > 0 && c.createdAt && new Date(c.createdAt) < oneWeekAgo) {
        overdue.push(c);
        continue;
      }
      const orders = await db.orders.where('customerId').equals(String(c.id)).toArray();
      const hasOldDebt = orders.some(o => Number(o.balance) > 0 && new Date(o.date) < oneWeekAgo);
      if (hasOldDebt) overdue.push(c);
    }
    
    return overdue;
  }, []);

  const handleAddBalance = async () => {
    if (!selectedCustomer || !balAmount) return;
    const currentBal = Number(selectedCustomer.accountBalance || 0);
    const newBal = currentBal + Number(balAmount);
    await db.customers.update(selectedCustomer.id, { 
      accountBalance: newBal,
      balanceNote: balNote || selectedCustomer.balanceNote
    });
    toast.success('Balance updated');
    setBalanceModal(false);
    setBalAmount('');
    setBalNote('');
  };

  const handleSettle = async (full = false) => {
    if (!selectedCustomer) return;
    const currentBal = Number(selectedCustomer.accountBalance || 0);
    const amountToSettle = full ? currentBal : Number(settleAmount);
    if (amountToSettle <= 0) return;
    
    const newBal = Math.max(0, currentBal - amountToSettle);
    await db.customers.update(selectedCustomer.id, { 
      accountBalance: newBal,
      balanceNote: newBal === 0 ? '' : selectedCustomer.balanceNote
    });
    toast.success(full ? 'Balance cleared' : 'Payment recorded');
    if (newBal === 0) setBalanceModal(false);
    setSettleAmount('');
  };

  return (
    <div className="animate-in" style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '80dvh', padding: '1rem'
    }}>
        <div style={{
          width: 120, height: 120, margin: '0 auto 2rem', background: 'var(--s2)',
          borderRadius: 'var(--r-xl)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', border: '1px solid var(--gold)'
        }}>
          <img src="/logo.png" alt="Bee Queen" style={{ width: '70%', height: 'auto', objectFit: 'contain' }} />
        </div>

      <div style={{ width: '100%', maxWidth: 500 }}>
        {overdueDebtors?.length > 0 && (
          <div style={{ marginBottom: '1.5rem', width: '100%' }}>
            <p className="text-xs text-danger mb-2" style={{ fontWeight: 800, textAlign: 'start' }}>⚠️ Overdue Debts (&gt; 1 week):</p>
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
        <div className="search-wrap" style={{ padding: '.5rem', background: 'var(--s2)', borderRadius: 'var(--r-lg)' }}>
          <Search size={22} className="search-icon" style={{ marginLeft: '.5rem' }} />
          <input
            className="input"
            style={{ fontSize: '1.1rem', height: 50, border: 'none', background: 'transparent' }}
            placeholder={t('Search by Name or Phone...')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        {search.trim().length > 0 && (
          <div style={{ marginTop: '1rem', background: 'var(--s2)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
            {customers?.length > 0 ? (
              customers.map(c => (
                <button
                  key={c.id}
                  className="btn btn-ghost w-full"
                  style={{ justifyContent: 'flex-start', padding: '1rem', borderBottom: '1px solid rgba(255,255,255,.05)', borderRadius: 0 }}
                  onClick={() => navigate(`/order?customerId=${c.id}`)}
                >
                  <div className="avatar" style={{ width: 40, height: 40 }}>
                    {c.photo ? <img src={c.photo} alt={c.name} /> : <User size={20} color="var(--muted)" />}
                  </div>
                  <div style={{ textAlign: 'start' }}>
                    <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{c.name}</div>
                    <div className="text-muted text-sm">{c.phone}</div>
                    {Number(c.accountBalance || 0) > 0 && (
                      <div style={{ color: 'var(--danger)', fontSize: '0.9rem', fontWeight: 700 }}>
                        {t('Account Debt')}: {Number(c.accountBalance).toFixed(2)} {c.balanceNote && `(${c.balanceNote})`}
                      </div>
                    )}
                    {Number(c.orderBalanceSum || 0) > 0 && (
                      <div style={{ color: 'var(--warning)', fontSize: '0.9rem', fontWeight: 700 }}>
                        {t('Order Balance')}: {Number(c.orderBalanceSum).toFixed(2)}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2" style={{ marginLeft: 'auto' }}>
                    <button 
                      className="btn btn-ghost btn-icon" 
                      onClick={(e) => { e.stopPropagation(); setSelectedCustomer(c); setBalanceModal(true); }}
                      title={t('Manage Balance')}
                    >
                      <Wallet size={20} color="var(--gold)" />
                    </button>
                    <button 
                      className="btn btn-ghost btn-icon" 
                      onClick={(e) => { e.stopPropagation(); navigate(`/history?customerId=${c.id}`); }}
                      title={t('Order History')}
                    >
                      <ClipboardList size={20} color="var(--gold)" />
                    </button>
                    <ArrowRight size={18} style={{ color: 'var(--gold)' }} />
                  </div>
                </button>
              ))
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center' }}>
                <p className="text-muted mb-3">{t('Customer not found')}</p>
                <button
                  className="btn btn-primary"
                  onClick={() => navigate(`/customers?new=${encodeURIComponent(search)}&redirect=order`)}
                >
                  <Plus size={18} /> {t('Add as New Customer')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {balanceModal && selectedCustomer && (
        <div className="modal-backdrop">
          <div className="modal-content animate-in" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Wallet size={20} color="var(--gold)" /> {selectedCustomer.name}
              </h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setBalanceModal(false)}><X size={20}/></button>
            </div>
            
            <div style={{ padding: '1.5rem' }}>
              <div style={{ background: 'var(--danger-dim)', padding: '1rem', borderRadius: 'var(--r-md)', marginBottom: '1.5rem', textAlign: 'center' }}>
                <div className="text-muted text-sm">{t('Current Debt')}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--danger)' }}>
                  {Number(selectedCustomer.accountBalance || 0).toFixed(2)}
                </div>
                {selectedCustomer.balanceNote && <div className="text-sm mt-1">{t('Notes')}: {selectedCustomer.balanceNote}</div>}
              </div>

              <div className="mb-4">
                <label className="form-label">{t('Add New Loan')}</label>
                <div className="flex gap-2 mb-2">
                  <input 
                    type="number" className="input" placeholder={t('Amount')} 
                    value={balAmount} onChange={e => setBalAmount(e.target.value)} 
                  />
                  <button className="btn btn-primary" onClick={handleAddBalance}><Plus size={18}/></button>
                </div>
                <input 
                  className="input" placeholder={t('Loan Note')} 
                  value={balNote} onChange={e => setBalNote(e.target.value)} 
                />
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.05)', margin: '1.5rem 0' }} />

              <div>
                <label className="form-label">{t('Settle Balance')}</label>
                <div className="flex gap-2">
                  <input 
                    type="number" className="input" placeholder={t('Amount')} 
                    value={settleAmount} onChange={e => setSettleAmount(e.target.value)} 
                  />
                  <button className="btn btn-success" onClick={() => handleSettle(false)}>{t('Pay')}</button>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => handleSettle(true)}>{t('Pay All')}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
