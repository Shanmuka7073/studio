
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// We need to dynamically import Firebase on the client
import { initializeApp, getApps, deleteApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query } from 'firebase/firestore';

const initialConfig = `{
  "apiKey": "AIzaSyDs4dpNyeU1u-SY5lU0qCgGrOSeRBLqLiE",
  "authDomain": "notification-3ae98.firebaseapp.com",
  "projectId": "notification-3ae98",
  "storageBucket": "notification-3ae98.appspot.com",
  "messagingSenderId": "1044165231953",
  "appId": "1:1044165231953:web:a17cc6638cdce72cdabf70",
  "measurementId": "G-K83S995J6B"
}`;

export default function FirebaseCheckerPage() {
  const [configStr, setConfigStr] = useState(initialConfig);
  const [collectionPath, setCollectionPath] = useState('users');
  const [log, setLog] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const addLog = (message: string) => {
    setLog(prev => [`[${new Date().toLocaleTimeString()}] ${message}`, ...prev]);
  };

  const handleTestRead = async () => {
    setIsLoading(true);
    setLog([]);
    addLog('Starting test...');

    let firebaseConfig;
    try {
      firebaseConfig = JSON.parse(configStr);
      addLog(`Parsed config for projectId: ${firebaseConfig.projectId}`);
    } catch (e) {
      addLog('Error: Invalid JSON in Firebase config.');
      setIsLoading(false);
      return;
    }

    if (!collectionPath) {
      addLog('Error: Please enter a collection path to test.');
      setIsLoading(false);
      return;
    }

    // A name for our temporary Firebase app instance
    const APP_NAME = 'firebase-checker-app';

    try {
      // Clean up any previous instances of our test app
      const existingApps = getApps();
      const oldApp = existingApps.find(app => app.name === APP_NAME);
      if (oldApp) {
        await deleteApp(oldApp);
        addLog('Cleaned up previous test app instance.');
      }

      // Initialize a new temporary app
      const testApp = initializeApp(firebaseConfig, APP_NAME);
      addLog('Initialized temporary Firebase app.');

      const db = getFirestore(testApp);
      addLog(`Attempting to read from collection: '${collectionPath}'...`);

      // Create a query to read the first document from the collection
      const testQuery = query(collection(db, collectionPath), limit(1));
      
      const querySnapshot = await getDocs(testQuery);

      addLog('--- RESULT ---');
      if (querySnapshot.empty) {
        addLog('SUCCESS: Request was allowed, but the collection is empty or does not exist.');
      } else {
        addLog(`SUCCESS: Read ${querySnapshot.size} document(s).`);
        querySnapshot.forEach((doc) => {
            addLog(`Document ID: ${doc.id}`);
            addLog(`Data: ${JSON.stringify(doc.data(), null, 2)}`);
        });
      }
      addLog('----------------');


    } catch (error: any) {
      addLog('--- RESULT ---');
      if (error.code === 'permission-denied' || error.code === 'failed-precondition') {
          addLog(`FAILURE: Request was blocked by Firebase Security Rules.`);
          addLog(`Error Message: ${error.message}`);
      } else {
          addLog(`An unexpected error occurred: ${error.message}`);
      }
      addLog('----------------');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-12 px-4 md:px-6">
      <h1 className="text-4xl font-bold font-headline mb-4">Firebase Security Checker</h1>
      <p className="text-muted-foreground mb-8">An educational tool to test if a Firebase project allows public read access to a collection.</p>
      
      <div className="grid md:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
            <CardDescription>
                Enter the public `firebaseConfig` of the project you want to test.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
                <Label htmlFor="firebase-config">Firebase Config</Label>
                <Textarea
                    id="firebase-config"
                    value={configStr}
                    onChange={(e) => setConfigStr(e.target.value)}
                    className="w-full h-64 font-mono text-xs"
                    placeholder="Paste your Firebase config JSON here..."
                />
            </div>
             <div>
                <Label htmlFor="collection-path">Collection Path</Label>
                <Input
                    id="collection-path"
                    value={collectionPath}
                    onChange={(e) => setCollectionPath(e.target.value)}
                    placeholder="e.g., users"
                />
             </div>
            <Button onClick={handleTestRead} disabled={isLoading} className="w-full">
              {isLoading ? 'Testing...' : 'Run Public Read Test'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Test Log</CardTitle>
            <CardDescription>Results of the connection and read attempt will appear here.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="w-full h-96 bg-muted rounded-md p-4 overflow-auto text-xs font-mono">
              {log.join('\\n')}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

    