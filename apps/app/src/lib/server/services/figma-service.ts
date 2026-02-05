import type { CanonicalTemplate, SlotDefinition, StaticElement } from '@uniconnect/shared';
import { randomUUID } from 'node:crypto';

export interface FigmaImportResult {
    template: CanonicalTemplate;
    backgroundImageUrl?: string;
    warnings?: string[];
}

export class FigmaService {
    private static FIGMA_API_BASE = 'https://api.figma.com/v1';

    static extractFileKey(url: string): string {
        try {
            if (!url.includes('figma.com')) return url.trim();
            // Refined regex to handle /design/key/title and /file/key/title accurately
            const match = url.match(/\/(?:design|file)\/([a-zA-Z0-9]+)(?:\/|[\?#]|$)/);
            if (match) return match[1];
            return url.trim();
        } catch (e) {
            return url.trim();
        }
    }

    static extractNodeId(url: string): string | null {
        try {
            const urlObj = new URL(url);
            const nodeId = urlObj.searchParams.get('node-id');
            // Figma URLs use '-' for ':', but the API generally prefers ':'
            return nodeId ? nodeId.replace('-', ':') : null;
        } catch (e) {
            return null;
        }
    }

    static async getFileMeta(fileKey: string, accessToken: string) {
        // V77: Use depth=1 to avoid 429 on large files. Fetch pages only.
        const response = await fetch(`${this.FIGMA_API_BASE}/files/${fileKey}?depth=1`, {
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
                frames: [] // Frames will be loaded lazily in the next step
            }));

        return {
            name: data.name,
            lastModified: data.lastModified,
            pages
        };
    }

    static async getNodeFrames(fileKey: string, accessToken: string, nodeId: string) {
        const response = await fetch(`${this.FIGMA_API_BASE}/files/${fileKey}/nodes?ids=${nodeId}&depth=1`, {
            headers: { 'X-Figma-Token': accessToken }
        });

        if (!response.ok) return [];
        const data = await response.json();
        const node = data.nodes?.[nodeId]?.document;
        if (!node || !node.children) return [];

        return node.children
            .filter((c: any) => c.type === 'FRAME')
            .map((f: any) => ({
                id: f.id,
                name: f.name
            }));
    }

    static async verifyQuick(fileKey: string, accessToken: string, nodeId: string) {
        // V78: Direct node fetch is much lighter than fetching the whole file.
        const response = await fetch(`${this.FIGMA_API_BASE}/files/${fileKey}/nodes?ids=${nodeId}`, {
            headers: { 'X-Figma-Token': accessToken }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Figma Node Error (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        const node = data.nodes?.[nodeId]?.document;
        if (!node) throw new Error('Target node (frame) not found in this file');

        return {
            fileName: data.name || 'Figma Design',
            nodeName: node.name
        };
    }

    static async importFromFigma(fileKey: string, accessToken: string, universityId: string, pageName?: string, frameId?: string, rawData?: any): Promise<FigmaImportResult> {
        console.log(`[V94_FIGMA] 🎨 Universal Import: ${fileKey} (Page: ${pageName || 'Any'}, Frame: ${frameId || 'Default'})`);

        // V82: Normalize frameId (ensure colon for API)
        const normalizedFrameId = frameId ? frameId.replace('-', ':').replace('%3A', ':') : frameId;

        let data = rawData;
        if (!data) {
            const url = `${this.FIGMA_API_BASE}/files/${fileKey}?access_token=${accessToken}`;
            const response = await fetch(url, { headers: { 'X-Figma-Token': accessToken } });
            if (response.ok) {
                data = await response.json();
            } else {
                throw new Error(`Figma API Error (${response.status})`);
            }
        }

        const staticElements: StaticElement[] = [];
        const slots: Record<string, SlotDefinition> = {};
        const warnings: string[] = [];
        let backgroundImageUrl: string | undefined;

        try {
            let node = null;
            let usedId = normalizedFrameId;

            // Spec Rule: Fetch only figma_page_name / Target specific page
            if (pageName && data.document) {
                const targetPage = data.document.children.find((c: any) =>
                    c.type === 'CANVAS' && (c.name === pageName || c.name.toLowerCase() === pageName.toLowerCase())
                );

                if (!targetPage) {
                    throw new Error(`Figma Page Not Found: "${pageName}"`);
                }

                // If frameId is provided, look within that page
                if (normalizedFrameId) {
                    const findFrame = (n: any): any => {
                        if (n.id === normalizedFrameId) return n;
                        if (n.children) {
                            for (const child of n.children) {
                                const found = findFrame(child);
                                if (found) return found;
                            }
                        }
                        return null;
                    };
                    node = findFrame(targetPage);
                } else {
                    // Default to first frame on page if none specified
                    node = targetPage.children.find((c: any) => c.type === 'FRAME');
                }
            } else if (normalizedFrameId && data.nodes) {
                node = data.nodes[normalizedFrameId]?.document;
            } else if (data.document) {
                // Fallback: First page, first frame
                const firstPage = data.document.children.find((c: any) => c.type === 'CANVAS');
                node = firstPage?.children.find((c: any) => c.type === 'FRAME');
            }

            if (node) {
                const frameBbox = node.absoluteBoundingBox || { x: 0, y: 0, width: 210 * 2.834, height: 297 * 2.834 };
                this.traverseNodeDeterministic(node, frameBbox, staticElements, slots, warnings);

                try {
                    backgroundImageUrl = await this.fetchFrameImage(fileKey, accessToken, usedId || node.id);
                } catch (ie) {
                    console.warn(`[FIGMA_SERVICE] ⚠️ Background fail:`, ie);
                }

                const template: CanonicalTemplate = {
                    templateId: randomUUID(),
                    blueprint_id: `bp_${universityId}_${Date.now()}`,
                    universityId,
                    template_type: 'exam_question_paper',
                    version: 1,
                    page: { widthMM: 210, heightMM: 297 },
                    staticElements,
                    slots,
                    constraints: {
                        max_questions_per_page: 10
                    },
                    metadata: { figmaFileKey: fileKey, figmaNodeId: usedId || node.id }
                };

                return { template, backgroundImageUrl, warnings };
            } else {
                throw new Error(`Target node not found`);
            }
        } catch (err: any) {
            console.error(`[FIGMA_SERVICE] 😱 CRASH:`, err.message);
            throw err;
        }
    }

    private static async fetchFrameImage(fileKey: string, accessToken: string, frameId: string): Promise<string> {
        // V84: Explicit encoding for node ID containing colons
        const encodedId = encodeURIComponent(frameId);
        const url = `${this.FIGMA_API_BASE}/images/${fileKey}?ids=${encodedId}&format=png&scale=2`;
        const res = await fetch(url, {
            headers: { 'X-Figma-Token': accessToken }
        });

        if (!res.ok) return '';
        const data = await res.json();
        return data.images?.[frameId] || '';
    }

    private static traverseNodeDeterministic(node: any, frameBbox: any, staticElements: StaticElement[], slots: Record<string, SlotDefinition>, warnings: string[]) {
        const bbox = node.absoluteBoundingBox;
        if (!bbox) return;

        const MM_PT = 2.83465;
        const xMM = (bbox.x - frameBbox.x) / MM_PT;
        const yMM = (bbox.y - frameBbox.y) / MM_PT;
        const wMM = bbox.width / MM_PT;
        const hMM = bbox.height / MM_PT;

        // V94: Semantic Slot Detection (Prefixes: Q_, M_, INST_, HDR_, FTR_)
        const name = node.name.trim();
        const upperName = name.toUpperCase();
        let slotType: 'QUESTION' | 'MARKS' | 'INSTRUCTIONS' | 'HEADER' | 'FOOTER' | null = null;

        if (upperName.startsWith('Q_')) slotType = 'QUESTION';
        else if (upperName.startsWith('M_')) slotType = 'MARKS';
        else if (upperName.startsWith('INST_')) slotType = 'INSTRUCTIONS';
        else if (upperName.startsWith('HDR_')) slotType = 'HEADER';
        else if (upperName.startsWith('FTR_')) slotType = 'FOOTER';
        else if (name.toLowerCase().startsWith('slot.')) {
            slotType = 'QUESTION';
            warnings.push(`Legacy prefix 'slot.' used for '${name}'. Use 'Q_', 'M_', etc.`);
        }

        if (slotType) {
            const slotId = slotType === 'QUESTION' && name.toLowerCase().startsWith('slot.')
                ? name.substring(5).trim()
                : name;

            slots[slotId] = {
                id: node.id,
                slot_type: slotType,
                xMM, yMM, widthMM: wMM, heightMM: hMM,
                style: {
                    fontFamily: node.style?.fontFamily || 'Inter',
                    fontSizeMM: (node.style?.fontSize || 12) / MM_PT,
                    fontWeight: node.style?.fontWeight || 400,
                    color: this.extractHexColor(node.fills),
                    align: (node.style?.textAlignHorizontal?.toLowerCase() || 'left') as any
                },
                overflow: 'clip',
                repeatable: slotType === 'QUESTION',
                isRequired: true
            };
        } else if (node.type === 'TEXT' && node.characters?.trim()) {
            staticElements.push({
                id: node.id,
                type: 'text',
                xMM, yMM, widthMM: wMM, heightMM: hMM,
                content: node.characters.trim(),
                style: {
                    fontFamily: node.style?.fontFamily || 'Inter',
                    fontSizeMM: (node.style?.fontSize || 12) / MM_PT,
                    fontWeight: node.style?.fontWeight || 400,
                    color: this.extractHexColor(node.fills),
                    align: (node.style?.textAlignHorizontal?.toLowerCase() || 'left') as any
                }
            });
        } else if (node.type === 'RECTANGLE' && node.fills?.length > 0) {
            staticElements.push({
                id: node.id,
                type: 'rect',
                xMM, yMM, widthMM: wMM, heightMM: hMM,
                backgroundColor: this.extractHexColor(node.fills),
                strokeWidthMM: (node.strokeWeight || 0.2) / MM_PT
            });
        }

        if (node.children) {
            node.children.forEach((child: any) => this.traverseNodeDeterministic(child, frameBbox, staticElements, slots, warnings));
        }
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
}
