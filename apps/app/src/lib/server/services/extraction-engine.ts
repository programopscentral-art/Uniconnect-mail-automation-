import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createWorker } from 'tesseract.js';
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
}

export class ExtractionEngine {
    /**
     * Entry point for free extraction.
     */
    async analyze(buffer: Buffer, mimeType: string): Promise<ExtractionResult> {
        console.log('[EXTRACTION_ENGINE] 🚀 Starting free analysis...');

        const image = await Jimp.read(buffer);
        const width = image.bitmap.width;
        const height = image.bitmap.height;

        console.log(`[EXTRACTION_ENGINE] 📸 Image loaded: ${width}x${height}`);

        // 1. OCR using Tesseract (Pass image dimensions)
        const { textBlocks } = await this.performOCR(buffer, width, height);

        // 2. Line/Structural Analysis
        const structuralElements = await this.detectStructure(image);

        const A4_WIDTH_MM = 210;
        const A4_HEIGHT_MM = 297;

        // 3. Filtering logic for questions
        const filteredElements = textBlocks.filter(block => {
            // Keep text in top 25% or if it doesn't look like a question
            const isTop = block.y < (A4_HEIGHT_MM * 0.25);
            const isQuestion = this.isQuestion(block.text);
            return isTop || !isQuestion;
        });

        // 4. Extract Meta Fields
        const metadata: Record<string, string> = {};
        filteredElements.forEach(el => {
            if (this.isMetadata(el.text)) {
                const key = this.getMetaKey(el.text);
                if (key) metadata[key] = "";
            }
        });

        return {
            page: { width: A4_WIDTH_MM, height: A4_HEIGHT_MM },
            pages: [
                {
                    id: 'page-1',
                    elements: [
                        ...filteredElements,
                        ...structuralElements,
                        // Add Logo Placeholder
                        {
                            id: 'logo-slot',
                            type: 'image-slot',
                            x: 10, y: 10,
                            width: 30, height: 30,
                            slotName: 'logo'
                        }
                    ]
                }
            ],
            metadata_fields: metadata
        };
    }

    private async performOCR(buffer: Buffer, imgWidth: number, imgHeight: number) {
        const A4_WIDTH_MM = 210;
        const A4_HEIGHT_MM = 297;

        const worker = await createWorker('eng');
        const { data } = await worker.recognize(buffer);

        const textBlocks = data.blocks?.map((block, i) => {
            const bbox = block.bbox;
            const text = block.text.trim();

            const mmX = (bbox.x0 / imgWidth) * A4_WIDTH_MM;
            const mmY = (bbox.y0 / imgHeight) * A4_HEIGHT_MM;
            const mmW = ((bbox.x1 - bbox.x0) / imgWidth) * A4_WIDTH_MM;
            const mmH = ((bbox.y1 - bbox.y0) / imgHeight) * A4_HEIGHT_MM;

            return {
                id: `text-${i}`,
                type: 'text',
                x: Number(mmX.toFixed(2)),
                y: Number(mmY.toFixed(2)),
                width: Number(mmW.toFixed(2)),
                height: Number(mmH.toFixed(2)),
                text,
                content: text,
                style: {
                    fontSize: 10,
                    textAlign: mmX > (A4_WIDTH_MM * 0.3) && mmX < (A4_WIDTH_MM * 0.6) ? 'center' : 'left'
                }
            };
        }) || [];

        await worker.terminate();
        return { textBlocks };
    }

    private async detectStructure(image: Jimp) {
        const A4_WIDTH_MM = 210;
        const A4_HEIGHT_MM = 297;
        const elements: any[] = [];
        const width = image.bitmap.width;
        const height = image.bitmap.height;

        // Simple Scanline Line Detection (Horizontal & Vertical)
        // This replaces the need for full OpenCV for basic template lines
        const horizontalLines = this.scanHorizontalLines(image);
        const verticalLines = this.scanVerticalLines(image);

        horizontalLines.forEach((line, i) => {
            const mmX = (line.x / width) * A4_WIDTH_MM;
            const mmY = (line.y / height) * A4_HEIGHT_MM;
            const mmW = (line.length / width) * A4_WIDTH_MM;

            elements.push({
                id: `line-h-${i}`,
                type: 'line',
                x: Number(mmX.toFixed(2)),
                y: Number(mmY.toFixed(2)),
                width: Number(mmW.toFixed(2)),
                height: 0.5,
                orientation: 'horizontal',
                strokeWidth: 1,
                x1: Number(mmX.toFixed(2)),
                y1: Number(mmY.toFixed(2)),
                x2: Number((mmX + mmW).toFixed(2)),
                y2: Number(mmY.toFixed(2))
            });
        });

        // Add an outer border
        elements.push({
            id: 'page-border',
            type: 'rect',
            x: 5, y: 5, width: 200, height: 287,
            strokeWidth: 1,
            backgroundColor: 'transparent',
            borderColor: '#e2e8f0'
        });

        return elements;
    }

    private scanHorizontalLines(image: Jimp) {
        const lines: { x: number; y: number; length: number }[] = [];
        const width = image.bitmap.width;
        const height = image.bitmap.height;
        const threshold = 180; // Dark pixels

        for (let y = 0; y < height; y += 5) { // Skip lines for speed
            let startX = -1;
            for (let x = 0; x < width; x++) {
                const color = Jimp.intToRGBA(image.getPixelColor(x, y));
                const brightness = (color.r + color.g + color.b) / 3;

                if (brightness < threshold) {
                    if (startX === -1) startX = x;
                } else {
                    if (startX !== -1) {
                        const length = x - startX;
                        if (length > width * 0.3) {
                            lines.push({ x: startX, y, length });
                        }
                        startX = -1;
                    }
                }
            }
        }
        return lines;
    }

    private scanVerticalLines(image: Jimp) {
        // Implementation similar to horizontal but column-based
        // For template reconstruction, horizontal lines are usually enough to start
        return [];
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
        const keywords = ['duration', 'time', 'marks', 'code', 'subject', 'program', 'branch'];
        return keywords.some(k => text.toLowerCase().includes(k));
    }

    private getMetaKey(text: string): string | null {
        const t = text.toLowerCase();
        if (t.includes('university')) return 'UNIVERSITY_NAME';
        if (t.includes('time') || t.includes('duration')) return 'TIME';
        if (t.includes('marks')) return 'MAX_MARKS';
        if (t.includes('code')) return 'SUBJECT_CODE';
        if (t.includes('subject')) return 'SUBJECT_NAME';
        return null;
    }
}
