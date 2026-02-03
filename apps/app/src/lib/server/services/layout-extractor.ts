import { ImageAnnotatorClient } from '@google-cloud/vision';
import { env } from '$env/dynamic/private';

export interface LayoutElement {
    id: string;
    type: 'text' | 'line' | 'rect' | 'image-slot';
    x: number; // Scale: mm (0..210)
    y: number; // Scale: mm (0..297)
    width: number; // Scale: mm
    height: number; // Scale: mm
    text?: string;
    content?: string; // Standardize for editor
    style?: any;
    slotName?: string;
    strokeWidth?: number;
    borderColor?: string;
    backgroundColor?: string;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
    thickness?: number; // Standardize for editor
    orientation?: 'horizontal' | 'vertical';
}

export interface TemplateBlueprint {
    page: {
        width: number;
        height: number;
    };
    elements: LayoutElement[];
    metadata_fields?: Record<string, string>;
}

export class LayoutExtractor {
    private client: ImageAnnotatorClient;

    constructor() {
        const credentialsJson = env.GOOGLE_CREDENTIALS_JSON;
        if (credentialsJson) {
            try {
                const credentials = JSON.parse(credentialsJson);
                this.client = new ImageAnnotatorClient({ credentials });
                console.log('✅ LayoutExtractor: Vision API initialized with credentials from ENV');
            } catch (e) {
                console.error('❌ LayoutExtractor: Failed to parse GOOGLE_CREDENTIALS_JSON');
                this.client = new ImageAnnotatorClient();
            }
        } else {
            this.client = new ImageAnnotatorClient();
            console.log('✅ LayoutExtractor: Vision API initialized with default credentials');
        }
    }

    async extract(buffer: Buffer, mimeType: string): Promise<TemplateBlueprint> {
        // For now, we assume buffer is an image. 
        // PDF rasterization would happen here if implemented.

        const [result] = await this.client.documentTextDetection({
            image: { content: buffer }
        });

        const fullTextAnnotation = result.fullTextAnnotation;
        if (!fullTextAnnotation) {
            throw new Error('No text or layout detected in the document.');
        }

        const firstPage = fullTextAnnotation.pages?.[0];
        if (!firstPage) throw new Error('Document has no pages.');

        const width = firstPage.width || 0;
        const height = firstPage.height || 0;

        const elements: LayoutElement[] = [];
        const metadataFields: Record<string, string> = {};

        const ELEMENTS_WIDTH = 210; // A4 mm
        const ELEMENTS_HEIGHT = 297; // A4 mm

        // 1. Process Blocks
        firstPage.blocks?.forEach((block, blockIdx) => {
            const box = block.boundingBox;
            if (!box || !box.vertices) return;

            const vertices = box.vertices as any[];
            const pxX = Math.min(...vertices.map(v => v.x || 0));
            const pxY = Math.min(...vertices.map(v => v.y || 0));
            const pxW = Math.max(...vertices.map(v => v.x || 0)) - pxX;
            const pxH = Math.max(...vertices.map(v => v.y || 0)) - pxY;

            // Scale to mm
            const x = (pxX / width) * ELEMENTS_WIDTH;
            const y = (pxY / height) * ELEMENTS_HEIGHT;
            const w = (pxW / width) * ELEMENTS_WIDTH;
            const h = (pxH / height) * ELEMENTS_HEIGHT;

            // Concatenate text
            let blockText = '';
            block.paragraphs?.forEach(para => {
                para.words?.forEach(word => {
                    word.symbols?.forEach(symbol => {
                        blockText += symbol.text || '';
                    });
                    blockText += ' ';
                });
                blockText += '\n';
            });
            blockText = blockText.trim();

            if (!blockText) return;

            // 2. Exclusion Logic (Questions)
            // Be very careful - only filter out clear question bodies
            if (this.isQuestion(blockText)) {
                return;
            }

            // 3. Classification
            const isHeader = this.isHeader(blockText, y / ELEMENTS_HEIGHT);
            const isMeta = this.isMetadata(blockText);

            elements.push({
                id: `text-${blockIdx}-${Math.random().toString(36).slice(2, 7)}`,
                type: 'text',
                x, y, width: w, height: h,
                text: blockText,
                content: blockText,
                style: {
                    fontSize: isHeader ? 14 : 10,
                    fontWeight: isHeader ? 'bold' : 'normal',
                    textAlign: isHeader ? 'center' : 'left'
                }
            });

            if (isMeta) {
                const key = this.getMetaKey(blockText);
                if (key) metadataFields[key] = "";
            }
        });

        // 4. Line Detection (Heuristic from block alignment)
        this.detectLines(firstPage, ELEMENTS_WIDTH, ELEMENTS_HEIGHT, elements);

        // 5. Add Logo Placeholder (Center top)
        elements.push({
            id: 'logo-slot',
            type: 'image-slot',
            x: 90, y: 10, width: 30, height: 30,
            slotName: 'logo'
        });

        return {
            page: { width: ELEMENTS_WIDTH, height: ELEMENTS_HEIGHT },
            elements: elements.map(el => ({
                ...el,
                x: Number(el.x.toFixed(2)),
                y: Number(el.y.toFixed(2)),
                width: Number((el.width || 0).toFixed(2)),
                height: Number((el.height || 0).toFixed(2)),
                x1: el.x1 !== undefined ? Number(el.x1.toFixed(2)) : undefined,
                y1: el.y1 !== undefined ? Number(el.y1.toFixed(2)) : undefined,
                x2: el.x2 !== undefined ? Number(el.x2.toFixed(2)) : undefined,
                y2: el.y2 !== undefined ? Number(el.y2.toFixed(2)) : undefined
            })),
            metadata_fields: metadataFields
        };
    }

