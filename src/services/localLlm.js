// Renderer bridge for Ovio's own local GGUF runtime. The model executes only
// in Electron's main process; the renderer never touches native bindings.
export async function localLlmChat(modelId, messages, opts = {}) {
  const api = window.electronAPI?.localLlm;
  if (!api?.generate) throw new Error("Local AI is available in the Ovio desktop app only.");
  // Do this check in the renderer so an unfinished download is an actionable
  // setup moment, not an opaque native-runtime error. AppShell listens for
  // this event and puts the exact model's progress in front of the user.
  const models = await api.status?.();
  const selected = Array.isArray(models) ? models.find((entry) => entry.id === modelId) : null;
  if (selected && !selected.downloaded) {
    window.dispatchEvent(new CustomEvent("ovio:local-ai-required", { detail: { modelId } }));
    throw new Error(`${selected.title} is still downloading. Ovio has opened its progress panel.`);
  }
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
  } catch (err) {
    if (/no sequences left/i.test(err?.message || "")) {
      throw new Error("The local model is finishing another answer. Please try again in a moment.");
    }
    throw err;
  } finally {
    off?.();
  }
}
