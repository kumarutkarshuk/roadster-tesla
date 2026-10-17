"use client";

import { createDrivingAudio } from "./audio";
import { bindInputRelease, createHeldInputs } from "./held-inputs";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  createWorld,
  type Controls,
  type Telemetry,
  type Environment,
  type Daytime,
} from "./world";

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    sun: (
      <>
        <circle cx="12" cy="12" r="3.8" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
      </>
    ),
    sound: (
      <>
        <path d="m11 5-6 4H2v6h3l6 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
      </>
    ),
    mute: (
      <>
        <path d="m11 5-6 4H2v6h3l6 4V5Zm5 4 5 6m0-6-5 6" />
      </>
    ),
    expand: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />,
    settings: (
      <>
        <path d="M4 7h16M4 17h16" />
        <circle cx="8" cy="7" r="2.5" />
        <circle cx="16" cy="17" r="2.5" />
      </>
    ),
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    chevron: <path d="m9 5 7 7-7 7" />,
    mountain: (
      <>
        <path d="m2 19 7-12 5 7 3-5 5 10H2Z" />
        <path d="m6 12 3 2 3-2" />
      </>
    ),
    flight: (
      <>
        <path d="m12 3 3 7 6 4v2l-8-2v5l3 2H8l3-2v-5l-8 2v-2l6-4 3-7Z" />
      </>
    ),
    road: (
      <>
        <path d="M8 3 4 21M16 3l4 18M12 3v3m0 4v4m0 4v3" />
      </>
    ),
    camera: (
      <>
        <path d="M3 7h4l2-3h6l2 3h4v13H3V7Z" />
        <circle cx="12" cy="13" r="3.5" />
      </>
    ),
    pause: (
      <>
        <path d="M8 5v14M16 5v14" />
      </>
    ),
    play: <path d="m8 4 12 8-12 8V4Z" />,
    reset: (
      <>
        <path d="M4 10a8 8 0 1 1 1 7M4 4v6h6" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    bolt: <path d="m13 2-9 12h7l-1 8 10-13h-8l1-7Z" />,
    pin: (
      <>
        <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z" />
        <circle cx="12" cy="10" r="2" />
      </>
    ),
    keyboard: (
      <>
        <rect x="2" y="5" width="20" height="14" rx="3" />
        <path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M10 13h.01M14 13h.01M18 13h.01M8 16h8" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.road}
    </svg>
  );
}
const places: Record<
  Environment,
  { title: string; subtitle: string; label: string }
> = {
  countryside: {
    title: "Countryside",
    subtitle: "Green fields. Quiet lanes.",
    label: "THE COUNTRYSIDE, REIMAGINED",
  },
  coast: {
    title: "Pacific Coast",
    subtitle: "Ocean air. Open roads.",
    label: "CALIFORNIA, REIMAGINED",
  },
  alpine: {
    title: "Alpine Pass",
    subtitle: "A little closer to the sky.",
    label: "THE ALPS, REIMAGINED",
  },
  desert: {
    title: "Desert Run",
    subtitle: "Find your own horizon.",
    label: "MOJAVE, REIMAGINED",
  },
};
const initialControls: Controls = {
  flying: false,
  cruise: true,
  paused: false,
  boost: false,
  camera: 0,
  environment: "countryside",
  daytime: "day",
  keys: new Set(),
  reset: 0,
  recover: 0,
  flip: 0,
};

