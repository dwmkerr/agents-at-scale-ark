'use client';

import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { formatAge } from '@/lib/utils/time';

interface Question {
  id: string;
  sender: string;
  recipient: string;
  channels: string[];
  content: string;
  status: 'pending' | 'answered';
  response?: string;
  createdAt: string;
  answeredAt?: string;
}

const BROKER_API_URL = process.env.NEXT_PUBLIC_BROKER_API_URL || 'http://localhost:8080';

export function QuestionsSection() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadQuestions = async () => {
    try {
      const response = await fetch(`${BROKER_API_URL}/questions`);
      if (!response.ok) {
        throw new Error('Failed to fetch questions');
      }
      const data = await response.json();
      setQuestions(data || []);
    } catch (error) {
      toast.error('Failed to Load Questions', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuestions();

    const eventSource = new EventSource(`${BROKER_API_URL}/questions/events`);

    eventSource.onmessage = (event) => {
      const question = JSON.parse(event.data) as Question;
      setQuestions(prev => {
        const existing = prev.find(q => q.id === question.id);
        if (existing) {
          return prev.map(q => q.id === question.id ? question : q);
        } else {
          return [question, ...prev];
        }
      });
    };

    eventSource.onerror = () => {
      console.error('SSE connection error');
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const handleSubmitAnswer = async () => {
    if (!selectedQuestion || !answerText.trim()) {
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${BROKER_API_URL}/questions/${selectedQuestion.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ response: answerText }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit answer');
      }

      const updatedQuestion = await response.json();
      setQuestions(prev => prev.map(q => q.id === updatedQuestion.id ? updatedQuestion : q));
      setSelectedQuestion(null);
      setAnswerText('');
      toast.success('Answer submitted successfully');
    } catch (error) {
      toast.error('Failed to Submit Answer', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="p-4">Loading...</div>;
  }

  if (selectedQuestion) {
    return (
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-3xl">
          <div className="mb-4">
            <Button variant="ghost" onClick={() => setSelectedQuestion(null)}>
              ← Back to Questions
            </Button>
          </div>
          <div className="rounded-lg border bg-card p-6">
            <div className="mb-4">
              <div className="text-sm text-muted-foreground">Question ID</div>
              <div className="font-mono text-sm">{selectedQuestion.id}</div>
            </div>
            <div className="mb-4">
              <div className="text-sm text-muted-foreground">From</div>
              <div className="text-sm">{selectedQuestion.sender}</div>
            </div>
            <div className="mb-4">
              <div className="text-sm text-muted-foreground">To</div>
              <div className="text-sm">{selectedQuestion.recipient}</div>
            </div>
            <div className="mb-4">
              <div className="text-sm text-muted-foreground">Created</div>
              <div className="text-sm">{formatAge(selectedQuestion.createdAt)}</div>
            </div>
            <div className="mb-6">
              <div className="mb-2 text-sm font-medium">Question</div>
              <div className="rounded border bg-muted p-4">{selectedQuestion.content}</div>
            </div>
            {selectedQuestion.status === 'answered' ? (
              <div>
                <div className="mb-2 text-sm font-medium">Answer</div>
                <div className="rounded border bg-muted p-4">{selectedQuestion.response}</div>
                <div className="mt-2 text-sm text-muted-foreground">
                  Answered {formatAge(selectedQuestion.answeredAt || '')}
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-2 text-sm font-medium">Your Answer</div>
                <textarea
                  className="w-full rounded border p-3 focus:outline-none focus:ring-2 focus:ring-primary"
                  rows={5}
                  value={answerText}
                  onChange={e => setAnswerText(e.target.value)}
                  placeholder="Type your answer here..."
                />
                <div className="mt-4 flex justify-end">
                  <Button onClick={handleSubmitAnswer} disabled={submitting || !answerText.trim()}>
                    {submitting ? 'Submitting...' : 'Submit Answer'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <Empty>
          <EmptyHeader>
            <EmptyMedia />
            <EmptyTitle>No Questions</EmptyTitle>
            <EmptyDescription>
              No questions have been asked yet. Questions will appear here when agents need user input.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => loadQuestions()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  const pendingQuestions = questions.filter(q => q.status === 'pending');
  const answeredQuestions = questions.filter(q => q.status === 'answered');

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-lg font-semibold">
            {pendingQuestions.length} Pending, {answeredQuestions.length} Answered
          </div>
          <Button variant="outline" onClick={() => loadQuestions()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>

        {pendingQuestions.length > 0 && (
          <div className="mb-8">
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">Pending Questions</h2>
            <div className="space-y-2">
              {pendingQuestions.map(question => (
                <div
                  key={question.id}
                  className="cursor-pointer rounded-lg border bg-card p-4 hover:bg-accent"
                  onClick={() => setSelectedQuestion(question)}>
                  <div className="mb-2 flex items-start justify-between">
                    <div className="font-mono text-sm text-muted-foreground">{question.id}</div>
                    <div className="rounded bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                      Pending
                    </div>
                  </div>
                  <div className="mb-2 line-clamp-2 text-sm">{question.content}</div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>From: {question.sender}</span>
                    <span>•</span>
                    <span>{formatAge(question.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {answeredQuestions.length > 0 && (
          <div>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">Answered Questions</h2>
            <div className="space-y-2">
              {answeredQuestions.map(question => (
                <div
                  key={question.id}
                  className="cursor-pointer rounded-lg border bg-card p-4 hover:bg-accent"
                  onClick={() => setSelectedQuestion(question)}>
                  <div className="mb-2 flex items-start justify-between">
                    <div className="font-mono text-sm text-muted-foreground">{question.id}</div>
                    <div className="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
                      Answered
                    </div>
                  </div>
                  <div className="mb-2 line-clamp-2 text-sm">{question.content}</div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>From: {question.sender}</span>
                    <span>•</span>
                    <span>Answered {formatAge(question.answeredAt || '')}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
