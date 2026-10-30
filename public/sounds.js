// The game's sounds, made on the fly with Web Audio (no files). A shot is put together the way a real
// small gun's sounds close up: a sharp crack (the muzzle blast's front, clipped hard) with a snap on
// top, the blast's body, a low push under it, the gun's steel ringing short, the bolt's clack a
// moment after; short, nothing after it. A spent case pings as it's thrown out. Footsteps and rolls
// on the sand. The knife swishes through the air, and thuds into what it cuts. A bottle shatters, its glass tinkling down. A bug squeals and pops, as a bubble does; it bites, snapping. A rocket screams down, and goes off: a boom, a rumble rolling away, earth falling back. The desert's wind, always there, low, in gusts. Fires crackle as he comes near them. A new level: a choir sings out "aah"; a quest done, the same, much shorter and quieter. Bugs in sight rustle and scrabble, their legs ticking on the sand. A dry click is the trigger pulled on nothing. Health back: a gasp of relief, "ahhh". His health low, his own heart pounding, steady, louder and quicker the nearer death. A reload: the magazine out, the new one in, the bolt. And the music, a track of its own (out of the safe zones only): uneasy, the desert's: a low drone breathing, a half-step grinding over it, a heartbeat on a frame drum, now and then a reed flute's phrase in the Hijaz mode, a glassy shimmer high up.
// All of it goes through a compressor, as recorded gunfire does. Each one a little different, so a
// burst doesn't sound like one sample over and over. Browsers only let a page make sound once the
// player has done something: wake() from a key or a click starts it.

const VOLUME = 0.55;
// A choir's vowels: their resonances (Hz, how sharp, how loud)
const AAH = [[800, 6, 1], [1150, 8, 0.6], [2900, 10, 0.25]];
const WIND = { gain: 0.003, gust: 0.0015 }; // how loud the desert's wind is: always, and how much more (or less) a gust makes it
const GLASS = 2.2; // how loud a bottle shattering is (all of it)
const BUGS = { rustle: 0.05, tick: 0.025 }; // how loud bugs right by him are: their rustle, a leg's tick
const FIRE = { crackle: 0.05 }; // how loud a fire right by him is: a crackle
const MUSIC = { gain: 0.1, fade: 2.5, drone: 0.05, dread: 0.012, beat: 0.22, ney: 0.05, glass: 0.004 }; // the music: how loud (all of it), how long it takes to fade in or out (s); its drone, the half-step over it, the heartbeat, the flute, the shimmer
const HIJAZ = [293.7, 311.1, 370, 392, 440, 466.2, 523.3, 587.3]; // the flute's notes (Hz): D's Hijaz, the desert's mode (D, E flat, F sharp, G, A, B flat, C, D)
const PULSE = { gain: 0.3, every: 0.85, quick: 0.3 }; // his own heart, his health low: how loud (the lowest it's heard: half of it), seconds between beats, how much quicker the nearer death
const CASE_HEARD = { from: 0.05, per: 0.065, most: 0.7 }; // how many of the spent cases thrown out ping: hardly any at a burst's start, more with each round, up to most

