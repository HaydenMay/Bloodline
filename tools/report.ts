/**
 * Writes the balance harness results to a single HTML page.
 *
 * Always overwrites the same file — tools/output/report.html — so there is one
 * current picture of balance rather than a pile of dated artefacts.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export interface Bar {
  label: string;
  value: number;
  note?: string;
}

export interface SuiteResult {
  name: string;
  ok: boolean;
  lines: string[];
  /** Optional bar chart rendered above the text. */
  bars?: { title: string; unit: string; max: number; reference?: number; referenceLabel?: string; data: Bar[] };
}

export interface ReportMeta {
  races: number;
  seed: string;
  durationMs: number;
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Strips the ANSI colour codes the console output uses. */
// eslint-disable-next-line no-control-regex
const ANSI = /\[[0-9;]*m/g;
const clean = (s: string): string => s.replace(ANSI, '');

function barChart(spec: NonNullable<SuiteResult['bars']>): string {
  const W = 680, L = 118, R = 78, T = 18, B = 34;
  const rowH = 42;
  const H = T + spec.data.length * rowH + B;
  const px = (v: number): number => L + (v / spec.max) * (W - L - R);

  let s = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img"><title>${esc(spec.title)}</title>`;

  const step = spec.max / 6;
  for (let v = 0; v <= spec.max + 1e-9; v += step) {
    s += `<line x1="${px(v)}" y1="${T}" x2="${px(v)}" y2="${H - B}" class="grid"/>`;
    s += `<text x="${px(v)}" y="${H - B + 16}" class="axis" text-anchor="middle">${v.toFixed(0)}${spec.unit}</text>`;
  }

  spec.data.forEach((d, i) => {
    const y = T + i * rowH + 8;
    const h = rowH - 20;
    s += `<text x="${L - 12}" y="${y + h / 2 + 4}" class="lbl" text-anchor="end">${esc(d.label)}</text>`;
    s += `<rect x="${L}" y="${y}" width="${Math.max(0, px(d.value) - L)}" height="${h}" rx="4" class="bar"/>`;
    s += `<text x="${px(d.value) + 9}" y="${y + h / 2 + 4}" class="val">${d.value.toFixed(1)}${spec.unit}${d.note ? '  ' + esc(d.note) : ''}</text>`;
  });

  if (spec.reference !== undefined) {
    s += `<line x1="${px(spec.reference)}" y1="${T - 4}" x2="${px(spec.reference)}" y2="${H - B + 2}" class="ref"/>`;
    if (spec.referenceLabel) {
      s += `<text x="${px(spec.reference)}" y="${T - 6}" class="reflbl" text-anchor="middle">${esc(spec.referenceLabel)}</text>`;
    }
  }

  return s + '</svg>';
}

export function writeReport(suites: SuiteResult[], meta: ReportMeta): string {
  const passed = suites.filter((s) => s.ok).length;
  const allOk = passed === suites.length;

  const body = suites
    .map(
      (s) => `
    <section class="suite">
      <header>
        <h2>${esc(s.name)}</h2>
        <span class="pill ${s.ok ? 'ok' : 'bad'}">${s.ok ? 'PASS' : 'FAIL'}</span>
      </header>
      ${s.bars ? barChart(s.bars) : ''}
      <pre>${esc(s.lines.map(clean).join('\n'))}</pre>
    </section>`,
    )
    .join('');

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bloodline — balance report</title>
<style>
  :root{--bg:#0e1218;--panel:#161c25;--line:#26303d;--text:#e8edf4;--muted:#8b98a9;
        --ok:#4ec9a0;--bad:#e2564a;--bar:#3e9e8f;--ref:#e8622c;
        --mono:ui-monospace,'Cascadia Code',Consolas,monospace}
  @media (prefers-color-scheme: light){
    :root{--bg:#f6f7f9;--panel:#fff;--line:#e2e6ec;--text:#131922;--muted:#61708a}
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);
       font:15px/1.55 ui-sans-serif,system-ui,'Segoe UI',Roboto,sans-serif;padding:28px 20px 56px}
  .wrap{max-width:820px;margin:0 auto}
  h1{font-size:26px;letter-spacing:-.02em;margin:0 0 4px}
  .meta{color:var(--muted);font-size:12.5px;font-family:var(--mono);margin:0 0 26px}
  .verdict{display:inline-block;padding:5px 13px;border-radius:999px;font-weight:700;
           font-size:12px;letter-spacing:.05em;margin-bottom:24px}
  .verdict.ok{background:rgba(78,201,160,.15);color:var(--ok)}
  .verdict.bad{background:rgba(226,86,74,.15);color:var(--bad)}
  .suite{background:var(--panel);border:1px solid var(--line);border-radius:12px;
         padding:18px 20px;margin-bottom:16px}
  .suite header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
  h2{font-size:15px;margin:0;font-weight:650}
  .pill{font-size:10.5px;font-weight:700;letter-spacing:.06em;padding:3px 9px;border-radius:999px}
  .pill.ok{background:rgba(78,201,160,.15);color:var(--ok)}
  .pill.bad{background:rgba(226,86,74,.15);color:var(--bad)}
  pre{margin:0;font-family:var(--mono);font-size:12px;color:var(--muted);
      white-space:pre-wrap;overflow-x:auto}
  .chart{display:block;width:100%;height:auto;margin:4px 0 16px}
  .grid{stroke:var(--muted);stroke-opacity:.16;stroke-width:1}
  .axis{fill:var(--muted);font-size:10px;font-family:ui-sans-serif,system-ui}
  .lbl{fill:var(--text);font-size:12.5px;font-weight:600;font-family:ui-sans-serif,system-ui}
  .val{fill:var(--muted);font-size:11.5px;font-family:var(--mono)}
  .bar{fill:var(--bar)}
  .ref{stroke:var(--ref);stroke-width:2;stroke-dasharray:5 4}
  .reflbl{fill:var(--ref);font-size:10px;font-weight:600;font-family:ui-sans-serif,system-ui}
</style></head>
<body><div class="wrap">
  <h1>Bloodline — balance report</h1>
  <p class="meta">${meta.races.toLocaleString()} races per suite &nbsp;·&nbsp; seed &ldquo;${esc(meta.seed)}&rdquo; &nbsp;·&nbsp; ${(meta.durationMs / 1000).toFixed(1)}s &nbsp;·&nbsp; ${new Date().toLocaleString()}</p>
  <div class="verdict ${allOk ? 'ok' : 'bad'}">${allOk ? 'ALL SUITES PASSED' : `${suites.length - passed} SUITE(S) FAILED`}</div>
  ${body}
</div></body></html>`;

  const out = resolve(process.cwd(), 'tools/output/report.html');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html, 'utf8');
  return out;
}
