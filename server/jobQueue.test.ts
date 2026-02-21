import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock storagePut to avoid real S3 calls
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ url: "https://s3.example.com/test.mp4", key: "test.mp4" }),
}));

// Mock fs to avoid real file system operations
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(false),
    unlinkSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue(Buffer.from("fake video data")),
    mkdirSync: vi.fn(),
  };
});

// Import after mocks
import { createJob, getJob, getAllJobs, deleteJob } from "./jobQueue";

describe("Job Queue", () => {
  beforeEach(() => {
    // Clear all jobs between tests by deleting them
    const allJobs = getAllJobs();
    allJobs.forEach((job) => deleteJob(job.id));
  });

  it("should create a job with queued status", () => {
    const job = createJob("test-id-1", "video.mp4", "/tmp/test-id-1.mp4");

    expect(job.id).toBe("test-id-1");
    expect(job.originalName).toBe("video.mp4");
    expect(job.status).toBe("queued");
    expect(job.progress).toBe(0);
    expect(job.steps).toEqual([]);
    expect(job.createdAt).toBeGreaterThan(0);
  });

  it("should retrieve a job by id", () => {
    createJob("test-id-2", "myvideo.mp4", "/tmp/test-id-2.mp4");
    const job = getJob("test-id-2");

    expect(job).toBeDefined();
    expect(job?.id).toBe("test-id-2");
    expect(job?.originalName).toBe("myvideo.mp4");
  });

  it("should return undefined for non-existent job", () => {
    const job = getJob("non-existent-id");
    expect(job).toBeUndefined();
  });

  it("should list all jobs", () => {
    createJob("list-test-1", "a.mp4", "/tmp/a.mp4");
    createJob("list-test-2", "b.mp4", "/tmp/b.mp4");

    const jobs = getAllJobs();
    const ids = jobs.map((j) => j.id);

    expect(ids).toContain("list-test-1");
    expect(ids).toContain("list-test-2");
  });

  it("should delete a job", () => {
    createJob("delete-test-1", "todelete.mp4", "/tmp/todelete.mp4");
    expect(getJob("delete-test-1")).toBeDefined();

    deleteJob("delete-test-1");
    expect(getJob("delete-test-1")).toBeUndefined();
  });

  it("should set createdAt timestamp on job creation", () => {
    const before = Date.now();
    const job = createJob("ts-test-1", "ts.mp4", "/tmp/ts.mp4");
    const after = Date.now();

    expect(job.createdAt).toBeGreaterThanOrEqual(before);
    expect(job.createdAt).toBeLessThanOrEqual(after);
  });

  it("should store input path on job", () => {
    const job = createJob("path-test-1", "path.mp4", "/tmp/custom/path.mp4");
    expect(job.inputPath).toBe("/tmp/custom/path.mp4");
  });
});
