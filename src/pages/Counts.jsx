import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify'; 
import { 
  Search, 
  TrendingUp, 
  DollarSign, 
  Package, 
  AlertCircle, 
  Send, 
  Calendar,
  Activity,
  Zap,
  Target,
  BarChart3,
  ArrowUpRight,
  Wallet,
  X,
  Trash2,
  Plus
} from 'lucide-react';
import { sendTelegramMessage, sendDailyKasaReport } from '../utils/telegram';
import { smartSearch } from '../utils/search';
import { Accounting } from '../utils/accounting';

export default function Counts() {
  const { t } = useTranslation();
  const [searchCode, setSearchCode] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filter, setFilter] = useState('all');
  const [showWallet, setShowWallet] = useState(false);
  const [walletLabel, setWalletLabel] = useState('');
  const [walletAmount, setWalletAmount] = useState('');
  const [walletCategory, setWalletCategory] = useState('rent');
  const [walletCurrency, setWalletCurrency] = useState('USD');
  const [walletType, setWalletType] = useState('expense');
  const [analysis, setAnalysis] = useState(null);

  const orders = useLiveQuery(() => db.orders.toArray());
  const customers = useLiveQuery(() => db.customers.toArray());
  const modelsTable = useLiveQuery(() => db.models.toArray());
  const allPayments = useLiveQuery(() => db.payments.toArray());
  const walletEntries = useLiveQuery(() => db.walletEntries.orderBy('date').reverse().toArray());

  React.useEffect(() => {
    const fetchAnalysis = async () => {
      const now = new Date();
      let start = '2000-01-01';
      let end = now.toISOString().split('T')[0];
      
      if (filter === 'today') {
        start = end;
      } else if (filter === 'week') {
        const d = new Date(); d.setDate(d.getDate() - 7);
        start = d.toISOString().split('T')[0];
      } else if (filter === 'month') {
        const d = new Date(); d.setDate(d.getDate() - 30);
        start = d.toISOString().split('T')[0];
      }
      
      const res = await Accounting.getProfitAnalysis(start, end);
      setAnalysis(res);
    };
    fetchAnalysis();
  }, [filter, walletEntries, orders]);

  const stats = useMemo(() => {
    if (!orders || !customers || !modelsTable || !allPayments) return null;

    const manualDebts = customers.reduce((sum, c) => sum + Number(c.accountBalance || 0), 0);
    const orderDebts = orders.filter(o => o.status !== 'draft' && o.status !== 'returned').reduce((sum, o) => sum + Number(o.balance || 0), 0);
    const totalDebts = manualDebts + orderDebts;

    const totalItems = orders.filter(o => o.status !== 'draft' && o.status !== 'returned').reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0), 0);

    const modelSales = {};
    orders.forEach(o => {
      o.items.forEach(i => {
        modelSales[i.modelCode] = (modelSales[i.modelCode] || 0) + i.quantity;
      });
    });
    const topModels = Object.entries(modelSales)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    return { totalDebts, totalItems, topModels, filter };
  }, [orders, customers, modelsTable, allPayments, filter]);

  const modelAnalysis = useMemo(() => {
    if (!orders || !searchCode || !modelsTable) return null;

    let filtered = orders.filter(o => o.status !== 'draft' && o.status !== 'returned');
    if (startDate) filtered = filtered.filter(o => o.date >= startDate);
    if (endDate) filtered = filtered.filter(o => o.date <= endDate);

    let unitsSold = 0;
    let revenue = 0;
    let cost = 0;

    filtered.forEach(o => {
      o.items.forEach(i => {
        if (i.modelCode === searchCode) {
          unitsSold += i.quantity;
          const price = i.wholesalePrice || i.retailPrice || 0;
          revenue += (price - (i.discount || 0)) * i.quantity;
          const m = modelsTable.find(mod => mod.code === searchCode);
          const costPrice = i.purchasePrice !== undefined ? i.purchasePrice : (m?.purchasePrice || 0);
          cost += costPrice * i.quantity;
        }
      });
    });

    const profit = revenue - cost;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

    return { unitsSold, revenue, cost, profit, margin };
  }, [orders, searchCode, startDate, endDate, modelsTable]);

  const handleSendReport = async () => {
    if (!stats) return;
    
    const expensesByCurrency = {};
    if (walletEntries) {
      walletEntries.forEach(e => {
        const c = e.currency || 'USD';
        expensesByCurrency[c] = (expensesByCurrency[c] || 0) + Number(e.amount || 0);
      });
    }
    
    let expensesText = '';
    const symbols = { USD: '$', EUR: '€', TRY: '₺', GBP: '£' };
    for (const [cur, amt] of Object.entries(expensesByCurrency)) {
      if (amt > 0) expensesText += `\n   • ${cur}: ${symbols[cur] || cur}${amt.toLocaleString()}`;
    }
    
    const usdExpenses = expensesByCurrency['USD'] || 0;

    const reportText = `👑 <b>PREMIUM BUSINESS INSIGHTS</b>\n` +
      `----------------------------------\n` +
      `💰 <b>Revenue:</b> $${analysis?.revenue.toLocaleString()}\n` +
      `📉 <b>Costs:</b> $${analysis?.cost.toLocaleString()}\n` +
      `🏪 <b>Shop Expenses:</b> $${analysis?.expenses.toLocaleString()}\n` +
      `💹 <b>NET PROFIT (USD):</b> $${analysis?.netProfit.toLocaleString()}\n` +
      `💸 <b>Pending Debts:</b> $${stats.totalDebts.toLocaleString()}\n` +
      `📦 <b>Units Sold:</b> ${stats.totalItems.toLocaleString()}\n` +
      `----------------------------------\n` +
      `📅 <i>Period: ${stats.filter.toUpperCase()}</i>`;

    const settings = await db.settings.get(1);
    await sendTelegramMessage(reportText, { forcedChatId: settings?.tgReportChatId });
  };

  const handleAddWalletEntry = async () => {
    const amt = parseFloat(walletAmount);
    if (!walletLabel.trim() || isNaN(amt) || amt <= 0) {
      toast.error('Enter a valid name and amount');
      return;
    }
    await db.walletEntries.add({
      label: walletLabel.trim(),
      category: walletCategory,
      currency: walletCurrency,
      amount: amt,
      type: walletType,
      date: new Date().toISOString(),
    });
    setWalletLabel('');
    setWalletAmount('');
    toast.success('Added!');
  };

  if (!stats) return <div className="p-12 text-center text-gold animate-pulse">Initializing Luxury Analytics...</div>;

  return (
    <div className="analytics-container animate-in">
      {/* --- GLOSSY HEADER --- */}
      <div className="luxury-header mb-12">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-1">
            <Target size={20} className="text-gold" />
            <h1 className="text-3xl font-black tracking-tight text-white uppercase">{t('Command Center')}</h1>
          </div>
        </div>
        
        <div className="filter-pill-container">
          {['all', 'today', 'week', 'month'].map(f => (
            <button 
              key={f} 
              className={`filter-pill ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {t(f.toUpperCase())}
            </button>
          ))}
          <button className="report-trigger" title="Send Full Report" onClick={handleSendReport}>
            <TrendingUp size={18} />
          </button>
          <button className="report-trigger" title="Send Kasa Report" onClick={() => sendDailyKasaReport().then(() => toast.success('Kasa Report Sent'))} style={{ background: 'var(--success-dim)', color: 'var(--success)' }}>
            <Send size={18} />
          </button>
          <button className="wallet-trigger" title="Wallet" onClick={() => setShowWallet(true)}>
            <Wallet size={18} />
          </button>
        </div>
      </div>

      {/* --- HERO PROFIT CARD --- */}
      <div className="hero-profit-card mb-12">
        <div className="hero-content">
          <div className="flex flex-col">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-gold-dim mb-2">Net Estimated Profit</span>
            <div className="text-6xl font-black text-white flex items-baseline gap-1">
              <span className="text-3xl text-gold-dim font-light">$</span>
              {analysis?.netProfit.toLocaleString() || '0'}
            </div>
          </div>
          <div className="hero-visual">
            <div className="glow-circle"></div>
            <TrendingUp size={80} className="hero-icon" />
          </div>
        </div>
        <div className="hero-footer">
          <div className="stat-mini">
            <ArrowUpRight size={14} className="text-success" />
            <span>Revenue: <b>${analysis?.revenue.toLocaleString() || '0'}</b></span>
          </div>
          <div className="stat-mini">
            <BarChart3 size={14} className="text-danger" />
            <span>Factory Costs: <b>${analysis?.cost.toLocaleString() || '0'}</b></span>
          </div>
        </div>
      </div>

      {/* --- SECONDARY METRICS --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
        <div className="glass-card flex items-center gap-4 p-6">
          <div className="icon-box bg-gold-dim">
            <Wallet size={24} className="text-gold" />
          </div>
          <div>
            <div className="text-muted text-xs uppercase font-bold tracking-widest mb-1">Outstanding Debts</div>
            <div className="text-2xl font-black text-white">${stats.totalDebts.toLocaleString()}</div>
          </div>
        </div>
        <div className="glass-card flex items-center gap-4 p-6">
          <div className="icon-box bg-success-dim">
            <Package size={24} className="text-success" />
          </div>
          <div>
            <div className="text-muted text-xs uppercase font-bold tracking-widest mb-1">Total Units Sold</div>
            <div className="text-2xl font-black text-white">{stats.totalItems.toLocaleString()} <span className="text-xs text-muted font-normal">items</span></div>
          </div>
        </div>
        <div className="glass-card flex items-center gap-4 p-6" style={{ gridColumn: '1 / -1', background: 'rgba(212,160,23,0.1)', borderColor: 'var(--gold)' }}>
          <div className="icon-box bg-gold-dim">
            <Activity size={24} className="text-gold" />
          </div>
          <div className="flex justify-between items-center w-full">
            <div>
              <div className="text-muted text-xs uppercase font-bold tracking-widest mb-1">SAKAL COUNTER</div>
              <div className="text-3xl font-black text-white">{stats.sakalCount.toLocaleString()}</div>
            </div>
            <div className="text-[10px] text-gold uppercase font-black opacity-50 tracking-tighter">Custom Logic Applied</div>
          </div>
        </div>
      </div>

      {/* --- PERFORMANCE ANALYZER HUB --- */}
      <div className="analyzer-hub">
        <div className="hub-header">
          <div className="flex items-center gap-3">
            <Zap size={20} className="text-gold" />
            <h2 className="text-xl font-bold text-white uppercase tracking-wider">Model Pulse Analyzer</h2>
          </div>
          <div className="hub-badge">Live Engine</div>
        </div>

        <div className="hub-body">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="input-field-group">
              <label>Target Model Code</label>
              <div className="input-icon-wrap">
                <Search size={18} />
                <input 
                  placeholder="e.g. 4400" 
                  value={searchCode}
                  onChange={e => setSearchCode(e.target.value.toUpperCase())}
                />
              </div>
            </div>
            <div className="input-field-group">
              <label>Analysis Start</label>
              <div className="input-icon-wrap">
                <Calendar size={18} />
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
            </div>
            <div className="input-field-group">
              <label>Analysis End</label>
              <div className="input-icon-wrap">
                <Calendar size={18} />
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
            </div>
          </div>

          {modelAnalysis && searchCode ? (
            <div className="analysis-results animate-in">
              <div className="result-main">
                <div className="res-card">
                  <div className="res-val text-success">{modelAnalysis.unitsSold}</div>
                  <div className="res-label">Pcs Sold</div>
                </div>
                <div className="res-card">
                  <div className="res-val">${Math.round(modelAnalysis.revenue).toLocaleString()}</div>
                  <div className="res-label">Revenue</div>
                </div>
                <div className="res-card highlight">
                  <div className="res-val text-gold">${Math.round(modelAnalysis.profit).toLocaleString()}</div>
                  <div className="res-label">Net Profit</div>
                </div>
              </div>
              <div className="progress-bar-wrap mt-6">
                <div className="flex justify-between text-xs text-muted mb-2">
                  <span>Margin Efficiency</span>
                  <span className="text-gold font-bold">{modelAnalysis.margin.toFixed(1)}%</span>
                </div>
                <div className="p-bar-bg">
                  <div className="p-bar-fill" style={{ width: `${Math.min(100, modelAnalysis.margin)}%` }}></div>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-hub">
              <Activity size={40} className="mb-4 opacity-20" />
              <p>Enter a model code to engage the analysis engine</p>
            </div>
          )}
        </div>
      </div>

      {/* ─── WALLET MODAL ─── */}
      {showWallet && (
        <div className="modal-backdrop" onClick={() => setShowWallet(false)}>
          <div className="modal animate-in" style={{ maxWidth: 520, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,.07)' }}>
              <div className="flex items-center gap-2" style={{ color: 'var(--gold)' }}>
                <Wallet size={20} />
                <span className="modal-title">Wallet — Shop Expenses</span>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowWallet(false)}><X size={18} /></button>
            </div>

            {/* ─── Add Form ─── */}
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,.07)', flexShrink: 0 }}>
              <div className="flex gap-2 flex-wrap">
                <select
                  className="input"
                  style={{ flex: '0 0 100px' }}
                  value={walletType}
                  onChange={e => setWalletType(e.target.value)}
                >
                  <option value="expense">📤 Expense</option>
                  <option value="income">📥 Income</option>
                  <option value="opening">🏁 Opening</option>
                </select>
                <select
                  className="input"
                  style={{ flex: '0 0 130px' }}
                  value={walletCategory}
                  onChange={e => setWalletCategory(e.target.value)}
                >
                  <option value="sales">💰 Sales</option>
                  <option value="rent">🏠 Rent</option>
                  <option value="electricity">💡 Electricity</option>
                  <option value="salary">👷 Salary</option>
                  <option value="other">📦 Other</option>
                </select>
                <input
                  className="input"
                  style={{ flex: 1, minWidth: 110 }}
                  placeholder="Description..."
                  value={walletLabel}
                  onChange={e => setWalletLabel(e.target.value)}
                />
                <select
                  className="input"
                  style={{ flex: '0 0 72px', fontWeight: 800, color: 'var(--gold)' }}
                  value={walletCurrency}
                  onChange={e => setWalletCurrency(e.target.value)}
                >
                  <option value="USD">$ USD</option>
                  <option value="EUR">€ EUR</option>
                  <option value="TRY">₺ TRY</option>
                  <option value="GBP">£ GBP</option>
                </select>
                <input
                  className="input"
                  style={{ flex: '0 0 100px' }}
                  type="number"
                  placeholder="Amount"
                  value={walletAmount}
                  onChange={e => setWalletAmount(e.target.value)}
                  min="0"
                />
                <button className="btn btn-primary" style={{ flexShrink: 0 }} onClick={handleAddWalletEntry}>
                  <Plus size={16} /> Add
                </button>
              </div>
            </div>

            {/* ─── Total Summary ─── */}
            {walletEntries?.length > 0 && (() => {
              const SYMBOLS = { USD: '$', EUR: '€', TRY: '₺', GBP: '£' };
              const totals = walletEntries.reduce((acc, e) => {
                const cur = e.currency || 'USD';
                acc[cur] = (acc[cur] || 0) + Number(e.amount || 0);
                return acc;
              }, {});
              return (
                <div style={{
                  padding: '0.65rem 1.25rem',
                  background: 'rgba(212,160,23,.08)',
                  borderBottom: '1px solid rgba(255,255,255,.05)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  flexShrink: 0, flexWrap: 'wrap', gap: '0.25rem'
                }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, opacity: 0.7 }}>TOTAL EXPENSES</span>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    {Object.entries(totals).map(([cur, val]) => (
                      <span key={cur} style={{ fontWeight: 900, fontSize: '1rem', color: 'var(--gold)' }}>
                        {SYMBOLS[cur] || cur}{val.toFixed(2)} <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>{cur}</span>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* ─── Entries List ─── */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '0.5rem 0.75rem' }}>
              {!walletEntries?.length && (
                <div style={{ textAlign: 'center', padding: '2.5rem', opacity: 0.4 }}>
                  <Wallet size={40} style={{ margin: '0 auto 0.75rem' }} />
                  <p style={{ fontWeight: 600 }}>No expenses recorded yet</p>
                </div>
              )}
              {walletEntries?.map(entry => {
                const catEmoji = {
                  rent: '🏠', electricity: '💡', water: '💧',
                  salary: '👷', transport: '🚛', other: '📦'
                }[entry.category] || '📦';
                const d = new Date(entry.date);
                const dateStr = d.toLocaleDateString();
                const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return (
                  <div key={entry.id} style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.65rem 0.5rem',
                    borderBottom: '1px solid rgba(255,255,255,.04)'
                  }}>
                    <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>{catEmoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.88rem', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {entry.label}
                      </div>
                      <div style={{ fontSize: '0.72rem', opacity: 0.5 }}>{dateStr} • {timeStr}</div>
                    </div>
                    <span style={{ fontWeight: 900, color: 'var(--danger)', flexShrink: 0, fontSize: '0.95rem' }}>
                      {({'USD':'$','EUR':'€','TRY':'₺','GBP':'£'})[entry.currency || 'USD'] || '$'}{Number(entry.amount).toFixed(2)}
                      {entry.currency && entry.currency !== 'USD' && <span style={{ fontSize: '0.7rem', opacity: 0.5, marginLeft: 2 }}>{entry.currency}</span>}
                    </span>
                    <button
                      className="btn btn-danger btn-icon btn-sm"
                      style={{ flexShrink: 0, opacity: 0.7 }}
                      onClick={() => db.walletEntries.delete(entry.id)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .analytics-container {
          padding: 1rem 0;
          color: white;
        }

        /* --- HEADER --- */
        .luxury-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 1.5rem;
        }

        .filter-pill-container {
          display: flex;
          background: rgba(255,255,255,0.03);
          padding: 0.4rem;
          border-radius: 1rem;
          border: 1px solid rgba(255,255,255,0.05);
          backdrop-filter: blur(10px);
        }

        .filter-pill {
          padding: 0.5rem 1.25rem;
          border-radius: 0.75rem;
          font-size: 0.75rem;
          font-weight: 800;
          text-transform: uppercase;
          color: rgba(255,255,255,0.4);
          transition: all 0.3s ease;
        }

        .filter-pill.active {
          background: var(--gold);
          color: black;
          box-shadow: 0 4px 15px rgba(212, 160, 23, 0.3);
        }

        .report-trigger {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255,255,255,0.05);
          border-radius: 0.75rem;
          margin-left: 0.5rem;
          color: var(--gold);
          transition: all 0.2s;
        }
        .report-trigger:hover { background: var(--gold); color: black; }

        .wallet-trigger {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(212,160,23,0.1);
          border-radius: 0.75rem;
          margin-left: 0.25rem;
          color: var(--gold);
          border: 1px solid rgba(212,160,23,0.25);
          transition: all 0.2s;
        }
        .wallet-trigger:hover { background: var(--gold); color: black; }

        /* --- HERO CARD --- */
        .hero-profit-card {
          background: linear-gradient(145deg, #1a1a1a 0%, #0d0d0d 100%);
          border: 1px solid rgba(212, 160, 23, 0.2);
          border-radius: 2rem;
          padding: 2.5rem;
          position: relative;
          overflow: hidden;
          box-shadow: 0 20px 50px rgba(0,0,0,0.5);
        }

        .hero-profit-card::before {
          content: '';
          position: absolute;
          top: -50%;
          right: -10%;
          width: 300px;
          height: 300px;
          background: radial-gradient(circle, rgba(212, 160, 23, 0.1) 0%, transparent 70%);
          pointer-events: none;
        }

        .hero-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
        }

        .hero-visual {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .glow-circle {
          position: absolute;
          width: 120px;
          height: 120px;
          background: var(--gold);
          filter: blur(60px);
          opacity: 0.15;
          animation: pulse 4s infinite;
        }

        .hero-icon { color: var(--gold); opacity: 0.8; }

        .hero-footer {
          display: flex;
          gap: 2rem;
          padding-top: 1.5rem;
          border-top: 1px solid rgba(255,255,255,0.05);
        }

        .stat-mini {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.85rem;
          color: rgba(255,255,255,0.6);
        }

        /* --- GLASS CARDS --- */
        .glass-card {
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.05);
          backdrop-filter: blur(10px);
          border-radius: 1.5rem;
          transition: all 0.3s ease;
        }
        .glass-card:hover {
          border-color: rgba(212, 160, 23, 0.3);
          background: rgba(255,255,255,0.04);
          transform: translateY(-5px);
        }

        .icon-box {
          width: 50px;
          height: 50px;
          border-radius: 1rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* --- ANALYZER HUB --- */
        .analyzer-hub {
          background: #111;
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 2rem;
          overflow: hidden;
        }

        .hub-header {
          padding: 1.5rem 2rem;
          background: rgba(255,255,255,0.02);
          border-bottom: 1px solid rgba(255,255,255,0.05);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .hub-badge {
          background: rgba(34, 197, 94, 0.1);
          color: #22c55e;
          font-size: 0.65rem;
          font-weight: 900;
          text-transform: uppercase;
          padding: 0.25rem 0.75rem;
          border-radius: 2rem;
          letter-spacing: 1px;
        }

        .hub-body { padding: 2rem; }

        .input-field-group label {
          display: block;
          font-size: 0.65rem;
          font-weight: 800;
          text-transform: uppercase;
          color: var(--gold);
          margin-bottom: 0.75rem;
          letter-spacing: 1px;
        }

        .input-icon-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-icon-wrap svg {
          position: absolute;
          left: 1rem;
          color: rgba(255,255,255,0.3);
        }

        .input-icon-wrap input {
          width: 100%;
          background: rgba(0,0,0,0.3);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 1rem;
          padding: 0.85rem 1rem 0.85rem 3rem;
          color: white;
          font-weight: 600;
          outline: none;
          transition: all 0.2s;
        }

        .input-icon-wrap input:focus {
          border-color: var(--gold);
          background: rgba(0,0,0,0.5);
        }

        /* --- RESULTS --- */
        .analysis-results {
          padding-top: 1rem;
        }

        .result-main {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1rem;
        }

        .res-card {
          background: rgba(255,255,255,0.03);
          padding: 1.5rem;
          border-radius: 1.5rem;
          text-align: center;
        }

        .res-card.highlight {
          background: linear-gradient(145deg, rgba(212, 160, 23, 0.15) 0%, transparent 100%);
          border: 1px solid rgba(212, 160, 23, 0.2);
        }

        .res-val { font-size: 1.75rem; font-weight: 900; margin-bottom: 0.25rem; }
        .res-label { font-size: 0.65rem; font-weight: 800; text-transform: uppercase; color: rgba(255,255,255,0.4); }

        .p-bar-bg { height: 8px; background: rgba(255,255,255,0.05); border-radius: 4px; overflow: hidden; }
        .p-bar-fill { height: 100%; background: var(--gold); border-radius: 4px; }

        .empty-hub {
          padding: 4rem;
          text-align: center;
          color: rgba(255,255,255,0.2);
          font-weight: 600;
          font-size: 0.9rem;
        }

        @keyframes pulse {
          0% { transform: scale(1); opacity: 0.15; }
          50% { transform: scale(1.2); opacity: 0.25; }
          100% { transform: scale(1); opacity: 0.15; }
        }

        .bg-gold-dim { background: rgba(212, 160, 23, 0.1); }
        .bg-success-dim { background: rgba(34, 197, 94, 0.1); }
      `}</style>
    </div>
  );
}
