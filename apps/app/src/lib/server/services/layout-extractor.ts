import { ImageAnnotatorClient } from '@google-cloud/vision';
import { env } from '$env/dynamic/private';

export interface LayoutElement {
    id: string;
    type: 'text' | 'line' | 'rect' | 'image-slot';
    x: number; // Normalized 0..1
    y: number; // Normalized 0..1
    width: number; // Normalized 0..1
    height: number; // Normalized 0..1
    text?: string;
    style?: any;
    slotName?: string;
    strokeWidth?: number;
    borderColor?: string;
    backgroundColor?: string;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
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

        // 1. Process Blocks
        firstPage.blocks?.forEach((block, blockIdx) => {
            const box = block.boundingBox;
            if (!box || !box.vertices) return;

            const vertices = box.vertices as any[];
            const x = Math.min(...vertices.map(v => v.x || 0)) / width;
            const y = Math.min(...vertices.map(v => v.y || 0)) / height;
            const w = (Math.max(...vertices.map(v => v.x || 0)) - (x * width)) / width;
            const h = (Math.max(...vertices.map(v => v.y || 0)) - (y * height)) / height;

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
            if (this.isQuestion(blockText)) {
                return;
            }

            // 3. Classification
            const isHeader = this.isHeader(blockText, y);
            const isMeta = this.isMetadata(blockText);

            elements.push({
                id: `text-${blockIdx}-${Math.random().toString(36).slice(2, 7)}`,
                type: 'text',
                x, y, width: w, height: h,
                text: blockText,
                style: {
                    fontSize: isHeader ? 14 : 10,
                    fontWeight: isHeader ? 'bold' : 'normal',
                    align: isHeader ? 'center' : 'left'
                }
            });

            if (isMeta) {
                const key = this.getMetaKey(blockText);
                if (key) metadataFields[key] = "";
            }
        });

        // 4. Line Detection (Heuristic from block alignment)
        this.detectLines(firstPage, width, height, elements);

        // 5. Add Logo Placeholder
        elements.push({
            id: 'logo-slot',
            type: 'image-slot',
            x: 0.05, y: 0.03, width: 0.15, height: 0.1,
            slotName: 'logo'
        });

        return {
            page: { width, height },
            elements: elements.map(el => ({
                ...el,
                x: Number(el.x.toFixed(4)),
                y: Number(el.y.toFixed(4)),
                width: Number(el.width.toFixed(4)),
                height: Number(el.height.toFixed(4))
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
