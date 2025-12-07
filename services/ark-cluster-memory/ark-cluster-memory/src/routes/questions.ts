import { Router } from 'express';
import { QuestionStore } from '../question-store.js';

export function createQuestionsRouter(questions: QuestionStore): Router {
  const router = Router();

  router.get('/questions', (req, res) => {
    const watch = req.query.watch === 'true';

    if (watch) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const onQuestionCreated = (question: any) => {
        res.write(`event: question_created\n`);
        res.write(`data: ${JSON.stringify(question)}\n\n`);
      };

      const onQuestionAnswered = (question: any) => {
        res.write(`event: question_answered\n`);
        res.write(`data: ${JSON.stringify(question)}\n\n`);
      };

      questions.eventEmitter.on('question_created', onQuestionCreated);
      questions.eventEmitter.on('question_answered', onQuestionAnswered);

      req.on('close', () => {
        questions.eventEmitter.off('question_created', onQuestionCreated);
        questions.eventEmitter.off('question_answered', onQuestionAnswered);
      });

      res.write(`event: connected\n`);
      res.write(`data: {}\n\n`);
      return;
    }

    try {
      const filter = {
        sender: req.query.sender as string | undefined,
        recipient: req.query.recipient as string | undefined,
        status: req.query.status as 'pending' | 'answered' | undefined
      };

      const results = questions.getQuestions(filter);
      res.json({ questions: results });
    } catch (error) {
      console.error('Failed to get questions:', error);
      const err = error as Error;
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/questions/:id', (req, res) => {
    try {
      const { id } = req.params;
      const question = questions.getQuestion(id);

      if (!question) {
        res.status(404).json({ error: 'Question not found' });
        return;
      }

      res.json(question);
    } catch (error) {
      console.error('Failed to get question:', error);
      const err = error as Error;
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/questions', (req, res) => {
    try {
      const { sender, recipient, channels, content } = req.body;

      if (!sender) {
        res.status(400).json({ error: 'sender is required' });
        return;
      }

      if (!recipient) {
        res.status(400).json({ error: 'recipient is required' });
        return;
      }

      if (!content) {
        res.status(400).json({ error: 'content is required' });
        return;
      }

      const question = questions.createQuestion({
        sender,
        recipient,
        channels: channels || [],
        content
      });

      res.status(201).json(question);
    } catch (error) {
      console.error('Failed to create question:', error);
      const err = error as Error;
      res.status(400).json({ error: err.message });
    }
  });

  router.patch('/questions/:id', (req, res) => {
    try {
      const { id } = req.params;
      const { response } = req.body;

      if (!response) {
        res.status(400).json({ error: 'response is required' });
        return;
      }

      const question = questions.answerQuestion(id, response);
      res.json(question);
    } catch (error) {
      console.error('Failed to answer question:', error);
      const err = error as Error;
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/questions', (req, res) => {
    questions.purge();
    res.json({ status: 'success', message: 'Questions purged' });
  });

  return router;
}
