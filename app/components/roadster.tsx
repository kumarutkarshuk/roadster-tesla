"use client";

import { planetBearing } from "./journey";
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
    // Scene icons distinguish the ocean drive from the city drive.
    city: <path d="M3 21V9h5v12m0 0V3h7v18m0 0V7h6v14M1 21h22M11 7h1m-1 4h1m-1 4h1m6-4h1m-1 4h1" />,
    coast: <path d="M2 17q3-3 6 0t6 0t8 0M2 21q3-3 6 0t6 0t8 0M3 12l5-8 6 8M16 3v6m-3-3h6" />,
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
  // Two distinct drives replace the previous scenery collection.
  coast: {
    title: "Pacific Coast",
    subtitle: "Wide roads. Green hills. Open ocean.",
    label: "THE PACIFIC COAST",
  },
  cyber: {
    title: "Cyber City",
    subtitle: "Glass towers. Neon lights. Wide roads.",
    label: "THE CITY AFTER DARK",
  },
};
const initialControls: Controls = {
  flying: false,
  cruise: true,
  // Hold the night city still until the player uses their first control.
  paused: true,
  boost: false,
  environment: "cyber",
  daytime: "night",
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
  // The opening guide is shown once per page load, before gameplay starts.
  const [showGuide, setShowGuide] = useState(true);
  const guideOpen = useRef(true);
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
  // Cyber City stays at night even when another control updates the settings.
  function update(patch: Partial<Controls>) {
    Object.assign(control.current, patch);
    if (control.current.environment === "cyber") control.current.daytime = "night";
    setSettings({ ...control.current });
  }
  // The first control starts the drive and remains active in that same input.
  function startDriving() {
    if (!guideOpen.current) return;
    guideOpen.current = false;
    setShowGuide(false);
    update({ paused: false });
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
      // Only game controls dismiss the guide; typing unrelated keys leaves it open.
      const starting = guideOpen.current && ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " ", "shift", "x", "e", "q", "p", "b", "r", "f"].includes(key);
      if (starting) startDriving();
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
      if (key === "p" && !starting) update({ paused: !control.current.paused });
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
    // Give each drive its intended lighting while keeping time controls available.
    update({ environment, daytime: environment === "cyber" ? "night" : "day", recover: settings.recover + 1 });
    notify(`${places[environment].title} · a new perspective`);
  }
  const place = places[settings.environment];
  return (
    <main
      className={`experience ${settings.daytime === "night" ? "night" : ""}`}
      // Touch and mouse controls also start the drive before running their action.
      onPointerDownCapture={(event) => {
        if (event.target instanceof Element && event.target.closest("button")) startDriving();
      }}
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
          {(telemetry.altitude >= 100000 || (telemetry.planet && telemetry.planet !== "earth")) ? telemetry.planet ?? "earth" : place.title.toLowerCase()}{" "}
          <span>
            ·{" "}
            {(telemetry.planet && telemetry.planet !== "earth") ? (telemetry.altitude < 1 ? "surface" : "flight") : telemetry.altitude >= 100000 ? "space" : settings.daytime === "sunset"
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
          {/* Reverse stays visible while the speed value remains easy to read. */}
          <span>{telemetry.reversing ? "R · km/h" : "km/h"}</span>
        </div>
        <div className="surface-label">
          {telemetry.flipping
            ? "thruster roll"
            : telemetry.surface === "offroad"
              ? "off the beaten path"
              : ""}
        </div>
        <div className="trip">
          {/* Space altitude stays readable, with climb speed showing the growing thrust. */}
          {telemetry.altitude >= 1000
            ? `${(telemetry.altitude / 1000).toFixed(1)} km · ${telemetry.altitude >= 100000 ? `${telemetry.planet ?? "earth"} · space` : `${telemetry.planet ?? "earth"} approach`} · ${telemetry.verticalSpeed ?? 0} m/s`
            : telemetry.altitude > 0
            ? `${telemetry.altitude} m above ${telemetry.planet && telemetry.planet !== "earth" ? telemetry.planet : "the road"}`
            : telemetry.planet && telemetry.planet !== "earth" ? `${telemetry.planet} · surface driving`
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
      {telemetry.surface === "offroad" && telemetry.altitude < 100 && (
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
      {/* Keep actual altitude progress visible when climb is released or landing begins. */}
      {(settings.flying || telemetry.altitude > 0) && telemetry.altitude < 100000 && (
        <section className="launch-progress" aria-label="Climb to visit planets">
          <span>Hold E / climb · visit planets</span>
          <progress max={100000} value={Math.min(100000,telemetry.altitude)} aria-label="Altitude needed for planet travel" />
          <small>{(telemetry.altitude/1000).toFixed(1)} / 100 km · {Math.round(telemetry.altitude/1000)}%</small>
        </section>
      )}
      {/* The road map stays visible during driving, flight, and planet travel. */}
      {(
        <nav className="planet-map" aria-label="Road and planet direction map">
          <span>{telemetry.planet && telemetry.planet !== "earth" ? "no roads · ahead ↑" : `road ${telemetry.roadOffset ?? 0} m · ahead ↑`}</span>
          <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="46"/><path d="M60 14V106M14 60H106"/>{(!telemetry.planet || telemetry.planet === "earth") && <path d={telemetry.roadMap} className="map-road" />}<path className="map-car" d="M60 53L55 66L60 63L65 66Z"/></svg>
          {(["earth","moon","mars"] as const).filter(planet=>telemetry.altitude >= 100000 && planet!==telemetry.planet).map(planet=>{
            const angle=planetBearing[planet]-(telemetry.heading??0);
            return <button key={planet} aria-label={`Face ${planet}`} title={`Turn towards ${planet}`} style={{left:`${50+Math.sin(angle)*33}%`,top:`${50-Math.cos(angle)*33}%`}} onClick={()=>update({destination:planet,flying:true})}>{planet[0].toUpperCase()+planet.slice(1)}</button>;
          })}
        </nav>
      )}
      {/* Select another world in space, then use forward throttle to approach it. */}
      {(telemetry.landingReady || telemetry.altitude >= 100000 || (telemetry.planet && telemetry.planet !== "earth")) && (
        <section className="planet-travel" aria-label="Space destinations">
          <span>{telemetry.destination
            ? `to ${telemetry.destination} · ${telemetry.travelProgress}% · hold W / Shift`
            : telemetry.altitude < 1 ? `${telemetry.planet} surface · hold E to leave` : `near ${telemetry.planet ?? "earth"} · E / Q altitude`}</span>
          <div>
            {(["earth", "moon", "mars"] as const).map(planet => (
              <button key={planet} aria-pressed={telemetry.destination === planet || (!telemetry.destination && telemetry.planet === planet)}
                disabled={telemetry.altitude < 100000 || telemetry.planet === planet}
                onClick={() => { update({ destination: planet, flying: true }); notify(`Turn towards ${planet}. Hold W or Shift to approach. Arrival approaches directly and lands automatically. E or Q cancels landing.`); }}>
                {planet}
              </button>
            ))}
          </div>
          {/* Landing follows the same ground contact and driving controls as Earth. */}
          {(telemetry.planet !== "earth" || telemetry.landingReady) && !telemetry.destination && (
            <button className={`space-return ${telemetry.landingReady ? "landing-ready" : ""}`} onClick={() => {
              update({ flying: false, cruise: false });
              notify(`Landing on ${telemetry.planet}. Use W A S D to drive after touchdown.`);
            }} disabled={telemetry.altitude < .1}>
              {telemetry.altitude < .1 ? "Surface driving · WASD" : "Press Space · landing assist"}
            </button>
          )}
          <button className="space-return" onClick={returnToRoad}>Back to Earth road · B</button>
        </section>
      )}
      {settings.flying && (
        <div
          className="altitude-controls"
          aria-label="Flight altitude controls"
        >
          {/* Holding climb builds speed all the way into space. */}
          <span>{telemetry.altitude >= 100000 ? "W / Shift approaches · E / Q altitude" : "hold climb to reach space"}</span>
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
            // Hold this pedal past a stop to back up.
            ["s", "Brake / reverse"],
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
      {settings.paused && !showGuide && (
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
      {/* First-time controls stay visible over the paused city until a driving input arrives. */}
      {showGuide && ready && (
        <div className="modal-backdrop">
          <section className="panel welcome-guide" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
            <h2 id="welcome-title">Take the wheel.</h2>
            <p>Press any driving key to begin.</p>
            <div className="controls-list">
              {[
                ["W / S", "Go / brake / reverse"],
                ["A / D", "Steer"],
                ["SHIFT", "Boost"],
                ["SPACE", "Fly / land"],
                ["E / Q", "Climb / descend"],
              ].map(([key, label]) => <div key={key}><kbd>{key}</kbd><span>{label}</span></div>)}
            </div>
            <p className="guide-extras">X roll · P pause · B return · R reset</p>
            <button className="world-done" autoFocus onClick={startDriving}>Start driving <Icon name="arrow" size={16} /></button>
          </section>
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
                <p>Two worlds. Wide roads. No end in sight.</p>
                {/* Only the coast offers daylight and golden hour. */}
                {settings.environment === "coast" ? (
                  <>
                    <label className="setting-label">TIME OF DAY</label>
                    <div className="segmented" role="group" aria-label="Time of day">
                      {(["day", "sunset", "night"] as Daytime[]).map((day) => (
                        <button
                          key={day}
                          aria-pressed={settings.daytime === day}
                          className={settings.daytime === day ? "selected" : ""}
                          onClick={() => update({ daytime: day })}
                        >
                          {day === "day" ? "Daylight" : day === "sunset" ? "Golden hour" : "Nightfall"}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="setting-label">NIGHT DRIVE · CYBER CITY</p>
                )}
                <div className="world-options">
                  {(Object.keys(places) as Environment[]).map((env, i) => (
                    <button
                      key={env}
                      aria-pressed={settings.environment === env}
                      className={`world-option ${env} ${settings.environment === env ? "is-selected" : ""}`}
                      onClick={() => selectEnvironment(env)}
                    >
                      <span className="world-art">
                        <Icon name={env === "cyber" ? "city" : "coast"} size={44} />
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
                  {/* Explain the shared brake and reverse pedal for touch drivers. */}
                  Hold the arrows to steer and Go or Brake / reverse to change speed.
                  Keep holding Brake / reverse after stopping to back up.
                  Hold Boost for extra speed. You can steer and use a pedal at
                  the same time. Tap lift off to fly, then hold climb or descend
                  to change altitude. Hold climb to build speed gradually into space. Turn with A/D to face a planet, or choose its button to turn towards it. Hold W, Shift or Go to travel. Arrival approaches directly and lands automatically. E or Q cancels landing; W then flies level. E and Q control altitude. Land on Moon or Mars to drive across the surface. B returns to Earth. Auto cruise keeps you moving hands-free.
                </div>
                <div className="controls-list">
                  {[
                    ["W / ↑", "Accelerate"],
                    // S brakes first, then backs up while held.
                    ["S / ↓", "Brake / hold to reverse"],
                    ["A D / ← →", "Steer"],
                    ["SPACE", "Lift off / assisted landing"],
                    ["SHIFT", "Cold-gas boost"],
                    ["X", "Lift off & thruster roll"],
                    ["E / Q", "Hold climb to accelerate into space"],
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
                  {/* Credit the photographic planet maps used during space flight. */}
                  <a href="https://www.solarsystemscope.com/textures/" target="_blank" rel="noreferrer">
                    Earth maps: Solar System Scope · CC BY 4.0
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
