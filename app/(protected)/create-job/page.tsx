'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PromptInput } from '@/components/job/prompt-input';
import { Conversation } from '@/components/job/conversation';
import { ClarifyingQuestions } from '@/components/job/clarifying-questions';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useJobContext } from '@/lib/session/job-context';
import type { ClarifyingQuestion, ConversationMessage, ParsedJob, FolderOperation } from '@/lib/types/job';
import { ArrowLeft, FolderOpen, RotateCcw, Globe, Folders, Folder } from 'lucide-react';
import Link from 'next/link';

export default function CreateJobPage() {
  const router = useRouter();
  const {
    folders,
    fileCountByFolder,
    messages,
    setMessages,
    conversationState,
    setConversationState,
    parsedJob,
    setParsedJob,
  } = useJobContext();

  const [isLoading, setIsLoading] = useState(false);
  const [clarifyingQuestions, setClarifyingQuestions] = useState<ClarifyingQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [promptMode, setPromptMode] = useState<'global' | 'per-folder'>('global');
  const [folderPrompts, setFolderPrompts] = useState<Record<string, string>>({});

  // Redirect if no folders uploaded
  useEffect(() => {
    if (folders.length === 0) {
      router.push('/upload');
    }
  }, [folders, router]);

  const sendToAI = useCallback(async (userMessage: string) => {
    // Add user message to history
    const newMessages: ConversationMessage[] = [
      ...messages,
      { role: 'user', content: userMessage },
    ];
    setMessages(newMessages);
    setIsLoading(true);
    setConversationState('parsing');
    setError(null);
    setClarifyingQuestions([]);

    try {
      const response = await fetch('/api/ai/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          folders,
          fileCountByFolder,
          promptMode,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to parse prompt');
      }

      const data = await response.json();
      const parsed: ParsedJob = data.parsed;

      // Add AI response to messages
      const aiContent = parsed.interpretation ||
        (parsed.understood
          ? 'I understand your request. Here\'s what I\'ll do:'
          : 'I need some clarification.');

      setMessages([...newMessages, { role: 'assistant', content: aiContent }]);
      setParsedJob(parsed);

      if (parsed.understood && parsed.job) {
        // AI understood - show confirmation
        setConversationState('awaiting_confirmation');
      } else if (parsed.clarifyingQuestions && parsed.clarifyingQuestions.length > 0) {
        // AI needs clarification
        setConversationState('clarifying');
        setClarifyingQuestions(parsed.clarifyingQuestions);
      } else {
        // Unexpected state - ask for more info
        setConversationState('clarifying');
        setClarifyingQuestions([{
          question: 'Could you provide more details about what you\'d like to do?',
        }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setConversationState('awaiting_prompt');
    } finally {
      setIsLoading(false);
    }
  }, [messages, folders, fileCountByFolder, setMessages, setParsedJob, setConversationState]);

  const handlePromptSubmit = useCallback((prompt: string) => {
    sendToAI(prompt);
  }, [sendToAI]);

  const handleClarificationAnswer = useCallback((answer: string) => {
    sendToAI(answer);
  }, [sendToAI]);

  const handleConfirm = useCallback(() => {
    setConversationState('confirmed');
    // Navigate to job review page - parsedJob is already in context
    router.push('/job/review');
  }, [router, setConversationState]);

  const handleEdit = useCallback(() => {
    setConversationState('editing');
    // Navigate to edit on review page
    router.push('/job/review');
  }, [router, setConversationState]);

  const handleStartOver = useCallback(() => {
    setMessages([]);
    setParsedJob(null);
    setClarifyingQuestions([]);
    setError(null);
    setFolderPrompts({});
    setConversationState('awaiting_prompt');
  }, [setMessages, setParsedJob, setConversationState]);

  // Handle per-folder prompt changes
  const handleFolderPromptChange = useCallback((folderPath: string, prompt: string) => {
    setFolderPrompts(prev => ({ ...prev, [folderPath]: prompt }));
  }, []);

  // Handle per-folder mode continue - sends prompts to Claude for analysis
  const handlePerFolderContinue = useCallback(async () => {
    // Check if all folders have prompts
    const missingPrompts = folders.filter(f => !folderPrompts[f]?.trim());
    if (missingPrompts.length > 0) {
      setError(`Please enter prompts for all folders. Missing: ${missingPrompts.join(', ')}`);
      return;
    }
    setError(null);
    setIsLoading(true);
    setConversationState('parsing');

    // Build a message describing each folder's prompt for Claude to analyze
    const folderDescriptions = folders.map(folderPath =>
      `Folder "${folderPath}": ${folderPrompts[folderPath]}`
    ).join('\n');

    const userMessage = `Per-folder prompts:\n${folderDescriptions}`;

    // Add user message to history
    const newMessages: ConversationMessage[] = [
      ...messages,
      { role: 'user', content: userMessage },
    ];
    setMessages(newMessages);

    try {
      // Send to AI for analysis - Claude will refine prompts and infer photo mode
      const response = await fetch('/api/ai/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          folders,
          fileCountByFolder,
          promptMode: 'per-folder',
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to analyze prompts');
      }

      const data = await response.json();
      const parsed: ParsedJob = data.parsed;

      // Add AI response to messages
      const aiContent = parsed.interpretation ||
        (parsed.understood
          ? 'I\'ve analyzed your per-folder prompts. Here\'s what I\'ll do:'
          : 'I need some clarification about your prompts.');

      setMessages([...newMessages, { role: 'assistant', content: aiContent }]);
      setParsedJob(parsed);

      if (parsed.understood && parsed.job) {
        // AI understood - show confirmation
        setConversationState('awaiting_confirmation');
      } else if (parsed.clarifyingQuestions && parsed.clarifyingQuestions.length > 0) {
        // AI needs clarification
        setConversationState('clarifying');
        setClarifyingQuestions(parsed.clarifyingQuestions);
      } else {
        // Unexpected state - ask for more info
        setConversationState('clarifying');
        setClarifyingQuestions([{
          question: 'Could you provide more details about what you\'d like to do?',
        }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setConversationState('awaiting_prompt');
    } finally {
      setIsLoading(false);
    }
  }, [folders, folderPrompts, messages, fileCountByFolder, setMessages, setParsedJob, setConversationState]);

  // Show loading/redirect state if no folders
  if (folders.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">Please upload images first.</p>
            <Link href="/upload">
              <Button className="mt-4">Go to Upload</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/upload">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h2 className="text-2xl font-bold">Create Generation Job</h2>
          <p className="text-muted-foreground">
            Describe what you want to do with your uploaded images
          </p>
        </div>
        {/* Clear context button - always visible when there's conversation history */}
        {messages.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleStartOver}
            className="gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            Clear Context
          </Button>
        )}
      </div>

      {/* Uploaded folders summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FolderOpen className="w-4 h-4" />
            Uploaded Folders
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {folders.map(folder => (
              <div
                key={folder}
                className="px-3 py-1.5 bg-muted rounded-md text-sm"
              >
                <span className="font-medium">{folder}</span>
                <span className="text-muted-foreground ml-2">
                  ({fileCountByFolder[folder]} images)
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Prompt Mode Selector - only show when awaiting prompt */}
      {conversationState === 'awaiting_prompt' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">How do you want to enter your prompts?</CardTitle>
            <CardDescription>
              Choose between a single prompt for all folders or individual prompts per folder
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={promptMode} onValueChange={(v) => setPromptMode(v as 'global' | 'per-folder')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="global" className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  Global Prompt
                </TabsTrigger>
                <TabsTrigger value="per-folder" className="flex items-center gap-2">
                  <Folders className="h-4 w-4" />
                  Per-Folder Prompts
                </TabsTrigger>
              </TabsList>
              <div className="mt-4 text-sm text-muted-foreground">
                {promptMode === 'global' ? (
                  <p>Write one prompt and AI will parse it to understand what to do with each folder.</p>
                ) : (
                  <p>Enter a separate prompt for each folder. More control, no AI parsing needed.</p>
                )}
              </div>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Per-Folder Prompts UI */}
      {promptMode === 'per-folder' && conversationState === 'awaiting_prompt' && (
        <Card>
          <CardHeader>
            <CardTitle>Per-Folder Prompts</CardTitle>
            <CardDescription>
              Enter a specific prompt for each folder
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Error display */}
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {/* Per-folder inputs */}
            <div className="space-y-4">
              {folders.map(folderPath => (
                <Card key={folderPath} className="bg-muted/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Folder className="h-4 w-4" />
                      {folderPath}
                      <Badge variant="secondary">{fileCountByFolder[folderPath]} images</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={folderPrompts[folderPath] || ''}
                      onChange={(e) => handleFolderPromptChange(folderPath, e.target.value)}
                      placeholder={`What do you want to do with images in "${folderPath}"?`}
                      className="min-h-[80px] resize-none"
                    />
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Continue button */}
            <div className="flex gap-2 pt-4 border-t">
              <Button onClick={handlePerFolderContinue}>
                Continue to Review
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Global Prompt Conversation UI */}
      {(promptMode === 'global' || conversationState !== 'awaiting_prompt') && (
        <Card>
          <CardHeader>
            <CardTitle>
              {promptMode === 'global' && conversationState === 'awaiting_prompt'
                ? 'Enter Your Prompt'
                : 'Conversation'}
            </CardTitle>
            <CardDescription>
              {conversationState === 'awaiting_prompt' && 'Tell AI what you want to do with your images'}
              {conversationState === 'parsing' && 'Analyzing your request...'}
              {conversationState === 'clarifying' && 'Please answer my questions to continue'}
              {conversationState === 'awaiting_confirmation' && 'Review and confirm the job'}
              {conversationState === 'editing' && 'Editing the job details'}
              {conversationState === 'confirmed' && 'Job confirmed, redirecting...'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Message history */}
            <Conversation messages={messages} isLoading={isLoading} />

            {/* Error display */}
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {/* Clarifying questions */}
            {conversationState === 'clarifying' && clarifyingQuestions.length > 0 && (
              <ClarifyingQuestions
                questions={clarifyingQuestions}
                onAnswer={handleClarificationAnswer}
                disabled={isLoading}
              />
            )}

            {/* Job summary when confirmed */}
            {conversationState === 'awaiting_confirmation' && parsedJob?.job && (
              <Card className="bg-muted/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Parsed Job Summary</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  <p><strong>Total operations:</strong> {parsedJob.job.folders.length} folder(s)</p>
                  <div className="space-y-1">
                    {parsedJob.job.folders.map((op, idx) => (
                      <div key={idx} className="text-muted-foreground">
                        <span className="font-medium text-foreground">{op.folderPath}</span>
                        : {op.operation}
                        {op.photoMode === 'reference' && ' (reference mode)'}
                        {op.excludedFiles && op.excludedFiles.length > 0 && (
                          <span className="text-xs ml-1">
                            (excluding: {op.excludedFiles.join(', ')})
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  {parsedJob.job.globalPrompt && (
                    <p><strong>Global prompt:</strong> {parsedJob.job.globalPrompt}</p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Confirmation buttons */}
            {conversationState === 'awaiting_confirmation' && parsedJob?.job && (
              <div className="flex gap-2 pt-4 border-t">
                <Button onClick={handleConfirm}>
                  Looks Good - Continue
                </Button>
                <Button variant="outline" onClick={handleEdit}>
                  Edit Job
                </Button>
                <Button variant="ghost" onClick={handleStartOver}>
                  Start Over
                </Button>
              </div>
            )}

            {/* Prompt input - show for global mode awaiting prompt OR during clarification (any mode) */}
            {(promptMode === 'global' && conversationState === 'awaiting_prompt') && (
              <PromptInput
                onSubmit={handlePromptSubmit}
                isLoading={isLoading}
                placeholder='e.g., "for folder 5, swap faces to Arab women except no.jpg"'
              />
            )}

            {/* Always show input during clarification to allow user responses */}
            {conversationState === 'clarifying' && (
              <PromptInput
                onSubmit={handleClarificationAnswer}
                isLoading={isLoading}
                placeholder="Type your answer..."
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
