'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

export default function AgentPlayground() {
  const [convId, setConvId] = useState<string>();
  const [buffer, setBuffer] = useState<any[]>([]);
  const [instruction, setInstruction] = useState<string>('');
  const [delay, setDelay] = useState<number>(500);
  const [isRunning, setIsRunning] = useState(false);

  const startAgent = async (mode: 'step' | 'continuous') => {
    if (!instruction.trim()) return;
    
    setIsRunning(true);
    setBuffer([]);
    
    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          convId, 
          instruction: instruction.trim(), 
          mode, 
          delayMs: delay 
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to start agent');
      }

      // Get the conversation ID from the response
      const newConvId = res.headers.get('x-conversation-id') || crypto.randomUUID();
      setConvId(newConvId);

      // For now, just add a success message
      setBuffer([{ type: 'text', text: 'Agent started successfully' }]);
    } catch (error) {
      console.error('Failed to start agent:', error);
      setBuffer([{ type: 'error', error: String(error) }]);
    } finally {
      setIsRunning(false);
    }
  };

  const nextStep = async () => {
    if (!convId) return;
    await startAgent('step');
  };

  const resetComputer = async () => {
    try {
      await fetch('/api/reset', { method: 'POST' });
      setBuffer([]);
      setConvId(undefined);
    } catch (error) {
      console.error('Failed to reset computer:', error);
    }
  };

  const stopAgent = () => {
    setIsRunning(false);
  };

  const renderEvent = (event: any, index: number) => {
    switch (event.type) {
      case 'text':
        return (
          <div key={index} className="mb-2">
            <Badge variant="secondary" className="mb-1">Text</Badge>
            <p className="text-sm">{event.text}</p>
          </div>
        );
      case 'tool_use':
        return (
          <div key={index} className="mb-2">
            <Badge variant="outline" className="mb-1">Action</Badge>
            <p className="text-sm font-mono">{event.action}</p>
          </div>
        );
      case 'thinking':
        return (
          <div key={index} className="mb-2">
            <Badge variant="default" className="mb-1">Thinking</Badge>
            <p className="text-sm italic">{event.thinking}</p>
          </div>
        );
      case 'error':
        return (
          <div key={index} className="mb-2">
            <Badge variant="destructive" className="mb-1">Error</Badge>
            <p className="text-sm text-red-600">{event.error}</p>
          </div>
        );
      default:
        return (
          <div key={index} className="mb-2">
            <Badge variant="secondary" className="mb-1">{event.type}</Badge>
            <pre className="text-xs">{JSON.stringify(event, null, 2)}</pre>
          </div>
        );
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Claude Agent Playground</CardTitle>
          <CardDescription>
            Control Claude's desktop automation with step-by-step or continuous execution
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Instruction</label>
            <Textarea
              placeholder="Enter your instruction for Claude..."
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Delay between actions: {delay}ms</label>
            <Slider
              value={[delay]}
              onValueChange={(value) => setDelay(value[0])}
              min={100}
              max={2000}
              step={100}
              className="w-full"
            />
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button 
              onClick={() => startAgent('step')} 
              disabled={isRunning || !instruction.trim()}
            >
              Run One Step
            </Button>
            <Button 
              onClick={() => startAgent('continuous')} 
              disabled={isRunning || !instruction.trim()}
              variant="default"
            >
              Run Continuously
            </Button>
            <Button 
              onClick={nextStep} 
              disabled={isRunning || !convId}
              variant="outline"
            >
              Next Step
            </Button>
            <Button 
              onClick={stopAgent} 
              disabled={!isRunning}
              variant="destructive"
            >
              Stop
            </Button>
            <Button 
              onClick={resetComputer} 
              variant="secondary"
            >
              Reset Computer
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Event Stream</CardTitle>
          <CardDescription>
            Real-time events from Claude's execution
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-96 overflow-y-auto space-y-2">
            {buffer.length === 0 ? (
              <p className="text-muted-foreground text-sm">No events yet. Start the agent to see events here.</p>
            ) : (
              buffer.map((event, index) => renderEvent(event, index))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 