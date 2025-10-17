'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';

const initialCode = `<!-- Edit the code here and see it live! -->
<style>
  .greeting {
    font-family: sans-serif;
    padding: 1rem;
    background-color: hsl(var(--primary) / 0.1);
    border: 1px solid hsl(var(--primary));
    border-radius: 0.5rem;
    color: hsl(var(--foreground));
  }
  .greeting-button {
    margin-top: 1rem;
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 0.25rem;
    background-color: hsl(var(--accent));
    cursor: pointer;
  }
</style>

<div class="greeting">
  <h1>Hello from the Live Editor!</h1>
  <p>You can write HTML and CSS here.</p>
  <button id="alertButton" class="greeting-button">Click Me</button>
</div>

<script>
  document.getElementById('alertButton').addEventListener('click', () => {
    alert('You clicked the button!');
  });
</script>
`;

export default function LiveEditorPage() {
  const [code, setCode] = useState(initialCode);

  return (
    <div className="container mx-auto py-12 px-4 md:px-6">
      <h1 className="text-4xl font-bold font-headline mb-8">Browser Live Editor</h1>
      <p className="text-muted-foreground mb-8">This page is an educational tool. The code you write here is only run in your browser and is not saved to the server.</p>
      <div className="grid md:grid-cols-2 gap-8 h-[60vh]">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Code Input</CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            <Textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full h-full resize-none font-mono text-sm"
              placeholder="Type your HTML, CSS, and JS here..."
            />
          </CardContent>
        </Card>
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Live Preview</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto">
             <div
                dangerouslySetInnerHTML={{ __html: code }}
                className="w-full h-full"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
