import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

const sourceDbUrl = process.argv[2]; // Source DATABASE_URL passed as argument
const targetDbUrl = process.env.DATABASE_URL;

if (!sourceDbUrl) {
    console.error('Usage: npx ts-node migrate-replit.ts <SOURCE_DATABASE_URL>');
    process.exit(1);
}

if (!targetDbUrl) {
    console.error('DATABASE_URL (target) not found in environment.');
    process.exit(1);
}

const sourcePool = new Pool({ connectionString: sourceDbUrl });
const targetPool = new Pool({ connectionString: targetDbUrl });

import { v5 as uuidv5 } from 'uuid';

const NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // Default UUID namespace

function toUuid(id: string | null) {
    if (!id) return null;
    if (id.length === 36 && id.includes('-')) return id; // Already a UUID
    return uuidv5(id, NAMESPACE);
}

function parseNameFromEmail(email: string) {
    const prefix = email.split('@')[0];
    const parts = prefix.split(/[._-]/);
    return parts
        .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
        .join(' ');
}

async function migrate() {
    const sClient = await sourcePool.connect();
    const tClient = await targetPool.connect();

    try {
        console.log('--- Migration Started ---');

        // Disable triggers to prevent audit log noise/errors during migration
        await tClient.query('SET session_replication_role = "replica"');

        // 1. Migrate Universities
        console.log('Migrating universities...');
        const { rows: univs } = await sClient.query('SELECT * FROM universities');
        for (const u of univs) {
            try {
                let slug = u.slug || u.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

                // Check if slug exists with different ID
                const { rows: existing } = await tClient.query('SELECT id FROM universities WHERE slug = $1 AND id != $2', [slug, u.id]);
                if (existing.length > 0) {
                    slug = `${slug}-${u.id.split('-')[0]}`; // Append part of ID to make it unique
                }

                await tClient.query(
                    `INSERT INTO universities (id, name, slug, created_at) 
                     VALUES ($1, $2, $3, $4) 
                     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug`,
                    [u.id, u.name, slug, u.created_at]
                );
            } catch (e) {
                console.error(`Failed to migrate university ${u.name}:`, (e as Error).message);
            }
        }
        console.log(`Finished processing universities.`);

        // 2. Migrate Users
        console.log('Migrating users...');
        const { rows: users } = await sClient.query('SELECT * FROM users');
        for (const u of users) {
            try {
                const targetId = toUuid(u.id);
                let name = [u.first_name, u.last_name].filter(Boolean).join(' ');

                if (!name || name.trim() === '') {
                    name = parseNameFromEmail(u.email);
                }

                // Map legacy roles to new system roles
                let targetRole = (u.role || '').toLowerCase();
                if (targetRole === 'admin') targetRole = 'ADMIN';
                else if (targetRole === 'boapma') targetRole = 'PMA';
                else if (targetRole === 'cospm') targetRole = 'PM';
                else if (targetRole === 'guest') targetRole = 'UNIVERSITY_OPERATOR';
                else targetRole = 'UNIVERSITY_OPERATOR'; // Fallback

                await tClient.query(
                    `INSERT INTO users (id, email, name, role, university_id, profile_picture_url, created_at) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7) 
                     ON CONFLICT (email) DO UPDATE SET 
                        id = EXCLUDED.id, 
                        name = EXCLUDED.name, 
                        role = EXCLUDED.role, 
                        university_id = EXCLUDED.university_id,
                        profile_picture_url = EXCLUDED.profile_picture_url`,
                    [targetId, u.email.toLowerCase(), name, targetRole, u.university_id, u.profile_image_url, u.created_at]
                );
            } catch (e) {
                console.error(`Failed to migrate user ${u.email}:`, (e as Error).message);
            }
        }
        console.log(`Finished processing users.`);

        // 3. Migrate Tasks (Schema Mapping)
        console.log('Migrating tasks...');
        const { rows: tasks } = await sClient.query('SELECT * FROM tasks');
        for (const t of tasks) {
            try {
                const targetId = toUuid(t.id);
                const assignedTo = toUuid(t.assigned_to_id);
                const createdBy = toUuid(t.created_by_id);

                let targetStatus = (t.status || '').toUpperCase();
                if (!['PENDING', 'COMPLETED', 'CANCELLED'].includes(targetStatus)) {
                    targetStatus = 'PENDING';
                }

                await tClient.query(
                    `INSERT INTO tasks (id, university_id, title, description, status, due_date, assigned_to, assigned_by, created_at) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
                     ON CONFLICT (id) DO NOTHING`,
                    [targetId, t.university_id, t.title, t.description, targetStatus, t.deadline, assignedTo, createdBy || assignedTo, t.created_at]
                );
            } catch (e) {
                console.error(`Failed to migrate task ${t.title}:`, (e as Error).message);
            }
        }
        console.log(`Finished processing tasks.`);

        // 4. Migrate Day Plans
        console.log('Migrating day plans...');
        const { rows: sourceDayPlans } = await sClient.query('SELECT * FROM day_plans');
        let dayPlanCount = 0;
        for (const dp of sourceDayPlans) {
            try {
                const targetUserId = toUuid(dp.user_id);
                const targetId = toUuid(dp.id);

                await tClient.query(
                    `INSERT INTO day_plans (id, user_id, title, plan_date, completed, completed_at, google_sheet_url, created_at, updated_at) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
                     ON CONFLICT (id) DO UPDATE SET 
                        title = EXCLUDED.title,
                        completed = EXCLUDED.completed,
                        completed_at = EXCLUDED.completed_at`,
                    [
                        targetId,
                        targetUserId,
                        dp.title,
                        dp.plan_date,
                        dp.completed || false,
                        dp.completed_at,
                        dp.google_sheet_url,
                        dp.created_at,
                        dp.updated_at
                    ]
                );
                dayPlanCount++;
            } catch (e) {
                console.error(`Failed to migrate day plan ${dp.id}:`, (e as Error).message);
            }
        }
        console.log(`Migrated ${dayPlanCount} day plans.`);

        // Enable triggers back
        await tClient.query('SET session_replication_role = "origin"');

        console.log('--- Migration Completed Successfully! ---');
    } catch (err) {
        console.error('Migration failed system-wide:', err);
    } finally {
        sClient.release();
        tClient.release();
        await sourcePool.end();
        await targetPool.end();
    }
}

migrate();
