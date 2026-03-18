import React from 'react';
import useStore, { METHOD_COLORS } from '../store';
import './TabsBar.css';

export default function TabsBar() {
  const { tabs, activeTabId, setActiveTab, closeTab, addTab, duplicateTab } = useStore();

  const handleTabClick = (id, e) => {
    if (e.target.closest('[data-close]')) return;
    setActiveTab(id);
  };

  const handleMiddleClick = (id, e) => {
    if (e.button === 1) { e.preventDefault(); closeTab(id); }
  };

  return (
    <div className="tabs-bar scroll-x">
      <button className="tabs-new-btn" title="New Tab (Ctrl+T)" onClick={() => addTab()}>＋</button>
      {tabs.map(tab => (
        <div
          key={tab.id}
          className={`tab-item ${tab.id === activeTabId ? 'active' : ''} ${tab.loading ? 'loading' : ''}`}
          onClick={e => handleTabClick(tab.id, e)}
          onMouseDown={e => handleMiddleClick(tab.id, e)}
          onContextMenu={e => {
            e.preventDefault();
            // Simple context: duplicate
            duplicateTab(tab.id);
          }}
          title={`${tab.method} ${tab.url || 'New Request'}\nRight-click to duplicate`}
        >
          {tab.loading && <div className="tab-spinner" />}
          <span className="tab-method" style={{ color: METHOD_COLORS[tab.method] || '#94a3b8' }}>
            {tab.method}
          </span>
          <span className="tab-name">{tab.name || 'New Request'}</span>
          <button
            data-close="1"
            className="tab-close"
            onClick={e => { e.stopPropagation(); closeTab(tab.id); }}
            title="Close tab"
          >✕</button>
        </div>
      ))}
    </div>
  );
}
