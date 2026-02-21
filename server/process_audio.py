#!/usr/bin/env python3
"""
Voice Removal Audio Processor
Removes voice (0-4kHz) from audio while preserving high frequencies (8kHz+)
using spectral masking and audio source separation techniques.
"""

import sys
import os
import json
import tempfile
import subprocess
import numpy as np

def log_progress(step: str, percent: int, message: str):
    """Print progress as JSON to stdout for Node.js to parse."""
    print(json.dumps({"step": step, "percent": percent, "message": message}), flush=True)

def remove_voice_spectral(input_audio: str, output_audio: str, sample_rate: int = 44100):
    """
    Remove voice using spectral masking:
    - Suppress frequencies 0-4000 Hz (voice range) by 99%
    - Preserve frequencies 8000+ Hz (high frequencies)
    - Smooth transition 4000-8000 Hz
    """
    import librosa
    import soundfile as sf

    log_progress("audio_analysis", 20, "Analisando espectro de áudio...")

    # Load audio
    y, sr = librosa.load(input_audio, sr=sample_rate, mono=False)

    # Handle mono/stereo
    if y.ndim == 1:
        y = np.array([y, y])  # Make stereo

    log_progress("voice_removal", 40, "Removendo faixa de voz...")

    # Process each channel
    processed_channels = []
    for channel in y:
        # Short-time Fourier transform
        D = librosa.stft(channel, n_fft=2048, hop_length=512)
        magnitude = np.abs(D)
        phase = np.angle(D)

        # Frequency bins
        freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)

        # Create spectral mask
        mask = np.ones_like(freqs, dtype=np.float32)

        for i, freq in enumerate(freqs):
            if freq < 4000:
                # Voice range: suppress by 99.9%
                mask[i] = 0.001
            elif freq < 8000:
                # Transition zone: smooth gradient
                t = (freq - 4000) / 4000.0
                mask[i] = 0.001 + (0.999 * t * t)  # Quadratic ease-in
            else:
                # High frequencies: preserve fully
                mask[i] = 1.0

        # Apply mask to magnitude
        masked_magnitude = magnitude * mask[:, np.newaxis]

        # Reconstruct signal
        D_masked = masked_magnitude * np.exp(1j * phase)
        channel_processed = librosa.istft(D_masked, hop_length=512)
        processed_channels.append(channel_processed)

    log_progress("masking", 60, "Aplicando mascaramento auditivo...")

    # Ensure same length
    min_len = min(len(ch) for ch in processed_channels)
    processed_channels = [ch[:min_len] for ch in processed_channels]

    # Stack channels
    audio_out = np.stack(processed_channels, axis=0).T  # (samples, channels)

    # Normalize to prevent clipping
    max_val = np.max(np.abs(audio_out))
    if max_val > 0:
        audio_out = audio_out * (0.95 / max_val)

    log_progress("encoding", 70, "Codificando áudio processado...")

    # Save as WAV
    sf.write(output_audio, audio_out, sr, subtype='PCM_16')
    return True

def process_video(input_path: str, output_path: str):
    """Main processing pipeline."""
    try:
        log_progress("start", 5, "Iniciando processamento...")

        # Create temp directory
        with tempfile.TemporaryDirectory() as tmpdir:
            audio_extracted = os.path.join(tmpdir, "audio_original.wav")
            audio_processed = os.path.join(tmpdir, "audio_processed.wav")

            # Step 1: Extract audio from video
            log_progress("extract", 10, "Extraindo áudio do vídeo...")
            result = subprocess.run([
                "ffmpeg", "-i", input_path,
                "-vn", "-acodec", "pcm_s16le",
                "-ar", "44100", "-ac", "2",
                audio_extracted, "-y", "-loglevel", "error"
            ], capture_output=True, text=True)

            if result.returncode != 0:
                raise Exception(f"Erro ao extrair áudio: {result.stderr}")

            # Step 2: Apply voice removal
            remove_voice_spectral(audio_extracted, audio_processed)

            # Step 3: Re-encode video with processed audio + clean metadata
            log_progress("reencoding", 80, "Re-codificando vídeo com áudio processado...")
            result = subprocess.run([
                "ffmpeg", "-i", input_path,
                "-i", audio_processed,
                "-c:v", "copy",           # Keep video stream unchanged
                "-c:a", "aac",            # AAC codec
                "-b:a", "226k",           # 226kbps bitrate
                "-map", "0:v:0",          # Video from original
                "-map", "1:a:0",          # Audio from processed
                "-map_metadata", "-1",    # Remove ALL metadata
                "-movflags", "+faststart", # Web optimization
                output_path, "-y", "-loglevel", "error"
            ], capture_output=True, text=True)

            if result.returncode != 0:
                raise Exception(f"Erro ao re-codificar vídeo: {result.stderr}")

            log_progress("complete", 100, "Processamento concluído!")
            return True

    except Exception as e:
        print(json.dumps({"error": str(e)}), flush=True)
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(json.dumps({"error": "Usage: process_audio.py <input> <output>"}))
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2]

    if not os.path.exists(input_file):
        print(json.dumps({"error": f"Input file not found: {input_file}"}))
        sys.exit(1)

    process_video(input_file, output_file)
