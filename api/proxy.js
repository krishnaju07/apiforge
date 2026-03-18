/**
 * Vercel Serverless Function — APIForge Proxy
 * Maps to /api/proxy  (rewritten from /apiforge-proxy via vercel.json)
 * Same logic as src/setupProxy.js but runs as a Vercel edge function.
 */
const https = require('https');
const http = require('http');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const { url, method = 'GET', headers = {}, body } = req.body || {};
  if (!url) { res.status(400).json({ error: 'url is required' }); return; }

  let target;
  try { target = new URL(url); }
  catch { res.status(400).json({ error: 'Invalid URL: ' + url }); return; }

  const transport = target.protocol === 'https:' ? https : http;
  const upperMethod = (method || 'GET').toUpperCase();

  const bodyBuf = (body != null && !['GET', 'HEAD'].includes(upperMethod))
    ? Buffer.from(String(body), 'utf-8')
    : null;

  const SKIP = new Set(['host', 'connection', 'accept-encoding', 'transfer-encoding', 'content-length']);
  const fwdHeaders = {};
  Object.entries(headers).forEach(([k, v]) => {
    if (!SKIP.has(k.toLowerCase())) fwdHeaders[k] = v;
  });
  fwdHeaders['host'] = target.host;
  fwdHeaders['accept-encoding'] = 'identity';
  // Add browser-like user-agent if none provided (helps pass WAF bot detection)
  if (!Object.keys(fwdHeaders).some(k => k.toLowerCase() === 'user-agent')) {
    fwdHeaders['user-agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
  }
  if (bodyBuf) fwdHeaders['content-length'] = bodyBuf.length;

  return new Promise((resolve) => {
    const opts = {
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      path: target.pathname + target.search,
      method: upperMethod,
      headers: fwdHeaders,
      timeout: 8000,
      rejectUnauthorized: false,
    };

    const proxyReq = transport.request(opts, proxyRes => {
      const chunks = [];
      proxyRes.on('data', chunk => chunks.push(chunk));
      proxyRes.on('end', () => {
        const resHeaders = {};
        Object.entries(proxyRes.headers).forEach(([k, v]) => { resHeaders[k] = v; });
        res.status(200).json({
          status: proxyRes.statusCode,
          statusText: proxyRes.statusMessage || '',
          headers: resHeaders,
          body: Buffer.concat(chunks).toString('utf-8'),
          finalUrl: url,
          redirected: false,
        });
        resolve();
      });
      proxyRes.on('error', err => {
        if (!res.headersSent) res.status(502).json({ error: err.message });
        resolve();
      });
    });

    proxyReq.on('error', err => {
      if (!res.headersSent) res.status(502).json({ error: err.message });
      resolve();
    });
    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      if (!res.headersSent) res.status(504).json({ error: 'Request timed out (8s)' });
      resolve();
    });

    if (bodyBuf) proxyReq.write(bodyBuf);
    proxyReq.end();
  });
};
