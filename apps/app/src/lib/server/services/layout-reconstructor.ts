import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '$env/dynamic/private';

/**
 * LayoutSchema interface defining the structured output for assessment layouts.
 */
export interface LayoutSchema {
    page: {
        width: 'A4' | 'LETTER' | 'LEGAL';
        unit: 'mm' | 'px';
        margins: { top: number; bottom: number; left: number; right: number };
    };
    pages: Array<{
        id: string;
        elements: Array<any>;
    }>;
}

/**
 * LayoutReconstructor Service
 * 
 * Responsible for analyzing uploaded document files (PDF/Images) and 
 * reconstructing their visual layout into a structured JSON schema.
 */
export class LayoutReconstructor {
    /**
     * The primary entry point for reconstruction. 
     */
    static async reconstruct(file: File, name: string, examType: string, universityId?: string): Promise<LayoutSchema> {
        const GEMINI_KEY = (env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || 'AIzaSyApoCTpsyCHOlejZ6DDN5wkxVnH11orvxI').trim();

        if (!GEMINI_KEY || GEMINI_KEY.length < 10) {
            console.error('[RECONSTRUCTOR] ❌ Critical: No valid Gemini API Key found.');
            throw new Error('AI Analysis Engine Offline: API Key Missing');
        }

        console.log(`[RECONSTRUCTOR] 🧪 Diagnostic: Using Key prefix ${GEMINI_KEY.slice(0, 5)}...`);
        console.log(`[RECONSTRUCTOR] 🚀 Starting AI Analysis for: ${file.name} (${file.size} bytes)`);

        try {
            const aiLayout = await this.analyzeWithGemini(file, name, examType, GEMINI_KEY);
            if (aiLayout) {
                console.log('[RECONSTRUCTOR] ✅ AI Reconstruction Successful');
                return aiLayout;
            }
            throw new Error('AI returned an empty layout');
        } catch (e: any) {
            console.error('[RECONSTRUCTOR] ❌ Pipeline Failed:', e.message);
            throw new Error(`AI Engine Failure: ${e.message || 'Unknown Error'}`);
        }
    }

    private static async analyzeWithGemini(file: File, name: string, examType: string, apiKey: string): Promise<LayoutSchema | null> {
        const buffer = Buffer.from(await file.arrayBuffer());
        const base64 = buffer.toString('base64');

        // Robust Mime-Type Detection (Fixes 404/NOT FOUND on GEMINI)
        let mimeType = file.type;
        if (!mimeType || mimeType === 'application/octet-stream' || mimeType === 'application/png') {
            if (file.name.toLowerCase().endsWith('.png')) mimeType = 'image/png';
            else if (file.name.toLowerCase().endsWith('.jpg') || file.name.toLowerCase().endsWith('.jpeg')) mimeType = 'image/jpeg';
            else if (file.name.toLowerCase().endsWith('.pdf')) mimeType = 'application/pdf';
            else mimeType = 'image/png'; // Final fallback
        }

        // Broad fallback strategy to handle regional/account-specific model availability
        const modelsToTry = ["gemini-1.5-flash-latest", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro-vision"];
        const apiVersions = [undefined, "v1"];

        let result: any = null;
        let lastError: any = null;

        for (const apiVer of apiVersions) {
            const genAI = new GoogleGenerativeAI(apiKey, apiVer ? { apiVersion: apiVer } as any : undefined);

            for (const modelId of modelsToTry) {
                try {
                    console.log(`[RECONSTRUCTOR] 🤖 Trying model ${modelId} @ API ${apiVer || 'v1beta'}`);
                    const model = genAI.getGenerativeModel({ model: modelId });
                    result = await model.generateContent([
                        this.getArchitectPrompt(name, examType),
                        { inlineData: { data: base64, mimeType: mimeType } }
                    ]);
                    if (result) break;
                } catch (e: any) {
                    console.warn(`[RECONSTRUCTOR] ⚠️ Model fallback ${modelId} failed:`, e.message);
                    lastError = e;
                }
            }
            if (result) break;
        }

        if (!result && lastError) {
            throw new Error(`Gemini Exhausted: ${lastError.message}`);
        }

        const response = await result.response;
        const text = response.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]) as LayoutSchema;
            } catch (pE) {
                console.error('[RECONSTRUCTOR] ❌ JSON Parse Error:', pE);
                return null;
            }
        }
        return null;
    }

    private static getArchitectPrompt(name: string, examType: string): string {
        return `
            Act as a Principal Layout Architect. Your task is to extract the visual structure and content of this assessment paper with millimeter precision. 
            The output MUST be a JSON object adhering to the LayoutSchema.

            CORE REQUIREMENTS:
            1. **Branding & Logos**: Detect institutional logos. Element type 'image', placeholder src="/logos/university-logo.png".
            2. **Headers & Text**: Extract all text (University, Exam, Course). Type 'text'. Use valid HTML (<h1>, etc).
            3. **Lines & Dividers**: Type 'line'. 'horizontal' or 'vertical'.
            4. **Question Mesh**: Identify the question blocks. Position them in the 'elements' array.

            STRICT SCHEMA:
            {
                "page": { "width": "A4", "unit": "mm", "margins": { "top": 10, "bottom": 10, "left": 10, "right": 10 } },
                "pages": [{
                    "id": "p1",
                    "elements": [
                        { "id": "brand-logo", "type": "image", "x": 90, "y": 10, "w": 30, "h": 30, "src": "/logos/university-logo.png" },
                        { "id": "header-txt", "type": "text", "x": 10, "y": 45, "w": 190, "h": 25, "content": "<div>...</div>" }
                    ]
                }]
            }
            Return ONLY raw JSON.
        `;
    }
}
