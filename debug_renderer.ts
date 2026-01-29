
import { TemplateRenderer } from './packages/shared/src/template';

const template = `
    Hello {{Student Name}},
    Please pay your fee using the button below:
    {{ ACTION_BUTTON }}
    
    Or this one:
    {{ Pay Fee Online }}
    
    Your details:
    {{TABLE}}
    
    Thanks!
`;

const variables = {
    'Student Name': 'John Doe',
    'Payment link': 'https://razorpay.com/pay/123',
    'metadata': {
        'TERM_FEE': '₹ 50,000'
    }
};

const options = {
    baseUrl: 'https://test.com',
    trackingToken: 'token123',
    includeAck: true,
    config: {
        payButton: { text: 'Pay Now', url: '{{Payment link}}' }
    }
};

const result = TemplateRenderer.render(template, variables, options);
console.log("--- RENDER RESULT ---");
console.log(result);
console.log("----------------------");

if (result.includes('Pay Now') && result.includes('https://razorpay.com/pay/123')) {
    console.log("✅ Success: Pay Now button with URL found!");
} else {
    console.log("❌ Failure: Button or URL missing!");
}

if (result.includes('table-row') || result.includes('fee-table')) {
    console.log("✅ Success: Table found!");
}
