import { TableDetector, type CellBoundingBox } from './table-detector';
import Tesseract from 'tesseract.js';
import { createCanvas, loadImage, type Image } from '@napi-rs/canvas';

export interface TemplateElement {
    id: string;
    type: 'text' | 'table-cell' | 'header-field';
    page: number;
    x: number;  // normalized [0..1]
    y: number;  // normalized [0..1]
    w: number;  // normalized [0..1]
    h: number;  // normalized [0..1]
    text: string;
    style: {
        fontSize: number;
        fontWeight: string;
        align: string;
        color: string;
    };
    role: string;
    row?: number;
    col?: number;
}

/**
 * V49/V53: Enhanced extraction engine using @napi-rs/canvas (no native deps)
 * Generates granular, editable elements instead of page-level OCR blocks
 */
export class GranularExtractionEngine {
    private tableDetector: TableDetector;

    constructor() {
        this.tableDetector = new TableDetector();
    }

    /**
     * Main entry point: analyze document and generate granular elements
     */
    async analyzeDocument(imageBuffer: Buffer, pageWidth: number, pageHeight: number): Promise<{
        elements: TemplateElement[];
        backgroundImage: string;
        metadata: Record<string, any>;
    }> {
        const image = await loadImage(imageBuffer);
        const width = image.width;
        const height = image.height;

        // Convert image to base64 for background
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        const backgroundImage = canvas.toDataURL('image/png');

        // Detect table structure
        const tableResult = await this.tableDetector.detectTableStructure(imageBuffer, pageWidth, pageHeight);

        const elements: TemplateElement[] = [];

        // Generate header field elements (top 15% of page)
        const headerElements = await this.generateHeaderElements(image, width, height);
        elements.push(...headerElements);

        // Generate table cell elements
        if (tableResult.cells.length > 0) {
            const tableCellElements = await this.generateTableCellElements(
                image,
                tableResult.cells,
                width,
                height
            );
            elements.push(...tableCellElements);
        }

        return {
            elements,
            backgroundImage,
            metadata: {
                tableDetected: tableResult.cells.length > 0,
                tableRows: tableResult.rows,
                tableCols: tableResult.cols,
                confidence: tableResult.confidence
            }
        };
    }

    /**
     * Generate header field elements from top portion of page
     */
    private async generateHeaderElements(image: Image, width: number, height: number): Promise<TemplateElement[]> {
        const elements: TemplateElement[] = [];

        // Define common header field regions
        const headerFields = [
            { role: 'HEADER_UNIVERSITY_NAME', x: 0.1, y: 0.02, w: 0.8, h: 0.04 },
            { role: 'FIELD_PROGRAM', x: 0.1, y: 0.07, w: 0.3, h: 0.03 },
            { role: 'FIELD_BRANCH', x: 0.5, y: 0.07, w: 0.3, h: 0.03 },
            { role: 'FIELD_DATE', x: 0.1, y: 0.11, w: 0.2, h: 0.03 },
            { role: 'FIELD_MAX_MARKS', x: 0.4, y: 0.11, w: 0.15, h: 0.03 },
            { role: 'FIELD_DURATION', x: 0.6, y: 0.11, w: 0.15, h: 0.03 },
        ];

        for (const field of headerFields) {
            const x1 = Math.floor(field.x * width);
            const y1 = Math.floor(field.y * height);
            const x2 = Math.floor((field.x + field.w) * width);
            const y2 = Math.floor((field.y + field.h) * height);

            // Extract region as canvas and convert to buffer
            const regionCanvas = createCanvas(x2 - x1, y2 - y1);
            const ctx = regionCanvas.getContext('2d');
            ctx.drawImage(image, -x1, -y1);
            const regionBuffer = regionCanvas.toBuffer('image/png');

            const text = await this.extractTextFromRegion(regionBuffer);

            elements.push({
                id: `header-${field.role}-${Date.now()}`,
                type: 'header-field',
                page: 0,
                x: field.x,
                y: field.y,
                w: field.w,
                h: field.h,
                text: text.trim(),
                style: {
                    fontSize: 12,
                    fontWeight: 'normal',
                    align: 'left',
                    color: '#000000'
                },
                role: field.role
            });
        }

        return elements;
    }

    /**
     * Generate table cell elements from detected cells
     */
    private async generateTableCellElements(
        image: Image,
        cells: CellBoundingBox[],
        width: number,
        height: number
    ): Promise<TemplateElement[]> {
        const elements: TemplateElement[] = [];

        for (const cell of cells) {
            const x1 = Math.floor(cell.x * width);
            const y1 = Math.floor(cell.y * height);
            const x2 = Math.floor((cell.x + cell.w) * width);
            const y2 = Math.floor((cell.y + cell.h) * height);

            // Skip cells that are too small
            if (x2 - x1 < 10 || y2 - y1 < 10) continue;

            // Extract region as canvas and convert to buffer
            const regionCanvas = createCanvas(x2 - x1, y2 - y1);
            const ctx = regionCanvas.getContext('2d');
            ctx.drawImage(image, -x1, -y1);
            const regionBuffer = regionCanvas.toBuffer('image/png');

            const text = await this.extractTextFromRegion(regionBuffer);

            // Assign role based on column position
            const role = this.assignTableCellRole(cell.row, cell.col);

            elements.push({
                id: `cell-${cell.row}-${cell.col}-${Date.now()}`,
                type: 'table-cell',
                page: 0,
                x: cell.x,
                y: cell.y,
                w: cell.w,
                h: cell.h,
                text: text.trim(),
                style: {
                    fontSize: 10,
                    fontWeight: 'normal',
                    align: cell.col === 0 ? 'center' : 'left',
                    color: '#000000'
                },
                role,
                row: cell.row,
                col: cell.col
            });
        }

        return elements;
    }

    /**
     * Assign role to table cell based on row/column position
     */
    private assignTableCellRole(row: number, col: number): string {
        // First row is typically headers
        if (row === 0) {
            const headerRoles = ['HEADER_Q_NO', 'HEADER_QUESTION', 'HEADER_MARKS', 'HEADER_CO', 'HEADER_BLOOM'];
            return headerRoles[col] || `HEADER_COL_${col}`;
        }

        // Data rows
        const columnRoles = ['TABLE_Q_NUMBER', 'TABLE_Q_TEXT', 'TABLE_MARKS', 'TABLE_CO', 'TABLE_BLOOM'];
        return columnRoles[col] || `TABLE_COL_${col}`;
    }

    /**
     * Extract text from image region using Tesseract
     */
    private async extractTextFromRegion(regionBuffer: Buffer): Promise<string> {
        try {
            const result = await Tesseract.recognize(regionBuffer, 'eng', {
                logger: () => { } // Suppress logs
            });
            return result.data.text || '';
        } catch (error) {
            console.error('[GranularExtraction] OCR failed for region:', error);
            return '';
        }
    }
}
