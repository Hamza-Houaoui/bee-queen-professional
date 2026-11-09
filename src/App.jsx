import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Layout from './components/Layout';
import Home from './pages/Home';
import Album from './pages/Album';
import Order from './pages/Order';
import Inventory from './pages/Inventory';
import Customers from './pages/Customers';
import History from './pages/History';
import Models from './pages/Models';
import Colors from './pages/Colors';
import Settings from './pages/Settings';
import Counts from './pages/Counts';
import Factory from './pages/Factory';
import PreOrder from './pages/PreOrder';
import { Capacitor } from '@capacitor/core';
import { Filesystem } from '@capacitor/filesystem';

import { db } from './db';
import { SyncEngine } from './SyncEngine';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
  import { performTelegramBackup, performWeeklyReport, sendInventoryReport, sendFactoryReport, sendCountsReport } from './utils/telegram';

  export default function App() {
    const { i18n } = useTranslation();
    const settings = useLiveQuery(() => db.settings.get(1));

    useEffect(() => {
      if (Capacitor.isNativePlatform()) {
        Filesystem.requestPermissions().catch(err => console.error('Perm err', err));
      }
    }, []);

    useEffect(() => {
      if (settings) {
        // Theme
        if (settings.theme === 'light') {
          document.documentElement.classList.add('light-theme');
        } else {
          document.documentElement.classList.remove('light-theme');
        }
        // Language & Dir
        if (settings.activeLanguage) {
          i18n.changeLanguage(settings.activeLanguage);
          document.documentElement.dir = settings.activeLanguage === 'ar' ? 'rtl' : 'ltr';
        }

        const checkAndSendReports = async () => {
          const s = await db.settings.get(1);
          if (!s?.tgBotToken) return;

          const now = new Date();
          const today = now.toISOString().split('T')[0];
          const currentHour = now.getHours();
          const currentMinute = now.getMinutes();

          // 1. Hourly Auto Backup
          const lastHour = s.lastBackupTimestamp || 0;
          const oneHourMs = 60 * 60 * 1000;
          if (now.getTime() - lastHour >= oneHourMs && s.tgReportChatId) {
            performTelegramBackup().then(async () => {
              await db.settings.update(1, { lastBackupTimestamp: now.getTime(), lastBackupDate: today });
            }).catch(err => console.error('Auto Backup Failed', err));
          }

          // 2. Weekly Report Auto (Friday 4 PM)
          if (now.getDay() === 5 && currentHour >= 16) {
            const reportKey = `W${Math.ceil(now.getDate() / 7)}_${now.getMonth() + 1}_${now.getFullYear()}`;
            if (s.lastWeeklyReportDate !== reportKey) {
              performWeeklyReport().catch(err => console.error('Weekly Report Failed', err));
            }
          }

          // 3. Daily Factory Report (Daily 18:00)
          if (currentHour >= 18 && s.lastFactoryReportDate !== today) {
            sendFactoryReport().catch(err => console.error('Factory Report Failed', err));
          }

          // 4. Daily Inventory Report (Daily 19:00)
          if (currentHour >= 19 && s.lastInventoryReportDate !== today) {
            sendInventoryReport().catch(err => console.error('Inventory Report Failed', err));
          }

          // 5. Daily Financial Report (Daily 19:30)
          if (currentHour >= 19 && currentMinute >= 30 && s.lastCountsReportDate !== today) {
            sendCountsReport().catch(err => console.error('Counts Report Failed', err));
          }
        };

        checkAndSendReports();
        const interval = setInterval(checkAndSendReports, 60000); // Check every minute
        return () => clearInterval(interval);
      }
    }, [settings, i18n]);

    // Multi-Master Auto-Sync Listener
    useEffect(() => {
      if (!settings) return;
      const runAutoSync = async () => {
        try {
          await SyncEngine.pullFromPeers();
        } catch (e) {
          console.warn('Auto-Sync Pull failed', e);
        }
      };
      const syncInterval = setInterval(runAutoSync, 20000); // Every 20 seconds
      return () => clearInterval(syncInterval);
    }, [settings]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="album" element={<Album />} />
          <Route path="order" element={<Order />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="customers" element={<Customers />} />
          <Route path="history" element={<History />} />
          <Route path="pre-order" element={<PreOrder />} />
          <Route path="models" element={<Models />} />
          <Route path="colors" element={<Colors />} />
          <Route path="settings" element={<Settings />} />
          <Route path="counts" element={<Counts />} />
          <Route path="factory" element={<Factory />} />
        </Route>
      </Routes>
      <ToastContainer 
        position="bottom-center" 
        theme={settings?.theme === 'light' ? 'light' : 'dark'} 
        autoClose={2800} 
        hideProgressBar 
        newestOnTop 
      />
    </BrowserRouter>
  );
}
