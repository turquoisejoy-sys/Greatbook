'use client';

import { useState, useEffect, useRef } from 'react';
import { useApp } from '@/components/AppShell';
import { 
  getClasses, 
  updateClass, 
  exportAllData, 
  importAllData,
  DEFAULT_RANKING_WEIGHTS,
  DEFAULT_COLOR_THRESHOLDS,
} from '@/lib/storage';
import { Class, RankingWeights, ColorThresholds } from '@/types';
import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

export default function SettingsPage() {
  const { currentClassId, refreshClasses, mounted } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentClass, setCurrentClass] = useState<Class | null>(null);
  const [weights, setWeights] = useState<RankingWeights>(DEFAULT_RANKING_WEIGHTS);
  const [thresholds, setThresholds] = useState<ColorThresholds>(DEFAULT_COLOR_THRESHOLDS);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [importMessage, setImportMessage] = useState('');

  useEffect(() => {
    if (mounted && currentClassId) {
      const classes = getClasses();
      const cls = classes.find(c => c.id === currentClassId);
      if (cls) {
        setCurrentClass(cls);
        setWeights(cls.rankingWeights);
        setThresholds(cls.colorThresholds);
      }
    } else {
      setCurrentClass(null);
    }
  }, [mounted, currentClassId]);

  const handleWeightChange = (key: keyof RankingWeights, value: number) => {
    setWeights(prev => ({ ...prev, [key]: value }));
    setSaveStatus('idle');
  };

  const handleThresholdChange = (key: keyof ColorThresholds, value: number) => {
    setThresholds(prev => ({ ...prev, [key]: value }));
    setSaveStatus('idle');
  };

  const handleSaveClassSettings = () => {
    if (!currentClass) return;
    
    // Validate weights sum to 100
    const total = weights.casasReading + weights.casasListening + weights.tests + weights.attendance;
    if (total !== 100) {
      setSaveStatus('error');
      return;
    }

    // Validate thresholds
    if (thresholds.good <= thresholds.warning) {
      setSaveStatus('error');
      return;
    }

    updateClass(currentClass.id, {
      rankingWeights: weights,
      colorThresholds: thresholds,
    });
    refreshClasses();
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000);
  };

  const handleResetToDefaults = () => {
    setWeights(DEFAULT_RANKING_WEIGHTS);
    setThresholds(DEFAULT_COLOR_THRESHOLDS);
    setSaveStatus('idle');
  };

  const handleExport = () => {
    const data = exportAllData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gradebook-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const confirmImport = confirm(
      'WARNING: Importing will REPLACE all your current data with the backup file. ' +
      'This cannot be undone. Are you sure you want to continue?'
    );
    
    if (!confirmImport) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    try {
      const text = await file.text();
      const success = importAllData(text);
      
      if (success) {
        setImportStatus('success');
        setImportMessage('Data imported successfully! Refreshing...');
        refreshClasses();
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        setImportStatus('error');
        setImportMessage('Failed to import data. The file may be corrupted or invalid.');
      }
    } catch {
      setImportStatus('error');
      setImportMessage('Failed to read the file. Please try again.');
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const weightsTotal = weights.casasReading + weights.casasListening + weights.tests + weights.attendance;

  if (!mounted) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-32 mb-8"></div>
          <div className="h-64 bg-gray-200 rounded mb-4"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-[var(--cace-navy)]">Settings</h1>
        <p className="text-gray-600 mt-1">Configure class settings and manage your data</p>
      </div>

      {/* Class Settings */}
      <div className="card">
        <h2 className="text-xl font-semibold text-[var(--cace-navy)] mb-4">
          Class Settings
        </h2>
        
        {!currentClass ? (
          <div className="text-center py-8 text-gray-500">
            <p>Select a class from the Dashboard to edit its settings</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-600">
                Editing settings for: <span className="font-semibold text-[var(--cace-navy)]">{currentClass.name}</span>
              </p>
            </div>

            {/* Ranking Weights */}
            <div>
              <h3 className="font-medium text-gray-900 mb-3">Ranking Weights</h3>
              <p className="text-sm text-gray-500 mb-4">
                Adjust how much each category contributes to the overall student score. Must total 100%.
              </p>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    CASAS Reading
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={weights.casasReading}
                      onChange={e => handleWeightChange('casasReading', parseInt(e.target.value) || 0)}
                      className="input w-20 text-center"
                      min="0"
                      max="100"
                    />
                    <span className="text-gray-500">%</span>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    CASAS Listening
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={weights.casasListening}
                      onChange={e => handleWeightChange('casasListening', parseInt(e.target.value) || 0)}
                      className="input w-20 text-center"
                      min="0"
                      max="100"
                    />
                    <span className="text-gray-500">%</span>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Unit Tests
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={weights.tests}
                      onChange={e => handleWeightChange('tests', parseInt(e.target.value) || 0)}
                      className="input w-20 text-center"
                      min="0"
                      max="100"
                    />
                    <span className="text-gray-500">%</span>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Attendance
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={weights.attendance}
                      onChange={e => handleWeightChange('attendance', parseInt(e.target.value) || 0)}
                      className="input w-20 text-center"
                      min="0"
                      max="100"
                    />
                    <span className="text-gray-500">%</span>
                  </div>
                </div>
              </div>

              <div className={`mt-3 text-sm font-medium ${weightsTotal === 100 ? 'text-green-600' : 'text-red-600'}`}>
                Total: {weightsTotal}% {weightsTotal !== 100 && '(must equal 100%)'}
              </div>
            </div>

            {/* Color Thresholds */}
            <div className="pt-4 border-t">
              <h3 className="font-medium text-gray-900 mb-3">Color Thresholds</h3>
              <p className="text-sm text-gray-500 mb-4">
                Set the percentage cutoffs for color coding. Scores at or above "Good" show green, 
                at or above "Warning" show yellow, below show red.
              </p>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <span className="inline-block w-3 h-3 rounded bg-green-500 mr-2"></span>
                    Good (Green)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={thresholds.good}
                      onChange={e => handleThresholdChange('good', parseInt(e.target.value) || 0)}
                      className="input w-20 text-center"
                      min="0"
                      max="100"
                    />
                    <span className="text-gray-500">% and above</span>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <span className="inline-block w-3 h-3 rounded bg-yellow-500 mr-2"></span>
                    Warning (Yellow)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={thresholds.warning}
                      onChange={e => handleThresholdChange('warning', parseInt(e.target.value) || 0)}
                      className="input w-20 text-center"
                      min="0"
                      max="100"
                    />
                    <span className="text-gray-500">% and above</span>
                  </div>
                </div>
              </div>

              {thresholds.good <= thresholds.warning && (
                <p className="mt-3 text-sm text-red-600">
                  "Good" threshold must be higher than "Warning" threshold
                </p>
              )}

              <p className="mt-3 text-sm text-gray-500">
                <span className="inline-block w-3 h-3 rounded bg-red-500 mr-2"></span>
                Below {thresholds.warning}% shows as red (Needs Improvement)
              </p>
            </div>

            {/* Save Buttons */}
            <div className="pt-4 border-t flex items-center gap-3">
              <button
                onClick={handleSaveClassSettings}
                disabled={weightsTotal !== 100 || thresholds.good <= thresholds.warning}
                className="btn btn-primary disabled:opacity-50"
              >
                Save Settings
              </button>
              <button
                onClick={handleResetToDefaults}
                className="btn btn-secondary"
              >
                Reset to Defaults
              </button>
              
              {saveStatus === 'saved' && (
                <span className="flex items-center gap-1 text-green-600 text-sm">
                  <CheckCircleIcon className="w-5 h-5" />
                  Saved!
                </span>
              )}
              {saveStatus === 'error' && (
                <span className="flex items-center gap-1 text-red-600 text-sm">
                  <ExclamationTriangleIcon className="w-5 h-5" />
                  Please fix errors above
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Data Backup */}
      <div className="card">
        <h2 className="text-xl font-semibold text-[var(--cace-navy)] mb-4">
          Data Backup
        </h2>
        <p className="text-gray-600 mb-6">
          Export your data to a backup file or restore from a previous backup. 
          Your data is stored locally in this browser - backing up regularly is recommended.
        </p>

        <div className="flex flex-wrap gap-4">
          <button
            onClick={handleExport}
            className="btn btn-secondary"
          >
            <ArrowDownTrayIcon className="w-5 h-5" />
            Export Backup
          </button>
          
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportFile}
            accept=".json"
            className="hidden"
          />
          <button
            onClick={handleImportClick}
            className="btn btn-secondary"
          >
            <ArrowUpTrayIcon className="w-5 h-5" />
            Import Backup
          </button>
        </div>

        {importStatus !== 'idle' && (
          <div className={`mt-4 p-3 rounded-lg ${
            importStatus === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}>
            {importMessage}
          </div>
        )}

        <div className="mt-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
          <div className="flex gap-2">
            <ExclamationTriangleIcon className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <p className="font-medium">Important Notes:</p>
              <ul className="mt-1 list-disc list-inside space-y-1">
                <li>Your data is stored in this browser only</li>
                <li>Clearing browser data will delete your gradebook</li>
                <li>Export regularly to avoid data loss</li>
                <li>Importing will replace ALL current data</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* About */}
      <div className="card">
        <h2 className="text-xl font-semibold text-[var(--cace-navy)] mb-4">
          About
        </h2>
        <div className="text-gray-600 space-y-2">
          <p><strong>CACE Gradebook</strong></p>
          <p>Built for Campbell Adult and Community Education</p>
          <p className="text-sm text-gray-500 italic">"A World of Opportunity"</p>
        </div>
      </div>
    </div>
  );
}
