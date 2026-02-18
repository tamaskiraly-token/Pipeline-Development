"""
HubSpot Pipeline Dashboard - Stacked column chart showing deals by stage at month-end.
Generates an interactive HTML dashboard with Pipeline Type filter (Direct Sales / Partner Management).
"""
import pandas as pd
from datetime import datetime
from dateutil.relativedelta import relativedelta
import json
from pathlib import Path

# Pipeline stage definitions: (short_name for matching, display_name)
DIRECT_SALES = [
    ("1 - Target", "1 - Target"),
    ("2 - Qualified", "2 - Qualified"),
    ("3 - Proposal", "3 - Proposal"),
    ("4 - Shortlist", "4 - Shortlist"),
    ("5 - Negotiate", "5 - Negotiate"),
    ("6 - Contract Out", "6 - Contract Out"),
    ("7 - Deal Approval", "7 - Deal Approval"),
    ("8 - Closed Won", "8 - Closed Won"),
    ("9 - Implementation", "9 - Implementation"),
    ("10 - Live", "10 - Live"),
    ("11 - Closed Lost", "11 - Closed Lost"),
    ("12 - Churn", "12 - Churn"),
    ("13 - Dead Deals", "13 - Dead Deals"),
    ("14 - Offboarded", "14 - Offboarded"),
]

PARTNER_MANAGEMENT = [
    ("0 - Dormant", "0 - Dormant"),
    ("i - Identified or Unknown", "i - Identified or Unknown"),
    ("ii - Qualified/ Proposal", "ii - Qualified/Proposal"),
    ("iii - Negotiation", "iii - Negotiation"),
    ("iv - Closed Won", "iv - Closed Won"),
    ("v - Implementation", "v - Implementation"),
    ("vi - Live", "vi - Live"),
    ("vii - Closed Lost", "vii - Closed Lost"),
]

# Active = exclude terminal "lost" states
ACTIVE_EXCLUDE = {"11 - Closed Lost", "12 - Churn", "13 - Dead Deals", "14 - Offboarded", "vii - Closed Lost"}


def build_col_to_stage(df, pipeline_type):
    """Build mapping from Excel column name to stage short name for given pipeline."""
    suffix = "(Direct Sales)" if pipeline_type == "Direct Sales" else "(Partner Management)"
    stages = DIRECT_SALES if pipeline_type == "Direct Sales" else PARTNER_MANAGEMENT
    col_to_stage = {}
    for short_name, _ in stages:
        for col in df.columns:
            if f'Date entered "' in col and short_name in col and suffix in col:
                col_to_stage[col] = short_name
                break
    return col_to_stage


def get_stage_at_date(row, col_to_stage, target_date):
    """Return (stage, date_entered) or (None, None) for deal at target_date (month-end)."""
    candidates = []
    for col, stage in col_to_stage.items():
        if col not in row.index:
            continue
        dt = row[col]
        if pd.notna(dt):
            try:
                if pd.Timestamp(dt) <= target_date:
                    candidates.append((stage, pd.Timestamp(dt)))
            except (TypeError, ValueError):
                pass
    if not candidates:
        return None, None
    candidates.sort(key=lambda x: x[1], reverse=True)
    return candidates[0][0], candidates[0][1]


def count_at_month_ends(df, pipeline_type, month_ends, active_only=True):
    """Count deals per stage at each month-end for the given pipeline."""
    col_to_stage = build_col_to_stage(df, pipeline_type)
    stages = [s[1] for s in (DIRECT_SALES if pipeline_type == "Direct Sales" else PARTNER_MANAGEMENT)]
    results = {me: {s: 0 for s in stages} for me in month_ends}

    for idx, row in df.iterrows():
        has_activity = any(pd.notna(row.get(c)) for c in col_to_stage.keys())
        if not has_activity:
            continue

        for month_end in month_ends:
            stage, _ = get_stage_at_date(row, col_to_stage, month_end)
            if stage is None:
                continue
            if active_only and stage in ACTIVE_EXCLUDE:
                continue
            display_name = next(s[1] for s in (DIRECT_SALES if pipeline_type == "Direct Sales" else PARTNER_MANAGEMENT) if s[0] == stage)
            results[month_end][display_name] = results[month_end].get(display_name, 0) + 1

    return results


