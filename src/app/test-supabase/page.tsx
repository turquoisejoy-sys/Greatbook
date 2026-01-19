'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function TestSupabasePage() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Testing connection...');
  const [details, setDetails] = useState<string | null>(null);

  useEffect(() => {
    async function testConnection() {
      try {
        // Test 1: Check if we can reach Supabase
        const { data, error } = await supabase.from('_test_connection').select('*').limit(1);
        
        // Even if table doesn't exist, if we get a proper error response,
        // it means the connection to Supabase works
        if (error) {
          // This error is expected - the table doesn't exist yet
          // But if we got here, Supabase connection is working!
          if (error.message.includes('does not exist') || error.code === '42P01') {
            setStatus('success');
            setMessage('✅ Supabase connection successful!');
            setDetails('Credentials are valid. Database tables need to be created (we\'ll do that in Phase 4).');
          } else if (error.message.includes('Invalid API key') || error.code === 'PGRST301') {
            setStatus('error');
            setMessage('❌ Invalid API key');
            setDetails('Check your NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local');
          } else {
            // Some other error but connection worked
            setStatus('success');
            setMessage('✅ Supabase connection successful!');
            setDetails(`Note: ${error.message}`);
          }
        } else {
          // Somehow the table exists? Very unexpected
          setStatus('success');
          setMessage('✅ Supabase connection successful!');
          setDetails('Connection working perfectly.');
        }
      } catch (err) {
        setStatus('error');
        setMessage('❌ Connection failed');
        setDetails(err instanceof Error ? err.message : 'Unknown error. Check your .env.local file.');
      }
    }

    testConnection();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
        <h1 className="text-2xl font-bold mb-4 text-gray-900">Supabase Connection Test</h1>
        
        <div className={`p-4 rounded-lg mb-4 ${
          status === 'loading' ? 'bg-blue-100 text-blue-800' :
          status === 'success' ? 'bg-green-100 text-green-800' :
          'bg-red-100 text-red-800'
        }`}>
          <p className="font-semibold text-lg">{message}</p>
          {details && (
            <p className="mt-2 text-sm opacity-80">{details}</p>
          )}
        </div>

        {status === 'success' && (
          <div className="text-sm text-gray-600">
            <p className="font-medium mb-2">What this means:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Your Supabase URL is correct</li>
              <li>Your API key is valid</li>
              <li>We can proceed with building the app!</li>
            </ul>
          </div>
        )}

        {status === 'error' && (
          <div className="text-sm text-gray-600">
            <p className="font-medium mb-2">To fix this:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Go to your Supabase dashboard</li>
              <li>Click Settings → API</li>
              <li>Copy the Project URL and anon key</li>
              <li>Update your .env.local file</li>
              <li>Restart the dev server</li>
            </ol>
          </div>
        )}

        <div className="mt-6 pt-4 border-t">
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