export default function Roadster() {
  const mount = useRef<HTMLDivElement>(null);
  const [keys] = useState(() => new Set<string>());
  const control = useRef<Controls>({ ...initialControls, keys });
  const [heldInputs] = useState(() => createHeldInputs(keys));
  const [settings, setSettings] = useState(initialControls);
  const [telemetry, setTelemetry] = useState<Telemetry>({
    speed: 0,
    distance: 0,
    altitude: 0,
    charge: 100,
  });
  const [panel, setPanel] = useState<"world" | "settings" | "help" | null>(
    null,
  );
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [sound, setSound] = useState(true);
  const soundEnabled = useRef(true);
  const [toast, setToast] = useState("");
  const audio = useRef<ReturnType<typeof createDrivingAudio> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function notify(text: string) {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }
  function update(patch: Partial<Controls>) {
    Object.assign(control.current, patch);
    setSettings({ ...control.current });
  }
  function holdButton(event: ReactPointerEvent<HTMLButtonElement>, key: string) {
    if (event.button !== 0) return;
    event.preventDefault();
    heldInputs.pressPointer(event.pointerId, key, event.pointerType);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Global release listeners also cover browsers that cannot capture.
    }
  }
  function releaseButton(event: ReactPointerEvent<HTMLButtonElement>) {
    heldInputs.releasePointer(event.pointerId);
  }
  function flight() {
    const next = !control.current.flying;
    update({ flying: next });
    notify(next ? "Cold-gas thrusters engaged" : "Landing assist engaged");
  }
  function returnToRoad() {
    update({
      recover: control.current.recover + 1,
      flying: false,
      boost: false,
    });
    notify("Back on the road. Journey continues.");
  }
  function flip() {
    if (control.current.chargeLocked) {
      notify("Let the air tanks recharge before flipping.");
      return;
    }
    update({ flip: control.current.flip + 1 });
    notify("Thruster roll");
  }
  function unlockAudio() {
    if (!soundEnabled.current) return;
    audio.current ??= createDrivingAudio();
    void audio.current.resume().catch(() => {});
  }
  function toggleSound() {
    const next = !soundEnabled.current;
    soundEnabled.current = next;
    setSound(next);
    if (next) unlockAudio();
  }
  function fullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else
      void document.documentElement
        .requestFullscreen()
        .catch(() => notify("Fullscreen is unavailable in this browser."));
  }
  useEffect(() => {
    return bindInputRelease(heldInputs, window);
  }, [heldInputs]);
  useEffect(() => {
    if (!mount.current) return;
    let dispose: (() => void) | undefined;
    try {
      dispose = createWorld(mount.current, control.current, (data) => {
        setTelemetry(data);
        setReady(true);
        setSettings((previous) =>
          previous.flying !== data.flying ||
          previous.cruise !== control.current.cruise
            ? { ...control.current, flying: !!data.flying }
            : previous,
        );
        audio.current?.update(
          data,
          soundEnabled.current,
          control.current.paused || document.hidden,
        );
      });
    } catch (e) {
      console.error(e);
      queueMicrotask(() => setError(true));
    }
    return () => {
      dispose?.();
      if (toastTimer.current) clearTimeout(toastTimer.current);
      audio.current?.dispose();
      audio.current = null;
    };
  }, []);
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    const silence = () => {
      control.current.boost = false;
      audio.current?.update(
        { speed: 0, distance: 0, altitude: 0, charge: 0 },
        false,
        true,
      );
    };
    document.addEventListener("visibilitychange", silence);
    window.addEventListener("blur", silence);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      document.removeEventListener("visibilitychange", silence);
      window.removeEventListener("blur", silence);
    };
  }, []);
  useEffect(() => {
    if (!panel) return;
    heldInputs.clear();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = document.querySelectorAll<HTMLElement>(
        '[role="dialog"] button, [role="dialog"] a[href]',
      );
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trapFocus);
    return () => document.removeEventListener("keydown", trapFocus);
  }, [panel, heldInputs]);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (
        (event.target instanceof HTMLElement &&
          event.target.matches("input,select,textarea")) ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      if (panel) {
        if (event.key === "Escape") setPanel(null);
        return;
      }
      const key = event.key.toLowerCase();
      if (
        [" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)
      )
        event.preventDefault();
      heldInputs.pressKey(key);
      if (event.repeat) return;
      if (
        [
          "w",
          "a",
          "s",
          "d",
          "arrowup",
          "arrowdown",
          "arrowleft",
          "arrowright",
        ].includes(key)
      ) {
        if (["w", "s", "arrowup", "arrowdown"].includes(key))
          update({ cruise: false });
      }
      if (key === " ") flight();
      if (key === "x") flip();
      if (key === "b") returnToRoad();
      if (key === "c") update({ camera: (control.current.camera + 1) % 3 });
      if (key === "p") update({ paused: !control.current.paused });
      if (key === "r") {
        update({ reset: control.current.reset + 1, flying: false });
        notify("A fresh stretch of road.");
      }
      if (key === "f") fullscreen();
      if (key === "escape") setPanel(null);
    };
    const up = (event: KeyboardEvent) =>
      heldInputs.releaseKey(event.key.toLowerCase());
    const blur = () => {
      control.current.boost = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  });
  function selectEnvironment(environment: Environment) {
    update({ environment });
    notify(`${places[environment].title} · a new perspective`);
  }
  const place = places[settings.environment];
  return (
    <main
      className={`experience ${settings.daytime === "night" ? "night" : ""}`}
    >
      <div
        className="world"
        ref={mount}
        aria-label="Interactive 3D Roadster driving world"
      />
      <div className="atmosphere" />
      <header className="minimal-header">
        <h1>
          roadster<span>an endless escape</span>
        </h1>
        <button
          className="location-control"
          onClick={() => setPanel("world")}
          title="Scenery & time of day"
          aria-label="Scenery and time of day"
        >
          {place.title.toLowerCase()}{" "}
          <span>
            ·{" "}
            {settings.daytime === "sunset"
              ? "sunset"
              : settings.daytime === "night"
                ? "night"
                : "daylight"}
          </span>
          <Icon name="chevron" size={12} />
        </button>
      </header>
      <section className="minimal-telemetry" aria-label="Driving dashboard">
        <div className="speed">
          <strong>{telemetry.speed.toString().padStart(2, "0")}</strong>
          <span>km/h</span>
        </div>
        <div className="surface-label">
          {telemetry.flipping
            ? "thruster roll"
            : telemetry.surface === "offroad"
              ? "off the beaten path"
              : ""}
        </div>
        <div className="trip">
          {telemetry.altitude > 0
            ? `${telemetry.altitude} m above the road`
            : `${telemetry.distance.toFixed(1)} km of nowhere to be`}
        </div>
        <button
          className={`cruise ${settings.cruise ? "active" : ""}`}
          aria-pressed={settings.cruise}
          onClick={() => update({ cruise: !settings.cruise })}
        >
          auto cruise <span>{settings.cruise ? "on" : "off"}</span>
        </button>
      </section>
      {telemetry.surface === "offroad" && (
        <button
          className="return-to-road"
          onClick={returnToRoad}
          aria-keyshortcuts="B"
          title="Return to road · B"
        >
          <Icon name="road" size={17} /> return to road <kbd>B</kbd>
        </button>
      )}
      <div className="flight-control">
        <button
          onClick={flight}
          className={settings.flying ? "active" : ""}
          aria-pressed={settings.flying}
          title="Lift off / land · Space"
        >
          <Icon name="flight" size={17} />
          {settings.flying ? "land" : "lift off"}
          <kbd>space</kbd>
        </button>
        <button
          className="flip-button"
          onClick={flip}
          title="Thruster roll · X"
          aria-keyshortcuts="X"
          disabled={telemetry.flipping}
        >
          <Icon name="reset" size={16} />
          flip <kbd>X</kbd>
        </button>
        <div
          className="gas-track"
          role="meter"
          aria-label="Thruster gas remaining"
          aria-valuenow={telemetry.charge}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <i style={{ width: `${telemetry.charge}%` }} />
        </div>
        <span className="gas-label">
          {telemetry.charge}% boost
          {telemetry.altitude > 0 ? ` · ${telemetry.altitude} m` : ""}
        </span>
      </div>
      <footer className="minimal-footer">
        <div className="key-guide">
          <span>
            wasd <i>drive</i>
          </span>
          <span>
            shift <i>boost</i>
          </span>
          <span>
            c <i>camera</i>
          </span>
        </div>
        <nav aria-label="Experience controls">
          <button
            aria-label={sound ? "Mute sound" : "Enable sound"}
            title={sound ? "Mute sound" : "Enable sound"}
            aria-pressed={sound}
            onClick={toggleSound}
          >
            <Icon name={sound ? "sound" : "mute"} />
          </button>
          <button
            aria-label="Change camera"
            title="Camera · C"
            onClick={() => update({ camera: (settings.camera + 1) % 3 })}
          >
            <Icon name="camera" />
          </button>
          <button
            aria-label={settings.paused ? "Resume" : "Pause"}
            title="Pause · P"
            onClick={() => update({ paused: !settings.paused })}
          >
            <Icon name={settings.paused ? "play" : "pause"} />
          </button>
          <button
            aria-label="Settings"
            title="Settings"
            onClick={() => setPanel("settings")}
          >
            <Icon name="settings" />
          </button>
          <button
            aria-label="Fullscreen"
            title="Fullscreen · F"
            onClick={fullscreen}
          >
            <Icon name="expand" />
          </button>
          <button
            aria-label="Controls and about"
            title="Controls"
            onClick={() => setPanel("help")}
          >
            <Icon name="keyboard" />
          </button>
        </nav>
      </footer>
      {settings.flying && (
        <div
          className="altitude-controls"
          aria-label="Flight altitude controls"
        >
          <span>altitude</span>
          {[
            ["q", "descend"],
            ["e", "climb"],
          ].map(([key, label]) => (
            <button
              key={key}
              onPointerDown={(event) => holdButton(event, key)}
              onPointerUp={releaseButton}
              onPointerCancel={releaseButton}
              onLostPointerCapture={releaseButton}
            >
              <kbd>{key.toUpperCase()}</kbd>
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="touch-controls">
        <div>
          {[
            ["a", "←"],
            ["d", "→"],
          ].map(([key, label]) => (
            <button
              key={key}
              aria-label={key === "a" ? "Steer left" : "Steer right"}
              onPointerDown={(event) => holdButton(event, key)}
              onPointerUp={releaseButton}
              onPointerCancel={releaseButton}
              onLostPointerCapture={releaseButton}
            >
              {label}
            </button>
          ))}
        </div>
        <div>
          {[
            ["s", "Brake"],
            ["w", "Go"],
            ["shift", "Boost"],
          ].map(([key, label]) => (
            <button
              key={key}
              onPointerDown={(e) => {
                holdButton(e, key);
                if (e.button === 0 && key !== "shift") update({ cruise: false });
              }}
              onPointerUp={releaseButton}
              onPointerCancel={releaseButton}
              onLostPointerCapture={releaseButton}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {settings.paused && (
        <div className="pause-indicator glass">
          <Icon name="pause" size={15} /> Taking a breath{" "}
          <button onClick={() => update({ paused: false })}>
            Resume <Icon name="play" size={12} />
          </button>
        </div>
      )}
      {toast && (
        <div role="status" className="toast glass">
          {toast}
        </div>
      )}
      {!ready && (
        <div className="loading">
          <span className="brand-mark" aria-hidden="true">
            roadster
          </span>
          {!error && <span className="loading-spinner" aria-hidden="true" />}
          <p role="status">
            {error
              ? "Your browser couldn’t start the 3D world. Enable WebGL and reload."
              : "Finding your next horizon…"}
          </p>
          {error && (
            <button onClick={() => window.location.reload()}>Try again</button>
          )}
        </div>
      )}
      {panel && (
        <div className="modal-backdrop" onClick={() => setPanel(null)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="panel-title"
            className="panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-top">
              <span className="eyebrow">MAKE IT YOUR JOURNEY</span>
              <button
                autoFocus
                aria-label="Close panel"
                onClick={() => setPanel(null)}
              >
                <Icon name="close" />
              </button>
            </div>
            <h2 id="panel-title">
              {panel === "world"
                ? "Scenery & time of day."
                : panel === "settings"
                  ? "Your kind of escape."
                  : "A little room to roam."}
            </h2>
            {panel === "world" && (
              <>
                <p>Four landscapes. An endless way to get there.</p>
                <label className="setting-label">TIME OF DAY</label>
                <div
                  className="segmented"
                  role="group"
                  aria-label="Time of day"
                >
                  {(["day", "sunset", "night"] as Daytime[]).map((day) => (
                    <button
                      key={day}
                      aria-pressed={settings.daytime === day}
                      className={settings.daytime === day ? "selected" : ""}
                      onClick={() => update({ daytime: day })}
                    >
                      {day === "day"
                        ? "Daylight"
                        : day === "sunset"
                          ? "Golden hour"
                          : "Nightfall"}
                    </button>
                  ))}
                </div>
                <div className="world-options">
                  {(Object.keys(places) as Environment[]).map((env, i) => (
                    <button
                      key={env}
                      aria-pressed={settings.environment === env}
                      className={`world-option ${env} ${settings.environment === env ? "is-selected" : ""}`}
                      onClick={() => selectEnvironment(env)}
                    >
                      <span className="world-art">
                        <Icon name="mountain" size={44} />
                        <span>0{i + 1}</span>
                      </span>
                      <strong>{places[env].title}</strong>
                      <small>{places[env].subtitle}</small>
                      <span className="option-action">
                        {settings.environment === env
                          ? "YOU ARE HERE"
                          : "EXPLORE"}
                        <Icon name="arrow" size={16} />
                      </span>
                    </button>
                  ))}
                </div>
                <button className="world-done" onClick={() => setPanel(null)}>
                  Back to drive <Icon name="arrow" size={16} />
                </button>
              </>
            )}
            {panel === "settings" && (
              <>
                <p>Set the mood. The road will take care of the rest.</p>
                <label className="setting-label">YOUR PERSPECTIVE</label>
                <div className="segmented">
                  {["Chase", "Scenic", "Driver"].map((name, i) => (
                    <button
                      key={name}
                      className={settings.camera === i ? "selected" : ""}
                      onClick={() => update({ camera: i })}
                    >
                      {name}
                    </button>
                  ))}
                </div>
                <button className="setting-row" onClick={toggleSound}>
                  <span>
                    <Icon name="sound" /> Motor & thruster sound
                  </span>
                  <span className={`toggle ${sound ? "on" : ""}`} />
                </button>
                <button
                  className="setting-row"
                  onClick={() =>
                    update({ reset: settings.reset + 1, flying: false })
                  }
                >
                  <span>
                    <Icon name="reset" /> Start a fresh journey
                  </span>
                  <Icon name="arrow" />
                </button>
              </>
            )}
            {panel === "help" && (
              <>
                <p>No score to chase. Just a road to follow.</p>
                <div className="touch-guide">
                  Hold the arrows to steer and Go or Brake to change speed.
                  Hold Boost for extra speed. You can steer and use a pedal at
                  the same time. Tap lift off to fly, then hold climb or descend
                  to change altitude. Auto cruise keeps you moving hands-free.
                </div>
                <div className="controls-list">
                  {[
                    ["W / ↑", "Accelerate"],
                    ["S / ↓", "Brake"],
                    ["A D / ← →", "Steer"],
                    ["SPACE", "Lift off / assisted landing"],
                    ["SHIFT", "Cold-gas boost"],
                    ["X", "Lift off & thruster roll"],
                    ["E / Q", "Climb / descend without a height cap"],
                    ["C", "Change camera"],
                    ["P", "Pause / resume"],
                    ["B", "Return to the road"],
                    ["R", "Reset journey"],
                  ].map(([key, label]) => (
                    <div key={key}>
                      <kbd>{key}</kbd>
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
                <div className="about-note">
                  <strong>Inspired by the October 2026 Roadster demo.</strong>
                  <p>
                    Angular bodywork, active aero, and cold-gas effects inspired
                    by Tesla. Free flight is an exploration mode. Drive beyond
                    the asphalt or press X for a thruster roll. Free flight has
                    unlimited lift and no height cap. Boost and rolls share a
                    rechargeable gas reserve. Handling, tank recharge, and
                    landing assistance are tuned for this game, not a validated
                    vehicle simulation.
                  </p>
                  <a
                    href="https://www.youtube.com/watch?v=7p5LxFdc-Qg"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Watch Tesla’s original demonstration ↗
                  </a>
                  <span>
                    Independent fan experience · Inspired by Slow Roads · Not
                    affiliated with Tesla.
                  </span>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
