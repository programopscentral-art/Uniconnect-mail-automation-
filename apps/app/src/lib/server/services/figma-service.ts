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
     * Parsing fileKey from Figma URL reliably 
     * Handles /file/{key}/... and /design/{key}/...
     */
    static extractFileKey(url: string): string {
        try {
            if (!url.includes('figma.com')) return url; // Might be just the key
            const designMatch = url.match(/\/design\/([a-zA-Z0-9]+)/);
            if (designMatch) return designMatch[1];
            const fileMatch = url.match(/\/file\/([a-zA-Z0-9]+)/);
            if (fileMatch) return fileMatch[1];
            return url;
        } catch (e) {
            return url;
        }
    }

    /**
     * Fetches basic file metadata (name, structure) without full traversal
     */
    static async getFileMeta(fileKey: string, accessToken: string) {
        const response = await fetch(`${this.FIGMA_API_BASE}/files/${fileKey}?depth=2`, {
            headers: { 'X-Figma-Token': accessToken }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Figma API Error (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        const pages = (data.document.children || [])
            .filter((c: any) => c.type === 'CANVAS')
            .map((p: any) => ({
                id: p.id,
                name: p.name,
                frames: (p.children || [])
                    .filter((c: any) => c.type === 'FRAME')
                    .map((f: any) => ({
                        id: f.id,
                        name: f.name
                    }))
            }));

        return {
            name: data.name,
            lastModified: data.lastModified,
            pages
        };
    }

    /**
     * Fetches a specific frame from a Figma file and converts it into TemplateElements.
     */
    static async importFromFigma(fileKey: string, accessToken: string, frameId?: string): Promise<TemplateElement[]> {
        console.log(`[FIGMA_SERVICE] 🎨 Importing file: ${fileKey} (Frame: ${frameId || 'Default'})`);

        // If we have a specific frameId, we can optimize by only requesting that node
        const url = frameId
            ? `${this.FIGMA_API_BASE}/files/${fileKey}/nodes?ids=${frameId}`
            : `${this.FIGMA_API_BASE}/files/${fileKey}`;

        const response = await fetch(url, {
            headers: { 'X-Figma-Token': accessToken }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Figma API Error (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        const elements: TemplateElement[] = [];

        if (frameId && data.nodes?.[frameId]) {
            const node = data.nodes[frameId].document;
            const bbox = node.absoluteBoundingBox;
            this.traverseNode(node, 1, elements);
            // Auto-normalize relative to the imported frame
            this.normalizeElements(elements, bbox);
        } else {
            const document = data.document;
            const pages = document.children.filter((c: any) => c.type === 'CANVAS');
            pages.forEach((pageNode: any, pageIdx: number) => {
                this.traverseNode(pageNode, pageIdx + 1, elements);
            });
        }

        return elements;
    }

    private static traverseNode(node: FigmaNode, pageNum: number, elements: TemplateElement[]) {
        if (node.type === 'TEXT' && node.characters) {
            const slotMatch = node.characters.match(/\{\{([^}]+)\}\}/);
            if (slotMatch) {
                const slotId = slotMatch[1].trim();
                const bbox = node.absoluteBoundingBox;

                const element: TemplateElement = {
                    id: crypto.randomUUID(),
                    slot_id: slotId,
                    type: this.mapSlotToType(slotId),
                    page: pageNum,
                    x: bbox.x,
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
        const id = slotId.toUpperCase();
        if (id.includes('TITLE') || id.includes('NAME') || id.includes('SUBJECT')) return 'header-field';
        if (id.includes('TEXT') || id.includes('QUESTION')) return 'text';
        if (id.includes('MARKS') || id.includes('CO') || id.includes('BLOOM')) return 'table-cell';
        return 'text';
    }

    private static extractHexColor(fills?: any[]): string {
        if (!fills || fills.length === 0) return '#000000';
        const fill = fills.find(f => f.type === 'SOLID' && f.visible !== false);
        if (!fill || !fill.color) return '#000000';

        const r = Math.round(fill.color.r * 255).toString(16).padStart(2, '0');
        const g = Math.round(fill.color.g * 255).toString(16).padStart(2, '0');
        const b = Math.round(fill.color.b * 255).toString(16).padStart(2, '0');

        return `#${r}${g}${b}`;
    }

    static normalizeElements(elements: TemplateElement[], frameBBox: { x: number; y: number; width: number; height: number }) {
        elements.forEach(el => {
            el.x = (el.x - frameBBox.x) / frameBBox.width;
            el.y = (el.y - frameBBox.y) / frameBBox.height;
            el.w = el.w / frameBBox.width;
            el.h = el.h / frameBBox.height;
        });
    }
}
