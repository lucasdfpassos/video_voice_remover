import { describe, it, expect, beforeEach, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

// Mock jobQueue
vi.mock("./jobQueue", () => ({
  getJob: vi.fn(),
  getAllJobs: vi.fn().mockReturnValue([]),
  deleteJob: vi.fn(),
  createJob: vi.fn(),
}));

import { appRouter } from "./routers";
import { getJob, getAllJobs, deleteJob } from "./jobQueue";

function createCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("video.getJobStatus", () => {
  it("returns null for non-existent job", async () => {
    vi.mocked(getJob).mockReturnValue(undefined);

    const caller = appRouter.createCaller(createCtx());
    const result = await caller.video.getJobStatus({ jobId: "non-existent" });

    expect(result).toBeNull();
  });

  it("returns job data for existing job", async () => {
    const mockJob = {
      id: "job-123",
      originalName: "test.mp4",
      inputPath: "/tmp/test.mp4",
      status: "queued" as const,
      progress: 0,
      currentStep: "Na fila...",
      steps: [],
      createdAt: Date.now(),
    };

    vi.mocked(getJob).mockReturnValue(mockJob);

    const caller = appRouter.createCaller(createCtx());
    const result = await caller.video.getJobStatus({ jobId: "job-123" });

    expect(result).not.toBeNull();
    expect(result?.id).toBe("job-123");
    expect(result?.status).toBe("queued");
    expect(result?.originalName).toBe("test.mp4");
  });
});

describe("video.listJobs", () => {
  it("returns empty array when no jobs", async () => {
    vi.mocked(getAllJobs).mockReturnValue([]);

    const caller = appRouter.createCaller(createCtx());
    const result = await caller.video.listJobs();

    expect(result).toEqual([]);
  });

  it("returns list of jobs", async () => {
    const mockJobs = [
      {
        id: "job-1",
        originalName: "video1.mp4",
        inputPath: "/tmp/video1.mp4",
        status: "completed" as const,
        progress: 100,
        currentStep: "Concluído!",
        steps: [],
        downloadUrl: "https://s3.example.com/video1_processed.mp4",
        createdAt: Date.now(),
        completedAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      },
    ];

    vi.mocked(getAllJobs).mockReturnValue(mockJobs);

    const caller = appRouter.createCaller(createCtx());
    const result = await caller.video.listJobs();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("job-1");
    expect(result[0].status).toBe("completed");
    expect(result[0].downloadUrl).toBe("https://s3.example.com/video1_processed.mp4");
  });
});

describe("video.deleteJob", () => {
  it("calls deleteJob and returns success", async () => {
    vi.mocked(deleteJob).mockReturnValue(undefined);

    const caller = appRouter.createCaller(createCtx());
    const result = await caller.video.deleteJob({ jobId: "job-to-delete" });

    expect(result).toEqual({ success: true });
    expect(deleteJob).toHaveBeenCalledWith("job-to-delete");
  });
});
