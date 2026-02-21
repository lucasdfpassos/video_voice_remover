#!/usr/bin/env python3.11
"""
Voice Removal usando Demucs (Meta AI) - htdemucs model
Separa voz do fundo musical/ambiente com IA e retorna apenas o fundo (no_vocals).
Resultado: áudio natural, imperceptível para humanos.
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
        progress("start", 5, "Iniciando processamento com IA...")

        # ── Etapa 1: Extrair áudio do vídeo em WAV ──────────────────────────
        progress("extract", 10, "Extraindo áudio do vídeo...")
        audio_wav = os.path.join(tmp_dir, "audio_input.wav")
        run_cmd([
            "ffmpeg", "-y", "-i", input_path,
            "-vn",                    # sem vídeo
            "-acodec", "pcm_s16le",   # WAV sem compressão
            "-ar", "44100",           # 44.1kHz (padrão Demucs)
            "-ac", "2",               # estéreo
            audio_wav
        ], "Falha ao extrair áudio")

        # ── Etapa 2: Separação de voz com Demucs (htdemucs) ─────────────────
        progress("ai_separation", 20, "Separando voz com IA (Demucs htdemucs)...")
        demucs_out = os.path.join(tmp_dir, "demucs_out")
        os.makedirs(demucs_out, exist_ok=True)

        # htdemucs: Hybrid Transformer Demucs - melhor modelo disponível
        # --two-stems vocals: separa em "vocals" e "no_vocals"
        demucs_result = subprocess.run([
            sys.executable, "-m", "demucs",
            "--two-stems", "vocals",
            "--out", demucs_out,
            "--name", "htdemucs",
            "--mp3",
            "--mp3-bitrate", "320",
            audio_wav
        ], capture_output=True, text=True)

        if demucs_result.returncode != 0:
            raise RuntimeError(f"Demucs falhou: {demucs_result.stderr.strip()}")

        # ── Etapa 3: Localizar arquivo no_vocals gerado ──────────────────────
        progress("locate", 65, "Finalizando separação de fontes...")
        base_name = os.path.splitext(os.path.basename(audio_wav))[0]
        no_vocals_path = os.path.join(demucs_out, "htdemucs", base_name, "no_vocals.mp3")

        if not os.path.exists(no_vocals_path):
            # Busca recursiva como fallback
            for root, dirs, files in os.walk(demucs_out):
                for f in files:
                    if "no_vocals" in f:
                        no_vocals_path = os.path.join(root, f)
                        break

        if not os.path.exists(no_vocals_path):
            raise RuntimeError("Arquivo no_vocals não encontrado após separação Demucs")

        # ── Etapa 4: Combinar fundo (no_vocals) com vídeo original ──────────
        progress("reencoding", 80, "Combinando áudio processado com vídeo...")
        run_cmd([
            "ffmpeg", "-y",
            "-i", input_path,          # vídeo original (stream de vídeo)
            "-i", no_vocals_path,      # áudio sem voz (Demucs)
            "-c:v", "copy",            # copiar vídeo sem re-encodar
            "-c:a", "aac",             # codec AAC
            "-b:a", "226k",            # bitrate 226kbps
            "-map", "0:v:0",           # stream de vídeo do original
            "-map", "1:a:0",           # stream de áudio do no_vocals
            "-map_metadata", "-1",     # remover todos os metadados
            "-movflags", "+faststart", # otimizar para streaming web
            "-shortest",               # cortar na menor duração
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
