import { db } from '../src/db/client';

async function mergeUniversities() {
    const merges = [
        { winner: '0b67ea9a-024b-4420-99cb-8134e35011c3', losers: ['a9d82397-1062-4e47-acf9-b567c3931dbc'] }, // AMET
        { winner: '6bd1174c-9974-4643-bde9-9ea39ddfa741', losers: ['c1c639c0-8900-4cab-869e-0092b8c901ee'] }, // Central
        { winner: '6eebf3cb-8718-421b-bf31-3f341c9d19fe', losers: ['545ff148-156e-40ef-a9bb-1ce8c78b4374'] }, // Annamacharya
        { winner: '1c2b0b3b-81ed-4ba7-93c0-56978d3520b0', losers: ['dd1fec51-89d5-4152-afbb-f1e9545b2874'] }, // Aurora
        { winner: '54ea7cbf-6b56-4d8b-9045-2efa02b138ec', losers: ['53e01212-2974-417e-a65f-6d175e23f0f0'] }, // Crescent
        { winner: '1e5f88db-2e3e-4f52-8810-7168e9dec84c', losers: ['3a62d7bb-68d8-433c-b0ae-96ee58e89f88'] }, // SGU
        { winner: '235c20c4-a581-4f4c-943a-8edfde55776c', losers: ['b4831367-2265-400e-90de-b0e01384d7be'] }, // NRI
        { winner: 'e583fa9e-03b6-42fa-9829-ee875241df2d', losers: ['ca408cc4-ae0b-44e1-ae99-e620a6e0af49'] }, // NSRIT
        { winner: 'b48091f2-de4d-49d2-b9f7-77e7465a1f0a', losers: ['c38f8d81-cf61-4be8-a738-b53f32b96052'] }, // Yenepoya
        { winner: 'e0930c70-880d-4e11-8288-e63acd2eaad1', losers: ['a2103685-502e-4c55-a86f-28e298d3a1e3'] }, // S-Vyasa
        { winner: 'f4f3915c-bb8d-42b3-a756-219d9a5f9c2b', losers: ['bb329c2f-3714-41ce-ae9b-55a0da63c5d8'] }, // ADYPU
        { winner: '2d93e269-4242-4db9-9907-682c98b699e2', losers: ['d51e261d-e369-4e74-98ef-ea69c488d75b'] }, // Takshashila
        { winner: 'c40ed15d-b3e4-49ba-b1c4-71a2a8526a6f', losers: ['385aad59-b3d0-4e1c-98f0-05eee88de2a3'] }, // VGU
        { winner: '13f3513e-9ab1-4515-a97c-1d7ef7bba9fc', losers: ['85bb1db0-0197-48a4-8a77-1a093f1747cf'] }, // Student Engagement
        { winner: 'd0aed78f-0d86-45a0-8943-d7d17133755c', losers: ['e42985ff-d380-46dd-a9ab-c601211fb882'] }, // NIU
        { winner: '34320c82-ccd8-444a-ace2-8c8bc62b1294', losers: ['f110a8c8-4981-447e-a13f-fb2321213a23'] }, // Chalapathy
    ];

    try {
        console.log('--- University Merging Started ---');

        for (const merge of merges) {
            const { winner, losers } = merge;
            console.log(`Merging into Winner: ${winner} (from losers: ${losers.join(', ')})`);

            for (const loser of losers) {
                // Update dependent tables
                await db.query('UPDATE users SET university_id = $1 WHERE university_id = $2', [winner, loser]);
                await db.query('UPDATE tasks SET university_id = $1 WHERE university_id = $2', [winner, loser]);
                await db.query('UPDATE mailbox_connections SET university_id = $1 WHERE university_id = $2', [winner, loser]);
                await db.query('UPDATE templates SET university_id = $1 WHERE university_id = $2', [winner, loser]);
                await db.query('UPDATE students SET university_id = $1 WHERE university_id = $2', [winner, loser]);
                await db.query('UPDATE campaigns SET university_id = $1 WHERE university_id = $2', [winner, loser]);

                // Delete the duplicate university
                await db.query('DELETE FROM universities WHERE id = $1', [loser]);
            }
        }

        console.log('--- University Merging Completed Successfully! ---');

    } catch (err) {
        console.error('Merge failed:', err);
    } finally {
        process.exit(0);
    }
}

mergeUniversities();
