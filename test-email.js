// Quick test to send a test email for the campaign
const campaignId = 'e217c2be-e20c-4abe-969c-9beea885647a';
const testEmail = 'karthikeya.a544@gmail.com'; // Replace with your email

fetch(`http://localhost:3001/api/campaigns/${campaignId}/test-email`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        testEmail: testEmail
    })
})
    .then(res => res.json())
    .then(data => {
        console.log('Test email response:', data);
        if (data.jobId) {
            console.log('✅ Test email queued successfully! Job ID:', data.jobId);
        } else if (data.error) {
            console.log('❌ Error:', data.error);
        }
    })
    .catch(err => console.error('Request failed:', err));
