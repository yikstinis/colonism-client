// The game's sounds, made on the fly with Web Audio (no files). A shot is put together the way a real
// small gun's sounds close up: a sharp crack (the muzzle blast's front, clipped hard) with a snap on
// top, the blast's body, a low push under it, the gun's steel ringing short, the bolt's clack a
// moment after; short, nothing after it. A spent case pings as it's thrown out. Footsteps and rolls
// on the sand. The knife swishes through the air, and thuds into what it cuts. A bottle shatters, its glass tinkling down. A bug squeals and pops, as a bubble does; it bites, snapping. A rocket screams down, and goes off: a boom, a rumble rolling away, earth falling back. The desert's wind, always there, low, in gusts. Fires crackle as he comes near them. Bugs in sight rustle and scrabble, their legs ticking on the sand. A dry click is the trigger pulled on nothing.
// All of it goes through a compressor, as recorded gunfire does. Each one a little different, so a
// burst doesn't sound like one sample over and over. Browsers only let a page make sound once the
// player has done something: wake() from a key or a click starts it.

const VOLUME = 0.55;
const WIND = { gain: 0.003, gust: 0.0015 }; // how loud the desert's wind is: always, and how much more (or less) a gust makes it
const GLASS = 2.2; // how loud a bottle shattering is (all of it)
const BUGS = { rustle: 0.05, tick: 0.025 }; // how loud bugs right by him are: their rustle, a leg's tick
const FIRE = { crackle: 0.05 }; // how loud a fire right by him is: a crackle
const CASE_HEARD = { from: 0.05, per: 0.065, most: 0.7 }; // how many of the spent cases thrown out ping: hardly any at a burst's start, more with each round, up to most

