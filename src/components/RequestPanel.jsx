import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import useStore, { makeKVRow } from '../store';
import toast from 'react-hot-toast';
import './RequestPanel.css';

const MONACO_OPTIONS = {
  minimap: { enabled: false },
  fontSize: 12,
  lineNumbers: 'on',
  scrollBeyondLastLine: false,
  tabSize: 2,
  automaticLayout: true,
  wordWrap: 'off',
  padding: { top: 8, bottom: 8 },
  renderLineHighlight: 'none',
  overviewRulerBorder: false,
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
};

function monacoTheme(monaco) {
  monaco.editor.defineTheme('apiforge', {
    base: 'vs-dark', inherit: true, rules: [],
    colors: {
      'editor.background': '#1d1d1d',
      'editor.lineHighlightBackground': '#252525',
      'editorGutter.background': '#1d1d1d',
      'editorLineNumber.foreground': '#555',
      'editorLineNumber.activeForeground': '#888',
    },
  });
}

// ── KV Editor ─────────────────────────────────────────────
function KVEditor({ tabId, field, cols = 3 }) {
  const { getActiveTab, addKV, removeKV, updateKV } = useStore();
  const tab = getActiveTab();
  if (!tab) return null;
  const rows = tab[field] || [];
  const enabled = rows.filter(r => r.enabled && r.key).length;

  return (
    <div className="kv-editor">
      <table className="kv-table">
        <thead>
          <tr>
            <th style={{ width: 28 }}></th>
            <th>Key</th>
            <th>Value</th>
            {cols >= 3 && <th>Description</th>}
            <th style={{ width: 32 }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id}>
              <td>
                <input
                  type="checkbox"
                  className="kv-cb"
                  checked={row.enabled}
                  onChange={e => updateKV(tabId, field, row.id, { enabled: e.target.checked })}
                />
              </td>
              <td>
                <input
                  className={`kv-input ${!row.enabled ? 'muted' : ''}`}
                  placeholder="Key"
                  value={row.key}
                  onChange={e => updateKV(tabId, field, row.id, { key: e.target.value })}
                />
              </td>
              <td>
                <input
                  className={`kv-input ${!row.enabled ? 'muted' : ''}`}
                  placeholder="Value"
                  value={row.value}
                  onChange={e => updateKV(tabId, field, row.id, { value: e.target.value })}
                />
              </td>
              {cols >= 3 && (
                <td>
                  <input
                    className={`kv-input ${!row.enabled ? 'muted' : ''}`}
                    placeholder="Description"
                    value={row.desc || ''}
                    onChange={e => updateKV(tabId, field, row.id, { desc: e.target.value })}
                  />
                </td>
              )}
              <td>
                <button className="kv-del" onClick={() => removeKV(tabId, field, row.id)}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="kv-add" onClick={() => addKV(tabId, field)}>+ Add Row</button>
    </div>
  );
}

