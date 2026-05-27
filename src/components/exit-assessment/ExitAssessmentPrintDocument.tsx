'use client';

import '@/app/tools/exit-assessment/exit-assessment-print.css';
import React from 'react';
import {
  countExitPasses,
  DEFAULT_ORAL_MAX,
  DEFAULT_ORAL_PASS,
  DEFAULT_WRITING_MAX,
  DEFAULT_WRITING_PASS,
  isPromoted,
  PROMO_TESTS_NEEDED,
  PROMO_TESTS_TOTAL,
} from '@/lib/exit-assessment';

export interface ExitStudentRow {
  studentId: string;
  studentName: string;
  reading: number | null;
  listening: number | null;
  oral: number | null;
  writing: number | null;
}

export interface ExitAssessmentPrintDocumentProps {
  students: ExitStudentRow[];
  teacherName: string;
  exitDateLabel: string;
  readingPassMin: number;
  listeningPassMin: number;
  classIsAm: boolean;
  levelNumber: number;
  nextLevelNumber: number;
}

function chunkPairs<T>(items: T[]): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += 2) {
    chunks.push(items.slice(i, i + 2));
  }
  return chunks;
}

function scoreText(v: number | null): string {
  if (v === null || Number.isNaN(v)) return '—';
  return String(v);
}

function Pill({ pass }: { pass: boolean }) {
  return <span className={`ea-pill ${pass ? 'ea-yes' : 'ea-no'}`}>{pass ? 'Pass' : 'No Pass'}</span>;
}

function PassPill({ score, minInclusive }: { score: number | null; minInclusive: number }) {
  if (score === null || Number.isNaN(score)) {
    return (
      <span className="ea-yn text-gray-400" style={{ fontFamily: 'system-ui, sans-serif' }}>
        —
      </span>
    );
  }
  return <Pill pass={score >= minInclusive} />;
}

function StudentSheet({
  row,
  teacherName,
  exitDateLabel,
  readingPassMin,
  listeningPassMin,
  classIsAm,
  levelNumber,
  nextLevelNumber,
}: {
  row: ExitStudentRow;
  teacherName: string;
  exitDateLabel: string;
  readingPassMin: number;
  listeningPassMin: number;
  classIsAm: boolean;
  levelNumber: number;
  nextLevelNumber: number;
}) {
  const nPass = countExitPasses(
    row.reading,
    row.listening,
    row.oral,
    row.writing,
    readingPassMin,
    listeningPassMin,
  );
  const promoted = isPromoted(nPass);

  return (
    <article className="ea-student">
      <div className="ea-banner">Level {levelNumber} — Exit assessment results</div>
      <div className="ea-meta">
        <div>
          <div className="ea-name">{row.studentName}</div>
          <div className="ea-teacher">
            Teacher: <strong>{teacherName || '—'}</strong>
          </div>
          <div className="ea-class-am-pm" aria-hidden="true">
            <span>Class:</span>
            <label>
              <span className={`ea-box ${classIsAm ? 'ea-on' : ''}`} /> AM
            </label>
            <label>
              <span className={`ea-box ${!classIsAm ? 'ea-on' : ''}`} /> PM
            </label>
          </div>
        </div>
        <div className="ea-right">
          <div>
            <strong>Date:</strong> {exitDateLabel}
          </div>
        </div>
      </div>
      <div className="ea-section-title">Test scores</div>
      <div className="ea-rows">
        <div className="ea-row">
          <span className="ea-label">
            CASAS Reading <span className="ea-paren">(Pass {readingPassMin}+)</span>
          </span>
          <span className="ea-score">{scoreText(row.reading)}</span>
          <span className="ea-yn">
            <PassPill score={row.reading} minInclusive={readingPassMin} />
          </span>
        </div>
        <div className="ea-row">
          <span className="ea-label">
            CASAS Listening <span className="ea-paren">(Pass {listeningPassMin}+)</span>
          </span>
          <span className="ea-score">{scoreText(row.listening)}</span>
          <span className="ea-yn">
            <PassPill score={row.listening} minInclusive={listeningPassMin} />
          </span>
        </div>
        <div className="ea-row">
          <span className="ea-label">
            Oral <span className="ea-paren">(Pass {DEFAULT_ORAL_PASS}+ out of {DEFAULT_ORAL_MAX})</span>
          </span>
          <span className="ea-score">{scoreText(row.oral)}</span>
          <span className="ea-yn">
            <PassPill score={row.oral} minInclusive={DEFAULT_ORAL_PASS} />
          </span>
        </div>
        <div className="ea-row">
          <span className="ea-label">
            Writing{' '}
            <span className="ea-paren">
              (Pass {DEFAULT_WRITING_PASS}+ out of {DEFAULT_WRITING_MAX})
            </span>
          </span>
          <span className="ea-score">{scoreText(row.writing)}</span>
          <span className="ea-yn">
            <PassPill score={row.writing} minInclusive={DEFAULT_WRITING_PASS} />
          </span>
        </div>
      </div>
      <div className="ea-promo">
        <div className="ea-promo-left">
          <div className="ea-promo-title">
            {levelNumber >= 5 ? (
              <>Completed level {levelNumber} program requirements</>
            ) : (
              <>
                Completed level {levelNumber} and promoted to level {nextLevelNumber}
              </>
            )}
          </div>
          <div className="ea-promo-hint">
            ({PROMO_TESTS_NEEDED} out of {PROMO_TESTS_TOTAL} tests needed to pass)
          </div>
        </div>
        <div className="ea-promo-answer">{promoted ? 'Yes' : 'No'}</div>
      </div>
    </article>
  );
}

export const ExitAssessmentPrintDocument = React.forwardRef<
  HTMLDivElement,
  ExitAssessmentPrintDocumentProps
>(function ExitAssessmentPrintDocument(
  {
    students,
    teacherName,
    exitDateLabel,
    readingPassMin,
    listeningPassMin,
    classIsAm,
    levelNumber,
    nextLevelNumber,
  },
  ref,
) {
  const pages = chunkPairs(students);

  return (
    <div ref={ref} className="ea-print-root bg-[#ddd] print:bg-white">
      <p className="ea-screen-hint print:hidden">
        Preview — use Print (save as PDF) for two students per letter page.
      </p>
      {pages.map((pair, pageIdx) => (
        <section key={pageIdx} className="ea-print-page" aria-label={`Page ${pageIdx + 1}`}>
          {pair.map(s => (
            <StudentSheet
              key={s.studentId}
              row={s}
              teacherName={teacherName}
              exitDateLabel={exitDateLabel}
              readingPassMin={readingPassMin}
              listeningPassMin={listeningPassMin}
              classIsAm={classIsAm}
              levelNumber={levelNumber}
              nextLevelNumber={nextLevelNumber}
            />
          ))}
        </section>
      ))}
    </div>
  );
});

ExitAssessmentPrintDocument.displayName = 'ExitAssessmentPrintDocument';
