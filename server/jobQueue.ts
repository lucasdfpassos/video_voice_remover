import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { storagePut } from "./storage";

export type JobStatus = "queued" | "processing" | "completed" | "error";

export interface ProcessingStep {
  step: string;
  percent: number;
  message: string;
  timestamp: number;
}

export interface Job {
  id: string;
  originalName: string;
  inputPath: string;
  outputPath?: string;
  downloadUrl?: string;
  status: JobStatus;
  progress: number;
  currentStep: string;
  steps: ProcessingStep[];
  error?: string;
  createdAt: number;
  completedAt?: number;
  expiresAt?: number;
}

// In-memory job store (session-scoped, no DB persistence)
const jobs = new Map<string, Job>();
let isWorkerRunning = false;
const jobQueue: string[] = [];

export function createJob(id: string, originalName: string, inputPath: string): Job {
  const job: Job = {
    id,
    originalName,
    inputPath,
    status: "queued",
    progress: 0,
    currentStep: "Na fila...",
    steps: [],
    createdAt: Date.now(),
  };
  jobs.set(id, job);
  jobQueue.push(id);
  scheduleWorker();
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function getAllJobs(): Job[] {
  return Array.from(jobs.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export function deleteJob(id: string): void {
  const job = jobs.get(id);
  if (job) {
    // Clean up temp files
    if (job.inputPath && fs.existsSync(job.inputPath)) {
      try { fs.unlinkSync(job.inputPath); } catch {}
    }
    if (job.outputPath && fs.existsSync(job.outputPath)) {
      try { fs.unlinkSync(job.outputPath); } catch {}
    }
    jobs.delete(id);
  }
}

function scheduleWorker() {
  if (!isWorkerRunning) {
    setImmediate(runWorker);
  }
}

async function runWorker() {
  if (isWorkerRunning) return;
  isWorkerRunning = true;

  while (jobQueue.length > 0) {
    const jobId = jobQueue.shift()!;
    const job = jobs.get(jobId);
    if (!job || job.status !== "queued") continue;

    await processJob(job);
  }

  isWorkerRunning = false;
}

async function processJob(job: Job): Promise<void> {
  job.status = "processing";
  job.currentStep = "Iniciando processamento...";

  const outputPath = job.inputPath.replace(/\.mp4$/i, "_processed.mp4");
  job.outputPath = outputPath;

  return new Promise((resolve) => {
    const scriptPath = path.join(process.cwd(), "server", "process_audio.py");
    // Remove PYTHONHOME/PYTHONPATH from env to avoid Python 3.13 conflict
    const cleanEnv = { ...process.env };
    delete cleanEnv.PYTHONHOME;
    delete cleanEnv.PYTHONPATH;
    const python = spawn("python3.11", [scriptPath, job.inputPath, outputPath], { env: cleanEnv });

    python.stdout.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.error) {
            job.status = "error";
            job.error = parsed.error;
            job.currentStep = "Erro no processamento";
          } else if (parsed.step) {
            job.progress = parsed.percent;
            job.currentStep = parsed.message;
            job.steps.push({
              step: parsed.step,
              percent: parsed.percent,
              message: parsed.message,
              timestamp: Date.now(),
            });
          }
        } catch {}
      }
    });

    python.stderr.on("data", (data: Buffer) => {
      console.error("[Worker] Python stderr:", data.toString());
    });

    python.on("close", async (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        try {
          // Upload to S3
          job.currentStep = "Enviando para armazenamento...";
          job.progress = 95;

          const fileBuffer = fs.readFileSync(outputPath);
          const baseName = job.originalName.replace(/\.mp4$/i, "");
          const s3Key = `processed/${job.id}/${baseName}_processed.mp4`;

          const { url } = await storagePut(s3Key, fileBuffer, "video/mp4");

          job.downloadUrl = url;
          job.status = "completed";
          job.progress = 100;
          job.currentStep = "Concluído!";
          job.completedAt = Date.now();
          job.expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24h

          // Clean up local output file
          try { fs.unlinkSync(outputPath); } catch {}
        } catch (err) {
          job.status = "error";
          job.error = `Erro ao enviar para S3: ${err}`;
          job.currentStep = "Erro no upload";
        }
      } else if (job.status !== "error") {
        job.status = "error";
        job.error = `Processo encerrado com código ${code}`;
        job.currentStep = "Erro no processamento";
      }

      // Clean up input file
      try {
        if (fs.existsSync(job.inputPath)) fs.unlinkSync(job.inputPath);
      } catch {}

      resolve();
    });

    python.on("error", (err) => {
      job.status = "error";
      job.error = `Falha ao iniciar processamento: ${err.message}`;
      job.currentStep = "Erro crítico";
      resolve();
    });
  });
}
