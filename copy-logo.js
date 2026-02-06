const fs = require('fs');
const path = require('path');

const src = "C:/Users/karth/.gemini/antigravity/brain/ccc36f5e-943b-4ea3-83c0-392c06c35e49/media__1770293531170.png";
const dest = "c:/Desktop/uniconnect-mail-automation/apps/app/static/vgu-logo.png";

try {
    fs.copyFileSync(src, dest);
    console.log('✅ Logo copied to static/');
} catch (e) {
    console.error('❌ Copy failed:', e);
}
