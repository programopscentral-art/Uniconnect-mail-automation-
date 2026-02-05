import { DeterministicRenderer } from './apps/app/src/lib/server/services/deterministic-renderer';
import { CanonicalTemplateSchema } from './packages/shared/src/canonical-template';
import * as fs from 'fs';

async function verify() {
    const mockTemplate = {
        templateId: 'test-v1',
        universityId: 'cdu',
        version: 1,
        page: { widthMM: 210, heightMM: 297 },
        staticElements: [
            {
                id: 'header-bg',
                type: 'rect' as const,
                xMM: 10, yMM: 10, widthMM: 190, heightMM: 30,
                backgroundColor: '#f3f4f6'
            },
            {
                id: 'title',
                type: 'text' as const,
                xMM: 15, yMM: 20, widthMM: 100, heightMM: 10,
                content: 'DETERMINISTIC TEST PDF',
                style: { fontSizeMM: 8, color: '#111827', fontFamily: 'Helvetica', align: 'left' as const }
            }
        ],
        slots: {
            'student_name': {
                id: 'slot-1',
                xMM: 15, yMM: 50, widthMM: 80, heightMM: 10,
                style: { fontSizeMM: 5, color: '#374151', fontFamily: 'Helvetica', align: 'left' as const },
                overflow: 'clip' as const,
                isRequired: true
            }
        }
    };

    // Validate schema
    console.log('🔍 Validating Schema...');
    const template = CanonicalTemplateSchema.parse(mockTemplate);
    console.log('✅ Schema Valid');

    // Generate PDF
    console.log('🖨️ Rendering PDF...');
    const buffer = await DeterministicRenderer.renderToBuffer(template, {
        student_name: 'Antigravity AI Test'
    });

    const outputPath = './test-output.pdf';
    fs.writeFileSync(outputPath, buffer);
    console.log(`✅ PDF Generated: ${outputPath}`);
}

verify().catch(console.error);
