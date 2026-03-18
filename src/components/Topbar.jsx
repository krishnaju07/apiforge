import React, { useState, useRef, useEffect } from 'react';
import useStore from '../store';
import { generateCurl } from '../utils/request';
import toast from 'react-hot-toast';
import './Topbar.css';

export default function Topbar() {
  const { sidebarOpen, setSidebarOpen, environments, activeEnvId, setActiveEnv,
    addEnvironment, collections, importCollections, setCollections,
    setRunnerOpen, getActiveTab } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef();

  useEffect(() => {
    const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const exportCollections = () => {
    const data = JSON.stringify({ type: 'apiforge', version: '1.0', collections }, null, 2);
    download('apiforge-collections.json', data, 'application/json');
    toast.success('Collections exported!');
    setMenuOpen(false);
  };

  const importFromFile = () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json';
    inp.onchange = (e) => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          if (data.collections) { importCollections(data.collections); toast.success(`Imported ${data.collections.length} collection(s)`); }
          else if (Array.isArray(data)) { importCollections(data); toast.success(`Imported ${data.length} collection(s)`); }
          else toast.error('Invalid file format');
        } catch { toast.error('Failed to parse JSON'); }
      };
      reader.readAsText(file);
    };
    inp.click();
    setMenuOpen(false);
  };

  const exportAsCurl = () => {
    const tab = getActiveTab();
    if (!tab?.url) { toast.error('No request to export'); return; }
    const resolveEnv = useStore.getState().resolveEnv;
    const curl = generateCurl(tab, resolveEnv);
    navigator.clipboard.writeText(curl).then(() => toast.success('cURL copied to clipboard!'));
    setMenuOpen(false);
  };

  const clearAll = () => {
    if (window.confirm('Clear all saved data? This cannot be undone.')) {
      localStorage.clear();
      window.location.reload();
    }
    setMenuOpen(false);
  };

  const download = (name, content, type) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name; a.click();
  };

  return (
    <div className="topbar">
      <button className="topbar-sidebar-btn" onClick={() => setSidebarOpen(!sidebarOpen)} title="Toggle Sidebar (Ctrl+B)">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <line x1="9" y1="3" x2="9" y2="21"/>
        </svg>
      </button>

      <div className="topbar-logo">
        <div className="topbar-logo-icon">⚡</div>
        <span className="topbar-logo-text">APIForge</span>
        <span className="topbar-logo-badge">FREE</span>
      </div>

      <div className="topbar-spacer" />

      {/* Environment Selector */}
      <div className="topbar-env">
        <span className="topbar-env-label">Env:</span>
        <select
          className="topbar-env-select"
          value={activeEnvId || ''}
          onChange={e => setActiveEnv(e.target.value || null)}
        >
          <option value="">None</option>
          {environments.map(env => (
            <option key={env.id} value={env.id}>{env.name}</option>
          ))}
        </select>
      </div>

      {/* Runner button */}
      <button className="btn btn-ghost topbar-runner-btn" onClick={() => setRunnerOpen(true)}>
        ▶ Runner
      </button>

      {/* More menu */}
      <div className="topbar-menu-wrap" ref={menuRef}>
        <button className="btn btn-ghost" onClick={() => setMenuOpen(o => !o)}>
          ⋮ More
        </button>
        {menuOpen && (
          <div className="topbar-menu">
            <button className="topbar-menu-item" onClick={() => { addEnvironment('New Environment'); setMenuOpen(false); toast.success('Environment created'); }}>
              🌍 New Environment
            </button>
            <div className="topbar-menu-sep" />
            <button className="topbar-menu-item" onClick={importFromFile}>
              📁 Import Collection (JSON)
            </button>
            <button className="topbar-menu-item" onClick={exportCollections}>
              💾 Export Collections
            </button>
            <button className="topbar-menu-item" onClick={exportAsCurl}>
              📋 Export as cURL
            </button>
            <div className="topbar-menu-sep" />
            <button className="topbar-menu-item topbar-menu-danger" onClick={clearAll}>
              🗑 Clear All Data
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
