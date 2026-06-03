/**
 * Server-side chart renderer for the fee-collection Excel report.
 *
 * Uses @napi-rs/canvas directly (no chart library) — we only need four
 * specific shapes, and writing them inline keeps the dependency surface
 * tiny and avoids the canvas-API mismatch between chartjs-node-canvas
 * and @napi-rs/canvas.
 *
 * Each function returns a PNG Buffer sized for embedding into a
 * worksheet via worksheet.addImage().
 */
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { ROBOTO_REGULAR_BASE64 } from './fee_chart_font';

// Register the bundled Roboto-Regular so charts render text on Linux
// containers (Railway base image has no system fonts). Module-load side
// effect; registering twice is a no-op. The family name 'AppFont' is what
// every chart below uses, with fallbacks so local-dev rendering also
// works if registration silently fails.
let _fontRegistered = false;
function ensureFont(): void {
    if (_fontRegistered) return;
    try {
        GlobalFonts.register(Buffer.from(ROBOTO_REGULAR_BASE64, 'base64'), 'AppFont');
        _fontRegistered = true;
    } catch (e) {
        console.warn('[fee_chart_renderer] font register failed:', (e as Error).message);
    }
}
ensureFont();

// NIAT palette (matches the rest of the report's styling)
const MAROON = '#7A1F2B';
const MAROON_DARK = '#5C141E';
const MAROON_TINT = '#FBE5E8';
const EMERALD = '#10b981';
const AMBER = '#f59e0b';
const RED = '#ef4444';
const BLUE = '#3b82f6';
const VIOLET = '#8b5cf6';
const FUCHSIA = '#d946ef';
const TEXT = '#111827';
const MUTED = '#6b7280';
const GRID = '#e5e7eb';

