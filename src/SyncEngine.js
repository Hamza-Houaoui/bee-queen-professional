import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { db } from './db';
import { exportDB, importInto } from 'dexie-export-import';

const DEFAULT_SYNC_DIR = 'Beequeensyngthing';

const getPathInfo = (fullPath) => {
  if (fullPath.startsWith('/')) {
    return { path: fullPath, directory: undefined };
  }
  return { path: fullPath, directory: Directory.Documents };
};

export const SyncEngine = {
  getSyncDir: async () => {
    const settings = await db.settings.get(1);
    return settings?.syncFolder || DEFAULT_SYNC_DIR;
  },

  getSyncFilename: async () => {
    const settings = await db.settings.get(1);
    const deviceId = settings?.deviceId || 1;
    return `sync_device_${deviceId}.json`;
  },

  exportFullBackup: async (customPath) => {
    const targetDir = customPath || await SyncEngine.getSyncDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const folderPath = `${targetDir}/backup_${timestamp}`;
    const { path, directory } = getPathInfo(folderPath);

    try {
      try { await Filesystem.mkdir({ path, directory, recursive: true }); } catch (e) {}
      const blob = await exportDB(db, { prettyJson: false });
      const jsonText = await blob.text();

      await Filesystem.writeFile({
        path: `${path}/database.json`,
        data: jsonText,
        directory,
        encoding: Encoding.UTF8
      });
      return true;
    } catch (err) {
      console.error('Backup Failed:', err);
      throw err;
    }
  },

  importFromBackup: async (customPath) => {
    const targetDir = customPath || await SyncEngine.getSyncDir();
    const { path: dirPath, directory } = getPathInfo(targetDir);
    try {
      const dirResult = await Filesystem.readdir({ path: dirPath, directory });
      
      const backupDirs = dirResult.files
        .filter(f => f.name.toLowerCase().includes('backup_'))
        .sort((a, b) => b.name.localeCompare(a.name));

      if (backupDirs.length === 0) throw new Error('No backup folders found');

      const latestBackup = backupDirs[0].name;
      const fileUri = await Filesystem.getUri({
        path: `${dirPath}/${latestBackup}/database.json`,
        directory
      });

      const nativeUrl = Capacitor.convertFileSrc(fileUri.uri);
      const response = await fetch(nativeUrl);
      const blob = await response.blob();
      
      // Save device identity before wipe
      const oldSettings = await db.settings.get(1);

      for (const table of db.tables) {
        if (table.name !== 'settings') await table.clear();
      }
      
      await importInto(db, blob, { overwriteValues: true, clearTablesBeforeImport: false });
      
      // Restore device identity so we don't collide with the device that created the backup
      if (oldSettings?.deviceId) {
        await db.settings.update(1, { 
           deviceId: oldSettings.deviceId,
           syncFolder: oldSettings.syncFolder
        });
      }

      console.log('Import success!');
      return true;
    } catch (err) {
      console.error('Import Failed:', err);
      throw err;
    }
  },

  importFromBlob: async (blob) => {
    try {
      const oldSettings = await db.settings.get(1);

      for (const table of db.tables) {
        if (table.name !== 'settings') await table.clear();
      }
      await importInto(db, blob, { overwriteValues: true, clearTablesBeforeImport: false });
      
      if (oldSettings?.deviceId) {
        await db.settings.update(1, { 
           deviceId: oldSettings.deviceId,
           syncFolder: oldSettings.syncFolder
        });
      }
      return true;
    } catch (err) {
      console.error('Import From Blob Failed:', err);
      throw err;
    }
  },

  saveForSync: async () => {
    const targetDir = await SyncEngine.getSyncDir();
    const fileName = await SyncEngine.getSyncFilename();
    const { path, directory } = getPathInfo(targetDir);
    try {
      try { await Filesystem.mkdir({ path, directory, recursive: true }); } catch (e) {}
      
      // CRITICAL FIX: Filter out 'settings' table during sync export
      // This prevents devices from overwriting each other's deviceId and syncFolder
      const blob = await exportDB(db, { 
        prettyJson: false,
        filter: (table) => table !== 'settings'
      });
      const jsonText = await blob.text();

      await Filesystem.writeFile({
        path: `${path}/${fileName}`,
        data: jsonText,
        directory,
        encoding: Encoding.UTF8
      });
      console.log(`Sync Export Success: ${fileName} written to ${path}`);
      return true;
    } catch (err) {
      if (err.message?.includes('Directory exists')) return true; 
      console.error('Sync Export Failed:', err);
      return false;
    }
  },

  pullFromPeers: async () => {
    const targetDir = await SyncEngine.getSyncDir();
    const myFileName = await SyncEngine.getSyncFilename(); // e.g. sync_device_1.json
    const myIdStr = myFileName.split('_').pop().split('.')[0]; // e.g. "1"
    const myIdToken = `device_${myIdStr}`;
    const { path: dirPath, directory } = getPathInfo(targetDir);

    try {
      const dirResult = await Filesystem.readdir({ path: dirPath, directory });
      
      // Look for any sync_device_ file
      const allSyncFiles = dirResult.files.filter(f => f.name.includes('sync_device_'));
      
      // 1. Files from OTHER devices (to be imported)
      const peerFiles = allSyncFiles.filter(f => !f.name.includes(myIdToken));
      
      // 2. Conflict files from OUR device (to be deleted)
      const myConflictFiles = allSyncFiles.filter(f => 
        f.name.includes(myIdToken) && f.name.includes('sync-conflict')
      );

      // Clean up our own conflict files to stop the loop
      for (const f of myConflictFiles) {
        try {
          await Filesystem.deleteFile({ path: `${dirPath}/${f.name}`, directory });
          console.log(`Deleted local conflict file: ${f.name}`);
        } catch (e) {}
      }
      
      if (peerFiles.length > 0) {
        console.log(`Found ${peerFiles.length} peer sync files:`, peerFiles.map(f => f.name));
      }

      for (const file of peerFiles) {
        try {
          const fileUri = await Filesystem.getUri({ path: `${dirPath}/${file.name}`, directory });
          const nativeUrl = Capacitor.convertFileSrc(fileUri.uri);
          const response = await fetch(nativeUrl);
          const blob = await response.blob();
          
          await importInto(db, blob, { overwriteValues: true, clearTablesBeforeImport: false });
          console.log(`Successfully merged data from ${file.name}`);
        } catch (e) {
          console.warn(`Failed to import from ${file.name}:`, e);
        }
      }
      return new Date().toLocaleTimeString();

      return new Date().toLocaleTimeString();
    } catch (err) {
      console.error('Pull From Peers Failed:', err);
      return false;
    }
  },

  loadFromSync: async () => {
    const targetDir = await SyncEngine.getSyncDir();
    const { path: dirPath, directory } = getPathInfo(targetDir);
    try {
      const dirResult = await Filesystem.readdir({ path: dirPath, directory });
      const syncFiles = dirResult.files.filter(f => f.name.includes('sync_device_'));
      
      if (syncFiles.length === 0) throw new Error('No sync files found');

      for (const table of db.tables) {
        if (table.name !== 'settings') await table.clear();
      }

      for (const file of syncFiles) {
        const fileUri = await Filesystem.getUri({ path: `${dirPath}/${file.name}`, directory });
        const nativeUrl = Capacitor.convertFileSrc(fileUri.uri);
        const response = await fetch(nativeUrl);
        const blob = await response.blob();
        await importInto(db, blob, { overwriteValues: true, clearTablesBeforeImport: false });
      }
      return true;
    } catch (err) {
      console.error('Manual Sync Import Failed:', err);
      throw err;
    }
  },

  performFullSync: async () => {
    await SyncEngine.saveForSync();
    return await SyncEngine.pullFromPeers();
  },

  cleanOldMediaFromDB: async () => {
    const models = await db.models.toArray();
    let cleaned = 0;
    for (const m of models) {
      let needsUpdate = false;
      const images = (m.images || []).filter(img => {
        if (img.startsWith('data:')) { needsUpdate = true; return false; }
        return true;
      });
      const videos = (m.videos || []).filter(vid => {
        if (vid.startsWith('data:')) { needsUpdate = true; return false; }
        return true;
      });
      let coverImage = m.coverImage;
      if (coverImage && coverImage.startsWith('data:')) { coverImage = null; needsUpdate = true; }
      let video = m.video;
      if (video && video.startsWith('data:')) { video = null; needsUpdate = true; }

      if (needsUpdate) {
        await db.models.update(m.code, { images, videos, coverImage, video });
        cleaned++;
      }
    }
    return cleaned;
  }
};

if (typeof window !== 'undefined') {
  window.SyncEngine = SyncEngine;
}
