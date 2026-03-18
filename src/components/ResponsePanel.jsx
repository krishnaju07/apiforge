import React, { useState, useRef, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import useStore from '../store';
import toast from 'react-hot-toast';
import './ResponsePanel.css';

const RES_MONACO_OPTIONS = {
  readOnly: true,
  minimap: { enabled: false },
  fontSize: 12,
  lineNumbers: 'on',
  scrollBeyondLastLine: false,
  folding: true,
  automaticLayout: false,
  wordWrap: 'off',
  padding: { top: 12, bottom: 12 },
  renderLineHighlight: 'none',
  overviewRulerBorder: false,
  overviewRulerLanes: 0,
  scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
  contextmenu: false,
};

function monacoTheme(monaco) {
  monaco.editor.defineTheme('apiforge', {
    base: 'vs-dark', inherit: true, rules: [],
    colors: {
      'editor.background': '#181818',
      'editor.lineHighlightBackground': '#202020',
      'editorGutter.background': '#181818',
      'editorLineNumber.foreground': '#555',
      'editorLineNumber.activeForeground': '#888',
    },
  });
}

function statusColor(s) {
  if (s >= 500) return 'var(--err)';
  if (s >= 400) return 'var(--warn)';
  if (s >= 200) return 'var(--ok)';
  return 'var(--text2)';
}

function MetaBar({ response, responseTime, responseSize }) {
  if (!response) return null;
  const sz = responseSize || 0;
  const sizeStr = sz > 1024 * 1024 ? `${(sz / 1024 / 1024).toFixed(2)} MB`
    : sz > 1024 ? `${(sz / 1024).toFixed(1)} KB` : `${sz} B`;
  return (
    <div className="res-meta">
      <span className="res-status" style={{ color: statusColor(response.status) }}>
        {response.status} {response.statusText}
      </span>
      {responseTime != null && <span className="res-badge res-badge-time">{responseTime} ms</span>}
      <span className="res-badge">{sizeStr}</span>
    </div>
  );
}

export default function ResponsePanel() {
  const [activeTab, setActiveTab] = useState('body');
  const [bodyView, setBodyView] = useState('pretty');
  const { getActiveTab } = useStore();
  const tab = getActiveTab();

  // Track exact pixel height of the body container for Monaco
  const bodyRef = useRef(null);
  const editorRef = useRef(null);
  const [bodyHeight, setBodyHeight] = useState(400);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    // Set initial height
    if (el.clientHeight > 0) setBodyHeight(el.clientHeight);
    const ro = new ResizeObserver(([entry]) => {
      const h = entry.contentRect.height;
      if (h > 0) {
        setBodyHeight(h);
        editorRef.current?.layout({ height: h, width: entry.contentRect.width });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!tab) return null;
  const { response, loading, responseTime, responseSize } = tab;

  const copyResponse = () => {
    if (!response) return;
    navigator.clipboard.writeText(response.raw || '').then(() => toast.success('Copied!'));
  };

  const downloadResponse = () => {
    if (!response) return;
    const ct = response.contentType || '';
    const ext = ct.includes('json') ? 'json' : ct.includes('xml') ? 'xml' : ct.includes('html') ? 'html' : 'txt';
    const blob = new Blob([response.raw], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `response.${ext}`; a.click();
  };

  const isJson = response?.parsed !== null && response?.parsed !== undefined;
  let prettyJson = '';
  if (isJson) {
    try { prettyJson = JSON.stringify(JSON.parse(response.raw), null, 2); }
    catch { prettyJson = response.raw || ''; }
  }

  const headerCount = response ? Object.keys(response.headers || {}).length : 0;
  const testCount = (tab.testResults || []).length;
  const testPassed = (tab.testResults || []).filter(r => r.pass).length;

  const resTabs = [
    { id: 'body', label: 'Body' },
    { id: 'headers', label: 'Headers', badge: headerCount || null },
    { id: 'cookies', label: 'Cookies' },
    { id: 'tests', label: 'Test Results', badge: testCount ? `${testPassed}/${testCount}` : null },
    { id: 'info', label: 'Info' },
  ];

  const showMonaco = activeTab === 'body' && bodyView === 'pretty' && isJson && !loading && response;

  return (
    <div className="response-panel">
      {/* Top bar */}
      <div className="res-header">
        <div className="res-tabs">
          {resTabs.map(t => (
            <button key={t.id} className={`res-tab ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => setActiveTab(t.id)}>
              {t.label}
              {t.badge != null && <span className="res-tab-badge">{t.badge}</span>}
            </button>
          ))}
        </div>

        <MetaBar response={response} responseTime={responseTime} responseSize={responseSize} />

        {response && (
          <div className="res-actions">
            {activeTab === 'body' && (
              <>
                <button className={`res-view-btn ${bodyView === 'pretty' ? 'active' : ''}`}
                  onClick={() => setBodyView('pretty')}>Pretty</button>
                <button className={`res-view-btn ${bodyView === 'raw' ? 'active' : ''}`}
                  onClick={() => setBodyView('raw')}>Raw</button>
              </>
            )}
            <button className="btn btn-ghost res-action-btn" onClick={copyResponse}>Copy</button>
            <button className="btn btn-ghost res-action-btn" onClick={downloadResponse}>Save</button>
          </div>
        )}
      </div>

      {/* Body area */}
      <div ref={bodyRef} className={`res-body ${showMonaco ? 'res-body--monaco' : 'res-body--scroll'}`}>

        {/* Loading */}
        {loading && (
          <div className="res-loading">
            <div className="spinner" />
            <span>Waiting for response…</span>
          </div>
        )}

        {/* Empty */}
        {!loading && !response && (
          <div className="empty-state">
            <div className="icon" style={{ fontSize: 36, opacity: 0.25 }}>📡</div>
            <p>Hit <strong>Send</strong> to see the response</p>
            <small>Enter a URL above and press Send</small>
          </div>
        )}

        {/* Body — Monaco pretty JSON (explicit pixel height via ResizeObserver) */}
        {showMonaco && (
          <Editor
            height={bodyHeight}
            width="100%"
            language="json"
            value={prettyJson}
            theme="apiforge"
            beforeMount={monacoTheme}
            options={RES_MONACO_OPTIONS}
            loading={<div className="res-monaco-loading">Loading…</div>}
            onMount={editor => {
              editorRef.current = editor;
              const el = bodyRef.current;
              if (el && el.clientHeight > 0) {
                editor.layout({ height: el.clientHeight, width: el.clientWidth });
              }
            }}
          />
        )}

        {/* Body — raw or non-JSON pretty */}
        {!loading && response && activeTab === 'body' && !showMonaco && (
          <pre className="res-raw-text fade-in">
            {response.raw || '(empty response)'}
          </pre>
        )}

        {/* Headers */}
        {!loading && response && activeTab === 'headers' && (
          <div className="fade-in">
            {headerCount === 0 ? (
              <div className="res-empty-msg">No response headers</div>
            ) : (
              <table className="res-table">
                <thead><tr><th>Header</th><th>Value</th></tr></thead>
                <tbody>
                  {Object.entries(response.headers).map(([k, v]) => (
                    <tr key={k}>
                      <td className="res-table-key">{k}</td>
                      <td className="res-table-val">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Cookies */}
        {!loading && response && activeTab === 'cookies' && (
          <div className="fade-in">
            {(() => {
              const setCookie = response.headers?.['set-cookie'] || '';
              if (!setCookie) return <div className="res-empty-msg">No cookies in response</div>;
              const cookies = setCookie.split(/,(?=[^;]+=[^;]+)/).map(c => {
                const parts = c.trim().split(';');
                const [nv, ...attrs] = parts;
                const [name, ...vals] = (nv || '').split('=');
                return { name: name?.trim(), value: vals.join('=').trim(), attrs: attrs.map(a => a.trim()).join('; ') };
              });
              return (
                <table className="res-table">
                  <thead><tr><th>Name</th><th>Value</th><th>Attributes</th></tr></thead>
                  <tbody>
                    {cookies.map((c, i) => (
                      <tr key={i}>
                        <td className="res-table-key">{c.name}</td>
                        <td className="res-table-val">{c.value}</td>
                        <td className="res-table-val" style={{ color: 'var(--text3)' }}>{c.attrs}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()}
          </div>
        )}

        {/* Test Results */}
        {!loading && activeTab === 'tests' && (
          <div className="fade-in">
            {(tab.testResults || []).length === 0 ? (
              <div className="res-empty-msg">No test results — add tests in the Tests tab</div>
            ) : (
              <div className="test-results">
                <div className="test-results-title">
                  {testPassed}/{testCount} tests passed
                </div>
                {(tab.testResults || []).map((r, i) => (
                  <div key={i} className={`test-result ${r.pass ? 'pass' : 'fail'}`}>
                    <span className="test-result-icon">{r.pass ? '✓' : '✗'}</span>
                    <div>
                      <div className="test-result-name">{r.name}</div>
                      {!r.pass && r.msg && <div className="test-result-msg">{r.msg}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Info */}
        {!loading && response && activeTab === 'info' && (
          <div className="res-info fade-in">
            {[
              ['Request URL', response.finalUrl || tab.url],
              ['Method', tab.method],
              ['Status', `${response.status} ${response.statusText}`],
              ['Time', `${responseTime ?? 0} ms`],
              ['Size', `${((responseSize || 0) / 1024).toFixed(2)} KB`],
              ['Content-Type', response.contentType || '(none)'],
            ].map(([label, val]) => (
              <div key={label} className="res-info-row">
                <div className="res-info-label">{label}</div>
                <div className="res-info-val"
                  style={label === 'Status' ? { color: statusColor(response.status) } : {}}>
                  {val}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
