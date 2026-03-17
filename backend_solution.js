// BACKEND SERVER SOLUTION (Node.js + Express)
// This allows Telegram Mini App to download files properly

// Install: npm install express cors fetch-blob

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const JSZip = require('jszip');
const app = express();

app.use(cors());
app.use(express.json());

// Endpoint: POST /download-repo
app.post('/download-repo', async (req, res) => {
  try {
    const { owner, repo, branch } = req.body;
    
    if (!owner || !repo || !branch) {
      return res.status(400).json({ error: 'Missing parameters' });
    }

    console.log(`Downloading ${owner}/${repo}@${branch}`);

    // Fetch tree
    const treeRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`
    );
    
    if (!treeRes.ok) {
      throw new Error('Repository not found');
    }

    const treeData = await treeRes.json();
    const files = treeData.tree.filter(f => f.type === 'blob');

    if (files.length === 0) {
      throw new Error('No files found');
    }

    console.log(`Found ${files.length} files, zipping...`);

    // Create ZIP
    const zip = new JSZip();
    let fetched = 0;

    // Download files
    for (let i = 0; i < files.length; i += 10) {
      const batch = files.slice(i, i + 10);
      await Promise.all(batch.map(async (f) => {
        try {
          const fileUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${f.path}`;
          const fileRes = await fetch(fileUrl);
          if (fileRes.ok) {
            zip.file(`${repo}/${f.path}`, await fileRes.buffer());
          }
        } catch (e) {
          console.log(`Skip: ${f.path}`);
        }
        fetched++;
      }));
    }

    // Generate ZIP
    const zipBlob = await zip.generateAsync({ type: 'nodebuffer' });
    
    console.log(`ZIP created: ${(zipBlob.length / 1024 / 1024).toFixed(1)}MB`);

    // Send as download
    res.setHeader('Content-Disposition', `attachment; filename="${repo}-${branch}.zip"`);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Access-Control-Allow-Origin', 'https://web.telegram.org');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    res.send(zipBlob);

  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Deploy to Heroku/Railway/Vercel for production`);
});

// ============================================
// CLIENT CODE (HTML) TO USE WITH BACKEND
// ============================================
/*

<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>GitHub Downloader</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui; background: white; padding: 16px; }
    .card { background: #f5f5f5; padding: 12px; border-radius: 8px; margin: 8px 0; }
    input, select { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; margin: 8px 0; }
    button { width: 100%; padding: 12px; background: #007AFF; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; margin: 8px 0; }
    .status { padding: 10px; border-radius: 6px; margin: 8px 0; display: none; }
    .status.visible { display: block; }
    .success { background: #d4edda; color: #155724; }
    .error { background: #f8d7da; color: #721c24; }
    .info { background: #d1ecf1; color: #0c5460; }
  </style>
</head>
<body>

<h1>📥 GitHub Downloader</h1>
<p>Using Backend Server</p>

<div id="status" class="status"></div>

<div class="card">
  <label>GitHub URL</label>
  <input type="text" id="repoUrl" placeholder="https://github.com/user/repo">
</div>

<div id="branchCard" class="card" style="display:none;">
  <label>Branch</label>
  <select id="branchSelect"><option>main</option></select>
</div>

<button onclick="download()">📥 Download</button>

<script>
  const tg = window.Telegram?.WebApp;
  if (tg) tg.ready();

  const BACKEND_URL = 'https://your-backend.herokuapp.com'; // Change this!

  function show(msg, type = 'info') {
    const status = document.getElementById('status');
    status.textContent = msg;
    status.className = `status visible ${type}`;
  }

  document.getElementById('repoUrl').addEventListener('input', async (e) => {
    try {
      const u = new URL(e.target.value);
      const parts = u.pathname.split('/').filter(Boolean);
      const owner = parts[0];
      const repo = parts[1]?.replace(/\.git$/i, '');

      if (!owner || !repo) {
        document.getElementById('branchCard').style.display = 'none';
        return;
      }

      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches?per_page=50`);
      if (!res.ok) return;

      const branches = await res.json();
      const select = document.getElementById('branchSelect');
      select.innerHTML = '';
      branches.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.name;
        opt.textContent = b.name;
        select.appendChild(opt);
      });

      document.getElementById('branchCard').style.display = 'block';
    } catch (e) {
      document.getElementById('branchCard').style.display = 'none';
    }
  });

  async function download() {
    try {
      const url = document.getElementById('repoUrl').value.trim();
      const u = new URL(url);
      const parts = u.pathname.split('/').filter(Boolean);
      const owner = parts[0];
      const repo = parts[1].replace(/\.git$/i, '');
      const branch = document.getElementById('branchSelect').value || 'main';

      show(`Downloading ${owner}/${repo}@${branch}...`, 'info');

      // Call backend
      const res = await fetch(`${BACKEND_URL}/download-repo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, repo, branch })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }

      // Download file
      const blob = await res.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${repo}-${branch}.zip`;
      link.click();

      show('✓ Downloaded successfully!', 'success');

    } catch (e) {
      show('❌ Error: ' + e.message, 'error');
    }
  }
</script>

</body>
</html>

*/