'use client';

import { Suspense, useMemo, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useApp } from '@/components/AppShell';
import { getClasses } from '@/lib/storage';
import { getStudentsWithRanksByClassId } from '@/lib/calculations';
import { StudentWithStats } from '@/types';
import { ArrowLeftIcon, UserGroupIcon, PrinterIcon } from '@heroicons/react/24/outline';

function formatScore(s: StudentWithStats): string {
  if (s.overallScore === null || s.overallScore === undefined) return '—';
  return `${s.overallScore.toFixed(1)}%`;
}

function buildPairs(ranked: StudentWithStats[]): {
  pairs: { stronger: StudentWithStats; weaker: StudentWithStats }[];
  solo: StudentWithStats | null;
} {
  const n = ranked.length;
  const pairs: { stronger: StudentWithStats; weaker: StudentWithStats }[] = [];
  for (let i = 0; i < Math.floor(n / 2); i++) {
    pairs.push({
      stronger: ranked[i],
      weaker: ranked[n - 1 - i],
    });
  }
  const solo = n % 2 === 1 ? ranked[Math.floor(n / 2)] : null;
  return { pairs, solo };
}

function PartnerMatchingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { currentClassId, setCurrentClassId, mounted } = useApp();
  const [classes, setClasses] = useState<ReturnType<typeof getClasses>>([]);

  const classIdFromUrl = searchParams.get('classId');
  const effectiveClassId = classIdFromUrl || currentClassId || '';

  useEffect(() => {
    if (mounted) setClasses(getClasses());
  }, [mounted]);

  const rankedComplete = useMemo(() => {
    if (!mounted || !effectiveClassId) return [];
    return getStudentsWithRanksByClassId(effectiveClassId)
      .filter(s => s.isComplete && s.rank !== null)
      .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  }, [mounted, effectiveClassId]);

  const { pairs, solo } = useMemo(() => buildPairs(rankedComplete), [rankedComplete]);

  const selectedClass = classes.find(c => c.id === effectiveClassId);

  const handleClassChange = (id: string) => {
    if (id) {
      setCurrentClassId(id);
      router.push(`/tools/partner-matching?classId=${encodeURIComponent(id)}`);
    } else {
      router.push('/tools/partner-matching');
    }
  };

  if (!mounted) {
    return (
      <div className="max-w-4xl mx-auto animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-64 mb-4" />
      </div>
    );
  }

  const generatedLabel = new Date().toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-gray-500 hover:text-[var(--cace-navy)] p-1"
            aria-label="Back to dashboard"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2">
            <UserGroupIcon className="w-8 h-8 text-[var(--cace-teal)]" />
            <h1 className="text-2xl font-bold text-[var(--cace-navy)]">Partner matching</h1>
          </div>
        </div>
        {effectiveClassId && rankedComplete.length > 0 && (
          <button
            type="button"
            onClick={() => window.print()}
            className="btn btn-secondary inline-flex items-center gap-2"
          >
            <PrinterIcon className="w-5 h-5" />
            Print list
          </button>
        )}
      </div>

      <p className="text-gray-600 text-sm print:hidden">
        Pairs use the same <strong>overall score</strong> ranking as the Analysis page (complete students only).
        The <strong>highest-ranked</strong> student is paired with the <strong>lowest</strong>, second with
        second-lowest, and so on—so the middle of the list meets the middle.
      </p>

      <div className="card p-4 print:hidden">
        <label className="block text-sm font-medium text-gray-700 mb-2">Class</label>
        <select
          value={effectiveClassId}
          onChange={e => handleClassChange(e.target.value)}
          className="input max-w-md"
        >
          <option value="">Select a class…</option>
          {classes.map(c => (
            <option key={c.id} value={c.id}>
              {c.name} • {c.schedule} ({c.academicYear})
            </option>
          ))}
        </select>
      </div>

      {!effectiveClassId && (
        <p className="text-gray-500 text-sm print:hidden">Choose a class to generate pairs.</p>
      )}

      {effectiveClassId && rankedComplete.length === 0 && (
        <div className="card text-center py-10 text-gray-600 print:hidden">
          <p>No students with <strong>complete</strong> ranking data in this class yet.</p>
          <p className="text-sm text-gray-500 mt-2">
            Students need reading, listening, unit tests, and attendance filled in (same rules as Analysis).
          </p>
          <Link href={`/classes/${effectiveClassId}/analysis`} className="btn btn-accent inline-block mt-4">
            Open Analysis
          </Link>
        </div>
      )}

      {effectiveClassId && rankedComplete.length > 0 && (
        <div className="partner-matching-print space-y-4 print:space-y-3">
          <div className="hidden print:block border-b border-gray-300 pb-3 mb-2">
            <h1 className="text-2xl font-bold text-[var(--cace-navy)]">Partner matching</h1>
            {selectedClass && (
              <p className="text-base font-medium text-gray-800 mt-1">
                {selectedClass.name} · {selectedClass.schedule} · {selectedClass.academicYear}
              </p>
            )}
            <p className="text-sm text-gray-600 mt-1">Generated {generatedLabel}</p>
            <p className="text-xs text-gray-500 mt-2">
              Pairs from Analysis overall rank (complete students): strongest with weakest, middle with middle.
            </p>
          </div>

          <div className="card p-0 overflow-hidden print:shadow-none print:border print:border-gray-300">
            <table className="data-table text-sm partner-matching-table">
              <thead>
                <tr>
                  <th className="w-16">Pair</th>
                  <th>Higher rank (stronger)</th>
                  <th>Lower rank (partner)</th>
                </tr>
              </thead>
              <tbody>
                {pairs.map((p, idx) => (
                  <tr key={`${p.stronger.id}-${p.weaker.id}`}>
                    <td className="text-gray-500 font-medium">{idx + 1}</td>
                    <td>
                      <span className="font-medium text-[var(--cace-navy)]">{p.stronger.name}</span>
                      <span className="text-gray-500 text-xs ml-2">
                        #{p.stronger.rank} · {formatScore(p.stronger)}
                      </span>
                    </td>
                    <td>
                      <span className="font-medium text-gray-800">{p.weaker.name}</span>
                      <span className="text-gray-500 text-xs ml-2">
                        #{p.weaker.rank} · {formatScore(p.weaker)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {solo && (
              <div className="px-4 py-3 bg-amber-50 border-t border-amber-100 text-sm print:bg-amber-50">
                <span className="font-medium text-amber-900">Odd number of ranked students — </span>
                <span className="text-amber-800">
                  <strong>{solo.name}</strong> (#{solo.rank}, {formatScore(solo)}) has no pair. Consider a trio or
                  rotating partner.
                </span>
              </div>
            )}
          </div>

          <p className="text-xs text-gray-500 print:text-sm">
            {rankedComplete.length} ranked student{rankedComplete.length !== 1 ? 's' : ''} ·{' '}
            {pairs.length} pair{pairs.length !== 1 ? 's' : ''}
            {solo ? ' · 1 unpaired' : ''}
          </p>
        </div>
      )}

      <style jsx global>{`
        @media print {
          html,
          body {
            height: auto !important;
            min-height: auto !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          body * {
            visibility: hidden;
          }
          .partner-matching-print,
          .partner-matching-print * {
            visibility: visible;
          }
          .partner-matching-print {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            padding: 0 12px 24px !important;
          }
          main {
            overflow: visible !important;
            height: auto !important;
          }
          .partner-matching-table th,
          .partner-matching-table td {
            border-color: #d1d5db !important;
          }
        }
      `}</style>
    </div>
  );
}

export default function PartnerMatchingPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-4xl mx-auto p-6 text-gray-500">Loading…</div>
      }
    >
      <PartnerMatchingContent />
    </Suspense>
  );
}
