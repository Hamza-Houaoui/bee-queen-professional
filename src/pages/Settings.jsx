import React, { useState, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { 
  Settings as SettingsIcon, Image as ImageIcon, Save, Download, Upload, FolderSync, Bug, 
  Plus, Trash2, Warehouse, Send, FileSpreadsheet
} from 'lucide-react';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { SyncEngine } from '../SyncEngine';
import { getLogs, clearLogs } from '../utils/logger';
import { performTelegramBackup } from '../utils/telegram';
import * as XLSX from 'xlsx';

export default function Settings() {
  const { t, i18n } = useTranslation();
  const settings = useLiveQuery(() => db.settings.get(1));
  const logoRef = useRef();

  const [storeName, setStoreName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [logo, setLogo] = useState('');
  const [lang, setLang] = useState('ar');
  const [theme, setTheme] = useState('dark');
  const [syncFolder, setSyncFolder] = useState('');
  const [resedaLink, setResedaLink] = useState('');
  const [mediaFolder, setMediaFolder] = useState('Beequeensyngthing/media');
  const [tgBotToken, setTgBotToken] = useState('');
  const [tgChatId, setTgChatId] = useState('');
  const [tgReportChatId, setTgReportChatId] = useState('');
  const [tgDepositChatId, setTgDepositChatId] = useState('');
  const [tgInvoiceChatId, setTgInvoiceChatId] = useState('');
  const [tgSparisChatId, setTgSparisChatId] = useState('');
  const [linkMessage, setLinkMessage] = useState('');
  const [deviceId, setDeviceId] = useState(1);
  const directFileInputRef = useRef();
  const restoreFileInputRef = useRef();
  
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [currentPath, setCurrentPath] = useState('');
  const [dirList, setDirList] = useState([]);

  // Load settings into state
  React.useEffect(() => {
    if (settings) {
      setStoreName(settings.storeName || '');
      setPhone(settings.phone || '');
      setAddress(settings.storeAddress || '');
      setLogo(settings.logo || '');
      setLang(settings.activeLanguage || 'ar');
      setTheme(settings.theme || 'dark');
      setSyncFolder(settings.syncFolder || '');
      setResedaLink(settings.resedaLink || '');
      setMediaFolder(settings.mediaFolder || '');
      setTgBotToken(settings.tgBotToken || '');
      setTgChatId(settings.tgChatId || '');
      setTgReportChatId(settings.tgReportChatId || '');
      setTgDepositChatId(settings.tgDepositChatId || '');
      setTgInvoiceChatId(settings.tgInvoiceChatId || '');
      setTgSparisChatId(settings.tgSparisChatId || '');
      setLinkMessage(settings.linkMessage || '');
      setDeviceId(settings.deviceId || 1);
    }
  }, [settings]);

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setLogo(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    await db.settings.put({
      id: 1,
      storeName,
      phone,
      storeAddress: address,
      logo,
      activeLanguage: lang,
      theme,
      syncFolder,
      resedaLink,
      mediaFolder,
      tgBotToken,
      tgChatId,
      tgReportChatId,
      tgDepositChatId,
      tgInvoiceChatId,
      tgSparisChatId,
      linkMessage,
      deviceId: Number(deviceId),
    });
    i18n.changeLanguage(lang);
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    toast.success('Settings saved');
  };

  const handleExport = async () => {
    try {
      await SyncEngine.exportFullBackup(syncFolder);
      toast.success('Backup exported successfully');
    } catch (e) {
      console.error(e);
      toast.error('Export failed: ' + e.message);
    }
  };

  const handleImport = async () => {
    if (!confirm('Importing will overwrite current data. Continue?')) return;
    try {
      await SyncEngine.importFromBackup(syncFolder);
      toast.success('Backup imported successfully');
    } catch (e) {
      console.error(e);
      toast.error('Import failed: ' + e.message);
    }
  };

  const handleSyncExport = async () => {
    try {
      await SyncEngine.saveForSync();
      toast.success('Sync data saved to folder');
    } catch (e) {
      console.error(e);
      toast.error('Sync export failed: ' + e.message);
    }
  };

  const handleSyncImport = async () => {
    if (!confirm('This will overwrite current data with sync file. Continue?')) return;
    try {
      await SyncEngine.loadFromSync();
      toast.success('Sync data imported successfully');
      window.location.reload();
    } catch (e) {
      console.error(e);
      toast.error('Sync import failed: ' + e.message);
    }
  };

  const handleFullSync = async () => {
    try {
      await SyncEngine.performFullSync();
      toast.success('System pushed to sync folder successfully');
    } catch (e) {
      console.error(e);
      toast.error('Full sync failed: ' + e.message);
    }
  };

  const handleCleanDB = async () => {
    if (!confirm('This will remove all internal media from the DB to fix crashes. Your filenames in Syncthing will be preserved. Proceed?')) return;
    try {
      const count = await SyncEngine.cleanOldMediaFromDB();
      toast.success(`Cleanup complete! Removed media from ${count} models. Database is now lean.`);
    } catch (err) {
      toast.error('Cleanup failed: ' + err.message);
    }
  };

  const handleExportLogs = async () => {
    const logs = getLogs();
    if (Capacitor.isNativePlatform()) {
      try {
        const path = `BeeQueenPro/logs/logcat_${Date.now()}.txt`;
        const res = await Filesystem.writeFile({
          path,
          data: logs,
          directory: Directory.Documents,
          recursive: true,
          encoding: 'utf8'
        });
        await Share.share({ title: 'System Logs', text: 'Here is the app logcat:', url: res.uri, dialogTitle: 'Share Logcat' });
      } catch (err) {
        toast.error('Failed to export logs: ' + err.message);
      }
    } else {
      navigator.clipboard.writeText(logs);
      toast.success('Logs copied to clipboard');
    }
  };

  const handleTelegramBackup = async () => {
    if (!tgBotToken || !tgReportChatId) {
      toast.warning('Please configure Telegram Token and Reports Chat ID first');
      return;
    }
    toast.info('Starting Telegram Backup...');
    try {
      const res = await performTelegramBackup();
      if (res?.ok) {
        toast.success('Backup sent to Telegram successfully');
      } else {
        toast.error('Telegram Error: ' + (res?.description || 'Unknown error'));
      }
    } catch (err) {
      toast.error('Backup failed: ' + err.message);
    }
  };

  const handleDirectImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

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
              await db.models.add({ code, wholesalePrice: 0, retailPrice: 0, purchasePrice: rowPrice || 0, size: '' });
            } else if (rowPrice > 0) {
              await db.models.update(code, { purchasePrice: rowPrice });
            }
            
            const colorExists = await db.colors.where({ name: colorName }).first();
            if (!colorExists) {
              await db.colors.add({ name: colorName, hex: hex.startsWith('#') ? hex : (hex ? `#${hex}` : '#888888') });
            }
            
            const existing = await db.stock.where({ modelCode: code, color: colorName }).first();
            if (existing) {
              await db.stock.update(existing.id, { quantity: existing.quantity + q });
            } else {
              await db.stock.add({ modelCode: code, color: colorName, quantity: q });
            }
            imported++;
          } else {
            errors++;
          }
        }
        toast.success(`Direct Import Success: ${imported} entries updated!`);
      } catch (err) {
        toast.error('Failed to parse Excel file');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = ''; 
  };
  
  const handleRestoreFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const blob = new Blob([evt.target.result], { type: 'application/json' });
        if (confirm('Importing this file will overwrite your current data. Continue?')) {
          await SyncEngine.importFromBlob(blob);
          toast.success('Backup restored successfully!');
          setTimeout(() => window.location.reload(), 1000);
        }
      } catch (err) {
        toast.error('Restore failed: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const browseFolder = async (path = '') => {
    if (!Capacitor.isNativePlatform()) {
      toast.error('Folder browsing only available on Mobile');
      return;
    }
    try {
      const res = await Filesystem.readdir({
        path,
        directory: Directory.Documents
      });
      setCurrentPath(path);
      setDirList(res.files.filter(f => f.type === 'directory'));
      setShowFolderPicker(true);
    } catch (err) {
      console.error(err);
      // Fallback for some Android systems where Documents might be restricted
      if (path === '') {
        try {
          const res = await Filesystem.readdir({ path: '', directory: Directory.External });
          setDirList(res.files.filter(f => f.type === 'directory'));
          setShowFolderPicker(true);
        } catch (e2) {
          toast.error('Cannot access device storage. Check app permissions.');
        }
      } else {
        browseFolder('');
      }
    }
  };

  const selectFolder = (path) => {
    setMediaFolder(path);
    setShowFolderPicker(false);
  };

  return (
    <div className="animate-in">
      <div className="page-header">
        <h2>{t('Settings')}</h2>
      </div>

      <form onSubmit={handleSave} style={{ display: 'grid', gap: '1rem', maxWidth: 800 }}>
        
        {/* Branding */}
        <div className="card">
          <h3 className="form-label mb-3" style={{ fontSize: 'var(--fs-sm)', color: 'var(--gold)' }}>{t('Brand Identity')}</h3>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">{t('Store Name')}</label>
              <input className="input" value={storeName} onChange={e => setStoreName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">{t('Store Phone')}</label>
              <input className="input" value={phone} onChange={e => setPhone(e.target.value)} required />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">{t('Store Address')}</label>
              <input className="input" value={address} onChange={e => setAddress(e.target.value)} />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">{t('Logo')} (For PDF)</label>
              <div className="flex gap-3 items-center">
                {logo ? (
                  <div style={{ position: 'relative' }}>
                    <img src={logo} style={{ height: 60, objectFit: 'contain', background: '#fff', padding: 4, borderRadius: 'var(--r-sm)' }} alt="Logo" />
                    <button type="button" className="btn btn-danger btn-icon" style={{ position: 'absolute', top: -8, right: -8, padding: 4 }} onClick={() => setLogo('')}>✕</button>
                  </div>
                ) : (
                  <div style={{ height: 60, width: 60, background: 'var(--s2)', borderRadius: 'var(--r-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ImageIcon size={24} color="var(--muted)" />
                  </div>
                )}
                <button type="button" className="btn btn-ghost" onClick={() => logoRef.current.click()}>Upload Logo</button>
                <input type="file" ref={logoRef} accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} />
              </div>
            </div>
          </div>
        </div>

        {/* Preferences */}
        <div className="card">
          <h3 className="form-label mb-3" style={{ fontSize: 'var(--fs-sm)', color: 'var(--gold)' }}>{t('Preferences')}</h3>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">{t('Language')}</label>
              <select className="input" value={lang} onChange={e => setLang(e.target.value)}>
                <option value="en">English</option>
                <option value="ar">العربية (Arabic)</option>
                <option value="tr">Türkçe (Turkish)</option>
                <option value="ru">Русский (Russian)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{t('Theme')}</label>
              <select className="input" value={theme} onChange={e => setTheme(e.target.value)}>
                <option value="dark">{t('Dark')}</option>
                <option value="light">{t('Light')}</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{t('Device ID')}</label>
              <input 
                className="input" 
                type="number" 
                value={deviceId} 
                onChange={e => setDeviceId(e.target.value)} 
                min="1" 
                max="9" 
              />
              <p className="text-xs text-muted mt-1">Unique number for each device (e.g., Phone=1, Tablet=2).</p>
            </div>
          </div>
          <div className="form-group mt-3">
            <label className="form-label">Reseda URL</label>
            <input className="input" type="url" value={resedaLink} onChange={e => setResedaLink(e.target.value)} placeholder="https://..." />
            <p className="text-xs text-muted mt-1">External link opened by the "Reseda" button in Inventory.</p>
          </div>
          <div className="form-group mt-3">
            <label className="form-label">Link Message</label>
            <input className="input" value={linkMessage} onChange={e => setLinkMessage(e.target.value)} placeholder="e.g. https://instagram.com/beequeen" />
            <p className="text-xs text-muted mt-1">This link will be appended to customer messages if "Message Link" is ON in New Order.</p>
          </div>
        </div>

        {/* Supplier Management */}
        <div className="card">
          <h3 className="form-label mb-3" style={{ fontSize: 'var(--fs-sm)', color: 'var(--gold)' }}>Suppliers / Factories</h3>
          <p className="text-xs text-muted mb-3">Manage the manufacturers you buy from. These will appear in the Factory Manager and Add to Stock.</p>
          
          <div className="space-y-2 mb-4">
            {(useLiveQuery(() => db.factories.toArray()) || []).map(f => (
              <div key={f.id} className="flex flex-col gap-2 p-3 bg-s2 rounded-lg border border-white-05">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Warehouse size={16} className="text-gold" />
                    <span className="font-bold text-sm">{f.name}</span>
                  </div>
                  <button type="button" className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--danger)' }} onClick={async () => {
                    if (confirm(`Delete ${f.name}? This won't delete past transactions.`)) {
                      await db.factories.delete(f.id);
                      toast.success('Supplier removed');
                    }
                  }}>
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="flex items-center gap-2 pl-7">
                  <span className="text-[10px] text-muted uppercase font-bold">Initial Debt ($):</span>
                  <input 
                    type="number" 
                    className="input py-1 text-xs" 
                    style={{ height: 28, width: 100 }} 
                    defaultValue={f.initialDebt || 0}
                    onBlur={async (e) => {
                      const val = parseFloat(e.target.value) || 0;
                      await db.factories.update(f.id, { initialDebt: val });
                      toast.info(`Updated initial debt for ${f.name}`);
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <input 
              id="new-factory-input"
              className="input col-span-1" 
              placeholder="Name..." 
            />
            <input 
              id="new-factory-debt"
              type="number"
              className="input col-span-1" 
              placeholder="Initial Debt ($)" 
            />
            <button type="button" className="btn btn-primary" onClick={async () => {
              const inputName = document.getElementById('new-factory-input');
              const inputDebt = document.getElementById('new-factory-debt');
              const name = inputName.value.trim();
              const debt = parseFloat(inputDebt.value) || 0;
              if (name) {
                await db.factories.add({ name, initialDebt: debt });
                inputName.value = '';
                inputDebt.value = '';
                toast.success('Supplier added');
              }
            }}>
              <Plus size={18} /> Add
            </button>
          </div>
        </div>

        {/* Telegram Automation */}
        <div className="card" style={{ background: 'rgba(0,136,204,0.05)' }}>
          <h3 className="form-label mb-3" style={{ fontSize: 'var(--fs-sm)', color: '#0088cc' }}>Telegram Automation & Backup</h3>
          <p className="text-xs text-muted mb-3">
            Configure a Telegram Bot to receive daily backups and background notifications for every invoice, payment, and deposit.
          </p>
          <div className="form-row form-row-2">
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Bot Token API</label>
              <input className="input" type="password" value={tgBotToken} onChange={e => setTgBotToken(e.target.value)} placeholder="e.g. 123456:ABC-DEF..." />
            </div>
            <div className="form-group">
              <label className="form-label">Reports Chat ID</label>
              <input className="input" value={tgReportChatId} onChange={e => setTgReportChatId(e.target.value)} placeholder="Reports channel" />
            </div>
            <div className="form-group">
              <label className="form-label">Deposit Chat ID</label>
              <input className="input" value={tgDepositChatId} onChange={e => setTgDepositChatId(e.target.value)} placeholder="Deposits channel" />
            </div>
            <div className="form-group">
              <label className="form-label">Invoice Chat ID</label>
              <input className="input" value={tgInvoiceChatId} onChange={e => setTgInvoiceChatId(e.target.value)} placeholder="Invoices channel" />
            </div>
            <div className="form-group">
              <label className="form-label">Sparis Chat ID</label>
              <input className="input" value={tgSparisChatId} onChange={e => setTgSparisChatId(e.target.value)} placeholder="Sparis channel" />
            </div>
          </div>
          <div className="mt-3 flex gap-3 flex-wrap">
            <button type="button" className="btn flex-1" style={{ background: '#0088cc', color: '#fff' }} onClick={handleTelegramBackup}>
              <Send size={16} /> Send Manual Backup to Telegram
            </button>
          </div>
        </div>

        {/* Sync & Backup */}
        <div className="card">
          <h3 className="form-label mb-3" style={{ fontSize: 'var(--fs-sm)', color: 'var(--gold)' }}>Database Backup & Sync</h3>
          
          <div className="form-group mb-3">
            <label className="form-label">{t('Sync Folder')} Path (Relative to Documents)</label>
            <input className="input" value={syncFolder} onChange={e => setSyncFolder(e.target.value)} placeholder="e.g. BeeQueen_Pro_Sync" />
            <p className="text-xs text-muted mt-1">Leave blank to use default "BeeQueen_Pro_Sync". Used for Syncthing exports.</p>
          </div>
          <div className="form-group mb-3">
            <label className="form-label">Auto Media Folder</label>
            <div className="flex gap-2">
              <input className="input flex-1" value={mediaFolder} readOnly placeholder="e.g. BeeQueensyngthing/media" />
              <button type="button" className="btn btn-ghost" onClick={() => browseFolder('')} style={{ background: 'var(--s2)' }}>
                <FolderSync size={16} /> {t('Pick')}
              </button>
            </div>
            <p className="text-xs text-muted mt-1">Selected: Documents/{mediaFolder || '(root)'}</p>
          </div>
          
          <div className="flex gap-3 flex-wrap mb-4">
            <button type="button" className="btn btn-primary flex-1" onClick={handleFullSync}>
              <FolderSync size={16} /> Perform Full Sync (Push)
            </button>
            <button type="button" className="btn btn-warning flex-1" onClick={handleSyncExport}>
              Sync to Folder
            </button>
            <button type="button" className="btn btn-warning btn-ghost flex-1" onClick={handleSyncImport}>
              Load from Folder
            </button>
          </div>

          <div className="divider" />

          <div className="flex gap-3 flex-wrap">
            <button type="button" className="btn flex-1" onClick={handleExport}>
              <Download size={16} /> {t('Export Backup')}
            </button>
            <button type="button" className="btn btn-danger flex-1" onClick={handleImport}>
              <Upload size={16} /> {t('Import Backup')}
            </button>
            <button type="button" className="btn btn-warning flex-1" style={{ background: 'var(--success)', color: '#fff' }} onClick={() => restoreFileInputRef.current.click()}>
              <Upload size={16} /> {t('Restore from JSON File')}
            </button>
            <input type="file" hidden ref={restoreFileInputRef} accept=".json" onChange={handleRestoreFile} />
            
            <button type="button" className="btn btn-warning flex-1" onClick={() => directFileInputRef.current.click()}>
              <FileSpreadsheet size={16} /> Import Excel (Direct Stock)
            </button>
            <input type="file" hidden ref={directFileInputRef} accept=".xlsx, .xls, .csv" onChange={handleDirectImport} />
          </div>
        </div>

        {/* Debug / Developer */}
        <div className="card" style={{ borderColor: 'var(--danger)' }}>
          <h3 className="form-label mb-3" style={{ fontSize: 'var(--fs-sm)', color: 'var(--danger)' }}>Developer / Advanced Options</h3>
          <p className="text-xs text-muted mb-3">Tools for troubleshooting and maintaining database integrity.</p>
          <div className="flex gap-3 flex-wrap">
            <button type="button" className="btn btn-warning flex-1" onClick={handleExportLogs}>
              <Bug size={16} /> Export Logcat
            </button>
            <button type="button" className="btn btn-danger flex-1" onClick={handleCleanDB}>
              <Trash2 size={16} /> Fix & Clean Database (Remove Internal Media)
            </button>
          </div>
        </div>

        <button type="submit" className="btn btn-primary" style={{ justifySelf: 'start', padding: '1rem 3rem' }}>
          <Save size={18} /> {t('Save')}
        </button>
      </form>

      {showFolderPicker && (
        <div className="modal-backdrop" onClick={() => setShowFolderPicker(false)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Select Folder</span>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowFolderPicker(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              <div className="flex-col gap-1">
                <p className="text-xs text-muted mb-2">Current: Documents/{currentPath || '(root)'}</p>
                {currentPath && (
                  <button className="btn btn-ghost w-full" style={{ justifyContent: 'flex-start' }} onClick={() => browseFolder(currentPath.split('/').slice(0, -1).join('/'))}>
                    📁 .. (Go Back)
                  </button>
                )}
                {dirList.map(d => (
                  <button key={d.name} className="btn btn-ghost w-full" style={{ justifyContent: 'flex-start' }} onClick={() => browseFolder(currentPath ? `${currentPath}/${d.name}` : d.name)}>
                    📁 {d.name}
                  </button>
                ))}
                {dirList.length === 0 && <p className="p-4 text-center text-muted">No subfolders found</p>}
              </div>
            </div>
            <div className="modal-footer flex justify-between">
              <button className="btn" onClick={() => setShowFolderPicker(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => selectFolder(currentPath)}>Select Current Folder</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
