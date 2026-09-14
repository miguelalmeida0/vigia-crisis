# Local inference boundary and qualification

The API remains on DisabledModel. A runtime health response is not permission to enable inference. The qualification receipt must identify the selected model, 50 successful startup checks, at least 100 cases, and every accuracy/completion/latency gate in IntelligenceLanguageModel.

The direct worker is scripts/local_intelligence_worker.py; its loopback supervisor is scripts/local_intelligence_runtime.mjs. VIGIA_MLX_PYTHON selects the worker interpreter, VIGIA_LOCAL_MODEL selects the model, and VIGIA_MLX_PORT defaults to 11438. The API reads VIGIA_MLX_URL and VIGIA_MLX_QUALIFICATION_FILE only when a qualification receipt is supplied. Never write a passing receipt from intended results.

This environment had MLX 0.31.2 but no mlx-vlm distribution in the host interpreter. The Metal allocation probe failed before reaching the mlx-vlm import, so model loading, chat formatting, generation and resident-model memory were not exercised. No Qwen model weights were downloaded. A Metal-accessible interpreter with the model's dependencies is still required before model qualification can resume.

Rechecked on 14 September after resuming the task: explicitly selecting `mx.cpu` before allocating also failed with `metal::load_device`. The raw result is in `mlx-device-recheck.json`. Switching the MLX default device did not resolve this execution-environment restriction. No sandbox permissions or qualification thresholds were relaxed.

The requested conversion identifies mlx-vlm as its framework. Follow its [model card](https://huggingface.co/mlx-community/Qwen3.5-2B-MLX-4bit) and [official runtime repository](https://github.com/Blaizzy/mlx-vlm) when preparing an isolated environment; qualify the exact installed runtime/model combination rather than assuming another conversion has equivalent behavior.

The fallback native llama.cpp CPU process used the existing Llama 3.2 3B weights. Its 50 inference sentinels succeeded, but 81 of 104 bounded corpus requests timed out and the aggregate quality gates failed. It was not enabled in VIGIA. Both evaluation-only listeners were stopped after testing. Do not route ordinary map interactions through either model process.
