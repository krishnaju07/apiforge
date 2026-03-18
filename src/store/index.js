import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { v4 as uuid } from 'uuid';

const LS = {
  save: (k, v) => { try { localStorage.setItem('apiforge_' + k, JSON.stringify(v)); } catch {} },
  load: (k, def) => { try { const r = localStorage.getItem('apiforge_' + k); return r ? JSON.parse(r) : def; } catch { return def; } },
};

export const METHOD_COLORS = {
  GET: '#61AFFE', POST: '#49CC90', PUT: '#FCA130', PATCH: '#50E3C2',
  DELETE: '#F93E3E', HEAD: '#9012FE', OPTIONS: '#0D5AA7',
};

export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

export function makeKVRow(key = '', value = '', desc = '') {
  return { id: uuid(), key, value, desc, enabled: true };
}

export function makeTab(overrides = {}) {
  return {
    id: uuid(),
    name: 'New Request',
    method: 'GET',
    url: '',
    params: [makeKVRow()],
    headers: [
      makeKVRow('Content-Type', 'application/json'),
      makeKVRow('Accept', '*/*'),
    ],
    bodyType: 'none',
    bodyText: '',
    formdata: [makeKVRow()],
    urlencoded: [makeKVRow()],
    auth: {
      type: 'none', token: '', username: '', password: '',
      keyName: 'X-API-Key', keyValue: '', keyIn: 'header',
      jwt: '',
      oauth2: { clientId: '', clientSecret: '', tokenUrl: '', scope: '', accessToken: '' },
    },
    preScript: '',
    testScript: '',
    response: null,
    loading: false,
    responseTime: null,
    responseSize: null,
    testResults: [],
    scriptLogs: [],
    ...overrides,
  };
}

const SAMPLE_COLLECTIONS = [
  {
    id: uuid(), name: 'JSONPlaceholder', open: true, requests: [
      { id: uuid(), name: 'Get All Posts', method: 'GET', url: 'https://jsonplaceholder.typicode.com/posts' },
      { id: uuid(), name: 'Get Post by ID', method: 'GET', url: 'https://jsonplaceholder.typicode.com/posts/1' },
      { id: uuid(), name: 'Create Post', method: 'POST', url: 'https://jsonplaceholder.typicode.com/posts', bodyType: 'json', bodyText: '{\n  "title": "foo",\n  "body": "bar",\n  "userId": 1\n}' },
      { id: uuid(), name: 'Update Post', method: 'PUT', url: 'https://jsonplaceholder.typicode.com/posts/1', bodyType: 'json', bodyText: '{\n  "id": 1,\n  "title": "updated",\n  "body": "content",\n  "userId": 1\n}' },
      { id: uuid(), name: 'Delete Post', method: 'DELETE', url: 'https://jsonplaceholder.typicode.com/posts/1' },
    ],
  },
  {
    id: uuid(), name: 'Reqres', open: false, requests: [
      { id: uuid(), name: 'List Users', method: 'GET', url: 'https://reqres.in/api/users?page=2' },
      { id: uuid(), name: 'Single User', method: 'GET', url: 'https://reqres.in/api/users/2' },
      { id: uuid(), name: 'Create User', method: 'POST', url: 'https://reqres.in/api/users', bodyType: 'json', bodyText: '{\n  "name": "morpheus",\n  "job": "leader"\n}' },
      { id: uuid(), name: 'Login', method: 'POST', url: 'https://reqres.in/api/login', bodyType: 'json', bodyText: '{\n  "email": "eve.holt@reqres.in",\n  "password": "cityslicka"\n}' },
      { id: uuid(), name: 'Register', method: 'POST', url: 'https://reqres.in/api/register', bodyType: 'json', bodyText: '{\n  "email": "eve.holt@reqres.in",\n  "password": "pistol"\n}' },
    ],
  },
];

function persistTabs(tabs, activeTabId) {
  try {
    const toSave = tabs.map(t => ({
      ...t, response: null, loading: false, testResults: [], scriptLogs: [],
    }));
    LS.save('tabs', toSave);
    LS.save('activeTabId', activeTabId);
  } catch {}
}