// ── Body Editor ───────────────────────────────────────────
function BodyEditor({ tab }) {
  const { updateTab } = useStore();
  const types = [
    { value: 'none', label: 'none' },
    { value: 'json', label: 'JSON' },
    { value: 'formdata', label: 'form-data' },
    { value: 'urlencoded', label: 'x-www-form-urlencoded' },
    { value: 'raw', label: 'raw' },
    { value: 'graphql', label: 'GraphQL' },
  ];

  const formatJson = () => {
    try {
      const pretty = JSON.stringify(JSON.parse(tab.bodyText), null, 2);
      updateTab(tab.id, { bodyText: pretty });
      toast.success('JSON formatted');
    } catch {
      toast.error('Invalid JSON');
    }
  };

  return (
    <div className="body-editor">
      <div className="body-types">
        {types.map(t => (
          <label key={t.value} className={`body-type-opt ${tab.bodyType === t.value ? 'active' : ''}`}>
            <input
              type="radio" name={`btype-${tab.id}`} value={t.value}
              checked={tab.bodyType === t.value}
              onChange={() => updateTab(tab.id, { bodyType: t.value })}
            />
            {t.label}
          </label>
        ))}
      </div>

      {tab.bodyType === 'none' && (
        <div className="body-empty">This request has no body</div>
      )}

      {['json', 'graphql'].includes(tab.bodyType) && (
        <div className="body-text-wrap">
          <div className="body-text-toolbar">
            <span className="body-type-label">{tab.bodyType === 'json' ? 'JSON' : 'GraphQL'}</span>
            {tab.bodyType === 'json' && (
              <button className="btn btn-link" onClick={formatJson}>Format</button>
            )}
            <button className="btn btn-link" onClick={() => updateTab(tab.id, { bodyText: '' })}>Clear</button>
          </div>
          <div className="body-monaco-wrap">
            <Editor
              height="200px"
              language={tab.bodyType === 'graphql' ? 'graphql' : 'json'}
              value={tab.bodyText || ''}
              onChange={v => updateTab(tab.id, { bodyText: v || '' })}
              theme="apiforge"
              beforeMount={monacoTheme}
              options={MONACO_OPTIONS}
              loading={<div className="body-monaco-loading">Loading editor…</div>}
            />
          </div>
        </div>
      )}

      {tab.bodyType === 'raw' && (
        <div className="body-text-wrap">
          <div className="body-text-toolbar">
            <span className="body-type-label">Plain Text</span>
            <button className="btn btn-link" onClick={() => updateTab(tab.id, { bodyText: '' })}>Clear</button>
          </div>
          <textarea
            className="body-textarea"
            value={tab.bodyText}
            onChange={e => updateTab(tab.id, { bodyText: e.target.value })}
            placeholder="Request body..."
            spellCheck={false}
          />
        </div>
      )}

      {(tab.bodyType === 'formdata' || tab.bodyType === 'urlencoded') && (
        <div className="kv-editor">
          <KVEditor
            tabId={tab.id}
            field={tab.bodyType === 'formdata' ? 'formdata' : 'urlencoded'}
            cols={2}
          />
        </div>
      )}
    </div>
  );
}

// ── Auth Editor ───────────────────────────────────────────
function AuthEditor({ tab }) {
  const { updateTabDeep, updateTab } = useStore();
  const auth = tab.auth;

  const upAuth = (field, val) => updateTabDeep(tab.id, `auth.${field}`, val);

  const fetchOAuth2Token = async () => {
    try {
      toast.loading('Fetching token...', { id: 'oauth2' });
      const res = await fetch(auth.oauth2.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: auth.oauth2.clientId,
          client_secret: auth.oauth2.clientSecret,
          scope: auth.oauth2.scope,
        }),
      });
      const data = await res.json();
      if (data.access_token) {
        updateTabDeep(tab.id, 'auth.oauth2.accessToken', data.access_token);
        toast.success('Token obtained!', { id: 'oauth2' });
      } else {
        toast.error('No access_token in response', { id: 'oauth2' });
      }
    } catch (e) {
      toast.error('OAuth2 error: ' + e.message, { id: 'oauth2' });
    }
  };

  return (
    <div className="auth-editor">
      <div className="auth-type-row">
        <label className="auth-label">Auth Type</label>
        <select className="select auth-select" value={auth.type} onChange={e => upAuth('type', e.target.value)}>
          <option value="none">No Auth</option>
          <option value="bearer">Bearer Token</option>
          <option value="basic">Basic Auth</option>
          <option value="apikey">API Key</option>
          <option value="jwt">JWT Bearer</option>
          <option value="oauth2">OAuth 2.0</option>
        </select>
      </div>

      {auth.type === 'none' && (
        <div className="auth-hint">No authentication will be sent with this request.</div>
      )}

      {auth.type === 'bearer' && (
        <div className="auth-fields">
          <AuthField label="Token" value={auth.token} onChange={v => upAuth('token', v)} placeholder="Enter Bearer token" />
          <div className="auth-preview">Authorization: Bearer {auth.token || '<token>'}</div>
        </div>
      )}

      {auth.type === 'basic' && (
        <div className="auth-fields">
          <AuthField label="Username" value={auth.username} onChange={v => upAuth('username', v)} placeholder="Username" />
          <AuthField label="Password" value={auth.password} onChange={v => upAuth('password', v)} placeholder="Password" type="password" />
          <div className="auth-preview">Authorization: Basic {auth.username ? btoa(`${auth.username}:${auth.password}`) : '<base64>'}</div>
        </div>
      )}

      {auth.type === 'apikey' && (
        <div className="auth-fields">
          <AuthField label="Key Name" value={auth.keyName} onChange={v => upAuth('keyName', v)} placeholder="X-API-Key" />
          <AuthField label="Key Value" value={auth.keyValue} onChange={v => upAuth('keyValue', v)} placeholder="Your API key" />
          <div className="auth-type-row">
            <label className="auth-label">Add to</label>
            <select className="select" style={{ width: 160 }} value={auth.keyIn} onChange={e => upAuth('keyIn', e.target.value)}>
              <option value="header">Header</option>
              <option value="query">Query Param</option>
            </select>
          </div>
        </div>
      )}

      {auth.type === 'jwt' && (
        <div className="auth-fields">
          <AuthField label="JWT Token" value={auth.jwt} onChange={v => upAuth('jwt', v)} placeholder="Paste JWT token" />
          <div className="auth-preview">Authorization: Bearer {auth.jwt ? auth.jwt.substring(0, 30) + '...' : '<token>'}</div>
        </div>
      )}

      {auth.type === 'oauth2' && (
        <div className="auth-fields">
          <AuthField label="Token URL" value={auth.oauth2.tokenUrl} onChange={v => updateTabDeep(tab.id, 'auth.oauth2.tokenUrl', v)} placeholder="https://auth.example.com/token" />
          <AuthField label="Client ID" value={auth.oauth2.clientId} onChange={v => updateTabDeep(tab.id, 'auth.oauth2.clientId', v)} placeholder="Client ID" />
          <AuthField label="Client Secret" value={auth.oauth2.clientSecret} onChange={v => updateTabDeep(tab.id, 'auth.oauth2.clientSecret', v)} placeholder="Client Secret" type="password" />
          <AuthField label="Scope" value={auth.oauth2.scope} onChange={v => updateTabDeep(tab.id, 'auth.oauth2.scope', v)} placeholder="read write" />
          <button className="btn btn-ghost oauth2-btn" onClick={fetchOAuth2Token}>🔑 Get Token</button>
          {auth.oauth2.accessToken && (
            <div className="auth-preview">✓ Token: {auth.oauth2.accessToken.substring(0, 40)}...</div>
          )}
        </div>
      )}
    </div>
  );
}

