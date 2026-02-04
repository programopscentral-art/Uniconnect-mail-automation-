import { createWorker } from 'tesseract.js';
import vision from '@google-cloud/vision';
import { loadImage, createCanvas, type Image } from '@napi-rs/canvas';
import type { TemplateElement } from '$lib/types/template';

export interface ExtractionResult {
    page: { width: number; height: number; };
    pages: Array<{ id: string; elements: TemplateElement[]; }>;
    regions: Array<any>; // V22: Standardized flat regions
    metadata_fields?: Record<string, string>;
    debugImage?: string;
    originalWidth: number;
    originalHeight: number;
}

interface Region {
    id: string; // V22 added ID to region
    x: number; y: number; w: number; h: number;
    type: 'header' | 'cell' | 'label' | 'text' | 'field';
    defaultText?: string;
    style?: any;
}

/**
 * V22/V60: Region-Anchored High-Fidelity Engine
 * Rewritten to use @napi-rs/canvas (no native deps)
 */
export class ExtractionEngine {
    async analyze(buffer: Buffer, mimeType: string): Promise<ExtractionResult> {
        console.log('[EXTRACTION_ENGINE] 🚀 Starting V60 @napi-rs/canvas analysis...');
        const image = await loadImage(buffer);
        const width = image.width;
        const height = image.height;

        // Create canvas and get pixel data for line detection
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        const imageData = ctx.getImageData(0, 0, width, height);
        const pixels = imageData.data;

        // 1. Structural Analysis: Detect Geometry (Locked)
        const lines = this.detectLines(pixels, width, height);
        const rawRegions = this.detectRegions(lines, width, height);

        console.log(`[EXTRACTION_ENGINE] 📍 Geometry locked: ${rawRegions.length} regions detected`);

        // 2. Specialized OCR: Propose text suggestions only
        const finalizedRegions = await this.ocrRegions(image, rawRegions, buffer);

        // 3. Metadata Extraction (from suggestions)
        const metadata: Record<string, string> = {};
        finalizedRegions.forEach((r) => {
            const content = (r.defaultText || "").trim();
            if (this.isMetadata(content)) {
                const key = this.getMetaKey(content);
                if (key) {
                    let val = "";
                    if (content.includes(':')) {
                        val = content.split(':').slice(1).join(':').trim();
                    }
                    if (val) metadata[key] = val;
                }
            }
        });

        // Use the original image as the template background
        const debugImage = canvas.toDataURL('image/png');

        return {
            page: { width: 210, height: 297 },
            pages: [{
                id: 'page-1',
                elements: finalizedRegions.map(r => ({
                    ...r,
                    id: r.id,
                    type: r.type === 'header' ? 'header-field' : 'text',
                    page: 1,
                    text: r.defaultText || "",
                    style: {
                        fontFamily: r.type === 'header' ? 'Inter' : 'monospace',
                        fontSize: 12, // Default size
                        fontWeight: r.type === 'header' ? 'bold' : 'normal',
                        align: 'left',
                        color: '#000000'
                    }
                }))
            }],
            regions: finalizedRegions,
            metadata_fields: metadata,
            debugImage,
            originalWidth: width,
            originalHeight: height
        };
    }

    private detectLines(pixels: Uint8ClampedArray, w: number, h: number) {
        const lines: any[] = [];
        const threshold = 160;

        const scan = (isH: boolean) => {
            const res: any[] = [];
            const outer = isH ? h : w;
            const inner = isH ? w : h;
            for (let i = 0; i < outer; i++) {
                let start = -1;
                for (let j = 0; j < inner; j++) {
                    const idx = isH ? (i * w + j) * 4 : (j * w + i) * 4;
                    const r = pixels[idx];
                    const g = pixels[idx + 1];
                    const b = pixels[idx + 2];

                    if ((r + g + b) / 3 < threshold) {
                        if (start === -1) start = j;
                    } else if (start !== -1) {
                        if ((j - start) > inner * 0.02) {
                            res.push(isH ? {
                                x: start / w, y: i / h,
                                x1: start / w, y1: i / h,
                                x2: j / w, y2: i / h,
                                thickness: 1.5 / h,
                                orientation: 'horizontal'
                            } : {
                                x: i / w, y: start / h,
                                x1: i / w, y1: start / h,
                                x2: i / w, y2: j / h,
                                thickness: 1.5 / w,
                                orientation: 'vertical'
                            });
                        }
                        start = -1;
                    }
                }
            }
            return res;
        };

        return [...scan(true), ...scan(false)];
    }

