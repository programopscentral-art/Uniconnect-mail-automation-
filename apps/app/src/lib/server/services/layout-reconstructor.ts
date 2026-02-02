import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '$env/dynamic/private';

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
        console.log(`[RECONSTRUCTOR] 🚀 Universal AI Analysis Started: ${file.name} (Size: ${file.size} bytes)`);

        const GEMINI_KEY = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || 'AIzaSyApoCTpsyCHOlejZ6DDN5wkxVnH11orvxI';

        if (!GEMINI_KEY || GEMINI_KEY.length < 10) {
            console.error('[RECONSTRUCTOR] ❌ Critical: No valid Gemini API Key found.');
            throw new Error('AI Analysis Engine Offline: API Key Missing');
        }

        try {
            console.log('[RECONSTRUCTOR] 🤖 Attempting Gemini Analysis...');
            const aiLayout = await this.analyzeWithGemini(file, name, examType, GEMINI_KEY);
            if (aiLayout) {
                console.log('[RECONSTRUCTOR] ✅ Gemini Analysis Successful');
                return aiLayout;
            }
            throw new Error('AI Analysis returned no results');
        } catch (e: any) {
            console.error('[RECONSTRUCTOR] ❌ Gemini Pipeline Failed:', e.message || e);
            throw new Error(`AI Analysis Failed: ${e.message || 'Unknown Error'}`);
        }
    }

    private static getBoilerplate(name: string, examType: string): LayoutSchema {
        return {
            page: {
                width: 'A4',
                unit: 'mm',
                margins: { top: 10, bottom: 10, left: 10, right: 10 }
            },
            pages: [{
                id: 'page-1',
                elements: [{
                    id: 'header',
                    type: 'text',
                    x: 10, y: 15, w: 190, h: 40,
                    content: `<div style="text-align: center;"><h1>${name.toUpperCase()}</h1><p>${examType}</p></div>`
                }]
            }]
        };
    }

    private static async analyzeWithGemini(file: File, name: string, examType: string, apiKey: string): Promise<LayoutSchema | null> {
        console.log(`[RECONSTRUCTOR] 🤖 Calling Gemini for ${name}... (Mime: ${file.type}, Size: ${file.size})`);

        const genAI = new GoogleGenerativeAI(apiKey.trim());
        const buffer = Buffer.from(await file.arrayBuffer());
        const base64 = buffer.toString('base64');

        // Robust Mime-Type Detection
        let mimeType = file.type;
        if (!mimeType || mimeType === 'application/octet-stream') {
            if (file.name.toLowerCase().endsWith('.png')) mimeType = 'image/png';
            else if (file.name.toLowerCase().endsWith('.jpg') || file.name.toLowerCase().endsWith('.jpeg')) mimeType = 'image/jpeg';
            else if (file.name.toLowerCase().endsWith('.pdf')) mimeType = 'application/pdf';
            else mimeType = 'image/png'; // Fallback
        }

        // Resilience: Try different model identifiers
        const modelsToTry = ["gemini-1.5-flash", "models/gemini-1.5-flash", "gemini-pro-vision"];
        let result: any = null;
        let lastError: any = null;

        const prompt = `
            Act as a Principal Layout Architect. Your task is to extract the visual structure and content of this assessment paper with millimeter precision. 
            The output MUST be a JSON object adhering to the LayoutSchema.

            CORE REQUIREMENTS:
            1. **Branding & Logos**: Detect any institutional logos. If found, create an element of type 'image' with correct x, y, w, h coordinates. Use src="/logos/university-logo.png" as a placeholder for identified logos.
            2. **Headers & Text**: Extract all header text (University Name, Exam Type, Course, Code). Use type 'text'. Wrap content in semantically relevant HTML (<h1>, <h2>, <p>). Use Tailwind-like inline styles if necessary to match font size and alignment.
            3. **Lines & Dividers**: Identify every horizontal and vertical line. Create elements of type 'line'. Specify 'orientation' (horizontal/vertical) and 'thickness'.
            4. **Tables & Boxes**: If the paper uses a table for meta-data (Time, Marks) or content boxes, create type 'table' or 'shape'.
            5. **Question Mesh**: Identify the main grid where questions are placed. If it's a grid, represent it as a table with borders.

            COORDINATE SYSTEM:
            - Page: A4 (210mm x 297mm).
            - Unit: mm (millimeter).
            - Everything must be positioned relative to the top-left (0,0).

            STRICT SCHEMA:
            {
                "page": { "width": "A4", "unit": "mm", "margins": { "top": 10, "bottom": 10, "left": 10, "right": 10 } },
                "pages": [{
                    "id": "p1",
                    "elements": [
                        { "id": "brand-logo", "type": "image", "x": 90, "y": 10, "w": 30, "h": 30, "src": "/logos/university-logo.png" },
                        { "id": "header-txt", "type": "text", "x": 10, "y": 45, "w": 190, "h": 25, "content": "<div style='text-align: center'>...</div>" },
                        { "id": "divider-1", "type": "line", "x": 10, "y": 75, "w": 190, "h": 1, "orientation": "horizontal", "thickness": 1, "color": "#000" }
                    ]
                }]
            }

            Return ONLY raw JSON. No markdown blocks. No explanations.
        `;

        for (const modelId of modelsToTry) {
            try {
                console.log(`[RECONSTRUCTOR] 🤖 Testing Gemini Model: ${modelId} with Mime: ${mimeType}`);
                const model = genAI.getGenerativeModel({ model: modelId });
                result = await model.generateContent([
                    prompt,
                    { inlineData: { data: base64, mimeType: mimeType } }
                ]);
                if (result) break;
            } catch (e: any) {
                console.warn(`[RECONSTRUCTOR] ⚠️ Model ${modelId} failure:`, e.message);
                lastError = e;
                // If the error is "NOT FOUND", we definitely want to try the next model
            }
        }

        if (!result && lastError) {
            console.error('[RECONSTRUCTOR] ❌ Gemini Pipeline Failed:', lastError);
            const geminiErrDetail = lastError.stack || JSON.stringify(lastError);
            throw new Error(`Gemini Engine Failure: ${lastError.message || 'Unknown Response'} | Trace: ${geminiErrDetail.slice(0, 100)}`);
        }

        const response = await result.response;
        const text = response.text();
        console.log('[RECONSTRUCTOR] 📝 AI Response received (Length:', text.length, ')');

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0]) as LayoutSchema;
                console.log('[RECONSTRUCTOR] 🧩 Extracted JSON with', parsed.pages?.[0]?.elements?.length || 0, 'elements');
                return parsed;
            } catch (pE) {
                console.error('[RECONSTRUCTOR] ❌ Failed to parse AI JSON:', pE);
                console.debug('[RECONSTRUCTOR] Raw JSON was:', jsonMatch[0]);
            }
        } else {
            console.warn('[RECONSTRUCTOR] ⚠️ No JSON found in AI response');
            console.debug('[RECONSTRUCTOR] Raw AI text was:', text);
        }

        return null;
    }
}
