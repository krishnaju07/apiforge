import React, { useState } from 'react';
import useStore, { METHOD_COLORS, makeTab } from '../store';
import toast from 'react-hot-toast';
import './Sidebar.css';

function MethodTag({ method }) {
  return <span className="method-tag" style={{ color: METHOD_COLORS[method] || '#94a3b8' }}>{method}</span>;
}

function CollectionsPane() {
  const { collections, addCollection, deleteCollection, renameCollection,
    toggleCollection, deleteCollectionRequest, addTab, setActiveTab, tabs } = useStore();
  const [newName, setNewName] = useState('');

  const openRequest = (req) => {
    const existing = tabs.find(t => t._collReqId === req.id);
    if (existing) { setActiveTab(existing.id); return; }
    addTab({
      name: req.name, method: req.method, url: req.url,
      bodyType: req.bodyType || 'none', bodyText: req.bodyText || '',
      params: req.params || [{ id: Math.random().toString(36).slice(2), key: '', value: '', desc: '', enabled: true }],
      headers: req.headers || [
        { id: Math.random().toString(36).slice(2), key: 'Content-Type', value: 'application/json', desc: '', enabled: true },
        { id: Math.random().toString(36).slice(2), key: 'Accept', value: '*/*', desc: '', enabled: true },
      ],
      _collReqId: req.id,
    });
  };

  const handleAdd = () => {
    if (!newName.trim()) return;
    addCollection(newName.trim());
    setNewName('');
    toast.success(`Collection "${newName}" created`);
  };

  return (
    <div className="sidebar-pane">
      <div className="sidebar-add-row">
        <input
          className="input sidebar-new-input"
          placeholder="New collection…"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
        />
        <button className="btn btn-primary sidebar-add-btn" onClick={handleAdd}>+</button>
      </div>

      {collections.length === 0 && (
        <div style={{ padding: '20px 12px', color: 'var(--text3)', fontSize: 12, textAlign: 'center' }}>
          No collections yet.<br />Create one above.
        </div>
      )}

      {collections.map(coll => (
        <CollectionGroup
          key={coll.id} coll={coll}
          onOpen={openRequest}
          onDelete={() => { if (window.confirm(`Delete "${coll.name}"?`)) deleteCollection(coll.id); }}
          onRename={() => { const n = window.prompt('Rename:', coll.name); if (n) renameCollection(coll.id, n); }}
          onToggle={() => toggleCollection(coll.id)}
          onDeleteRequest={(rid) => deleteCollectionRequest(coll.id, rid)}
        />
      ))}
    </div>
  );
}

function CollectionGroup({ coll, onOpen, onDelete, onRename, onToggle, onDeleteRequest }) {
  return (
    <div className="coll-group">
      <div className="coll-header" onClick={onToggle}>
        <span className={`coll-arrow ${coll.open ? 'open' : ''}`}>▶</span>
        <span className="coll-name">{coll.name}</span>
        <span className="coll-count">{coll.requests.length}</span>
        <div className="coll-actions" onClick={e => e.stopPropagation()}>
          <button className="coll-act-btn" onClick={onRename} title="Rename">✏</button>
          <button className="coll-act-btn danger" onClick={onDelete} title="Delete">🗑</button>
        </div>
      </div>
      {coll.open && (
        <div className="coll-items">
          {coll.requests.map(req => (
            <div key={req.id} className="coll-item" onClick={() => onOpen(req)}>
              <MethodTag method={req.method} />
              <span className="coll-item-name">{req.name}</span>
              <button
                className="coll-item-del"
                title="Remove"
                onClick={e => { e.stopPropagation(); onDeleteRequest(req.id); }}
              >✕</button>
            </div>
          ))}
          {coll.requests.length === 0 && (
            <div style={{ padding: '8px 24px', color: 'var(--text3)', fontSize: 11 }}>No requests</div>
          )}
        </div>
      )}
    </div>
  );
}

