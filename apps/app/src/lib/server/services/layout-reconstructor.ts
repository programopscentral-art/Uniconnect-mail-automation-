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

        // Robust Mime-Type Detection
        let mimeType = file.type;
        if (!mimeType || mimeType === 'application/octet-stream' || mimeType === 'application/png') {
            if (file.name.toLowerCase().endsWith('.png')) mimeType = 'image/png';
            else if (file.name.toLowerCase().endsWith('.jpg') || file.name.toLowerCase().endsWith('.jpeg')) mimeType = 'image/jpeg';
            else if (file.name.toLowerCase().endsWith('.pdf')) mimeType = 'application/pdf';
            else mimeType = 'image/png';
        }

        // Broad fallback strategy: Try v1 first (more stable for some keys), then v1beta
        const apiVersions = ["v1", undefined]; // undefined = library default (v1beta)
        const modelsToTry = [
            "gemini-1.5-flash-latest",
            "gemini-1.5-flash",
            "gemini-1.5-flash-002",
            "gemini-1.5-pro",
            "gemini-pro-vision"
        ];

        let result: any = null;
        let lastError: any = null;

        for (const apiVer of apiVersions) {
            try {
                // In many SDK versions, settings are passed in a second arg, or via getGenerativeModel
                // Using standard 1-arg constructor for safest compatibility
                const genAI = new GoogleGenerativeAI(apiKey);

                for (const modelId of modelsToTry) {
                    try {
                        console.log(`[RECONSTRUCTOR] 🤖 Trying model ${modelId} @ API ${apiVer || 'v1beta'}`);
                        // Some versions allow passing requestOptions to getGenerativeModel
                        const model = genAI.getGenerativeModel(
                            { model: modelId },
                            apiVer ? { apiVersion: apiVer } as any : undefined
                        );

                        result = await model.generateContent([
                            this.getArchitectPrompt(name, examType),
                            { inlineData: { data: base64, mimeType: mimeType } }
                        ]);
                        if (result) {
                            console.log(`[RECONSTRUCTOR] ✅ Success with ${modelId} @ ${apiVer || 'v1beta'}`);
                            break;
                        }
                    } catch (e: any) {
                        console.warn(`[RECONSTRUCTOR] ⚠️ Model ${modelId} @ ${apiVer || 'v1beta'} failed:`, e.message);
                        lastError = e;
                    }
                }
                if (result) break;
            } catch (verErr: any) {
                console.error(`[RECONSTRUCTOR] ❌ API Attempt failed:`, verErr.message);
            }
        }

        // --- FINAL RESORT: Raw REST Fetch (Bypass Library) ---
        if (!result) {
            console.log(`[RECONSTRUCTOR] 🚨 SDK Exhausted. Attempting Direct REST Fallback...`);
            try {
                const restUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
                const restResp = await fetch(restUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [
                                { text: this.getArchitectPrompt(name, examType) },
                                { inlineData: { mimeType: mimeType, data: base64 } }
                            ]
                        }]
                    })
                });

                if (restResp.ok) {
                    const data = await restResp.json();
                    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (text) {
                        console.log(`[RECONSTRUCTOR] 🎯 Direct REST Fallback SUCCESS`);
                        return this.parseJsonResponse(text);
                    }
                } else {
                    const errTxt = await restResp.text();
                    console.error(`[RECONSTRUCTOR] ❌ Direct REST Failed (${restResp.status}):`, errTxt);
                }
            } catch (fetchErr: any) {
                console.error(`[RECONSTRUCTOR] ❌ Direct REST Crash:`, fetchErr.message);
            }
        }

        if (!result && lastError) {
            throw new Error(`Gemini Exhausted (including REST fallback): ${lastError.message}`);
        }

        const response = await result.response;
        return this.parseJsonResponse(response.text());
    }

    private static parseJsonResponse(text: string): LayoutSchema | null {
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