function fmtMoney(v: number): string {
    if (v >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(2)}Cr`;
    if (v >= 1_00_000)    return `₹${(v / 1_00_000).toFixed(2)}L`;
    if (v >= 1000)        return `₹${(v / 1000).toFixed(0)}k`;
    return `₹${v.toLocaleString('en-IN')}`;
}
function truncate(s: string, n: number): string {
    if (!s) return '';
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

export interface ChartImage { buffer: Buffer; width: number; height: number; }

/** Draws a maroon title bar at the top of a chart. Returns the Y offset
 *  for the chart body to start drawing below it. */
function drawTitleBar(ctx: import('@napi-rs/canvas').SKRSContext2D, W: number, title: string, subtitle?: string): number {
    const barH = 40;
    ctx.fillStyle = MAROON; ctx.fillRect(0, 0, W, barH);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px AppFont, DejaVu Sans, Arial, sans-serif';
    ctx.fillText(title.toUpperCase(), 16, 26);
    if (subtitle) {
        ctx.fillStyle = '#fde2e6';
        ctx.font = '12px AppFont, DejaVu Sans, Arial, sans-serif';
        const subX = W - 16 - ctx.measureText(subtitle).width;
        ctx.fillText(subtitle, subX, 26);
    }
    return barH;
}

// ─── Doughnut: payment status ──────────────────────────────────────────
export function renderStatusDoughnut(fully: number, partial: number, yet: number, title = 'Payment status'): ChartImage {
    const W = 720, H = 380;
    const c = createCanvas(W, H);
    const x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
    const topY = drawTitleBar(x, W, title, `${fully + partial + yet} students`);

    const total = Math.max(1, fully + partial + yet);
    const cx = 200, cy = topY + 160, R = 110, r = 65;

    // Doughnut sectors
    const segments: Array<[number, string, string]> = [
        [fully,   EMERALD, 'Fully paid'],
        [partial, AMBER,   'Partially paid'],
        [yet,     RED,     'Yet to pay'],
    ];
    let startAngle = -Math.PI / 2;
    for (const [count, color] of segments) {
        if (count <= 0) continue;
        const sweep = (count / total) * Math.PI * 2;
        x.fillStyle = color;
        x.beginPath();
        x.arc(cx, cy, R, startAngle, startAngle + sweep);
        x.arc(cx, cy, r, startAngle + sweep, startAngle, true);
        x.closePath();
        x.fill();
        startAngle += sweep;
    }
    // Centre label
    x.font = 'bold 32px AppFont, DejaVu Sans, Arial, sans-serif'; x.fillStyle = TEXT;
    const totalText = String(fully + partial + yet);
    x.fillText(totalText, cx - x.measureText(totalText).width / 2, cy + 6);
    x.font = '13px AppFont, DejaVu Sans, Arial, sans-serif'; x.fillStyle = MUTED;
    const subText = 'students';
    x.fillText(subText, cx - x.measureText(subText).width / 2, cy + 26);

    // Legend
    const lx = 400, ly = topY + 70;
    segments.forEach(([count, color, label], i) => {
        const y = ly + i * 60;
        x.fillStyle = color; x.fillRect(lx, y - 16, 22, 22);
        x.fillStyle = TEXT;
        x.font = '15px AppFont, DejaVu Sans, Arial, sans-serif';
        x.fillText(label, lx + 34, y);
        x.font = 'bold 18px AppFont, DejaVu Sans, Arial, sans-serif'; x.fillStyle = color;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        x.fillText(`${count.toLocaleString('en-IN')}  ·  ${pct}%`, lx + 34, y + 22);
    });

    return { buffer: c.toBuffer('image/png'), width: W, height: H };
}

// ─── Vertical bar: per-batch collection % ─────────────────────────────
export function renderBatchCollectionChart(
    batches: Array<{ label: string; pct: number; paid: number; payable: number }>,
    title = 'Collection % by batch',
): ChartImage {
    const W = 760, H = 380;
    const c = createCanvas(W, H);
    const x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
    const topY = drawTitleBar(x, W, title, `${batches.length} batch${batches.length === 1 ? '' : 'es'}`);

    if (batches.length === 0) {
        x.font = '13px AppFont, DejaVu Sans, Arial, sans-serif'; x.fillStyle = MUTED; x.fillText('No batch data', 24, topY + 30);
        return { buffer: c.toBuffer('image/png'), width: W, height: H };
    }

    const padL = 60, padR = 30, padT = topY + 20, padB = 80;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const barCount = batches.length;
    const slotW = plotW / barCount;
    const barW = Math.min(80, slotW * 0.55);

    // y-axis 0-100%
    x.strokeStyle = GRID; x.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const yPct = i * 25;
        const yPos = padT + plotH - (yPct / 100) * plotH;
        x.beginPath(); x.moveTo(padL, yPos); x.lineTo(padL + plotW, yPos); x.stroke();
        x.font = '11px AppFont, DejaVu Sans, Arial, sans-serif'; x.fillStyle = MUTED;
        x.fillText(`${yPct}%`, padL - 32, yPos + 4);
    }

    // bars
    batches.forEach((b, i) => {
        const cxBar = padL + slotW * i + slotW / 2;
        const h = (Math.max(0, Math.min(100, b.pct)) / 100) * plotH;
        const xBar = cxBar - barW / 2;
        const yBar = padT + plotH - h;
        const color = b.pct >= 75 ? EMERALD : b.pct >= 25 ? AMBER : RED;
        // bar with subtle rounded top
        x.fillStyle = color;
        x.fillRect(xBar, yBar, barW, h);
        // value above bar
        x.font = 'bold 13px AppFont, DejaVu Sans, Arial, sans-serif'; x.fillStyle = TEXT;
        const pctText = `${Math.round(b.pct)}%`;
        x.fillText(pctText, cxBar - x.measureText(pctText).width / 2, yBar - 8);
        // batch label (truncated, wrapped to 2 lines if needed)
        x.font = '11px AppFont, DejaVu Sans, Arial, sans-serif'; x.fillStyle = MUTED;
        const lbl = truncate(b.label, 22);
        x.fillText(lbl, cxBar - x.measureText(lbl).width / 2, padT + plotH + 18);
        // money sub-label
        const money = `${fmtMoney(b.paid)} / ${fmtMoney(b.payable)}`;
        x.fillText(money, cxBar - x.measureText(money).width / 2, padT + plotH + 34);
    });

    return { buffer: c.toBuffer('image/png'), width: W, height: H };
}

// ─── Horizontal bar: top universities by collected ₹ ─────────────────
export function renderTopUniversitiesChart(
    rows: Array<{ name: string; payable: number; paid: number; pct: number }>,
    title = 'Top universities by collection',
): ChartImage {
    const items = rows.slice(0, 10);
    const W = 800, H = Math.max(240, 60 + items.length * 38);
    const c = createCanvas(W, H);
    const x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
    const topY = drawTitleBar(x, W, title, `top ${items.length}`);

    if (items.length === 0) {
        x.font = '13px AppFont, DejaVu Sans, Arial, sans-serif'; x.fillStyle = MUTED; x.fillText('No universities yet', 24, topY + 30);
        return { buffer: c.toBuffer('image/png'), width: W, height: H };
    }

    const labelW = 220, padL = 24, padR = 24, padT = topY + 10;
    const barH = 22;
    const rowGap = 36;
    const plotL = padL + labelW;
    const plotW = W - plotL - padR - 110; // reserve right for % text
    const maxPayable = Math.max(...items.map(i => i.payable), 1);

    items.forEach((u, i) => {
        const y = padT + i * rowGap;
        // university name (left)
        x.font = '13px AppFont, DejaVu Sans, Arial, sans-serif'; x.fillStyle = TEXT;
        x.fillText(truncate(u.name, 28), padL, y + 16);

        // payable rail (light gray)
        const railW = (u.payable / maxPayable) * plotW;
        x.fillStyle = '#e5e7eb';
        x.fillRect(plotL, y + 4, railW, barH);
        // paid fill (gradient blue→green)
        const paidW = u.payable > 0 ? (u.paid / u.payable) * railW : 0;
        const grad = x.createLinearGradient(plotL, 0, plotL + paidW, 0);
        grad.addColorStop(0, BLUE);
        grad.addColorStop(1, EMERALD);
        x.fillStyle = grad;
        x.fillRect(plotL, y + 4, paidW, barH);

        // % on the right
        x.font = 'bold 13px AppFont, DejaVu Sans, Arial, sans-serif';
        x.fillStyle = u.pct >= 75 ? '#047857' : u.pct >= 25 ? '#b45309' : '#b91c1c';
        x.fillText(`${Math.round(u.pct * 100)}%`, plotL + plotW + 8, y + 16);

        // money sub-label below the bar
        x.font = '11px AppFont, DejaVu Sans, Arial, sans-serif'; x.fillStyle = MUTED;
        x.fillText(`${fmtMoney(u.paid)} of ${fmtMoney(u.payable)}`, plotL, y + 34);
    });

    return { buffer: c.toBuffer('image/png'), width: W, height: H };
}

// ─── Horizontal bar: top dropout reasons ──────────────────────────────
export function renderDropoutReasonsChart(
    rows: Array<{ reason: string; n: number }>,
    total: number,
    title = 'Top dropout reasons',
): ChartImage {
    const items = rows.slice(0, 10);
    const W = 800, H = Math.max(240, 60 + items.length * 34);
    const c = createCanvas(W, H);
    const x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
    const topY = drawTitleBar(x, W, title, `${total} total dropouts`);

    if (items.length === 0) {
        x.font = '13px AppFont, DejaVu Sans, Arial, sans-serif'; x.fillStyle = MUTED; x.fillText('No dropouts yet', 24, topY + 30);
        return { buffer: c.toBuffer('image/png'), width: W, height: H };
    }

    const labelW = 300, padL = 24, padR = 24, padT = topY + 10;
    const barH = 18;
    const rowGap = 32;
    const plotL = padL + labelW;
    const plotW = W - plotL - padR - 90;
    const maxN = Math.max(...items.map(i => i.n), 1);

    items.forEach((r, i) => {
        const y = padT + i * rowGap;
        x.font = '13px AppFont, DejaVu Sans, Arial, sans-serif'; x.fillStyle = TEXT;
        x.fillText(truncate(r.reason, 38), padL, y + 14);

        const barW = (r.n / maxN) * plotW;
        // gradient rose→red
        const grad = x.createLinearGradient(plotL, 0, plotL + barW, 0);
        grad.addColorStop(0, '#fb7185');
        grad.addColorStop(1, RED);
        x.fillStyle = grad;
        x.fillRect(plotL, y + 2, barW, barH);

        x.font = 'bold 13px AppFont, DejaVu Sans, Arial, sans-serif'; x.fillStyle = TEXT;
        const pct = total > 0 ? Math.round((r.n / total) * 100) : 0;
        x.fillText(`${r.n}  ·  ${pct}%`, plotL + plotW + 8, y + 14);
    });

    return { buffer: c.toBuffer('image/png'), width: W, height: H };
}

// ─── Vertical bar: tag-case distribution (operator-set tags) ──────────
export function renderTagCaseChart(
    rows: Array<{ tag: string; n: number }>,
    title = 'Operator-set tag distribution',
): ChartImage {
    const items = rows.slice(0, 10);
    const W = 760, H = 380;
    const c = createCanvas(W, H);
    const x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
    const topY = drawTitleBar(x, W, title, "excludes 'Dropout'");

    if (items.length === 0) {
        x.font = '13px AppFont, DejaVu Sans, Arial, sans-serif'; x.fillStyle = MUTED;
        x.fillText('No operator tags applied yet', 24, topY + 30);
        return { buffer: c.toBuffer('image/png'), width: W, height: H };
    }

    const padL = 30, padR = 30, padT = topY + 20, padB = 90;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const slotW = plotW / items.length;
    const barW = Math.min(54, slotW * 0.6);
    const maxN = Math.max(...items.map(i => i.n), 1);

    items.forEach((t, i) => {
        const cxBar = padL + slotW * i + slotW / 2;
        const h = (t.n / maxN) * plotH;
        const xBar = cxBar - barW / 2;
        const yBar = padT + plotH - h;
        const grad = x.createLinearGradient(0, yBar, 0, yBar + h);
        grad.addColorStop(0, VIOLET);
        grad.addColorStop(1, FUCHSIA);
        x.fillStyle = grad;
        x.fillRect(xBar, yBar, barW, h);
        // value
        x.font = 'bold 13px AppFont, DejaVu Sans, Arial, sans-serif'; x.fillStyle = TEXT;
        const valText = String(t.n);
        x.fillText(valText, cxBar - x.measureText(valText).width / 2, yBar - 6);
        // label (rotated 30deg)
        x.save();
        x.translate(cxBar, padT + plotH + 12);
        x.rotate(-Math.PI / 6);
        x.font = '11px AppFont, DejaVu Sans, Arial, sans-serif'; x.fillStyle = MUTED;
        const lbl = truncate(t.tag, 22);
        x.fillText(lbl, -x.measureText(lbl).width, 0);
        x.restore();
    });

    return { buffer: c.toBuffer('image/png'), width: W, height: H };
}
