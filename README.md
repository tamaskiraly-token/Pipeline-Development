# HubSpot Pipeline Dashboard

Interactive dashboard showing sales pipeline status by deal stage at month-end – stacked column chart. **React + Recharts** implementation.

## Features

- **Stacked column chart** – shows number of active deals per stage at each month-end
- **Pipeline filter** – Direct Sales or Partner Management
- **Data switcher** – display either deal count or total amount (USD)
- **Filters** – Deal Stage, Deal Owner, Deal Name (with search)
- **Pipeline movements** – lists deals that changed stage in the selected month
- Uses Excel "Date entered into …" columns to determine each deal's stage at a given date

## Usage

1. **Python data processing – generate the JSON:**
   ```
   pip install -r requirements.txt
   python pipeline_dashboard.py your-hubspot-export.xls
   ```
   This creates `dashboard/public/pipeline-data.json`.

   Place your HubSpot Excel export in the project root. The default filename is `hubspot-crm-exports-hubspot-pipeline-development-*.xls`.

2. **Start the React dashboard:**
   ```
   cd dashboard
   npm install
   npm run dev
   ```

3. **Open in browser** at the URL shown (e.g. http://localhost:5173).

**Optional – last 24 months only:**
   ```
   python pipeline_dashboard.py your-export.xls 24
   ```

## Excel format

The Excel file must include columns such as:

- `Date entered "1 - Target (Direct Sales)"`
- `Date entered "ii - Qualified/ Proposal (Partner Management)"`
- etc.

The script uses these to determine each deal's stage at month-end (based on the latest "entered" date).

## Active deals

Only active deals are counted – Closed Lost, Churn, Dead Deals, Offboarded, and vii - Closed Lost stages are excluded.

## Alternative: HTML dashboard

The Python script also generates a standalone `pipeline_dashboard.html` (Plotly) that you can open directly in a browser – no npm required for that version.
