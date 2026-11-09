import React, { useRef, useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useTranslation } from 'react-i18next';
import { Package, ChevronDown, ShoppingCart, X, Plus, Minus } from 'lucide-react';
import { toast } from 'react-toastify';

export default function Album() {
  const { t } = useTranslation();
  const containerRef = useRef();
  const [cartModal, setCartModal] = useState(false);
  const [selectedModel, setSelectedModel] = useState(null);
  const [selectedColor, setSelectedColor] = useState('');
  const [qty, setQty] = useState(4);
  
  const models = useLiveQuery(async () => {
    const all = await db.models.toArray();
    // Flatten all videos into a list of slides
    const slides = [];
    all.forEach(m => {
      const vids = m.videos || (m.video ? [m.video] : []);
      vids.forEach(v => {
        slides.push({ ...m, videoUrl: v });
      });
    });
    return slides;
  });

  const stock = useLiveQuery(() => db.stock.toArray());
  const colorsList = useLiveQuery(() => db.colors.toArray());

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const video = entry.target.querySelector('video');
          if (!video) return;
          if (entry.isIntersecting) {
            video.play().catch(() => {});
          } else {
            video.pause();
          }
        });
      },
      { threshold: 0.8 }
    );

    const slides = containerRef.current?.querySelectorAll('.album-slide');
    slides?.forEach((slide) => observer.observe(slide));

    return () => slides?.forEach((slide) => observer.unobserve(slide));
  }, [models]);

  const getStockForModel = (code) => {
    return stock?.filter(s => s.modelCode === code) || [];
  };

  const openCartModal = (m) => {
    setSelectedModel(m);
    const mStock = getStockForModel(m.code);
    if (mStock.length > 0) setSelectedColor(mStock[0].color);
    setQty(1);
    setCartModal(true);
  };

  const addToCart = async () => {
    if (!selectedColor) { toast.error('Please select a color'); return; }
    const mStock = getStockForModel(selectedModel.code).find(s => s.color === selectedColor);
    if (!mStock || mStock.quantity < qty) { toast.error('Insufficient stock'); return; }

    const item = {
      modelCode: selectedModel.code,
      color: selectedColor,
      size: selectedModel.size,
      quantity: qty,
      discount: 0
    };

    try {
      const existing = await db.cart.where({ modelCode: item.modelCode, color: item.color }).first();
      if (existing) {
        await db.cart.update(existing.id, { quantity: existing.quantity + item.quantity });
      } else {
        await db.cart.add(item);
      }
      toast.success('Added to New Order');
      setCartModal(false);
    } catch (e) {
      toast.error('Error adding to cart');
    }
  };

  return (
    <div className="album-container" ref={containerRef}>
      {models?.length > 0 ? models.map((m, idx) => (
        <div key={`${m.code}-${idx}`} className="album-slide">
          <video 
            src={m.videoUrl} 
            loop 
            muted 
            playsInline 
            className="album-video"
            onClick={(e) => {
              if (e.target.paused) e.target.play();
              else e.target.pause();
            }}
          />
          
          <div className="album-overlay">
            <div className="album-info-card">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="text-gold font-bold" style={{ fontSize: '0.6rem', opacity: 0.8 }}>#{m.code}</h3>
                  <p style={{ color: 'var(--gold)', fontWeight: 'bold', fontSize: '1rem' }}>Size: {m.size}</p>
                </div>
                <div className="text-right">
                  <div className="text-success font-bold" style={{ fontSize: '1.2rem' }}>${m.wholesalePrice}</div>
                  <button className="btn btn-primary btn-sm mt-1" onClick={() => openCartModal(m)} style={{ padding: '0.2rem 0.5rem' }}>
                    <ShoppingCart size={14} /> Add to Cart
                  </button>
                </div>
              </div>
              
              <div className="divider" style={{ margin: '.5rem 0', opacity: 0.1 }} />
              
              <div className="flex flex-wrap gap-1">
                {getStockForModel(m.code).map(s => {
                  const colorDef = colorsList?.find(c => c.name === s.color);
                  return (
                    <div key={s.id} className="flex items-center gap-1 bg-s3 px-2 py-1 rounded-full border border-white-05" style={{ opacity: s.quantity > 0 ? 1 : 0.5 }}>
                      <span className="color-dot" style={{ width: 6, height: 6, background: colorDef?.hex }} />
                      <span className="text-xs font-semibold" style={{ fontSize: '9px' }}>{s.color}: {s.quantity}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="album-nav-hint">
             {idx < models.length - 1 && <ChevronDown className="animate-bounce" size={24} />}
             {idx === models.length - 1 && <p className="text-xs text-muted">End of Album</p>}
          </div>
        </div>
      )) : (
        <div className="empty-state">
          <Package size={48} />
          <p>No videos available in Models</p>
        </div>
      )}

      {cartModal && (
        <div className="modal-backdrop" onClick={() => setCartModal(false)} style={{ zIndex: 1100 }}>
          <div className="modal" style={{ maxWidth: 350 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Add to Order</span>
              <button className="btn btn-ghost btn-icon" onClick={() => setCartModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Color</label>
                <div className="flex flex-wrap gap-2">
                  {getStockForModel(selectedModel.code).map(s => {
                    const colorDef = colorsList?.find(c => c.name === s.color);
                    return (
                      <button 
                        key={s.id} 
                        className={`btn ${selectedColor === s.color ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ fontSize: 12, padding: '4px 10px', borderRadius: 'var(--r-full)' }}
                        onClick={() => setSelectedColor(s.color)}
                        disabled={s.quantity <= 0}
                      >
                        <span className="color-dot" style={{ background: colorDef?.hex, width: 10, height: 10 }} /> {s.color} ({s.quantity})
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="form-group mt-4">
                <label className="form-label">Quantity</label>
                <div className="flex items-center gap-4">
                  <button className="btn btn-ghost btn-circle" onClick={() => setQty(Math.max(1, qty - 1))}><Minus size={16} /></button>
                  <span style={{ fontSize: '1.2rem', fontWeight: 800 }}>{qty}</span>
                  <button className="btn btn-ghost btn-circle" onClick={() => setQty(qty + 1)}><Plus size={16} /></button>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary w-full" onClick={addToCart}>Confirm & Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
