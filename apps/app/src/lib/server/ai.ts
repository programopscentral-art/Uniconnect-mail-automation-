import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '$env/dynamic/private';

// Initialize Gemini
// Ensure GEMINI_API_KEY is in .env
const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY || '');

export async function generateTemplateContent(prompt: string) {
    if (!env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY not configured');
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const result = await model.generateContent(`
    You are an expert email copywriter for a university administration system.
    Generate an email Subject and HTML Body based on this request: "${prompt}".
    
    The HTML should be clean, professional, and use inline CSS for email compatibility.
    You can use these variables: {{studentName}}, {{studentExternalId}}, {{universityName}}.
    
    Return ONLY a JSON object with this format (no markdown, no extra text):
    {
      "subject": "The email subject line",
      "html": "The full html email body"
    }
  `);

    const response = result.response;
    let text = response.text();

    // Clean up markdown code blocks if present
    text = text.replace(/```json\n?|\n?```/g, '');

    try {
        return JSON.parse(text) as { subject: string; html: string };
    } catch (e) {
        console.error('Failed to parse Gemini response:', text);
        throw new Error('AI generation failed to produce valid JSON');
    }
}
