export const dynamic = 'force-dynamic';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/auth';

export default async function HomePage() {
  const cookieStore = cookies();
  const token = cookieStore.get('att_session')?.value;

  if (token) {
    const payload = await verifyToken(token);
    if (payload) {
      redirect('/admin');
    }
  }

  redirect('/login');
}
