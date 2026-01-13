export type HighlightSpan = {
    start: number;
    end: number;
    type: "ai" | "plagiarism" | "both";
    score: number;
    tooltip: string;
    source?: string;
};

export type PlagiarismSource = {
    title: string;
    url: string;
    similarity: number;
}

export type ScanResponse = {
    ai_likelihood: number;
    ai_risk: string;
    plagiarism_similarity: number;
    plagiarism_risk: string;
    reasons: string[];
    highlights: HighlightSpan[];
    plagiarism_sources?: PlagiarismSource[];
    meta: Record<string, any>;
};

export type ScanMode = "local" | "web" | "hybrid";

const BASE = import.meta.env.VITE_AI_DETECTOR_URL ?? "http://127.0.0.1:8001";

export async function scanText(text: string, mode: ScanMode = "hybrid"): Promise<ScanResponse> {
    const res = await fetch(`${BASE}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, mode })
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Unknown error" }));
        throw new Error(err.detail || "AI Service Error");
    }
    return res.json();
}

export async function scanFile(file: File, mode: ScanMode = "hybrid"): Promise<ScanResponse> {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("mode", mode);
    const res = await fetch(`${BASE}/scan-file`, { method: "POST", body: fd });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Unknown error" }));
        throw new Error(err.detail || "AI Service Error");
    }
    return res.json();
}