function HistoryPane() {
  const { history, clearHistory, addTab } = useStore();

  const openFromHistory = (h) => {
    addTab({ name: h.url, method: h.method, url: h.url });
  };

  const statusColor = (s) => s >= 500 ? 'var(--err)' : s >= 400 ? 'var(--warn)' : s >= 200 ? 'var(--ok)' : 'var(--text3)';

  if (history.length === 0) {
    return (
      <div className="empty-state" style={{ height: 200 }}>
        <div className="icon">🕐</div>
        <p>No history yet</p>
      </div>
    );
  }

  return (
    <div className="sidebar-pane">
      <button className="history-clear-btn" onClick={() => { if (window.confirm('Clear all history?')) { clearHistory(); toast.success('History cleared'); } }}>
        🗑 Clear History
      </button>
      {history.map(h => (
        <div key={h.id} className="history-item" onClick={() => openFromHistory(h)}>
          <MethodTag method={h.method} />
          <div className="history-meta">
            <div className="history-url">{h.url}</div>
            <div className="history-info">
              <span style={{ color: statusColor(h.status) }}>{h.status}</span>
              {' · '}{h.time}ms
              {' · '}{new Date(h.ts).toLocaleTimeString()}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EnvironmentsPane() {
  const { environments, activeEnvId, setActiveEnv, addEnvironment,
    deleteEnvironment, updateEnvVar, addEnvVar, removeEnvVar, renameEnvironment } = useStore();
  const [selectedEnvId, setSelectedEnvId] = useState(environments[0]?.id || null);

  const activeEnv = environments.find(e => e.id === selectedEnvId);

  return (
    <div className="sidebar-pane">
      <div className="env-header">
        <select
          className="select env-select"
          value={selectedEnvId || ''}
          onChange={e => setSelectedEnvId(e.target.value)}
        >
          {environments.map(env => (
            <option key={env.id} value={env.id}>{env.name}</option>
          ))}
        </select>
        <button className="btn btn-ghost env-btn-sm" onClick={() => {
          const name = window.prompt('Environment name:');
          if (name) { addEnvironment(name); toast.success('Environment created'); }
        }}>+</button>
      </div>

      {activeEnv && (
        <>
          <div className="env-actions">
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>{activeEnv.name}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className={`btn ${activeEnvId === activeEnv.id ? 'btn-primary' : 'btn-ghost'} env-btn-sm`}
                onClick={() => { setActiveEnv(activeEnvId === activeEnv.id ? null : activeEnv.id); toast.success(activeEnvId === activeEnv.id ? 'Environment deactivated' : `"${activeEnv.name}" activated`); }}
              >
                {activeEnvId === activeEnv.id ? '✓ Active' : 'Activate'}
              </button>
              <button className="btn btn-ghost env-btn-sm" onClick={() => { const n = window.prompt('Rename:', activeEnv.name); if (n) renameEnvironment(activeEnv.id, n); }}>✏</button>
              <button className="btn btn-danger env-btn-sm" onClick={() => { if (window.confirm(`Delete "${activeEnv.name}"?`)) deleteEnvironment(activeEnv.id); }}>🗑</button>
            </div>
          </div>

          <div className="env-vars">
            <div className="env-vars-header">
              <span>Variable</span><span>Value</span>
            </div>
            {activeEnv.variables.map(v => (
              <div key={v.id} className="env-var-row">
                <input
                  type="checkbox"
                  className="kv-cb"
                  checked={v.enabled}
                  onChange={e => updateEnvVar(activeEnv.id, v.id, { enabled: e.target.checked })}
                />
                <input
                  className="kv-input"
                  placeholder="KEY"
                  value={v.key}
                  onChange={e => updateEnvVar(activeEnv.id, v.id, { key: e.target.value })}
                />
                <input
                  className="kv-input"
                  placeholder="value"
                  value={v.value}
                  onChange={e => updateEnvVar(activeEnv.id, v.id, { value: e.target.value })}
                />
                <button className="kv-del" onClick={() => removeEnvVar(activeEnv.id, v.id)}>✕</button>
              </div>
            ))}
            <button className="kv-add" onClick={() => addEnvVar(activeEnv.id)}>+ Add Variable</button>
          </div>
        </>
      )}
    </div>
  );
}

export default function Sidebar() {
  const { sidebarOpen, sidebarTab, setSidebarTab } = useStore();

  if (!sidebarOpen) return null;

  const tabs = [
    { id: 'collections', label: '📁 Collections' },
    { id: 'history', label: '🕐 History' },
    { id: 'environments', label: '🌍 Env' },
  ];

  return (
    <div className="sidebar">
      <div className="sidebar-tabs">
        {tabs.map(t => (
          <button
            key={t.id}
            className={`sidebar-tab ${sidebarTab === t.id ? 'active' : ''}`}
            onClick={() => setSidebarTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="sidebar-content scroll">
        {sidebarTab === 'collections' && <CollectionsPane />}
        {sidebarTab === 'history' && <HistoryPane />}
        {sidebarTab === 'environments' && <EnvironmentsPane />}
      </div>
    </div>
  );
}
