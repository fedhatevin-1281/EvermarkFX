const http = require('http');
const fs = require('fs');
const path = require('path');

// Load .env if present
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.bin': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const apiRoutes = {
  '/api/settings': require('./api/settings'),
  '/api/auth': require('./api/auth'),
  '/api/stk-push': require('./api/stk-push'),
  '/api/stk-push.js': require('./api/stk-push'),
  '/api/makamesco-webhook': require('./api/makamesco-webhook'),
  '/api/deposits': require('./api/deposits'),
  '/api/withdraw': require('./api/withdraw'),
  '/api/trade': require('./api/trade'),
  '/api/admin': require('./api/admin'),
  '/api/admin-auth': require('./api/admin-auth')
};

function enhanceRes(res) {
  res.status = code => { res.statusCode = code; return res; };
  res.json = obj => {
    if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(obj));
  };
  return res;
}

function readBody(req) {
  return new Promise(resolve => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { resolve({ raw }); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (apiRoutes[pathname]) {
    req.query = Object.fromEntries(url.searchParams.entries());
    req.body = req.method === 'GET' || req.method === 'HEAD' ? {} : await readBody(req);
    return apiRoutes[pathname](req, enhanceRes(res));
  }

  let rel = pathname === '/' ? '/index.html' : pathname;
  if (rel === '/simuted' || rel === '/simuted/') rel = '/simuted/index.html';
  if (rel === '/admin' || rel === '/admin/') rel = '/admin.html';

  const filePath = path.normalize(path.join(__dirname, rel));
  if (!filePath.startsWith(__dirname) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.statusCode = 404;
    return res.end('Not Found');
  }

  const ext = path.extname(filePath).toLowerCase();
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  fs.createReadStream(filePath).pipe(res);
});

const PORT = Number(process.env.PORT || 8080);
server.listen(PORT, () => {
  console.log(`EvermarkFX server listening on http://localhost:${PORT}`);
});
