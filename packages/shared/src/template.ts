const NIAT_LOGO_URL = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR5Yb1laLiB-hpiL8dBfVkaW7VcyLdyWxuWGQ&s";

export class TemplateRenderer {
    public static render(template: string, variables: any, options: { includeAck?: boolean, trackingToken?: string, baseUrl?: string, config?: any, noLayout?: boolean } = {}): string {
        console.log(`[TEMPLATE_RENDER_V2.5] Rendering template...`);
        if (!template) return '';
        // Robustly parse metadata if it comes in as a string
        let metaObj = variables.metadata || {};
        if (typeof metaObj === 'string') {
            try { metaObj = JSON.parse(metaObj); } catch (e) { metaObj = {}; }
        }

        // Flatten variables to ensure metadata keys are treated as root keys for matching
        const vars = {
            ...variables,
            ...metaObj
        };
        const normKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

        // UNIFIED PLACEHOLDER RESOLVER
        const resolve = (content: string) => {
            if (!content) return '';
            // Match {{...}} including newlines, handle extra closing braces
            return content.replace(/\{\{(.+?)\}\}/gs, (match, rawKey) => {
                // Clean the key: remove trailing } if it was a triple-brace, and trim
                const key = rawKey.replace(/\}$/, '').trim();
                const value = this.getValueByPath(vars, key);

                if (value !== undefined && value !== null) return String(value);

                // If not found, log it and return the original match (defensive)
                console.warn(`[TEMPLATE_RENDER] Resolution failed for key: "${key}"`);
                return match;
            });
        };

        // STEP 1 & 2: REFACTORED COMPONENT INJECTION
        const componentRegex = /\{\{\s*(.*?)\s*\}\}/gis;

        const ensureProtocol = (url: string) => {
            if (!url || url === '#' || url === 'undefined') return '#';
            const trimmed = url.trim();
            if (/^(https?:\/\/|mailto:)/i.test(trimmed)) return trimmed;
            if (trimmed.includes('.') || trimmed.includes('/')) return `https://${trimmed}`;
            return trimmed;
        };

