import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, generateId } from '../db';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { generateInvoicePDF } from '../utils/pdf';
import { useNavigate, useLocation } from 'react-router-dom';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { sendTelegramMessage } from '../utils/telegram';
import { Search, Plus, Trash2, FileText, CheckCircle, Package, MessageCircle, Share2, X, Send, Edit2, AlertCircle } from 'lucide-react';
import { Share } from '@capacitor/share';
import { Clipboard } from '@capacitor/clipboard';
import { Capacitor } from '@capacitor/core';
import { SyncEngine } from '../SyncEngine';
import ModelImage from '../components/ModelImage';

export default function NewOrder() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [deposit, setDeposit] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [videoPreview, setVideoPreview] = useState(null);
  const [outOfStockModal, setOutOfStockModal] = useState(false);
  const [pendingItem, setPendingItem] = useState(null);
  const [showInvoiceChoice, setShowInvoiceChoice] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editQty, setEditQty] = useState(0);
  const [editColor, setEditColor] = useState('');
  const [editDiscount, setEditDiscount] = useState(0);
  const [editSize, setEditSize] = useState('');
  const [editStock, setEditStock] = useState([]);
  const [isSparis, setIsSparis] = useState(false);
  
  // Add-item fields
  const [code, setCode] = useState('');
  const [colorSearch, setColorSearch] = useState('');
  const [color, setColor] = useState('');
  const [qty, setQty] = useState(4);
  const [manualSize, setManualSize] = useState('');
  const [discount, setDiscount] = useState(0); // Item discount
  const [orderDiscount, setOrderDiscount] = useState(0); // Total order discount
  const [codePreview, setCodePreview] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const codeTimer = useRef(null);

  const settings   = useLiveQuery(() => db.settings.get(1));
  const customers  = useLiveQuery(() => db.customers.toArray());
  const colorsList = useLiveQuery(() => db.colors.toArray());
  const cartItems  = useLiveQuery(async () => {
    const items = await db.cart.toArray();
    return Promise.all(items.map(async i => ({ ...i, model: await db.models.get(i.modelCode) })));
  });

  const stockPreview = useLiveQuery(() => 
    codePreview ? db.stock.where('modelCode').equals(codePreview.code).toArray() : []
  , [codePreview]);

  // Handle URL params
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.has('customerId')) setCustomerId(params.get('customerId'));
    if (params.has('note')) setNote(params.get('note'));
  }, [location.search]);

  useEffect(() => {
    if (editingItem) {
      setEditQty(editingItem.quantity);
      setEditColor(editingItem.color);
      setEditDiscount(editingItem.discount || 0);
      setEditSize(editingItem.size || '');
      db.stock.where('modelCode').equals(editingItem.modelCode).toArray().then(setEditStock);
    }
  }, [editingItem]);

  // Instant model preview
  useEffect(() => {
    clearTimeout(codeTimer.current);
    if (!code.trim()) { 
      setCodePreview(null); 
      setSuggestions([]);
      return; 
    }
    codeTimer.current = setTimeout(async () => {
      const q = code.trim().toUpperCase();
      const m = await db.models.get(q);
      setCodePreview(m || null);
      
      // Also get suggestions
      const allModels = await db.models.toArray();
      const filtered = allModels
        .filter(mod => mod.code.includes(q) && mod.code !== q)
        .slice(0, 5);
      setSuggestions(filtered);
    }, 250);
  }, [code]);

  const totalQty   = cartItems?.reduce((s, i) => s + Number(i.quantity), 0) ?? 0;
  const isWholesale = totalQty >= 4;

  const lineTotal = item => {
    const base = isWholesale ? (item.model?.wholesalePrice ?? 0) : (item.model?.retailPrice ?? 0);
    const eff  = Math.max(0, Number(base) - Number(item.discount || 0));
    return eff * Number(item.quantity);
  };

  const subtotal   = cartItems?.reduce((s, i) => s + lineTotal(i), 0) ?? 0;
  const finalTotal = Math.max(0, subtotal - Number(orderDiscount || 0));
  const depositVal = (deposit === '' || deposit === null) ? finalTotal : Math.min(Math.max(0, Number(deposit) || 0), finalTotal);
  const balance    = finalTotal - depositVal;

  const selectedCustomer = customers?.find(c => c.id === Number(customerId));
  const filteredCustomers = customerSearch.length >= 1
    ? customers?.filter(c =>
        c.name?.toLowerCase().includes(customerSearch.toLowerCase()) ||
        c.phone?.includes(customerSearch)) ?? []
    : [];

  const getMappedSize = (model, quantity) => {
    if (quantity < 4) return manualSize.trim();
    return model?.size || '';
  };

  const handleAdd = async () => {
    const codeVal = code.trim().toUpperCase();
    const finalColor = color || (colorSearch ? colorsList?.filter(c => c.name.toLowerCase().startsWith(colorSearch.toLowerCase()))[0]?.name : '');

    if (!codeVal || !finalColor || qty < 1) { toast.error('Enter code, color & qty'); return; }
    if (qty < 4 && !manualSize.trim()) { toast.error('Enter size manually for qty < 4'); return; }
    
    const model = await db.models.get(codeVal);
    if (!model) { toast.error('Model not found'); return; }
    
    const stockEntry = await db.stock.where({ modelCode: codeVal, color: finalColor }).first();
    const available = stockEntry ? stockEntry.quantity : 0;
    
    if (available < qty) {
      setPendingItem({ codeVal, finalColor, qty, discount, model, available });
      setOutOfStockModal(true);
      return;
    }
    
    await commitAddToCart(codeVal, finalColor, qty, discount, model);
  };

  const commitAddToCart = async (codeVal, finalColor, q, d, model, isBackorder = false) => {
    const finalSize = getMappedSize(model, q);
    const existing = await db.cart.where({ modelCode: codeVal, color: finalColor }).first();
    
    if (existing) {
      await db.cart.update(existing.id, { 
        quantity: existing.quantity + Number(q), 
        discount: Number(d), 
        size: finalSize,
        isBackorder
      });
    } else {
      await db.cart.add({ 
        modelCode: codeVal, 
        color: finalColor, 
        quantity: Number(q), 
        discount: Number(d), 
        size: finalSize,
        isBackorder
      });
    }

    if (isBackorder) {
      const msg = "Note : no return or change after two weeks from purchase date.";
      if (!note.includes(msg)) {
        setNote(prev => prev ? `${prev}\n${msg}` : msg);
      }
    }

    toast.success(isBackorder ? 'Added as Backorder' : 'Added ✓');
    setCode(''); setColor(''); setColorSearch(''); setQty(4); setDiscount(0); setManualSize(''); setCodePreview(null);
    setSuggestions([]);
  };

  const handleUpdateItem = async () => {
    if (!editingItem) return;
    const finalSize = editQty < 4 ? editSize : (editingItem.model?.size || '');
    await db.cart.update(editingItem.id, {
      quantity: Number(editQty),
      color: editColor,
      discount: Number(editDiscount),
      size: finalSize
    });
    toast.success('Updated ✓');
    setEditingItem(null);
  };

  const shareSMS = async (orderData) => {
    const customerName = orderData.customer?.name || 'Customer';
    const total = orderData.total.toFixed(2);
    const deposit = orderData.deposit.toFixed(2);
    const balance = orderData.balance.toFixed(2);

    let itemsText = '';
    const totalQty = (orderData.items || []).reduce((s, i) => s + Number(i.quantity), 0);
    const isWholesale = totalQty >= 4;

    orderData.items.forEach(i => {
      const price = isWholesale ? (i.model?.wholesalePrice || 0) : (i.model?.retailPrice || 0);
      const unitPrice = Math.max(0, price - (i.discount || 0)).toFixed(2);
      itemsText += `Model: ${i.modelCode} x ${i.quantity}\n`;
      itemsText += `${unitPrice} x ${i.quantity}\n`;
      itemsText += `color: ${i.color}\n\n`;
    });

    let text = `BEE QUEEN\n`;
    text += `Order # ${orderData.id}\n`;
    text += `------------------\n`;
    text += `Thank you for your purchase, \n`;
    text += `Mr/Ms : ${customerName}\n\n`;
    text += `Your order :\n`;
    text += itemsText;
    if (orderData.note) text += `Note: ${orderData.note}\n`;
    if (orderData.deposit > 0) {
      text += `Deposit: $${deposit}\n`;
    }
    text += `Total: $${total}\n`;
    text += `------------------\n`;
    if (orderData.balance > 0) {
      text += `Balance: $${balance}\n`;
    }
    text += `\nOrder has successfully confirmed.\n`;
    text += `Note: no return or change after two weeks from purchase date.\n\n`;
    text += `We appreciate your business. 🐝👑`;

    if (settings?.messageLinkEnabled && settings?.linkMessage) {
      text += `\n\n🔗 ${settings.linkMessage}`;
    }

    if (Capacitor.isNativePlatform()) {
      try { await Share.share({ title: 'Invoice', text, dialogTitle: 'Share Invoice' }); } catch {}
    } else {
      navigator.clipboard.writeText(text);
      toast.info('Invoice template copied to clipboard!');
    }
  };

  const shareWhatsApp = async (orderData, isDraft = false) => {
    const phone = orderData.customer?.phone?.replace(/\+/g, '').replace(/ /g, '');
    if (!phone) { toast.error('Customer phone missing'); return; }

    const customerName = orderData.customer?.name || 'Customer';
    const total = Math.round(orderData.total);
    const deposit = Math.round(orderData.deposit);
    const balance = Math.round(orderData.balance);
    const prevDebt = Math.round(orderData.customer?.accountBalance || 0);
    
    const d = new Date(orderData.date);
    const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

    let itemsText = '';
    const totalQty = (orderData.items || []).reduce((s, i) => s + Number(i.quantity), 0);
    const isWholesale = totalQty >= 4;

    orderData.items.forEach(i => {
      const price = isWholesale ? (i.model?.wholesalePrice || i.wholesalePrice || 0) : (i.model?.retailPrice || i.retailPrice || 0);
      const unitPrice = Math.round(Math.max(0, price - (i.discount || 0)));
      itemsText += `• ${i.modelCode} | ${i.color} | Qty: ${i.quantity} | $${unitPrice}\n`;
    });

    let header = isDraft ? 'Invoice' : (balance === 0 ? 'Paid' : 'Deposit');
    if (orderData.status === 'returned') header = 'Returned';
    
    let text = `📝 *${header}*\n`;
    text += `------------------\n`;
    text += `🆔 *Order #:* ${orderData.id}\n`;
    text += `📅 *Date:* ${dateStr}\n`;
    text += `👤 *Customer:* *${customerName.toUpperCase()}*\n`;
    text += `📞 *Phone:* +${phone}\n`;
    text += `💳 *Prev. Debt:* $${prevDebt}\n`;
    text += `------------------\n`;
    text += `📦 *Items:*\n`;
    text += itemsText;
    text += `------------------\n`;
    text += `💵 *Subtotal:* $${Math.round(subtotal)}\n`;
    if (orderDiscount > 0) {
      text += `🧧 *Discount:* -$${Math.round(orderDiscount)}\n`;
    }
    text += `💰 *Total:* *$${Math.round(finalTotal)}*\n`;
    if (deposit > 0) {
      text += `📥 *Deposit:* $${deposit}\n`;
    }
    text += `📉 *Balance:* $${balance}\n`;
    
    let finalNote = orderData.note || '';
    const policyMsg = "Note : no return or change after two weeks from purchase date.";
    finalNote = finalNote ? `${finalNote}\n_${policyMsg}_` : `_${policyMsg}_`;
    text += `📝 *Note:* ${finalNote}`;

    if (settings?.messageLinkEnabled && settings?.linkMessage) {
      text += `\n\n🔗 ${settings.linkMessage}`;
    }

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
    return text;
  };

  const handleSave = async (status, isSms = false) => {
    if (!customerId) { toast.error('Select a customer'); return; }
    if (!cartItems?.length) { toast.error('Cart is empty'); return; }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      let finalStatus = status;
      if (status === 'invoice_msg') finalStatus = 'draft';
      if ((status === 'confirmed' || status === 'whatsapp') && balance === 0) finalStatus = 'paid';
      if (status === 'whatsapp' && balance > 0) finalStatus = 'confirmed';
      
      if (finalStatus === 'confirmed' || finalStatus === 'paid') {
        for (const item of cartItems) {
          const s = await db.stock.where({ modelCode: item.modelCode, color: item.color }).first();
          if (s) {
            await db.stock.update(s.id, { quantity: s.quantity - Number(item.quantity) });
          } else {
            const stockId = await generateId('stock');
            await db.stock.add({ id: stockId, modelCode: item.modelCode, color: item.color, quantity: -Number(item.quantity) });
          }
        }
      }
      
      const orderData = {
        customerId: Number(customerId), date: now, status: finalStatus,
        total: subtotal, orderDiscount: Number(orderDiscount || 0), 
        finalTotal: finalTotal, deposit: depositVal, balance, note: note.trim(),
        isSparis: !!isSparis, isCollected: false,
        items: cartItems.map(i => ({
          modelCode: i.modelCode, color: i.color,
          quantity: Number(i.quantity), size: i.size || '',
          wholesalePrice: Number(i.model?.wholesalePrice || 0),
          retailPrice: Number(i.model?.retailPrice || 0),
          purchasePrice: Number(i.model?.purchasePrice || 0),
          discount: Number(i.discount || 0),
        })),
      };
      
      const orderId = await generateId('orders');
      orderData.id = orderId;
      await db.orders.add(orderData);
      
      // Record income in wallet if it's a confirmed order with a deposit
      if ((finalStatus === 'confirmed' || finalStatus === 'paid') && depositVal > 0) {
        await db.walletEntries.add({
          label: `Deposit: Order #${orderId} - ${selectedCustomer?.name}`,
          category: 'sales',
          amount: depositVal,
          currency: 'USD',
          type: 'income',
          date: now
        });
      }
      
      // Auto-Sync Push & Local Backup
      SyncEngine.saveForSync().catch(e => console.warn('Silent sync failed', e));
      SyncEngine.exportFullBackup().catch(e => console.warn('Silent local backup failed', e));

      orderData.customer = selectedCustomer;

      const tgHeader = finalStatus === 'draft' ? 'Invoice' : (balance === 0 ? 'Paid' : 'Deposit');
      const d = new Date(orderData.date);
      const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

      let itemsList = '';
      orderData.items.forEach(i => {
        const price = isWholesale ? i.wholesalePrice : i.retailPrice;
        const finalPrice = Math.round(Math.max(0, price - i.discount));
        itemsList += `• ${i.modelCode} | ${i.color} | Qty: ${i.quantity} | $${finalPrice}\n`;
      });

      let tgText = `📝 <b>${tgHeader}</b>\n` +
        `----------------------------------\n` +
        `🆔 <b>Order #:</b> ${orderId}\n` +
        `📅 <b>Date:</b> ${dateStr}\n` +
        `👤 <b>Customer:</b> <b>${(selectedCustomer?.name || 'N/A').toUpperCase()}</b>\n` +
        `📞 <b>Phone:</b> +${selectedCustomer?.phone?.replace(/\+/g, '').replace(/ /g, '') || 'N/A'}\n` +
        `💳 <b>Prev. Debt:</b> $${Math.round(selectedCustomer?.accountBalance || 0)}\n` +
        `----------------------------------\n` +
        `📦 <b>Items:</b>\n${itemsList}` +
        `----------------------------------\n` +
        `💵 <b>Subtotal:</b> $${Math.round(subtotal)}\n` +
        (orderDiscount > 0 ? `🧧 <b>Discount:</b> -$${Math.round(orderDiscount)}\n` : '') +
        `💰 <b>Total:</b> <b>$${Math.round(finalTotal)}</b>\n`;

      if (depositVal > 0) tgText += `📥 <b>Deposit:</b> $${Math.round(depositVal)}\n`;
      tgText += `📉 <b>Balance:</b> $${Math.round(balance)}\n`;
      
      let finalTgNote = note || '';
      const policyMsg = "Note : no return or change after two weeks from purchase date.";
      finalTgNote = finalTgNote ? `${finalTgNote}\n<i>${policyMsg}</i>` : `<i>${policyMsg}</i>`;
      tgText += `📝 <b>Note:</b> ${finalTgNote}`;

      sendTelegramMessage(tgText, { status: tgHeader.toLowerCase() });
      if (isSparis && settings.tgSparisChatId) sendTelegramMessage(tgText, { forcedChatId: settings.tgSparisChatId });

      if (finalStatus === 'confirmed' || finalStatus === 'paid') {
        await db.cart.clear();
        setIsSparis(false);
      }
      toast.success((finalStatus === 'confirmed' || finalStatus === 'paid') ? 'Order confirmed!' : 'Draft saved!');
      
      if (isSms) {
        shareSMS(orderData);
      } else if (status === 'whatsapp' || status === 'invoice_msg') {
        shareWhatsApp(orderData, status === 'invoice_msg');
      } else {
        const pdfData = await generateInvoicePDF(orderData, settings);
        if (pdfData) {
          await db.orders.update(orderId, { pdfData });
          if (Capacitor.isNativePlatform()) {
            try {
              const fileName = `Invoice_${orderId}_${Date.now()}.pdf`;
              const res = await Filesystem.writeFile({
                path: fileName,
                data: pdfData.split(',')[1],
                directory: Directory.Cache,
              });
              
              await Share.share({
                title: status === 'draft' ? `Invoice #${orderId}` : `Receipt #${orderId}`,
                text: `${status === 'draft' ? 'Invoice' : 'Receipt'} for ${selectedCustomer?.name}`,
                url: res.uri,
              });
            } catch (err) {
              console.error('PDF Share error:', err);
              toast.error('Sharing failed. Please check permissions.');
            }
          } else {
            const link = document.createElement('a');
            link.href = pdfData; 
            link.download = `Invoice_${orderId}.pdf`; 
            link.click();
            toast.success('PDF Downloaded');
          }
        }
      }

      // Navigation & State Reset
      if (finalStatus === 'draft') {
        // Reset page for new draft
        await db.cart.clear();
        setCustomerId('');
        setCustomerSearch('');
        setNote('');
        setOrderDiscount(0);
        setDeposit('');
        setIsSparis(false);
        toast.info('Invoice saved. Ready for next order.');
      } else {
        // Redirect to Home for confirmed orders
        setTimeout(() => navigate('/'), 1500);
      }
    } catch (err) {
      console.error(err);
      toast.error('Error saving order');
    } finally { setSaving(false); }
  };

  return (
    <div className="animate-in">
      <div className="page-header">
        <h2>{t('New Order')}</h2>
        <span className={`badge ${isWholesale ? 'badge-gold' : 'badge-muted'}`}>
          {isWholesale ? t('Wholesale') : t('Retail')}
        </span>
      </div>

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr' }}>
        
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 44 }}>Img</th>
                  <th>{t('Code')}</th>
                  <th>{t('Color')}</th>
                  <th>{t('Size')}</th>
                  <th>Price</th>
                  <th>{t('Qty')}</th>
                  <th>Total</th>
                  <th style={{ width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {cartItems?.length ? cartItems.map((item, i) => {
                  const base = isWholesale ? (item.model?.wholesalePrice ?? 0) : (item.model?.retailPrice ?? 0);
                  const eff  = Math.max(0, Number(base) - Number(item.discount || 0));
                  const colorDef = colorsList?.find(c => c.name.toLowerCase() === item.color?.toLowerCase());
                  return (
                    <tr key={i}>
                      <td>
                        <ModelImage 
                          modelCode={item.modelCode} 
                          style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4, cursor: 'pointer' }} 
                          onClick={(src) => item.model?.videos?.length > 0 ? setVideoPreview(item.model.videos[0]) : setPreviewImage(src)} 
                        />
                      </td>
                      <td style={{ fontWeight: 700 }}>{item.modelCode}</td>
                      <td><div className="flex items-center gap-1">{colorDef && <span className="color-dot" style={{ background: colorDef.hex }} />}{item.color}</div></td>
                      <td className="text-muted">{item.size || '—'}</td>
                      <td>${eff.toFixed(2)}</td>
                      <td>{item.quantity}</td>
                      <td style={{ fontWeight: 800, color: 'var(--gold)' }}>${lineTotal(item).toFixed(2)}</td>
                      <td className="flex gap-1">
                        <button className="btn btn-warning btn-icon" onClick={() => setEditingItem(item)}><Edit2 size={13} /></button>
                        <button className="btn btn-danger btn-icon" onClick={() => db.cart.delete(item.id)}><Trash2 size={13} /></button>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr><td colSpan={8}><div className="empty-state" style={{ padding: '2rem' }}><p>No items yet</p></div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="flex justify-between items-center mb-2">
            <div className="form-label mb-0">{t('Customer')}</div>
            <div className="flex items-center gap-2">
               <span className="text-[10px] font-bold uppercase text-muted">Message Link</span>
               <div 
                 onClick={async () => {
                   const newState = !settings?.messageLinkEnabled;
                   await db.settings.update(1, { messageLinkEnabled: newState });
                 }}
                 style={{ 
                   width: 32, height: 16, 
                   background: settings?.messageLinkEnabled ? 'var(--gold)' : '#444', 
                   borderRadius: 10, position: 'relative', cursor: 'pointer', transition: '0.3s' 
                 }}
               >
                 <div style={{ 
                   width: 10, height: 10, background: '#fff', borderRadius: '50%', 
                   position: 'absolute', top: 3, left: settings?.messageLinkEnabled ? 19 : 3, 
                   transition: '0.3s' 
                 }} />
               </div>
            </div>
          </div>
          {selectedCustomer ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', background: 'var(--s2)', padding: '.75rem', borderRadius: 'var(--r-md)' }}>
              <div className="avatar">{selectedCustomer.photo ? <img src={selectedCustomer.photo} alt={selectedCustomer.name} /> : <span style={{ fontSize: '1.1rem' }}>👤</span>}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{selectedCustomer.name}</div>
                <div className="text-xs text-muted">{selectedCustomer.phone}</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => { setCustomerId(''); setCustomerSearch(''); }}>{t('Change')}</button>
            </div>
          ) : (
            <>
              <div className="search-wrap mb-2">
                <Search size={16} className="search-icon" />
                <input className="input" placeholder={t('Search customer...')} value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} />
              </div>
              {filteredCustomers.length > 0 && (
                <div style={{ background: 'var(--s2)', borderRadius: 'var(--r-md)', overflow: 'hidden', maxHeight: 200, overflowY: 'auto' }}>
                  {filteredCustomers.map(c => (
                    <button key={c.id} className="btn btn-ghost w-full" style={{ justifyContent: 'flex-start', borderRadius: 0, padding: '.6rem 1rem' }} onClick={async () => { 
                      setCustomerId(c.id); setCustomerSearch('');
                      if (c.phone) { await Clipboard.write({ string: c.phone }); toast.info(`Phone ${c.phone} copied!`); }
                    }}>
                      <span style={{ fontWeight: 600 }}>{c.name}</span>
                      <span className="text-xs text-muted ml-auto">{c.phone}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="card">
          <div className="form-label mb-3">{t('Add Item')}</div>
          <div style={{ display: 'grid', gap: '.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))' }}>
            <div className="form-group" style={{ position: 'relative' }}>
              <label className="form-label">{t('Model Code')}</label>
              <input className="input" placeholder="ABC123" value={code} onChange={e => setCode(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && handleAdd()} style={{ textTransform: 'uppercase' }} />
              {suggestions.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--s3)', borderRadius: 'var(--r-md)', zIndex: 100, border: '1px solid var(--gold-dim)', boxShadow: 'var(--sh-md)', marginTop: '4px', overflow: 'hidden' }}>
                  {suggestions.map(s => <button key={s.code} className="btn btn-ghost w-full" style={{ justifyContent: 'flex-start', borderRadius: 0, fontSize: '13px', padding: '8px 12px' }} onClick={() => { setCode(s.code); setSuggestions([]); }}>{s.code}</button>)}
                </div>
              )}
            </div>
            {codePreview && (
              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '.75rem', alignItems: 'center', background: 'var(--s2)', borderRadius: 'var(--r-md)', padding: '.6rem .9rem', border: '1px solid rgba(212,160,23,.35)' }}>
                <ModelImage 
                  modelCode={codePreview.code}
                  style={{ width: 44, height: 52, objectFit: 'cover', borderRadius: 'var(--r-sm)', flexShrink: 0 }}
                  onClick={(img) => setPreviewImage(img)}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: 'var(--gold)' }}>{codePreview.code}</div>
                  <div className="text-xs text-muted">{codePreview.size}</div>
                  <div className="text-xs">WS: <b style={{ color: 'var(--success)' }}>${codePreview.wholesalePrice}</b> &nbsp;·&nbsp;RT: ${codePreview.retailPrice}</div>
                </div>
                <div style={{ fontSize: '.75rem', textAlign: 'right' }}>
                  {stockPreview?.map(s => <div key={s.id} style={{ color: s.quantity > 0 ? 'var(--text)' : 'var(--danger)' }}><span className="color-dot" style={{ width: 6, height: 6, background: colorsList?.find(c => c.name === s.color)?.hex, marginRight: 4 }} />{s.color}: <b>{s.quantity}</b></div>)}
                </div>
              </div>
            )}
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">{t('Color')}</label>
              <div className="flex flex-wrap gap-2">
                {stockPreview?.length > 0 ? stockPreview.map(s => <button key={s.id} className={`btn ${color === s.color ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: 13, padding: '8px 14px', borderRadius: 'var(--r-full)', border: '1px solid var(--white-05)', opacity: s.quantity <= 0 ? 0.7 : 1 }} onClick={() => setColor(s.color)}><span className="color-dot" style={{ background: colorsList?.find(c => c.name === s.color)?.hex, width: 14, height: 14 }} /> {s.color} ({s.quantity})</button>) : <div className="text-xs text-muted italic">Select a model code...</div>}
              </div>
            </div>
            <div className="form-group"><label className="form-label">{t('Qty')}</label><input type="number" className="input" min="1" value={qty} onChange={e => setQty(Number(e.target.value))} /></div>
            <div className="form-group" style={{ display: qty < 4 ? 'block' : 'none' }}><label className="form-label">{t('Size')}</label><input className="input" placeholder="e.g. 42" value={manualSize} onChange={e => setManualSize(e.target.value)} /></div>
            <div className="form-group" style={{ alignSelf: 'flex-end', flex: 'none', width: 60 }}><button className="btn btn-primary w-full" onClick={handleAdd} style={{ height: 42 }}><Plus size={20} /></button></div>
          </div>
        </div>

        {/* ── Summary Section ── */}
        <div className="card">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem', background: 'var(--s2)', padding: '1.25rem', borderRadius: 'var(--r-md)', border: '1px solid var(--white-05)', textAlign: 'center' }}>
            <div className="flex-col gap-1">
              <span className="text-[10px] text-muted uppercase font-black">{t('Total')}</span>
              <span style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--gold)' }}>{`$${subtotal.toFixed(2)}`}</span>
            </div>
            <div className="flex-col gap-1" style={{ borderLeft: '1px solid var(--white-05)', borderRight: '1px solid var(--white-05)' }}>
              <span className="text-[10px] text-muted uppercase font-black">{t('Deposit')}</span>
              <span style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--success)' }}>{`$${depositVal.toFixed(2)}`}</span>
            </div>
            <div className="flex-col gap-1">
              <span className="text-[10px] text-muted uppercase font-black">{t('Balance')}</span>
              <span style={{ fontSize: '1.3rem', fontWeight: 900, color: balance > 0 ? 'var(--danger)' : 'var(--success)' }}>{`$${balance.toFixed(2)}`}</span>
            </div>
          </div>

          <div style={{ display: 'grid', gap: '1rem' }}>
            <div className="flex gap-4 items-end">
              <div className="form-group flex-1">
                <label className="form-label">{t('Deposit Amount')}</label>
                <input type="number" className="input" value={deposit} onChange={e => setDeposit(e.target.value)} style={{ fontWeight: 700 }} placeholder="0.00" />
              </div>
              <div className="form-group" style={{ marginBottom: '0.2rem' }}>
                <div className="flex items-center gap-3 p-2 px-3 bg-s2 rounded border border-white-05 cursor-pointer" style={{ height: 42, background: isSparis ? 'rgba(0,136,204,0.1)' : undefined }} onClick={() => setIsSparis(!isSparis)}>
                  <span className="font-bold text-xs" style={{ color: isSparis ? '#0088cc' : 'var(--text)' }}>Sparis</span>
                  <div style={{ width: 38, height: 20, background: isSparis ? '#0088cc' : '#444', borderRadius: 20, position: 'relative', transition: '0.3s' }}>
                    <div style={{ width: 14, height: 14, background: '#fff', borderRadius: '50%', position: 'absolute', top: 3, left: isSparis ? 21 : 3, transition: '0.3s' }} />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="form-group flex-1">
                <label className="form-label">{t('Discount ($)')}</label>
                <input type="number" className="input" value={orderDiscount} onChange={e => setOrderDiscount(e.target.value)} placeholder="0" />
              </div>
              <div className="form-group flex-2">
                <label className="form-label">{t('Note')}</label>
                <input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="Type note here..." />
              </div>
            </div>
          </div>
          
          <div className="divider" style={{ margin: '1.5rem 0' }} />
          <div className="flex gap-2 flex-wrap">
            <button className="btn btn-primary flex-1" onClick={() => handleSave('confirmed')} disabled={saving}><CheckCircle size={16} /> {t('Receipt')}</button>
            <button className="btn btn-success flex-1" onClick={() => handleSave('confirmed', true)} disabled={saving}><Share2 size={16} /> {t('Share')}</button>
            {cartItems?.length > 0 && (
              <button 
                className="btn flex-1" 
                style={{ background: '#25D366', color: '#fff' }} 
                onClick={() => handleSave('whatsapp')} 
                disabled={saving}
              >
                <MessageCircle size={16} /> WhatsApp
              </button>
            )}
            <button className="btn btn-warning flex-1" onClick={() => setShowInvoiceChoice(true)} disabled={saving}><FileText size={16} /> {t('Invoice')}</button>
          </div>
        </div>
      </div>

      {showInvoiceChoice && (
        <div className="modal-backdrop">
          <div className="modal animate-in" style={{ maxWidth: 350 }}>
            <div className="modal-header"><span className="modal-title">{t('Invoice Options')}</span><button className="btn btn-ghost btn-icon" onClick={() => setShowInvoiceChoice(false)}>✕</button></div>
            <div className="modal-body flex-col gap-3">
              <button className="btn btn-primary w-full" onClick={() => { setShowInvoiceChoice(false); handleSave('draft'); }}><FileText size={18} /> Send PDF File</button>
              <button className="btn w-full" style={{ background: '#25D366', color: '#fff' }} onClick={() => { setShowInvoiceChoice(false); handleSave('invoice_msg'); }}><Send size={18} /> Send WhatsApp Message</button>
            </div>
          </div>
        </div>
      )}
      {videoPreview && <div className="modal-backdrop" onClick={() => setVideoPreview(null)} style={{ zIndex: 1000 }}><div className="modal" style={{ background: 'transparent', boxShadow: 'none', border: 'none', maxWidth: '60vw' }}><video src={videoPreview} controls autoPlay style={{ maxWidth: '100%', maxHeight: '60vh', borderRadius: 'var(--r-md)', boxShadow: 'var(--shadow-xl)' }} /><button className="btn btn-ghost" style={{ position: 'absolute', top: -40, right: 0, color: '#fff' }} onClick={() => setVideoPreview(null)}><X size={32} /></button></div></div>}
      {previewImage && <div className="modal-backdrop" onClick={() => setPreviewImage(null)} style={{ zIndex: 1000 }}><div className="modal" style={{ background: 'transparent', boxShadow: 'none', border: 'none', maxWidth: '60vw' }}><img src={previewImage} style={{ maxWidth: '100%', maxHeight: '60vh', borderRadius: 'var(--r-md)', boxShadow: 'var(--shadow-xl)' }} alt="Preview" /><button className="btn btn-ghost" style={{ position: 'absolute', top: -40, right: 0, color: '#fff' }} onClick={() => setPreviewImage(null)}><X size={32} /></button></div></div>}

      {outOfStockModal && pendingItem && (
        <div className="modal-backdrop" style={{ zIndex: 9999 }}>
          <div className="modal animate-in" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <span className="modal-title" style={{ color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertCircle size={20} /> {t('Out of Stock')}
              </span>
              <button className="btn btn-ghost btn-icon" onClick={() => { setOutOfStockModal(false); setPendingItem(null); }}>✕</button>
            </div>
            <div className="modal-body">
              <p>The color <b style={{ color: 'var(--gold)' }}>{pendingItem.finalColor}</b> is out of stock.</p>
              <div style={{ background: 'rgba(255,100,100,0.1)', padding: '0.5rem', borderRadius: 'var(--r-md)', margin: '1rem 0' }}>
                <span className="text-sm font-bold" style={{ color: 'var(--danger)' }}>Available in Stock: {pendingItem.available}</span>
              </div>
              <p className="text-sm">You can add this as a Pre-Order (Backorder) which allows negative stock, or check the factory stock directly via RESEDA.</p>
            </div>
            <div className="modal-footer flex flex-col gap-2 mt-4">
              <button 
                className="btn btn-warning w-full" 
                onClick={() => {
                  commitAddToCart(pendingItem.codeVal, pendingItem.finalColor, pendingItem.qty, pendingItem.discount, pendingItem.model, true);
                  setOutOfStockModal(false);
                  setPendingItem(null);
                }}
              >
                Add as Pre-Order
              </button>
              {settings?.resedaLink && (
                <button 
                  className="btn w-full" 
                  style={{ background: '#0088cc', color: '#fff', display: 'flex', justifyContent: 'center' }} 
                  onClick={() => window.open(settings.resedaLink, '_blank')}
                >
                  Open RESEDA
                </button>
              )}
              <button className="btn btn-ghost w-full" onClick={() => { setOutOfStockModal(false); setPendingItem(null); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {editingItem && (
        <div className="modal-backdrop" style={{ zIndex: 9999 }}>
          <div className="modal animate-in" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <span className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Edit2 size={20} /> {t('Edit Item')}
              </span>
              <button className="btn btn-ghost btn-icon" onClick={() => setEditingItem(null)}>✕</button>
            </div>
            <div className="modal-body flex-col gap-4">
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', background: 'var(--s2)', padding: '0.75rem', borderRadius: 'var(--r-md)' }}>
                <ModelImage modelCode={editingItem.modelCode} style={{ width: 50, height: 60, borderRadius: 6 }} />
                <div>
                  <div style={{ fontWeight: 800, color: 'var(--gold)' }}>{editingItem.modelCode}</div>
                  <div className="text-xs text-muted">{editingItem.model?.size}</div>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">{t('Color')}</label>
                <div className="flex flex-wrap gap-2">
                  {editStock.map(s => (
                    <button 
                      key={s.id} 
                      className={`btn ${editColor === s.color ? 'btn-primary' : 'btn-ghost'}`} 
                      style={{ fontSize: 13, padding: '8px 14px', borderRadius: 'var(--r-full)' }}
                      onClick={() => setEditColor(s.color)}
                    >
                      <span className="color-dot" style={{ background: colorsList?.find(c => c.name === s.color)?.hex, width: 14, height: 14 }} /> {s.color}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <div className="form-group flex-1">
                  <label className="form-label">{t('Qty')}</label>
                  <input type="number" className="input" value={editQty} onChange={e => setEditQty(Number(e.target.value))} min="1" />
                </div>
                <div className="form-group flex-1">
                  <label className="form-label">{t('Discount')}</label>
                  <input type="number" className="input" value={editDiscount} onChange={e => setEditDiscount(Number(e.target.value))} />
                </div>
              </div>

              {editQty < 4 && (
                <div className="form-group">
                  <label className="form-label">{t('Size')}</label>
                  <input className="input" value={editSize} onChange={e => setEditSize(e.target.value)} placeholder="e.g. 42" />
                </div>
              )}
            </div>
            <div className="modal-footer mt-4">
              <button className="btn btn-primary w-full" onClick={handleUpdateItem}>{t('Update')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
