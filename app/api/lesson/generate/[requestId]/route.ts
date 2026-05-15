import { type NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import {
  isValidClassroomJobId,
  readClassroomGenerationJob,
} from '@/lib/server/classroom-job-store';
import { buildRequestOrigin } from '@/lib/server/classroom-storage';
import { createLogger } from '@/lib/logger';

const log = createLogger('LessonGenerateStatus API');

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ requestId: string }> },
) {
  let requestId: string | undefined;
  try {
    const params = await context.params;
    requestId = params.requestId;

    if (!isValidClassroomJobId(requestId)) {
      return apiError('INVALID_REQUEST', 400, 'Invalid request id');
    }

    const job = await readClassroomGenerationJob(requestId);
    if (!job) {
      return apiError('INVALID_REQUEST', 404, 'Lesson generation job not found');
    }

    const pollUrl = `${buildRequestOrigin(req)}/api/lesson/generate/${requestId}`;

    return apiSuccess({
      requestId,
      jobId: job.id,
      status: job.status,
      step: job.step,
      progress: job.progress,
      message: job.message,
      pollUrl,
      pollIntervalMs: 5000,
      scenesGenerated: job.scenesGenerated,
      totalScenes: job.totalScenes,
      classroomId: job.result?.classroomId,
      classroomUrl: job.result?.url,
      result: job.result,
      error: job.error,
      done: job.status === 'succeeded' || job.status === 'failed',
    });
  } catch (error) {
    log.error(`Lesson generation job retrieval failed [requestId=${requestId ?? 'unknown'}]:`, error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to retrieve lesson generation job',
      error instanceof Error ? error.message : String(error),
    );
  }
}
