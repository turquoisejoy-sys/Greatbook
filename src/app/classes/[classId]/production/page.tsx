'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

export default function ProductionPage() {
  const params = useParams();
  const router = useRouter();
  const classId = params.classId as string;

  useEffect(() => {
    if (!classId) return;
    router.replace(`/classes/${classId}/speaking`);
  }, [classId, router]);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="card text-center py-12">
        <p className="text-gray-600">Speaking & writing has moved to separate tabs.</p>
        <div className="mt-4 flex items-center justify-center gap-3">
          <Link href={`/classes/${classId}/speaking`} className="btn btn-primary">Go to Speaking</Link>
          <Link href={`/classes/${classId}/writing`} className="btn btn-secondary">Go to Writing</Link>
        </div>
      </div>
    </div>
  );
}
