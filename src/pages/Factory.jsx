import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useTranslation } from 'react-i18next';
import { 
  Warehouse, 
  Plus, 
  TrendingDown, 
  DollarSign, 
  History, 
  Trash2, 
  ChevronRight, 
  Calendar,
  Layers,
  ArrowDownLeft,
  X,
  Search,
  Package,
  Receipt,
  RotateCcw
} from 'lucide-react';
import { toast } from 'react-toastify';

export default function Factory() {
  const { t } = useTranslation();
  const [activeFactory, setActiveFactory] = useState(null);
  const [activeTab, setActiveTab] = useState('ledger'); // unified ledger
  const [modal, setModal] = useState(null); // 'payment', 'return', 'receipt'
  const [selectedSupply, setSelectedSupply] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Return Form State
  const [retModel, setRetModel] = useState('');
  const [retColor, setRetColor] = useState('');
  const [retQty, setRetQty] = useState('');
  const [retAmount, setRetAmount] = useState('');

  const factories = useLiveQuery(() => db.factories.toArray()) || [];
  const supplies = useLiveQuery(() => db.factorySupplies.toArray()) || [];
  const items = useLiveQuery(() => db.factoryItems.toArray()) || [];
  const payments = useLiveQuery(() => db.factoryPayments.toArray()) || [];
  const returns = useLiveQuery(() => db.factoryReturns.toArray()) || [];
  const colorsDef = useLiveQuery(() => db.colors.toArray()) || [];
  const stock = useLiveQuery(() => db.stock.toArray()) || [];
  const models = useLiveQuery(() => db.models.toArray()) || [];
  const orders = useLiveQuery(() => db.orders.toArray()) || [];

  // Auto-select first factory if none selected
  React.useEffect(() => {
    if (!activeFactory && factories.length > 0) {
      setActiveFactory(factories[0]);
    }
  }, [factories, activeFactory]);

  // Return Form Logic (Smarter Search)
  const [retPreview, setRetPreview] = useState(null);
  const [retStock, setRetStock] = useState([]);
  
  React.useEffect(() => {
    if (!retModel.trim()) { setRetPreview(null); setRetStock([]); setRetAmount(''); return; }
    const timer = setTimeout(async () => {
      const m = await db.models.get(retModel.toUpperCase());
      setRetPreview(m || null);
      if (m) {
        const s = await db.stock.where({ modelCode: m.code }).toArray();
        setRetStock(s);
        if (retQty) setRetAmount(Number(retQty) * (m.purchasePrice || 0));
      } else {
        setRetStock([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [retModel, retQty]);

  // Financial Ledger Logic
  const ledger = useMemo(() => {
    if (!activeFactory) return [];
    
    const fSupplies = supplies.filter(s => s.factoryId === activeFactory.id);
    const fPayments = payments.filter(p => p.factoryId === activeFactory.id);
    const fReturns = returns.filter(r => r.factoryId === activeFactory.id);

    // Combine all transactions
    let all = [
      ...fSupplies.map(s => {
        const val = items.filter(i => i.supplyId === s.id).reduce((sum, i) => sum + (i.priceAtTime * i.quantity), 0);
        return { type: 'supply', id: s.id, no: s.supplyNo, date: s.date, value: val, paid: 0, obj: s };
      }),
      ...fPayments.map(p => ({ type: 'payment', id: p.id, no: p.paymentNo || 'PAY', date: p.date, value: 0, paid: p.amount, obj: p })),
      ...fReturns.map(r => ({ type: 'return', id: r.id, no: 'RET', date: r.date, value: -r.amountCredited, paid: 0, obj: r }))
    ];

    // Add Initial Debt if exists
    if (activeFactory.initialDebt > 0) {
      all.push({ type: 'initial', id: 'init', no: 'START', date: '2000-01-01', value: activeFactory.initialDebt, paid: 0, obj: {} });
    }

    // Sort by date ASC to calculate running debt
    all.sort((a, b) => new Date(a.date) - new Date(b.date));

    let runningDebt = 0;
    const history = all.map(tx => {
      runningDebt += tx.value;
      runningDebt -= tx.paid;
      return { ...tx, debtAfter: runningDebt };
    });

    // Return reversed for display (newest first)
    return history.reverse();
  }, [activeFactory, supplies, items, payments, returns]);

  const filteredLedger = useMemo(() => {
    if (!searchQuery) return ledger;
    const q = searchQuery.toLowerCase();
    return ledger.filter(tx => tx.no?.toLowerCase().includes(q));
  }, [ledger, searchQuery]);

  const stats = useMemo(() => {
    if (!activeFactory) return { debt: 0, paid: 0, returns: 0, supplyValue: 0, totalSales: 0 };
    const latest = ledger[0]; // because it's reversed
    const totalPaid = payments.filter(p => p.factoryId === activeFactory.id).reduce((s, p) => s + Number(p.amount), 0);
    const totalReturns = returns.filter(r => r.factoryId === activeFactory.id).reduce((s, r) => s + Number(r.amountCredited), 0);
    const totalSupply = ledger.filter(tx => tx.type === 'supply').reduce((s, tx) => s + tx.value, 0);

    // Calculate Total Sales for this factory
    const fModels = models.filter(m => m.factoryId === activeFactory.id);
    const fCodes = new Set(fModels.map(m => m.code));
    
    let totalSales = 0;
    orders.forEach(order => {
      if (order.status === 'confirmed' || order.status === 'paid') {
        const factoryItems = (order.items || []).filter(item => fCodes.has(item.modelCode));
        factoryItems.forEach(item => {
          const m = fModels.find(mod => mod.code === item.modelCode);
          const costPrice = m?.purchasePrice || 0;
          totalSales += costPrice * Number(item.quantity);
        });
      }
    });

    return { 
      debt: latest?.debtAfter || 0, 
      paid: totalPaid, 
      returns: totalReturns, 
      supplyValue: totalSupply,
      totalSales
    };
  }, [activeFactory, ledger, payments, returns, orders, models]);

  const factoryInventory = useMemo(() => {
    if (!activeFactory || !models || !stock) return [];
    const fModels = models.filter(m => m.factoryId === activeFactory.id);
    const fCodes = new Set(fModels.map(m => m.code));
    
    const fStock = stock.filter(s => fCodes.has(s.modelCode));
    const groups = {};
    fStock.forEach(s => {
      if (!groups[s.modelCode]) {
        const m = fModels.find(mod => mod.code === s.modelCode);
        groups[s.modelCode] = {
          code: s.modelCode,
          qty: 0,
          value: 0,
          purchasePrice: m?.purchasePrice || 0,
          items: []
        };
      }
      groups[s.modelCode].qty += (s.quantity || 0);
      groups[s.modelCode].value += (s.quantity || 0) * groups[s.modelCode].purchasePrice;
      groups[s.modelCode].items.push(s);
    });
    return Object.values(groups).sort((a,b) => b.qty - a.qty);
  }, [activeFactory, models, stock]);

  // Forms
  const [paymentNo, setPaymentNo] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const handleAddPayment = async (e) => {
    e.preventDefault();
    await db.factoryPayments.add({
      factoryId: activeFactory.id,
      paymentNo,
      amount: Number(amount),
      date: new Date().toISOString(),
      note
    });
    toast.success('Payment recorded');
    setModal(null);
    setPaymentNo(''); setAmount(''); setNote('');
  };

  const handleAddReturn = async (e) => {
    e.preventDefault();
    await db.factoryReturns.add({
      factoryId: activeFactory.id,
      modelCode: retModel,
      color: retColor,
      quantity: Number(retQty),
      amountCredited: Number(retAmount),
      date: new Date().toISOString()
    });

    // Deduct stock
    const existing = await db.stock.where({ modelCode: retModel, color: retColor }).first();
    if (existing) {
      await db.stock.update(existing.id, { quantity: Math.max(0, existing.quantity - Number(retQty)) });
    }

    toast.success('Return recorded & stock adjusted');
    setModal(null);
    setRetModel(''); setRetColor(''); setRetQty(''); setRetAmount('');
  };

  return (
    <div className="animate-in pb-10">
      <div className="page-header mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Factory Manager</h2>
        </div>
        <div className="flex gap-2">
           <div className="search-wrap" style={{ width: 200 }}>
            <Search size={16} className="search-icon" />
            <input className="input" placeholder="Search Supply #" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Factory Selection */}
      <div className="flex gap-4 overflow-x-auto pb-4 mb-6 scroll-hide">
        {factories.map(f => (
          <button 
            key={f.id}
            className={`card min-w-[160px] p-4 flex flex-col items-center gap-2 transition-all ${activeFactory?.id === f.id ? 'border-gold bg-s2 shadow-lg scale-105' : 'hover:bg-s2/50 opacity-70 border border-white-05'}`}
            onClick={() => setActiveFactory(f)}
          >
            <div className={`p-2 rounded-full ${activeFactory?.id === f.id ? 'bg-gold text-s1' : 'bg-s3 text-muted'}`}>
              <Warehouse size={20} />
            </div>
            <span className={`font-bold text-sm ${activeFactory?.id === f.id ? 'text-gold' : 'text-white'}`}>{f.name}</span>
          </button>
        ))}
        {factories.length === 0 && (
          <div className="text-muted text-sm italic p-4">Add suppliers in Settings to begin</div>
        )}
      </div>

      {activeFactory && (
        <div className="animate-in">
          {/* Summary Dashboard */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="hero-profit-card md:col-span-1" style={{ padding: '2rem', borderRadius: '1.5rem', background: 'linear-gradient(135deg, var(--s2) 0%, rgba(212,160,23,0.15) 100%)', border: '1px solid var(--gold-dim)', textAlign: 'center' }}>
              <div className="text-xs font-black uppercase tracking-[0.2em] text-gold mb-2">Total Debt Owed / إجمالي الدين</div>
              <div className="text-6xl font-black text-white" style={{ color: '#FFD700', textShadow: '0 0 20px rgba(255,215,0,0.3)' }}>
                ${stats.debt.toLocaleString()}
              </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-2 gap-4 md:col-span-2">
              <div className="card p-5 flex items-center gap-4 bg-s2 border-white-05">
                <div className="icon-box bg-gold-dim"><TrendingDown size={20} className="text-gold" /></div>
                <div>
                  <div className="text-muted text-[10px] uppercase font-bold">Total Sales / مبيعات المعمل</div>
                  <div className="text-xl font-black text-success">${stats.totalSales.toLocaleString()}</div>
                </div>
              </div>
              <div className="card p-5 flex items-center gap-4 bg-s2 border-white-05">
                <div className="icon-box bg-gold-dim"><Package size={20} className="text-gold" /></div>
                <div>
                  <div className="text-muted text-[10px] uppercase font-bold">Total Purchases</div>
                  <div className="text-lg font-bold text-white">${stats.supplyValue.toLocaleString()}</div>
                </div>
              </div>
              <div className="card p-5 flex items-center gap-4 bg-s2 border-white-05">
                <div className="icon-box bg-success-dim"><ArrowDownLeft size={20} className="text-success" /></div>
                <div>
                  <div className="text-muted text-[10px] uppercase font-bold">Total Paid</div>
                  <div className="text-lg font-bold text-white">${stats.paid.toLocaleString()}</div>
                </div>
              </div>
              <div className="card p-5 flex items-center gap-4 bg-s2 border-white-05">
                <div className="icon-box bg-gold-dim"><DollarSign size={20} className="text-gold" /></div>
                <div>
                  <div className="text-muted text-[10px] uppercase font-bold">Initial Debt</div>
                  <div className="text-lg font-bold text-white">${(activeFactory.initialDebt || 0).toLocaleString()}</div>
                </div>
              </div>
              <div className="card p-5 flex items-center gap-4 bg-s2 border-white-05">
                <div className="icon-box bg-danger-dim"><RotateCcw size={20} className="text-danger" /></div>
                <div>
                  <div className="text-muted text-[10px] uppercase font-bold">Returns</div>
                  <div className="text-lg font-bold text-white">${stats.returns.toLocaleString()}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center mb-4">
              <div className="flex gap-2">
                <button 
                  className={`btn btn-sm ${activeTab === 'ledger' ? 'btn-primary' : 'btn-ghost'}`} 
                  onClick={() => setActiveTab('ledger')}
                  style={{ borderRadius: 'var(--r-md)', padding: '0.5rem 1.25rem' }}
                >
                  <History size={14} /> Account Ledger
                </button>
                <button 
                  className={`btn btn-sm ${activeTab === 'inventory' ? 'btn-primary' : 'btn-ghost'}`} 
                  onClick={() => setActiveTab('inventory')}
                  style={{ borderRadius: 'var(--r-md)', padding: '0.5rem 1.25rem' }}
                >
                  <Package size={14} /> Factory Stock
                </button>
              </div>
              <div className="flex gap-2">
                <button className="btn btn-sm btn-danger px-4" onClick={() => setModal('return')}>
                  <RotateCcw size={14} /> Return Goods
                </button>
                <button className="btn btn-sm btn-primary px-4" onClick={() => setModal('payment')}>
                  <DollarSign size={14} /> Add Payment
                </button>
              </div>
          </div>

          {activeTab === 'ledger' ? (
            <div className="card overflow-hidden animate-in">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-muted text-[10px] uppercase bg-s1 border-b border-white-05">
                      <th className="p-4">No.</th>
                      <th className="p-4">Date</th>
                      <th className="p-4">Supply Value (+)</th>
                      <th className="p-4">Paid Today (-)</th>
                      <th className="p-4 text-right">Resulting Debt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white-05">
                    {filteredLedger.map((tx, idx) => (
                      <tr 
                        key={`${tx.type}-${tx.id}`} 
                        className={`hover:bg-white-05 cursor-pointer transition-colors ${tx.type === 'payment' ? 'bg-success-dim/5' : tx.type === 'return' ? 'bg-danger-dim/5' : ''}`}
                        onClick={() => {
                          if (tx.type === 'supply') {
                            setSelectedSupply(tx.obj);
                            setModal('receipt');
                          }
                        }}
                      >
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${tx.type === 'supply' ? 'bg-gold text-s1' : tx.type === 'payment' ? 'bg-success text-white' : tx.type === 'initial' ? 'bg-blue-500 text-white' : 'bg-danger text-white'}`}>
                              {tx.type === 'supply' ? 'SUP' : tx.type === 'payment' ? 'PAY' : tx.type === 'initial' ? 'INIT' : 'RET'}
                            </span>
                            <span className="font-bold text-white">{tx.type === 'initial' ? 'Opening Balance' : tx.no}</span>
                          </div>
                        </td>
                        <td className="p-4 text-xs text-muted font-medium">{new Date(tx.date).toLocaleDateString()}</td>
                        <td className="p-4 font-bold text-white">
                          {tx.value !== 0 ? `$${Math.abs(tx.value).toLocaleString()}` : '—'}
                        </td>
                        <td className="p-4 font-bold text-success">
                          {tx.paid !== 0 ? `$${tx.paid.toLocaleString()}` : '—'}
                        </td>
                        <td className="p-4 text-right font-black text-white bg-white-05">
                          ${tx.debtAfter.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredLedger.length === 0 && (
                  <div className="p-12 text-center text-muted opacity-30">
                    <Package size={48} className="mx-auto mb-3" />
                    <p>No transactions found for this manufacturer</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="card overflow-hidden animate-in">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-muted text-[10px] uppercase bg-s1 border-b border-white-05">
                      <th className="p-4">Model Code</th>
                      <th className="p-4 text-center">Current Qty</th>
                      <th className="p-4 text-right">Purchase Price</th>
                      <th className="p-4 text-right">Total Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white-05">
                    {factoryInventory.map(item => (
                      <tr key={item.code} className="hover:bg-white-05 transition-colors">
                        <td className="p-4">
                          <div className="font-black text-gold text-lg tracking-tighter">{item.code}</div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {item.items.map(color => (
                              <span key={color.id} className="badge badge-muted" style={{ fontSize: '9px', padding: '2px 6px' }}>
                                {color.color}: {color.quantity}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="p-4 text-center font-bold text-white text-xl">
                          {item.qty}
                        </td>
                        <td className="p-4 text-right font-medium text-muted">
                          ${item.purchasePrice.toLocaleString()}
                        </td>
                        <td className="p-4 text-right font-black text-white bg-white-05">
                          ${item.value.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {factoryInventory.length > 0 && (
                    <tfoot>
                      <tr className="bg-s3/50 border-t border-white-10">
                        <td className="p-4 font-black text-gold uppercase tracking-widest text-xs">Total Factory Inventory</td>
                        <td className="p-4 text-center font-black text-white text-xl">
                          {factoryInventory.reduce((s,i) => s + i.qty, 0)}
                        </td>
                        <td></td>
                        <td className="p-4 text-right font-black text-2xl text-gold">
                          ${factoryInventory.reduce((s,i) => s + i.value, 0).toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
                {factoryInventory.length === 0 && (
                  <div className="p-12 text-center text-muted opacity-30">
                    <Package size={48} className="mx-auto mb-3" />
                    <p>No stock currently in warehouse for this factory</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Return Modal */}
      {modal === 'return' && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: 450 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title text-danger">Return Unsold Goods</span>
              <button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}><X size={18} /></button>
            </div>
            <form onSubmit={handleAddReturn}>
              <div className="modal-body space-y-4">
                <div className="form-group">
                  <label className="form-label">Model Code</label>
                  <input className="input" value={retModel} onChange={e => setRetModel(e.target.value.toUpperCase())} required autoFocus />
                </div>

                {retPreview && (
                  <div className="flex gap-3 p-3 bg-s2 rounded-xl border border-white-05 animate-in">
                    <img src={retPreview.coverImage} className="w-16 h-20 object-cover rounded-lg" alt="" />
                    <div>
                      <div className="text-gold font-bold">{retPreview.code}</div>
                      <div className="text-xs text-muted">WS: ${retPreview.wholesalePrice} · Size: {retPreview.size}</div>
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Select Color from Stock</label>
                  <div className="flex flex-wrap gap-2">
                    {retStock.map(s => {
                      const cDef = colorsDef.find(c => c.name.toLowerCase() === s.color.toLowerCase());
                      return (
                        <button 
                          key={s.id} 
                          type="button"
                          className={`btn btn-sm ${retColor === s.color ? 'btn-primary' : 'btn-ghost'}`}
                          style={{ border: '1px solid rgba(255,255,255,0.05)' }}
                          onClick={() => {
                            setRetColor(s.color);
                            setRetQty(s.quantity);
                          }}
                        >
                          {cDef && <span className="color-dot mr-2" style={{ background: cDef.hex, width: 10, height: 10 }} />}
                          {s.color} ({s.quantity})
                        </button>
                      );
                    })}
                    {retStock.length === 0 && retModel && <div className="text-xs text-danger">No stock found for this model</div>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="form-group">
                    <label className="form-label">Quantity to Return</label>
                    <input type="number" className="input" value={retQty} onChange={e => setRetQty(e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Credit Value ($)</label>
                    <input type="number" step="0.01" className="input text-gold font-bold" value={retAmount} onChange={e => setRetAmount(e.target.value)} required placeholder="Value to deduct" />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="submit" className="btn btn-danger w-full font-bold">Confirm & Deduct Stock</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {modal === 'payment' && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Record Factory Payment</span>
              <button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}><X size={18} /></button>
            </div>
            <form onSubmit={handleAddPayment}>
              <div className="modal-body space-y-4">
                <div className="form-group">
                  <label className="form-label">Payment / Receipt No</label>
                  <input className="input" value={paymentNo} onChange={e => setPaymentNo(e.target.value)} required placeholder="e.g. REC-502" />
                </div>
                <div className="form-group">
                  <label className="form-label">Amount Paid ($)</label>
                  <input type="number" step="0.01" className="input text-2xl font-black" value={amount} onChange={e => setAmount(e.target.value)} required placeholder="0.00" />
                </div>
                <div className="form-group">
                  <label className="form-label">Note</label>
                  <textarea className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="Notes..." />
                </div>
              </div>
              <div className="modal-footer">
                <button type="submit" className="btn btn-primary w-full text-s1 font-bold">Save Transaction</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {modal === 'receipt' && selectedSupply && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header bg-s3">
              <div className="flex items-center gap-3">
                <Receipt size={20} className="text-gold" />
                <div>
                  <div className="font-bold text-white">Supply Receipt #{selectedSupply.supplyNo}</div>
                  <div className="text-[10px] text-muted">{new Date(selectedSupply.date).toLocaleString()}</div>
                </div>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="table-wrap mb-0">
                <table className="w-full">
                  <thead>
                    <tr className="text-[10px] uppercase text-muted">
                      <th className="p-3 text-left">Model</th>
                      <th className="p-3 text-center">Qty</th>
                      <th className="p-3 text-right">Cost</th>
                      <th className="p-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white-05">
                    {items.filter(i => i.supplyId === selectedSupply.id).map(i => (
                      <tr key={i.id}>
                        <td className="p-3">
                          <div className="font-bold text-white">{i.modelCode}</div>
                          <div className="text-[10px] text-muted">{i.color}</div>
                        </td>
                        <td className="p-3 text-center font-bold">{i.quantity}</td>
                        <td className="p-3 text-right text-xs text-muted">${(i.priceAtTime || 0).toLocaleString()}</td>
                        <td className="p-3 text-right font-bold text-white">${(i.quantity * (i.priceAtTime || 0)).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-white-05">
                      <td colSpan={3} className="p-3 font-bold text-gold">GRAND TOTAL</td>
                      <td className="p-3 text-right font-black text-xl text-white">
                        ${items.filter(i => i.supplyId === selectedSupply.id).reduce((s, i) => s + (i.quantity * (i.priceAtTime || 0)), 0).toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .icon-box {
          width: 44px;
          height: 44px;
          border-radius: 0.75rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .bg-success-dim { background: rgba(34, 197, 94, 0.1); }
        .bg-danger-dim { background: rgba(239, 68, 68, 0.1); }
        .scroll-hide::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
