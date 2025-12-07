import { Question, CreateQuestionInput, QuestionFilter } from './types.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

export class QuestionStore {
  private questions: Question[] = [];
  private readonly questionsFilePath?: string;
  public eventEmitter: EventEmitter = new EventEmitter();

  constructor() {
    this.questionsFilePath = process.env.QUESTIONS_FILE_PATH;
    this.loadFromFile();
  }

  createQuestion(input: CreateQuestionInput): Question {
    const question: Question = {
      id: `q-${uuidv4()}`,
      sender: input.sender,
      recipient: input.recipient,
      channels: input.channels || [],
      content: input.content,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    this.questions.push(question);
    this.saveToFile();

    this.eventEmitter.emit('question_created', question);
    this.eventEmitter.emit(`question:${question.id}`, question);

    console.log(`[QUESTION CREATE] Created question ${question.id} from ${question.sender} to ${question.recipient}`);

    return question;
  }

  answerQuestion(id: string, response: string): Question {
    const question = this.questions.find(q => q.id === id);
    if (!question) {
      throw new Error(`Question ${id} not found`);
    }

    if (question.status === 'answered') {
      throw new Error(`Question ${id} is already answered`);
    }

    question.status = 'answered';
    question.response = response;
    question.answeredAt = new Date().toISOString();

    this.saveToFile();

    this.eventEmitter.emit('question_answered', question);
    this.eventEmitter.emit(`answer:${id}`, response);

    console.log(`[QUESTION ANSWER] Answered question ${id}`);

    return question;
  }

  getQuestions(filter?: QuestionFilter): Question[] {
    let filtered = [...this.questions];

    if (filter?.sender) {
      filtered = filtered.filter(q => q.sender === filter.sender);
    }

    if (filter?.recipient) {
      filtered = filtered.filter(q => q.recipient === filter.recipient);
    }

    if (filter?.status) {
      filtered = filtered.filter(q => q.status === filter.status);
    }

    return filtered;
  }

  getQuestion(id: string): Question | undefined {
    return this.questions.find(q => q.id === id);
  }

  waitForAnswer(id: string, timeout?: number): Promise<string> {
    const question = this.getQuestion(id);
    if (!question) {
      return Promise.reject(new Error(`Question ${id} not found`));
    }

    if (question.status === 'answered') {
      return Promise.resolve(question.response!);
    }

    return new Promise((resolve, reject) => {
      const timer = timeout ? setTimeout(() => {
        this.eventEmitter.off(`answer:${id}`, onAnswer);
        reject(new Error(`Timeout waiting for answer to question ${id}`));
      }, timeout) : undefined;

      const onAnswer = (response: string) => {
        if (timer) clearTimeout(timer);
        resolve(response);
      };

      this.eventEmitter.once(`answer:${id}`, onAnswer);
    });
  }

  purge(): void {
    this.questions = [];
    this.saveToFile();
    console.log('[QUESTION PURGE] Cleared all questions');
  }

  private loadFromFile(): void {
    if (!this.questionsFilePath) {
      console.log('[QUESTION LOAD] File persistence disabled - questions will not be saved');
      return;
    }

    try {
      if (existsSync(this.questionsFilePath)) {
        const data = readFileSync(this.questionsFilePath, 'utf-8');
        const parsed = JSON.parse(data);

        if (Array.isArray(parsed)) {
          this.questions = parsed;
          console.log(`[QUESTION LOAD] Loaded ${this.questions.length} questions from ${this.questionsFilePath}`);
        } else {
          console.warn('[QUESTION LOAD] Invalid data format in questions file, starting fresh');
        }
      } else {
        console.log(`[QUESTION LOAD] Questions file not found at ${this.questionsFilePath}, starting with 0 questions`);
      }
    } catch (error) {
      console.error(`[QUESTION LOAD] Failed to load questions from file: ${error}`);
    }
  }

  private saveToFile(): void {
    if (!this.questionsFilePath) return;

    try {
      const dir = dirname(this.questionsFilePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(this.questionsFilePath, JSON.stringify(this.questions, null, 2), 'utf-8');
      console.log(`[QUESTION SAVE] Saved ${this.questions.length} questions to ${this.questionsFilePath}`);
    } catch (error) {
      console.error(`[QUESTION SAVE] Failed to save questions to file: ${error}`);
    }
  }

  saveQuestions(): void {
    if (!this.questionsFilePath) {
      console.log('[QUESTION SAVE] File persistence disabled - questions not saved');
      return;
    }
    this.saveToFile();
  }
}
