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
     * Entry point for high-fidelity extraction.
     */
    async analyze(buffer: Buffer, mimeType: string): Promise<ExtractionResult> {
        console.log('[EXTRACTION_ENGINE] 🚀 Starting V9 High-Fidelity analysis...');

        const image = await Jimp.read(buffer);
        const width = image.bitmap.width;
        const height = image.bitmap.height;

        console.log(`[EXTRACTION_ENGINE] 📸 Image loaded: ${width}x${height}`);

        // 1. OCR using Google Vision (Primary) or Tesseract (Fallback)
        const { textBlocks, ocrEngine } = await this.performOCR(buffer, image);

        // 2. Line/Structural Analysis
        const structuralElements = await this.detectStructure(image);

        const A4_WIDTH_MM = 210;
        const A4_HEIGHT_MM = 297;

        // 3. Identification & Filtering
        const finalElements = textBlocks.map(block => {
            const isQuestion = this.isQuestion(block.text);
            const isTop = block.y < (height * 0.3); // Top 30% header zone

            // Heuristic for headers: Text in top 30% that isn't a question
            const isHeader = isTop && !isQuestion;

            return {
                ...block,
                is_header: isHeader,
                is_question: isQuestion,
                thickness: 1,
                content: block.text
            };
        });

        // 4. Extract Meta Fields & Values
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

                    // If no value found inside the string, look for next element
                    if (!value && idx + 1 < finalElements.length) {
                        const next = finalElements[idx + 1];
                        if (Math.abs(next.y - el.y) < (height * 0.01)) { // ~1% height proximity
                            value = next.content;
                        }
                    }

                    if (value) metadata[key] = value;
                    else if (!metadata[key]) metadata[key] = "";
                }
            }
        });

        // 5. Generate Debug Image
        const debugImage = await image.getBase64Async(Jimp.MIME_PNG);

        return {
            page: { width: A4_WIDTH_MM, height: A4_HEIGHT_MM },
            pages: [
                {
                    id: 'page-1',
                    elements: [
                        ...finalElements,
                        ...structuralElements,
                        // 6. Intelligent Logo Detection (Top Left Heuristic)
                        (() => {
                            return {
                                id: 'logo-slot',
                                type: 'image-slot',
                                x: Math.floor(width * 0.05),
                                y: Math.floor(height * 0.05),
                                width: Math.floor(width * 0.15),
                                height: Math.floor(height * 0.12),
                                slotName: 'University Logo'
                            };
                        })()
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
        const imgWidth = image.bitmap.width;
        const imgHeight = image.bitmap.height;
        let textBlocks: any[] = [];
        let ocrEngine = 'tesseract';

        // Try Google Vision (Option A)
        const visionCreds = process.env.GOOGLE_CREDENTIALS_JSON;
        if (visionCreds) {
            try {
                console.log('[EXTRACTION_ENGINE] 🛡️ Attempting Google Vision OCR...');
                const client = new vision.ImageAnnotatorClient({
                    credentials: JSON.parse(visionCreds)
                });
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
                                    const vertices = word.boundingBox?.vertices;
                                    if (vertices && vertices.length >= 4) {
                                        const x = vertices[0].x || 0;
                                        const y = vertices[0].y || 0;
                                        const w = (vertices[1].x || 0) - x;
                                        const h = (vertices[2].y || 0) - y;
                                        textBlocks.push({ x, y, width: w, height: h, text, confidence: word.confidence || 1.0 });
                                    }
                                });
                            });
                        });
                    });
                }
            } catch (ve: any) {
                console.error('[EXTRACTION_ENGINE] ⚠️ Vision OCR Failed:', ve.message);
            }
        }

        // Fallback to Tesseract (Option B)
        if (textBlocks.length === 0) {
            console.log('[EXTRACTION_ENGINE] 🐢 Falling back to Tesseract OCR...');
            const worker = await createWorker('eng');
            const { data } = await worker.recognize(buffer);
            textBlocks = (data.blocks as any[])?.map((block: any, i: number) => {
                const bbox = block.bbox;
                const text = block.text.trim();
                if (!text) return null;
                return {
                    x: bbox.x0,
                    y: bbox.y0,
                    width: bbox.x1 - bbox.x0,
                    height: bbox.y1 - bbox.y0,
                    text: text,
                    confidence: block.confidence
                };
            }).filter((b: any) => b !== null) || [];
            await worker.terminate();
        }

        // Merge Fragmented Blocks using Pixel Logic
        const mergedBlocks = this.mergeTextBlocks(textBlocks, image);

        const finalBlocks = mergedBlocks.map((block: any, i: number) => {
            const { x, y, width, height, text } = block;

            const isHeaderArea = y < (imgHeight * 0.35);
            const isBold = (text === text.toUpperCase() && text.length > 5) || isHeaderArea;
            const centerX = x + (width / 2);
            const isCentered = Math.abs(centerX - (imgWidth / 2)) < (imgWidth * 0.05);

            let fontSize = Math.round(height * 0.75);
            if (isHeaderArea && fontSize < 16) fontSize = 16;
            if (fontSize < 10) fontSize = 12;

            return {
                id: `text-${i}`,
                type: 'text',
                x, y, width, height,
                text, content: text,
                confidence: block.confidence,
                style: {
                    fontSize,
                    textAlign: isCentered ? 'center' : (x > (imgWidth * 0.6) ? 'right' : 'left'),
                    fontWeight: isBold ? 'bold' : 'normal',
                    color: block.color || '#000000',
                    fontFamily: "'Inter', sans-serif"
                },
                is_header: isHeaderArea
            };
        });

        return { textBlocks: finalBlocks, ocrEngine };
    }

    private mergeTextBlocks(blocks: any[], image: Jimp) {
        if (blocks.length === 0) return [];
        const sorted = [...blocks].sort((a, b) => a.y - b.y || a.x - b.x);
        const merged: any[] = [];
        const imgW = image.bitmap.width;
        const imgH = image.bitmap.height;

        const getInkColor = (b: any) => {
            const pxX = Math.floor(b.x);
            const pxY = Math.floor(b.y);
            let minSum = 765;
            let bestRgb = { r: 0, g: 0, b: 0 };
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const xx = Math.min(imgW - 1, Math.max(0, pxX + dx));
                    const yy = Math.min(imgH - 1, Math.max(0, pxY + dy));
                    const rgba = Jimp.intToRGBA(image.getPixelColor(xx, yy));
                    if ((rgba.r + rgba.g + rgba.b) < minSum) {
                        minSum = rgba.r + rgba.g + rgba.b;
                        bestRgb = rgba;
                    }
                }
            }
            if (bestRgb.r > 150 && bestRgb.g < 100 && bestRgb.b < 100) return '#dc2626';
            if (bestRgb.b > 150 && bestRgb.r < 100 && bestRgb.g < 100) return '#2563eb';
            if (minSum > 450) return '#4b5563';
            return '#000000';
        };

        let current = { ...sorted[0], color: getInkColor(sorted[0]) };
        for (let i = 1; i < sorted.length; i++) {
            const next = { ...sorted[i], color: getInkColor(sorted[i]) };
            const yDiff = Math.abs(next.y - current.y);
            const xGap = next.x - (current.x + current.width);
            const xOverlap = Math.max(0, Math.min(current.x + current.width, next.x + next.width) - Math.max(current.x, next.x));
            const overlapPercent = xOverlap / Math.min(current.width, next.width);
            const gapThreshold = Math.floor(imgW * 0.05);

            if ((yDiff < Math.floor(imgH * 0.005) && xGap < gapThreshold) || overlapPercent > 0.25) {
                current.text = (current.text + (xGap > 0 ? " " : "") + next.text).replace(/\s+/g, ' ');
                current.width = Math.max(current.x + current.width, next.x + next.width) - Math.min(current.x, next.x);
                current.x = Math.min(current.x, next.x);
                current.height = Math.max(current.height, next.height);
                current.confidence = (current.confidence + next.confidence) / 2;
            } else {
                merged.push(current);
                current = next;
            }
        }
        merged.push(current);
        return merged;
    }

    private async detectStructure(image: Jimp) {
        const elements: any[] = [];
        const width = image.bitmap.width;
        const height = image.bitmap.height;

        const horizontalLines = this.scanHorizontalLines(image);
        const verticalLines = this.scanVerticalLines(image);

        horizontalLines.forEach((h, hi) => {
            elements.push({
                id: `line-h-${hi}`,
                type: 'line',
                x: h.x,
                y: h.y,
                width: h.length,
                height: 2,
                x1: h.x,
                y1: h.y,
                x2: h.x + h.length,
                y2: h.y,
                strokeWidth: 2,
                color: '#000000',
                orientation: 'horizontal'
            });
        });

        verticalLines.forEach((v, vi) => {
            elements.push({
                id: `line-v-${vi}`,
                type: 'line',
                x: v.x,
                y: v.y,
                width: 2,
                height: v.length,
                x1: v.x,
                y1: v.y,
                x2: v.x,
                y2: v.y + v.length,
                strokeWidth: 2,
                color: '#000000',
                orientation: 'vertical'
            });
        });

        return elements;
    }

    private scanHorizontalLines(image: Jimp) {
        const lines: { x: number; y: number; length: number }[] = [];
        const width = image.bitmap.width;
        const height = image.bitmap.height;
        const threshold = 160;

        for (let y = 0; y < height; y += 1) {
            let startX = -1;
            for (let x = 0; x < width; x++) {
                const color = Jimp.intToRGBA(image.getPixelColor(x, y));
                const brightness = (color.r + color.g + color.b) / 3;

                if (brightness < threshold) {
                    if (startX === -1) startX = x;
                } else {
                    if (startX !== -1) {
                        const length = x - startX;
                        if (length > width * 0.05) {
                            lines.push({ x: startX, y, length });
                        }
                        startX = -1;
                    }
                }
            }
            if (startX !== -1) {
                const length = width - startX;
                if (length > width * 0.05) lines.push({ x: startX, y, length });
            }
        }
        return this.mergeLines(lines, 'h');
    }

    private scanVerticalLines(image: Jimp) {
        const lines: { x: number; y: number; length: number }[] = [];
        const width = image.bitmap.width;
        const height = image.bitmap.height;
        const threshold = 160;

        for (let x = 0; x < width; x += 1) {
            let startY = -1;
            for (let y = 0; y < height; y++) {
                const color = Jimp.intToRGBA(image.getPixelColor(x, y));
                const brightness = (color.r + color.g + color.b) / 3;

                if (brightness < threshold) {
                    if (startY === -1) startY = y;
                } else {
                    if (startY !== -1) {
                        const length = y - startY;
                        if (length > height * 0.02) {
                            lines.push({ x, y: startY, length });
                        }
                        startY = -1;
                    }
                }
            }
            if (startY !== -1) {
                const length = height - startY;
                if (length > height * 0.02) lines.push({ x, y: startY, length });
            }
        }
        return this.mergeLines(lines, 'v');
    }

    private mergeLines(lines: any[], orientation: 'h' | 'v') {
        if (lines.length === 0) return [];

        const merged: any[] = [];
        const sorted = [...lines].sort((a, b) => orientation === 'h' ? a.y - b.y : a.x - b.x);

        let current = sorted[0];
        for (let i = 1; i < sorted.length; i++) {
            const next = sorted[i];
            const dist = orientation === 'h' ? Math.abs(next.y - current.y) : Math.abs(next.x - current.x);
            const posMatch = orientation === 'h' ? Math.abs(next.x - current.x) < 5 : Math.abs(next.y - current.y) < 5;

            if (dist < 3 && posMatch) {
                continue;
            } else {
                merged.push(current);
                current = next;
            }
        }
        merged.push(current);
        return merged;
    }

    private isQuestion(text: string): boolean {
        const lower = text.toLowerCase();
        const patterns = [
            /^\d+[\.\)]/, /^[a-z][\.\)]/, /^[A-D][\.\)]/,
            /\bwhat\s+is\b/, /\bexplain\b/, /\bdescribe\b/,
            /\bcho[o]?se\s+the\b/, /\banswer\s+all\b/,
            /^\(\d+\)/
        ];
        return patterns.some(p => p.test(text)) || lower.includes('attempt any');
    }

    private isMetadata(text: string): boolean {
        const keywords = ['university', 'duration', 'time', 'marks', 'code', 'subject', 'program', 'branch', 'academic', 'a.y'];
        return keywords.some(k => text.toLowerCase().includes(k));
    }

    private getMetaKey(text: string): string | null {
        const t = text.toLowerCase();
        if (t.includes('university') || t.includes('malla reddy')) return 'UNIVERSITY_NAME';
        if (t.includes('time') || t.includes('duration')) return 'TIME';
        if (t.includes('marks')) return 'MAX_MARKS';
        if (t.includes('code')) return 'SUBJECT_CODE';
        if (t.includes('subject')) return 'SUBJECT_NAME';
        if (t.includes('branch') || t.includes('program')) return 'PROGRAM_BRANCH';
        if (t.includes('academic') || t.includes('a.y')) return 'ACADEMIC_YEAR';
        return null;
    }
}
