import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const data = await request.formData();
        const file = data.get('image') as File;
        const userId = data.get('userId') as string;

        if (!file || !userId) {
            return json({ message: 'Missing file or userId' }, { status: 400 });
        }

        const buffer = await file.arrayBuffer();
        const ext = path.extname(file.name) || '.png';
        const fileName = `${userId}_${crypto.randomUUID()}${ext}`;
        const uploadDir = path.resolve('static/uploads/profiles');

        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        const filePath = path.join(uploadDir, fileName);
        fs.writeFileSync(filePath, Buffer.from(buffer));

        const publicUrl = `/uploads/profiles/${fileName}`;

        return json({ url: publicUrl });
    } catch (e) {
        console.error('Upload Error:', e);
        return json({ message: 'Internal Server Error' }, { status: 500 });
    }
};
