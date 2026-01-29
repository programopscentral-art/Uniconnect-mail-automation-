const { TemplateRenderer } = require('./packages/shared/dist/template');

const template = "Hello {{student_name}}, your {{Term 1 Fee}} is due.";
const vars = {
    metadata: {
        "Term 1 Fee": "15,000",
        "student_name": "Nithin"
    }
};

try {
    const rendered = TemplateRenderer.render(template, vars);
    console.log("Rendered Result:", rendered);
    if (rendered.includes("15,000") && rendered.includes("Nithin")) {
        console.log("✅ TEST PASSED: Aggressive normalization works.");
    } else {
        console.error("❌ TEST FAILED: Variables not resolved.");
        console.log("Content:", rendered);
    }
} catch (e) {
    console.error("❌ ERROR during rendering:", e);
}
