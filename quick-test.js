const campaignId = 'e217c2be-e20c-4abe-969c-9beea885647a';
const testEmail = 'karthikeya.a544@gmail.com';

fetch(`http://localhost:3001/api/campaigns/${campaignId}/test-email`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Cookie': 'uniconnect_session=your-session-cookie-here'
    },
    body: JSON.stringify({ testEmail })
})
    .then(res => res.json())
    .then(data => {
        console.log('Response:', JSON.stringify(data, null, 2));
    })
    .catch(err => console.error('Error:', err));
