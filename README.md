# APIForge – Free Postman Alternative

A fully-featured API client built with React. No subscription required.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm start

# Build for production
npm run build
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## ✅ Features

### Core Request
- **All HTTP methods**: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
- **Multi-tab**: Open unlimited tabs, middle-click to close
- **URL bar**: Paste cURL commands directly — auto-parsed instantly
- **cURL export**: Copy any request as a cURL command (📋 button)
- **Query params**: Key-value editor with enable/disable per row
- **Headers**: Full key-value editor with toggles
- **Request body**: `none`, `JSON`, `form-data`, `x-www-form-urlencoded`, `raw`, `GraphQL`
- **JSON formatter**: Auto-format/pretty-print JSON body
- **Cancel**: Abort in-flight requests

### Authentication
- No Auth
- Bearer Token
- Basic Auth (auto-base64 encoded)
- API Key (in header or query param)
- JWT Bearer
- OAuth 2.0 (fetch token automatically)

### Response Viewer
- **Pretty JSON**: Collapsible tree with syntax highlighting
- **Raw view**: Plain text
- **Headers tab**: All response headers
- **Cookies tab**: Parsed cookies
- **Info tab**: URL, method, status, time, size
- Copy response to clipboard
- Download response to file

### Pre-request Scripts
```js
// Available APIs
env.get('KEY')          // get env variable
env.set('KEY', 'value') // set env variable
console.log(...)        // output to console panel
```

### Test Scripts
```js
// Write tests like Postman
test('Status 200', () => expect(response.status).to.equal(200));
test('Has data', () => expect(response.json().data).to.exist);
test('Fast', () => expect(response.time).to.be.below(1000));
test('Content-Type', () => expect(response.headers['content-type']).to.include('json'));

// Full API:
// expect(val).to.equal(x)
// expect(val).to.exist
// expect(val).to.include('substring')
// expect(val).to.be.above(n) / .below(n)
// expect(val).to.match(/regex/)
// expect(val).to.be.a('string')
```

### Collections
- Create, rename, delete collections
- Save any request to a collection
- Click to open saved requests in new tabs
- Import/Export collections as JSON

### History
- Auto-logs all requests (last 200)
- Click to reopen in new tab
- Clear all history

### Environments
- Multiple named environments (Dev, Staging, Prod, etc.)
- `{{VARIABLE}}` syntax in URLs, headers, body, auth
- Activate/deactivate environments
- Add, edit, delete variables per environment

### Collection Runner
- Run entire collections sequentially
- Select/deselect individual requests
- Set iterations (1–100)
- Set delay between requests (0ms–2000ms)
- Live progress bar
- Detailed per-request results with expandable details
- Export results as JSON

### Import / Export
- Paste cURL directly into URL bar (auto-detected)
- Import cURL via modal in More menu
- Import collections from JSON
- Export all collections to JSON
- Export runner results to JSON

### UI/UX
- Resizable sidebar (drag handle)
- Resizable request/response split (drag handle)
- Dark theme throughout
- Keyboard shortcuts:
  - `Ctrl+T` — New tab
  - `Ctrl+W` — Close tab
  - `Ctrl+Enter` — Send request
  - `Ctrl+B` — Toggle sidebar
  - `Ctrl+1–9` — Switch to tab N
  - `Ctrl+←/→` — Previous/next tab
  - `Enter` in URL bar — Send request
  - Middle-click tab — Close tab
  - Right-click tab — Duplicate tab

---

## 🏗 Project Structure

```
src/
├── App.jsx              # Root component + keyboard shortcuts
├── App.css
├── index.js             # Entry point
├── store/
│   └── index.js         # Zustand state management
├── utils/
│   └── request.js       # HTTP engine, cURL parser/generator, test runner
├── components/
│   ├── Topbar.jsx       # Top navigation bar
│   ├── Sidebar.jsx      # Collections, History, Environments
│   ├── TabsBar.jsx      # Request tabs
│   ├── URLBar.jsx       # URL input + method + send button
│   ├── RequestPanel.jsx # Params, Headers, Body, Auth, Scripts, Tests
│   ├── ResponsePanel.jsx# Response viewer (JSON tree, headers, cookies, info)
│   └── Runner.jsx       # Collection runner
└── styles/
    └── global.css       # CSS variables + utility classes
```

---

## 📦 Dependencies

| Package | Purpose |
|---|---|
| `react` / `react-dom` | UI framework |
| `zustand` + `immer` | State management |
| `react-resizable-panels` | Drag-to-resize panels |
| `react-hot-toast` | Notifications |
| `uuid` | Unique IDs |
| `date-fns` | Date formatting |

---

## 🔒 Privacy

All data (collections, history, environments) is stored **locally in localStorage**. Nothing is sent to any server.
