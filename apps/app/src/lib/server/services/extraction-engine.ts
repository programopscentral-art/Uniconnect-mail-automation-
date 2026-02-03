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

        // 1. OCR using Tesseract (Pass image dimensions)
        const { textBlocks } = await this.performOCR(buffer, width, height);

        // 2. Line/Structural Analysis
        const structuralElements = await this.detectStructure(image);

        const A4_WIDTH_MM = 210;
        const A4_HEIGHT_MM = 297;

        // 3. Identification & Filtering
        const finalElements = textBlocks.map(block => {
            const isQuestion = this.isQuestion(block.text);
            const isTop = block.y < (A4_HEIGHT_MM * 0.3); // Increased header zone

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
                        if (Math.abs(next.y - el.y) < 5) { // Same line
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
            metadata_fields: metadata,
            debugImage
        };
    }

    private async performOCR(buffer: Buffer, imgWidth: number, imgHeight: number) {
        const A4_WIDTH_MM = 210;
        const A4_HEIGHT_MM = 297;

        const worker = await createWorker('eng');
        const { data } = await worker.recognize(buffer);

        const rawBlocks = (data.blocks as any[])?.map((block, i) => {
            const bbox = block.bbox;
            const text = block.text.trim();
            if (!text) return null;

            const mmX = (bbox.x0 / imgWidth) * A4_WIDTH_MM;
            const mmY = (bbox.y0 / imgHeight) * A4_HEIGHT_MM;
            const mmW = ((bbox.x1 - bbox.x0) / imgWidth) * A4_WIDTH_MM;
            const mmH = ((bbox.y1 - bbox.y0) / imgHeight) * A4_HEIGHT_MM;

            return {
                id: `raw-${i}`,
                x: mmX,
                y: mmY,
                width: mmW,
                height: mmH,
                text,
                confidence: block.confidence
            };
        }).filter(b => b !== null) || [];

        // Merge Fragmented Blocks
        const mergedBlocks = this.mergeTextBlocks(rawBlocks, image);

        const textBlocks = mergedBlocks.map((block, i) => {
            const { x: mmX, y: mmY, width: mmW, height: mmH, text } = block;
            const isHeaderArea = mmY < (A4_HEIGHT_MM * 0.3);
            const isCentered = mmX > (A4_WIDTH_MM * 0.2) && (mmX + mmW) < (A4_WIDTH_MM * 0.8);
            const isBold = text === text.toUpperCase() && text.length > 5;

            return {
                id: `text-${i}`,
                type: 'text',
                x: Number(mmX.toFixed(2)),
                y: Number(mmY.toFixed(2)),
                width: Number(mmW.toFixed(2)),
                height: Number(mmH.toFixed(2)),
                text,
                content: text,
                confidence: block.confidence,
                style: {
                    fontSize: isHeaderArea ? (mmH > 4 ? 14 : 11) : (mmH > 4 ? 12 : (mmH > 3 ? 10 : 8)),
                    textAlign: isCentered ? 'center' : (mmX > (A4_WIDTH_MM * 0.6) ? 'right' : 'left'),
                    fontWeight: isBold || isHeaderArea ? 'bold' : 'normal',
                    color: block.color || '#000000'
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

        // Helper to get ink color (pick darkest pixel in a 3x3 grid around center to avoid white)
        const getInkColor = (b: any) => {
            const pxX = Math.floor((b.x / 210) * imgW);
            const pxY = Math.floor((b.y / 297) * imgH);

            // Sample a small area and pick the lowest sum (darkest)
            let minSum = 765; // 255*3
            let bestHex = "#000000";

            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const xx = Math.min(imgW - 1, Math.max(0, pxX + dx));
                    const yy = Math.min(imgH - 1, Math.max(0, pxY + dy));
                    const rgba = Jimp.intToRGBA(image.getPixelColor(xx, yy));
                    const sum = rgba.r + rgba.g + rgba.b;
                    if (sum < minSum) {
                        minSum = sum;
                        bestHex = `#${rgba.r.toString(16).padStart(2, '0')}${rgba.g.toString(16).padStart(2, '0')}${rgba.b.toString(16).padStart(2, '0')}`;
                    }
                }
            }
            return bestHex;
        };

        let current = { ...sorted[0], color: getInkColor(sorted[0]) };
        for (let i = 1; i < sorted.length; i++) {
            const next = { ...sorted[i], color: getInkColor(sorted[i]) };

            const yDiff = Math.abs(next.y - current.y);
            const xGap = next.x - (current.x + current.width);

            const isHeaderArea = current.y < (297 * 0.35);
            // Stricter merging for header to keep them crisp and exactly spaced
            const gapThreshold = isHeaderArea ? 4 : 10;

            if (yDiff < 1.2 && xGap < gapThreshold) {
                current.text = (current.text + " " + next.text).replace(/\s+/g, ' ');
                current.width = (next.x + next.width) - current.x;
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
        const A4_WIDTH_MM = 210;
        const A4_HEIGHT_MM = 297;
        const elements: any[] = [];
        const width = image.bitmap.width;
        const height = image.bitmap.height;

        const horizontalLines = this.scanHorizontalLines(image);
        const verticalLines = this.scanVerticalLines(image);

        // V4: Box Detection (Simplified)
        // Find intersecting lines to form rectangles
        const boxes: any[] = [];

        horizontalLines.forEach((h, hi) => {
            const mmY = (h.y / height) * A4_HEIGHT_MM;
            const mmX1 = (h.x / width) * A4_WIDTH_MM;
            const mmX2 = ((h.x + h.length) / width) * A4_WIDTH_MM;

            elements.push({
                id: `line-h-${hi}`,
                type: 'line',
                x1: Number(mmX1.toFixed(2)),
                y1: Number(mmY.toFixed(2)),
                x2: Number(mmX2.toFixed(2)),
                y2: Number(mmY.toFixed(2)),
                strokeWidth: 1,
                orientation: 'horizontal'
            });
        });

        verticalLines.forEach((v, vi) => {
            const mmX = (v.x / width) * A4_WIDTH_MM;
            const mmY1 = (v.y / height) * A4_HEIGHT_MM;
            const mmY2 = ((v.y + v.length) / height) * A4_HEIGHT_MM;

            elements.push({
                id: `line-v-${vi}`,
                type: 'line',
                x1: Number(mmX.toFixed(2)),
                y1: Number(mmY1.toFixed(2)),
                x2: Number(mmX.toFixed(2)),
                y2: Number(mmY2.toFixed(2)),
                strokeWidth: 1,
                orientation: 'vertical'
            });
        });

        // Add an outer border (Matches user preference for "boxes same as image")
        elements.push({
            id: 'page-border',
            type: 'rect',
            x: 5, y: 5, width: 200, height: 287,
            strokeWidth: 1,
            backgroundColor: 'transparent',
            borderColor: '#64748b'
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
