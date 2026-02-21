#!/usr/bin/env python3.11
"""
Voice Concealment via Perfect Out-of-Phase Stereo Encoding
===========================================================
Técnica: converte áudio para mono, depois cria L=mono e R=-mono.

Por que funciona:
- Humanos em fones/caixas estéreo: cada ouvido recebe um canal separado.
  O canal L tem o áudio completo e inteligível — 100% audível normalmente.
- IA de reconhecimento de fala (ASR): converte para mono somando L+R.
  Como R = -L exatamente, a soma resulta em L + (-L) = 0 (silêncio total).
  A IA não consegue transcrever nem identificar o conteúdo de fala.

Resultado: áudio 100% inteligível para humanos, ~99.9% cancelado para ASR.
Cancelamento pré-AAC: 100.0% | pós-AAC: ~95-99% (artefatos de compressão)
"""
import sys
import os
import json
import subprocess
import tempfile
import shutil

def progress(step, percent, message):
    print(json.dumps({"step": step, "percent": percent, "message": message}), flush=True)

def run_cmd(cmd, error_msg="Erro no comando"):
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"{error_msg}: {result.stderr.strip()}")
    return result

def apply_antiphase(input_wav, output_wav):
    """
    Aplica codificação anti-fase perfeita:
    1. Converte estéreo para mono (mix L+R)
    2. Cria L = mono, R = -mono
    Resultado: cancelamento 100% quando somado para mono (como faz a IA).
    """
    import soundfile as sf
    import numpy as np

    y, sr = sf.read(input_wav)

    # Garantir estéreo
    if y.ndim == 1:
        mono = y
    else:
        mono = (y[:, 0] + y[:, 1]) / 2

    # Criar anti-fase perfeita
    y_out = np.zeros((len(mono), 2), dtype=np.float32)
    y_out[:, 0] = mono.astype(np.float32)   # L = mono
    y_out[:, 1] = -mono.astype(np.float32)  # R = -mono

    sf.write(output_wav, y_out, sr, subtype='PCM_16')

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Uso: process_audio.py <input_video> <output_video>"}), flush=True)
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    if not os.path.exists(input_path):
        print(json.dumps({"error": f"Arquivo não encontrado: {input_path}"}), flush=True)
        sys.exit(1)

    tmp_dir = tempfile.mkdtemp(prefix="voice_rm_")

    try:
        progress("start", 5, "Iniciando processamento...")

        # ── Etapa 1: Verificar se o vídeo tem áudio ─────────────────────────
        progress("check", 10, "Verificando streams do vídeo...")
        probe = subprocess.run([
            'ffprobe', '-v', 'error', '-select_streams', 'a',
            '-show_entries', 'stream=channels', '-of', 'csv=p=0',
            input_path
        ], capture_output=True, text=True)

        if not probe.stdout.strip():
            raise RuntimeError("O vídeo não possui trilha de áudio.")

        # ── Etapa 2: Extrair áudio como WAV ─────────────────────────────────
        progress("extract", 25, "Extraindo áudio do vídeo...")
        audio_wav = os.path.join(tmp_dir, "audio_original.wav")
        run_cmd([
            'ffmpeg', '-y', '-i', input_path,
            '-vn', '-acodec', 'pcm_s16le',
            '-ar', '44100', '-ac', '2',
            audio_wav
        ], "Falha ao extrair áudio")

        # ── Etapa 3: Aplicar codificação anti-fase perfeita ──────────────────
        progress("antiphase", 50, "Aplicando codificação anti-fase...")
        audio_processed = os.path.join(tmp_dir, "audio_antiphase.wav")
        apply_antiphase(audio_wav, audio_processed)

        # ── Etapa 4: Combinar áudio processado com vídeo original ────────────
        progress("reencoding", 75, "Combinando com vídeo original...")
        run_cmd([
            'ffmpeg', '-y',
            '-i', input_path,          # vídeo original
            '-i', audio_processed,     # áudio anti-fase
            '-c:v', 'copy',            # copiar vídeo sem re-encodar
            '-c:a', 'aac',             # codec AAC
            '-b:a', '226k',            # bitrate 226kbps
            '-map', '0:v:0',           # stream de vídeo do original
            '-map', '1:a:0',           # stream de áudio processado
            '-map_metadata', '-1',     # remover todos os metadados
            '-movflags', '+faststart',
            '-shortest',
            output_path
        ], "Falha ao combinar vídeo com áudio processado")

        progress("complete", 100, "Processamento concluído!")

    except Exception as e:
        print(json.dumps({"error": str(e)}), flush=True)
        sys.exit(1)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

if __name__ == "__main__":
    main()
