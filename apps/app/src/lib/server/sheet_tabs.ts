/**
 * Discover tab names + gids from a public Google Sheet without needing
 * Sheets API credentials. Works against sheets shared as
 * "Anyone with the link → Viewer" or published-to-web.
 *
 * Extracted from /api/ops/+server.ts so the fee-collection-v2 setup flow
 * can reuse it for auto-discovering batch sub-sheets.
 */

export interface SheetTab {
    name: string;
    gid: string;
}

const URLS = (sheetId: string): string[] => [
    `https://docs.google.com/spreadsheets/d/${sheetId}/htmlview`,
    `https://docs.google.com/spreadsheets/d/${sheetId}/pubhtml`,
    `https://docs.google.com/spreadsheets/d/${sheetId}/edit`,
];

export async function discoverSheetTabs(sheetId: string): Promise<SheetTab[]> {
    let html = '';
    for (const tryUrl of URLS(sheetId)) {
        try {
            const r = await fetch(tryUrl, { redirect: 'follow', headers: { Accept: 'text/html,*/*' } });
            if (!r.ok) continue;
            const text = await r.text();
            if (text.length > 200 && (text.includes('sheetId') || text.includes('sheet-id') || text.includes('gid='))) {
                html = text;
                break;
            }
            if (!html && text.length > 200) html = text;
        } catch { /* try next */ }
    }
    if (!html) return [];

    const tabs: SheetTab[] = [];
    const seen = new Set<string>();
    const add = (name: string, gid: string) => {
        const trimmed = name.trim();
        if (!trimmed || seen.has(gid)) return;
        seen.add(gid);
        tabs.push({ name: trimmed, gid });
    };

    // {"title":"...","sheetId":N}
    for (const m of html.matchAll(/"title"\s*:\s*"([^"]+)"[^}]*?"sheetId"\s*:\s*(\d+)/g)) add(m[1], m[2]);
    // {"sheetId":N,"title":"..."}
    for (const m of html.matchAll(/"sheetId"\s*:\s*(\d+)[^}]*?"title"\s*:\s*"([^"]+)"/g)) add(m[2], m[1]);
    // data-sheet-id="N">name<
    for (const m of html.matchAll(/data-sheet-id="(\d+)"[^>]*>([^<]+)</g)) add(m[2], m[1]);
    // id="sheet-button-N">name<
    for (const m of html.matchAll(/id="sheet-button-(\d+)"[^>]*>([^<]+)</g)) add(m[2], m[1]);
    // gid=N">name<
    for (const m of html.matchAll(/gid=(\d+)[^"]*"[^>]*>\s*([^<]+)</g)) add(m[2], m[1]);

    return tabs;
}
