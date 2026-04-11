import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/auth';
import { Sidebar } from '@/components/Sidebar';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = cookies();
  const token = cookieStore.get('att_session')?.value;

  if (!token) redirect('/login');

  const session = await verifyToken(token);
  if (!session) redirect('/login');

  if (session.role !== 'ADMIN' && session.role !== 'STAFF') redirect('/login');

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      <Sidebar userEmail={session.email} userRole={session.role} />
      <main className="flex-1 overflow-auto">
        <div className="p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
