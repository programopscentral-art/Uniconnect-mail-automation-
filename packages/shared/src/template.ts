const NIAT_LOGO_URL = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR5Yb1laLiB-hpiL8dBfVkaW7VcyLdyWxuWGQ&s";

export class TemplateRenderer {
    public static render(template: string, variables: any, options: { includeAck?: boolean, trackingToken?: string, baseUrl?: string, config?: any, noLayout?: boolean } = {}): string {
        if (!template) return '';

        // 1. Prepare Metadata & Variables
        let metaObj = variables.metadata || {};
        if (typeof metaObj === 'string') {
            try { metaObj = JSON.parse(metaObj); } catch (e) { metaObj = {}; }
        }
        metaObj = metaObj || {};

        // Flatten variables - root level takes precedence, then metadata
        const vars = { ...metaObj, ...variables };

        // Aggressive normalization for reliable matching
        const clean = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();

        // UNIFIED PLACEHOLDER RESOLVER
        const resolvePlaceholder = (rawKey: string) => {
            const key = rawKey.replace(/\}$/, '').trim(); // Handle triple brace residue
            const value = this.getValueByPath(vars, key);
            if (value !== undefined && value !== null) return String(value);

            console.warn(`[TEMPLATE_RENDER] FAIL: "${key}".`);
            return `{{${key}}}`; // Return original if not found
        };

