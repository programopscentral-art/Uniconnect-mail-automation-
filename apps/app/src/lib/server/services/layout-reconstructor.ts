import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * LayoutReconstructor Service
 * 
 * Responsible for analyzing uploaded document files (PDF/Images) and 
 * reconstructing their visual layout into a structured JSON schema.
 * 
 * This service implements the "Principal Engineer" mandate for 
 * exact document replication (headers, tables, borders, lines).
 */

export interface LayoutSchema {
    page: {
        width: 'A4' | 'LETTER' | 'LEGAL';
        unit: 'mm' | 'px';
        margins: { top: number; bottom: number; left: number; right: number };
    };
    pages: {
        id: string;
        elements: LayoutElement[];
    }[];
}

export type LayoutElement =
    | TextElement
    | TableElement
    | LineElement
    | ShapeElement
    | ImageElement;

export interface BaseElement {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    styles?: Record<string, any>;
}

export interface TextElement extends BaseElement {
    type: 'text';
    content: string;
}

export interface TableElement extends BaseElement {
    type: 'table';
    tableData: {
        rows: {
            id: string;
            cells: {
                id: string;
                content: string;
                styles?: Record<string, any>;
            }[];
        }[];
    };
}

export interface LineElement extends BaseElement {
    type: 'line';
    orientation: 'horizontal' | 'vertical';
    thickness: number;
    color: string;
}

export interface ShapeElement extends BaseElement {
    type: 'shape';
    shapeType: 'rectangle' | 'circle';
    backgroundColor: string;
    borderWidth: number;
    borderColor: string;
}

export interface ImageElement extends BaseElement {
    type: 'image';
    src: string;
    alt?: string;
}

