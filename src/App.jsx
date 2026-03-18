import { useEffect, useCallback } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Toaster } from 'react-hot-toast';
import useStore from './store';
import { abortControllers } from './utils/request';
import Topbar from './components/Topbar';
import Sidebar from './components/Sidebar';
import TabsBar from './components/TabsBar';
import URLBar from './components/URLBar';
import RequestPanel from './components/RequestPanel';
import ResponsePanel from './components/ResponsePanel';
import Runner from './components/Runner';
import './styles/global.css';
import './App.css';

export default function App() {
  const { sidebarOpen, addTab, closeTab, tabs, activeTabId, setActiveTab, getActiveTab, setSidebarOpen } = useStore();

  // Close sidebar by default on small screens
  useEffect(() => {
    if (window.innerWidth < 768) setSidebarOpen(false);
  }, [setSidebarOpen]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;

    if (e.key === 't') { e.preventDefault(); addTab(); }
    if (e.key === 'w') {
      e.preventDefault();
      const tab = getActiveTab();
      if (tab) closeTab(tab.id);
    }
    if (e.key === 'b') { e.preventDefault(); useStore.getState().setSidebarOpen(!useStore.getState().sidebarOpen); }
    if (e.key === 'Enter') {
      e.preventDefault();
      // Trigger send — URLBar handles this via Enter on input, but support Ctrl+Enter globally
      document.querySelector('.url-input')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }
    // Tab switching: Ctrl+1..9
    if (e.key >= '1' && e.key <= '9') {
      const idx = parseInt(e.key) - 1;
      if (tabs[idx]) { e.preventDefault(); setActiveTab(tabs[idx].id); }
    }
    // Ctrl+Left/Right to switch tabs
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const idx = tabs.findIndex(t => t.id === activeTabId);
      if (idx === -1) return;
      e.preventDefault();
      const next = e.key === 'ArrowRight'
        ? tabs[(idx + 1) % tabs.length]
        : tabs[(idx - 1 + tabs.length) % tabs.length];
      setActiveTab(next.id);
    }
  }, [addTab, closeTab, tabs, activeTabId, setActiveTab, getActiveTab]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Cleanup abort controllers on unmount
  useEffect(() => {
    return () => {
      Object.values(abortControllers).forEach(ctrl => ctrl.abort());
    };
  }, []);

  return (
    <div className="app">
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--bg2)',
            color: 'var(--text1)',
            border: '1px solid var(--border2)',
            fontFamily: 'var(--font-ui)',
            fontSize: '13px',
          },
          success: { iconTheme: { primary: 'var(--ok)', secondary: 'var(--bg2)' } },
          error: { iconTheme: { primary: 'var(--err)', secondary: 'var(--bg2)' } },
        }}
      />

      <Topbar />

      <div className="app-main">
        {/* Sidebar */}
        {sidebarOpen && (
          <PanelGroup direction="horizontal" className="app-panels">
            <Panel defaultSize={18} minSize={14} maxSize={30} className="sidebar-panel">
              <Sidebar />
            </Panel>
            <PanelResizeHandle />
            <Panel minSize={50} className="workspace-panel">
              <Workspace />
            </Panel>
          </PanelGroup>
        )}
        {!sidebarOpen && <Workspace />}
      </div>

      <Runner />

      {/* Keyboard shortcut hint (bottom left) */}
      <div className="shortcuts-hint">
        Ctrl+T new · Ctrl+W close · Ctrl+Enter send · Ctrl+B sidebar
      </div>
    </div>
  );
}

function Workspace() {
  return (
    <div className="workspace">
      <TabsBar />
      <URLBar />
      <PanelGroup direction="vertical" className="workspace-panels">
        <Panel defaultSize={38} minSize={20} maxSize={70}>
          <RequestPanel />
        </Panel>
        <PanelResizeHandle />
        <Panel minSize={25}>
          <ResponsePanel />
        </Panel>
      </PanelGroup>
    </div>
  );
}
