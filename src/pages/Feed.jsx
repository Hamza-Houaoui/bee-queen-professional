import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { ShoppingCart, Play, Pause, Heart, X, Plus, Minus } from 'lucide-react';

export default function Feed() {
  const { t } = useTranslation();
  const containerRef = useRef(null);
  const videoRefs = useRef({});
  const [playing, setPlaying] = useState({});
  const [cartModal, setCartModal] = useState(null); // { model }
  const [selColor, setSelColor] = useState('');
  const [selQty, setSelQty] = useState(1);

  const colors = useLiveQuery(() => db.colors.toArray());
  const models = useLiveQuery(async () => {
    const all = await db.models.toArray();
    return all.filter(m => m.video).reverse();
  });

  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const vid = entry.target;
        const code = vid.dataset.code;
        if (entry.isIntersecting) {
          vid.play().catch(() => {});
          setPlaying(p => ({ ...p, [code]: true }));
        } else {
          vid.pause();
          setPlaying(p => ({ ...p, [code]: false }));
        }
      });
    }, { threshold: 0.6 });
    Object.values(videoRefs.current).forEach(v => v && obs.observe(v));
    return () => obs.disconnect();
  }, [models]);

  const togglePlay = code => {
    const vid = videoRefs.current[code];
    if (!vid) return;
    if (vid.paused) { vid.play(); setPlaying(p => ({ ...p, [code]: true })); }
    else { vid.pause(); setPlaying(p => ({ ...p, [code]: false })); }
  };

  const openCart = (model) => {
    setCartModal(model);
    setSelColor('');
    setSelQty(1);
  };

  const handleAddToCart = async () => {
    if (!selColor) { toast.error('Select a color'); return; }
    const existing = await db.cart.where({ modelCode: cartModal.code, color: selColor }).first();
    if (existing) {
      await db.cart.update(existing.id, { quantity: existing.quantity + selQty });
    } else {
      await db.cart.add({ modelCode: cartModal.code, color: selColor, quantity: selQty, discount: 0 });
    }
    toast.success('Added to cart ✓');
    setCartModal(null);
  };

  if (!models) return <div className="empty-state"><p>{t('Loading...')}</p></div>;

  if (models.length === 0) return (
    <div className="empty-state" style={{ height: '70dvh' }}>
      <Play size={52} />
      <p style={{ fontSize: 'var(--fs-lg)', fontWeight: 700 }}>No videos yet</p>
      <p className="text-sm">Add models with videos in the Models page</p>
    </div>
  );

  return (
    <>
      <div ref={containerRef} style={{
        position: 'fixed', inset: 0, top: 'var(--nav-h)',
        overflowY: 'auto', scrollSnapType: 'y mandatory',
        background: '#000', zIndex: 1,
      }}>
        {models.map(model => (
          <div key={model.code} style={{
            height: 'calc(100dvh - var(--nav-h))',
            scrollSnapAlign: 'start', position: 'relative',
            display: 'flex', alignItems: 'center', background: '#000',
          }}>
            <video
              ref={el => videoRefs.current[model.code] = el}
              src={model.video}
              data-code={model.code}
              loop playsInline muted
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onClick={() => togglePlay(model.code)}
            />
            {!playing[model.code] && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,.3)', pointerEvents: 'none',
              }}>
                <div style={{
                  width: 64, height: 64, borderRadius: '50%',
                  background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(8px)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '2px solid rgba(255,255,255,.2)',
                }}>
                  <Play size={28} color="#fff" style={{ marginLeft: 4 }} />
                </div>
              </div>
            )}
            {/* Overlay info */}
            <div style={{
              position: 'absolute', bottom: 'calc(var(--bottom-nav-h) + 1rem)',
              left: 0, right: 0, padding: '2rem 1rem 1rem',
              background: 'linear-gradient(transparent, rgba(0,0,0,.85))',
              display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
              gap: '1rem',
            }}>
              {/* Left info */}
              <div style={{ flex: 1 }}>
                <div className="flex gap-2 mb-2 flex-wrap">
                  <span style={{
                    background: 'var(--gold)', color: '#000',
                    fontWeight: 800, fontSize: '.85rem',
                    padding: '.2rem .7rem', borderRadius: 'var(--r-full)',
                  }}>#{model.code}</span>
                  {model.size && (
                    <span style={{
                      background: 'rgba(255,255,255,.15)', color: '#fff',
                      backdropFilter: 'blur(6px)',
                      fontSize: '.8rem', fontWeight: 600,
                      padding: '.2rem .65rem', borderRadius: 'var(--r-full)',
                    }}>{model.size}</span>
                  )}
                </div>
                <div style={{ fontSize: 'clamp(1.4rem,5vw,2rem)', fontWeight: 800, color: 'var(--gold)', lineHeight: 1 }}>
                  ${model.wholesalePrice || 0}
                </div>
                <div style={{ fontSize: '.8rem', color: 'rgba(255,255,255,.6)', marginTop: '.2rem' }}>
                  Wholesale price
                </div>
              </div>
              {/* Right actions */}
              <div className="flex-col items-center gap-3">
                <button className="flex-col items-center gap-1 flex btn-ghost"
                  style={{ background: 'rgba(255,255,255,.1)', borderRadius: 'var(--r-lg)', padding: '.75rem', border: 'none', cursor: 'pointer' }}>
                  <Heart size={24} color="#fff" />
                  <span style={{ color: '#fff', fontSize: '.65rem', fontWeight: 600 }}>Like</span>
                </button>
                <button
                  onClick={() => openCart(model)}
                  style={{
                    background: 'var(--gold)', borderRadius: 'var(--r-lg)',
                    padding: '.75rem', border: 'none', cursor: 'pointer',
                    boxShadow: '0 0 20px rgba(212,160,23,.5)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.2rem',
                  }}>
                  <ShoppingCart size={24} color="#000" />
                  <span style={{ color: '#000', fontSize: '.65rem', fontWeight: 700 }}>Add</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add to Cart Modal */}
      {cartModal && (
        <div className="modal-backdrop" style={{ zIndex: 600 }} onClick={() => setCartModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Add #{cartModal.code} to Cart</span>
              <button className="btn btn-ghost btn-icon" onClick={() => setCartModal(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Color</label>
                <div className="flex gap-2 flex-wrap">
                  {colors?.map(c => (
                    <button key={c.id}
                      onClick={() => setSelColor(c.name)}
                      style={{
                        padding: '.45rem .9rem', borderRadius: 'var(--r-full)',
                        border: selColor === c.name ? '2px solid var(--gold)' : '2px solid rgba(255,255,255,.1)',
                        background: selColor === c.name ? 'var(--gold-dim)' : 'var(--s2)',
                        color: selColor === c.name ? 'var(--gold)' : 'var(--text)',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '.4rem',
                        fontWeight: 600, fontSize: 'var(--fs-xs)',
                      }}>
                      <span className="color-dot" style={{ background: c.hex }} />
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Quantity</label>
                <div className="flex items-center gap-3">
                  <button className="btn btn-ghost btn-icon-sq" onClick={() => setSelQty(q => Math.max(1, q - 1))}><Minus size={16} /></button>
                  <span style={{ fontSize: 'var(--fs-xl)', fontWeight: 700, minWidth: 40, textAlign: 'center' }}>{selQty}</span>
                  <button className="btn btn-ghost btn-icon-sq" onClick={() => setSelQty(q => q + 1)}><Plus size={16} /></button>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setCartModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddToCart}>
                <ShoppingCart size={16} /> Add to Cart
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
