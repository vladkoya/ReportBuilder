# ReportBuilder

React web application for the **Storm Center 5 report extraction workflow**.

It implements the full process in the guide:

1. Call `currentState`
2. Extract `stormcenterDeploymentId` and `interval_generation_data`
3. Call `configuration`
4. Extract report and summary `source` paths
5. Build final `report.json` and `data.json` URLs
6. Fetch and display both JSON payloads

## Built-in environments

- **TEST**
  - `scInstanceId`: `6efee6dd-5620-4572-ba47-5d7c83a8d41a`
  - `viewId`: `d0937543-b469-4806-9caa-a8ce44da4ce2`
- **PROD**
  - `scInstanceId`: `877fd1e9-4162-473f-b782-d8a53a85326b`
  - `viewId`: `a6cee9e4-312b-4b77-9913-2ae371eb860d`

You can also select **CUSTOM** in the UI and enter your own IDs.

## Run locally

```bash
npm install
npm run dev
```

Open: `http://localhost:5173`

The React dev server proxies `/api/*` requests to the Express backend on port `3000`.

### Production-style run

```bash
npm run build
npm start
```

Then open: `http://localhost:3000`

## Notes

- `reportName` is optional. If provided, the app scores configuration candidates and picks the best matching report source.
- API calls to Storm Center are performed server-side (Express), then displayed in the React UI.