import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { Archive } from 'lucide-react';

export default function ModelImage({ modelCode, color, style, className, onClick }) {
  const [src, setSrc] = useState(null);
  const settings = useLiveQuery(() => db.settings.get(1));

  useEffect(() => {
    const load = async () => {
      if (!modelCode) { setSrc(null); return; }
      
      const folder = settings?.mediaFolder || 'Beequeensyngthing/media';
      let dir = Directory.Documents;
      let finalPath = folder;
      
      if (folder.startsWith('/')) {
        dir = undefined;
        finalPath = folder;
      }

      // 1. Try Code-Color patterns (Manual naming)
      const colorClean = color ? color.toLowerCase().replace(/ /g, '') : '';
      const patterns = [];
      if (colorClean) {
        patterns.push(`${modelCode}-${colorClean}.jpg`);
        patterns.push(`${modelCode}-${colorClean}.png`);
        patterns.push(`${modelCode}-${colorClean}.jpeg`);
      }
      patterns.push(`${modelCode}.jpg`);
      patterns.push(`${modelCode}.png`);
      patterns.push(`${modelCode}.jpeg`);

      for (const file of patterns) {
        try {
          const fullPath = finalPath.endsWith('/') ? `${finalPath}${file}` : `${finalPath}/${file}`;
          const res = await Filesystem.readFile({ path: fullPath, directory: dir });
          const ext = file.split('.').pop().toLowerCase();
          setSrc(`data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${res.data}`);
          return;
        } catch (e) {}
      }
      
      // 2. Fallback to model coverImage from DB
      const m = await db.models.get(modelCode);
      if (m?.coverImage) {
        if (m.coverImage.startsWith('data:')) {
          setSrc(m.coverImage);
        } else {
           try {
             const fullPath = finalPath.endsWith('/') ? `${finalPath}${m.coverImage}` : `${finalPath}/${m.coverImage}`;
             const res = await Filesystem.readFile({ path: fullPath, directory: dir });
             const ext = m.coverImage.split('.').pop().toLowerCase();
             setSrc(`data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${res.data}`);
           } catch(e) {}
        }
      }
    };
    load();
  }, [modelCode, color, settings]);

  if (!src) return (
    <div 
      className={className} 
      style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--s3)', border: '1px dashed var(--muted)' }} 
      onClick={() => onClick && onClick(null)}
    >
      <Archive size={style?.width ? Math.min(style.width * 0.4, 24) : 20} color="var(--muted)" />
    </div>
  );

  return <img src={src} className={className} style={style} onClick={() => onClick && onClick(src)} alt={modelCode} />;
}