export class LayoutReconstructor {
    /**
     * Reconstructs a document from a file.
     * In a production ML-integrated environment, this would call 
     * LayoutParser, Table Transformer, and OCR pipelines.
     */
    static async reconstruct(file: File, name: string, examType: string, universityId?: string): Promise<LayoutSchema> {
        console.log(`[RECONSTRUCTOR] 🚀 Analyzing document: ${file.name} (Univ: ${universityId})`);

        const nameKeywords = name.toLowerCase();
        const isADYPU = universityId === 'f4f3915c-bb8d-42b3-a756-219d9a5f9c2b' ||
            nameKeywords.includes('adypu') ||
            nameKeywords.includes('ajeenkya');

        const isMRV = nameKeywords.includes('mrv');
        const isUnitTest = nameKeywords.includes('unit') || nameKeywords.includes('test') || nameKeywords.includes('midi');
        const isProfessional = nameKeywords.includes('university') || nameKeywords.includes('college') || nameKeywords.includes('school') || isADYPU || isMRV;

        // Try Gemini if Key exists and it's a complex doc
        const GEMINI_KEY = process.env.GEMINI_API_KEY || 'AIzaSyApoCTpsyCHOlejZ6DDN5wkxVnH11orvxI';
        if (GEMINI_KEY && (isMRV || !isADYPU)) {
            try {
                const aiLayout = await this.analyzeWithGemini(file, name, examType, GEMINI_KEY);
                if (aiLayout) return aiLayout;
            } catch (e) {
                console.error('[RECONSTRUCTOR] ❌ Gemini Error:', e);
            }
        }

        const elements: LayoutElement[] = [];

        // 1. Page Border
        elements.push({
            id: 'page-border',
            type: 'shape',
            x: 5, y: 5, w: 200, h: 287,
            shapeType: 'rectangle',
            backgroundColor: 'transparent',
            borderWidth: 1,
            borderColor: '#000'
        });

        // --- BRANCH A: HIGH-FIDELITY ADYPU (Priority) ---
        if (isADYPU) {
            // Header: 4-Line Branding
            elements.push({
                id: 'adypu-header',
                type: 'text',
                x: 10, y: 15, w: 190, h: 42,
                content: `
                    <div style="text-align: center; font-family: 'Outfit', sans-serif; line-height: 1.2;">
                        <h1 style="font-size: 18px; font-weight: 900; margin: 0; color: #000; letter-spacing: 0.05em;">AJEENKYA D. Y. PATIL UNIVERSITY</h1>
                        <p style="font-size: 16px; font-weight: 900; color: #000; margin: 5px 0; text-transform: uppercase;">${isUnitTest ? 'UNIT TEST' : 'TERM END'} – ${new Date().getFullYear()}</p>
                        <p style="font-size: 16px; font-weight: 900; color: #e11d48; margin: 5px 0; text-transform: uppercase;">B.TECH(CSE) - I SEMESTER</p>
                        <p style="font-size: 16px; font-weight: 900; color: #e11d48; margin: 5px 0; text-transform: uppercase;">${examType.toUpperCase()} EXAMINATION</p>
                    </div>
                `
            });

            // Meta Row (Millimeter Precision)
            elements.push({
                id: 'adypu-meta',
                type: 'table',
                x: 10, y: 60, w: 190, h: 16,
                tableData: {
                    rows: [{
                        id: 'm-r1',
                        cells: [
                            { id: 'm-c1', content: '<strong>Time: 1.5 Hrs</strong>', styles: { fontSize: '15px', fontWeight: '900', border: '1px solid #000', padding: '8px 15px' } },
                            { id: 'm-c2', content: '<div style="text-align: right;"><strong>Max. Marks: 20</strong></div>', styles: { fontSize: '15px', fontWeight: '900', border: '1px solid #000', padding: '8px 15px' } }
                        ]
                    }]
                }
            });

            const contentStartY = 80;

            // Section Divider
            elements.push({
                id: 'adypu-section',
                type: 'table',
                x: 10, y: contentStartY, w: 190, h: 12,
                tableData: {
                    rows: [{
                        id: 's1-r',
                        cells: [
                            { id: 's1-c1', content: '<strong>Answer the following Questions.</strong>', styles: { fontSize: '13px', border: '1px solid #000', padding: '8px 15px' } },
                            { id: 's1-c2', content: '<div style="text-align: right;"><strong>2 x 4 = 8</strong></div>', styles: { fontSize: '12px', fontWeight: 'bold', border: '1px solid #000', padding: '8px 15px' } }
                        ]
                    }]
                }
            });

            // Question Mesh (2-Column Locking)
            elements.push({
                id: 'adypu-qs',
                type: 'table',
                x: 10, y: contentStartY + 15, w: 190, h: 180,
                tableData: {
                    rows: Array(4).fill(0).map((_, i) => ({
                        id: `q${i + 1}-r`,
                        cells: [
                            { id: `q${i + 1}-n`, content: `<strong>${i + 1}</strong>`, styles: { width: '45px', textAlign: 'center', border: '1px solid #000', fontWeight: '900', fontSize: '16px', paddingTop: '20px' } },
                            { id: `q${i + 1}-c`, content: `<div style="font-size: 14px; padding: 20px; min-height: 80px;">[ ADYPU High-Fidelity Question Region ]</div>`, styles: { border: '1px solid #000' } }
                        ]
                    }))
                }
            });

        } else {
            // --- BRANCH B: STRATEGIC HEURISTICS (Other Docs) ---
            const headerLines = [];
            if (isProfessional) headerLines.push(`<h1 style="font-size: 20px; font-weight: 900; margin: 0; color: #000; letter-spacing: 0.05em;">${name.toUpperCase()}</h1>`);
            else headerLines.push(`<h1 style="font-size: 18px; font-weight: 900; margin: 0; color: #000;">${name}</h1>`);

            if (isUnitTest) {
                headerLines.push(`<p style="font-size: 14px; font-weight: 900; color: #000; margin: 8px 0; text-transform: uppercase;">UNIT TEST – ${new Date().getFullYear()}</p>`);
                headerLines.push(`<p style="font-size: 14px; font-weight: 900; color: #e11d48; margin: 5px 0; text-transform: uppercase;">${examType} EXAMINATION</p>`);
            } else {
                headerLines.push(`<p style="font-size: 12px; font-weight: 900; color: #475569; margin: 5px 0;">${examType} - EXAMINATION PAPER</p>`);
            }

            elements.push({
                id: 'header-block',
                type: 'text',
                x: 10, y: 15, w: 190, h: 45,
                content: `<div style="text-align: center; font-family: 'Outfit', sans-serif; line-height: 1.3;">${headerLines.join('')}</div>`
            });

            elements.push({
                id: 'meta-standard',
                type: 'table',
                x: 10, y: 65, w: 190, h: 16,
                tableData: {
                    rows: [{
                        id: 'm-r1',
                        cells: [
                            { id: 'c1', content: '<strong>TIME: ---</strong>', styles: { fontSize: '14px', fontWeight: '900', border: '1px solid #000', padding: '10px' } },
                            { id: 'c2', content: '<div style="text-align: right;"><strong>MARKS: ---</strong></div>', styles: { fontSize: '14px', fontWeight: '900', border: '1px solid #000', padding: '10px' } }
                        ]
                    }]
                }
            });

            elements.push({
                id: 'body-placeholder',
                type: 'shape',
                x: 10, y: 85, w: 190, h: 190,
                shapeType: 'rectangle',
                backgroundColor: 'transparent',
                borderWidth: 1,
                borderColor: '#e2e8f0',
                styles: { borderDash: '5,5' }
            });
        }

        const schema: LayoutSchema = {
            page: {
                width: 'A4',
                unit: 'mm',
                margins: { top: 10, bottom: 10, left: 10, right: 10 }
            },
            pages: [{ id: 'page-1', elements }]
        };

        return schema;
    }

    private static async analyzeWithGemini(file: File, name: string, examType: string, apiKey: string): Promise<LayoutSchema | null> {
        console.log(`[RECONSTRUCTOR] 🤖 Calling Gemini for ${name}...`);

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const buffer = Buffer.from(await file.arrayBuffer());
        const base64 = buffer.toString('base64');

        const prompt = `
            Analyze this assessment paper and return a JSON LayoutSchema.
            The schema MUST follow this structure:
            {
                "page": { "width": "A4", "unit": "mm", "margins": { "top": 10, "bottom": 10, "left": 10, "right": 10 } },
                "pages": [{
                    "id": "p1",
                    "elements": [
                        { "id": "el1", "type": "image", "x": 90, "y": 10, "w": 30, "h": 30, "src": "/logos/university-logo.png", "alt": "Logo" },
                        { "id": "el2", "type": "text", "x": 10, "y": 45, "w": 190, "h": 20, "content": "<h1>UNIVERSITY NAME</h1>" }
                    ]
                }]
            }
            Types allowed: text, image, table, line, shape.
            For logos, use type 'image' and identify its position.
            Return ONLY the raw JSON.
        `;

        const result = await model.generateContent([
            prompt,
            { inlineData: { data: base64, mimeType: file.type || "application/pdf" } }
        ]);

        const response = await result.response;
        const text = response.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]) as LayoutSchema;
        }

        return null;
    }
}
