import type { Direction, Locale } from "@/lib/i18n/types";

export function escapePrintHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderPrintShell(options: {
  title: string;
  locale: Locale;
  direction: Direction;
  body: string;
}) {
  const { title, locale, direction, body } = options;
  const align = direction === "rtl" ? "right" : "left";
  const reverseAlign = direction === "rtl" ? "left" : "right";

  return `<!DOCTYPE html>
<html lang="${locale}" dir="${direction}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapePrintHtml(title)}</title>
    <style>
      :root {
        color-scheme: light;
        --page-bg: #f5f1e8;
        --sheet-bg: #ffffff;
        --ink: #1f2937;
        --muted: #6b7280;
        --line: #d6d3d1;
        --line-strong: #9ca3af;
        --accent: #d97706;
        --accent-soft: #fff7ed;
      }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: var(--page-bg); color: var(--ink); }
      body {
        font-family: "Segoe UI", Tahoma, Arial, sans-serif;
        direction: ${direction};
        text-align: ${align};
        padding: 24px;
      }
      .sheet {
        width: min(100%, 960px);
        margin: 0 auto;
        background: var(--sheet-bg);
        border: 1px solid rgba(156, 163, 175, 0.35);
        border-radius: 24px;
        padding: 28px;
        box-shadow: 0 18px 50px rgba(15, 23, 42, 0.08);
      }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        padding-bottom: 18px;
        margin-bottom: 18px;
        border-bottom: 2px solid var(--line);
      }
      .eyebrow {
        margin: 0 0 6px;
        color: var(--accent);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .title {
        margin: 0;
        font-size: 28px;
        line-height: 1.15;
      }
      .subtitle {
        margin: 8px 0 0;
        color: var(--muted);
        font-size: 13px;
      }
      .badge {
        border: 1px solid rgba(217, 119, 6, 0.25);
        background: var(--accent-soft);
        color: #9a3412;
        border-radius: 999px;
        padding: 8px 14px;
        font-size: 12px;
        font-weight: 700;
        white-space: nowrap;
      }
      .section {
        margin-top: 18px;
        padding: 18px;
        border: 1px solid var(--line);
        border-radius: 18px;
        background: #fff;
      }
      .section-title {
        margin: 0 0 14px;
        font-size: 16px;
      }
      .meta-grid, .stats-grid {
        display: grid;
        gap: 12px;
      }
      .meta-grid {
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      }
      .stats-grid {
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      }
      .meta-item, .stat-item {
        padding: 12px 14px;
        border: 1px solid var(--line);
        border-radius: 14px;
        background: #fcfcfc;
      }
      .label {
        display: block;
        color: var(--muted);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        margin-bottom: 6px;
      }
      .value {
        font-size: 14px;
        line-height: 1.45;
        word-break: break-word;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }
      th, td {
        padding: 11px 12px;
        border-bottom: 1px solid var(--line);
        vertical-align: top;
      }
      th {
        color: var(--muted);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }
      tbody tr:last-child td { border-bottom: none; }
      .num {
        text-align: ${reverseAlign};
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .center { text-align: center; }
      .summary-total {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        margin-top: 14px;
        padding-top: 14px;
        border-top: 2px solid var(--line);
        font-size: 16px;
        font-weight: 700;
      }
      @page { size: A4; margin: 12mm; }
      @media print {
        body { background: #fff; padding: 0; }
        .sheet {
          width: 100%;
          margin: 0;
          border: none;
          border-radius: 0;
          padding: 0;
          box-shadow: none;
        }
      }
    </style>
  </head>
  <body>
    <main class="sheet">${body}</main>
    <script>window.onload=function(){window.print();window.close();}</script>
  </body>
</html>`;
}
