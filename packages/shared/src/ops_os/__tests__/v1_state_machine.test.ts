/**
 * V1 state machine integration test.
 *
 * Runs against the configured DATABASE_URL inside a transaction that is
 * always rolled back — no persistent side effects. Bootstraps a temp
 * campus + users inside the transaction so it's self-contained.
 *
 * Run with:  cd packages/shared && npx tsx src/ops_os/__tests__/v1_state_machine.test.ts
 *
 * Covers:
 *   - create draft (idempotent)
 *   - autosave value (NEW → DRAFT)
 *   - submit (DRAFT → SUBMITTED)
 *   - send back (SUBMITTED → SENT_BACK, sent_back_count++)
 *   - resubmit (SENT_BACK → SUBMITTED)
 *   - sign off (SUBMITTED → SIGNED_OFF, pm_remark required)
 *   - lock (SIGNED_OFF → LOCKED)
 *   - immutability after lock (value upsert rejected)
 */

import { db } from '../../db/client';
import {
    createSubmission,
    updateSubmissionValue,
    transitionToSubmitted,
    transitionToSignedOff,
    transitionToSentBack,
    transitionToLocked,
    findSubmissionsToLock,
    listSubmissions,
    getSubmissionById,
    findCurrentSubmission,
} from '../submissions';

function ok(m: string): void {
    console.log(`  ✓ ${m}`);
}
function fail(m: string): never {
    console.error(`  ✗ ${m}`);
    process.exit(1);
}

