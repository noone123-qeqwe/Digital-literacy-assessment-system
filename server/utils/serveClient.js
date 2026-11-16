const express = require('express');
const path = require('node:path');

function mountClient(app, clientBuildPath) {
  const indexPath = path.join(clientBuildPath, 'index.html');
  const sendIndex = (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(indexPath, { cacheControl: false }, error => { if (error) next(error); });
  };

  app.get('/index.html', sendIndex);
  app.use(express.static(clientBuildPath, { index: false, maxAge: '1h' }));
  // Retired build files must be real 404s, not the SPA HTML document.
  app.use('/assets', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.status(404).type('text/plain').send('This file is no longer available. Reload the page to get the latest version.');
  });
  app.get('*', sendIndex);
}

module.exports = { mountClient };
