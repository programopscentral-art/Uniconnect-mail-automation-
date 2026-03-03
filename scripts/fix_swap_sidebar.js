const fs = require('fs');
const path = require('path');
const d = 'c:/Desktop/uniconnect-mail-automation/apps/app/src/lib/components/assessments';
fs.readdirSync(d).filter(f => f.endsWith('.svelte')).forEach(f => {
    const fp = path.join(d, f);
    let c = fs.readFileSync(fp, 'utf8');
    if (c.includes('<SwapQuestionSidebar') && !c.includes('currentSetData={currentSetData}')) {
        c = c.replace(/<SwapQuestionSidebar[\s\S]*?\/>/g, m => {
            return m.replace('/>', ' currentSetData={currentSetData} />');
        });
        fs.writeFileSync(fp, c);
        console.log('Updated ' + f);
    }
});
