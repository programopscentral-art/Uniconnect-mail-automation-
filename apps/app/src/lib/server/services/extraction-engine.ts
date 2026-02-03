import { createWorker } from 'tesseract.js';
import vision from '@google-cloud/vision';
import Jimp from 'jimp';

export interface ExtractionResult {
    page: { width: number; height: number; };
    pages: Array<{ id: string; elements: Array<any>; }>;
    metadata_fields?: Record<string, string>;
    debugImage?: string;
    originalWidth: number;
    originalHeight: number;
}

interface Region {
    x: number; y: number; w: number; h: number;
    type: 'header' | 'cell' | 'label';
}

/**
 * V16: Image-As-Template Engine
 * 
 * Instead of reconstructing layout from scratch, we use the image as the base
 * and detect "fields" (regions) for editable overlays.
 */
export class ExtractionEngine {
    async analyze(buffer: Buffer, mimeType: string): Promise<ExtractionResult> {
        console.log('[EXTRACTION_ENGINE] 🚀 Starting V16 Image-As-Template analysis...');
        const image = await Jimp.read(buffer);
        const width = image.bitmap.width;
        const height = image.bitmap.height;

        // 1. Structural Analysis: Detect Lines and Regions (Anchors for Fields)
        const lines = this.detectLines(image);
        const regions = this.detectRegions(lines, width, height);

        console.log(`[EXTRACTION_ENGINE] 📍 Regions detected: ${regions.length}`);

        // 2. Targeted OCR to initialize field values
        const fields = await this.ocrFields(image, regions, buffer);

        // 3. Metadata Extraction (from field values)
        const metadata: Record<string, string> = {};
        fields.forEach((f) => {
            const content = f.value.trim();
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
        const debugImage = await image.getBase64Async(Jimp.MIME_PNG);

        return {
            page: { width: 210, height: 297 },
            pages: [{
                id: 'page-1',
                elements: [
                    ...fields,
                    ...lines.map((l, i) => ({ id: `line-${i}`, type: 'line', ...l, hidden: true }))
                ]
            }],
            metadata_fields: metadata,
            debugImage,
            originalWidth: width,
            originalHeight: height
        };
    }

    private detectLines(image: Jimp) {
        const w = image.bitmap.width;
        const h = image.bitmap.height;
        const lines: any[] = [];
        const threshold = 160;

        const scan = (isH: boolean) => {
            const res: any[] = [];
            const outer = isH ? h : w;
            const inner = isH ? w : h;
            for (let i = 0; i < outer; i++) {
                let start = -1;
                for (let j = 0; j < inner; j++) {
                    const c = Jimp.intToRGBA(image.getPixelColor(isH ? j : i, isH ? i : j));
                    if ((c.r + c.g + c.b) / 3 < threshold) {
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

        // V15 Mandatory Header
        regions.push({ x: 0.06, y: 0.04, w: 0.88, h: 0.22, type: 'header' });

        // Structural header if line detected
        if (hLines.length > 0 && hLines[0].y > 0.1) {
            regions.push({ x: 0, y: 0, w: 1, h: hLines[0].y, type: 'header' });
        }

        // Detect Cells
        for (let i = 0; i < hLines.length - 1; i++) {
            for (let j = 0; j < vLines.length - 1; j++) {
                const h1 = hLines[i];
                const h2 = hLines[i + 1];
                const v1 = vLines[j];
                const v2 = vLines[j + 1];
                if (v1.x >= h1.x && v2.x <= h1.x2 && h1.y >= v1.y && h2.y <= v1.y2) {
                    regions.push({ x: v1.x, y: h1.y, w: v2.x - v1.x, h: h2.y - h1.y, type: 'cell' });
                }
            }
        }

        // Fallback row cells
        if (regions.length <= 2 && hLines.length > 1) {
            for (let i = 0; i < hLines.length - 1; i++) {
                regions.push({ x: 0, y: hLines[i].y, w: 1, h: hLines[i + 1].y - hLines[i].y, type: 'cell' });
            }
        }

        return regions.filter(r => r.w > 0.01 && r.h > 0.01);
    }

    private async ocrFields(image: Jimp, regions: Region[], originalBuffer: Buffer) {
        const fields: any[] = [];
        const visionCreds = process.env.GOOGLE_CREDENTIALS_JSON;
        const client = visionCreds ? new vision.ImageAnnotatorClient({ credentials: JSON.parse(visionCreds) }) : null;

        for (const region of regions) {
            try {
                let value = "";
                if (region.type === 'header') {
                    value = await this.performDualPassOCR(image, region, client);
                } else {
                    value = await this.performSinglePassOCR(image, region, client, true);
                }

                fields.push({
                    id: `field-${Math.random().toString(36).slice(2, 9)}`,
                    type: 'field',
                    x: region.x,
                    y: region.y,
                    width: region.w,
                    height: region.h,
                    value: value.trim(),
                    fieldType: region.type === 'header' ? 'header' : 'input',
                    is_header: region.type === 'header'
                });
            } catch (e) {
                console.error(`[FIELD_OCR_FAIL]`, e);
            }
        }
        return fields;
    }

    private async performDualPassOCR(image: Jimp, region: Region, client: any): Promise<string> {
        const passA = await this.performSinglePassOCR(image, region, client, false);
        const passB = await this.performSinglePassOCR(image, region, client, true);
        return passA.length >= passB.length ? passA : passB;
    }

    private async performSinglePassOCR(image: Jimp, region: Region, client: any, threshold: boolean): Promise<string> {
        const { buffer } = await this.getProcessedRegionBuffer(image, region, threshold);
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

    private async getProcessedRegionBuffer(image: Jimp, region: Region, useThreshold: boolean) {
        const w = image.bitmap.width;
        const h = image.bitmap.height;
        const rx = Math.floor(region.x * w);
        const ry = Math.floor(region.y * h);
        const rw = Math.floor(region.w * w);
        const rh = Math.floor(region.h * h);

        const crop = image.clone().crop(rx, ry, rw, rh);
        crop.grayscale();
        if (rw < 200) crop.resize(rw * 2, Jimp.AUTO);

        if (useThreshold) {
            crop.scan(0, 0, crop.bitmap.width, crop.bitmap.height, (x, y, idx) => {
                const avg = (crop.bitmap.data[idx] + crop.bitmap.data[idx + 1] + crop.bitmap.data[idx + 2]) / 3;
                const val = avg < 160 ? 0 : 255;
                crop.bitmap.data[idx] = crop.bitmap.data[idx + 1] = crop.bitmap.data[idx + 2] = val;
            });
        }
        return { buffer: await crop.getBufferAsync(Jimp.MIME_PNG) };
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