const _savedTabs = LS.load('tabs', null);
const _savedActiveTabId = LS.load('activeTabId', null);
const _initTabs = (_savedTabs && _savedTabs.length > 0) ? _savedTabs : [makeTab()];
const _initActiveTabId = (_savedActiveTabId && _initTabs.find(t => t.id === _savedActiveTabId))
  ? _savedActiveTabId : _initTabs[0].id;

const useStore = create(immer((set, get) => ({
  // ── Tabs ─────────────────────────────────────
  tabs: _initTabs,
  activeTabId: _initActiveTabId,

  addTab: (overrides = {}) => set(s => {
    const t = makeTab(overrides);
    s.tabs.push(t);
    s.activeTabId = t.id;
    persistTabs(s.tabs, s.activeTabId);
  }),

  closeTab: (id) => set(s => {
    const idx = s.tabs.findIndex(t => t.id === id);
    s.tabs = s.tabs.filter(t => t.id !== id);
    if (s.tabs.length === 0) { const t = makeTab(); s.tabs.push(t); s.activeTabId = t.id; }
    else if (s.activeTabId === id) s.activeTabId = s.tabs[Math.max(0, idx - 1)].id;
    persistTabs(s.tabs, s.activeTabId);
  }),

  setActiveTab: (id) => set(s => {
    s.activeTabId = id;
    LS.save('activeTabId', id);
  }),

  updateTab: (id, patch) => set(s => {
    const t = s.tabs.find(t => t.id === id);
    if (!t) return;
    Object.assign(t, patch);
    // Persist request fields but skip large response data
    if (!('response' in patch) && !('loading' in patch) && !('testResults' in patch)) {
      persistTabs(s.tabs, s.activeTabId);
    }
  }),

  updateTabDeep: (id, path, value) => set(s => {
    const t = s.tabs.find(t => t.id === id);
    if (!t) return;
    const keys = path.split('.');
    let obj = t;
    for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
    obj[keys[keys.length - 1]] = value;
    persistTabs(s.tabs, s.activeTabId);
  }),

  duplicateTab: (id) => set(s => {
    const t = s.tabs.find(t => t.id === id);
    if (!t) return;
    const copy = JSON.parse(JSON.stringify(t));
    copy.id = uuid();
    copy.name = t.name + ' (copy)';
    copy.response = null; copy.loading = false;
    s.tabs.splice(s.tabs.findIndex(t => t.id === id) + 1, 0, copy);
    s.activeTabId = copy.id;
    persistTabs(s.tabs, s.activeTabId);
  }),

  // ── KV helpers ───────────────────────────────
  addKV: (tabId, field) => set(s => {
    const t = s.tabs.find(t => t.id === tabId);
    if (t) { t[field].push(makeKVRow()); persistTabs(s.tabs, s.activeTabId); }
  }),

  removeKV: (tabId, field, kvId) => set(s => {
    const t = s.tabs.find(t => t.id === tabId);
    if (t) { t[field] = t[field].filter(r => r.id !== kvId); persistTabs(s.tabs, s.activeTabId); }
  }),

  updateKV: (tabId, field, kvId, patch) => set(s => {
    const t = s.tabs.find(t => t.id === tabId);
    if (!t) return;
    const row = t[field].find(r => r.id === kvId);
    if (row) { Object.assign(row, patch); persistTabs(s.tabs, s.activeTabId); }
  }),

  // ── Collections ──────────────────────────────
  collections: LS.load('collections', SAMPLE_COLLECTIONS),

  addCollection: (name) => set(s => {
    s.collections.push({ id: uuid(), name, open: true, requests: [] });
    LS.save('collections', s.collections);
  }),

  deleteCollection: (id) => set(s => {
    s.collections = s.collections.filter(c => c.id !== id);
    LS.save('collections', s.collections);
  }),

  renameCollection: (id, name) => set(s => {
    const c = s.collections.find(c => c.id === id);
    if (c) { c.name = name; LS.save('collections', s.collections); }
  }),

  toggleCollection: (id) => set(s => {
    const c = s.collections.find(c => c.id === id);
    if (c) c.open = !c.open;
  }),

  saveRequestToCollection: (collId, request) => set(s => {
    const c = s.collections.find(c => c.id === collId);
    if (c) {
      const exists = c.requests.find(r => r.id === request.id);
      if (exists) Object.assign(exists, request);
      else c.requests.push({ id: uuid(), ...request });
      LS.save('collections', s.collections);
    }
  }),

  deleteCollectionRequest: (collId, reqId) => set(s => {
    const c = s.collections.find(c => c.id === collId);
    if (c) { c.requests = c.requests.filter(r => r.id !== reqId); LS.save('collections', s.collections); }
  }),

  importCollections: (colls) => set(s => {
    s.collections = [...s.collections, ...colls];
    LS.save('collections', s.collections);
  }),

  setCollections: (colls) => set(s => {
    s.collections = colls;
    LS.save('collections', s.collections);
  }),

  // ── History ──────────────────────────────────
  history: LS.load('history', []),

  addHistory: (entry) => set(s => {
    s.history.unshift({ id: uuid(), ts: new Date().toISOString(), ...entry });
    if (s.history.length > 200) s.history = s.history.slice(0, 200);
    LS.save('history', s.history);
  }),

  clearHistory: () => set(s => { s.history = []; LS.save('history', []); }),

  // ── Environment ──────────────────────────────
  environments: LS.load('environments', [
    {
      id: uuid(), name: 'Development', active: true, variables: [
        makeKVRow('BASE_URL', 'https://api.example.com'),
        makeKVRow('TOKEN', 'my-dev-token'),
      ],
    },
    {
      id: uuid(), name: 'Production', active: false, variables: [
        makeKVRow('BASE_URL', 'https://api.production.com'),
        makeKVRow('TOKEN', 'my-prod-token'),
      ],
    },
  ]),
  activeEnvId: LS.load('activeEnvId', null),

  setActiveEnv: (id) => set(s => {
    s.activeEnvId = id;
    LS.save('activeEnvId', id);
  }),

  addEnvironment: (name) => set(s => {
    s.environments.push({ id: uuid(), name, active: false, variables: [makeKVRow()] });
    LS.save('environments', s.environments);
  }),

  deleteEnvironment: (id) => set(s => {
    s.environments = s.environments.filter(e => e.id !== id);
    if (s.activeEnvId === id) s.activeEnvId = null;
    LS.save('environments', s.environments);
  }),

  updateEnvVar: (envId, varId, patch) => set(s => {
    const env = s.environments.find(e => e.id === envId);
    if (!env) return;
    const v = env.variables.find(v => v.id === varId);
    if (v) Object.assign(v, patch);
    LS.save('environments', s.environments);
  }),

  addEnvVar: (envId) => set(s => {
    const env = s.environments.find(e => e.id === envId);
    if (env) env.variables.push(makeKVRow());
    LS.save('environments', s.environments);
  }),

  removeEnvVar: (envId, varId) => set(s => {
    const env = s.environments.find(e => e.id === envId);
    if (env) env.variables = env.variables.filter(v => v.id !== varId);
    LS.save('environments', s.environments);
  }),

  renameEnvironment: (id, name) => set(s => {
    const env = s.environments.find(e => e.id === id);
    if (env) env.name = name;
    LS.save('environments', s.environments);
  }),

  // ── Runner ───────────────────────────────────
  runnerOpen: false,
  setRunnerOpen: (v) => set(s => { s.runnerOpen = v; }),

  // ── UI state ─────────────────────────────────
  sidebarOpen: true,
  setSidebarOpen: (v) => set(s => { s.sidebarOpen = v; }),
  sidebarTab: 'collections',
  setSidebarTab: (v) => set(s => { s.sidebarTab = v; }),

  // ── Getters ──────────────────────────────────
  getActiveTab: () => {
    const s = get();
    return s.tabs.find(t => t.id === s.activeTabId);
  },

  getActiveEnv: () => {
    const s = get();
    return s.environments.find(e => e.id === s.activeEnvId);
  },

  resolveEnv: (str) => {
    if (!str) return str;
    const s = get();
    const env = s.environments.find(e => e.id === s.activeEnvId);
    if (!env) return str;
    return str.replace(/\{\{([^}]+)\}\}/g, (_, k) => {
      const v = env.variables.find(v => v.enabled && v.key === k.trim());
      return v ? v.value : _;
    });
  },
})));

export default useStore;
