export type HighlightSpan = {
    start: number;
    end: number;
    type: "ai" | "plagiarism" | "both";
    score: number;
    tooltip: string;
    source?: string;
};

export function renderHighlightedHTML(text: string, spans: HighlightSpan[]) {
    // Sort by start position
    const sorted = [...spans].sort((a, b) => a.start - b.start);
    let out = "";
    let idx = 0;

    for (const s of sorted) {
        // Skip if span starts before current index (overlap handling - simple skip for now)
        if (s.start < idx) continue;

        // Normal text before highlight
        out += escapeHTML(text.slice(idx, s.start));

        // Highlighted part
        const chunk = escapeHTML(text.slice(s.start, s.end));
        const alpha = Math.min(0.85, Math.max(0.15, s.score));

        // Choose color based on type
        let color = `rgba(255,165,0,${alpha})`; // Default AI (Orange)
        if (s.type === "plagiarism") {
            color = `rgba(255,0,0,${alpha})`; // Plagiarism (Red)
        } else if (s.type === "both") {
            color = `rgba(128,0,128,${alpha})`; // Both (Purple)
        }

        out += `<span class="px-0.5 rounded-sm transition-colors duration-200 cursor-help" style="background-color: ${color}" title="${escapeAttr(s.tooltip)}">${chunk}</span>`;

        idx = s.end;
    }

    // Final normal text
    out += escapeHTML(text.slice(idx));
    return out;
}

function escapeHTML(str: string) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function escapeAttr(str: string) {
    return str.replace(/"/g, "&quot;");
}

export function getRiskColor(risk: string) {
    switch (risk) {
        case 'HIGH': return 'bg-rose-100 text-rose-700 border-rose-200';
        case 'MEDIUM': return 'bg-amber-100 text-amber-700 border-amber-200';
        case 'LOW': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
        default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
}
