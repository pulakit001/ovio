import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, Cloud, Cpu, Download, Mic, ShieldCheck } from "lucide-react";
import { COLORS, CTA, FONT } from "../ui/theme";
import { verifyOpenRouterKey } from "../services/verifyKeys";

const STEPS = ["hello", "voice", "notes", "finish"];

function ProgressState({ ready, busy, progress, idle }) {
  if (ready) return <span className="ovio-setup-status"><Check size={14} />Ready</span>;
  if (busy) return <span className="ovio-setup-status"><span className="ovio-setup-spinner" />{typeof progress === "number" ? `${Math.round(progress * 100)}%` : "Preparing"}</span>;
  return <span className="ovio-setup-status"><Download size={14} />{idle}</span>;
}

export default function Onboarding({ onComplete, onSkip }) {
  const [index, setIndex] = useState(0);
  const [name, setName] = useState("");
  const [choice, setChoice] = useState("localOnly");
  const [models, setModels] = useState([]);
  const [model, setModel] = useState("qwen2.5-3b");
  const [parakeet, setParakeet] = useState(null);
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const nameInput = useRef(null);
  const step = STEPS[index];

  const refreshModels = useCallback(async () => {
    try { setModels(await window.electronAPI?.localLlm?.status?.() || []); } catch {}
  }, []);
  const refreshParakeet = useCallback(async () => {
    try { setParakeet(await window.electronAPI?.parakeetAPI?.status?.() || null); } catch {}
  }, []);
  useEffect(() => {
    refreshModels();
    refreshParakeet();
    const removeModels = window.electronAPI?.localLlm?.onDownloadProgress?.(refreshModels);
    const removeParakeet = window.electronAPI?.parakeetAPI?.onStatus?.(refreshParakeet);
    return () => { removeModels?.(); removeParakeet?.(); };
  }, [refreshModels, refreshParakeet]);
  useEffect(() => {
    if (step === "hello") setTimeout(() => nameInput.current?.focus(), 120);
  }, [step]);

  const selected = models.find((entry) => entry.id === model);
  const engineReady = parakeet?.engine?.state === "ready";
  const weightsReady = !!parakeet?.weights?.downloaded;
  const busyParakeet = parakeet?.engine?.state === "installing" || parakeet?.weights?.downloading;
  const readyParakeet = engineReady && weightsReady;
  const startParakeet = () => {
    const api = window.electronAPI?.parakeetAPI;
    if (!api) return;
    const run = api.setup
      ? api.setup()
      : Promise.allSettled([api.installEngine?.(), api.downloadWeights?.()]);
    run.catch(() => {});
  };
  const startModel = () => window.electronAPI?.localLlm?.download?.(model).then(refreshModels).catch(refreshModels);
  const finish = async () => {
    await window.settingsAPI?.update?.({
      onboardingComplete: true,
      onboardingSkipped: false,
      userName: name.trim(),
      aiProvider: choice,
      localLlmModel: model,
      localSttModel: "parakeet",
      ...(choice === "cloud" ? { openrouterKeys: [{ id: "onboarding", name: "OpenRouter", active: true, key: apiKey.trim() }] } : {}),
      tourComplete: false,
    });
    onComplete();
  };
  const verify = async () => {
    if (!apiKey.trim()) return setError("Paste your OpenRouter API key to continue.");
    setChecking(true);
    setError("");
    try {
      const result = await verifyOpenRouterKey(apiKey.trim());
      if (!result.ok) return setError(result.error || "That key could not be verified.");
      await finish();
    } finally {
      setChecking(false);
    }
  };
  const advance = () => {
    // "Continue in background" is an action, not just a route change: start
    // both independent Parakeet downloads before moving to AI-note setup.
    if (step === "voice" && !readyParakeet) startParakeet();
    if (index < STEPS.length - 1) return setIndex(index + 1);
    return choice === "cloud" ? verify() : finish();
  };
  const left = useMemo(() => ({
    hello: [name.trim() ? `Welcome, ${name.trim()}.` : "A better memory for real life.", "Ovio records, transcribes and organises conversations without getting in your way."],
    voice: ["Your voice stays yours.", "Parakeet transcribes directly on this device. Your audio never needs to leave it."],
    notes: ["Your notes, your choice.", "Use a model on this device, or bring your own OpenRouter key for cloud AI."],
    finish: choice === "cloud"
      ? ["Powerful, on your terms.", "Your OpenRouter key is checked before it is stored securely on this device."]
      : ["One download. Then private.", "Ovio runs your chosen notes model inside the app — no daemon, account or API key."],
  })[step], [choice, name, step]);

  const rowClass = (active) => `ovio-setup-row${active ? " is-selected" : ""}`;
  return (
    <main className="ovio-setup" style={{ fontFamily: FONT, color: COLORS.text, background: COLORS.windowBg }}>
      <style>{`
        @keyframes ovioSetupIn { from { opacity: 0; transform: translateY(9px); } to { opacity: 1; transform: none; } }
        @keyframes ovioSetupSpin { to { transform: rotate(360deg); } }
        .ovio-setup { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(380px, 1.08fr) minmax(460px, 1fr); overflow: hidden; }
        .ovio-setup-left { min-width: 0; display: flex; flex-direction: column; justify-content: space-between; gap: 48px; padding: 42px 56px 46px; background: ${COLORS.surface2}; }
        .ovio-setup-mark { font-size: 20px; font-weight: 680; letter-spacing: -.045em; }
        .ovio-setup-headline { max-width: 720px; margin: 0; font-size: 76px; line-height: .94; letter-spacing: -.055em; font-weight: 640; overflow-wrap: anywhere; }
        .ovio-setup-left-copy { max-width: 430px; margin: 26px 0 0; color: ${COLORS.textSecondary}; font-size: 16px; line-height: 1.5; }
        .ovio-setup-trust { display: inline-flex; align-items: center; gap: 8px; color: ${COLORS.textSecondary}; font-size: 12px; }
        .ovio-setup-right { min-width: 0; display: flex; flex-direction: column; padding: 42px 56px 46px; background: ${COLORS.surface}; overflow-y: auto; }
        .ovio-setup-progress { display: flex; gap: 6px; }
        .ovio-setup-progress i { display: block; height: 2px; flex: 1; background: ${COLORS.borderStrong}; transition: background 180ms ease; }
        .ovio-setup-progress i.is-current { background: ${COLORS.text}; }
        .ovio-setup-step { margin: 10px 0 0; color: ${COLORS.textSecondary}; font-size: 13px; }
        .ovio-setup-stage { width: 100%; max-width: 520px; margin: auto 0; padding: 62px 0 42px; animation: ovioSetupIn 280ms cubic-bezier(.16,1,.3,1) both; }
        .ovio-setup-stage h2 { margin: 0; font-size: 32px; line-height: 1.08; letter-spacing: -.042em; font-weight: 650; }
        .ovio-setup-help { margin: 11px 0 34px; max-width: 45ch; color: ${COLORS.textSecondary}; font-size: 15px; line-height: 1.55; }
        .ovio-setup-name { width: 100%; padding: 10px 0 12px; border: 0; border-bottom: 1px solid ${COLORS.borderStrong}; border-radius: 0; outline: none; color: ${COLORS.text}; background: transparent; font: 500 34px ${FONT}; letter-spacing: -.035em; }
        .ovio-setup-name::placeholder { color: ${COLORS.textTertiary}; }
        .ovio-setup-name:focus { border-bottom-color: ${COLORS.text}; box-shadow: 0 1px 0 ${COLORS.text}; }
        .ovio-setup-rows { border-top: 1px solid ${COLORS.border}; }
        .ovio-setup-row { position: relative; width: 100%; display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; align-items: center; gap: 16px; padding: 18px 0; border: 0; border-bottom: 1px solid ${COLORS.border}; color: ${COLORS.text}; background: transparent; text-align: left; font-family: ${FONT}; cursor: pointer; }
        .ovio-setup-row:hover .ovio-setup-row-title { color: ${COLORS.text}; }
        .ovio-setup-row-title { display: block; font-size: 16px; font-weight: 620; letter-spacing: -.02em; }
        .ovio-setup-row-copy { display: block; margin-top: 3px; color: ${COLORS.textSecondary}; font-size: 13px; line-height: 1.45; }
        .ovio-setup-dot { width: 16px; height: 16px; border: 1.5px solid ${COLORS.textTertiary}; border-radius: 50%; }
        .ovio-setup-row.is-selected .ovio-setup-dot { border-color: ${COLORS.text}; background: ${COLORS.text}; box-shadow: inset 0 0 0 3px ${COLORS.surface}; }
        .ovio-setup-row.is-selected .ovio-setup-row-title { font-weight: 680; }
        .ovio-setup-row-meta { color: ${COLORS.textSecondary}; font-size: 13px; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .ovio-setup-status { display: inline-flex; align-items: center; gap: 6px; color: ${COLORS.textSecondary}; font-size: 12px; font-weight: 600; white-space: nowrap; }
        .ovio-setup-spinner { width: 13px; height: 13px; box-sizing: border-box; border: 2px solid ${COLORS.borderStrong}; border-top-color: ${COLORS.text}; border-radius: 50%; animation: ovioSetupSpin .75s linear infinite; }
        .ovio-setup-download { margin-top: 16px; border: 0; border-radius: 9px; padding: 10px 14px; color: ${CTA.fg}; background: ${CTA.bg}; font: 650 12.5px ${FONT}; cursor: pointer; }
        .ovio-setup-bar { height: 3px; overflow: hidden; margin-top: 11px; border-radius: 99px; background: ${COLORS.border}; }
        .ovio-setup-bar i { display: block; height: 100%; background: ${COLORS.text}; }
        .ovio-setup-note { margin: 17px 0 0; color: ${COLORS.textSecondary}; font-size: 13px; }
        .ovio-setup-key { width: 100%; padding: 12px 0; border: 0; border-bottom: 1px solid ${error ? COLORS.red : COLORS.borderStrong}; outline: none; color: ${COLORS.text}; background: transparent; font: 500 17px ${FONT}; }
        .ovio-setup-key:focus { border-bottom-color: ${COLORS.text}; }
        .ovio-setup-error { margin: 9px 0 0; color: ${COLORS.red}; font-size: 12px; line-height: 1.5; }
        .ovio-setup-actions { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 40px; }
        .ovio-setup-actions-right { display: flex; align-items: center; gap: 10px; }
        .ovio-setup-link, .ovio-setup-back { border: 0; color: ${COLORS.textSecondary}; background: transparent; font: 500 12.5px ${FONT}; cursor: pointer; }
        .ovio-setup-link { padding: 5px 0; text-decoration: underline; text-underline-offset: 4px; }
        .ovio-setup-back { display: inline-flex; align-items: center; gap: 4px; padding: 10px 4px; }
        .ovio-setup-primary { border: 1px solid ${CTA.bg}; border-radius: 9px; padding: 11px 17px; color: ${CTA.fg}; background: ${CTA.bg}; font: 650 12.5px ${FONT}; cursor: pointer; }
        .ovio-setup-primary:disabled { opacity: .42; cursor: default; }
        .ovio-setup-primary:focus-visible, .ovio-setup-row:focus-visible, .ovio-setup-link:focus-visible, .ovio-setup-back:focus-visible, .ovio-setup-download:focus-visible { outline: 2px solid ${COLORS.text}; outline-offset: 3px; }
        @media (max-width: 900px) { .ovio-setup { grid-template-columns: 1fr; overflow-y: auto; } .ovio-setup-left { min-height: 320px; padding: 30px 30px 36px; } .ovio-setup-headline { font-size: 56px; } .ovio-setup-right { min-height: 0; padding: 30px; overflow: visible; } .ovio-setup-stage { margin: 20px 0 0; padding: 36px 0; } }
        @media (max-width: 520px) { .ovio-setup-left, .ovio-setup-right { padding-left: 22px; padding-right: 22px; } .ovio-setup-left { min-height: 270px; } .ovio-setup-headline { font-size: 44px; } .ovio-setup-stage h2 { font-size: 28px; } .ovio-setup-actions { align-items: flex-end; } }
        @media (prefers-reduced-motion: reduce) { .ovio-setup-stage, .ovio-setup-spinner { animation: none; } .ovio-setup-progress i { transition: none; } }
      `}</style>

      <section className="ovio-setup-left">
        <span className="ovio-setup-mark">Ovio</span>
        <div>
          <h1 className="ovio-setup-headline">{left[0]}</h1>
          <p className="ovio-setup-left-copy">{left[1]}</p>
        </div>
        <span className="ovio-setup-trust"><ShieldCheck size={15} />Private by default. Yours by design.</span>
      </section>

      <section className="ovio-setup-right">
        <header>
          <div className="ovio-setup-progress" aria-label={`Step ${index + 1} of ${STEPS.length}`}>
            {STEPS.map((item, stepIndex) => <i key={item} className={stepIndex <= index ? "is-current" : ""} />)}
          </div>
          <p className="ovio-setup-step">Step {index + 1} of {STEPS.length}</p>
        </header>

        <div className="ovio-setup-stage" key={step}>
          {step === "hello" && <>
            <h2>What should Ovio call you?</h2>
            <p className="ovio-setup-help">Only used to greet you. It stays on this computer.</p>
            <input ref={nameInput} className="ovio-setup-name" value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && name.trim()) advance(); }} placeholder="First name" aria-label="First name" autoComplete="given-name" maxLength={48} />
          </>}

          {step === "voice" && <>
            <h2>Set up private transcription.</h2>
            <p className="ovio-setup-help">Parakeet turns speech into text locally. Start the download now or let it continue while you explore.</p>
            <div className="ovio-setup-rows">
              <div className="ovio-setup-row" style={{ cursor: "default" }}>
                <Mic size={17} color={COLORS.textSecondary} />
                <span><strong className="ovio-setup-row-title">Parakeet-TDT v3</strong><span className="ovio-setup-row-copy">Live transcription. Engine and speech model stay on this device.</span></span>
                <ProgressState ready={readyParakeet} busy={busyParakeet} progress={parakeet?.weights?.progress} idle="~2.5 GB" />
              </div>
            </div>
            {parakeet?.weights?.downloading && <div className="ovio-setup-bar"><i style={{ width: `${Math.round((parakeet.weights.progress || 0) * 100)}%` }} /></div>}
            {!readyParakeet && !busyParakeet && <button className="ovio-setup-download" onClick={startParakeet}>Set up Parakeet</button>}
            {busyParakeet && <p className="ovio-setup-note">Keep Ovio open while this runs. You can continue setup now.</p>}
          </>}

          {step === "notes" && <>
            <h2>How should AI notes run?</h2>
            <p className="ovio-setup-help">You can change this later. Transcription remains local either way.</p>
            <div className="ovio-setup-rows" role="radiogroup" aria-label="AI notes provider">
              <button className={rowClass(choice === "cloud")} role="radio" aria-checked={choice === "cloud"} onClick={() => setChoice("cloud")}><span className="ovio-setup-dot" /><span><strong className="ovio-setup-row-title">Cloud with OpenRouter</strong><span className="ovio-setup-row-copy">Use your own key for fast, powerful cloud models.</span></span><Cloud size={17} color={COLORS.textSecondary} /></button>
              <button className={rowClass(choice === "localOnly")} role="radio" aria-checked={choice === "localOnly"} onClick={() => setChoice("localOnly")}><span className="ovio-setup-dot" /><span><strong className="ovio-setup-row-title">On this device</strong><span className="ovio-setup-row-copy">Download a model once. No account, daemon or API key.</span></span><Cpu size={17} color={COLORS.textSecondary} /></button>
            </div>
          </>}

          {step === "finish" && choice === "cloud" && <>
            <h2>Connect OpenRouter.</h2>
            <p className="ovio-setup-help">Your key is checked before it is encrypted and stored locally.</p>
            <label htmlFor="openrouter-key" className="ovio-setup-row-copy" style={{ marginBottom: 4 }}>OpenRouter API key</label>
            <input id="openrouter-key" className="ovio-setup-key" value={apiKey} onChange={(event) => { setApiKey(event.target.value); setError(""); }} placeholder="sk-or-v1-…" autoComplete="off" />
            {error && <p className="ovio-setup-error">{error}</p>}
          </>}

          {step === "finish" && choice === "localOnly" && <>
            <h2>Choose a local notes model.</h2>
            <p className="ovio-setup-help">It downloads once and runs entirely inside Ovio. You can keep going while it downloads.</p>
            <div className="ovio-setup-rows" role="radiogroup" aria-label="Local notes model">
              {models.map((entry) => <button key={entry.id} className={rowClass(model === entry.id)} role="radio" aria-checked={model === entry.id} onClick={() => setModel(entry.id)}><span className="ovio-setup-dot" /><span><strong className="ovio-setup-row-title">{entry.title}</strong><span className="ovio-setup-row-copy">{entry.description}</span></span><span className="ovio-setup-row-meta"><ProgressState ready={entry.downloaded} busy={entry.downloading} progress={entry.progress} idle={entry.sizeLabel} /></span></button>)}
            </div>
            {!selected?.downloaded && !selected?.downloading && <button className="ovio-setup-download" onClick={startModel}>Download {selected?.sizeLabel || "model"}</button>}
            {selected?.downloading && <p className="ovio-setup-note">Downloading in the background. You can open Ovio whenever you are ready.</p>}
          </>}

          <div className="ovio-setup-actions">
            <button className="ovio-setup-link" onClick={onSkip}>I’ll set this up later</button>
            <div className="ovio-setup-actions-right">
              {index > 0 && <button className="ovio-setup-back" onClick={() => setIndex(index - 1)}><ChevronLeft size={15} />Back</button>}
              <button className="ovio-setup-primary" disabled={(step === "hello" && !name.trim()) || checking} onClick={advance}>{step === "voice" && !readyParakeet ? "Continue in background" : step === "finish" ? checking ? "Checking…" : "Open Ovio" : "Continue"}</button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
