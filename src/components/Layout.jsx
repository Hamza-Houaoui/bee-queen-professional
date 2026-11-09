import React, { useEffect, useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useTranslation } from 'react-i18next';
import {
  Film, ShoppingBag, Archive, Users, ClipboardList, Search,
  Package, Palette, Settings, Menu, X, ShoppingCart, BarChart2, Warehouse, RefreshCw, CalendarClock
} from 'lucide-react';
import { SyncEngine } from '../SyncEngine';
import { toast } from 'react-toastify';

const PRIMARY_NAV = [
  { to: '/',          label: 'Home',      icon: Search },
  { to: '/album',     label: 'Album',     icon: Film },
  { to: '/order',     label: 'New Order', icon: ShoppingBag },
  { to: '/inventory', label: 'Inventory', icon: Archive },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/history',   label: 'History',   icon: ClipboardList },
  { to: '/pre-order', label: 'Pre Order', icon: CalendarClock },
  { to: '/counts',    label: 'Counts',    icon: BarChart2 },
];

const MORE_NAV = [
  { to: '/models',   label: 'Models',   icon: Package },
  { to: '/factory',  label: 'Factory manager', icon: Warehouse },
  { to: '/colors',   label: 'Colors',   icon: Palette },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Layout() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [railExpanded, setRailExpanded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState('');

  const settings  = useLiveQuery(() => db.settings.get(1));
  const cartCount = useLiveQuery(() => db.cart.count());

  useEffect(() => {
    if (settings?.activeLanguage && settings.activeLanguage !== i18n.language) {
      i18n.changeLanguage(settings.activeLanguage);
    }
  }, [settings?.activeLanguage]);

  useEffect(() => {
    document.documentElement.dir  = i18n.language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  const allNav = [...PRIMARY_NAV, ...MORE_NAV];
  const currentNav = allNav.find(n =>
    n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to)
  );

  const isActive = (to) =>
    to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);

  const handleManualSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const time = await SyncEngine.performFullSync();
      if (time) setLastSync(time);
      toast.success(t('Data synced successfully'));
    } catch (e) {
      toast.error(t('Sync failed'));
    } finally {
      setTimeout(() => setSyncing(false), 800);
    }
  };

  return (
    <div className="shell">
      {/* Header */}
      <header className="app-header">
        <div className="header-logo">
          <img src="/logo.png" alt="Bee Queen Logo" style={{ height: 28, width: 'auto', objectFit: 'contain' }} />
          <span>Bee Queen</span>
        </div>
        <div className="header-title">{currentNav ? t(currentNav.label) : ''}</div>
        <div className="header-actions">
          {cartCount > 0 && (
            <button className="btn btn-ghost btn-icon" style={{ position: 'relative' }}
              onClick={() => navigate('/order')}>
              <ShoppingCart size={20} />
              <span className="bn-badge">{cartCount}</span>
            </button>
          )}
          
          {/* Sync Button */}
          <div className="flex-col items-center" style={{ gap: 0 }}>
            <button 
              className={`btn btn-ghost btn-icon ${syncing ? 'animate-spin' : ''}`} 
              onClick={handleManualSync}
              disabled={syncing}
              style={{ color: syncing ? 'var(--gold)' : 'inherit' }}
              title={t('Sync Now')}
            >
              <RefreshCw size={20} />
            </button>
            {lastSync && <span style={{ fontSize: 8, color: 'var(--muted)', marginTop: -8 }}>{lastSync}</span>}
          </div>
          {/* More drawer trigger (mobile) */}
          <button className="btn btn-ghost btn-icon" onClick={() => setDrawerOpen(o => !o)}
            aria-label="More">
            {drawerOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      <div className="shell-body">
        {/* Side Rail (tablet+) */}
        <aside className="side-rail expanded">
          {allNav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'}
              className={`sr-item ${isActive(to) ? 'active' : ''}`}>
              <Icon size={20} style={{ flexShrink: 0 }} />
              <span className="sr-label">{t(label)}</span>
            </NavLink>
          ))}
        </aside>

        {/* Main */}
        <main className="app-main">
          <Outlet />
        </main>
      </div>

      {/* Bottom Nav (mobile) */}
      <nav className="bottom-nav">
        {PRIMARY_NAV.map(({ to, label, icon: Icon }) => (
          <button key={to} className={`bn-item ${isActive(to) ? 'active' : ''}`}
            onClick={() => navigate(to)}>
            <div className="bn-icon">
              <Icon size={22} />
              {to === '/order' && cartCount > 0 && (
                <span className="bn-badge">{cartCount}</span>
              )}
            </div>
            <span className="bn-label">{t(label)}</span>
          </button>
        ))}
      </nav>

      {/* Drawer overlay (mobile More items) */}
      {drawerOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)'
        }} onClick={() => setDrawerOpen(false)}>
          <div style={{
            position: 'absolute', top: 'var(--nav-h)', right: 0,
            background: 'var(--s1)', borderRadius: '0 0 0 var(--r-xl)',
            padding: '.75rem', display: 'flex', flexDirection: 'column',
            gap: '.25rem', minWidth: 200, border: '1px solid rgba(255,255,255,.07)'
          }} onClick={e => e.stopPropagation()}>
            {MORE_NAV.map(({ to, label, icon: Icon }) => (
              <button key={to} className={`sr-item ${isActive(to) ? 'active' : ''}`}
                onClick={() => { navigate(to); setDrawerOpen(false); }}>
                <Icon size={18} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>{t(label)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
