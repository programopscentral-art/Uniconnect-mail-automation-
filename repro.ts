
import { TemplateRenderer } from './packages/shared/src/template';

// User's exact long tag
const longTag = 'Term 1 Fee adjustment (O/S +ve and Excess -Ve)';
const sample = {
    name: 'Akarsh B',
    metadata: {
        [longTag]: '1000',
        'coupon codes': 'KOF09Z',
        'FEES_DESCRIPTION': 'Course Fee'
    }
};

const baseVars = {
    ...sample,
    ...(sample.metadata || {})
};

// Dirty tag with newline, space entity, and HTML tags
// This tests: 1. HTML stripping, 2. Entity resolution, 3. Alphanumeric fallback
const html = "Dues: {{Term 1 Fee <br>adjustment (O/S +ve and&nbsp;Excess -Ve)}} | Coupon: {{COUPON_CODE}}";
const rendered = TemplateRenderer.render(html, baseVars, { noLayout: true });

console.log('--- Rendered Output ---');
console.log(rendered);
console.log('-----------------------');

if (rendered.includes('1000')) {
    console.log('SUCCESS: Alpha-fallback worked for dirty complex tag.');
} else {
    console.log('FAILURE: Alpha-fallback FAILED for dirty complex tag.');
}

const success = rendered.includes('5000') &&
    rendered.includes('SAVE50') &&
    rendered.includes('15000');

if (success) {
    console.log('SUCCESS: Values replaced correctly (including alphanumeric fallback).');
} else {
    console.log('FAILURE: Values NOT replaced correctly.');
}
