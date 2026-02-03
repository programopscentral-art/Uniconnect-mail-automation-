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
    debugImage?: string;
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

        // 1. OCR using Tesseract (Pass Jimp Image for color/sampling)
        const { textBlocks } = await this.performOCR(buffer, image);

        // 2. Line/Structural Analysis
        const structuralElements = await this.detectStructure(image);

        const A4_WIDTH_MM = 210;
        const A4_HEIGHT_MM = 297;

        // 3. Identification & Filtering
        const finalElements = textBlocks.map(block => {
            const isQuestion = this.isQuestion(block.text);
            const isTop = block.y < 0.3; // Normalized [0..1] header zone

            // Heuristic for headers: Text in top 30% that isn't a question
            const isHeader = isTop && !isQuestion;

            return {
                ...block,
                is_header: isHeader,
                is_question: isQuestion,
                thickness: 1, // Default for text
                content: block.text
            };
        }).filter(el => el.is_header || !el.is_question);

        // 4. Extract Meta Fields & Values (STRICTER)
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
                        if (Math.abs(next.y - el.y) < 0.01) { // Normalized ~1% height (approx same line)
                            value = next.content;
                        }
                    }

                    if (value) metadata[key] = value;
                    else if (!metadata[key]) metadata[key] = "";
                }
            }
        });

        // 5. Generate Debug Image (for background alignment check)
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
                            const hasTopLeftText = finalElements.some(el => el.x < 0.2 && el.y < 0.15);
                            return {
                                id: 'logo-slot',
                                type: 'image-slot',
                                x: 0.06, y: 0.05,
                                width: 0.12, height: 0.12,
                                slotName: 'University Logo'
                            };
                        })()
                    ]
                }
            ],
            metadata_fields: metadata,
            debugImage
        };
    }

    private async performOCR(buffer: Buffer, image: Jimp) {
        const A4_WIDTH_MM = 210;
        const A4_HEIGHT_MM = 297;
        const imgWidth = image.bitmap.width;
        const imgHeight = image.bitmap.height;

        const worker = await createWorker('eng');
        const { data } = await worker.recognize(buffer);

        const rawBlocks = (data.blocks as any[])?.map((block, i) => {
            const bbox = block.bbox;
            const text = block.text.trim();
            if (!text) return null;

            // Normalize to [0..1]
            const normX = bbox.x0 / imgWidth;
            const normY = bbox.y0 / imgHeight;
            const normW = (bbox.x1 - bbox.x0) / imgWidth;
            const normH = (bbox.y1 - bbox.y0) / imgHeight;

            return {
                id: `raw-${i}`,
                x: normX,
                y: normY,
                width: normW,
                height: normH,
                text,
                confidence: block.confidence
            };
        }).filter(b => b !== null) || [];

        // Merge Fragmented Blocks with [0..1] logic
        const mergedBlocks = this.mergeTextBlocks(rawBlocks, image);

        const textBlocks = mergedBlocks.map((block, i) => {
            const { x: normX, y: normY, width: normW, height: normH, text } = block;

            // Fidelity: Bold detection (All caps or in header)
            const isHeaderArea = normY < 0.35;
            const isAllCaps = text === text.toUpperCase() && text.length > 5;
            const isBold = isAllCaps || isHeaderArea;

            // Alignment: Center Detection
            const isCentered = normX > 0.15 && (normX + normW) < 0.85;

            // Font Size approximation
            // scaleFactor: mapping height percentage to CSS font points/rem
            // 0.015 (1.5% of height) ~ 12px
            const baseScale = 800; // tuned factor
            let fontSize = Math.round(normH * baseScale);
            if (isHeaderArea && fontSize < 14) fontSize = 14;
            if (fontSize < 8) fontSize = 10;

            return {
                id: `text-${i}`,
                type: 'text',
                x: normX,
                y: normY,
                width: normW,
                height: normH,
                text,
                content: text,
                confidence: block.confidence,
                style: {
                    fontSize: fontSize,
                    textAlign: isCentered ? 'center' : (normX > 0.6 ? 'right' : 'left'),
                    fontWeight: isBold ? 'bold' : 'normal',
                    color: block.color || '#000000',
                    fontFamily: "'Inter', sans-serif"
                },
                is_header: isHeaderArea
            };
        });

        await worker.terminate();
        return { textBlocks };
    }

    private mergeTextBlocks(blocks: any[], image: Jimp) {
        if (blocks.length === 0) return [];
        const sorted = [...blocks].sort((a, b) => a.y - b.y || a.x - b.x);
        const merged: any[] = [];
        const imgW = image.bitmap.width;
        const imgH = image.bitmap.height;

        // Helper to get ink color with "Palette Mapping"
        const getInkColor = (b: any) => {
            const pxX = Math.floor(b.x * imgW);
            const pxY = Math.floor(b.y * imgH);

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

            // Palette Mapping: {black, darkgray, red, blue}
            if (bestRgb.r > 150 && bestRgb.g < 100 && bestRgb.b < 100) return '#dc2626'; // Red
            if (bestRgb.b > 150 && bestRgb.r < 100 && bestRgb.g < 100) return '#2563eb'; // Blue
            if (minSum > 450) return '#4b5563'; // Gray
            return '#000000'; // Black
        };

        let current = { ...sorted[0], color: getInkColor(sorted[0]) };
        for (let i = 1; i < sorted.length; i++) {
            const next = { ...sorted[i], color: getInkColor(sorted[i]) };

            const yDiff = Math.abs(next.y - current.y);
            const xGap = next.x - (current.x + current.width);

            // Overlap Resolution (>25% width overlap)
            const xOverlap = Math.max(0, Math.min(current.x + current.width, next.x + next.width) - Math.max(current.x, next.x));
            const overlapPercent = xOverlap / Math.min(current.width, next.width);

            const isHeaderArea = current.y < 0.35;
            const gapThreshold = isHeaderArea ? 0.02 : 0.05; // 2% vs 5% of width

            if ((yDiff < 0.005 && xGap < gapThreshold) || overlapPercent > 0.25) {
                current.text = (current.text + " " + next.text).replace(/\s+/g, ' ');
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
            const normY = h.y / height;
            const normX1 = h.x / width;
            const normX2 = (h.x + h.length) / width;

            elements.push({
                id: `line-h-${hi}`,
                type: 'line',
                x1: normX1,
                y1: normY,
                x2: normX2,
                y2: normY,
                strokeWidth: 1.5,
                color: '#000000',
                orientation: 'horizontal'
            });
        });

        verticalLines.forEach((v, vi) => {
            const normX = v.x / width;
            const normY1 = v.y / height;
            const normY2 = (v.y + v.length) / height;

            elements.push({
                id: `line-v-${vi}`,
                type: 'line',
                x1: normX,
                y1: normY1,
                x2: normX,
                y2: normY2,
                strokeWidth: 1.5,
                color: '#000000',
                orientation: 'vertical'
            });
        });

        // Add an outer border (Normalized)
        elements.push({
            id: 'page-border',
            type: 'rect',
            x: 0.02, y: 0.02, width: 0.96, height: 0.96,
            strokeWidth: 1,
            backgroundColor: 'transparent',
            borderColor: '#000000'
        });

        return elements;
    }

    private scanHorizontalLines(image: Jimp) {
        const lines: { x: number; y: number; length: number }[] = [];
        const width = image.bitmap.width;
        const height = image.bitmap.height;
        const threshold = 160; // Slightly more sensitive

        for (let y = 0; y < height; y += 1) { // No skipping
            let startX = -1;
            for (let x = 0; x < width; x++) {
                const color = Jimp.intToRGBA(image.getPixelColor(x, y));
                const brightness = (color.r + color.g + color.b) / 3;

                if (brightness < threshold) {
                    if (startX === -1) startX = x;
                } else {
                    if (startX !== -1) {
                        const length = x - startX;
                        // Keep even short lines (for table cells/small fields)
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

        // Merge contiguous lines on different Y if they are very close
        return this.mergeLines(lines, 'h');
    }

    private scanVerticalLines(image: Jimp) {
        const lines: { x: number; y: number; length: number }[] = [];
        const width = image.bitmap.width;
        const height = image.bitmap.height;
        const threshold = 160;

        for (let x = 0; x < width; x += 1) { // No skipping
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
                // If they overlap significantly, merge
                continue; // Skip nearby redundant lines
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
