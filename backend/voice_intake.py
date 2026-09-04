"""Local Whisper transcription for nurse voice intake.

Audio never leaves the machine. Turning a transcript into a reviewable intake draft is the separate
concern of intake_extraction.py.
"""
from __future__ import annotations

import io
import os
import subprocess
import threading
from typing import Any

import numpy as np
import soundfile as sf

MODEL_ID = "openai/whisper-small"
_pipeline: Any | None = None
_load_lock = threading.Lock()
# One CPU pipeline serves live segments and the final pass; serialize so they do not interleave.
_infer_lock = threading.Lock()

TARGET_SR = 16000  # Whisper's own sampling rate.
# Whisper invents speech ("Thank you.", "Bye.") for near-silent audio, so quiet live chunks are dropped.
SEGMENT_SILENCE_RMS = 0.004


def load_model() -> Any:
    """Load the local pipeline once; callers may warm it up before the first recording."""
    global _pipeline
    with _load_lock:
        if _pipeline is None:
            from transformers import pipeline
            _pipeline = pipeline(
                "automatic-speech-recognition",
                model=MODEL_ID,
                device=-1,  # CPU: works on development machines without CUDA.
                model_kwargs={"local_files_only": os.getenv("WHISPER_LOCAL_ONLY") == "1"},
            )
    return _pipeline


def _ffmpeg_mono_16k(audio: bytes) -> np.ndarray:
    """Decode and resample with the local FFmpeg install, so torchaudio is not a dependency."""
    decoded = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", "pipe:0", "-f", "f32le", "-ac", "1", "-ar", str(TARGET_SR), "pipe:1"],
        input=audio, capture_output=True, check=True,
    )
    return np.frombuffer(decoded.stdout, dtype=np.float32)


def _decode(audio: bytes) -> tuple[np.ndarray, int]:
    try:
        samples, sampling_rate = sf.read(io.BytesIO(audio), dtype="float32", always_2d=False)
    except RuntimeError:
        # Browser MediaRecorder normally emits audio/webm, which soundfile cannot read.
        return _ffmpeg_mono_16k(audio), TARGET_SR
    if sampling_rate != TARGET_SR:
        # Whisper's feature extractor only resamples when torchaudio is installed; FFmpeg is enough.
        return _ffmpeg_mono_16k(audio), TARGET_SR
    if getattr(samples, "ndim", 1) == 2:
        samples = samples.mean(axis=1)
    return samples, sampling_rate


def _run(samples: np.ndarray, sampling_rate: int, **options: Any) -> str:
    model = load_model()
    with _infer_lock:
        result = model({"array": samples, "sampling_rate": sampling_rate}, generate_kwargs={"language": "en", "task": "transcribe"}, **options)
    return str(result["text"]).strip()


def transcribe(audio: bytes) -> str:
    """Transcribe audio entirely locally after the Hugging Face model cache is populated."""
    samples, sampling_rate = _decode(audio)
    # Without chunking, Whisper silently discards everything after the first 30 seconds.
    return _run(samples, sampling_rate, chunk_length_s=30, stride_length_s=5)


def transcribe_segment(audio: bytes) -> str:
    """Transcribe one live chunk, returning an empty string when the chunk carries no speech."""
    samples, sampling_rate = _decode(audio)
    if samples.size == 0 or float(np.sqrt(np.mean(np.square(samples, dtype=np.float64)))) < SEGMENT_SILENCE_RMS:
        return ""
    return _run(samples, sampling_rate)


def model_status() -> dict[str, Any]:
    return {"model_id": MODEL_ID, "loaded": _pipeline is not None, "local_only": os.getenv("WHISPER_LOCAL_ONLY") == "1"}