export function createSounds() {
  let ac = null, dry = null, clean = null, master = null, noise = null;
  let crackleTimer = 0; // when the fires' next crackle comes
  let rustle = null, rustlePan = null, tickTimer = 0; // the bugs' rustle (a gain on a noise loop, always on, and where it's heard), and when a leg ticks next
  let pulseAt = 0; // when his heart's next beat comes (0: not beating)
  let score = null, scoreIn = null, scoreOn = false, beatAt = 0, beatN = 0, phraseAt = 0, glassAt = 0; // the music: its fader, where its parts go in (through its hall), on or not, and when its next heartbeat, phrase, shimmer come (0: not yet set)

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

  // A hall's tail (seconds long): a convolver, noise dying away as its impulse
  function makeHall(tail) {
    const hall = ac.createConvolver(), len = Math.round(ac.sampleRate * tail), ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    hall.buffer = ir;
    return hall;
  }

  // The music's heartbeat at t (g: how hard): a frame drum's low thump, "lub", and its "dub" after, softer
  function heartbeat(t, g) {
    for (const [dt, k] of [[0, 1], [0.24, 0.6]]) {
      ring(scoreIn, t + dt, 52, MUSIC.beat * g * k, 0.35, 0.8); // the skin's boom, dropping
      burst(scoreIn, t + dt, { type: 'lowpass', from: 140, gain: MUSIC.beat * 0.6 * g * k, time: 0.12, attack: 0.004 }); // the hand on it
    }
  }
  // A reed flute's note (a ney's) at t, f Hz, time seconds: sliding up into it, breathy, its vibrato
  // coming in late, let go slowly
  function ney(t, f, time, g) {
    const osc = ac.createOscillator(), wob = ac.createOscillator(), depth = ac.createGain(), env = ac.createGain();
    const air = ac.createBufferSource(), reed = ac.createBiquadFilter(), breath = ac.createGain(), end = t + time * 1.6;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(f * 0.97, t);
    osc.frequency.exponentialRampToValueAtTime(f, t + 0.12);
    wob.frequency.value = 4.5 + Math.random();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(f * 0.008, t + time);
    wob.connect(depth).connect(osc.frequency);
    air.buffer = noise;
    air.loop = true;
    reed.type = 'bandpass';
    reed.frequency.value = f * 2;
    reed.Q.value = 8;
    breath.gain.value = 3; // (the narrow band takes most of the noise out)
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(g, t + 0.15);
    env.gain.setTargetAtTime(0.0001, t + time * 0.7, time * 0.15);
    osc.connect(env);
    air.connect(reed).connect(breath).connect(env);
    env.connect(scoreIn);
    for (const o of [osc, wob]) {
      o.start(t);
      o.stop(end);
    }
    air.start(t, Math.random() * 0.5);
    air.stop(end);
  }
  // A flute's phrase from t: a few notes of the mode, mostly a step from the last, the last held long,
  // left hanging on the D or the E flat a half-step over it (never quite at rest); returns when it ends
  function phrase(t) {
    const n = 3 + Math.floor(Math.random() * 4);
    for (let k = 0, i = Math.floor(Math.random() * 5); k < n; k++) {
      const last = k === n - 1, time = last ? 2.2 + Math.random() : 0.5 + Math.random() * 0.9;
      if (last) i = Math.random() < 0.5 ? 0 : 1;
      ney(t, HIJAZ[i], time + 0.2, MUSIC.ney * (0.7 + 0.3 * Math.random()));
      t += time;
      i = Math.max(0, Math.min(HIJAZ.length - 1, i + (Math.random() < 0.5 ? -1 : 1) * (Math.random() < 0.8 ? 1 : 2)));
    }
    return t;
  }
  // A shimmer at t, high up: two pure tones a half-step apart, one each side, swelling slowly and fading
  function shimmer(t) {
    const f = [1568, 1760, 1864.7][Math.floor(Math.random() * 3)];
    for (const [k, pan] of [[1, -0.6], [1.0595, 0.6]]) {
      const osc = ac.createOscillator(), env = ac.createGain(), p = ac.createStereoPanner();
      osc.frequency.value = f * k;
      p.pan.value = pan;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(MUSIC.glass, t + 3);
      env.gain.linearRampToValueAtTime(0, t + 7);
      osc.connect(env).connect(p).connect(scoreIn);
      osc.start(t);
      osc.stop(t + 7.1);
    }
  }

  // A choir singing in a hall (see levelUp), at seconds from now: chord (Hz) swelling up over up seconds, held
  // hold, dying away gently over about down (as a held note fades); each part a few voices a touch out
  // of tune with each other, each with its own slow vibrato, sung through the vowel's resonances; loud:
  // each voice's; hall: how long the hall's tail (seconds); vowel: its resonances (AAH)
  function choir({ up, hold, down, chord, loud, hall: tail, vowel: sound = AAH, at = 0 }) {
    if (!ac || ac.state !== 'running') return;
    const t = ac.currentTime + 0.005 + at, out = voice(0, true);
    // The hall: the choir dry, and a long tail of it from the walls
    const hall = makeHall(tail), wet = ac.createGain(), sung = ac.createGain();
    wet.gain.value = 0.5;
    sung.connect(out);
    sung.connect(hall).connect(wet).connect(out);
    const vowel = sound.map(([f, q, g]) => {
      const bp = ac.createBiquadFilter(), lv = ac.createGain();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      lv.gain.value = g;
      bp.connect(lv).connect(sung);
      return bp;
    });
    const env = ac.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, t + up);
    env.gain.setValueAtTime(1, t + up + hold);
    env.gain.setTargetAtTime(0, t + up + hold, down / 3);
    for (const bp of vowel) env.connect(bp);
    const end = t + up + hold + down * 2.5; // (its tail, gone quiet)
    for (const f of chord)
      for (let v = 0; v < 3; v++) {
        const osc = ac.createOscillator(), lv = ac.createGain(), wob = ac.createOscillator(), depth = ac.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = f;
        osc.detune.value = (v - 1) * 9 + (Math.random() - 0.5) * 6; // (no two quite together)
        wob.frequency.value = 4.5 + Math.random() * 1.5; // the vibrato
        depth.gain.value = 12; // (cents)
        wob.connect(depth).connect(osc.detune);
        lv.gain.value = loud;
        osc.connect(lv).connect(env);
        for (const o of [osc, wob]) {
          o.start(t);
          o.stop(end);
        }
      }
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
        // The music: a track of its own, on its own fader (silent till music() brings it in), past the
        // compressor (the shots don't pump it); all of it in a long hall. Always on under it: the
        // drone, low D and the A over it, raw, muffled, breathing slowly; and the dread, a D and the E
        // flat a half-step over it grinding against each other, swelling and dying away, slower still
        score = ac.createGain();
        score.gain.value = 0;
        score.connect(master);
        scoreIn = ac.createGain();
        const wet = ac.createGain();
        wet.gain.value = 0.6;
        scoreIn.connect(score);
        scoreIn.connect(makeHall(3.5)).connect(wet).connect(score);
        const muffle = ac.createBiquadFilter(), drone = ac.createGain(), dread = ac.createGain();
        muffle.type = 'lowpass';
        muffle.frequency.value = 260;
        muffle.Q.value = 2;
        drone.gain.value = MUSIC.drone;
        dread.gain.value = MUSIC.dread;
        for (const [f, detune, type, to] of [[73.4, -7, 'sawtooth', muffle], [73.4, 7, 'sawtooth', muffle], [110, 3, 'sawtooth', muffle], [146.8, 0, 'sine', dread], [155.6, 0, 'sine', dread]]) {
          const osc = ac.createOscillator();
          osc.type = type;
          osc.frequency.value = f;
          osc.detune.value = detune;
          osc.connect(to);
          osc.start();
        }
        muffle.connect(drone).connect(scoreIn);
        dread.connect(scoreIn);
        for (const [rate, depth, param] of [[0.04, 120, muffle.frequency], [0.021, MUSIC.dread, dread.gain]]) {
          const wave = ac.createOscillator(), amount = ac.createGain();
          wave.frequency.value = rate;
          amount.gain.value = depth;
          wave.connect(amount).connect(param);
          wave.start();
        }
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

    // The music, every frame: on (out of the safe zones) or off, faded in or out; fear (0..1, bugs
    // near) quickens its heartbeat. Its heartbeat in fours of four, the last four left out; a flute's
    // phrase every so often, long quiet between; a shimmer now and then, rarer
    music(on, fear = 0) {
      if (!ac || ac.state !== 'running') return;
      const now = ac.currentTime;
      if (on !== scoreOn) {
        scoreOn = on;
        score.gain.setTargetAtTime(on ? MUSIC.gain : 0, now, MUSIC.fade / 3);
        beatAt = phraseAt = glassAt = 0; // (coming back: all of it from the start)
      }
      if (!on) return;
      if (!beatAt) {
        beatAt = now + 1;
        beatN = 0;
        phraseAt = now + 5 + Math.random() * 5;
        glassAt = now + 15 + Math.random() * 15;
      }
      const ahead = now + 0.3; // (set up a little before it's due, so a slow frame doesn't make it late)
      while (beatAt < ahead) {
        if (beatN++ % 16 < 12) heartbeat(Math.max(now, beatAt), 0.6 + 0.4 * fear);
        beatAt += 1.6 - 0.6 * fear;
      }
      if (phraseAt < ahead) phraseAt = phrase(Math.max(now, phraseAt)) + 7 + Math.random() * 10;
      if (glassAt < ahead) {
        shimmer(Math.max(now, glassAt));
        glassAt += 20 + Math.random() * 25;
      }
    },

    // His heart, every frame, his health low: low (0..1, how near death; null: not heard) beating
    // steadily, louder and quicker the lower it is: a dull thump in his chest, "lub", and its "dub"
    // after, softer; close, dry (no hall: it's in him)
    pulse(low) {
      if (!ac || ac.state !== 'running') return;
      const now = ac.currentTime;
      if (low === null) { pulseAt = 0; return; }
      if (!pulseAt) pulseAt = now + 0.05;
      while (pulseAt < now + 0.3) { // (set up a little ahead, as the music's)
        const t = Math.max(now, pulseAt), g = PULSE.gain * (0.5 + 0.5 * low), out = voice(0, true);
        for (const [dt, k, f] of [[0, 1, 48], [0.22, 0.65, 56]]) {
          ring(out, t + dt, f, g * k, 0.28, 0.6); // the thump, dropping
          burst(out, t + dt, { type: 'lowpass', from: 120, gain: g * 0.5 * k, time: 0.08, attack: 0.006 }); // its weight, muffled
        }
        pulseAt += PULSE.every - PULSE.quick * low;
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

    // The other way round from press(): the key let go as a hold fills up (a thing taken), its click
    // turned over: the body first, a lower ring, the tick last and softer
    done() {
      if (!ac || ac.state !== 'running') return;
      const t = ac.currentTime + 0.005, p = 0.97 + Math.random() * 0.06, out = voice(0, true);
      burst(out, t, { type: 'lowpass', from: 500 * p, gain: 0.12, time: 0.014, attack: 0.0005 }); // its body
      ring(out, t + 0.006, 1500 * p, 0.09, 0.04, -0.12); // the ring, lower, sagging up...
      ring(out, t + 0.006, 2300 * p, 0.035, 0.025, -0.08); // ...and over it
      burst(out, t + 0.012, { type: 'highpass', from: 3500 * p, gain: 0.07, time: 0.004, attack: 0.0002 }); // the tick
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

    // Health back (a medkit, the campfire): a gasp of relief, "ahhh": a voice with breath in it, through
    // the open "a" (its resonances), quick to come, rising a little, then let go, the breath outlasting
    // the voice
    heal() {
      if (!ac || ac.state !== 'running') return;
      const t = ac.currentTime + 0.005, p = 0.94 + Math.random() * 0.12, out = voice(0, true), time = 0.6;
      const mouth = ac.createGain(); // (both through the vowel)
      for (const [f, q, g] of AAH) {
        const bp = ac.createBiquadFilter(), lv = ac.createGain();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(f * p, t);
        bp.frequency.exponentialRampToValueAtTime(f * 0.85 * p, t + time); // (the mouth closing as it ends)
        bp.Q.value = q * 0.6;
        lv.gain.value = g;
        mouth.connect(bp).connect(lv).connect(out);
      }
      const voiced = ac.createOscillator(), venv = ac.createGain(); // the voice: a man's, up a little, then down
      voiced.type = 'sawtooth';
      voiced.frequency.setValueAtTime(150 * p, t);
      voiced.frequency.exponentialRampToValueAtTime(175 * p, t + 0.08);
      voiced.frequency.exponentialRampToValueAtTime(130 * p, t + time);
      venv.gain.setValueAtTime(0.0001, t);
      venv.gain.exponentialRampToValueAtTime(0.05, t + 0.04);
      venv.gain.setTargetAtTime(0.0001, t + 0.12, time / 4);
      voiced.connect(venv).connect(mouth);
      voiced.start(t);
      voiced.stop(t + time + 0.2);
      const air = ac.createBufferSource(), aenv = ac.createGain(); // the breath in it, a little longer
      air.buffer = noise;
      air.loop = true;
      aenv.gain.setValueAtTime(0.0001, t);
      aenv.gain.exponentialRampToValueAtTime(0.25, t + 0.03);
      aenv.gain.setTargetAtTime(0.0001, t + 0.15, time / 3);
      air.connect(aenv).connect(mouth);
      air.start(t, Math.random() * 0.5, time + 0.3);
    },

    // A new level: a choir singing out "aah", a major chord swelling up and dying away gently in a hall
    levelUp() {
      choir({ up: 0.3, hold: 0.55, down: 1.3, chord: [261.6, 329.6, 392, 523.3], loud: 0.03, hall: 1.8 }); // (C major: C, E, G, the C over)
    },

    // A quest done: the level's choir, much shorter and quieter, and lower (a fourth down: told apart)
    questDone() {
      choir({ up: 0.12, hold: 0.12, down: 0.45, chord: [196, 246.9, 293.7, 392], loud: 0.015, hall: 0.9 }); // (G major)
    },

    // The gun reloaded, a part at a time (part: 'out', the empty magazine slid out: a short scrape; 'in',
    // the new one slid in: the same, lower and quieter; 'bolt', the bolt: the click of a catch, a low scrape
    // after it and a faint low ring). Close, short; each a little different
    reload(part, after = 0) { // (after: seconds from now)
      if (!ac || ac.state !== 'running') return;
      const t = ac.currentTime + 0.005 + after, p = 0.95 + Math.random() * 0.1, out = ac.createGain(); // (clear: not squashed under the last shots)
      out.gain.value = { out: 1, in: 0.25, bolt: 0.75 }[part]; // (the new one in as the one out, but quieter, and lower; the bolt a little quieter)
      out.connect(voice(0.05, true));
      const scrape = (gain = 1.7, from = 1000, to = 500) => burst(out, t + 0.01, { type: 'bandpass', from: from * p, to: to * p, q: 1.2, gain, time: 0.12, attack: 0.01 }); // (after a catch: low, loud)
      if (part === 'out') { // (a magazine out: just its scrape, loud; and the rest of the mix pulled down under it a moment, so it cuts through a burst)
        dry.gain.setTargetAtTime(0.45, t - 0.01, 0.01);
        dry.gain.setTargetAtTime(1, t + 0.18, 0.08);
        return scrape(1.6, 2600, 1400);
      }
      if (part === 'in') return scrape(1.6, 1700, 900); // (in: the same, lower)
      burst(out, t, { type: 'bandpass', from: 1100 * p, q: 2, gain: 2, time: 0.014, attack: 0.0005 }); // the catch (low)
      scrape(); // the scrape
      ring(out, t, 1700 * p, 0.008, 0.05, 0.05); // (its ring, low, faint under it)
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
