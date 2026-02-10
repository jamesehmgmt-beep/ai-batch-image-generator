'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ClarifyingQuestion } from '@/lib/types/job';
import { HelpCircle } from 'lucide-react';

interface ClarifyingQuestionsProps {
  questions: ClarifyingQuestion[];
  onAnswer: (answer: string) => void;
  disabled?: boolean;
}

export function ClarifyingQuestions({
  questions,
  onAnswer,
  disabled = false,
}: ClarifyingQuestionsProps) {
  if (questions.length === 0) return null;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-primary" />
          I need some clarification
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {questions.map((q, index) => (
          <div key={index} className="space-y-2">
            <p className="text-sm font-medium">{q.question}</p>
            {q.context && (
              <p className="text-xs text-muted-foreground">{q.context}</p>
            )}
            {q.options && q.options.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {q.options.map((option, optIndex) => (
                  <Button
                    key={optIndex}
                    variant="outline"
                    size="sm"
                    onClick={() => onAnswer(option)}
                    disabled={disabled}
                    className="text-xs"
                  >
                    {option}
                  </Button>
                ))}
              </div>
            )}
          </div>
        ))}
        <p className="text-xs text-muted-foreground mt-2">
          Click an option above or type your own answer below
        </p>
      </CardContent>
    </Card>
  );
}
