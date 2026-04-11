import Link from 'next/link';
import { prisma } from '@/lib/db';

interface SearchParams {
  search?: string;
  dept?: string;
  page?: string;
}

async function getStudents(params: SearchParams) {
  const page = Math.max(1, parseInt(params.page ?? '1'));
  const limit = 20;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};

  if (params.search) {
    where.OR = [
      { name: { contains: params.search, mode: 'insensitive' } },
      { studentId: { contains: params.search, mode: 'insensitive' } },
      { email: { contains: params.search, mode: 'insensitive' } }
    ];
  }

  if (params.dept) {
    where.department = { equals: params.dept, mode: 'insensitive' };
  }

  const [students, total] = await Promise.all([
    prisma.student.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' }
    }),
    prisma.student.count({ where })
  ]);

  const departments = await prisma.student.groupBy({
    by: ['department'],
    where: { department: { not: null } },
    _count: true,
    orderBy: { department: 'asc' }
  });

  return { students, total, page, totalPages: Math.ceil(total / limit), departments };
}

export default async function StudentsPage({
  searchParams
}: {
  searchParams: SearchParams;
}) {
  const { students, total, page, totalPages, departments } = await getStudents(searchParams);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Students</h1>
          <p className="text-gray-400 text-sm mt-1">{total} total students</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/students/upload"
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Upload Students
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form className="flex flex-col sm:flex-row gap-3 flex-1" method="GET">
          <input
            name="search"
            defaultValue={searchParams.search}
            placeholder="Search by name, ID, email..."
            className="flex-1 bg-gray-900 border border-gray-800 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
          />
          <select
            name="dept"
            defaultValue={searchParams.dept ?? ''}
            className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d.department} value={d.department ?? ''}>
                {d.department} ({d._count})
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Search
          </button>
          {(searchParams.search || searchParams.dept) && (
            <Link
              href="/admin/students"
              className="bg-gray-800 hover:bg-gray-700 text-gray-400 px-4 py-2 rounded-lg text-sm transition-colors text-center"
            >
              Clear
            </Link>
          )}
        </form>
      </div>

      {/* Table */}
      {students.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <svg className="w-12 h-12 text-gray-700 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-gray-500">No students found. Upload a CSV to get started.</p>
          <Link href="/admin/students/upload" className="mt-4 inline-block bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            Upload Students
          </Link>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Student ID', 'Name', 'Email', 'Dept', 'Batch', 'Section', 'QR', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {students.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-mono text-indigo-400">{s.studentId}</td>
                    <td className="px-4 py-3 text-sm text-white font-medium max-w-[180px] truncate">{s.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-400 max-w-[160px] truncate">{s.email ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{s.department ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{s.batch ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{s.section ?? '—'}</td>
                    <td className="px-4 py-3">
                      {s.qrToken ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-400 bg-green-500/20 px-2 py-0.5 rounded">
                          <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />
                          Generated
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded">
                          None
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {s.isActive ? (
                        <span className="text-xs text-green-400">Active</span>
                      ) : (
                        <span className="text-xs text-red-400">Inactive</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/students/${s.id}`}
                        className="text-indigo-400 hover:text-indigo-300 text-xs font-medium transition-colors"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-gray-800 flex items-center justify-between">
              <p className="text-gray-500 text-xs">
                Page {page} of {totalPages} ({total} students)
              </p>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link
                    href={`/admin/students?${new URLSearchParams({ ...searchParams, page: String(page - 1) })}`}
                    className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm transition-colors"
                  >
                    Previous
                  </Link>
                )}
                {page < totalPages && (
                  <Link
                    href={`/admin/students?${new URLSearchParams({ ...searchParams, page: String(page + 1) })}`}
                    className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm transition-colors"
                  >
                    Next
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
