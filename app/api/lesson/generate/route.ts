import { after, type NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { type GenerateClassroomInput } from '@/lib/server/classroom-generation';
import { runClassroomGenerationJob } from '@/lib/server/classroom-job-runner';
import { createClassroomGenerationJob } from '@/lib/server/classroom-job-store';
import { buildRequestOrigin } from '@/lib/server/classroom-storage';
import { createLogger } from '@/lib/logger';

const log = createLogger('LessonGenerate API');

export const maxDuration = 30;

type LessonGenerateRequest = {
  mode?: 'question_only' | 'question_with_answer';
  question?: string;
  answer?: string;
  language?: 'zh-CN' | 'en-US';
  enableWebSearch?: boolean;
  enableTTS?: boolean;
  audience?: string;
  durationMinutes?: number;
  style?: string;
};

function buildRequirement(input: LessonGenerateRequest): string {
  const mode = input.mode ?? (input.answer ? 'question_with_answer' : 'question_only');
  const question = input.question?.trim() ?? '';
  const answer = input.answer?.trim() ?? '';

  const sections: string[] = [];
  sections.push('请基于以下信息生成结构化课堂内容：');
  sections.push(`- 模式：${mode}`);
  if (question) sections.push(`- 用户问题：${question}`);
  if (answer) sections.push(`- 参考回答（可优化，不必逐字照搬）：${answer}`);
  if (input.audience?.trim()) sections.push(`- 受众：${input.audience.trim()}`);
  if (input.durationMinutes != null) sections.push(`- 目标时长：${input.durationMinutes} 分钟`);
  if (input.style?.trim()) sections.push(`- 风格偏好：${input.style.trim()}`);
  sections.push('- 约束：当前环境以文本模型为主，不依赖图片/视频生成。');

  return sections.join('\n');
}

export async function POST(req: NextRequest) {
  let questionSnippet: string | undefined;
  try {
    const body = (await req.json()) as LessonGenerateRequest;
    questionSnippet = body.question?.slice(0, 60);

    if (!body.question?.trim()) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing required field: question');
    }

    const mappedInput: GenerateClassroomInput = {
      requirement: buildRequirement(body),
      ...(body.language ? { language: body.language } : {}),
      ...(body.enableWebSearch != null ? { enableWebSearch: body.enableWebSearch } : {}),
      enableImageGeneration: false,
      enableVideoGeneration: false,
      ...(body.enableTTS != null ? { enableTTS: body.enableTTS } : {}),
    };

    const baseUrl = buildRequestOrigin(req);
    const requestId = nanoid(10);
    const job = await createClassroomGenerationJob(requestId, mappedInput);
    const pollUrl = `${baseUrl}/api/lesson/generate/${requestId}`;

    after(() => runClassroomGenerationJob(requestId, mappedInput, baseUrl));

    return apiSuccess(
      {
        requestId,
        jobId: requestId,
        status: job.status,
        step: job.step,
        message: job.message,
        pollUrl,
        pollIntervalMs: 5000,
      },
      202,
    );
  } catch (error) {
    log.error(`Lesson generation request failed [question="${questionSnippet ?? 'unknown'}..."]:`, error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to create lesson generation job',
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
}