def build_deal_details(df, pipeline_type, month_ends, active_only=True):
    """Build deal-level details for each (month, stage) for popup display."""
    col_to_stage = build_col_to_stage(df, pipeline_type)
    stages_config = DIRECT_SALES if pipeline_type == "Direct Sales" else PARTNER_MANAGEMENT
    stages = [s[1] for s in stages_config if s[1] not in ACTIVE_EXCLUDE]
    results = {}

    for month_end in month_ends:
        label = month_end.strftime("%Y-%m")
        results[label] = {s: [] for s in stages}

    for idx, row in df.iterrows():
        has_activity = any(pd.notna(row.get(c)) for c in col_to_stage.keys())
        if not has_activity:
            continue

        deal_name = str(row.get("Deal Name", "") or "")
        deal_owner = str(row.get("Deal owner", "") or "")
        amount = row.get("Amount in company currency")
        if pd.isna(amount):
            amount = 0
        else:
            amount = float(amount)

        for month_end in month_ends:
            stage, date_entered = get_stage_at_date(row, col_to_stage, month_end)
            if stage is None:
                continue
            if active_only and stage in ACTIVE_EXCLUDE:
                continue
            display_name = next(s[1] for s in stages_config if s[0] == stage)
            date_str = date_entered.strftime("%Y-%m-%d") if date_entered else ""
            label = month_end.strftime("%Y-%m")
            if label in results and display_name in results[label]:
                results[label][display_name].append({
                    "dealName": deal_name,
                    "dealStage": display_name,
                    "dealOwner": deal_owner,
                    "dateEnteredStage": date_str,
                    "amount": amount,
                })

    return results


