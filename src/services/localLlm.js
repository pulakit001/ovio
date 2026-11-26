// Renderer bridge for Ovio's own local GGUF runtime. The model executes only
// in Electron's main process; the renderer never touches native bindings.
export async function localLlmChat(modelId, messages, opts = {}) {
  const api = window.electronAPI?.localLlm;
  if (!api?.generate) throw new Error("Local AI is available in the Ovio desktop app only.");
  const chunks = [];
  const off = api.onToken?.((event) => {
    if (event?.text) {
      chunks.push(event.text);
      opts.onToken?.(event.text, chunks.join(""));
    }
  });
  try {
    return await api.generate({
      modelId,
      messages,
      system: opts.system,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
    });
  } finally {
    off?.();
  }
}
