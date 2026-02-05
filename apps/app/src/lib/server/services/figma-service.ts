import type { TemplateElement } from '$lib/types/template';
import { randomUUID } from 'node:crypto';

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

export interface FigmaImportResult {
    elements: TemplateElement[];
    backgroundImageUrl?: string;
}

export class FigmaService {
    private static FIGMA_API_BASE = 'https://api.figma.com/v1';

    static extractFileKey(url: string): string {
        try {
            if (!url.includes('figma.com')) return url;
            const designMatch = url.match(/\/design\/([a-zA-Z0-9]+)/);
            if (designMatch) return designMatch[1];
            const fileMatch = url.match(/\/file\/([a-zA-Z0-9]+)/);
            if (fileMatch) return fileMatch[1];
            return url;
        } catch (e) {
            return url;
        }
    }

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

    static async importFromFigma(fileKey: string, accessToken: string, frameId?: string): Promise<FigmaImportResult> {
        console.log(`[FIGMA_SERVICE] 🎨 Importing file: ${fileKey} (Frame: ${frameId || 'Default'})`);

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
        let backgroundImageUrl: string | undefined;

        if (frameId && data.nodes?.[frameId]) {
            const node = data.nodes[frameId].document;
            const bbox = node.absoluteBoundingBox;
            this.traverseNode(node, 1, elements);
            this.normalizeElements(elements, bbox);

            try {
                backgroundImageUrl = await this.fetchFrameImage(fileKey, accessToken, frameId);
            } catch (ie) {
                console.warn(`[FIGMA_SERVICE] ⚠️ Could not fetch background image:`, ie);
            }
        } else {
            const document = data.document;
            const pages = document.children.filter((c: any) => c.type === 'CANVAS');
            pages.forEach((pageNode: any, pageIdx: number) => {
                this.traverseNode(pageNode, pageIdx + 1, elements);
            });
            // V73: Even without frameId, we must normalize to SOMETHING if results are huge
            // This is a fallback to avoid elements being off-screen
            if (elements.length > 0) {
                const firstElement = elements[0];
                // Use a heuristic or assume first element's page start
            }
        }

        return { elements, backgroundImageUrl };
    }

    private static async fetchFrameImage(fileKey: string, accessToken: string, frameId: string): Promise<string> {
        const url = `${this.FIGMA_API_BASE}/images/${fileKey}?ids=${frameId}&format=png&scale=2`;
        const res = await fetch(url, {
            headers: { 'X-Figma-Token': accessToken }
        });

        if (!res.ok) return '';
        const data = await res.json();
        return data.images[frameId] || '';
    }

    private static traverseNode(node: FigmaNode, pageNum: number, elements: TemplateElement[]) {
        if (node.characters && node.characters.trim().length > 0 && node.absoluteBoundingBox) {
            const slotMatch = node.characters.match(/\{\{([^}]+)\}\}/);
            const isPlainHeader = !slotMatch && (
                node.characters.toUpperCase() === node.characters &&
                node.characters.length > 2
            );

            const slotId = slotMatch ? slotMatch[1].trim() : node.characters.trim().replace(/\s+/g, '_').toLowerCase().substring(0, 32);
            const bbox = node.absoluteBoundingBox;

            const element: TemplateElement = {
                id: randomUUID(),
                slot_id: slotId,
                type: this.mapSlotToType(slotId),
                page: pageNum,
                x: bbox.x,
                y: bbox.y,
                w: bbox.width,
                h: bbox.height,
                text: node.characters.trim(),
                content: node.characters.trim(),
                value: node.characters.trim(),
                placeholderContent: node.characters,
                is_header: !!(isPlainHeader || this.mapSlotToType(slotId) === 'header-field'),
                styles: {
                    fontFamily: node.style?.fontFamily || 'Outfit',
                    fontSize: node.style?.fontSize || 14,
                    fontWeight: String(node.style?.fontWeight || 400),
                    color: this.extractHexColor(node.fills),
                    textAlign: (node.style?.textAlignHorizontal?.toLowerCase() || 'left') as any
                }
            };
            elements.push(element);
        }

        if (node.children) {
            node.children.forEach(child => this.traverseNode(child, pageNum, elements));
        }
    }

    private static mapSlotToType(slotId: string): 'header-field' | 'table-cell' | 'text' {
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
            // V72: Convert directly to mm (A4: 210 x 297)
            const rx = (el.x - frameBBox.x) / frameBBox.width;
            const ry = (el.y - frameBBox.y) / frameBBox.height;
            const rw = el.w / frameBBox.width;
            const rh = el.h / frameBBox.height;

            el.x = Math.round(rx * 210 * 10) / 10;
            el.y = Math.round(ry * 297 * 10) / 10;
            el.w = Math.round(rw * 210 * 10) / 10;
            el.h = Math.round(rh * 297 * 10) / 10;
        });
    }
}