def generate_dashboard(excel_path, output_path=None, months_back=None):
    """
    Generate interactive HTML dashboard.

    Args:
        excel_path: Path to HubSpot Excel export
        output_path: Where to save the HTML (default: same folder as Excel)
        months_back: If set, only include last N months (e.g. 24 for 2 years)
    """
    df = pd.read_excel(excel_path, engine="xlrd")

    # Month-end dates: from earliest to latest in data
    all_dates = []
    for col in df.columns:
        if "Date entered" in str(col):
            all_dates.extend(df[col].dropna().tolist())
    if not all_dates:
        raise ValueError("No date data found in Excel")
    min_date = pd.Timestamp(min(all_dates))
    max_date = pd.Timestamp(max(all_dates))

    if months_back:
        max_date = pd.Timestamp.now()
        min_date = max(max_date - pd.DateOffset(months=months_back), min_date)

    month_ends = []
    d = min_date.replace(day=1) + relativedelta(months=1) - pd.Timedelta(days=1)
    while d <= max_date:
        month_ends.append(d)
        d = d + relativedelta(months=1)
        d = d.replace(day=1) + relativedelta(months=1) - pd.Timedelta(days=1)

    month_ends = [d for d in month_ends if d >= min_date and d <= max_date]
    month_labels = [d.strftime("%Y-%m") for d in month_ends]

    # Compute for both pipelines
    data_ds = count_at_month_ends(df, "Direct Sales", month_ends)
    data_pm = count_at_month_ends(df, "Partner Management", month_ends)

    # Deal-level details for popup
    deal_details_ds = build_deal_details(df, "Direct Sales", month_ends)
    deal_details_pm = build_deal_details(df, "Partner Management", month_ends)

    # Color palette (similar to screenshot)
    colors_pm = {
        "0 - Dormant": "#F4D03F",
        "i - Identified or Unknown": "#E67E22",
        "ii - Qualified/Proposal": "#9B59B6",
        "iii - Negotiation": "#95A5A6",
        "iv - Closed Won": "#3498DB",
        "v - Implementation": "#2C3E50",
    }
    colors_ds = {
        "1 - Target": "#F4D03F",
        "2 - Qualified": "#E67E22",
        "3 - Proposal": "#9B59B6",
        "4 - Shortlist": "#9B59B6",
        "5 - Negotiate": "#95A5A6",
        "6 - Contract Out": "#95A5A6",
        "7 - Deal Approval": "#95A5A6",
        "8 - Closed Won": "#3498DB",
        "9 - Implementation": "#2C3E50",
        "10 - Live": "#2C3E50",
    }

    # Build chart data as JSON for JavaScript
    def to_chart_data(data, stages, colors):
        chart_data = []
        for stage in stages:
            if stage in ACTIVE_EXCLUDE or "Offboarded" in stage:
                continue
            stage_data = {"stage": stage, "month": [], "count": [], "color": colors.get(stage, "#95A5A6")}
            for me, label in zip(month_ends, month_labels):
                stage_data["month"].append(label)
                stage_data["count"].append(data[me].get(stage, 0))
            chart_data.append(stage_data)
        return chart_data

    stages_pm = [s[1] for s in PARTNER_MANAGEMENT if s[1] not in ACTIVE_EXCLUDE]
    stages_ds = [s[1] for s in DIRECT_SALES if s[1] not in ACTIVE_EXCLUDE]

    chart_data_ds = to_chart_data(data_ds, stages_ds, colors_ds)
    chart_data_pm = to_chart_data(data_pm, stages_pm, colors_pm)

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>HubSpot Pipeline Dashboard</title>
    <script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
    <style>
        * {{ box-sizing: border-box; }}
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background: #f5f6fa; }}
        .container {{ max-width: 1400px; margin: 0 auto; }}
        h1 {{ color: #2c3e50; margin-bottom: 8px; }}
        .subtitle {{ color: #7f8c8d; margin-bottom: 24px; }}
        .filters {{ background: white; padding: 16px 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 20px; display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }}
        .filter-label {{ font-weight: 600; color: #2c3e50; }}
        .filter-options {{ display: flex; gap: 12px; align-items: center; }}
        .filter-btn {{ padding: 10px 20px; border: 2px solid #ddd; background: white; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; }}
        .filter-btn:hover {{ border-color: #3498db; color: #3498db; }}
        .filter-btn.active {{ background: #3498db; color: white; border-color: #3498db; }}
        .chart-container {{ background: white; padding: 24px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }}
        #chart {{ width: 100%; height: 500px; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>Sales Pipeline – Deal Stage Breakdown</h1>
        <p class="subtitle">Month-end status – number of active deals by stage</p>

        <div class="filters">
            <span class="filter-label">Pipeline Type:</span>
            <div class="filter-options">
                <button class="filter-btn active" data-pipeline="Direct Sales">Direct Sales</button>
                <button class="filter-btn" data-pipeline="Partner Management">Partner Management</button>
            </div>
        </div>

        <div class="chart-container">
            <div id="chart"></div>
        </div>
    </div>

    <script>
        const chartDataDS = {json.dumps(chart_data_ds)};
        const chartDataPM = {json.dumps(chart_data_pm)};
        const monthLabels = {json.dumps(month_labels)};

        function buildTraces(chartData) {{
            const traces = [];
            for (const s of chartData) {{
                traces.push({{
                    x: s.month,
                    y: s.count,
                    name: s.stage,
                    type: 'bar',
                    marker: {{ color: s.color }},
                    stack: 'one'
                }});
            }}
            return traces;
        }}

        function updateChart(pipeline) {{
            const data = pipeline === 'Direct Sales' ? chartDataDS : chartDataPM;
            const layout = {{
                barmode: 'stack',
                xaxis: {{ title: 'Month' }},
                yaxis: {{ title: 'Number of active deals' }},
                margin: {{ t: 40, r: 40, b: 80, l: 60 }},
                showlegend: true,
                legend: {{ orientation: 'h', y: 1.15, xanchor: 'center', x: 0.5 }},
                paper_bgcolor: 'white',
                plot_bgcolor: 'white'
            }};
            Plotly.react('chart', buildTraces(data), layout, {{ responsive: true }});
        }}

        document.querySelectorAll('.filter-btn').forEach(btn => {{
            btn.addEventListener('click', () => {{
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                updateChart(btn.dataset.pipeline);
            }});
        }});

        updateChart('Direct Sales');
    </script>
</body>
</html>
"""

    out = output_path or Path(excel_path).parent / "pipeline_dashboard.html"
    Path(out).write_text(html_content, encoding="utf-8")
    print(f"Dashboard saved to: {out}")

    # Export JSON for React dashboard
    json_out = Path(excel_path).parent / "dashboard" / "public" / "pipeline-data.json"
    if json_out.parent.exists():
        json_data = {
            "chartDataDS": chart_data_ds,
            "chartDataPM": chart_data_pm,
            "monthLabels": month_labels,
            "dealDetailsDS": deal_details_ds,
            "dealDetailsPM": deal_details_pm,
        }
        json_out.write_text(json.dumps(json_data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"JSON data saved to: {json_out}")

    return out


if __name__ == "__main__":
    import sys
    excel = sys.argv[1] if len(sys.argv) > 1 else "hubspot-crm-exports-hubspot-pipeline-development-2026-02-18-1.xls"
    months = int(sys.argv[2]) if len(sys.argv) > 2 else None  # e.g. 24 = last 2 years
    generate_dashboard(excel, months_back=months)
