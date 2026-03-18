import React, { useState } from 'react';
import useStore, { METHODS, METHOD_COLORS, makeKVRow } from '../store';
import { parseCurl, generateCurl } from '../utils/request';
import { executeRequest, runPreScript, runTests, abortControllers } from '../utils/request';
import toast from 'react-hot-toast';
import './URLBar.css';

export default function URLBar() {
  const { getActiveTab, updateTab, addHistory, saveRequestToCollection, collections } = useStore();
  const [showSaveMenu, setShowSaveMenu] = useState(false);
  const tab = getActiveTab();
  const resolveEnv = useStore.getState().resolveEnv;

  if (!tab) return null;

  const handleUrlChange = (e) => {
    updateTab(tab.id, { url: e.target.value, name: e.target.value || 'New Request' });
  };

  // Detect cURL paste
  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text');
    if (pasted.trim().toLowerCase().startsWith('curl ')) {
      e.preventDefault();
      const tabId = tab.id;
      const currentAuth = tab.auth;
      setTimeout(() => {
        try {
          const parsed = parseCurl(pasted);
          updateTab(tabId, {
            url: parsed.url,
            method: parsed.method,
            bodyType: parsed.bodyType,
            bodyText: parsed.body,
            params: parsed.params.length > 0
              ? parsed.params.map(p => ({ ...makeKVRow(p.key, p.value), enabled: true }))
              : [makeKVRow()],
            headers: parsed.headers.length > 0
              ? parsed.headers.map(h => ({ ...makeKVRow(h.key, h.value), enabled: true }))
              : [makeKVRow('Content-Type', 'application/json'), makeKVRow('Accept', '*/*')],
            ...(parsed.auth ? { auth: { ...currentAuth, ...parsed.auth } } : {}),
            name: parsed.url || 'Imported Request',
          });
          toast.success('cURL imported!', { duration: 2000 });
        } catch {
          toast.error('Failed to parse cURL');
        }
      }, 0);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') sendRequest();
  };

  const sendRequest = async () => {
    const currentTab = useStore.getState().getActiveTab();
    if (!currentTab.url) { toast.error('Please enter a URL'); return; }

    // Abort previous
    if (abortControllers[currentTab.id]) { abortControllers[currentTab.id].abort(); }
    const ctrl = new AbortController();
    abortControllers[currentTab.id] = ctrl;

    updateTab(currentTab.id, { loading: true, response: null, testResults: [], scriptLogs: [] });

    // Pre-script
    const envGet = (k) => {
      const env = useStore.getState().getActiveEnv();
      return env?.variables.find(v => v.enabled && v.key === k)?.value;
    };
    const envSet = (k, v) => {
      const { environments, activeEnvId } = useStore.getState();
      const env = environments.find(e => e.id === activeEnvId);
      if (env) {
        const existing = env.variables.find(vr => vr.key === k);
        if (existing) useStore.getState().updateEnvVar(activeEnvId, existing.id, { value: v });
        else useStore.getState().addEnvVar(activeEnvId);
      }
    };
    const { logs, error: scriptErr } = runPreScript(currentTab.preScript, envGet, envSet);
    if (scriptErr) toast.error('Pre-script error: ' + scriptErr);
    updateTab(currentTab.id, { scriptLogs: logs });

    try {
      const result = await executeRequest(currentTab, useStore.getState().resolveEnv, ctrl.signal);
      const testResults = runTests(currentTab.testScript, result);

      updateTab(currentTab.id, {
        loading: false,
        response: result,
        responseTime: result.time,
        responseSize: result.size,
        testResults,
        name: currentTab.name === 'New Request'
          ? `${currentTab.method} /${currentTab.url.split('/').pop()?.split('?')[0] || ''}`
          : currentTab.name,
      });

      addHistory({
        method: currentTab.method,
        url: currentTab.url,
        status: result.status,
        time: result.time,
      });

      const passed = testResults.filter(r => r.pass).length;
      if (testResults.length > 0) {
        if (passed === testResults.length) toast.success(`Tests: ${passed}/${testResults.length} passed ✓`);
        else toast.error(`Tests: ${passed}/${testResults.length} passed`);
      }
    } catch (err) {
      if (err.name === 'AbortError') { updateTab(currentTab.id, { loading: false }); return; }
      updateTab(currentTab.id, {
        loading: false,
        response: { status: 0, statusText: 'Error', raw: err.message, parsed: null, headers: {}, time: 0, size: 0 },
      });
      toast.error('Request failed: ' + err.message);
    } finally {
      delete abortControllers[currentTab.id];
    }
  };

  const cancelRequest = () => {
    if (abortControllers[tab.id]) {
      abortControllers[tab.id].abort();
      toast('Request cancelled', { icon: '🚫' });
    }
  };

  const handleSaveToCollection = (collId) => {
    const coll = collections.find(c => c.id === collId);
    if (!coll) return;
    saveRequestToCollection(collId, {
      name: tab.name, method: tab.method, url: tab.url,
      bodyType: tab.bodyType, bodyText: tab.bodyText,
      params: tab.params, headers: tab.headers,
    });
    toast.success(`Saved to "${coll.name}"`);
    setShowSaveMenu(false);
  };

  const copyCurl = () => {
    const curl = generateCurl(tab, resolveEnv);
    navigator.clipboard.writeText(curl).then(() => toast.success('cURL copied!'));
  };

  return (
    <div className="url-bar">
      <select
        className="method-select"
        value={tab.method}
        style={{ color: METHOD_COLORS[tab.method] || '#94a3b8' }}
        onChange={e => updateTab(tab.id, { method: e.target.value })}
      >
        {METHODS.map(m => (
          <option key={m} value={m} style={{ color: METHOD_COLORS[m] }}>{m}</option>
        ))}
      </select>

      <input
        className="url-input"
        placeholder="Enter URL or paste a cURL command…"
        value={tab.url}
        onChange={handleUrlChange}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        autoComplete="off"
      />

      <button className="btn btn-ghost url-copy-curl" onClick={copyCurl} title="Copy as cURL">
        📋
      </button>

      {/* Save menu */}
      <div className="url-save-wrap">
        <button className="btn btn-ghost" onClick={() => setShowSaveMenu(o => !o)} title="Save to collection">
          💾 Save
        </button>
        {showSaveMenu && (
          <div className="url-save-menu">
            <div className="url-save-menu-title">Save to collection</div>
            {collections.length === 0 && (
              <div style={{ padding: '8px 12px', color: 'var(--text3)', fontSize: 12 }}>No collections yet</div>
            )}
            {collections.map(c => (
              <button key={c.id} className="url-save-menu-item" onClick={() => handleSaveToCollection(c.id)}>
                📁 {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab.loading ? (
        <button className="btn btn-danger url-send-btn" onClick={cancelRequest}>
          ✕ Cancel
        </button>
      ) : (
        <button
          className="btn btn-primary url-send-btn"
          onClick={sendRequest}
          disabled={tab.loading}
        >
          Send ▶
        </button>
      )}
    </div>
  );
}
