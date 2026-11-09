import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { Search, Plus, Trash2, AlertTriangle, Archive, X, Camera as CameraIcon, ExternalLink, FileSpreadsheet, Send, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { sendInventoryReport } from '../utils/telegram';
import ModelImage from '../components/ModelImage';

export default function Inventory() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [sendingReport, setSendingReport] = useState(false);
  const [importModal, setImportModal] = useState(false);
  const [importFactoryId, setImportFactoryId] = useState('');
  const [importSupplyNo, setImportSupplyNo] = useState('');
  const [modelCode, setModelCode] = useState('');
  const [color, setColor] = useState('');
  const [qty, setQty] = useState('');
  const [previewImage, setPreviewImage] = useState(null);
  const [videoPreview, setVideoPreview] = useState(null);
  const [preview, setPreview] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [factoryId, setFactoryId] = useState('');
  const [supplyNo, setSupplyNo] = useState('');
  const [importAddToDebt, setImportAddToDebt] = useState(true);
  const [addToDebt, setAddToDebt] = useState(true);
  const codeTimer = React.useRef(null);
  const fileInputRef = React.useRef(null);

  const colors = useLiveQuery(() => db.colors.toArray());
  const models = useLiveQuery(() => db.models.toArray());
  const settings = useLiveQuery(() => db.settings.get(1));
  const factories = useLiveQuery(() => db.factories.toArray()) || [];

  const stock = useLiveQuery(async () => {
    let all = await db.stock.toArray();
    if (search) {
      const s = search.toLowerCase();
      all = all.filter(x =>
        x.modelCode?.toLowerCase().includes(s) ||
        x.color?.toLowerCase().includes(s)
      );
    }
    
    const groups = {};
    all.forEach(item => {
      if (!groups[item.modelCode]) {
        groups[item.modelCode] = {
          modelCode: item.modelCode,
          items: [],
          totalQty: 0
        };
      }
      groups[item.modelCode].items.push(item);
      groups[item.modelCode].totalQty += (Number(item.quantity) || 0);
    });

    return Object.values(groups).sort((a, b) => b.modelCode?.localeCompare(a.modelCode));
  }, [search]);

  const handleCodeChange = async val => {
    const code = val.toUpperCase();
    setModelCode(code);
    
    clearTimeout(codeTimer.current);
    if (!code.trim()) { 
      setPreview(null); 
      setSuggestions([]);
      return; 
    }
    
    codeTimer.current = setTimeout(async () => {
      const q = code.trim().toUpperCase();
      const m = await db.models.get(q);
      setPreview(m || null);
      if (m && m.factoryId) setFactoryId(m.factoryId);
      
      const allModels = await db.models.toArray();
      const filtered = allModels
        .filter(mod => mod.code.includes(q) && mod.code !== q)
        .slice(0, 5);
      setSuggestions(filtered);
    }, 250);
  };

  const openModal = () => {
    setModelCode(''); setColor(''); setQty(''); setPreview(null);
    setModal(true);
  };

  const handleSave = async e => {
    e.preventDefault();
    if (!modelCode.trim() || !color || qty === '') { toast.error('Code, color & qty required'); return; }
    const code = modelCode.trim().toUpperCase();
    const q = parseInt(qty);
    const m = await db.models.get(code);
    if (!m) {
      await db.models.add({ 
        code, 
        wholesalePrice: 0, 
        retailPrice: 0, 
        size: '',
        factoryId: factoryId ? Number(factoryId) : undefined
      });
      toast.info('New model created');
    }

    // 1. If factory selected, record supply
    if (factoryId) {
      let sId;
      const existingSupply = await db.factorySupplies.where({ factoryId: Number(factoryId), supplyNo }).first();
      if (existingSupply) {
        sId = existingSupply.id;
      } else {
        sId = await db.factorySupplies.add({
          factoryId: Number(factoryId),
          supplyNo,
          date: new Date().toISOString()
        });
      }

      await db.factoryItems.add({
        supplyId: sId,
        modelCode: code,
        color,
        quantity: q,
        priceAtTime: addToDebt ? (m?.purchasePrice || 0) : 0
      });

      // Ensure model is linked to this factory if it wasn't
      if (m && !m.factoryId) {
        await db.models.update(code, { factoryId: Number(factoryId) });
      } else if (!m) {
        // This case is handled above at line 101, but let's make it robust
        await db.models.update(code, { factoryId: Number(factoryId) });
      }
    }

    // 2. Update Stock
    const existing = await db.stock.where({ modelCode: code, color }).first();
    if (existing) {
      await db.stock.update(existing.id, { quantity: existing.quantity + q });
      toast.success(`Added ${q} to existing stock`);
    } else {
      await db.stock.add({ modelCode: code, color, quantity: q });
      toast.success('Stock entry created');
    }

    // Keep modal open, just clear qty
    setQty('');
    // Optionally keep color if adding multiple sizes, but user asked to keep supply no & model
    // So we clear color to pick next one
    setColor('');
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Delete this stock entry?')) return;
    await db.stock.delete(id);
    toast.success('Deleted');
  };
  const handleImportExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!importFactoryId || !importSupplyNo) { toast.error('Factory & Supply No required'); return; }

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
        
        let imported = 0;
        let errors = 0;

        // 1. Create Supply Record
        const supplyId = await db.factorySupplies.add({
          factoryId: Number(importFactoryId),
          supplyNo: importSupplyNo,
          date: new Date().toISOString()
        });
        
        // Skip header row
        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          const code = String(row[0] || '').trim().toUpperCase();
          const colorName = String(row[1] || '').trim();
          const q = parseInt(row[2] || 0);
          const rowPrice = parseFloat(row[3] || 0);
          const hex = String(row[4] || '').trim(); 
          
          if (code && colorName && !isNaN(q)) {
            let m = await db.models.get(code);
            if (!m) {
              const newModel = { 
                code, 
                wholesalePrice: 0, 
                retailPrice: 0, 
                purchasePrice: rowPrice || 0, 
                size: '',
                factoryId: Number(importFactoryId)
              };
              await db.models.add(newModel);
              m = newModel;
            } else {
              if (!m.factoryId) await db.models.update(code, { factoryId: Number(importFactoryId) });
              if (rowPrice > 0) {
                // Update purchase price if provided in Excel
                await db.models.update(code, { purchasePrice: rowPrice });
                m.purchasePrice = rowPrice;
              }
            }

            const purchasePrice = m?.purchasePrice || rowPrice || 0;
            
            // 2. Ensure Color exists
            const colorExists = await db.colors.where({ name: colorName }).first();
            if (!colorExists) {
              await db.colors.add({ 
                name: colorName, 
                hex: hex.startsWith('#') ? hex : (hex ? `#${hex}` : '#888888') 
              });
            }
            
            // 3. Update Stock
            const existing = await db.stock.where({ modelCode: code, color: colorName }).first();
            if (existing) {
              await db.stock.update(existing.id, { quantity: existing.quantity + q });
            } else {
              await db.stock.add({ modelCode: code, color: colorName, quantity: q });
            }

            // 4. Record in Factory Items
            await db.factoryItems.add({
               supplyId,
               modelCode: code,
               color: colorName,
               quantity: q,
               priceAtTime: importAddToDebt ? purchasePrice : 0
            });

            imported++;
          } else {
            errors++;
          }
        }
        
        setImportModal(false);
        setImportSupplyNo('');
        toast.success(`Imported ${imported} entries & linked to supply!`);
        if (errors > 0) toast.warning(`${errors} rows skipped.`);
      } catch (err) {
        console.error(err);
        toast.error('Failed to parse Excel file');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = ''; 
  };

  const handleExportExcel = async () => {
    if (!stock || stock.length === 0) { toast.error('No stock to export'); return; }
    
    const data = [];
    stock.forEach(group => {
      group.items.forEach(item => {
        data.push({
          'Model Code': group.modelCode,
          'Color': item.color,
          'Quantity': item.quantity,
          'Size': item.size || ''
        });
      });
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stock');
    const fileName = `BeeQueen_Stock_${new Date().toISOString().split('T')[0]}.xlsx`;

    if (Capacitor.isNativePlatform()) {
      try {
        const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
        const res = await Filesystem.writeFile({
          path: `BeeQueenPro/backups/${fileName}`,
          data: base64,
          directory: Directory.Documents,
          recursive: true
        });
        await Share.share({ title: 'Export Stock', url: res.uri });
        toast.success('Excel exported successfully');
      } catch (err) {
        toast.error('Export failed');
      }
    } else {
      XLSX.writeFile(wb, fileName);
      toast.success('Excel exported successfully');
    }
  };
  return (
    <div className="animate-in">
      <div className="page-header">
        <h2>{t('Inventory')}</h2>
        <div className="page-actions">
          <div className="search-wrap">
            <Search size={16} className="search-icon" />
            <input className="input" placeholder={t('Search code, color, size...')}
              value={search} onChange={e => setSearch(e.target.value)} style={{ width: 230 }} />
          </div>
          <button className="btn btn-primary" onClick={openModal}>
            <Plus size={16} /> {t('Add to Stock')}
          </button>
          
          <button 
            className="btn" 
            style={{ background: 'var(--gold)', color: '#000' }} 
            onClick={async () => {
              setSendingReport(true);
              const ok = await sendInventoryReport();
              setSendingReport(false);
              if (ok) toast.success('Report Sent!');
              else toast.error('Failed to send report');
            }}
            disabled={sendingReport}
          >
            <Send size={16} /> {sendingReport ? 'Sending...' : 'Send Report'}
          </button>

          <button 
            className="btn" 
            style={{ background: '#2563eb', color: '#fff' }} 
            onClick={() => setImportModal(true)}
          >
            <FileSpreadsheet size={16} /> {t('Import Excel')}
          </button>

          <button 
            className="btn" 
            style={{ background: 'var(--success)', color: '#fff' }} 
            onClick={handleExportExcel}
          >
            <Download size={16} /> {t('Export Excel')}
          </button>
          <input type="file" hidden ref={fileInputRef} accept=".xlsx, .xls, .csv" onChange={handleImportExcel} />

          {settings?.resedaLink && (
            <button 
              className="btn" 
              onClick={() => window.open(settings.resedaLink, '_blank')}
              style={{ background: '#10b981', color: '#fff' }}
            >
              <ExternalLink size={16} /> Reseda
            </button>
          )}
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 52 }}>Img</th>
              <th>{t('Code')}</th>
              <th>{t('Availability (Color: Qty)')}</th>
              <th>{t('Total Qty')}</th>
            </tr>
          </thead>
          <tbody>
            {stock?.map(group => {
              const model = models?.find(m => m.code === group.modelCode);
              const isLow = group.totalQty < 10;
              return (
                <tr key={group.modelCode} style={{ background: isLow ? 'var(--danger-dim)' : undefined }}>
                  <td style={{ padding: '6px' }}>
                    <ModelImage 
                      modelCode={group.modelCode}
                      color={group.items[0]?.color}
                      style={{ width: 48, height: 56, objectFit: 'cover', borderRadius: 'var(--r-sm)', cursor: 'pointer', border: '1px solid var(--s3)' }} 
                      onClick={(img) => setPreviewImage(img)} 
                    />
                  </td>
                  <td style={{ fontWeight: 800, color: 'var(--gold)', fontSize: '1.1rem' }}>{group.modelCode}</td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                      {group.items.map(item => {
                        const colorDef = colors?.find(c => c.name.toLowerCase() === item.color?.toLowerCase());
                        const itemLow = item.quantity < 5;
                        return (
                          <div key={item.id} className="badge badge-muted" style={{ 
                            display: 'flex', alignItems: 'center', gap: '0.4rem', 
                            borderColor: itemLow ? 'var(--danger)' : undefined,
                            background: itemLow ? 'var(--danger-dim)' : undefined 
                          }}>
                            {colorDef && <span className="color-dot" style={{ background: colorDef.hex, width: 10, height: 10 }} />}
                            <span style={{ fontWeight: 600 }}>{item.color}:</span>
                            <span style={{ color: itemLow ? 'var(--danger)' : 'var(--text)', fontWeight: 800 }}>{item.quantity}</span>
                          </div>
                        );
                      })}
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <span style={{ fontWeight: 800, fontSize: '1.1rem', color: isLow ? 'var(--danger)' : 'var(--success)' }}>
                        {group.totalQty}
                      </span>
                      {isLow && <AlertTriangle size={14} color="var(--danger)" />}
                    </div>
                  </td>
                </tr>
              );
            })}
            {stock?.length === 0 && (
              <tr><td colSpan={6}>
                <div className="empty-state"><Archive size={40} /><p>No stock entries</p></div>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{t('Add to Stock')}</span>
              <button className="btn btn-ghost btn-icon" onClick={() => setModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="form-group">
                    <label className="form-label">Supplier (Optional)</label>
                    <select className="input" value={factoryId} onChange={e => setFactoryId(e.target.value)}>
                      <option value="">-- No Factory --</option>
                      {factories.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Supply No / رقم التزويد</label>
                    <input className="input" value={supplyNo} onChange={e => setSupplyNo(e.target.value)} placeholder="SN-001" />
                  </div>
                </div>

                <div className="form-group" style={{ position: 'relative' }}>
                  <label className="form-label">{t('Model Code')}</label>
                  <input className="input" value={modelCode} onChange={e => handleCodeChange(e.target.value)}
                    autoFocus required style={{ textTransform: 'uppercase' }} />
                  {suggestions.length > 0 && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, 
                      background: 'var(--s3)', borderRadius: 'var(--r-md)', 
                      zIndex: 100, border: '1px solid var(--gold-dim)',
                      boxShadow: 'var(--sh-md)', marginTop: '4px', overflow: 'hidden'
                    }}>
                      {suggestions.map(s => (
                        <button 
                          key={s.code} 
                          type="button"
                          className="btn btn-ghost w-full" 
                          style={{ justifyContent: 'flex-start', borderRadius: 0, fontSize: '13px', padding: '8px 12px' }}
                          onClick={() => { setModelCode(s.code); setSuggestions([]); handleCodeChange(s.code); }}
                        >
                          {s.code}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {preview && (
                  <div style={{
                    background: 'var(--s2)', borderRadius: 'var(--r-md)', padding: '.75rem',
                    display: 'flex', gap: '.75rem', alignItems: 'center',
                    border: '1px solid rgba(212,160,23,.3)',
                  }}>
                    {preview.coverImage
                      ? <img src={preview.coverImage} style={{ width: 48, height: 56, objectFit: 'cover', borderRadius: 'var(--r-sm)' }} />
                      : <Archive size={32} color="var(--gold)" />}
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--gold)' }}>{preview.code}</div>
                      <div className="text-xs text-muted">{preview.size} · WS: ${preview.wholesalePrice}</div>
                    </div>
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">{t('Color')}</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem', maxHeight: 200, overflowY: 'auto', padding: '.25rem' }}>
                    {colors?.map(c => (
                      <button 
                        key={c.id} 
                        type="button" 
                        className={`btn ${color === c.name ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ justifyContent: 'flex-start', padding: '.5rem' }}
                        onClick={() => setColor(c.name)}
                      >
                        <span className="color-dot" style={{ background: c.hex, width: 14, height: 14, marginRight: 8 }} />
                        <span style={{ fontSize: 'var(--fs-xs)' }}>{c.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('Quantity')} (0 for color only)</label>
                  <input type="number" className="input" value={qty}
                    onChange={e => setQty(e.target.value)} min="0" required
                    style={{ fontSize: 'var(--fs-xl)', fontWeight: 700 }} />
                </div>
                {factoryId && (
                  <div className="flex items-center gap-2 mt-2">
                    <input type="checkbox" id="add-debt-single" checked={addToDebt} onChange={e => setAddToDebt(e.target.checked)} />
                    <label htmlFor="add-debt-single" className="text-sm font-bold" style={{ color: 'var(--gold)' }}>Add to Factory Debt / إضافة للدين</label>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn" onClick={() => setModal(false)}>{t('Cancel')}</button>
                <button type="submit" className="btn btn-primary">{t('Add to Stock')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {videoPreview && (
        <div className="modal-backdrop" onClick={() => setVideoPreview(null)} style={{ zIndex: 1000 }}>
          <div className="modal" style={{ background: 'transparent', boxShadow: 'none', border: 'none', maxWidth: '60vw' }}>
            <video src={videoPreview} controls autoPlay style={{ maxWidth: '100%', maxHeight: '60vh', borderRadius: 'var(--r-md)', boxShadow: 'var(--shadow-xl)' }} />
            <button className="btn btn-ghost" style={{ position: 'absolute', top: -40, right: 0, color: '#fff' }} onClick={() => setVideoPreview(null)}><X size={32} /></button>
          </div>
        </div>
      )}
      {previewImage && (
        <div className="modal-backdrop" onClick={() => setPreviewImage(null)} style={{ zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)' }}>
          <div className="modal" style={{ background: 'var(--s3)', padding: '5px', border: '2px solid var(--gold)', maxWidth: '85vw', width: 'auto', position: 'relative', borderRadius: 'var(--r-lg)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <img src={previewImage} style={{ maxWidth: '100%', maxHeight: '70vh', display: 'block', borderRadius: 'var(--r-md)' }} alt="Preview" />
            <button className="btn btn-ghost btn-icon" style={{ position: 'absolute', top: 5, right: 5, background: 'rgba(0,0,0,0.5)', color: '#fff' }} onClick={() => setPreviewImage(null)}><X size={20} /></button>
          </div>
        </div>
      )}
      {/* Import Modal */}
      {importModal && (
        <div className="modal-backdrop" onClick={() => setImportModal(false)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Excel Import Setup / إعدادات استيراد الإكسيل</span>
              <button className="btn btn-ghost btn-icon" onClick={() => setImportModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body space-y-4">
              <div className="form-group">
                <label className="form-label">Select Manufacturer / اختر المصنع</label>
                <select className="input" value={importFactoryId} onChange={e => setImportFactoryId(e.target.value)}>
                  <option value="">-- Choose Factory --</option>
                  {factories.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Supply Receipt Number / رقم التزويد</label>
                <input className="input" placeholder="e.g. BATCH-99" value={importSupplyNo} onChange={e => setImportSupplyNo(e.target.value)} />
              </div>
              <div className="flex items-center gap-2 mt-2">
                <input type="checkbox" id="import-debt" checked={importAddToDebt} onChange={e => setImportAddToDebt(e.target.checked)} />
                <label htmlFor="import-debt" className="text-sm font-bold" style={{ color: 'var(--gold)' }}>Add to Factory Debt / إضافة للدين</label>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn btn-primary w-full" 
                disabled={!importFactoryId || !importSupplyNo}
                onClick={() => fileInputRef.current.click()}
              >
                Choose Excel File & Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

