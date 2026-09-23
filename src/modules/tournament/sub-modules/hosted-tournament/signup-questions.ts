import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { SignUpQuestionEntity } from "./hosted-tournament.schema";

export const EXPERIENCE_QUESTION_ID = "experience";
export const DROPPED_BEFORE_QUESTION_ID = "droppedBefore";
export const DROPPED_WHY_QUESTION_ID = "droppedWhy";

export const DEFAULT_SIGNUP_QUESTIONS: SignUpQuestionEntity[] = [
  {
    id: EXPERIENCE_QUESTION_ID,
    label: "Experience",
    help: "How much experience do you have in draft?",
    type: "long",
    options: [],
    required: true,
    maxLength: 500,
    archived: false,
  },
  {
    id: DROPPED_BEFORE_QUESTION_ID,
    label: "Have you dropped from a league before?",
    type: "boolean",
    options: [],
    required: true,
    archived: false,
  },
  {
    id: DROPPED_WHY_QUESTION_ID,
    label: "Why?",
    type: "long",
    options: [],
    required: true,
    maxLength: 500,
    dependsOn: { questionId: DROPPED_BEFORE_QUESTION_ID, equals: "true" },
    archived: false,
  },
];

export type SubmittedAnswer = { questionId: string; values: string[] };

function first(answers: Map<string, string[]>, questionId: string): string {
  return answers.get(questionId)?.[0] ?? "";
}

export function isQuestionVisible(
  question: SignUpQuestionEntity,
  answers: Map<string, string[]>,
): boolean {
  if (!question.dependsOn) return true;
  return first(answers, question.dependsOn.questionId) === question.dependsOn.equals;
}

export function activeQuestions(
  questions: SignUpQuestionEntity[],
): SignUpQuestionEntity[] {
  return questions.filter((question) => !question.archived);
}

export function validateAnswers(
  questions: SignUpQuestionEntity[],
  submitted: SubmittedAnswer[] = [],
): SubmittedAnswer[] {
  const byId = new Map(submitted.map((entry) => [entry.questionId, entry.values]));
  const live = activeQuestions(questions);
  const known = new Set(live.map((question) => question.id));
  const accepted: SubmittedAnswer[] = [];

  for (const question of live) {
    if (!isQuestionVisible(question, byId)) continue;

    const values = (byId.get(question.id) ?? []).filter(
      (value) => value.trim().length > 0,
    );

    if (question.required && values.length === 0) {
      throw new PDZError(ErrorCodes.VALIDATION.MISSING_FIELD, {
        field: question.id,
        label: question.label,
      });
    }

    if (values.length === 0) continue;

    if (question.maxLength !== undefined) {
      for (const value of values) {
        if (value.length > question.maxLength) {
          throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
            field: question.id,
            maxLength: question.maxLength,
          });
        }
      }
    }

    if (question.type === "choice" || question.type === "multi") {
      const allowed = new Set(question.options);
      for (const value of values) {
        if (!allowed.has(value)) {
          throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
            field: question.id,
            value,
          });
        }
      }
    }

    if (question.type !== "multi" && values.length > 1) {
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
        field: question.id,
      });
    }

    accepted.push({ questionId: question.id, values });
  }

  for (const entry of submitted) {
    if (!known.has(entry.questionId)) {
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
        field: entry.questionId,
      });
    }
  }

  return accepted;
}

export function answerText(
  answers: SubmittedAnswer[] | undefined,
  questionId: string,
): string {
  const entry = (answers ?? []).find(
    (candidate) => candidate.questionId === questionId,
  );
  return entry?.values.join(", ") ?? "";
}

export function answerBool(
  answers: SubmittedAnswer[] | undefined,
  questionId: string,
): boolean {
  return answerText(answers, questionId) === "true";
}
