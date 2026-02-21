import { useState, useRef, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Upload,
  FileVideo,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Download,
  Trash2,
  AudioWaveform,
  Zap,
  Shield,
} from "lucide-react";


// ─── Types ────────────────────────────────────────────────────────────────────

interface JobItem {
  id: string;
  originalName: string;
  status: "queued" | "processing" | "completed" | "error";
  progress: number;
  currentStep: string;
  error?: string;
  downloadUrl?: string;
  createdAt: number;
  completedAt?: number;
  expiresAt?: number;
}

// ─── Upload Zone ──────────────────────────────────────────────────────────────

function UploadZone({ onUpload }: { onUpload: (file: File) => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".mp4") && file.type !== "video/mp4") {
        toast.error("Apenas arquivos MP4 são aceitos.");
        return;
      }
      const maxSize = 150 * 1024 * 1024;
      if (file.size > maxSize) {
        toast.error(`Arquivo muito grande. Máximo: 150MB. Seu arquivo: ${(file.size / 1024 / 1024).toFixed(1)}MB`);
        return;
      }
      setIsUploading(true);
      try {
        await onUpload(file);
      } finally {
        setIsUploading(false);
      }
    },
    [onUpload]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);
  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  return (
    <div
      onClick={() => !isUploading && inputRef.current?.click()}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      className={`
        relative group cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-300
        ${isDragging
          ? "border-primary bg-primary/8 scale-[1.01]"
          : "border-border hover:border-primary/50 hover:bg-primary/4"
        }
        ${isUploading ? "pointer-events-none opacity-70" : ""}
      `}
      style={{ padding: "3rem 2rem" }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,.mp4"
        className="hidden"
        onChange={onInputChange}
        disabled={isUploading}
      />

      {/* Glow background */}
      <div
        className={`absolute inset-0 rounded-2xl transition-opacity duration-300 pointer-events-none ${isDragging ? "opacity-100" : "opacity-0 group-hover:opacity-50"}`}
        style={{ background: "radial-gradient(ellipse at center, oklch(0.65 0.2 270 / 0.08) 0%, transparent 70%)" }}
      />

      <div className="relative flex flex-col items-center gap-5 text-center">
        {/* Icon */}
        <div
          className={`w-20 h-20 rounded-2xl flex items-center justify-center transition-all duration-300 ${isDragging ? "scale-110" : "group-hover:scale-105"}`}
          style={{ background: "oklch(0.65 0.2 270 / 0.15)", border: "1px solid oklch(0.65 0.2 270 / 0.3)" }}
        >
          {isUploading ? (
            <Loader2 className="w-9 h-9 animate-spin" style={{ color: "oklch(0.65 0.2 270)" }} />
          ) : isDragging ? (
            <FileVideo className="w-9 h-9" style={{ color: "oklch(0.65 0.2 270)" }} />
          ) : (
            <Upload className="w-9 h-9" style={{ color: "oklch(0.65 0.2 270)" }} />
          )}
        </div>

        {/* Text */}
        <div>
          <p className="text-lg font-semibold text-foreground mb-1">
            {isUploading ? "Enviando vídeo..." : isDragging ? "Solte o arquivo aqui" : "Arraste seu vídeo MP4"}
          </p>
          <p className="text-sm" style={{ color: "oklch(0.55 0.01 260)" }}>
            {isUploading ? "Aguarde enquanto o arquivo é carregado" : "ou clique para selecionar — até 150MB"}
          </p>
        </div>

        {/* Badges */}
        {!isUploading && (
          <div className="flex gap-2 flex-wrap justify-center">
            {["MP4", "Até 150MB", "Processamento IA"].map((label) => (
              <span
                key={label}
                className="px-3 py-1 rounded-full text-xs font-medium"
                style={{ background: "oklch(0.16 0.01 260)", color: "oklch(0.65 0.01 260)", border: "1px solid oklch(0.22 0.01 260)" }}
              >
                {label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: JobItem["status"] }) {
  const config = {
    queued: { label: "Na fila", color: "oklch(0.78 0.18 75)", bg: "oklch(0.78 0.18 75 / 0.12)", icon: Clock },
    processing: { label: "Processando", color: "oklch(0.62 0.2 240)", bg: "oklch(0.62 0.2 240 / 0.12)", icon: Loader2 },
    completed: { label: "Concluído", color: "oklch(0.7 0.18 145)", bg: "oklch(0.7 0.18 145 / 0.12)", icon: CheckCircle2 },
    error: { label: "Erro", color: "oklch(0.58 0.22 25)", bg: "oklch(0.58 0.22 25 / 0.12)", icon: XCircle },
  }[status];

  const Icon = config.icon;

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
      style={{ color: config.color, background: config.bg }}
    >
      <Icon className={`w-3 h-3 ${status === "processing" ? "animate-spin" : ""}`} />
      {config.label}
    </span>
  );
}

// ─── Job Card ─────────────────────────────────────────────────────────────────

function JobCard({ job, onDelete }: { job: JobItem; onDelete: (id: string) => void }) {
  const isActive = job.status === "queued" || job.status === "processing";

  const stepLabels: Record<string, string> = {
    start: "Iniciando...",
    extract: "Extraindo áudio...",
    audio_analysis: "Analisando espectro...",
    voice_removal: "Removendo voz...",
    masking: "Mascaramento auditivo...",
    encoding: "Codificando áudio...",
    reencoding: "Re-codificando vídeo...",
    complete: "Concluído!",
  };

  const expiresIn = job.expiresAt
    ? Math.max(0, Math.floor((job.expiresAt - Date.now()) / 1000 / 60 / 60))
    : null;

  return (
    <div
      className="rounded-xl p-4 transition-all duration-300"
      style={{
        background: "oklch(0.11 0.008 260)",
        border: `1px solid ${isActive ? "oklch(0.65 0.2 270 / 0.3)" : "oklch(0.2 0.01 260)"}`,
        boxShadow: isActive ? "0 0 20px oklch(0.65 0.2 270 / 0.08)" : "none",
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        {/* File info */}
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "oklch(0.65 0.2 270 / 0.12)" }}
          >
            <FileVideo className="w-4 h-4" style={{ color: "oklch(0.65 0.2 270)" }} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{job.originalName}</p>
            <p className="text-xs mt-0.5" style={{ color: "oklch(0.45 0.01 260)" }}>
              {new Date(job.createdAt).toLocaleTimeString("pt-BR")}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={job.status} />
          {job.status === "completed" && job.downloadUrl && (
            <a
              href={job.downloadUrl}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-90 active:scale-95"
              style={{ background: "oklch(0.7 0.18 145 / 0.15)", color: "oklch(0.7 0.18 145)", border: "1px solid oklch(0.7 0.18 145 / 0.3)" }}
            >
              <Download className="w-3 h-3" />
              Baixar
            </a>
          )}
          <button
            onClick={() => onDelete(job.id)}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:opacity-80"
            style={{ background: "oklch(0.55 0.22 25 / 0.1)", color: "oklch(0.55 0.22 25 / 0.7)" }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Progress */}
      {isActive && (
        <div className="mt-3">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs" style={{ color: "oklch(0.55 0.01 260)" }}>
              {job.currentStep}
            </span>
            <span className="text-xs font-medium" style={{ color: "oklch(0.65 0.2 270)" }}>
              {job.progress}%
            </span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "oklch(0.16 0.01 260)" }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${job.progress}%`,
                background: job.progress > 0
                  ? "linear-gradient(90deg, oklch(0.65 0.2 270), oklch(0.72 0.15 200))"
                  : "oklch(0.65 0.2 270)",
              }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {job.status === "error" && job.error && (
        <div
          className="mt-3 px-3 py-2 rounded-lg text-xs"
          style={{ background: "oklch(0.55 0.22 25 / 0.1)", color: "oklch(0.7 0.22 25)", border: "1px solid oklch(0.55 0.22 25 / 0.2)" }}
        >
          {job.error}
        </div>
      )}

      {/* Expiry */}
      {job.status === "completed" && expiresIn !== null && (
        <div className="mt-2 text-xs" style={{ color: "oklch(0.45 0.01 260)" }}>
          Link expira em {expiresIn}h
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Home() {
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [activeJobIds, setActiveJobIds] = useState<Set<string>>(new Set());

  const utils = trpc.useUtils();

  // List all jobs
  const { data: jobList } = trpc.video.listJobs.useQuery(undefined, {
    refetchInterval: activeJobIds.size > 0 ? 1500 : false,
  });

  useEffect(() => {
    if (jobList) {
      setJobs(jobList as JobItem[]);
      const active = new Set(
        jobList
          .filter((j) => j.status === "queued" || j.status === "processing")
          .map((j) => j.id)
      );
      setActiveJobIds(active);
    }
  }, [jobList]);

  const deleteJobMutation = trpc.video.deleteJob.useMutation({
    onSuccess: () => utils.video.listJobs.invalidate(),
  });

  const handleUpload = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append("video", file);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro no upload");
      }

      const data = await res.json();
      toast.success(`"${file.name}" enviado! Processamento iniciado.`);
      utils.video.listJobs.invalidate();
      setActiveJobIds((prev) => { const next = new Set(prev); next.add(data.jobId); return next; });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      toast.error(`Falha no upload: ${message}`);
    }
  }, [utils]);

  const handleDelete = (id: string) => {
    deleteJobMutation.mutate({ jobId: id });
    toast.success("Job removido.");
  };

  const completedCount = jobs.filter((j) => j.status === "completed").length;
  const processingCount = jobs.filter((j) => j.status === "processing" || j.status === "queued").length;

  return (
    <div className="min-h-screen" style={{ background: "oklch(0.08 0.005 260)" }}>
      {/* Header */}
      <header
        className="sticky top-0 z-50 border-b"
        style={{
          background: "oklch(0.09 0.006 260 / 0.9)",
          backdropFilter: "blur(12px)",
          borderColor: "oklch(0.18 0.01 260)",
        }}
      >
        <div className="container mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "oklch(0.65 0.2 270 / 0.2)", border: "1px solid oklch(0.65 0.2 270 / 0.4)" }}
            >
              <AudioWaveform className="w-4 h-4" style={{ color: "oklch(0.65 0.2 270)" }} />
            </div>
            <span className="font-semibold text-sm tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Voice Remover
            </span>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4">
            {processingCount > 0 && (
              <div className="flex items-center gap-2 text-xs" style={{ color: "oklch(0.62 0.2 240)" }}>
                <Loader2 className="w-3 h-3 animate-spin" />
                {processingCount} processando
              </div>
            )}
            {completedCount > 0 && (
              <div className="flex items-center gap-2 text-xs" style={{ color: "oklch(0.7 0.18 145)" }}>
                <CheckCircle2 className="w-3 h-3" />
                {completedCount} concluído{completedCount > 1 ? "s" : ""}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-10 max-w-3xl">
        {/* Hero */}
        <div className="mb-10 text-center">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-5"
            style={{ background: "oklch(0.65 0.2 270 / 0.1)", color: "oklch(0.75 0.15 270)", border: "1px solid oklch(0.65 0.2 270 / 0.2)" }}
          >
            <Zap className="w-3 h-3" />
            Processamento com IA — Mascaramento Auditivo
          </div>
          <h1
            className="text-4xl font-bold mb-3 tracking-tight"
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              background: "linear-gradient(135deg, oklch(0.95 0.005 260) 0%, oklch(0.75 0.15 270) 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Voice Remover
          </h1>
          <p className="text-base max-w-lg mx-auto" style={{ color: "oklch(0.55 0.01 260)" }}>
            Remova faixas de voz de vídeos MP4 preservando frequências altas e outros elementos de áudio com precisão espectral.
          </p>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap gap-2 justify-center mb-8">
          {[
            { icon: Shield, label: "Metadados limpos" },
            { icon: AudioWaveform, label: "AAC 226kbps" },
            { icon: Zap, label: "Mascaramento 8kHz+" },
          ].map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
              style={{ background: "oklch(0.13 0.008 260)", color: "oklch(0.6 0.01 260)", border: "1px solid oklch(0.2 0.01 260)" }}
            >
              <Icon className="w-3 h-3" style={{ color: "oklch(0.65 0.2 270)" }} />
              {label}
            </div>
          ))}
        </div>

        {/* Upload Zone */}
        <UploadZone onUpload={handleUpload} />

        {/* Jobs List */}
        {jobs.length > 0 && (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground">
                Vídeos processados
              </h2>
              <span className="text-xs" style={{ color: "oklch(0.45 0.01 260)" }}>
                {jobs.length} {jobs.length === 1 ? "item" : "itens"}
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {jobs.map((job) => (
                <JobCard key={job.id} job={job} onDelete={handleDelete} />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {jobs.length === 0 && (
          <div className="mt-10 text-center">
            <p className="text-sm" style={{ color: "oklch(0.4 0.01 260)" }}>
              Nenhum vídeo processado nesta sessão
            </p>
          </div>
        )}

        {/* How it works */}
        <div
          className="mt-12 rounded-2xl p-6"
          style={{ background: "oklch(0.10 0.007 260)", border: "1px solid oklch(0.18 0.01 260)" }}
        >
          <h3 className="text-sm font-semibold text-foreground mb-4">Como funciona</h3>
          {/* steps */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            {[
              { step: "01", title: "Upload", desc: "Envie seu vídeo MP4 (até 150MB)" },
              { step: "02", title: "Análise", desc: "IA analisa o espectro de frequências" },
              { step: "03", title: "Remoção", desc: "Voz (0–4kHz) é removida com precisão" },
              { step: "04", title: "Download", desc: "Vídeo processado disponível por 24h" },
            ].map(({ step, title, desc }, i, arr) => (
              <div key={step} className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ background: "oklch(0.65 0.2 270 / 0.15)", color: "oklch(0.65 0.2 270)" }}
                  >
                    {step}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">{title}</p>
                  <p className="text-xs mt-0.5" style={{ color: "oklch(0.45 0.01 260)" }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