    private isQuestion(text: string): boolean {
        const lower = text.toLowerCase();
        const patterns = [
            /^\d+[\.\)]/, /^[a-z][\.\)]/, /^[A-D][\.\)]/,
            /\bwhat\s+is\b/, /\bexplain\b/, /\bdescribe\b/,
            /\bcho[o]?se\s+the\b/, /\banswer\s+all\b/,
            /^\(\d+\)/ // Pattern for (1), (2) etc
        ];
        return patterns.some(p => p.test(text)) || lower.includes('attempt any');
    }

    private isHeader(text: string, y: number): boolean {
        const isTop = y < 0.15;
        const keywords = ['university', 'college', 'institute', 'test', 'examination', 'question paper'];
        const hasKeyword = keywords.some(k => text.toLowerCase().includes(k));
        return (isTop && text.length > 5) || hasKeyword || text === text.toUpperCase();
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

    private detectLines(page: any, width: number, height: number, elements: LayoutElement[]) {
        // Reconstruct lines from repeated aligned bounding boxes (table-like rectangles)
        // Since we can't run full OpenCV easily, we look for blocks that are very wide and short (separators)
        // Or we infer dividers if text blocks have consistent gutters.

        // Horizontal separators often exist as metadata row boundaries
        // We'll create some decorative lines based on metadata positions
        const metaBlocks = elements.filter(el => el.type === 'text' && this.isMetadata(el.text || ''));
        if (metaBlocks.length > 1) {
            const minY = Math.min(...metaBlocks.map(b => b.y));
            const maxY = Math.max(...metaBlocks.map(b => b.y + b.height));

            // Add a line below the last meta block
            elements.push({
                id: `line-h-meta`,
                type: 'line',
                x: 0.1, y: maxY + 0.01, width: 0.8, height: 0.001,
                orientation: 'horizontal',
                strokeWidth: 1,
                x1: 0.1, y1: maxY + 0.01, x2: 0.9, y2: maxY + 0.01
            });
        }
    }
}
