import { TemplateRenderer } from './packages/shared/src/template';

const sampleMetadata = {
    "Total Term 2 Fee (Payable - Paid)": "71,591",
    "term 3 fee": "45,000",
    "Term 1 Fee adjustment (O/S +ve and Excess -Ve)": "2,300"
};

const sampleVariables = {
    studentName: "John Doe",
    metadata: sampleMetadata,
    ...sampleMetadata
};

const template = `
Hello {{studentName}},
Your Term 2 fee is ₹{{Total Term 2 Fee (Payable - Paid)}}.

{{TABLE}}
`;

const config = {
    tableRows: [
        { label: "Term 2 Fee Amount", value: "{{Total Term 2 Fee (Payable - Paid)}}" },
        { label: "Term 3 Fee Amount", value: "{{term 3 fee}}" },
        { label: "Dues from Previous Term", value: "{{Term 1 Fee adjustment (O/S +ve and Excess -Ve)}}" }
    ]
};

console.log("--- RENDERING TEST ---");
const result = TemplateRenderer.render(template, sampleVariables, { config, noLayout: true });
console.log(result);

console.log("\n--- KEY CHECK ---");
const keys = Object.keys(sampleMetadata);
console.log("Keys in metadata:", keys);
