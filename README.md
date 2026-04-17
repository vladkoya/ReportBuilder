# ReportBuilder

Single-page HTML app for the **Storm Center 5 report extraction workflow**.

Everything is in one file: `index.html` (HTML, CSS, and JavaScript).

## Use directly from the GitHub repo

You can run it without installing dependencies by opening the file directly.

### Option A: download and open locally
1. Download `index.html` from this repo.
2. Open it in your browser.

### Option B: use raw GitHub URL
Use the raw file URL format:

`https://raw.githubusercontent.com/<owner>/<repo>/<branch>/index.html`

Save that response as a local `.html` file, then open it in your browser.

## What the page does

The page supports the full guide workflow:

1. Call `currentState`
2. Extract `stormcenterDeploymentId` and `interval_generation_data`
3. Call `configuration`
4. Extract report and summary source paths
5. Build final `report.json` and `data.json` URLs
6. Fetch and display data files

## Important browser limitation

Direct browser calls to:
- `https://kubra.io/stormcenter/api/v1/.../currentState`
- `https://kubra.io/stormcenter/api/v1/.../configuration/...`

may fail due to authentication/CORS restrictions (for example `401`).

The page includes a **Manual mode** so you can still:
- paste `stormcenterDeploymentId`
- paste `interval_generation_data`
- paste configuration JSON

and then continue steps 3-6 (source extraction, URL construction, data fetch).