export function createSounds() {
  let ac = null, dry = null, clean = null, master = null, noise = null;
  let crackleTimer = 0; // when the fires' next crackle comes
  let rustle = null, rustlePan = null, tickTimer = 0; // the bugs' rustle (a gain on a noise loop, always on, and where it's heard), and when a leg ticks next

  // A second of white noise, played from anywhere in it
  function makeNoise() {
    const b = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  // Soft clipping: loud gets squashed, not cut (the crack's grit)
  function makeDrive(k) {
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(k * x) / Math.tanh(k);
    }
    const ws = ac.createWaveShaper();
    ws.curve = curve;
    ws.oversample = '4x';
    return ws;
  }

  // A burst of noise from t: through a filter (its frequency going from -> to over time), its loudness
  // up at once and dying away over time; into dest
  function burst(dest, t, { type, from, to = from, q = 0.7, gain, time, attack = 0.0008 }) {
    const src = ac.createBufferSource(), filter = ac.createBiquadFilter(), env = ac.createGain();
    src.buffer = noise;
    src.loop = true; // (a long one goes on past the second of noise)
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(to, t + time);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + time);
    src.connect(filter).connect(env).connect(dest);
    src.start(t, Math.random() * 0.8, time + 0.05);
  }
  // A pure ring at freq from t, struck (up at once) and dying away over time: a bit of metal's (sag:
  // how far its pitch drops over the first tenth, as struck metal's does)
  function ring(dest, t, freq, gain, time, sag = 0) {
    const osc = ac.createOscillator(), env = ac.createGain();
    osc.frequency.setValueAtTime(freq * (1 + sag), t);
    osc.frequency.exponentialRampToValueAtTime(freq, t + 0.1);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.0015);
    env.gain.exponentialRampToValueAtTime(0.0001, t + time);
    osc.connect(env).connect(dest);
    osc.start(t);
    osc.stop(t + time + 0.02);
  }
  // A bubble's bloop from t into dest: a pure tone, its pitch flying up (from -> to over time) as the
  // bubble closes, struck at once and dying away with it
  function bloop(dest, t, from, to, time, gain) {
    const osc = ac.createOscillator(), env = ac.createGain();
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + time);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, t + time);
    osc.connect(env).connect(dest);
    osc.start(t);
    osc.stop(t + time + 0.02);
  }
  // A creature's squeal from t into dest (f: its pitch, Hz; time: how long), shrill and buzzing: a
  // raw tone through its throat, going up at once, then falling away, its pitch shaken fast
  function squeal(dest, t, f, time, gain) {
    const osc = ac.createOscillator(), buzz = ac.createOscillator(), shake = ac.createGain(), throat = ac.createBiquadFilter(), env = ac.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f * 0.8, t);
    osc.frequency.exponentialRampToValueAtTime(f * 1.25, t + Math.min(0.03, time * 0.3)); // up...
    osc.frequency.exponentialRampToValueAtTime(f * 0.55, t + time); // ...and falling away
    buzz.frequency.value = 35 + Math.random() * 15; // its buzz
    shake.gain.value = 120;
    buzz.connect(shake).connect(osc.frequency);
    throat.type = 'bandpass';
    throat.frequency.value = f * 1.6;
    throat.Q.value = 1.5;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + time);
    osc.connect(throat).connect(env).connect(dest);
    for (const o of [osc, buzz]) {
      o.start(t);
      o.stop(t + time + 0.02);
    }
  }
  // Where one sound goes: panned a touch, into the mix (or, clear, past the compressor: a quiet sound
  // right after a shot, not to be squashed under it)
  function voice(pan, clear = false) {
    const p = ac.createStereoPanner();
    p.pan.value = pan;
    p.connect(clear ? clean : dry);
    return p;
  }

  return {
    // From a key or a click: the sound's on from now
    wake() {
      if (!ac) {
        ac = new AudioContext();
        noise = makeNoise();
        // The mix: all through a compressor to the speakers
        const comp = ac.createDynamicsCompressor();
        comp.threshold.value = -16;
        comp.knee.value = 6;
        comp.ratio.value = 6;
        comp.attack.value = 0.002;
        comp.release.value = 0.12;
        master = ac.createGain();
        master.gain.value = VOLUME;
        comp.connect(master).connect(ac.destination);
        dry = ac.createGain();
        dry.connect(comp);
        clean = ac.createGain();
        clean.connect(master);
        // The desert's wind: noise slowed down and muffled, looping, always on; slow waves on its loudness
        // and its pitch (a gust swelling, then dying down), not in step, so it never quite repeats
        const wind = ac.createBufferSource(), tone = ac.createBiquadFilter(), air = ac.createGain();
        wind.buffer = noise;
        wind.loop = true;
        wind.playbackRate.value = 0.5;
        tone.type = 'bandpass';
        tone.frequency.value = 400;
        tone.Q.value = 0.6;
        air.gain.value = WIND.gain;
        for (const [rate, depth, param] of [[0.07, WIND.gust, air.gain], [0.11, WIND.gust * 0.4, air.gain], [0.05, 150, tone.frequency]]) {
          const wave = ac.createOscillator(), amount = ac.createGain();
          wave.frequency.value = rate;
          amount.gain.value = depth;
          wave.connect(amount).connect(param);
          wave.start();
        }
        wind.connect(tone).connect(air).connect(clean);
        wind.start();
        // The bugs' rustle: bright noise scrabbling (its loudness shaken fast, unevenly), its loudness set
        // by bugs() as they come and go
        const scrape = ac.createBufferSource(), hiss = ac.createBiquadFilter(), scrabble = ac.createGain();
        scrape.buffer = noise;
        scrape.loop = true;
        hiss.type = 'bandpass';
        hiss.frequency.value = 2800;
        hiss.Q.value = 0.9;
        scrabble.gain.value = 0.5;
        for (const [rate, depth] of [[11, 0.3], [17.3, 0.2]]) {
          const wave = ac.createOscillator(), amount = ac.createGain();
          wave.frequency.value = rate;
          amount.gain.value = depth;
          wave.connect(amount).connect(scrabble.gain);
          wave.start();
        }
        rustle = ac.createGain();
        rustle.gain.value = 0;
        rustlePan = ac.createStereoPanner();
        scrape.connect(hiss).connect(scrabble).connect(rustle).connect(rustlePan).connect(clean);
        scrape.start(0, Math.random() * 0.5);
      }
      if (ac.state === 'suspended') ac.resume();
    },

    // A round going off
    shot() {
      if (!ac || ac.state !== 'running') return;
      const t = ac.currentTime + 0.005, p = 0.92 + Math.random() * 0.16, out = voice((Math.random() - 0.5) * 0.15);
      const hot = ac.createGain(); // the blast, driven hard into the clipper
      hot.gain.value = 1.6;
      hot.connect(makeDrive(4)).connect(out);
      // (a small gun: crisp, but with body to it)
      burst(hot, t, { type: 'highpass', from: 1450 * p, to: 2700 * p, gain: 1, time: 0.032 }); // the crack
      burst(hot, t, { type: 'bandpass', from: 4100 * p, q: 1, gain: 0.3, time: 0.014, attack: 0.0004 }); // its snap, on top
      burst(hot, t, { type: 'lowpass', from: 2700 * p, to: 1100 * p, gain: 0.75, time: 0.18, attack: 0.001 }); // the blast's body (hardly sweeping: a sweep down's a drum's)
      burst(hot, t, { type: 'lowpass', from: 190, q: 0.5, gain: 0.8, time: 0.08, attack: 0.001 }); // the thump: a push of low noise, no note in it
      ring(out, t, 1100 * p, 0.05, 0.09, 0.03); // the gun's steel ringing with it, short...
      ring(out, t, 1870 * p, 0.03, 0.06, 0.03); // ...in two rings that aren't a chord
      burst(out, t + 0.01, { type: 'bandpass', from: 3800 * p, q: 6, gain: 0.25, time: 0.018 }); // the bolt's clack...
      burst(out, t + 0.026, { type: 'bandpass', from: 2600 * p, q: 5, gain: 0.15, time: 0.02 }); // ...going home
    },

    // A spent case thrown out of the gun, a moment after the shot (halfway to the next in a burst, so
    // it's heard): a thin brass tube's long ring, a few rings at once that aren't a chord (as a tube's
    // aren't), the lowest doubled a hair apart so it shimmers as it dies away. Not every one's heard
    // (CASE_HEARD: the more, the longer the burst; round: which it was in this one), each louder or
    // softer, a little earlier or later
    casing(round = 1) {
      if (!ac || ac.state !== 'running' || Math.random() > Math.min(CASE_HEARD.most, CASE_HEARD.from + CASE_HEARD.per * (round - 1))) return;
      const v = 0.35 + 0.65 * Math.random(), t = ac.currentTime + 0.045 + Math.random() * 0.025, p = 0.93 + Math.random() * 0.14, out = voice(0.15 + Math.random() * 0.1, true); // (out of its right side)
      for (const [f, gain, time] of [[1450, 0.022, 0.26], [1450 * 1.012, 0.015, 0.23], [2350, 0.011, 0.14], [3500, 0.005, 0.07]]) ring(out, t, f * p, gain * v, time, 0.02); // (a tube's rings: no chord; low and dull, the high ones dying fast)
      burst(out, t, { type: 'bandpass', from: 1500, q: 1, gain: 0.03 * v, time: 0.008, attack: 0.0004 }); // the tick of it, dull
    },

    // Fire near (near: 0..1, how near and how many, 0 none in sight), every frame (dt seconds): the
    // embers crackling and popping, now and then, more often the nearer
    fire(near, dt) {
      if (!ac || ac.state !== 'running') return;
      if (near <= 0 || (crackleTimer -= dt) > 0) return;
      crackleTimer = (0.03 + Math.random() * 0.25) / (0.3 + near);
      const t = ac.currentTime + 0.005, out = voice((Math.random() - 0.5) * 0.6, true), g = FIRE.crackle * near * (0.3 + 0.7 * Math.random());
      const pop = () => burst(out, t + (Math.random() < 0.3 ? 0.012 + Math.random() * 0.02 : 0), {
        type: 'bandpass', from: 1500 + Math.random() * 3000, q: 1.5, gain: g, time: 0.004 + Math.random() * 0.012, attack: 0.0003,
      });
      pop();
      if (Math.random() < 0.25) pop(); // (a pop splitting: two)
    },

    // Bugs near (near: 0..1, how near and how many, 0 none in sight; pan: -1..1, which side they're
    // on, mostly), every frame (dt seconds): their rustle, and their legs ticking on the sand, now and
    // then, more often the nearer; now and then a chitter, a quick run of ticks
    bugs(near, pan, dt) {
      if (!ac || ac.state !== 'running') return;
      rustle.gain.setTargetAtTime(BUGS.rustle * near, ac.currentTime, 0.3);
      rustlePan.pan.setTargetAtTime(pan, ac.currentTime, 0.3);
      if (near <= 0 || (tickTimer -= dt) > 0) return;
      tickTimer = (0.02 + Math.random() * 0.12) / (0.3 + near);
      const t = ac.currentTime + 0.005, out = voice(Math.max(-1, Math.min(1, pan + (Math.random() - 0.5) * 0.5)), true), g = BUGS.tick * near * (0.3 + 0.7 * Math.random());
      const chitter = Math.random() < 0.06, f = 2500 + Math.random() * 3500;
      for (let i = 0, at = t; i < (chitter ? 4 + Math.floor(Math.random() * 4) : 1); i++, at += 0.012 + Math.random() * 0.01) {
        burst(out, at, { type: 'bandpass', from: chitter ? 3600 : f, q: chitter ? 6 : 3, gain: g, time: 0.003 + Math.random() * 0.005, attack: 0.0003 }); // a tick
      }
    },

    // A footstep on the sand (hard: 0..1, how hard it's put down: a run's 1, sneaking softer): a soft
    // thud and the grains crunching under it, a little different each
    step(hard = 1) {
      if (!ac || ac.state !== 'running') return;
      const t = ac.currentTime + 0.005, p = 0.85 + Math.random() * 0.3, out = voice((Math.random() - 0.5) * 0.1, true);
      burst(out, t, { type: 'lowpass', from: 280 * p, to: 110 * p, gain: 0.07 * hard, time: 0.07, attack: 0.006 }); // the thud, muffled
      burst(out, t + 0.008, { type: 'bandpass', from: 900 * p, q: 1.2, gain: 0.01 * hard, time: 0.05 + 0.03 * Math.random(), attack: 0.01 }); // the crunch, hardly there
    },

    // A roll, in the steps' way, soft and muffled: a shush of sand as he goes down, his shoulder
    // hitting it (a heavier step's thud); nothing after
    roll() {
      if (!ac || ac.state !== 'running') return;
      const t = ac.currentTime + 0.005, p = 0.9 + Math.random() * 0.2, out = voice(0, true);
      burst(out, t, { type: 'lowpass', from: 600 * p, to: 250 * p, gain: 0.04, time: 0.12, attack: 0.03 }); // the shush
      burst(out, t + 0.06, { type: 'lowpass', from: 240 * p, to: 90 * p, gain: 0.19, time: 0.1, attack: 0.006 }); // his shoulder down
    },

    // The knife swung (lead: seconds from now to the blade's middle of its sweep): a swish of air
    // swelling as it comes and rising in pitch, at its loudest as it's through, gone right after
    swish(lead) {
      if (!ac || ac.state !== 'running') return;
      const t = ac.currentTime + 0.005, p = 0.9 + Math.random() * 0.2, out = voice((Math.random() - 0.5) * 0.2, true);
      burst(out, t, { type: 'bandpass', from: 600 * p, to: 2400 * p, q: 1.4, gain: 0.09, time: lead + 0.07, attack: lead }); // the swish
    },

    // The knife in something (what: 'bag', the punching bag's leather and sand, or 'flesh', a bug): a
    // dull thud of it going in, and the bag's leather slit with sand hissing out, or a wet squelch
    cut(what) {
      if (!ac || ac.state !== 'running') return;
      const t = ac.currentTime + 0.005, p = 0.9 + Math.random() * 0.2, out = voice((Math.random() - 0.5) * 0.15);
      burst(out, t, { type: 'lowpass', from: 220 * p, to: 90 * p, gain: 0.45, time: 0.09, attack: 0.002 }); // the thud
      if (what === 'bag') {
        burst(out, t, { type: 'highpass', from: 2800 * p, gain: 0.12, time: 0.025, attack: 0.0005 }); // the leather slit
        burst(out, t + 0.02, { type: 'bandpass', from: 5000 * p, to: 3500 * p, q: 0.8, gain: 0.04, time: 0.22, attack: 0.03 }); // sand hissing out
      } else {
        burst(out, t + 0.005, { type: 'bandpass', from: 900 * p, to: 280 * p, q: 3, gain: 0.3, time: 0.12, attack: 0.004 }); // the squelch
      }
    },

    // A bottle shattering (pan: -1..1, where it is, left to right): the bang of the glass giving way,
    // bright, its body's hollow pop under it, a spray of glass ringing, many thin rings not in tune,
    // short; then the shards tinkling down onto the sand round it, each a tiny ring and a tick; a
    // little different each, so a few in a row don't sound one
    shatter(pan = 0) {
      if (!ac || ac.state !== 'running') return;
      const t = ac.currentTime + 0.005, p = 0.9 + Math.random() * 0.2, out = voice(pan), side = (d) => voice(Math.max(-1, Math.min(1, pan + d)), true);
      burst(out, t, { type: 'highpass', from: 2500 * p, to: 4000 * p, gain: GLASS * 0.45, time: 0.06, attack: 0.0005 }); // the glass giving way
      burst(out, t, { type: 'bandpass', from: 1100 * p, q: 3, gain: GLASS * 0.25, time: 0.03, attack: 0.0008 }); // its hollow pop
      burst(out, t + 0.005, { type: 'bandpass', from: 6000 * p, to: 4500 * p, q: 1.2, gain: GLASS * 0.18, time: 0.18, attack: 0.002 }); // the spray of glass
      for (let i = 0; i < 9; i++) { // the glass ringing as it flies apart
        ring(side((Math.random() - 0.5) * 0.4), t + Math.random() * 0.03, (2800 + Math.random() * 5000) * p, GLASS * (0.015 + Math.random() * 0.02), 0.05 + Math.random() * 0.12);
      }
      for (let i = 0; i < 14; i++) { // shards tinkling down
        const at = t + 0.12 + 0.6 * Math.random() ** 1.3, g = 0.3 + 0.7 * Math.random(), o = side((Math.random() - 0.5) * 0.7);
        ring(o, at, 3500 + Math.random() * 4500, GLASS * 0.012 * g, 0.03 + Math.random() * 0.05); // its ring
        burst(o, at, { type: 'highpass', from: 4000, gain: GLASS * 0.03 * g, time: 0.005, attack: 0.0003 }); // its tick
      }
    },

    // A bug bursting (pan: -1..1, where it is, left to right): its squeal (if it squeals; loud: how
    // much louder, to be heard over gunfire), shrill and buzzing, and a second, shorter, higher, its last; and it pops as bubble wrap does: one dry, crisp snap, the air
    // in it bursting out (a sharp crack, a hollow pock ringing a hair, a tiny push of air under it);
    // a little different each, so a few in a row don't sound one
    splatter(pan = 0, squeals = true, loud = 1) {
      if (!ac || ac.state !== 'running') return;
      const t = ac.currentTime + 0.005, p = 0.85 + Math.random() * 0.3, out = voice(pan, true);
      const f = (1300 + Math.random() * 500) * p, time = 0.35 + Math.random() * 0.1;
      if (squeals) {
        squeal(out, t, f, time, 0.2 * loud); // the squeal...
        squeal(out, t + time + 0.03, f * 1.35, 0.15 + Math.random() * 0.05, 0.13 * loud); // ...and its last
      }
      burst(out, t, { type: 'highpass', from: 1800 * p, gain: 0.22, time: 0.006, attack: 0.0002 }); // the crack
      burst(out, t, { type: 'bandpass', from: 1500 * p, q: 5, gain: 0.18, time: 0.02, attack: 0.0003 }); // the pock, ringing
      burst(out, t, { type: 'lowpass', from: 220 * p, gain: 0.1, time: 0.015, attack: 0.001 }); // the air out of it
    },

    // The rocket coming: from the moment it's seen (the game held, waiting for his roll) it's heard far
    // off, fading in and holding there; land(fall) brings it down, fall seconds till it hits. Its
    // whistle is not a pure note (that's a cartoon's) but air shrieking past it, breathy, in two bands
    // not in tune, wavering, dropping only a little as it comes down; under it the motor's raw roar,
    // rasping (the burn sputtering, fast), and the air tearing past; all swelling and brightening as
    // it nears, cut off where it hits (the blast takes over). Returns { land(fall) } (null, no sound)
    incoming() {
      if (!ac || ac.state !== 'running') return null;
      const t = ac.currentTime + 0.005, out = voice(0), FAR = 0.12, FADE_IN = 1.5; // (far off: how loud, and how soon it's there)
      const rasp = ac.createGain(), sputter = ac.createOscillator(), depth = ac.createGain(); // the burn's rasp: its loudness shaking fast
      rasp.gain.value = 0.6;
      sputter.type = 'sawtooth';
      sputter.frequency.value = 45;
      depth.gain.value = 0.4;
      sputter.connect(depth).connect(rasp.gain);
      rasp.connect(out);
      const waver = ac.createOscillator(), wobble = ac.createGain(); // the whistle wavering, a few times a second
      waver.frequency.value = 6 + Math.random() * 3;
      wobble.gain.value = 40;
      waver.connect(wobble);
      const parts = [ // [filter, its q, from (far), to (as it hits), how loud as it hits, how loud far off (of that), where to]
        ['lowpass', 0.7, 500, 2500, 0.2, FAR / 2, rasp], // the motor
        ['highpass', 0.7, 3000, 5000, 0.04, FAR / 2, out], // the air tearing
        ['bandpass', 30, 2600, 1950, 2.5, FAR, out], // the whistle...
        ['bandpass', 30, 3900, 2925, 1.2, FAR, out], // ...its second band
      ].map(([type, q, from, to, gain, far, dest]) => {
        const src = ac.createBufferSource(), filter = ac.createBiquadFilter(), env = ac.createGain();
        src.buffer = noise;
        src.loop = true;
        filter.type = type;
        filter.Q.value = q;
        filter.frequency.value = from;
        if (type === 'bandpass') wobble.connect(filter.detune);
        env.gain.setValueAtTime(0.0001, t);
        env.gain.exponentialRampToValueAtTime(gain * far, t + FADE_IN);
        src.connect(filter).connect(env).connect(dest);
        src.start(t, Math.random() * 0.5);
        return { src, filter, env, to, gain };
      });
      sputter.start(t);
      waver.start(t);
      return {
        land(fall) {
          if (ac.state !== 'running') return;
          const now = ac.currentTime, end = now + fall;
          const from = (param) => { const v = Math.max(0.0001, param.value); param.cancelScheduledValues(now); param.setValueAtTime(v, now); }; // (from where it is now)
          for (const { src, filter, env, to, gain } of parts) {
            from(filter.frequency);
            filter.frequency.exponentialRampToValueAtTime(to, end);
            from(env.gain);
            env.gain.exponentialRampToValueAtTime(gain, end - 0.05);
            env.gain.linearRampToValueAtTime(0, end + 0.01);
            src.stop(end + 0.02);
          }
          sputter.frequency.setValueAtTime(45, now);
          sputter.frequency.linearRampToValueAtTime(70, end);
          sputter.stop(end + 0.02);
          waver.stop(end + 0.02);
        },
      };
    },

    // The rocket going off: a crack, the boom (low, long, driven hard), a punch under it you feel more
    // than hear, its echo off the dunes, the rumble rolling away after, and the earth thrown up falling
    // back on the sand. Too big for the mix's compressor (it'd squash it flat): on its own, gentler
    // one, its front let through; and everything else ducks under it for a moment, as if deafened
    blast() {
      if (!ac || ac.state !== 'running') return;
      const t = ac.currentTime + 0.005;
      const comp = ac.createDynamicsCompressor(), out = ac.createGain();
      comp.threshold.value = -8;
      comp.knee.value = 4;
      comp.ratio.value = 4;
      comp.attack.value = 0.004;
      comp.release.value = 0.4;
      out.connect(comp).connect(master);
      const hot = ac.createGain();
      hot.gain.value = 2.6;
      hot.connect(makeDrive(2.5)).connect(out);
      burst(hot, t, { type: 'highpass', from: 700, to: 2400, gain: 1, time: 0.08 }); // the crack
      burst(hot, t, { type: 'lowpass', from: 1600, to: 90, gain: 1.4, time: 1.6, attack: 0.002 }); // the boom
      ring(out, t, 38, 1.1, 1.1, 1.5); // the punch: a low thump dropping away...
      ring(out, t, 57, 0.6, 0.6, 1.2); // ...with another over it, not in tune
      burst(out, t, { type: 'lowpass', from: 110, q: 0.5, gain: 0.9, time: 0.9, attack: 0.003 }); // the push of air under it
      burst(out, t + 0.28, { type: 'lowpass', from: 700, to: 100, gain: 0.35, time: 0.9, attack: 0.02 }); // its echo off the dunes...
      burst(out, t + 0.65, { type: 'lowpass', from: 450, to: 80, gain: 0.2, time: 1.1, attack: 0.04 }); // ...and the farther ones
      burst(out, t + 0.05, { type: 'lowpass', from: 320, to: 60, q: 0.5, gain: 0.6, time: 3.5, attack: 0.08 }); // the rumble rolling away
      for (const bus of [dry, clean]) { // the rest ducking under it
        bus.gain.cancelScheduledValues(t);
        bus.gain.setValueAtTime(1, t);
        bus.gain.linearRampToValueAtTime(0.25, t + 0.03);
        bus.gain.setTargetAtTime(1, t + 0.4, 0.6);
      }
      for (let i = 0; i < 18; i++) { // earth falling back, here and there
        const at = t + 0.35 + Math.random() * 1.3, g = 0.3 + 0.7 * Math.random(), o = ac.createStereoPanner();
        o.pan.value = (Math.random() - 0.5) * 0.8;
        o.connect(out);
        burst(o, at, { type: 'lowpass', from: 300, to: 120, gain: 0.07 * g, time: 0.06, attack: 0.004 }); // a clod's thud
        burst(o, at, { type: 'bandpass', from: 1500 + Math.random() * 2000, q: 1, gain: 0.015 * g, time: 0.04, attack: 0.003 }); // sand spraying off it
      }
    },

    // E pressed: a bright, juicy click, a switch's: a tick on top, a short ring dropping a hair, a
    // second one over it not in tune, and a little body under them
    press() {
      if (!ac || ac.state !== 'running') return;
      const t = ac.currentTime + 0.005, p = 0.97 + Math.random() * 0.06, out = voice(0, true);
      burst(out, t, { type: 'highpass', from: 4500 * p, gain: 0.12, time: 0.004, attack: 0.0002 }); // the tick
      ring(out, t, 2200 * p, 0.1, 0.035, 0.15); // the ring...
      ring(out, t, 3350 * p, 0.04, 0.02, 0.1); // ...and over it
      burst(out, t, { type: 'lowpass', from: 600 * p, gain: 0.12, time: 0.014, attack: 0.0005 }); // its body
    },

    // A bug biting him: its mandibles snapping shut, two hard clicks close together, a wet crunch as
    // they go in, a dull thud of it
    bite() {
      if (!ac || ac.state !== 'running') return;
      const t = ac.currentTime + 0.005, p = 0.9 + Math.random() * 0.2, out = voice((Math.random() - 0.5) * 0.2);
      for (const [dt, f] of [[0, 3200], [0.018, 2700]]) burst(out, t + dt, { type: 'bandpass', from: f * p, q: 4, gain: 0.3, time: 0.012, attack: 0.0004 }); // the snap
      burst(out, t + 0.02, { type: 'bandpass', from: 1300 * p, to: 500 * p, q: 2, gain: 0.25, time: 0.08, attack: 0.003 }); // the crunch
      burst(out, t + 0.02, { type: 'lowpass', from: 260 * p, gain: 0.3, time: 0.07, attack: 0.003 }); // the thud
    },

    // A medkit used: the hiss of a stim going in, and a soft bright chime going up (two notes, a fifth
    // apart, ringing a while)
    heal() {
      if (!ac || ac.state !== 'running') return;
      const t = ac.currentTime + 0.005, out = voice(0, true);
      burst(out, t, { type: 'highpass', from: 3000, to: 5000, gain: 0.05, time: 0.25, attack: 0.02 }); // the hiss
      ring(out, t + 0.05, 660, 0.06, 0.5, -0.02); // the chime...
      ring(out, t + 0.14, 990, 0.05, 0.7, -0.02); // ...going up
    },

    // The trigger pulled with no round to go (reloading, or out): just a short dry click, low and dull
    click() {
      if (!ac || ac.state !== 'running') return;
      const t = ac.currentTime + 0.005, p = 0.92 + Math.random() * 0.16, out = voice(0);
      burst(out, t, { type: 'bandpass', from: 700 * p, q: 1.5, gain: 0.95, time: 0.006, attack: 0.0004 }); // the click
      burst(out, t, { type: 'lowpass', from: 300 * p, gain: 0.7, time: 0.009, attack: 0.0004 }); // its body
    },
  };
}
