import type { SessionUser } from '@uniconnect/shared';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user: SessionUser | null;
			theme: 'light' | 'dark';
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export { };
