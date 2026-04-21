'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useApp } from '@/components/AppShell';
import { getClasses, getAcademicYearOptions, getCurrentAcademicYear } from '@/lib/storage';
import {
  getKpiSnapshot,
  getSuperlatives,
  RETENTION_NOTES,
} from '@/lib/kpi-print';
import { ArrowLeftIcon, PrinterIcon } from '@heroicons/react/24/outline';

function formatCasasPairPct(reading: number | null, listening: number | null): string {
  if (reading === null && listening === null) return '—';
  const r = reading === null ? '—' : `${reading.toFixed(0)}%`;
  const l = listening === null ? '—' : `${listening.toFixed(0)}%`;
  return `R ${r} · L ${l}`;
}

function KpiPrintContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { currentClassId, setCurrentClassId, mounted } = useApp();
  const [classes, setClasses] = useState<ReturnType<typeof getClasses>>([]);
  const [yearOptions, setYearOptions] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState('');

  const classIdFromUrl = searchParams.get('classId');
  const effectiveClassId = classIdFromUrl || currentClassId || '';

  useEffect(() => {
    if (!mounted) return;
    setClasses(getClasses());
    const opts = getAcademicYearOptions();
    setYearOptions(opts);
    setSelectedYear(prev => {
      if (prev) return prev;
      const y = searchParams.get('year');
      if (y && opts.includes(y)) return y;
      return getCurrentAcademicYear();
    });
  }, [mounted, searchParams]);

  const classesInYear = useMemo(
    () => classes.filter(c => c.academicYear === selectedYear),
    [classes, selectedYear],
  );

  const selectedClass = classes.find(c => c.id === effectiveClassId);
  const inYear = selectedClass && selectedClass.academicYear === selectedYear;

  const snapshot = useMemo(() => {
    if (!mounted || !effectiveClassId || !selectedYear || !inYear) return null;
    return getKpiSnapshot(effectiveClassId, selectedYear);
  }, [mounted, effectiveClassId, selectedYear, inYear]);

  const superlatives = useMemo(() => {
    if (!mounted || !effectiveClassId || !inYear) return [];
    return getSuperlatives(effectiveClassId);
  }, [mounted, effectiveClassId, inYear]);

  const generatedLabel = new Date().toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const setClassId = (id: string) => {
    if (id) {
      setCurrentClassId(id);
      const params = new URLSearchParams();
      params.set('classId', id);
      if (selectedYear) params.set('year', selectedYear);
      router.push(`/tools/kpi-print?${params.toString()}`);
    } else {
      router.push('/tools/kpi-print');
    }
  };

  const setYear = (year: string) => {
    setSelectedYear(year);
    const params = new URLSearchParams();
    if (effectiveClassId) params.set('classId', effectiveClassId);
    params.set('year', year);
    router.push(`/tools/kpi-print?${params.toString()}`);
  };

  if (!mounted) {
    return (
      <div className="max-w-3xl mx-auto animate-pulse p-6">
        <div className="h-8 bg-gray-200 rounded w-64" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-gray-500 hover:text-[var(--cace-navy)] p-1"
            aria-label="Back to dashboard"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold text-[var(--cace-navy)]">Class KPI report</h1>
        </div>
        {effectiveClassId && inYear && snapshot && (
          <button
            type="button"
            onClick={() => window.print()}
            className="btn btn-secondary inline-flex items-center gap-2"
          >
            <PrinterIcon className="w-5 h-5" />
            Print
          </button>
        )}
      </div>

      <p className="text-gray-600 text-sm print:hidden">
        Pick a class and year, then print a one-page friendly summary: dashboard KPIs, how retention is
        calculated, and superlatives (1st–3rd place; ties listed at each rank).
      </p>

      <div className="card p-4 space-y-4 print:hidden">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Academic year</label>
          <select
            value={selectedYear}
            onChange={e => setYear(e.target.value)}
            className="input max-w-md"
          >
            {yearOptions.map(y => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
          <select
            value={effectiveClassId}
            onChange={e => setClassId(e.target.value)}
            className="input max-w-md"
          >
            <option value="">Select a class…</option>
            {classesInYear.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} • {c.schedule}
              </option>
            ))}
          </select>
        </div>
        {selectedYear && classesInYear.length === 0 && (
          <p className="text-sm text-amber-800">No classes for this year. Add a class on the dashboard.</p>
        )}
      </div>

      {effectiveClassId && !inYear && selectedClass && (
        <p className="text-sm text-amber-800 print:hidden">
          This class is in <strong>{selectedClass.academicYear}</strong>, not {selectedYear}. Switch the year
          above or pick another class.
        </p>
      )}

      {effectiveClassId && inYear && snapshot && (
        <div className="kpi-print-root space-y-8 print:space-y-4">
          <header className="border-b border-gray-200 pb-4 print:border-gray-400">
            <h2 className="text-xl font-bold text-[var(--cace-navy)] print:text-black">
              {selectedClass!.name}
            </h2>
            <p className="text-gray-600 print:text-gray-800">
              {selectedClass!.schedule} · {selectedClass!.academicYear}
            </p>
            <p className="text-sm text-gray-500 mt-1 print:text-gray-600">Generated {generatedLabel}</p>
          </header>

          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3 print:text-gray-800">
              Key metrics
            </h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-gray-600 print:text-gray-800">Students (active)</dt>
                <dd className="font-medium tabular-nums">{snapshot.studentCount}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-600 print:text-gray-800">Avg attendance</dt>
                <dd className="font-medium tabular-nums">
                  {snapshot.avgAttendance != null ? `${snapshot.avgAttendance.toFixed(0)}%` : '—'}
                </dd>
              </div>
              <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
                <dt className="text-gray-600 print:text-gray-800 shrink-0">30-day retention</dt>
                <dd className="font-medium tabular-nums text-right">
                  {snapshot.thirtyDayRetention != null
                    ? `${snapshot.thirtyDayRetention.toFixed(0)}%`
                    : '—'}
                  {snapshot.thirtyDayEligible > 0 && (
                    <span className="block text-xs font-normal text-gray-500 print:text-gray-600">
                      ({snapshot.thirtyDayRetained} kept of {snapshot.thirtyDayEligible} eligible)
                    </span>
                  )}
                </dd>
              </div>
              <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
                <dt className="text-gray-600 print:text-gray-800 shrink-0">YTD retention</dt>
                <dd className="font-medium tabular-nums text-right">
                  {snapshot.ytdRetention != null ? `${snapshot.ytdRetention.toFixed(0)}%` : '—'}
                  {snapshot.ytdEligible > 0 && (
                    <span className="block text-xs font-normal text-gray-500 print:text-gray-600">
                      ({snapshot.ytdRetained} kept of {snapshot.ytdEligible} eligible)
                    </span>
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-600 print:text-gray-800">Promoted</dt>
                <dd className="font-medium tabular-nums">{snapshot.promotedCount}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-600 print:text-gray-800">Students w/ gain (R · L)</dt>
                <dd className="font-medium tabular-nums text-right">
                  {formatCasasPairPct(snapshot.pctWithReadingGain, snapshot.pctWithListeningGain)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-600 print:text-gray-800">Class avg CASAS reading gain</dt>
                <dd className="font-medium tabular-nums">
                  {snapshot.avgCasasReadingGain != null
                    ? `${snapshot.avgCasasReadingGain.toFixed(1)} pts`
                    : '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-600 print:text-gray-800">Class avg CASAS listening gain</dt>
                <dd className="font-medium tabular-nums">
                  {snapshot.avgCasasListeningGain != null
                    ? `${snapshot.avgCasasListeningGain.toFixed(1)} pts`
                    : '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-600 print:text-gray-800">Students w/ level comp. (R · L)</dt>
                <dd className="font-medium tabular-nums text-right">
                  {formatCasasPairPct(snapshot.pctReadingLevelComplete, snapshot.pctListeningLevelComplete)}
                </dd>
              </div>
            </dl>
          </section>

          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3 print:text-gray-800">
              Superlatives
            </h3>
            {superlatives.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No student data to rank yet.</p>
            ) : (
              <ul className="space-y-2 text-sm print:space-y-1.5">
                {superlatives.map(row => (
                  <li
                    key={row.category}
                    className="border-b border-gray-100 pb-2 last:border-0 print:border-gray-200 print:pb-1.5"
                  >
                    <div className="font-medium text-[var(--cace-navy)] print:text-black">{row.category}</div>
                    <div className="text-gray-800 mt-1 space-y-1 print:space-y-0.5">
                      {row.places.map(place => (
                        <div key={place.rank} className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 print:text-gray-700 shrink-0">
                            {place.rank === 1 ? '1st' : place.rank === 2 ? '2nd' : '3rd'}
                          </span>
                          <span className="font-semibold tabular-nums">{place.valueLabel}</span>
                          <span className="text-gray-500">—</span>
                          <span>{place.names.join(', ')}</span>
                        </div>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="pt-4 mt-4 border-t border-gray-200 print:pt-3 print:mt-3 print:border-gray-300">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 print:text-gray-800 print:mb-1.5">
              Notes (how to read this report)
            </h3>
            <div className="space-y-2 text-[11px] leading-snug text-gray-600 print:text-[10px] print:text-gray-800 print:space-y-1.5">
              <p>
                <span className="font-semibold text-gray-800 print:text-black">
                  {RETENTION_NOTES.thirtyDay.title}:
                </span>{' '}
                {RETENTION_NOTES.thirtyDay.body}
              </p>
              <p>
                <span className="font-semibold text-gray-800 print:text-black">
                  {RETENTION_NOTES.ytd.title}:
                </span>{' '}
                {RETENTION_NOTES.ytd.body}
              </p>
              <p>
                <span className="font-semibold text-gray-800 print:text-black">Superlatives:</span>{' '}
                Top three distinct scores per measure (1st / 2nd / 3rd); everyone tied on a score shares that
                rank. CASAS scores use each student’s highest reading/listening test; gains come from the
                Student Gains import.
              </p>
            </div>
          </section>
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
          .kpi-print-root,
          .kpi-print-root * {
            visibility: visible;
          }
          .kpi-print-root {
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
        }
      `}</style>
    </div>
  );
}

export default function KpiPrintPage() {
  return (
    <Suspense fallback={<div className="max-w-3xl mx-auto p-6 text-gray-500">Loading…</div>}>
      <KpiPrintContent />
    </Suspense>
  );
}
