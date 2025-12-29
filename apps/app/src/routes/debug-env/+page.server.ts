import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
    return {
        GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
        GOOGLE_GMAIL_REDIRECT_URI: env.GOOGLE_GMAIL_REDIRECT_URI,
        PUBLIC_BASE_URL: env.PUBLIC_BASE_URL,
        all_keys: Object.keys(env)
    };
};