async function main() {
    console.log('V1 state machine integration test');
    console.log('—————————————————————————————————————');

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        // ─── Bootstrap inside the transaction (rolled back at end) ──────

        // Two users with ops_os roles. We override the CHECK on public.users
        // by inserting role='ADMIN' (allowed by base schema) — RLS/role
        // checks for ops_os are set via app.current_user_role session var,
        // not via public.users.role.
        const u = await client.query<{ id: string }>(
            `INSERT INTO users (email, name, role) VALUES
                ('boa.test+' || gen_random_uuid()::text || '@test', 'BOA Test', 'ADMIN'),
                ('pm.test+'  || gen_random_uuid()::text || '@test', 'PM Test',  'ADMIN')
             RETURNING id`,
        );
        const boaId = u.rows[0].id;
        const pmId = u.rows[1].id;
        ok('bootstrapped BOA + PM users');

        const clusterR = await client.query<{ cluster_id: string }>(
            `INSERT INTO ops_os.cluster_dim (code, display_name)
             VALUES ('test-cluster-' || substring(gen_random_uuid()::text, 1, 8), 'Test Cluster')
             RETURNING cluster_id`,
        );
        const clusterId = clusterR.rows[0].cluster_id;

        const campusR = await client.query<{ campus_id: string }>(
            `INSERT INTO ops_os.campus_dim
                (code, display_name, region, cluster_id, onboarded_at)
             VALUES (
                'test-campus-' || substring(gen_random_uuid()::text, 1, 8),
                'Test Campus', 'TEST', $1, CURRENT_DATE)
             RETURNING campus_id`,
            [clusterId],
        );
        const campusId = campusR.rows[0].campus_id;
        ok('bootstrapped cluster + campus');

        await client.query(
            `INSERT INTO ops_os.user_campus_assignment (user_id, campus_id, role)
             VALUES ($1, $2, 'BOA'), ($3, $2, 'PM')`,
            [boaId, campusId, pmId],
        );
        ok('assigned BOA + PM to campus');

        const today = new Date().toISOString().slice(0, 10);

        // ─── Run BOA context for create + autosave + submit ─────────────

        await client.query(`SET LOCAL app.current_user_id = '${boaId}'`);
        await client.query(`SET LOCAL app.current_user_role = 'BOA'`);

        const sub1 = await createSubmission(
            {
                campus_id: campusId,
                cadence: 'DAILY',
                period_start: today,
                period_end: today,
                created_by: boaId,
            },
            client,
        );
        if (sub1.status !== 'NEW') fail(`expected NEW, got ${sub1.status}`);
        ok('createSubmission → NEW');

        // Idempotent find-or-create at the period level
        const sub1Again = await findCurrentSubmission(
            { campus_id: campusId, cadence: 'DAILY', period_start: today, period_end: today },
            client,
        );
        if (sub1Again?.submission_id !== sub1.submission_id) {
            fail('findCurrentSubmission did not return the same submission');
        }
        ok('findCurrentSubmission returns same row');

        // Autosave a value — status should bump to DRAFT
        await updateSubmissionValue(
            {
                submission_id: sub1.submission_id,
                metric_id: 'daily.attendance.total_enrolled',
                value: 120,
                value_type: 'numeric',
                actor_user_id: boaId,
            },
            client,
        );
        const sub2 = await getSubmissionById(sub1.submission_id, client);
        if (sub2?.status !== 'DRAFT') fail(`expected DRAFT after autosave, got ${sub2?.status}`);
        ok('updateSubmissionValue → DRAFT');

        await updateSubmissionValue(
            {
                submission_id: sub1.submission_id,
                metric_id: 'daily.attendance.present',
                value: 100,
                value_type: 'numeric',
                actor_user_id: boaId,
            },
            client,
        );

        const sub3 = await transitionToSubmitted(
            { submission_id: sub1.submission_id, submitted_by: boaId },
            client,
        );
        if (sub3.status !== 'SUBMITTED') fail(`expected SUBMITTED, got ${sub3.status}`);
        ok('transitionToSubmitted → SUBMITTED');

        // ─── Switch to PM context for send-back ──────────────────────────

        await client.query(`SET LOCAL app.current_user_id = '${pmId}'`);
        await client.query(`SET LOCAL app.current_user_role = 'PM'`);

        const sub4 = await transitionToSentBack(
            {
                submission_id: sub1.submission_id,
                sent_back_by: pmId,
                reason_code: 'missing_field',
                reason_text: 'attendance count missing context',
            },
            client,
        );
        if (sub4.status !== 'SENT_BACK') fail(`expected SENT_BACK, got ${sub4.status}`);
        if (sub4.sent_back_count !== 1) fail(`expected sent_back_count=1, got ${sub4.sent_back_count}`);
        ok('transitionToSentBack → SENT_BACK, count incremented');

        // ─── BOA resubmits ──────────────────────────────────────────────

        await client.query(`SET LOCAL app.current_user_id = '${boaId}'`);
        await client.query(`SET LOCAL app.current_user_role = 'BOA'`);

        const sub5 = await transitionToSubmitted(
            { submission_id: sub1.submission_id, submitted_by: boaId },
            client,
        );
        if (sub5.status !== 'SUBMITTED') fail(`expected SUBMITTED after resubmit, got ${sub5.status}`);
        ok('resubmit: SENT_BACK → SUBMITTED');

        // ─── PM signs off ────────────────────────────────────────────────

        await client.query(`SET LOCAL app.current_user_id = '${pmId}'`);
        await client.query(`SET LOCAL app.current_user_role = 'PM'`);

        // sign-off without remark must throw
        let remarkErr: Error | null = null;
        try {
            await transitionToSignedOff(
                { submission_id: sub1.submission_id, signed_off_by: pmId, pm_remark: '   ' },
                client,
            );
        } catch (e) {
            remarkErr = e as Error;
        }
        if (!remarkErr) fail('sign-off without remark should throw');
        ok('sign-off rejects empty pm_remark');

        const sub6 = await transitionToSignedOff(
            {
                submission_id: sub1.submission_id,
                signed_off_by: pmId,
                pm_remark: 'Verified attendance + faculty counts',
            },
            client,
        );
        if (sub6.status !== 'SIGNED_OFF') fail(`expected SIGNED_OFF, got ${sub6.status}`);
        ok('transitionToSignedOff → SIGNED_OFF');

        // Trying to update a value after sign-off must hit the immutability trigger
        let immutErr: Error | null = null;
        try {
            await updateSubmissionValue(
                {
                    submission_id: sub1.submission_id,
                    metric_id: 'daily.attendance.present',
                    value: 101,
                    value_type: 'numeric',
                    actor_user_id: pmId,
                },
                client,
            );
        } catch (e) {
            immutErr = e as Error;
        }
        if (!immutErr) fail('post-sign-off value update should be blocked by trigger');
        ok('immutability trigger blocks post-sign-off value update');

        // ─── Lock (worker role, no app context required) ─────────────────

        // findSubmissionsToLock returns it
        const lockable = await findSubmissionsToLock(
            { cadence: 'DAILY', period_end: today },
            client,
        );
        const found = lockable.some(s => s.submission_id === sub1.submission_id);
        if (!found) fail('findSubmissionsToLock should include our SIGNED_OFF row');
        ok(`findSubmissionsToLock found ${lockable.length} row(s) including ours`);

        const sub7 = await transitionToLocked(
            { submission_id: sub1.submission_id, locked_by: pmId },
            client,
        );
        if (!sub7) fail('expected non-null result from transitionToLocked');
        if (sub7.status !== 'LOCKED') fail(`expected LOCKED, got ${sub7.status}`);
        if (!sub7.locked_at) fail('locked_at should be set');
        ok('transitionToLocked → LOCKED, locked_at set');

        // Re-locking is idempotent (returns null, no error)
        const sub7Again = await transitionToLocked(
            { submission_id: sub1.submission_id, locked_by: pmId },
            client,
        );
        if (sub7Again !== null) fail('re-locking already-LOCKED row should return null');
        ok('transitionToLocked is idempotent (no-op on already LOCKED)');

        // Immutability holds for LOCKED too
        let immutErr2: Error | null = null;
        try {
            await updateSubmissionValue(
                {
                    submission_id: sub1.submission_id,
                    metric_id: 'daily.attendance.present',
                    value: 102,
                    value_type: 'numeric',
                    actor_user_id: pmId,
                },
                client,
            );
        } catch (e) {
            immutErr2 = e as Error;
        }
        if (!immutErr2) fail('post-lock value update should be blocked');
        ok('immutability trigger blocks post-lock value update');

        // ─── listSubmissions filters correctly ──────────────────────────

        const lockedList = await listSubmissions(
            { statuses: ['LOCKED'], cadence: 'DAILY' },
            client,
        );
        if (!lockedList.some(s => s.submission_id === sub1.submission_id)) {
            fail('listSubmissions with LOCKED filter should include our row');
        }
        ok('listSubmissions returns LOCKED rows');

        const signedOffList = await listSubmissions(
            { statuses: ['SIGNED_OFF'], cadence: 'DAILY' },
            client,
        );
        if (signedOffList.some(s => s.submission_id === sub1.submission_id)) {
            fail('listSubmissions with SIGNED_OFF filter should NOT include now-locked row');
        }
        ok('listSubmissions excludes rows no longer matching filter');

        // ─── Always rollback ─────────────────────────────────────────────

        await client.query('ROLLBACK');
        console.log('—————————————————————————————————————');
        console.log('ALL V1 STATE MACHINE TESTS PASSED');
        console.log('(transaction rolled back — no persistent side effects)');
    } catch (e) {
        try { await client.query('ROLLBACK'); } catch { /* connection may be dead */ }
        console.error('TEST FAILED:', e);
        process.exit(1);
    } finally {
        client.release();
        process.exit(0);
    }
}

main();
