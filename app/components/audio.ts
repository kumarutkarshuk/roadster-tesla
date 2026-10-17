import type { Telemetry } from "./world";

/** Procedural audio: no samples, downloads, or autoplay before a gesture. */
export function createDrivingAudio() {
  const context = new AudioContext();
  const master = context.createGain();
  master.gain.value = 0;
  master.connect(context.destination);
  const motor = context.createOscillator();
  const motorGain = context.createGain();
  motor.type = "sine";
  motorGain.gain.value = 0;
  motor.connect(motorGain).connect(master);
  motor.start();

  const buffer = context.createBuffer(
    1,
    context.sampleRate * 3,
    context.sampleRate,
  );
  const samples = buffer.getChannelData(0);
  let low = 0;
  for (let i = 0; i < samples.length; i++) {
    const white = Math.random() * 2 - 1;
    low = (low + 0.02 * white) / 1.02;
    samples[i] = white * 0.7 + low * 3;
  }
  const gas = context.createBufferSource();
  gas.buffer = buffer;
  gas.loop = true;
  const highpass = context.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 180;
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2400;
  filter.Q.value = 0.6;
  const gasGain = context.createGain();
  gasGain.gain.value = 0;
  gas.connect(highpass).connect(filter).connect(gasGain).connect(master);
  gas.start();
  const rumble = context.createOscillator();
  const rumbleGain = context.createGain();
  rumble.type = "triangle";
  rumble.frequency.value = 48;
  rumbleGain.gain.value = 0;
  rumble.connect(rumbleGain).connect(master);
  rumble.start();

  return {
    resume: () => context.resume(),
    update(data: Telemetry, enabled: boolean, paused: boolean) {
      if (context.state === "closed") return;
      const now = context.currentTime;
      const active = enabled && !paused;
      const level = active
        ? Math.max(data.thrust ?? 0, data.boosting ? 0.95 : 0)
        : 0;
      master.gain.setTargetAtTime(active ? 0.65 : 0, now, 0.08);
      motor.frequency.setTargetAtTime(36 + data.speed * 0.6, now, 0.15);
      // A slightly louder motor makes acceleration easier to hear beside the air jets.
      motorGain.gain.setTargetAtTime(data.speed > 1 ? 0.028 : 0, now, 0.2);
      gasGain.gain.setTargetAtTime(level * 0.42, now, level > 0 ? 0.035 : 0.13);
      filter.frequency.setTargetAtTime(1300 + level * 2600, now, 0.08);
      rumble.frequency.setTargetAtTime(42 + level * 32, now, 0.06);
      rumbleGain.gain.setTargetAtTime(level * 0.075, now, 0.06);
    },
    dispose() {
      motor.stop();
      gas.stop();
      rumble.stop();
      master.disconnect();
      void context.close();
    },
  };
}
