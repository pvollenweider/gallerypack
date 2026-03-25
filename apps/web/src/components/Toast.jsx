// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useEffect, useState } from 'react';

export function Toast({ message, onDone }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) return;
    setVisible(true);
    const t1 = setTimeout(() => setVisible(false), 2200);
    const t2 = setTimeout(() => onDone?.(), 2600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [message]);

  if (!message) return null;

  return (
    <>
      <style>{`
        @keyframes toastIn  { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
        @keyframes toastOut { from { opacity:1 } to { opacity:0 } }
      `}</style>
      <div style={{
        position: 'fixed', bottom: '5rem', left: '50%', transform: 'translateX(-50%)',
        background: '#111', color: '#fff', padding: '0.6rem 1.25rem',
        borderRadius: 8, fontSize: '0.875rem', fontWeight: 500,
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)', zIndex: 9999, whiteSpace: 'nowrap',
        animation: `${visible ? 'toastIn' : 'toastOut'} 0.3s ease forwards`,
      }}>
        {message}
      </div>
    </>
  );
}
