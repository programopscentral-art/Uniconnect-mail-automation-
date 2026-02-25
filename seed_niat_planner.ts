import { db } from './packages/shared/src/db/client';
import { updateRolePermissions, DEFAULT_ROLE_PERMISSIONS } from './packages/shared/src/db/permissions';

async function main() {
    console.log('Seeding NIAT Planner permissions...');

    // Add to ADMIN
    const adminFeatures = [...DEFAULT_ROLE_PERMISSIONS['ADMIN']];
    if (!adminFeatures.includes('niat-planner')) adminFeatures.push('niat-planner');
    await updateRolePermissions('ADMIN', adminFeatures);

    // Add to PROGRAM_OPS
    const opsFeatures = [...DEFAULT_ROLE_PERMISSIONS['PROGRAM_OPS']];
    if (!opsFeatures.includes('niat-planner')) opsFeatures.push('niat-planner');
    await updateRolePermissions('PROGRAM_OPS', opsFeatures);

    console.log('Done.');
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
