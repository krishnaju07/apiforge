/**
 * APIForge local proxy — runs inside webpack-dev-server (Node.js context).
 * Forwards all requests from the browser to the actual API target,
 * bypassing browser CORS restrictions entirely.
 */
const https = require('https');
const http = require('http');

module.exports = function (app) {
  app.use('/apiforge-proxy', (req, res) => {
    // Allow the browser to reach this endpoint
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    if (req.method !== 'POST') { res.status(405).end(); return; }

    // Read the JSON envelope sent by request.js
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      let payload;
      try { payload = JSON.parse(raw); }
      catch { res.status(400).json({ error: 'Bad JSON envelope' }); return; }

      const { url, method = 'GET', headers = {}, body } = payload;
      if (!url) { res.status(400).json({ error: 'url is required' }); return; }

      let target;
      try { target = new URL(url); }
      catch { res.status(400).json({ error: 'Invalid target URL: ' + url }); return; }

      const transport = target.protocol === 'https:' ? https : http;
      const upperMethod = method.toUpperCase();

      // Build the body buffer
      const bodyBuf = (body != null && !['GET', 'HEAD'].includes(upperMethod))
        ? Buffer.from(String(body), 'utf-8')
        : null;

      // Forward headers — strip hop-by-hop and compression headers
      const SKIP = new Set(['host', 'connection', 'accept-encoding', 'transfer-encoding', 'content-length']);
      const fwdHeaders = {};
      Object.entries(headers).forEach(([k, v]) => {
        if (!SKIP.has(k.toLowerCase())) fwdHeaders[k] = v;
      });
      fwdHeaders['host'] = target.host;
      // Tell the server not to compress — Node.js http doesn't auto-decompress
      fwdHeaders['accept-encoding'] = 'identity';
      if (bodyBuf) fwdHeaders['content-length'] = bodyBuf.length;

      const opts = {
        hostname: target.hostname,
        port: target.port || (target.protocol === 'https:' ? 443 : 80),
        path: target.pathname + target.search,
        method: upperMethod,
        headers: fwdHeaders,
        timeout: 30000,
        rejectUnauthorized: false, // Allow self-signed / staging certs
      };

      const proxyReq = transport.request(opts, proxyRes => {
        const chunks = [];
        proxyRes.on('data', chunk => chunks.push(chunk));
        proxyRes.on('end', () => {
          const resHeaders = {};
          Object.entries(proxyRes.headers).forEach(([k, v]) => { resHeaders[k] = v; });
          res.json({
            status: proxyRes.statusCode,
            statusText: proxyRes.statusMessage || '',
            headers: resHeaders,
            body: Buffer.concat(chunks).toString('utf-8'),
            finalUrl: url,
            redirected: false,
          });
        });
        proxyRes.on('error', err => {
          if (!res.headersSent) res.status(502).json({ error: err.message });
        });
      });

      proxyReq.on('error', err => {
        if (!res.headersSent) res.status(502).json({ error: err.message });
      });
      proxyReq.on('timeout', () => {
        proxyReq.destroy();
        if (!res.headersSent) res.status(504).json({ error: 'Request timed out (30s)' });
      });

      if (bodyBuf) proxyReq.write(bodyBuf);
      proxyReq.end();
    });
  });
};
