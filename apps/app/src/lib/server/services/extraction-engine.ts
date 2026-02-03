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

export class ExtractionEngine {
    async analyze(buffer: Buffer, mimeType: string): Promise<ExtractionResult> {
        console.log('[EXTRACTION_ENGINE] 🚀 Starting V14 Region-Based analysis...');
        const image = await Jimp.read(buffer);
        const width = image.bitmap.width;
        const height = image.bitmap.height;

        // 1. Structural Analysis: Detect Lines and Regions
        const lines = this.detectLines(image);
        const regions = this.detectRegions(lines, width, height);

        // 2. Targeted OCR per Region
        const textElements = await this.ocrRegions(image, regions, buffer);

        // 3. Identification & Metadata
        const metadata: Record<string, string> = {};
        textElements.forEach((el, idx) => {
            const content = el.text.trim();
            if (this.isMetadata(content)) {
                const key = this.getMetaKey(content);
                if (key) {
                    let value = "";
                    if (content.includes(':')) {
                        value = content.split(':').slice(1).join(':').trim();
                    }
                    if (value) metadata[key] = value;
                    else if (!metadata[key]) metadata[key] = "";
                }
            }
        });

        const debugImage = await image.getBase64Async(Jimp.MIME_PNG);

        return {
            page: { width: 210, height: 297 },
            pages: [{
                id: 'page-1',
                elements: [...textElements, ...lines.map((l, i) => ({ id: `line-${i}`, type: 'line', ...l }))]
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

        // 1. Identify Header Region (Top area above first major line or top 20%)
        const hLines = lines.filter(l => l.orientation === 'horizontal').sort((a, b) => a.y - b.y);
        const topMostLineY = hLines.length > 0 ? hLines[0].y : 0.2;
        regions.push({ x: 0, y: 0, w: 1, h: topMostLineY, type: 'header' });

        // 2. Detect Grid Cells (Simple intersection logic)
        const vLines = lines.filter(l => l.orientation === 'vertical').sort((a, b) => a.x - b.x);

        for (let i = 0; i < hLines.length - 1; i++) {
            for (let j = 0; j < vLines.length - 1; j++) {
                const h1 = hLines[i];
                const h2 = hLines[i + 1];
                const v1 = vLines[j];
                const v2 = vLines[j + 1];

                // Check for intersection/close proximity to form a cell
                if (v1.x >= h1.x && v2.x <= h1.x2 && h1.y >= v1.y && h2.y <= v1.y2) {
                    regions.push({
                        x: v1.x, y: h1.y,
                        w: v2.x - v1.x, h: h2.y - h1.y,
                        type: 'cell'
                    });
                }
            }
        }

        // 3. Fallback: Large areas between lines if no grid
        if (regions.length === 1 && hLines.length > 1) {
            for (let i = 0; i < hLines.length - 1; i++) {
                regions.push({
                    x: 0, y: hLines[i].y,
                    w: 1, h: hLines[i + 1].y - hLines[i].y,
                    type: 'cell'
                });
            }
        }

        return regions.filter(r => r.w > 0.01 && r.h > 0.01);
    }

    private async ocrRegions(image: Jimp, regions: Region[], originalBuffer: Buffer) {
        const textElements: any[] = [];
        const visionCreds = process.env.GOOGLE_CREDENTIALS_JSON;
        const client = visionCreds ? new vision.ImageAnnotatorClient({ credentials: JSON.parse(visionCreds) }) : null;

        for (const region of regions) {
            try {
                // 1. Crop and Pre-process
                const { buffer, scale } = await this.preprocessRegion(image, region);

                let detectedText = "";
                let subElements: any[] = [];

                if (client) {
                    const [result] = await client.documentTextDetection(buffer);
                    const fullText = result.fullTextAnnotation;
                    if (fullText) {
                        detectedText = fullText.text || "";
                        // Capture line/word structures here if needed for stacking
                    }
                } else {
                    const worker = await createWorker('eng');
                    const { data } = await worker.recognize(buffer);
                    detectedText = data.text || "";
                    await worker.terminate();
                }

                if (detectedText.trim()) {
                    const isHeader = region.type === 'header' || (region.w > 0.5 && region.h < 0.08);
                    const color = this.sampleColor(image, region);

                    textElements.push({
                        id: `text-${Math.random().toString(36).slice(2, 9)}`,
                        type: 'text',
                        x: region.x,
                        y: region.y,
                        width: region.w,
                        height: region.h,
                        text: detectedText.trim(),
                        content: detectedText.trim(),
                        style: {
                            textAlign: isHeader ? 'center' : 'left',
                            fontWeight: isHeader ? '700' : '400',
                            color: color,
                            fontFamily: "'Inter', sans-serif"
                        }
                    });
                }
            } catch (e) {
                console.error(`[REGION_OCR_FAIL]`, e);
            }
        }

        return textElements;
    }

    private async preprocessRegion(image: Jimp, region: Region) {
        const w = image.bitmap.width;
        const h = image.bitmap.height;
        const rx = Math.floor(region.x * w);
        const ry = Math.floor(region.y * h);
        const rw = Math.floor(region.w * w);
        const rh = Math.floor(region.h * h);

        const crop = image.clone().crop(rx, ry, rw, rh);

        // Quality improvements
        crop.grayscale();

        // 2x scaling for small labels
        let scale = 1;
        if (rw < 200 || rh < 50) {
            crop.resize(rw * 2, Jimp.AUTO);
            scale = 2;
        }

        // Apply thresholding manually since Jimp's contrast/threshold can be flaky
        crop.scan(0, 0, crop.bitmap.width, crop.bitmap.height, function (x, y, idx) {
            const avg = (this.bitmap.data[idx] + this.bitmap.data[idx + 1] + this.bitmap.data[idx + 2]) / 3;
            const val = avg < 160 ? 0 : 255;
            this.bitmap.data[idx] = val;
            this.bitmap.data[idx + 1] = val;
            this.bitmap.data[idx + 2] = val;
        });

        return {
            buffer: await crop.getBufferAsync(Jimp.MIME_PNG),
            scale
        };
    }

    private sampleColor(image: Jimp, region: Region) {
        const w = image.bitmap.width;
        const h = image.bitmap.height;
        const rx = Math.floor(region.x * w + region.w * w / 2);
        const ry = Math.floor(region.y * h + region.h * h / 2);

        const c = Jimp.intToRGBA(image.getPixelColor(rx, ry));
        const avg = (c.r + c.g + c.b) / 3;
        return avg < 160 ? '#000000' : '#000000'; // Defaulting to #000 as per requested constraint
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
