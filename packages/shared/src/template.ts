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

        // CRITICAL FIX: Hyper-aggressive key normalization
        const normalizeKey = (k: string) => {
            if (!k) return '';
            return String(k)
                .toLowerCase()
                .replace(/[\r\n\t]+/gs, ' ') // Replace newlines/tabs with space
                .replace(/[^\w\s\(\)\+\-\/\.,]/g, '') // Remove non-printable/weird chars but keep common punctuation
                .replace(/\s+/g, ' ') // Collapse multiple spaces
                .trim();
        };

        const normalizedMeta: any = {};
        Object.entries(metaObj).forEach(([key, value]) => {
            const nKey = normalizeKey(key);
            normalizedMeta[nKey] = value;
            // Also keep original key to avoid missing anything
            normalizedMeta[key] = value;
        });

        // Flatten variables - EVERYTHING goes to root for lookup
        const vars = { ...normalizedMeta, ...variables };

        // UNIFIED PLACEHOLDER RESOLVER
        const resolvePlaceholder = (rawKey: string) => {
            const key = rawKey.replace(/\}$/, '').trim(); // Handle triple brace residue
            const normalizedSearchKey = normalizeKey(key);

            // 1. Exact Match (Normalized)
            const match = Object.keys(vars).find(k => normalizeKey(k) === normalizedSearchKey);

            if (match !== undefined && vars[match] !== undefined && vars[match] !== null) {
                const val = vars[match];
                if (typeof val === 'object' && !Array.isArray(val)) return '';
                console.log(`[TEMPLATE_RENDER] ✅ SUCCESS: "${key}" matched to "${match}"`);
                return String(val);
            }

            // 2. Fuzzy Fallback (Ignore punctuation)
            const simplify = (s: string) => s.toLowerCase().replace(/[^\w]/g, '');
            const simplifiedSearch = simplify(key);
            if (simplifiedSearch.length > 3) {
                const fuzzyMatch = Object.keys(vars).find(k => simplify(k) === simplifiedSearch);
                if (fuzzyMatch !== undefined && vars[fuzzyMatch] !== undefined) {
                    console.log(`[TEMPLATE_RENDER] ⚠️ FUZZY MATCH: "${key}" matched to "${fuzzyMatch}"`);
                    return String(vars[fuzzyMatch]);
                }
            }

            // 3. Fallback to getValueByPath (for dotted notation)
            const pathValue = this.getValueByPath(vars, key);
            if (pathValue !== undefined && pathValue !== null) {
                return String(pathValue);
            }

            console.log(`[TEMPLATE_RENDER] ❌ FAILED: "${key}" (normalized: "${normalizedSearchKey}")`);
            return `{{${key}}}`; // Return original to identify unmerged in output
        };

        // STEP 1: Handle Components (TABLE, BUTTON)
        const componentRegex = /\{\{\s*(.*?)\s*\}\}/gis;
        let rendered = template.replace(componentRegex, (match: string, rawMarkerContent: string) => {
            const norm = rawMarkerContent.replace(/\}$/, '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();


            // A. TABLE component
            if (['table', 'feetable', 'feesummary', 'summarrytable', 'feetablerows', 'tabledata'].includes(norm)) {
                let tableRows = options?.config?.tableRows || vars.fee_table_rows || vars.feeTableRows || [];

                console.log(`[TEMPLATE_RENDER] TABLE component detected. TableRows count: ${Array.isArray(tableRows) ? tableRows.length : 'NOT_ARRAY'}`);

                // Fallback for students with simple fee data
                if (!tableRows || (Array.isArray(tableRows) && tableRows.length === 0)) {
                    const feeAmount = this.getValueByPath(vars, '2nd Sem Fee') || this.getValueByPath(vars, 'fee') || '';
                    if (feeAmount) tableRows = [{ label: 'Academic & Term Fee', value: feeAmount }];
                }

                if (tableRows && tableRows.length > 0) {
                    console.log(`[TEMPLATE_RENDER] Processing ${tableRows.length} table rows...`);
                    const processedRows = tableRows.map((r: any, idx: number) => {
                        // CRITICAL FIX: Ensure label and value are strings before checking for placeholders
                        const labelStr = String(r.label || '');
                        const valueStr = String(r.value || '');

                        const hasLabelPlaceholder = labelStr.includes('{{');
                        const hasValuePlaceholder = valueStr.includes('{{');

                        console.log(`[TEMPLATE_RENDER] Row ${idx}: label="${labelStr.slice(0, 40)}${labelStr.length > 40 ? '...' : ''}", value="${valueStr.slice(0, 40)}${valueStr.length > 40 ? '...' : ''}", hasPlaceholders: label=${hasLabelPlaceholder}, value=${hasValuePlaceholder}`);

                        const processedLabel = hasLabelPlaceholder
                            ? labelStr.replace(/\{\{(.+?)\}\}/gs, (_: string, k: string) => {
                                const resolved = resolvePlaceholder(k);
                                console.log(`[TEMPLATE_RENDER] Row ${idx} label placeholder "{{${k.slice(0, 30)}...}}" => "${resolved.slice(0, 30)}..."`);
                                return resolved;
                            })
                            : labelStr;

                        const processedValue = hasValuePlaceholder
                            ? valueStr.replace(/\{\{(.+?)\}\}/gs, (_: string, k: string) => {
                                const resolved = resolvePlaceholder(k);
                                console.log(`[TEMPLATE_RENDER] Row ${idx} value placeholder "{{${k.slice(0, 30)}...}}" => "${resolved.slice(0, 30)}..."`);
                                return resolved;
                            })
                            : valueStr;

                        return { label: processedLabel, value: processedValue };
                    });
                    console.log(`[TEMPLATE_RENDER] Table processing complete. Building HTML table...`);
                    return this.buildTable(processedRows);
                }
                console.log(`[TEMPLATE_RENDER] No table rows to process, returning empty string`);
                return '';
            }

            // B. BUTTON component
            if (['actionbutton', 'paylink', 'paybutton', 'payfeebutton', 'payfeeonline', 'paymentlink', 'payfee'].includes(norm)) {
                let config = options?.config || {};
                if (typeof config === 'string') { try { config = JSON.parse(config); } catch (e) { } }
                const btnText = config?.payButton?.text || '💳 Pay Fee Online';
                let btnUrl = config?.payButton?.url || '';

                // Resolve URL placeholders
                btnUrl = btnUrl.replace(/\{\{(.+?)\}\}/gs, (_: string, k: string) => resolvePlaceholder(k));

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
        rendered = rendered.replace(/\{\{(.+?)\}\}/gs, (_: string, k: string) => resolvePlaceholder(k));

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

    private static getValueByPath(vars: any, path: string): any {
        if (!vars || !path) return undefined;

        // 1. Literal Match (Case Insensitive + Whitespace Normalized)
        const keys = Object.keys(vars);
        const normalizeWS = (s: string) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
        const nPath = normalizeWS(path);

        const lMatch = keys.find(k => normalizeWS(k) === nPath);
        if (lMatch) return vars[lMatch];

        // 2. Normalized Match (Alpha-Numeric only)
        const normalizeAlpha = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
        const sNorm = normalizeAlpha(path);
        const nMatch = keys.find(k => normalizeAlpha(k) === sNorm);
        if (nMatch) return vars[nMatch];

        // 3. HYPER-FUZZY (Word-for-Word similarity)
        const getWords = (s: string) => String(s || '').toLowerCase()
            .split(/[^a-z0-9]+/)
            .filter(w => w.length >= 2);

        const isSimilar = (a: string, b: string) => {
            if (a === b) return true;
            if (Math.abs(a.length - b.length) > 2) return false;
            let d = 0;
            for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) d++;
            return d <= 2; // Allow 2 character differences (e.g. Payabale vs Payable)
        };

        const sWords = getWords(path);
        if (sWords.length > 0) {
            const candidates = keys.map(k => {
                const kWords = getWords(k);
                const intersection = kWords.filter(kw => sWords.some(sw => isSimilar(kw, sw)));
                // Weighting: Large keys need higher precision
                const score = intersection.length / Math.max(kWords.length, sWords.length);
                return { key: k, score, kWordsLength: kWords.length };
            })
                .filter(m => m.score >= 0.25) // Slightly lower hurdle for long complex keys
                .sort((a, b) => {
                    if (b.score !== a.score) return b.score - a.score;
                    return b.kWordsLength - a.kWordsLength; // Ties go to more descriptive keys
                });

            if (candidates.length > 0) {
                console.log(`[HYPER_FUZZY] Resolved "${path}" to "${candidates[0].key}" (Score: ${candidates[0].score})`);
                return vars[candidates[0].key];
            }
        }

        // 4. Dot Path (Fallback)
        if (path.includes('.')) {
            const parts = path.split('.');
            let current = vars;
            for (const part of parts) {
                if (current === null || current === undefined) return undefined;
                const match = Object.keys(current).find(k => normalizeAlpha(k) === normalizeAlpha(part));
                current = match ? current[match] : undefined;
            }
            return current;
        }

        return undefined;
    }
}