function AuthField({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div className="auth-field">
      <label className="auth-label">{label}</label>
      <input
        className="input auth-input"
        type={type}
        placeholder={placeholder}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}

// ── Script Editor ─────────────────────────────────────────
function ScriptEditor({ tab, field, placeholder, hint }) {
  const { updateTab } = useStore();
  const logs = tab.scriptLogs || [];
  const testResults = tab.testResults || [];

  return (
    <div className="script-editor">
      <textarea
        className="script-textarea"
        value={tab[field] || ''}
        onChange={e => updateTab(tab.id, { [field]: e.target.value })}
        placeholder={placeholder}
        spellCheck={false}
      />
      <div className="script-hint">{hint}</div>

      {field === 'preScript' && logs.length > 0 && (
        <div className="script-output">
          <div className="script-output-title">Console Output</div>
          {logs.map((log, i) => <div key={i} className="script-log">{log}</div>)}
        </div>
      )}

      {field === 'testScript' && testResults.length > 0 && (
        <div className="test-results">
          <div className="test-results-title">
            {testResults.filter(r => r.pass).length}/{testResults.length} tests passed
          </div>
          {testResults.map((r, i) => (
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
  );
}

const TEST_SNIPPETS = [
  { label: 'Status 200', code: "test('Status is 200', () => expect(response.status).to.equal(200));" },
  { label: 'Status 2xx', code: "test('Status is 2xx', () => expect(response.status).to.be.above(199));" },
  { label: 'Response has body', code: "test('Has body', () => expect(response.text()).to.exist);" },
  { label: 'Response is JSON', code: "test('Is JSON', () => expect(response.json()).to.exist);" },
  { label: 'Field exists', code: "test('Field exists', () => expect(response.json().id).to.exist);" },
  { label: 'Response time < 1s', code: "test('Fast', () => expect(response.time).to.be.below(1000));" },
  { label: 'Content-Type JSON', code: "test('Content-Type', () => expect(response.headers['content-type']).to.include('json'));" },
  { label: 'Array length > 0', code: "test('Not empty array', () => expect(response.json().length).to.be.above(0));" },
];

// ── Main RequestPanel ──────────────────────────────────────
export default function RequestPanel() {
  const [activeTab, setActiveTab] = useState('params');
  const [showSnippets, setShowSnippets] = useState(false);
  const { getActiveTab } = useStore();
  const tab = getActiveTab();
  if (!tab) return null;

  const paramCount = (tab.params || []).filter(p => p.enabled && p.key).length;
  const headerCount = (tab.headers || []).filter(h => h.enabled && h.key).length;
  const hasBody = tab.bodyType !== 'none';
  const hasAuth = tab.auth?.type !== 'none';
  const testCount = (tab.testResults || []).length;
  const testPassed = (tab.testResults || []).filter(r => r.pass).length;

  const tabs = [
    { id: 'params', label: 'Params', badge: paramCount || null },
    { id: 'headers', label: 'Headers', badge: headerCount },
    { id: 'body', label: 'Body', dot: hasBody },
    { id: 'auth', label: 'Auth', dot: hasAuth },
    { id: 'prescripts', label: 'Pre-script', dot: !!tab.preScript },
    { id: 'tests', label: 'Tests', badge: testCount ? `${testPassed}/${testCount}` : null, badgeClass: testCount && testPassed < testCount ? 'err' : '' },
  ];

  const insertSnippet = (code) => {
    const current = tab.testScript || '';
    useStore.getState().updateTab(tab.id, { testScript: (current ? current + '\n' : '') + code });
    setShowSnippets(false);
    toast.success('Snippet inserted');
  };

  return (
    <div className="request-panel">
      <div className="req-tabs">
        {tabs.map(t => (
          <button
            key={t.id}
            className={`req-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
            {t.badge != null && (
              <span className={`req-tab-badge ${t.badgeClass || ''}`}>{t.badge}</span>
            )}
            {t.dot && !t.badge && <span className="req-tab-dot" />}
          </button>
        ))}

        {activeTab === 'tests' && (
          <button className="btn btn-link req-snippets-btn" onClick={() => setShowSnippets(true)}>
            📋 Snippets
          </button>
        )}
      </div>

      <div className="req-content scroll">
        {activeTab === 'params' && <KVEditor tabId={tab.id} field="params" cols={3} />}
        {activeTab === 'headers' && <KVEditor tabId={tab.id} field="headers" cols={3} />}
        {activeTab === 'body' && <BodyEditor tab={tab} />}
        {activeTab === 'auth' && <AuthEditor tab={tab} />}
        {activeTab === 'prescripts' && (
          <ScriptEditor
            tab={tab}
            field="preScript"
            placeholder={`// Runs before every request\n// env.get('KEY'), env.set('KEY','val'), console.log(...)\n\n// Example: set auth token\n// env.set('TOKEN', 'my-token');`}
            hint="Available: env.get('KEY') · env.set('KEY', 'val') · console.log(...)"
          />
        )}
        {activeTab === 'tests' && (
          <ScriptEditor
            tab={tab}
            field="testScript"
            placeholder={`// Runs after response is received\n// test('Name', fn), expect(val).to.equal(x)\n// response.status, response.json(), response.headers\n\n// Example:\n// test('Status 200', () => expect(response.status).to.equal(200));\n// test('Has data', () => expect(response.json().data).to.exist);`}
            hint="test('Name', fn) · expect(val).to.equal(x) · response.status / .json() / .headers"
          />
        )}
      </div>

      {/* Snippets modal */}
      {showSnippets && (
        <div className="modal-overlay" onClick={() => setShowSnippets(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">📋 Test Snippets</div>
            <div className="snippets-list">
              {TEST_SNIPPETS.map((s, i) => (
                <div key={i} className="snippet-item">
                  <div>
                    <div className="snippet-label">{s.label}</div>
                    <code className="snippet-code">{s.code}</code>
                  </div>
                  <button className="btn btn-ghost snippet-insert" onClick={() => insertSnippet(s.code)}>Insert</button>
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowSnippets(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
