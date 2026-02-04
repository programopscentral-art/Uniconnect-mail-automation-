import { loadImage, createCanvas, type Image } from '@napi-rs/canvas';

export interface CellBoundingBox {
    row: number;
    col: number;
    x: number;  // normalized [0..1]
    y: number;  // normalized [0..1]
    w: number;  // normalized [0..1]
    h: number;  // normalized [0..1]
}

export interface TableDetectionResult {
    cells: CellBoundingBox[];
    rows: number;
    cols: number;
    confidence: number;
}

/**
 * V49/V55: Detect table structure using @napi-rs/canvas (no native deps)
 * Falls back to heuristic-based detection if line detection fails
 */
export class TableDetector {
    /**
     * Main entry point for table detection
     */
    async detectTableStructure(imageBuffer: Buffer, pageWidth: number, pageHeight: number): Promise<TableDetectionResult> {
        try {
            const image = await loadImage(imageBuffer);

            // Try line-based detection first
            const lineResult = await this.detectViaLines(image, pageWidth, pageHeight);
            if (lineResult.confidence > 0.7) {
                return lineResult;
            }

            // Fallback to heuristic detection
            return await this.detectViaHeuristics(image, pageWidth, pageHeight);
        } catch (error) {
            console.error('[TableDetector] Detection failed:', error);
            return { cells: [], rows: 0, cols: 0, confidence: 0 };
        }
    }

    /**
     * Detect table structure by finding horizontal and vertical lines
     */
    private async detectViaLines(image: Image, pageWidth: number, pageHeight: number): Promise<TableDetectionResult> {
        const width = image.width;
        const height = image.height;

        // Create canvas and get pixel data
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        const imageData = ctx.getImageData(0, 0, width, height);
        const pixels = imageData.data;

        // Detect horizontal lines
        const horizontalLines = this.detectHorizontalLines(pixels, width, height);

        // Detect vertical lines
        const verticalLines = this.detectVerticalLines(pixels, width, height);

        if (horizontalLines.length < 2 || verticalLines.length < 2) {
            return { cells: [], rows: 0, cols: 0, confidence: 0 };
        }

        // Compute grid intersections
        const cells: CellBoundingBox[] = [];

        for (let r = 0; r < horizontalLines.length - 1; r++) {
            for (let c = 0; c < verticalLines.length - 1; c++) {
                const x1 = verticalLines[c];
                const y1 = horizontalLines[r];
                const x2 = verticalLines[c + 1];
                const y2 = horizontalLines[r + 1];

                cells.push({
                    row: r,
                    col: c,
                    x: x1 / width,
                    y: y1 / height,
                    w: (x2 - x1) / width,
                    h: (y2 - y1) / height
                });
            }
        }

        return {
            cells,
            rows: horizontalLines.length - 1,
            cols: verticalLines.length - 1,
            confidence: 0.9
        };
    }

    /**
     * Detect horizontal lines in the image
     */
    private detectHorizontalLines(pixels: Uint8ClampedArray, width: number, height: number): number[] {
        const lines: number[] = [];

        // Scan each row for continuous dark pixels
        for (let y = 0; y < height; y++) {
            let darkPixels = 0;
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const r = pixels[idx];
                const g = pixels[idx + 1];
                const b = pixels[idx + 2];
                const brightness = (r + g + b) / 3;
                if (brightness < 100) darkPixels++;
            }

            // If more than 70% of pixels are dark, it's likely a line
            if (darkPixels / width > 0.7) {
                // Avoid duplicates (merge adjacent line rows)
                if (lines.length === 0 || y - lines[lines.length - 1] > 3) {
                    lines.push(y);
                }
            }
        }

        return lines;
    }

    /**
     * Detect vertical lines in the image
     */
    private detectVerticalLines(pixels: Uint8ClampedArray, width: number, height: number): number[] {
        const lines: number[] = [];

        // Scan each column for continuous dark pixels
        for (let x = 0; x < width; x++) {
            let darkPixels = 0;
            for (let y = 0; y < height; y++) {
                const idx = (y * width + x) * 4;
                const r = pixels[idx];
                const g = pixels[idx + 1];
                const b = pixels[idx + 2];
                const brightness = (r + g + b) / 3;
                if (brightness < 100) darkPixels++;
            }

            // If more than 70% of pixels are dark, it's likely a line
            if (darkPixels / height > 0.7) {
                // Avoid duplicates (merge adjacent line columns)
                if (lines.length === 0 || x - lines[lines.length - 1] > 3) {
                    lines.push(x);
                }
            }
        }

        return lines;
    }

    /**
     * Fallback: Detect table structure using heuristic grid estimation
     */
    private async detectViaHeuristics(image: Image, pageWidth: number, pageHeight: number): Promise<TableDetectionResult> {
        // Assume a standard MCQ table structure
        // Typically: 5-6 columns (Q#, Question, Marks, CO, Bloom, etc.)
        // Rows vary, but usually 10-20 questions

        const estimatedCols = 5;
        const estimatedRows = 15;

        const cells: CellBoundingBox[] = [];
        const cellWidth = 1 / estimatedCols;
        const cellHeight = 0.6 / estimatedRows; // Use 60% of page for table
        const tableStartY = 0.2; // Start after header (20%)

        for (let r = 0; r < estimatedRows; r++) {
            for (let c = 0; c < estimatedCols; c++) {
                cells.push({
                    row: r,
                    col: c,
                    x: c * cellWidth,
                    y: tableStartY + r * cellHeight,
                    w: cellWidth,
                    h: cellHeight
                });
            }
        }

        return {
            cells,
            rows: estimatedRows,
            cols: estimatedCols,
            confidence: 0.5
        };
    }
}
