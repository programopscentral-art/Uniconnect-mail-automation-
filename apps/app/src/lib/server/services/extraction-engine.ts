import { createWorker } from 'tesseract.js';
import vision from '@google-cloud/vision';
import Jimp from 'jimp';

export interface ExtractionResult {
    page: {
        width: number;
        height: number;
    };
    pages: Array<{
        id: string;
        elements: Array<any>;
    }>;
    metadata_fields?: Record<string, string>;
    debugImage?: string;
    originalWidth: number;
    originalHeight: number;
}

export class ExtractionEngine {
    /**
     * Entry point for high-fidelity extraction (V10).
     */
    async analyze(buffer: Buffer, mimeType: string): Promise<ExtractionResult> {
        console.log('[EXTRACTION_ENGINE] 🚀 Starting V10 High-Fidelity analysis...');

        const image = await Jimp.read(buffer);
        const width = image.bitmap.width;
        const height = image.bitmap.height;

        console.log(`[EXTRACTION_ENGINE] 📸 Image loaded: ${width}x${height}`);

        // 1. OCR using Google Vision (Primary) or Tesseract (Fallback)
        const { textBlocks, ocrEngine } = await this.performOCR(buffer, image);

        // 2. Line/Structural Analysis
        const structuralElements = await this.detectStructure(image);

        // 3. Identification & Heuristics
        const finalElements = textBlocks.map(block => {
            const isQuestion = this.isQuestion(block.text);
            const isTop = block.y < 0.35; // Top 35% header zone
            const isHeader = isTop || block.style?.fontSize > 18 || /UNIVERSITY|EXAM|UNIT TEST|SEMESTER/i.test(block.text);

            return {
                ...block,
                is_header: isHeader,
                is_question: isQuestion,
                content: block.text
            };
        });

        // 4. Extract Meta Fields
        const metadata: Record<string, string> = {};
        finalElements.forEach((el, idx) => {
            const content = el.content.trim();
            if (this.isMetadata(content)) {
                const key = this.getMetaKey(content);
                if (key) {
                    let value = "";
                    if (content.includes(':')) {
                        value = content.split(':').slice(1).join(':').trim();
                    } else if (content.includes(' - ')) {
                        value = content.split(' - ').slice(1).join(' - ').trim();
                    }

                    if (!value && idx + 1 < finalElements.length) {
                        const next = finalElements[idx + 1];
                        if (Math.abs(next.y - el.y) < 0.015) {
                            value = next.content;
                        }
                    }

                    if (value) metadata[key] = value;
                    else if (!metadata[key]) metadata[key] = "";
                }
            }
        });

        const debugImage = await image.getBase64Async(Jimp.MIME_PNG);

        return {
            page: { width: 210, height: 297 }, // A4 reference
            pages: [
                {
                    id: 'page-1',
                    elements: [
                        ...finalElements,
                        ...structuralElements,
                        {
                            id: 'logo-slot',
                            type: 'image-slot',
                            x: 0.05,
                            y: 0.05,
                            width: 0.15,
                            height: 0.1,
                            slotName: 'University Logo'
                        }
                    ]
                }
            ],
            metadata_fields: metadata,
            debugImage,
            originalWidth: width,
            originalHeight: height
        };
    }

    private async performOCR(buffer: Buffer, image: Jimp) {
        const imgW = image.bitmap.width;
        const imgH = image.bitmap.height;
        let rawBlocks: any[] = [];
        let ocrEngine = 'tesseract';

        const visionCreds = process.env.GOOGLE_CREDENTIALS_JSON;
        if (visionCreds) {
            try {
                const client = new vision.ImageAnnotatorClient({ credentials: JSON.parse(visionCreds) });
                const [result] = await client.documentTextDetection(buffer);
                const fullText = result.fullTextAnnotation;

                if (fullText) {
                    ocrEngine = 'vision';
                    fullText.pages?.forEach(page => {
                        page.blocks?.forEach(block => {
                            block.paragraphs?.forEach(para => {
                                para.words?.forEach(word => {
                                    const text = word.symbols?.map((s: any) => s.text).join('') || '';
                                    if (!text) return;
                                    const v = word.boundingBox?.vertices;
                                    if (v && v.length >= 4) {
                                        const x = (v[0].x || 0) / imgW;
                                        const y = (v[0].y || 0) / imgH;
                                        const w = ((v[1].x || 0) - (v[0].x || 0)) / imgW;
                                        const h = ((v[2].y || 0) - (v[0].y || 0)) / imgH;
                                        rawBlocks.push({ x, y, width: w, height: h, text, confidence: word.confidence || 0.95 });
                                    }
                                });
                            });
                        });
                    });
                }
            } catch (e: any) { console.error('[VISION_FAIL]', e.message); }
        }

        if (rawBlocks.length === 0) {
            const worker = await createWorker('eng');
            const { data } = await worker.recognize(buffer);
            rawBlocks = (data.blocks as any[])?.map(b => ({
                x: b.bbox.x0 / imgW,
                y: b.bbox.y0 / imgH,
                width: (b.bbox.x1 - b.bbox.x0) / imgW,
                height: (b.bbox.y1 - b.bbox.y0) / imgH,
                text: b.text.trim(),
                confidence: b.confidence
            })).filter(b => b.text) || [];
            await worker.terminate();
        }

        const mergedBlocks = this.groupIntoLines(rawBlocks, image);

        return {
            textBlocks: mergedBlocks.map((b, i) => {
                const isCenter = Math.abs((b.x + b.width / 2) - 0.5) < 0.08;
                const isRight = b.x > 0.6;
                const isHeaderArea = b.y < 0.35;
                const isBold = b.text === b.text.toUpperCase() || isHeaderArea;

                // V10 Font Size Logic: Based on normalized height
                // A4 Height @ 96dpi = 1122px. 
                let fontSize = Math.round(b.height * 1122 * 0.85);

                return {
                    id: `text-${i}`,
                    type: 'text',
                    ...b,
                    style: {
                        fontSize: Math.min(48, Math.max(8, fontSize)),
                        textAlign: isCenter ? 'center' : (isRight ? 'right' : 'left'),
                        fontWeight: isBold ? 'bold' : 'normal',
                        color: b.color || '#000000',
                        fontFamily: "'Inter', sans-serif"
                    }
                };
            }),
            ocrEngine
        };
    }

