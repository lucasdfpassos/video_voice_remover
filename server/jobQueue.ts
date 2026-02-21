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
  visualPerturb?: boolean;
}

// In-memory job store (session-scoped, no DB persistence)
const jobs = new Map<string, Job>();
let isWorkerRunning = false;
const jobQueue: string[] = [];

export function createJob(id: string, originalName: string, inputPath: string, visualPerturb = false): Job {
  const job: Job = {
    id,
    originalName,
    inputPath,
    status: "queued",
    progress: 0,
    currentStep: "Na fila...",
    steps: [],
    createdAt: Date.now(),
    visualPerturb,
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

function runPythonScript(
  scriptPath: string,
  args: string[],
  cleanEnv: NodeJS.ProcessEnv,
  onProgress: (parsed: { step?: string; percent?: number; message?: string; error?: string }) => void
): Promise<number> {
  return new Promise((resolve) => {
    const python = spawn("python3.11", [scriptPath, ...args], { env: cleanEnv });
    python.stdout.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        try { onProgress(JSON.parse(line)); } catch {}
      }
    });
    python.stderr.on("data", (data: Buffer) => {
      console.error("[Worker] Python stderr:", data.toString());
    });
    python.on("close", resolve);
    python.on("error", () => resolve(1));
  });
}

async function processJob(job: Job): Promise<void> {
  job.status = "processing";
  job.currentStep = "Iniciando processamento...";

  const outputPath = job.inputPath.replace(/\.mp4$/i, "_processed.mp4");
  const visualOutputPath = job.inputPath.replace(/\.mp4$/i, "_final.mp4");
  job.outputPath = job.visualPerturb ? visualOutputPath : outputPath;

  const cleanEnv = { ...process.env };
  delete cleanEnv.PYTHONHOME;
  delete cleanEnv.PYTHONPATH;

  const addStep = (parsed: { step?: string; percent?: number; message?: string; error?: string }) => {
    if (parsed.error) {
      job.status = "error";
      job.error = parsed.error;
      job.currentStep = "Erro no processamento";
    } else if (parsed.step) {
      job.progress = parsed.percent ?? job.progress;
      job.currentStep = parsed.message ?? job.currentStep;
      job.steps.push({
        step: parsed.step,
        percent: parsed.percent ?? 0,
        message: parsed.message ?? "",
        timestamp: Date.now(),
      });
    }
  };

  // ── Etapa 1: Processamento de áudio (Out-of-Phase Stereo) ──────────────────
  const audioScript = path.join(process.cwd(), "server", "process_audio.py");
  const audioCode = await runPythonScript(audioScript, [job.inputPath, outputPath], cleanEnv, addStep);

  if (audioCode !== 0 || !fs.existsSync(outputPath)) {
    if ((job.status as string) !== "error") {
      job.status = "error";
      job.error = `Processamento de áudio falhou (código ${audioCode})`;
      job.currentStep = "Erro no processamento de áudio";
    }
    try { if (fs.existsSync(job.inputPath)) fs.unlinkSync(job.inputPath); } catch {}
    return;
  }

  // ── Etapa 2 (opcional): Perturbação visual adversarial ────────────────────
  if (job.visualPerturb) {
    job.currentStep = "Aplicando camada visual adversarial...";
    const visualScript = path.join(process.cwd(), "server", "process_video_adversarial.py");
    const visualCode = await runPythonScript(
      visualScript,
      [outputPath, visualOutputPath, "3.0"],
      cleanEnv,
      (parsed) => {
        if (parsed.step) {
          // Remapear progresso da etapa visual para 50-95%
          const remapped = 50 + Math.round((parsed.percent ?? 0) * 0.45);
          addStep({ ...parsed, percent: remapped });
        } else {
          addStep(parsed);
        }
      }
    );

    // Limpar arquivo intermediário de áudio
    try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}

    if (visualCode !== 0 || !fs.existsSync(visualOutputPath)) {
      if ((job.status as string) !== "error") {
        job.status = "error";
        job.error = `Perturbação visual falhou (código ${visualCode})`;
        job.currentStep = "Erro na perturbação visual";
      }
      try { if (fs.existsSync(job.inputPath)) fs.unlinkSync(job.inputPath); } catch {}
      return;
    }
  }

  const finalOutputPath = job.visualPerturb ? visualOutputPath : outputPath;

  return new Promise((resolve) => {
    const doUpload = async () => {
      if (fs.existsSync(finalOutputPath)) {
        try {
          // Upload to S3
          job.currentStep = "Enviando para armazenamento...";
          job.progress = 95;

          const fileBuffer = fs.readFileSync(finalOutputPath);
          const baseName = job.originalName.replace(/\.mp4$/i, "");
          const suffix = job.visualPerturb ? "_processed_visual" : "_processed";
          const s3Key = `processed/${job.id}/${baseName}${suffix}.mp4`;

          const { url } = await storagePut(s3Key, fileBuffer, "video/mp4");

          job.downloadUrl = url;
          job.status = "completed";
          job.progress = 100;
          job.currentStep = "Concluído!";
          job.completedAt = Date.now();
          job.expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24h

          // Clean up local output file
          try { fs.unlinkSync(finalOutputPath); } catch {}
        } catch (err) {
          job.status = "error";
          job.error = `Erro ao enviar para S3: ${err}`;
          job.currentStep = "Erro no upload";
        }
      } else if ((job.status as string) !== "error") {
        job.status = "error";
        job.error = "Arquivo de saída não encontrado";
        job.currentStep = "Erro no processamento";
      }

      // Clean up input file
      try {
        if (fs.existsSync(job.inputPath)) fs.unlinkSync(job.inputPath);
      } catch {}

      resolve();
    };
    doUpload();
  });
}