        // STEP 1: Handle Components (TABLE, BUTTON)
        const componentRegex = /\{\{\s*(.*?)\s*\}\}/gis;
        let rendered = template.replace(componentRegex, (match, rawMarkerContent) => {
            const norm = clean(rawMarkerContent.replace(/\}$/, ''));

            // A. TABLE component
            if (['table', 'feetable', 'feesummary', 'summarrytable', 'feetablerows', 'tabledata'].includes(norm)) {
                let tableRows = options?.config?.tableRows || vars.fee_table_rows || vars.feeTableRows || [];

                // Fallback for students with simple fee data
                if (!tableRows || (Array.isArray(tableRows) && tableRows.length === 0)) {
                    const feeAmount = this.getValueByPath(vars, '2nd Sem Fee') || this.getValueByPath(vars, 'fee') || '';
                    if (feeAmount) tableRows = [{ label: 'Academic & Term Fee', value: feeAmount }];
                }

                if (tableRows && tableRows.length > 0) {
                    const processedRows = tableRows.map((r: any) => ({
                        label: r.label.includes('{{') ? r.label.replace(/\{\{(.+?)\}\}/gs, (_, k) => resolvePlaceholder(k)) : r.label,
                        value: r.value.includes('{{') ? r.value.replace(/\{\{(.+?)\}\}/gs, (_, k) => resolvePlaceholder(k)) : r.value
                    }));
                    return this.buildTable(processedRows);
                }
                return '';
            }

            // B. BUTTON component
            if (['actionbutton', 'paylink', 'paybutton', 'payfeebutton', 'payfeeonline', 'paymentlink', 'payfee'].includes(norm)) {
                let config = options?.config || {};
                if (typeof config === 'string') { try { config = JSON.parse(config); } catch (e) { } }
                const btnText = config?.payButton?.text || '💳 Pay Fee Online';
                let btnUrl = config?.payButton?.url || '';

                // Resolve URL placeholders
                btnUrl = btnUrl.replace(/\{\{(.+?)\}\}/gs, (_, k) => resolvePlaceholder(k));

                // Aggressive fallback for payment links
                if (!btnUrl || btnUrl === '#' || btnUrl === 'undefined' || btnUrl.includes('example.com')) {
                    const searchKeys = ['Payment link', 'pay_link', 'PAY_LINK', 'PAYMENT_LINK', 'Fee Link', 'Fee Payment Link', 'Action URL', 'Action Link'];
                    for (const sk of searchKeys) {
                        const found = this.getValueByPath(vars, sk);
                        if (found && typeof found === 'string' && found.length > 5) {
                            btnUrl = found;
                            break;
                        }
                    }
                }

                if (!btnUrl || btnUrl === '#' || btnUrl === 'undefined') return '';

                const ensureProtocol = (url: string) => {
                    const trimmed = url.trim();
                    if (/^(https?:\/\/|mailto:)/i.test(trimmed)) return trimmed;
                    if (trimmed.includes('.') || trimmed.includes('/')) return `https://${trimmed}`;
                    return trimmed;
                };

                return `<div style="margin: 20px 0; text-align: center;"><a href="${ensureProtocol(btnUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block; padding:12px 28px; background-color:#2563eb; color:#ffffff !important; text-decoration:none; border-radius:8px; font-weight:600; font-size: 15px;">${btnText}</a></div>`;
            }

            // C. STANDARD Marker (Step 1 pass)
            return resolvePlaceholder(rawMarkerContent);
        });

        // STEP 2: Final recursive pass for any remaining markers
        rendered = rendered.replace(/\{\{(.+?)\}\}/gs, (_, k) => resolvePlaceholder(k));

        // STEP 4: Wrap in Layout
        if (options.noLayout) return rendered;

        const baseUrl = options.baseUrl || 'https://uniconnect-app.up.railway.app';
        const ackLink = options.trackingToken ? `${baseUrl}/ack/${options.trackingToken}` : '#';

        const bodyContent = rendered.split('\n').map(line => {
            if (!line.trim()) return '<div style="height: 12px; line-height: 12px;">&nbsp;</div>';
            return `<div style="margin-bottom: 4px;">${line}</div>`;
        }).join('');

        let finalHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { margin:0; padding:0; background:#f4f7fa; font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
        .wrapper { width:100%; background:#f4f7fa; padding:30px 0; }
        .main { background:#ffffff; width:100%; max-width:600px; margin:0 auto; border:1px solid #e5e7eb; border-radius:16px; overflow:hidden; }
        .header { text-align:center; padding:24px 0; border-bottom:1px solid #f3f4f6; background-color: #ffffff; }
        .content { padding:32px 40px; color:#374151; line-height:1.5; font-size:16px; }
        .footer { text-align:center; font-size:12px; color:#9ca3af; padding:24px; border-top:1px solid #f3f4f6; background:#f9fafb; }
        .fee-table { border-collapse:collapse; width:100%; margin:16px 0; border: 1px solid #cbd5e1; border-radius: 12px; overflow: hidden; }
        .fee-table th { padding:14px 16px; border: 1px solid #cbd5e1; background:#f8fafc; text-align:left; font-weight: 600; color: #4b5563; font-size: 13px; text-transform: uppercase; letter-spacing: 0.025em; }
        .fee-table td { padding:14px 16px; border: 1px solid #cbd5e1; color: #374151; font-size: 15px; }
        .fee-table .amount { text-align:right; font-weight: 700; color: #111827; }
        a { color: #2563eb; text-decoration: none; }
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="main">
            <div class="header">
                <img src="${NIAT_LOGO_URL}" width="130" alt="NIAT Logo" style="display:block;margin:0 auto;height:auto;max-width:100%;">
            </div>
            <div class="content">
                ${bodyContent}
                ${options.includeAck ? `
                <div style="background:#f0f7ff; border:1px solid #e0effe; border-radius:12px; padding:24px; margin-top:24px; text-align:center;">
                    <p style="font-size:14px;color:#1e40af;margin-bottom:16px; font-weight: 500;">By clicking below, I acknowledge reading this message:</p>
                    <a href="${ackLink}" target="_blank" rel="noopener noreferrer" style="background:#2563eb; color:#ffffff !important; padding:12px 28px; border-radius:8px; text-decoration:none; font-weight:600; display:inline-block;">✓ I Acknowledge & Agree</a>
                </div>` : ''}
            </div>
            <div class="footer">
                <div style="font-weight: 600; color: #4b5563; margin-bottom: 2px;">NxtWave Institute of Advanced Technologies</div>
                <div>&copy; 2026 NxtWave. All rights reserved.</div>
            </div>
        </div>
    </div>
</body>
</html>`.trim();

        if (options.trackingToken && options.baseUrl) {
            const pixel = `<img src="${options.baseUrl}/api/track/open/${options.trackingToken}" width="1" height="1" style="display:none; visibility:hidden;" alt="" />`;
            finalHtml = finalHtml.replace('</body>', `${pixel}</body>`);
        }

        return finalHtml;
    }

    private static buildTable(rows: { label: string; value: string }[]): string {
        const processedRows = rows.map(r => {
            let val = String(r.value || '').trim();
            if (/^\d+(\.\d+)?$/.test(val.replace(/,/g, ''))) val = `₹ ${val}`;
            return `<tr><td>${r.label}</td><td class="amount">${val}</td></tr>`;
        });
        return `<table class="fee-table"><thead><tr><th>Description</th><th style="text-align:right">Amount (₹)</th></tr></thead><tbody>${processedRows.join('')}</tbody></table>`;
    }

    private static getValueByPath(target: any, path: string): any {
        if (!target || !path) return undefined;

        const clean = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
        const searchNorm = clean(path);
        if (!searchNorm) return undefined;

        // 0. Path support (a.b.c)
        if (path.includes('.')) {
            const parts = path.split('.');
            let current = target;
            for (const part of parts) {
                if (current === null || current === undefined) return undefined;
                const keys = Object.keys(current);
                const normPart = clean(part);
                const match = keys.find(k => clean(k) === normPart || k.toLowerCase() === part.toLowerCase());
                current = match ? current[match] : undefined;
            }
            return current;
        }

        const keys = Object.keys(target);

        // 1. Direct Normalized Match (Aggressive)
        // Works for: {{Term 1 Fee}} -> "Term 1 Fee" or "term_1_fee" or "term1fee"
        const exactMatchKey = keys.find(k => clean(k) === searchNorm || k.toLowerCase() === path.toLowerCase());
        if (exactMatchKey) return target[exactMatchKey];

        // 2. Smart Fuzzy (Last Resort)
        const getWords = (s: string) => s.toLowerCase()
            .replace(/\(.*?\)/g, ' ')
            .split(/[^a-z0-9]+/)
            .filter(w => w.length > 1 || /^\d$/.test(w));

        const searchWords = getWords(path);
        if (searchWords.length > 0) {
            const candidates = keys.map(k => {
                const kWords = getWords(k);
                const intersection = kWords.filter(kw => searchWords.some(sw => kw === sw));
                if (intersection.length === 0) return { key: k, score: 0 };

                const score = Math.max(intersection.length / kWords.length, intersection.length / searchWords.length);
                return { key: k, score };
            })
                .filter(m => m.score > 0.5)
                .sort((a, b) => b.score - a.score);

            if (candidates.length > 0) return target[candidates[0].key];
        }

        return undefined;
    }
}
