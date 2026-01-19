'use client';

import { useState } from 'react';
import {
  parseCASASFileFromInput,
  parseAttendanceFileFromInput,
  parseTestsFileFromInput,
  CASASParseResult,
  AttendanceParseResult,
  TestsParseResult,
  calculateAttendancePercentage,
} from '@/lib/parsers';

type ParserType = 'casas' | 'attendance' | 'tests';

export default function TestParsersPage() {
  const [selectedParser, setSelectedParser] = useState<ParserType>('casas');
  const [casasResult, setCasasResult] = useState<CASASParseResult | null>(null);
  const [attendanceResult, setAttendanceResult] = useState<AttendanceParseResult | null>(null);
  const [testsResult, setTestsResult] = useState<TestsParseResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setCasasResult(null);
    setAttendanceResult(null);
    setTestsResult(null);

    try {
      switch (selectedParser) {
        case 'casas':
          const casas = await parseCASASFileFromInput(file);
          setCasasResult(casas);
          break;
        case 'attendance':
          const attendance = await parseAttendanceFileFromInput(file);
          setAttendanceResult(attendance);
          break;
        case 'tests':
          const tests = await parseTestsFileFromInput(file);
          setTestsResult(tests);
          break;
      }
    } catch (err) {
      console.error('Parse error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const clearResults = () => {
    setCasasResult(null);
    setAttendanceResult(null);
    setTestsResult(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">File Parser Test Page</h1>
        <p className="text-gray-600 mb-8">
          Test your Excel/CSV files to make sure they parse correctly before we build the full app.
        </p>

        {/* Parser Selection */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">1. Select Parser Type</h2>
          <div className="flex gap-4 flex-wrap">
            {[
              { id: 'casas', label: 'CASAS (Reading/Listening)', desc: 'Parses test results, auto-detects R/L' },
              { id: 'attendance', label: 'Attendance', desc: 'Parses hours, calculates %' },
              { id: 'tests', label: 'Unit Tests', desc: 'Parses test scores (0-100)' },
            ].map((parser) => (
              <button
                key={parser.id}
                onClick={() => { setSelectedParser(parser.id as ParserType); clearResults(); }}
                className={`flex-1 min-w-[200px] p-4 rounded-lg border-2 text-left transition-colors ${
                  selectedParser === parser.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="font-medium">{parser.label}</div>
                <div className="text-sm text-gray-500">{parser.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* File Upload */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">2. Upload File</h2>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-full file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100"
            />
            <p className="mt-2 text-sm text-gray-500">
              Accepts: .xlsx, .xls, .csv files
            </p>
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="bg-white rounded-lg shadow p-6 mb-6 text-center">
            <div className="animate-spin inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
            <p className="mt-2 text-gray-600">Parsing file...</p>
          </div>
        )}

        {/* CASAS Results */}
        {casasResult && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">CASAS Parse Results</h2>
            
            {casasResult.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded p-4 mb-4">
                <h3 className="font-medium text-red-800 mb-2">Errors</h3>
                <ul className="list-disc list-inside text-red-700 text-sm">
                  {casasResult.errors.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              </div>
            )}

            {casasResult.warnings.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-4">
                <h3 className="font-medium text-yellow-800 mb-2">Warnings ({casasResult.warnings.length})</h3>
                <ul className="list-disc list-inside text-yellow-700 text-sm max-h-40 overflow-y-auto">
                  {casasResult.warnings.map((warn, i) => <li key={i}>{warn}</li>)}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-blue-50 rounded p-4">
                <div className="text-2xl font-bold text-blue-700">{casasResult.reading.length}</div>
                <div className="text-sm text-blue-600">Reading Records</div>
              </div>
              <div className="bg-green-50 rounded p-4">
                <div className="text-2xl font-bold text-green-700">{casasResult.listening.length}</div>
                <div className="text-sm text-green-600">Listening Records</div>
              </div>
            </div>

            {(casasResult.reading.length > 0 || casasResult.listening.length > 0) && (
              <div className="space-y-4">
                {casasResult.reading.length > 0 && (
                  <div>
                    <h3 className="font-medium mb-2">Reading Records (first 10)</h3>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="px-3 py-2 text-left">Student</th>
                            <th className="px-3 py-2 text-left">Date</th>
                            <th className="px-3 py-2 text-left">Form</th>
                            <th className="px-3 py-2 text-left">Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {casasResult.reading.slice(0, 10).map((row, i) => (
                            <tr key={i} className="border-b">
                              <td className="px-3 py-2">{row.studentName}</td>
                              <td className="px-3 py-2">{row.date}</td>
                              <td className="px-3 py-2">{row.formNumber}</td>
                              <td className="px-3 py-2">{row.score ?? '*'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {casasResult.listening.length > 0 && (
                  <div>
                    <h3 className="font-medium mb-2">Listening Records (first 10)</h3>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="px-3 py-2 text-left">Student</th>
                            <th className="px-3 py-2 text-left">Date</th>
                            <th className="px-3 py-2 text-left">Form</th>
                            <th className="px-3 py-2 text-left">Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {casasResult.listening.slice(0, 10).map((row, i) => (
                            <tr key={i} className="border-b">
                              <td className="px-3 py-2">{row.studentName}</td>
                              <td className="px-3 py-2">{row.date}</td>
                              <td className="px-3 py-2">{row.formNumber}</td>
                              <td className="px-3 py-2">{row.score ?? '*'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Attendance Results */}
        {attendanceResult && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Attendance Parse Results</h2>
            
            {attendanceResult.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded p-4 mb-4">
                <h3 className="font-medium text-red-800 mb-2">Errors</h3>
                <ul className="list-disc list-inside text-red-700 text-sm">
                  {attendanceResult.errors.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              </div>
            )}

            {attendanceResult.warnings.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-4">
                <h3 className="font-medium text-yellow-800 mb-2">Warnings ({attendanceResult.warnings.length})</h3>
                <ul className="list-disc list-inside text-yellow-700 text-sm max-h-40 overflow-y-auto">
                  {attendanceResult.warnings.map((warn, i) => <li key={i}>{warn}</li>)}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-blue-50 rounded p-4">
                <div className="text-2xl font-bold text-blue-700">{attendanceResult.summary.totalRecords}</div>
                <div className="text-sm text-blue-600">Total Students</div>
              </div>
              <div className="bg-green-50 rounded p-4">
                <div className="text-2xl font-bold text-green-700">{attendanceResult.summary.averagePercentage.toFixed(1)}%</div>
                <div className="text-sm text-green-600">Average Attendance</div>
              </div>
              <div className="bg-red-50 rounded p-4">
                <div className="text-2xl font-bold text-red-700">{attendanceResult.summary.belowThreshold}</div>
                <div className="text-sm text-red-600">Below 60%</div>
              </div>
            </div>

            {attendanceResult.records.length > 0 && (
              <div>
                <h3 className="font-medium mb-2">Records (first 10)</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-3 py-2 text-left">Student</th>
                        <th className="px-3 py-2 text-left">Total Hrs</th>
                        <th className="px-3 py-2 text-left">Scheduled Hrs</th>
                        <th className="px-3 py-2 text-left">Percentage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendanceResult.records.slice(0, 10).map((row, i) => (
                        <tr key={i} className="border-b">
                          <td className="px-3 py-2">{row.studentName}</td>
                          <td className="px-3 py-2">{row.totalHours}</td>
                          <td className="px-3 py-2">{row.scheduledHours}</td>
                          <td className="px-3 py-2">
                            {calculateAttendancePercentage(row.totalHours, row.scheduledHours)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tests Results */}
        {testsResult && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Unit Tests Parse Results</h2>
            
            {testsResult.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded p-4 mb-4">
                <h3 className="font-medium text-red-800 mb-2">Errors</h3>
                <ul className="list-disc list-inside text-red-700 text-sm">
                  {testsResult.errors.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              </div>
            )}

            {testsResult.warnings.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-4">
                <h3 className="font-medium text-yellow-800 mb-2">Warnings ({testsResult.warnings.length})</h3>
                <ul className="list-disc list-inside text-yellow-700 text-sm max-h-40 overflow-y-auto">
                  {testsResult.warnings.map((warn, i) => <li key={i}>{warn}</li>)}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-blue-50 rounded p-4">
                <div className="text-2xl font-bold text-blue-700">{testsResult.summary.totalRecords}</div>
                <div className="text-sm text-blue-600">Total Students</div>
              </div>
              <div className="bg-green-50 rounded p-4">
                <div className="text-2xl font-bold text-green-700">{testsResult.summary.averageScore}%</div>
                <div className="text-sm text-green-600">Average Score</div>
              </div>
              <div className="bg-purple-50 rounded p-4">
                <div className="text-2xl font-bold text-purple-700">{testsResult.summary.excellent}</div>
                <div className="text-sm text-purple-600">Excellent (80%+)</div>
              </div>
            </div>

            {testsResult.records.length > 0 && (
              <div>
                <h3 className="font-medium mb-2">Records (first 10)</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-3 py-2 text-left">Student</th>
                        <th className="px-3 py-2 text-left">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {testsResult.records.slice(0, 10).map((row, i) => (
                        <tr key={i} className="border-b">
                          <td className="px-3 py-2">{row.studentName}</td>
                          <td className="px-3 py-2">{row.score}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Expected Column Names Reference */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Expected Column Names</h2>
          <p className="text-sm text-gray-600 mb-4">
            The parsers are flexible and accept various column name formats. Here are the expected columns for each type:
          </p>
          
          <div className="space-y-4 text-sm">
            <div>
              <h3 className="font-medium text-blue-700">CASAS Files</h3>
              <ul className="list-disc list-inside text-gray-600 ml-2">
                <li>Student Name (or &quot;Name&quot;, or &quot;First Name&quot; + &quot;Last Name&quot;)</li>
                <li>Date (or &quot;Test Date&quot;)</li>
                <li>Form (or &quot;Form Number&quot;) - must end in R or L to identify type</li>
                <li>Score (or &quot;Scale Score&quot;, &quot;Scaled Score&quot;)</li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-medium text-green-700">Attendance Files</h3>
              <ul className="list-disc list-inside text-gray-600 ml-2">
                <li>Student Name (or &quot;Name&quot;, or &quot;First Name&quot; + &quot;Last Name&quot;)</li>
                <li>Total Hours (or &quot;Total Hrs&quot;, &quot;Hours Attended&quot;)</li>
                <li>Scheduled Hours (or &quot;Scheduled Hrs&quot;, &quot;Sched Hrs&quot;)</li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-medium text-purple-700">Unit Test Files</h3>
              <ul className="list-disc list-inside text-gray-600 ml-2">
                <li>Student Name (or &quot;Name&quot;, or &quot;First Name&quot; + &quot;Last Name&quot;)</li>
                <li>Score (or &quot;Test Score&quot;, &quot;Grade&quot;, &quot;Points&quot;)</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-6 text-center">
          <a 
            href="/"
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            ← Back to Home
          </a>
        </div>
      </div>
    </div>
  );
}
