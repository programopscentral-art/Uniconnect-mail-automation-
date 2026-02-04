import type { TemplateElement } from '$lib/types/template';

interface FigmaNode {
    id: string;
    name: string;
    type: string;
    absoluteBoundingBox: { x: number; y: number; width: number; height: number };
    characters?: string;
    style?: {
        fontFamily: string;
        fontSize: number;
        fontWeight: number;
        textAlignHorizontal: 'LEFT' | 'CENTER' | 'RIGHT';
    };
    children?: FigmaNode[];
    fills?: any[];
}

export class FigmaService {
    private static FIGMA_API_BASE = 'https://api.figma.com/v1';

    /**
     * Fetches a Figma file and converts it into a structured TemplateElement array.
     */
    static async importFromFigma(fileKey: string, accessToken: string): Promise<TemplateElement[]> {
        console.log(`[FIGMA_SERVICE] 🎨 Importing file: ${fileKey}`);

        const response = await fetch(`${this.FIGMA_API_BASE}/files/${fileKey}`, {
            headers: { 'X-Figma-Token': accessToken }
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Figma API Error (${response.status}): ${error}`);
        }

        const data = await response.json();
        const document = data.document;
        const elements: TemplateElement[] = [];

        // Figma documents have Pages (CANVAS nodes) as immediate children
        const pages = document.children.filter((c: any) => c.type === 'CANVAS');

        pages.forEach((pageNode: any, pageIdx: number) => {
            console.log(`[FIGMA_SERVICE] 📄 Processing Page: ${pageNode.name}`);
            this.traverseNode(pageNode, pageIdx + 1, elements);
        });

        console.log(`[FIGMA_SERVICE] ✅ Import complete: ${elements.length} elements found`);
        return elements;
    }

    private static traverseNode(node: FigmaNode, pageNum: number, elements: TemplateElement[]) {
        // We are primarily interested in Text layers with slot placeholders {{...}}
        if (node.type === 'TEXT' && node.characters) {
            const slotMatch = node.characters.match(/\{\{([^}]+)\}\}/);

            if (slotMatch) {
                const slotId = slotMatch[1].trim();
                const bbox = node.absoluteBoundingBox;

                // Normalize coordinates (assuming A4 for now, will refine)
                // In a real implementation, we'd use the parent frame's geometry for normalization
                // For now, let's keep it relative to the page or top-level frame

                const element: TemplateElement = {
                    id: crypto.randomUUID(),
                    slot_id: slotId,
                    type: this.mapSlotToType(slotId),
                    page: pageNum,
                    x: bbox.x, // These will be normalized in the next pass
                    y: bbox.y,
                    w: bbox.width,
                    h: bbox.height,
                    text: node.characters,
                    placeholderContent: node.characters,
                    style: {
                        fontFamily: node.style?.fontFamily || 'Inter',
                        fontSize: node.style?.fontSize || 12,
                        fontWeight: String(node.style?.fontWeight || 400),
                        color: this.extractHexColor(node.fills),
                        align: (node.style?.textAlignHorizontal?.toLowerCase() || 'left') as any
                    }
                };

                elements.push(element);
            }
        }

        if (node.children) {
            node.children.forEach(child => this.traverseNode(child, pageNum, elements));
        }
    }

    private static mapSlotToType(slotId: string): any {
        if (slotId.includes('TITLE') || slotId.includes('NAME')) return 'header-field';
        if (slotId.includes('TEXT')) return 'text';
        if (slotId.includes('MARKS') || slotId.includes('CO') || slotId.includes('BLOOM')) return 'table-cell';
        return 'text';
    }

    private static extractHexColor(fills?: any[]): string {
        if (!fills || fills.length === 0) return '#000000';
        const fill = fills[0];
        if (fill.type !== 'SOLID' || !fill.color) return '#000000';

        const r = Math.round(fill.color.r * 255).toString(16).padStart(2, '0');
        const g = Math.round(fill.color.g * 255).toString(16).padStart(2, '0');
        const b = Math.round(fill.color.b * 255).toString(16).padStart(2, '0');

        return `#${r}${g}${b}`;
    }

    /**
     * Normalizes absolute coordinates to [0..1] range based on a reference frame (usually the first Frame)
     */
    static normalizeElements(elements: TemplateElement[], frameBBox: { x: number; y: number; width: number; height: number }) {
        elements.forEach(el => {
            el.x = (el.x - frameBBox.x) / frameBBox.width;
            el.y = (el.y - frameBBox.y) / frameBBox.height;
            el.w = el.w / frameBBox.width;
            el.h = el.h / frameBBox.height;
        });
    }
}
