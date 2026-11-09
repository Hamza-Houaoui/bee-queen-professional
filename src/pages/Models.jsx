import React, { useState, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { 
  Search, Plus, Trash2, Edit2, X, 
  FileSpreadsheet, FolderOpen, Download, Video, Image as ImageIcon 
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import ModelImage from '../components/ModelImage';

export default function Models() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [editCode, setEditCode] = useState(null);
  const [code, setCode] = useState('');
  const [wsPrice, setWsPrice] = useState('');
  const [rtPrice, setRtPrice] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [discountPrice, setDiscountPrice] = useState('');
  const [images, setImages] = useState([]);
  const [videos, setVideos] = useState([]);
  const [size, setSize] = useState('44-46-48-50');
  const [modelFactoryId, setModelFactoryId] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  
  const fileInputRef = useRef();
  const mediaImportRef = useRef();
  const imgRef = useRef();
  const videoRef = useRef();

  const SIZES = ['38-40-42-44', '40-42-44-46', '42-44-46-48', '44-46-48-50', '50-52-54-56'];

  const models = useLiveQuery(async () => {
    let all = await db.models.toArray();
    if (search) all = all.filter(m => m.code?.toLowerCase().includes(search.toLowerCase()));
    all.sort((a, b) => b.code.localeCompare(a.code));
    return all;
  }, [search]);
  
  const factories = useLiveQuery(() => db.factories.toArray()) || [];
  const settings = useLiveQuery(() => db.settings.get(1));

  const openAdd = () => {
    setEditCode(null); setCode(''); setWsPrice(''); setRtPrice(''); setPurchasePrice(''); setDiscountPrice('');
    setSize('44-46-48-50'); setModelFactoryId(''); setImages([]); setVideos([]); setModal(true);
  };

  const openEdit = (m, e) => {
    e.stopPropagation();
    setEditCode(m.code); setCode(m.code); 
    setWsPrice(m.wholesalePrice || ''); setRtPrice(m.retailPrice || ''); 
    setPurchasePrice(m.purchasePrice || ''); setDiscountPrice(m.discountPrice || '');
    setSize(m.size || '44-46-48-50');
    setModelFactoryId(m.factoryId || ''); 
    setImages(m.images || []); setVideos(m.videos || []);
    setModal(true);
  };

  const handleVideoUpload = e => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => setVideos(prev => [...prev, ev.target.result]);
      reader.readAsDataURL(file);
    });
  };

  const handleImageUpload = e => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => setImages(prev => [...prev, ev.target.result]);
      reader.readAsDataURL(file);
    });
  };

  const handleSave = async e => {
    e.preventDefault();
    if (!code.trim()) { toast.error('Code required'); return; }
    const data = {
      code: code.trim().toUpperCase(),
      wholesalePrice: parseFloat(wsPrice) || 0,
      retailPrice: parseFloat(rtPrice) || 0,
      purchasePrice: parseFloat(purchasePrice) || 0,
      discountPrice: parseFloat(discountPrice) || 0,
      size, images, videos,
      factoryId: modelFactoryId ? Number(modelFactoryId) : null,
      coverImage: images[0] || null,
      video: videos[0] || null,
    };
    try {
      if (editCode) {
        if (editCode !== data.code) {
          const old = await db.models.get(editCode);
          await db.models.delete(editCode);
          await db.models.add({ ...old, ...data });
        } else {
          await db.models.update(editCode, data);
        }
        toast.success('Updated');
      } else {
        if (await db.models.get(data.code)) { toast.error('Already exists'); return; }
        await db.models.add(data);
        toast.success('Added');
      }
      setModal(false);
    } catch { toast.error('Save failed'); }
  };

  const handleExportExcel = async () => {
    if (!models?.length) { toast.error('No models'); return; }
    const ws = XLSX.utils.json_to_sheet(models.map(m => ({
      'Code': m.code, 'Wholesale': m.wholesalePrice, 'Retail': m.retailPrice, 'Purchase': m.purchasePrice, 'Size': m.size
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Models');
    const fileName = `Models_${new Date().toISOString().split('T')[0]}.xlsx`;
    if (Capacitor.isNativePlatform()) {
      const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const res = await Filesystem.writeFile({ path: `BeeQueenPro/backups/${fileName}`, data: base64, directory: Directory.Documents, recursive: true });
      await Share.share({ title: 'Export', url: res.uri });
    } else {
      XLSX.writeFile(wb, fileName);
    }
    toast.success('Exported');
  };

  const handleSyncFromFolder = async () => {
    if (!Capacitor.isNativePlatform()) return;
    setSyncing(true);
    try {
      const folder = settings?.mediaFolder || 'Beequeensyngthing/media';
      const res = await Filesystem.readdir({ path: folder, directory: Directory.Documents });
      let count = 0;
      for (const f of res.files) {
        if (f.type !== 'file') continue;
        const code = f.name.split('.')[0].split('-')[0].split('_')[0].toUpperCase();
        const m = await db.models.get(code);
        if (!m) continue;
        const ext = f.name.split('.').pop().toLowerCase();
        if (['jpg','jpeg','png'].includes(ext)) {
          if (!(m.images || []).includes(f.name)) {
            await db.models.update(code, { images: [...(m.images || []), f.name], coverImage: m.coverImage || f.name });
            count++;
          }
        }
      }
      toast.success(`Synced ${count}`);
    } catch (e) { toast.error('Sync failed'); }
    setSyncing(false);
  };

  return (
    <div className="animate-in p-2">
      <div className="page-header">
        <h2>{t('Models')}</h2>
        <div className="page-actions">
          <input type="file" hidden ref={fileInputRef} onChange={async (e) => {
            const file = e.target.files[0]; if (!file) return;
            const rd = new FileReader(); rd.onload = async (evt) => {
              const wb = XLSX.read(evt.target.result, { type: 'binary' });
              const sheet = wb.Sheets[wb.SheetNames[0]];
              const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
              
              for (const row of data) {
                // Skip header row if it exists
                const firstVal = String(row[0] || '').trim().toUpperCase();
                if (!firstVal || firstVal === 'CODE' || firstVal === 'MODEL CODE') continue;

                const code = firstVal;
                const wsPrice = parseFloat(row[1]) || 0;
                const rtPrice = parseFloat(row[2]) || 0;
                const purPrice = parseFloat(row[3]) || 0;
                const size = row[5] || '44-46-48-50';

                await db.models.put({ 
                  code, 
                  wholesalePrice: wsPrice, 
                  retailPrice: rtPrice, 
                  purchasePrice: purPrice, 
                  size: String(size) 
                });
              }
              toast.success('Imported');
            };
            rd.readAsBinaryString(file);
          }} />
          <button className="btn btn-warning" onClick={() => fileInputRef.current.click()}><FileSpreadsheet size={16}/></button>
          <button className="btn btn-ghost" style={{ background: 'var(--success)', color: '#fff' }} onClick={handleExportExcel}><Download size={16}/></button>
          <button className="btn btn-ghost" style={{ background: 'var(--s2)' }} onClick={handleSyncFromFolder} disabled={syncing}><FolderOpen size={16}/></button>
          <button className="btn btn-primary" onClick={openAdd}><Plus size={16}/></button>
        </div>
      </div>

      <div className="flex-col gap-2">
        {models?.map(m => (
          <div key={m.code} className="card flex items-center gap-3 p-2">
            <ModelImage modelCode={m.code} style={{ width: 60, height: 70, borderRadius: 8 }} onClick={src => setPreviewImage(src)} />
            <div className="flex-1 flex justify-between items-center">
              <div>
                <div style={{ fontWeight: 800, color: 'var(--gold)' }}>{m.code}</div>
                <div style={{ fontSize: 12, color: 'var(--success)' }}>${m.wholesalePrice} <span style={{ color: 'var(--muted)', marginLeft: 8 }}>{m.size}</span></div>
              </div>
              <div className="flex gap-2">
                <button className="btn btn-ghost btn-circle" onClick={e => openEdit(m, e)}><Edit2 size={16}/></button>
                <button className="btn btn-danger btn-circle" onClick={async (e) => { e.stopPropagation(); if (confirm('Delete?')) await db.models.delete(m.code); }}><Trash2 size={16}/></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(false)}>
          <div className="modal" style={{ maxWidth: 450 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{editCode ? 'Edit' : 'Add'}</span>
              <button className="btn btn-ghost" onClick={() => setModal(false)}><X size={20}/></button>
            </div>
            <form onSubmit={handleSave} className="modal-body" style={{ maxHeight: '80vh', overflowY: 'auto', padding: '1.5rem' }}>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '100px 1fr', 
                gap: '1.5rem', 
                marginBottom: '1.5rem',
                background: 'rgba(255,255,255,0.03)',
                padding: '1rem',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.05)'
              }}>
                <div style={{ position: 'relative' }}>
                  <ModelImage modelCode={editCode} style={{ width: 100, height: 130, borderRadius: 10, objectFit: 'cover', border: '2px solid var(--gold-dim)' }} />
                  <div style={{ position: 'absolute', bottom: -10, left: '50%', transform: 'translateX(-50%)', background: 'var(--gold)', color: '#000', padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 800 }}>PREVIEW</div>
                </div>
                
                <div className="flex-col gap-3">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: 11, opacity: 0.7 }}>MODEL CODE</label>
                    <input className="input" value={code} onChange={e => setCode(e.target.value.toUpperCase())} required style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--gold)' }} maxLength={10} />
                  </div>
                  
                  <div className="flex gap-2">
                    <input type="file" hidden ref={imgRef} multiple accept="image/*" onChange={handleImageUpload} />
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => imgRef.current.click()} style={{ background: 'var(--s2)', flex: 1, height: 40 }}>
                      <ImageIcon size={14} /> + Image ({images.length})
                    </button>
                    
                    <input type="file" hidden ref={videoRef} multiple accept="video/*" onChange={handleVideoUpload} />
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => videoRef.current.click()} style={{ background: 'var(--s2)', flex: 1, height: 40 }}>
                      <Video size={14} /> + Video ({videos.length})
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="form-group">
                  <label className="form-label">Purchase ($)</label>
                  <input type="number" step="0.01" className="input" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)} required style={{ textAlign: 'center', fontWeight: 700 }} />
                </div>
                <div className="form-group">
                  <label className="form-label">Wholesale ($)</label>
                  <input type="number" step="0.01" className="input" value={wsPrice} onChange={e => setWsPrice(e.target.value)} required style={{ textAlign: 'center', fontWeight: 700, color: 'var(--success)' }} />
                </div>
                <div className="form-group">
                  <label className="form-label">Retail ($)</label>
                  <input type="number" step="0.01" className="input" value={rtPrice} onChange={e => setRtPrice(e.target.value)} required style={{ textAlign: 'center', fontWeight: 700, color: 'var(--gold)' }} />
                </div>
                <div className="form-group">
                  <label className="form-label">Discount ($)</label>
                  <input type="number" step="0.01" className="input" value={discountPrice} onChange={e => setDiscountPrice(e.target.value)} style={{ textAlign: 'center', fontWeight: 700, color: 'var(--danger)' }} />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{t('Size')}</label>
                  <select className="input" value={size} onChange={e => setSize(e.target.value)}>
                    {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Manufacturer</label>
                  <select className="input" value={modelFactoryId} onChange={e => setModelFactoryId(e.target.value)}>
                    <option value="">Select...</option>
                    {factories.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="modal-footer" style={{ padding: 0, marginTop: '1rem' }}>
                <button type="submit" className="btn btn-primary w-full" style={{ height: 50, fontSize: '1.1rem' }}>{editCode ? 'UPDATE MODEL' : 'SAVE NEW MODEL'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {previewImage && (
        <div className="modal-backdrop" onClick={() => setPreviewImage(null)} style={{ zIndex: 1000 }}>
          <img src={previewImage} style={{ maxWidth: '90vw', maxHeight: '80vh', borderRadius: 8 }} alt="" />
        </div>
      )}
    </div>
  );
}
