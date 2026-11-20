# DLAS Web Client

This folder contains the React and Vite interface for the Digital Literacy Assessment System. It includes the administrator workspace, student learning and assessment pages, account security, and shared authentication screens.

## Local development

Use Node.js 24 and install the project dependencies:

```powershell
npm ci
npm run dev
```

The Vite server runs at `http://localhost:5173` and proxies `/api` requests to the backend at `http://localhost:3000`. Start the backend from the `server` folder in a second terminal. To use a different local API address, set `DLAS_API_PROXY_TARGET` before starting Vite.

The client uses cookie-based sessions and a CSRF header for requests that change data. Keep account, database, and email credentials in the server or hosting environment; the browser client does not need those secrets.

## Checks

Run these commands from this folder:

```powershell
npm test
npm run lint
npm run build
```

The production build is written to `dist/` and served by the backend when deployed together.
