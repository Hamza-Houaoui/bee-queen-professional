import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { toast } from 'react-toastify';
import { Plus, Trash2, Palette, X, Package, Edit2 } from 'lucide-react';

const PRESETS = [
  '#000000', '#FFFFFF', '#D4A017', '#FFD700', // Black, White, Gold
  '#800080', '#9B59B6', // Purple (perpuli)
  '#008000', '#2ECC71', // Green
  '#FFA500', '#E67E22', // Orange
  '#0000FF', '#3498DB', // Blue
  '#800020', '#722F37', // Bordeaux (bordo)
  '#C0C0C0', '#BDC3C7', // Silver
  '#87CEEB', '#00BFFF', // Skyblue
  '#008080', '#1ABC9C', // Teal (for 't')
  '#E63946', '#1D3557', '#C19A6B', '#F5F0E8', // Original presets
];

export default function Colors() {
  const [modal, setModal] = useState(false);
  const [name, setName] = useState('');
  const [hex, setHex] = useState('#D4A017');
  const [editingId, setEditingId] = useState(null);
  const [selectedColor, setSelectedColor] = useState(null);

  const colors = useLiveQuery(() => db.colors.toArray());

  const colorModels = useLiveQuery(async () => {
    if (!selectedColor) return [];
    const stock = await db.stock.where('color').equals(selectedColor.name).toArray();
    const codes = [...new Set(stock.map(s => s.modelCode))];
    return Promise.all(codes.map(code => db.models.get(code)));
  }, [selectedColor]);

  const handleSave = async e => {
    e.preventDefault();
    if (!name.trim()) { toast.error('Name required'); return; }
    
    const data = { name: name.trim(), hex };
    if (editingId) {
      data.id = editingId;
      await db.colors.put(data);
      toast.success('Color updated');
    } else {
      await db.colors.add(data);
      toast.success('Color added');
    }
    
    setModal(false); setName(''); setHex('#D4A017'); setEditingId(null);
  };

  const openAdd = () => {
    setEditingId(null); setName(''); setHex('#D4A017'); setModal(true);
  };

  const openEdit = (c, e) => {
    e.stopPropagation();
    setEditingId(c.id);
    setName(c.name);
    setHex(c.hex);
    setModal(true);
  };

  return (
    <div className="animate-in">
      <div className="page-header">
        <h2>Colors</h2>
        <button className="btn btn-primary" onClick={openAdd}>
          <Plus size={16} /> Add Color
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '.75rem' }}>
        {colors?.map(c => (
          <div key={c.id} className="card card-sm card-hover" 
            onClick={() => setSelectedColor(c)}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.5rem', position: 'relative' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: c.hex, border: '3px solid rgba(255,255,255,.15)', boxShadow: '0 4px 12px rgba(0,0,0,.4)' }} />
            <span style={{ fontWeight: 600, fontSize: 'var(--fs-sm)' }}>{c.name}</span>
            <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: '4px' }}>
              <button className="btn btn-ghost btn-icon" style={{ background: 'var(--s3)', padding: '.3rem', color: 'var(--gold)' }}
                onClick={(e) => openEdit(c, e)}>
                <Edit2 size={12} />
              </button>
              <button className="btn btn-danger btn-icon" style={{ padding: '.3rem' }}
                onClick={async (e) => { e.stopPropagation(); if (confirm('Delete color?')) { await db.colors.delete(c.id); toast.success('Deleted'); } }}>
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
        {colors?.length === 0 && (
          <div className="empty-state" style={{ gridColumn: '1/-1' }}><Palette size={40} /><p>No colors yet</p></div>
        )}
      </div>

      {selectedColor && (
        <div className="modal-backdrop" onClick={() => setSelectedColor(null)}>
          <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                <span className="color-dot" style={{ background: selectedColor.hex, width: 16, height: 16 }} />
                Models with {selectedColor.name}
              </span>
              <button className="btn btn-ghost btn-icon" onClick={() => setSelectedColor(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="grid-auto" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
                {colorModels?.map(m => (
                  <div key={m.code} className="card card-sm flex-col gap-2 items-center">
                    {m.coverImage ? (
                      <img src={m.coverImage} style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', borderRadius: 'var(--r-sm)' }} />
                    ) : (
                      <div style={{ width: '100%', aspectRatio: '3/4', background: 'var(--s2)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--r-sm)' }}>
                        <Package size={24} color="var(--muted)" />
                      </div>
                    )}
                    <div style={{ fontWeight: 700, color: 'var(--gold)' }}>{m.code}</div>
                    <div className="text-xs text-muted">{m.size}</div>
                  </div>
                ))}
                {colorModels?.length === 0 && <p className="text-center w-full py-4 text-muted">No models in stock with this color</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{editingId ? 'Edit Color' : 'Add Color'}</span>
              <button className="btn btn-ghost btn-icon" onClick={() => setModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body">
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '.5rem' }}>
                  <div style={{ width: 72, height: 72, borderRadius: '50%', background: hex, border: '4px solid rgba(255,255,255,.15)', boxShadow: '0 4px 20px rgba(0,0,0,.5)' }} />
                </div>
                <div className="form-group">
                  <label className="form-label">Color Name</label>
                  <input className="input" value={name} onChange={e => setName(e.target.value)} required autoFocus placeholder="e.g. Navy Blue" />
                </div>
                <div className="form-group">
                  <label className="form-label">Hex Value</label>
                  <div className="flex gap-2">
                    <input type="color" value={hex} onChange={e => setHex(e.target.value)}
                      style={{ width: 48, height: 44, borderRadius: 'var(--r-sm)', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
                    <input className="input" value={hex} onChange={e => setHex(e.target.value)} placeholder="#000000" style={{ fontFamily: 'monospace' }} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Quick Presets</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
                    {PRESETS.map(p => (
                      <button key={p} type="button"
                        onClick={() => setHex(p)}
                        style={{
                          width: 32, height: 32, borderRadius: '50%', background: p, border: 'none', cursor: 'pointer',
                          outline: hex === p ? '2px solid var(--gold)' : '2px solid transparent',
                          outlineOffset: 2,
                        }} />
                    ))}
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn" onClick={() => setModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editingId ? 'Save Changes' : 'Add Color'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
