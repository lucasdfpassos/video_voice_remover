import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { createJob } from "./jobQueue";

const router = Router();

// Ensure upload directory exists
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, _file, cb) => {
    const id = uuidv4();
    cb(null, `${id}.mp4`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 150 * 1024 * 1024 }, // 150MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "video/mp4" || file.originalname.endsWith(".mp4")) {
      cb(null, true);
    } else {
      cb(new Error("Apenas arquivos MP4 são aceitos"));
    }
  },
});

router.post("/upload", upload.single("video"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Nenhum arquivo enviado" });
  }

  const jobId = path.basename(req.file.filename, ".mp4");
  const originalName = req.file.originalname;
  const inputPath = req.file.path;
  const visualPerturb = req.body?.visualPerturb === "true" || req.body?.visualPerturb === true;

  const job = createJob(jobId, originalName, inputPath, visualPerturb);

  res.json({
    jobId: job.id,
    originalName: job.originalName,
    status: job.status,
    visualPerturb: job.visualPerturb,
    message: "Upload realizado com sucesso. Processamento iniciado.",
  });
});

export default router;
