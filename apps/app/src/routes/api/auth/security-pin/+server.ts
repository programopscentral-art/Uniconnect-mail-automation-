import { json, error } from '@sveltejs/kit';
import { SecurityPinService } from '@uniconnect/shared';
import type { RequestHandler } from './$types';

// GET: Check if user has a PIN set
export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user) throw error(401);
    const hasPin = await SecurityPinService.hasPin(locals.user.id);
    return json({ hasPin });
};

// POST: Set or update PIN
export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401);

    const { pin, currentPin } = await request.json();

    if (!pin || !/^\d{6}$/.test(pin)) {
        throw error(400, 'PIN must be exactly 6 digits');
    }

    // If PIN already exists, require current PIN to change it
    const hasExisting = await SecurityPinService.hasPin(locals.user.id);
    if (hasExisting) {
        if (!currentPin) throw error(400, 'Current PIN required to change PIN');
        const valid = await SecurityPinService.verifyPin(locals.user.id, currentPin);
        if (!valid) throw error(403, 'Current PIN is incorrect');
    }

    await SecurityPinService.setPin(locals.user.id, pin);
    return json({ success: true });
};