    private detectRegions(lines: any[], imgW: number, imgH: number): Region[] {
        const regions: Region[] = [];
        const hLines = lines.filter(l => l.orientation === 'horizontal').sort((a, b) => a.y - b.y);
        const vLines = lines.filter(l => l.orientation === 'vertical').sort((a, b) => a.x - b.x);

        // Utility to generate unique ID
        const genId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

        // V15 Mandatory Header
        regions.push({ id: genId('header'), x: 0.06, y: 0.04, w: 0.88, h: 0.22, type: 'header' });

        // Structural header if line detected
        if (hLines.length > 0 && hLines[0].y > 0.1) {
            regions.push({ id: genId('header-struct'), x: 0, y: 0, w: 1, h: hLines[0].y, type: 'header' });
        }

        // Detect Cells
        for (let i = 0; i < hLines.length - 1; i++) {
            for (let j = 0; j < vLines.length - 1; j++) {
                const h1 = hLines[i];
                const h2 = hLines[i + 1];
                const v1 = vLines[j];
                const v2 = vLines[j + 1];
                if (v1.x >= h1.x && v2.x <= h1.x2 && h1.y >= v1.y && h2.y <= v1.y2) {
                    regions.push({ id: genId('cell'), x: v1.x, y: h1.y, w: v2.x - v1.x, h: h2.y - h1.y, type: 'cell' });
                }
            }
        }

        // Fallback row cells
        if (regions.length <= 2 && hLines.length > 1) {
            for (let i = 0; i < hLines.length - 1; i++) {
                regions.push({ id: genId('row-cell'), x: 0, y: hLines[i].y, w: 1, h: hLines[i + 1].y - hLines[i].y, type: 'cell' });
            }
        }

        return regions.filter(r => r.w > 0.01 && r.h > 0.01);
    }

    private async ocrRegions(image: Image, regions: Region[], originalBuffer: Buffer): Promise<Region[]> {
        const finalized: Region[] = [];
        const visionCreds = process.env.GOOGLE_CREDENTIALS_JSON;
        const client = visionCreds ? new vision.ImageAnnotatorClient({ credentials: JSON.parse(visionCreds) }) : null;

        for (const region of regions) {
            try {
                let text = "";
                if (region.type === 'header') {
                    text = await this.performDualPassOCR(image, region, client);
                } else {
                    text = await this.performSinglePassOCR(image, region, client, true);
                }

                finalized.push({
                    ...region,
                    defaultText: text.trim(),
                    style: {
                        fontFamily: region.type === 'header' ? 'Inter' : 'monospace',
                        fontWeight: region.type === 'header' ? 'bold' : 'normal',
                        color: '#000000'
                    }
                });
            } catch (e) {
                console.error(`[REGION_OCR_FAIL]`, e);
                finalized.push(region); // Keep geometry even if OCR fails
            }
        }
        return finalized;
    }

    private async performDualPassOCR(image: Image, region: Region, client: any): Promise<string> {
        const passA = await this.performSinglePassOCR(image, region, client, false);
        const passB = await this.performSinglePassOCR(image, region, client, true);
        return passA.length >= passB.length ? passA : passB;
    }

    private async performSinglePassOCR(image: Image, region: Region, client: any, threshold: boolean): Promise<string> {
        const buffer = await this.getProcessedRegionBuffer(image, region, threshold);
        if (client) {
            const [result] = await client.documentTextDetection(buffer);
            return result.fullTextAnnotation?.text || "";
        } else {
            const worker = await createWorker('eng');
            const { data } = await worker.recognize(buffer);
            await worker.terminate();
            return data.text || "";
        }
    }

    private async getProcessedRegionBuffer(image: Image, region: Region, useThreshold: boolean): Promise<Buffer> {
        const w = image.width;
        const h = image.height;
        const rx = Math.floor(region.x * w);
        const ry = Math.floor(region.y * h);
        const rw = Math.floor(region.w * w);
        const rh = Math.floor(region.h * h);

        let finalWidth = rw;
        let finalHeight = rh;
        let scale = 1;
        if (rw < 200) {
            scale = 2;
            finalWidth = rw * 2;
            finalHeight = rh * 2;
        }

        const regionCanvas = createCanvas(finalWidth, finalHeight);
        const ctx = regionCanvas.getContext('2d');

        // Use binary threshold if requested
        if (useThreshold) {
            // First draw cropped to a temporary canvas to get pixels
            const tempCanvas = createCanvas(rw, rh);
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(image, -rx, -ry);
            const idata = tempCtx.getImageData(0, 0, rw, rh);
            const data = idata.data;
            for (let i = 0; i < data.length; i += 4) {
                const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
                const val = avg < 160 ? 0 : 255;
                data[i] = data[i + 1] = data[i + 2] = val;
            }
            tempCtx.putImageData(idata, 0, 0);

            // Now draw scaled
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(tempCanvas, 0, 0, rw, rh, 0, 0, finalWidth, finalHeight);
        } else {
            ctx.drawImage(image, -rx, -ry, w, h, 0, 0, w * scale, h * scale);
        }

        return regionCanvas.toBuffer('image/png');
    }

    private isMetadata(t: string): boolean {
        return /university|duration|time|marks|code|subject|program|branch|academic/i.test(t);
    }

    private getMetaKey(t: string): string | null {
        const low = t.toLowerCase();
        if (low.includes('university')) return 'UNIVERSITY_NAME';
        if (low.includes('time')) return 'TIME';
        if (low.includes('marks')) return 'MAX_MARKS';
        if (low.includes('code')) return 'SUBJECT_CODE';
        if (low.includes('subject')) return 'SUBJECT_NAME';
        if (low.includes('branch')) return 'PROGRAM_BRANCH';
        if (low.includes('academic')) return 'ACADEMIC_YEAR';
        return null;
    }
}