    private groupIntoLines(blocks: any[], image: Jimp) {
        if (blocks.length === 0) return [];
        const sorted = [...blocks].sort((a, b) => a.y - b.y || a.x - b.x);
        const imgW = image.bitmap.width;
        const imgH = image.bitmap.height;

        const getColor = (b: any) => {
            const px = Math.floor(b.x * imgW);
            const py = Math.floor(b.y * imgH);
            let dark = 765; let res = '#000000';
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const rgba = Jimp.intToRGBA(image.getPixelColor(Math.max(0, Math.min(imgW - 1, px + dx)), Math.max(0, Math.min(imgH - 1, py + dy))));
                    const sum = rgba.r + rgba.g + rgba.b;
                    if (sum < dark) {
                        dark = sum;
                        if (rgba.r > 150 && rgba.g < 100 && rgba.b < 100) res = '#dc2626';
                        else if (rgba.b > 150 && rgba.r < 100 && rgba.g < 100) res = '#2563eb';
                        else if (sum > 400) res = '#4b5563';
                        else res = '#000000';
                    }
                }
            }
            return res;
        };

        const merged: any[] = [];
        let curr = { ...sorted[0], color: getColor(sorted[0]) };

        for (let i = 1; i < sorted.length; i++) {
            const next = { ...sorted[i], color: getColor(sorted[i]) };
            const yDist = Math.abs(next.y - curr.y);
            const xGap = next.x - (curr.x + curr.width);
            const xOverlap = Math.max(0, Math.min(curr.x + curr.width, next.x + next.width) - Math.max(curr.x, next.x));

            if ((yDist < 0.008 && xGap < 0.05) || (yDist < 0.005 && xOverlap > 0)) {
                curr.text += (xGap > 0.01 ? " " : "") + next.text;
                curr.width = Math.max(curr.x + curr.width, next.x + next.width) - Math.min(curr.x, next.x);
                curr.x = Math.min(curr.x, next.x);
                curr.height = Math.max(curr.height, next.height);
            } else {
                merged.push(curr);
                curr = next;
            }
        }
        merged.push(curr);
        return merged;
    }

    private async detectStructure(image: Jimp) {
        const w = image.bitmap.width;
        const h = image.bitmap.height;
        const elements: any[] = [];

        // Simplified Line Detection (Normalized)
        const scan = (isH: boolean) => {
            const res: any[] = [];
            const outer = isH ? h : w;
            const inner = isH ? w : h;
            for (let i = 0; i < outer; i++) {
                let start = -1;
                for (let j = 0; j < inner; j++) {
                    const c = Jimp.intToRGBA(image.getPixelColor(isH ? j : i, isH ? i : j));
                    if ((c.r + c.g + c.b) / 3 < 160) {
                        if (start === -1) start = j;
                    } else if (start !== -1) {
                        if ((j - start) > inner * 0.05) {
                            res.push(isH ? { x: start / w, y: i / h, width: (j - start) / w, height: 2 / h } : { x: i / w, y: start / h, width: 2 / w, height: (j - start) / h });
                        }
                        start = -1;
                    }
                }
            }
            return res;
        };

        scan(true).forEach((l, i) => elements.push({ id: `h-${i}`, type: 'line', ...l, orientation: 'horizontal', color: '#000000' }));
        scan(false).forEach((l, i) => elements.push({ id: `v-${i}`, type: 'line', ...l, orientation: 'vertical', color: '#000000' }));

        return elements;
    }

    private isQuestion(t: string): boolean {
        return /^\d+[\.\)]|^[a-z][\.\)]|^[A-D][\.\)]|\bwhat is\b|\bexplain\b/i.test(t);
    }

    private isMetadata(t: string): boolean {
        return /university|duration|time|marks|code|subject|program|branch|academic/i.test(t);
    }

    private getMetaKey(t: string): string | null {
        const low = t.toLowerCase();
        if (low.includes('university')) return 'UNIVERSITY_NAME';
        if (low.includes('time') || low.includes('duration')) return 'TIME';
        if (low.includes('marks')) return 'MAX_MARKS';
        if (low.includes('code')) return 'SUBJECT_CODE';
        if (low.includes('subject')) return 'SUBJECT_NAME';
        if (low.includes('branch') || low.includes('program')) return 'PROGRAM_BRANCH';
        if (low.includes('academic') || low.includes('a.y')) return 'ACADEMIC_YEAR';
        return null;
    }
}
