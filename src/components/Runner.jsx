import React, { useState, useRef } from 'react';
import useStore, { METHOD_COLORS } from '../store';
import { executeRequest, runTests } from '../utils/request';
import toast from 'react-hot-toast';
import './Runner.css';

const DELAY_OPTIONS = [0, 100, 200, 500, 1000, 2000];

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseDataFile(content, filename) {
  const ext = filename.split('.').pop().toLowerCase();
  if (ext === 'json') {
    const data = JSON.parse(content);
    if (!Array.isArray(data)) throw new Error('JSON file must be an array of objects');
    return data;
  }
  // CSV
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('CSV needs a header row + at least one data row');
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = parseCSVLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h.trim()] = vals[i] !== undefined ? vals[i] : ''; });
    return row;
  });
}

export default function Runner() {
  const { collections, runnerOpen, setRunnerOpen, addHistory } = useStore();
  const [selectedCollId, setSelectedCollId] = useState(collections[0]?.id || '');
  const [selectedRequests, setSelectedRequests] = useState({});
  const [iterations, setIterations] = useState(1);
  const [delay, setDelay] = useState(0);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState([]);
  const [progress, setProgress] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [expandedResult, setExpandedResult] = useState(null);
  const [fileData, setFileData] = useState(null);
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const abortRef = useRef(false);
  const fileInputRef = useRef();
  const resolveEnvBase = useStore.getState().resolveEnv;

  if (!runnerOpen) return null;

  const selectedColl = collections.find(c => c.id === selectedCollId);
  const requests = selectedColl?.requests || [];

  const toggleRequest = (id) => setSelectedRequests(prev => ({ ...prev, [id]: !prev[id] }));
  const toggleAll = () => {
    const allSelected = requests.every(r => selectedRequests[r.id] !== false);
    const next = {};
    requests.forEach(r => { next[r.id] = !allSelected; });
    setSelectedRequests(next);
  };
  const isSelected = (id) => selectedRequests[id] !== false;
  const selectedCount = requests.filter(r => isSelected(r.id)).length;
  const sleep = (ms) => new Promise(res => setTimeout(res, ms));
  const iters = fileData ? fileData.length : iterations;

  const loadFile = (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['json', 'csv'].includes(ext)) { setFileError('Only .json and .csv files are supported'); return; }
    setFileError('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = parseDataFile(ev.target.result, file.name);
        if (data.length === 0) { setFileError('File has no data rows'); return; }
        setFileData(data);
        setFileName(file.name);
        setIterations(data.length);
        toast.success(`Loaded ${data.length} rows from ${file.name}`);
      } catch (err) {
        setFileError(err.message);
        setFileData(null);
        setFileName('');
      }
    };
    reader.readAsText(file);
  };

  const handleFileInput = (e) => { loadFile(e.target.files[0]); e.target.value = ''; };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    loadFile(e.dataTransfer.files[0]);
  };

  const clearFile = () => { setFileData(null); setFileName(''); setFileError(''); setIterations(1); };

  // Resolver: file row vars take priority over env vars
  const makeRowResolver = (row) => (str) => {
    if (!str) return str;
    return str.replace(/\{\{([^}]+)\}\}/g, (match, k) => {
      const key = k.trim();
      if (row && key in row) return row[key];
      return resolveEnvBase(match);
    });
  };

  const runCollection = async () => {
    const toRun = requests.filter(r => isSelected(r.id));
    if (!toRun.length) { toast.error('Select at least one request'); return; }

    setRunning(true);
    abortRef.current = false;
    setResults([]);
    setProgress(0);
    const total = toRun.length * iters;
    setTotalCount(total);

    const allResults = [];
    let done = 0;

    for (let iter = 0; iter < iters; iter++) {
      if (abortRef.current) break;
      const rowData = fileData ? fileData[iter] : null;
      const resolver = makeRowResolver(rowData);

      for (const req of toRun) {
        if (abortRef.current) break;

        const result = {
          id: `${req.id}-${iter}-${Date.now()}`,
          name: req.name, method: req.method, url: req.url,
          iteration: iter + 1, rowData,
          status: null, time: null, size: null, error: null,
          testResults: [], response: null,
        };

        try {
          const ctrl = new AbortController();
          const tab = {
            method: req.method, url: req.url,
            params: req.params || [],
            headers: req.headers || [
              { key: 'Content-Type', value: 'application/json', enabled: true },
              { key: 'Accept', value: '*/*', enabled: true },
            ],
            bodyType: req.bodyType || 'none',
            bodyText: req.bodyText || '',
            formdata: [], urlencoded: [],
            auth: req.auth || { type: 'none' },
          };
          const res = await executeRequest(tab, resolver, ctrl.signal);
          result.status = res.status;
          result.time = res.time;
          result.size = res.size;
          result.response = res;
          if (req.testScript) result.testResults = runTests(req.testScript, res);
          addHistory({ method: req.method, url: req.url, status: res.status, time: res.time });
        } catch (err) {
          result.error = err.message;
          result.status = 0;
        }

        allResults.push(result);
        done++;
        setProgress(Math.round((done / total) * 100));
        setResults([...allResults]);

        if (delay > 0 && !(iter === iters - 1 && toRun.indexOf(req) === toRun.length - 1)) {
          await sleep(delay);
        }
      }
    }

    setRunning(false);
    const passed = allResults.filter(r => r.status >= 200 && r.status < 300).length;
    toast.success(`Run complete: ${passed}/${allResults.length} successful`);
  };

  const stopRunner = () => { abortRef.current = true; setRunning(false); toast('Runner stopped'); };

  const exportResults = () => {
    const data = JSON.stringify(results.map(r => ({
      name: r.name, method: r.method, url: r.url,
      iteration: r.iteration, rowData: r.rowData,
      status: r.status, time: r.time, size: r.size,
      error: r.error, testResults: r.testResults,
    })), null, 2);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = 'runner-results.json';
    a.click();
    toast.success('Results exported');
  };

  const statusColor = (s) => s >= 500 ? 'var(--err)' : s >= 400 ? 'var(--warn)' : s >= 200 ? 'var(--ok)' : 'var(--text3)';
  const passed = results.filter(r => !r.error && r.status >= 200 && r.status < 300).length;
  const failed = results.length - passed;

  return (
    <div className="runner-overlay" onClick={(e) => { if (e.target === e.currentTarget) setRunnerOpen(false); }}>
      <div className="runner-panel">
        {/* Header */}
        <div className="runner-header">
          <div>
            <h2 className="runner-title">Collection Runner</h2>
            <p className="runner-subtitle">Run requests with iterations, delays, and data-driven file input</p>
          </div>
          <button className="runner-close" onClick={() => setRunnerOpen(false)}>✕</button>
        </div>

        <div className="runner-body">
          {/* ── Config column ── */}
          <div className="runner-config">

            {/* Collection */}
            <div className="runner-section">
              <label className="runner-label">Collection</label>
              <select
                className="select runner-coll-select"
                value={selectedCollId}
                onChange={e => { setSelectedCollId(e.target.value); setSelectedRequests({}); setResults([]); }}
              >
                {collections.length === 0 && <option value="">No collections</option>}
                {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Requests */}
            <div className="runner-section">
              <div className="runner-requests-header">
                <label className="runner-label">Requests ({selectedCount}/{requests.length} selected)</label>
                <button className="btn btn-link" onClick={toggleAll}>
                  {requests.every(r => isSelected(r.id)) ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <div className="runner-requests-list">
                {requests.length === 0 && (
                  <div style={{ color: 'var(--text3)', fontSize: 12, padding: '12px' }}>No requests in this collection</div>
                )}
                {requests.map((req, i) => (
                  <label key={req.id} className="runner-req-item">
                    <input type="checkbox" className="kv-cb" checked={isSelected(req.id)} onChange={() => toggleRequest(req.id)} />
                    <span className="runner-req-num">{i + 1}</span>
                    <span className="runner-req-method" style={{ color: METHOD_COLORS[req.method] }}>{req.method}</span>
                    <span className="runner-req-name">{req.name}</span>
                    <span className="runner-req-url">{req.url}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Data file */}
            <div className="runner-section">
              <label className="runner-label">
                Data File
                <span className="runner-label-opt"> — JSON array or CSV</span>
              </label>

              {!fileData ? (
                <div
                  className={`runner-file-drop ${dragOver ? 'drag-over' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                >
                  <div className="runner-file-icon">📂</div>
                  <div className="runner-file-hint">Drop file here or click to browse</div>
                  <div className="runner-file-formats">.json &nbsp;·&nbsp; .csv</div>
                  {fileError && <div className="runner-file-error">{fileError}</div>}
                </div>
              ) : (
                <div className="runner-file-loaded">
                  <div className="runner-file-info">
                    <div className="runner-file-name">📄 {fileName}</div>
                    <div className="runner-file-rows">
                      {fileData.length} rows &nbsp;·&nbsp; vars: {Object.keys(fileData[0] || {}).map(k => `{{${k}}}`).join(' ')}
                    </div>
                  </div>
                  <button className="runner-file-clear btn btn-ghost" onClick={clearFile}>✕</button>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.csv"
                style={{ display: 'none' }}
                onChange={handleFileInput}
              />
            </div>

            {/* Settings */}
            <div className="runner-section runner-settings">
              <div className="runner-setting">
                <label className="runner-label">Iterations</label>
                <div className="runner-setting-control">
                  <input
                    type="number" min="1" max="1000"
                    className="input runner-number-input"
                    value={iters}
                    disabled={!!fileData}
                    onChange={e => setIterations(Math.max(1, parseInt(e.target.value) || 1))}
                  />
                  <span className="runner-setting-hint">{fileData ? 'set by file' : 'times'}</span>
                </div>
              </div>
              <div className="runner-setting">
                <label className="runner-label">Delay</label>
                <div className="runner-setting-control">
                  <select className="select" value={delay} onChange={e => setDelay(parseInt(e.target.value))}>
                    {DELAY_OPTIONS.map(d => <option key={d} value={d}>{d === 0 ? 'None' : `${d}ms`}</option>)}
                  </select>
                  <span className="runner-setting-hint">between requests</span>
                </div>
              </div>
            </div>

            <div className="runner-run-row">
              {!running ? (
                <button
                  className="btn btn-primary runner-run-btn"
                  onClick={runCollection}
                  disabled={selectedCount === 0}
                >
                  ▶ Run {selectedCount} request{selectedCount !== 1 ? 's' : ''}
                  {iters > 1 ? ` × ${iters} iter.` : ''}
                </button>
              ) : (
                <button className="btn btn-danger runner-run-btn" onClick={stopRunner}>
                  ⏹ Stop Runner
                </button>
              )}
            </div>
          </div>

          {/* ── Results column ── */}
          <div className="runner-results">
            {(running || results.length > 0) && (
              <div className="runner-progress-wrap">
                <div className="runner-progress-header">
                  <div className="runner-progress-stats">
                    {running ? (
                      <span style={{ color: 'var(--text2)' }}>{progress}% — {results.length} / {totalCount} done</span>
                    ) : (
                      <span>
                        <span style={{ color: 'var(--ok)', fontWeight: 600 }}>{passed} passed</span>
                        {' · '}
                        <span style={{ color: failed > 0 ? 'var(--err)' : 'var(--text3)', fontWeight: failed > 0 ? 600 : 400 }}>{failed} failed</span>
                        <span style={{ color: 'var(--text3)' }}> · {results.length} total</span>
                      </span>
                    )}
                  </div>
                  {!running && results.length > 0 && (
                    <button className="btn btn-ghost runner-export" onClick={exportResults}>↓ Export JSON</button>
                  )}
                </div>
                <div className="runner-progress-bar">
                  <div className="runner-progress-fill" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}

            {results.length === 0 && !running && (
              <div className="empty-state" style={{ height: '100%' }}>
                <div className="icon" style={{ fontSize: 36, opacity: 0.3 }}>▶</div>
                <p>Configure and run your collection</p>
                <small>Results will appear here</small>
              </div>
            )}

            {results.length > 0 && (
              <div className="runner-result-list scroll">
                {results.map((r, i) => (
                  <div key={r.id}>
                    <div
                      className={`runner-result-item ${r.error ? 'errored' : r.status >= 200 && r.status < 300 ? 'success' : 'failed'}`}
                      onClick={() => setExpandedResult(expandedResult === r.id ? null : r.id)}
                    >
                      <div className="rr-left">
                        <span className="rr-num">{i + 1}</span>
                        {(fileData || iters > 1) && <span className="rr-iter">{fileData ? `row ${r.iteration}` : `iter ${r.iteration}`}</span>}
                        <span className="rr-method" style={{ color: METHOD_COLORS[r.method] }}>{r.method}</span>
                        <span className="rr-name">{r.name}</span>
                      </div>
                      <div className="rr-right">
                        {r.error ? (
                          <span className="rr-error">Error</span>
                        ) : (
                          <>
                            <span className="rr-status" style={{ color: statusColor(r.status) }}>{r.status}</span>
                            <span className="rr-time">{r.time}ms</span>
                            {r.size != null && (
                              <span className="rr-size">
                                {r.size < 1024 ? r.size + 'B' : (r.size / 1024).toFixed(1) + 'KB'}
                              </span>
                            )}
                          </>
                        )}
                        {r.testResults.length > 0 && (
                          <span className={`rr-tests ${r.testResults.every(t => t.pass) ? 'all-pass' : 'some-fail'}`}>
                            {r.testResults.filter(t => t.pass).length}/{r.testResults.length} tests
                          </span>
                        )}
                        <span className="rr-expand">{expandedResult === r.id ? '▲' : '▼'}</span>
                      </div>
                    </div>

                    {expandedResult === r.id && (
                      <div className="rr-detail">
                        <div className="rr-detail-url">{r.url}</div>

                        {r.rowData && (
                          <div className="rr-row-data-wrap">
                            {Object.entries(r.rowData).map(([k, v]) => (
                              <span key={k} className="rr-row-var">
                                <span className="rr-row-key">{k}</span>
                                <span className="rr-row-eq"> = </span>
                                <span>{String(v)}</span>
                              </span>
                            ))}
                          </div>
                        )}

                        {r.error && <div className="rr-detail-error">{r.error}</div>}

                        {r.response && (
                          <div className="rr-detail-body">
                            <div className="rr-detail-label">Response</div>
                            <pre className="rr-detail-pre">{(r.response.raw || '').substring(0, 600)}</pre>
                          </div>
                        )}

                        {r.testResults.length > 0 && (
                          <div className="rr-detail-tests">
                            {r.testResults.map((t, ti) => (
                              <div key={ti} className={`rr-test-row ${t.pass ? 'pass' : 'fail'}`}>
                                <span>{t.pass ? '✓' : '✗'}</span>
                                <span>{t.name}</span>
                                {!t.pass && t.msg && <span className="rr-test-msg">{t.msg}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
