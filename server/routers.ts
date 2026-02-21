import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { getJob, getAllJobs, deleteJob } from "./jobQueue";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  video: router({
    // Get status of a single job
    getJobStatus: publicProcedure
      .input(z.object({ jobId: z.string() }))
      .query(({ input }) => {
        const job = getJob(input.jobId);
        if (!job) return null;
        return {
          id: job.id,
          originalName: job.originalName,
          status: job.status,
          progress: job.progress,
          currentStep: job.currentStep,
          steps: job.steps,
          error: job.error,
          downloadUrl: job.downloadUrl,
          createdAt: job.createdAt,
          completedAt: job.completedAt,
          expiresAt: job.expiresAt,
        };
      }),

    // List all jobs in session
    listJobs: publicProcedure.query(() => {
      return getAllJobs().map(job => ({
        id: job.id,
        originalName: job.originalName,
        status: job.status,
        progress: job.progress,
        currentStep: job.currentStep,
        error: job.error,
        downloadUrl: job.downloadUrl,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
        expiresAt: job.expiresAt,
      }));
    }),

    // Delete a job
    deleteJob: publicProcedure
      .input(z.object({ jobId: z.string() }))
      .mutation(({ input }) => {
        deleteJob(input.jobId);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