        let rendered = template.replace(componentRegex, (match, rawMarkerContent) => {
            const norm = normKey(rawMarkerContent.replace(/\}$/, '')); // Handle triple brace in components too

            // 1. Is it a TABLE marker?
            if (['table', 'feetable', 'feesummary', 'summarrytable'].includes(norm)) {
                let tableRows = options?.config?.tableRows || variables.fee_table_rows || [];
                if (!tableRows || (Array.isArray(tableRows) && tableRows.length === 0)) {
                    const meta = variables.metadata || variables || {};
                    const feeAmount = this.getValueByPath(vars, '2nd Sem Fee') || this.getValueByPath(vars, 'fee') || '';
                    if (feeAmount) tableRows = [{ label: 'Academic & Term Fee', value: feeAmount }];
                }

                if (tableRows && tableRows.length > 0) {
                    const processedRows = tableRows.map((r: any) => ({
                        label: resolve(r.label),
                        value: resolve(r.value)
                    }));
                    return this.buildTable(processedRows);
                }
                return '';
            }

            // 2. Is it a BUTTON marker?
            if (['actionbutton', 'paylink', 'paybutton', 'payfeebutton', 'payfeeonline', 'paymentlink', 'payfee'].includes(norm)) {
                let config = options?.config || {};
                if (typeof config === 'string') { try { config = JSON.parse(config); } catch (e) { } }
                const btnText = config?.payButton?.text || '💳 Pay Fee Online';
                let btnUrl = config?.payButton?.url || '';

                // Resolve any placeholders inside the URL
                btnUrl = resolve(btnUrl);

                // Aggressive Fallback Lookup
                if (!btnUrl || btnUrl === '#' || btnUrl.includes('{{') || btnUrl.includes('example.com')) {
                    const searchKeys = ['Payment link', 'pay_link', 'PAY_LINK', 'PAYMENT_LINK', 'Fee Link', 'Fee Payment Link', 'Action URL', 'Action Link'];
                    for (const sk of searchKeys) {
                        const found = this.getValueByPath(vars, sk);
                        if (found && typeof found === 'string' && found.length > 5 && !found.includes('{{')) {
                            btnUrl = found;
                            break;
                        }
                    }
                }

                const finalUrl = ensureProtocol(btnUrl);
                return `<div style="margin: 20px 0; text-align: center;"><a href="${finalUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block; padding:12px 28px; background-color:#2563eb; color:#ffffff !important; text-decoration:none; border-radius:8px; font-weight:600; font-size: 15px;">${btnText}</a></div>`;
            }

            return match; // Not a component, leave for Step 3
        });

        // STEP 3: Final Resolution (recursive for nested tags)
        rendered = resolve(rendered);
        rendered = resolve(rendered);

        // STEP 4: Wrap in NIAT Layout
        if (options.noLayout) return rendered;

        const baseUrl = options.baseUrl || 'https://uniconnect-app.up.railway.app';
        const ackLink = options.trackingToken ? `${baseUrl}/ack/${options.trackingToken}` : '#';

        // Improve newline handling to reduce gaps
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
        .fee-table tr:last-child td { border-bottom: none; }
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

        // STEP 5: Add Tracking Pixel
        if (options.trackingToken && options.baseUrl) {
            const pixel = `<img src="${options.baseUrl}/api/track/open/${options.trackingToken}" width="1" height="1" style="display:none; visibility:hidden;" alt="" />`;
            finalHtml = finalHtml.replace('</body>', `${pixel}</body>`);
        }

        return finalHtml;
    }

    private static buildTable(rows: { label: string; value: string }[]): string {
        const processedRows = rows.map(r => {
            let val = String(r.value || '').trim();
            // Automatically add currency symbol if it looks like a number and doesn't have one
            if (/^\d+(\.\d+)?$/.test(val.replace(/,/g, ''))) {
                val = `₹ ${val}`;
            }
            return `<tr><td>${r.label}</td><td class="amount">${val}</td></tr>`;
        });
        return `<table class="fee-table"><thead><tr><th>Description</th><th style="text-align:right">Amount (₹)</th></tr></thead><tbody>${processedRows.join('')}</tbody></table>`;
    }

    private static getValueByPath(obj: any, path: string): any {
        if (!path) return undefined;

        const normalize = (s: string) => {
            if (!s) return '';
            const step1 = s.toLowerCase()
                .replace(/<[^>]*>/g, ' ')            // Strip HTML tags
                .replace(/&nbsp;/g, ' ')             // Resolve entities
                .replace(/[\n\r\t\s\xa0]+/g, ' ')    // Standardize all whitespace
                .trim();

            // HYPER-NORMALIZATION: Ignore everything except alphanumeric
            // This ensures "Total Fee (Paid)" matches "TotalFeePaid", etc.
            return step1.replace(/[^a-z0-9]/g, '');
        };
        const searchPath = normalize(path);

        // 1. Full path match (Fuzzy whitespace & Case-insensitive)
        const checkObj = (target: any) => {
            if (!target || typeof target !== 'object') return undefined;

            const keys = Object.keys(target);

            // 1.1 Direct fuzzy match (normalized whitespace and underscores)
            const key = keys.find(k => normalize(k) === searchPath);
            if (key) return target[key];

            const alphaOnly = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
            const searchAlpha = alphaOnly(searchPath);

            if (searchAlpha) {
                const alphaKey = keys.find(k => alphaOnly(k) === searchAlpha);
                if (alphaKey) return target[alphaKey];

                // 1.3 Substring Match (for long descriptive keys)
                if (searchAlpha.length > 10) {
                    const subKey = keys.find(k => {
                        const ka = alphaOnly(k);
                        return ka.length > 8 && (searchAlpha.includes(ka) || ka.includes(searchAlpha));
                    });
                    if (subKey) return target[subKey];
                }

                // 1.4 Word Intersection (the "Typos-be-gone" logic)
                const getWords = (s: string) => s.split(/[ \-_()]/).map(w => w.toLowerCase().replace(/[^a-z0-9]/g, '')).filter(w => w.length > 2);
                const searchWords = getWords(path);
                if (searchWords.length >= 2) {
                    const bestMatch = keys.map(k => {
                        const kWords = getWords(k);
                        const intersection = searchWords.filter(w => kWords.includes(w));
                        const score = intersection.length / Math.max(searchWords.length, kWords.length);

                        // Special Case: Metadata key is a significant subset of the path
                        const allMetadataWordsMatch = kWords.length >= 2 && kWords.every(kw => searchWords.includes(kw));
                        const finalScore = allMetadataWordsMatch ? Math.max(score, 0.8) : score;

                        return { key: k, score: finalScore };
                    })
                        .filter(m => m.score > 0.5) // Lowered to 50% for high resilience
                        .sort((a, b) => b.score - a.score)[0];

                    if (bestMatch) return target[bestMatch.key];
                }

                // 1.5 Singular match
                const singularAlpha = (s: string) => alphaOnly(s).replace(/s$/, '');
                const searchSingular = singularAlpha(searchPath);
                const singularKey = keys.find(k => singularAlpha(k) === searchSingular);
                if (singularKey) return target[singularKey];
            }

            return undefined;
        };

        const fromRoot = checkObj(obj);
        if (fromRoot !== undefined) {
            console.log(`[TEMPLATE_MATCH] Found "${path}" in root`);
            return fromRoot === null ? '' : fromRoot;
        }

        const fromMetadata = checkObj(obj.metadata);
        if (fromMetadata !== undefined) {
            console.log(`[TEMPLATE_MATCH] Found "${path}" in metadata`);
            return fromMetadata === null ? '' : fromMetadata;
        }

        // 2. Deep path match (a.b.c)
        const parts = path.split('.');
        if (parts.length > 1) {
            let current = obj;
            for (const part of parts) {
                if (current && typeof current === 'object') {
                    const key = Object.keys(current).find(k => normalize(k) === normalize(part));
                    current = key ? current[key] : undefined;
                } else {
                    current = undefined;
                    break;
                }
            }
            if (current !== undefined) return current;
        }

        return undefined;
    }
}
