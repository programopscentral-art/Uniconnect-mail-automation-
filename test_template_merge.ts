/**
 * Test script to verify TemplateRenderer correctly merges table row variables
 * 
 * This tests the fix for the resend variable merging issue where table row
 * placeholders were not being resolved due to type safety issues.
 * 
 * Run: npx tsx test_template_merge.ts
 */

import { TemplateRenderer } from './packages/shared/src/template';

console.log('=== Testing TemplateRenderer Table Row Merge ===\n');

// Sample metadata matching the user's actual data structure
const sampleMetadata = {
    "Total Term 2 Fee Payable (Includes Term 2 & Term 1 adjustments)": "₹150,000",
    "Term 1 Fee adjustment (O/S +ve and Excess -Ve)": "₹0",
    "Semester 2 General Fee Amount": "₹150,000"
};

const sampleVariables = {
    studentName: "Test Student",
    STUDENT_NAME: "Test Student",
    name: "Test Student",
    metadata: sampleMetadata,
    ...sampleMetadata
};

const template = `
Hello {{studentName}},

Please find your fee details below:

{{TABLE}}

Thank you!
`;

// Template config with tableRows containing placeholders
const config = {
    tableRows: [
        {
            label: "Semester 2 General Fee Amount",
            value: "{{Semester 2 General Fee Amount}}"
        },
        {
            label: "Dues from Previous Term(if any)",
            value: "{{Term 1 Fee adjustment (O/S +ve and Excess -Ve)}}"
        },
        {
            label: "Semester 2 Fee Amount",
            value: "{{Total Term 2 Fee Payable (Includes Term 2 & Term 1 adjustments)}}"
        }
    ]
};

console.log('Template config tableRows:');
config.tableRows.forEach((row, idx) => {
    console.log(`  Row ${idx}: label="${row.label}", value="${row.value}"`);
});

console.log('\nMetadata keys available:');
Object.keys(sampleMetadata).forEach(key => {
    console.log(`  "${key}": "${sampleMetadata[key]}"`);
});

console.log('\n--- Rendering Template ---\n');

const result = TemplateRenderer.render(template, sampleVariables, {
    config,
    noLayout: true
});

console.log('\n--- Rendered Result ---\n');
console.log(result);

// Verify the result contains actual values, not placeholders
const hasUnresolvedPlaceholders = result.includes('{{');
const hasExpectedValue1 = result.includes('₹150,000');
const hasExpectedValue2 = result.includes('₹0');

console.log('\n--- Verification ---');
console.log(`✓ Contains "₹150,000": ${hasExpectedValue1 ? '✅ PASS' : '❌ FAIL'}`);
console.log(`✓ Contains "₹0": ${hasExpectedValue2 ? '✅ PASS' : '❌ FAIL'}`);
console.log(`✓ No unresolved placeholders: ${!hasUnresolvedPlaceholders ? '✅ PASS' : '❌ FAIL'}`);

if (hasExpectedValue1 && hasExpectedValue2 && !hasUnresolvedPlaceholders) {
    console.log('\n🎉 ALL TESTS PASSED! Table row merge is working correctly.');
    process.exit(0);
} else {
    console.log('\n❌ TESTS FAILED! Table row merge is not working correctly.');
    process.exit(1);
}
