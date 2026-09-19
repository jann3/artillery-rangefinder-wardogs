(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const el = {
    youX: $("youX"), youY: $("youY"),
    tgtX: $("tgtX"), tgtY: $("tgtY"),
    spX: $("spX"), spY: $("spY"), spBrg: $("spBrg"), spRng: $("spRng"), spBrgDir: $("spBrgDir"),
    spotterOn: $("spotterOn"),
    rowYou: $("rowYou"), rowTarget: $("rowTarget"), rowSpotter: $("rowSpotter"),
    empty: $("empty"), solutionWrap: $("solutionWrap"), dial: $("dial"),
    outBearing: $("outBearing"), outBearingSub: $("outBearingSub"),
    outRange: $("outRange"), outRangeSub: $("outRangeSub"),
    rangeCard: $("rangeCard"),
    chipMortar: $("chipMortar"), chipArty: $("chipArty"),
    bandMortar: $("bandMortar"), bandArty: $("bandArty"),
    marker: $("marker"), scale: $("scale"), verdict: $("verdict"),
    status: $("status"), mathLive: $("mathLive"), copyBtn: $("copyBtn")
  };

  const METRES_PER_UNIT = 100;

  const MORTAR = { name: "L81 Mortar", min: 52, max: 685 };
  const ARTY   = { name: "SPH-2 Artillery", min: 745, max: 2660 };
  const TRACK_MAX = 2800;   // metres shown across the full width

  let lastSolution = null;

  // Copying only makes sense once there is a complete bearing and range.
  function setSolution(sol) {
    lastSolution = sol;
    el.copyBtn.disabled = !sol;
  }

  /* ---------- helpers ---------- */

  const num = (input) => {
    const v = parseFloat(String(input.value).replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(v) ? v : null;
  };

  const pct = (m) => Math.max(0, Math.min(100, (m / TRACK_MAX) * 100));

  function say(msg, isError) {
    el.status.textContent = msg || "";
    el.status.classList.toggle("err", !!isError);
  }

  function bearingText(deg) {
    return String(Math.round(deg) % 360).padStart(3, "0");
  }

  // Eight 45° sectors centred on the compass points, split on the exact bearing:
  // 22.4 is N (shown 022), 22.5 is NE (shown 023), so the letters always match the digits.
  const sector = (deg) => Math.round(deg / 45) % 8;

  function compassPoint(deg) {
    const pts = ["north","north-east","east","south-east","south","south-west","west","north-west"];
    return pts[sector(deg)];
  }

  function compassAbbr(deg) {
    return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][sector(deg)];
  }

  /* ---------- pasting ---------- */

  function numbersIn(text) {
    const found = String(text).match(/-?\d+(?:\.\d+)?/g);
    return found ? found.map(Number) : [];
  }

  function fillRow(row, x, y) {
    if (row === "you")     { el.youX.value = x; el.youY.value = y; }
    if (row === "target")  { el.tgtX.value = x; el.tgtY.value = y; }
    if (row === "spotter") { el.spX.value = x;  el.spY.value = y;  }
  }

  function nextField(row) {
    if (row === "you") return el.spotterOn.checked ? el.spX : el.tgtX;
    if (row === "target") return null;
    if (row === "spotter") return el.spBrg;
    return null;
  }

  function handlePastedText(row, text) {
    const n = numbersIn(text);
    if (n.length < 2) return false;

    if (row === "you" && n.length >= 4 && !el.spotterOn.checked) {
      fillRow("you", n[0], n[1]);
      fillRow("target", n[2], n[3]);
      say("Both positions filled.");
      recalc();
      return true;
    }

    fillRow(row, n[0], n[1]);
    const nxt = nextField(row);
    if (nxt && !nxt.disabled && !nxt.readOnly) {
      nxt.focus();
      nxt.select();
      say("Co-ordinates filled. Moved to the next field.");
    } else {
      say("Co-ordinates filled.");
    }
    recalc();
    return true;
  }

  document.querySelectorAll("input[data-row]").forEach((input) => {
    input.addEventListener("paste", (ev) => {
      const text = (ev.clipboardData || window.clipboardData).getData("text");
      if (handlePastedText(input.dataset.row, text)) ev.preventDefault();
    });
  });

  document.querySelectorAll(".paste-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (!handlePastedText(btn.dataset.paste, text)) {
          say("No co-ordinates found on the clipboard.", true);
        }
      } catch (e) {
        say("Clipboard blocked by the browser. Paste into a field instead.", true);
      }
    });
  });

  /* ---------- maths ---------- */

  function solve(you, target) {
    const dx = target.x - you.x;
    const dy = target.y - you.y;
    const units = Math.hypot(dx, dy);
    let bearing = Math.atan2(dx, dy) * 180 / Math.PI;
    if (bearing < 0) bearing += 360;
    return { dx, dy, units, metres: units * METRES_PER_UNIT, bearing };
  }

  function targetFromSpotter(sp, bearingDeg, rangeM) {
    const r = rangeM / METRES_PER_UNIT;
    const rad = bearingDeg * Math.PI / 180;
    return { x: sp.x + r * Math.sin(rad), y: sp.y + r * Math.cos(rad) };
  }

  /* ---------- weapon envelope check ---------- */

  function assess(m) {
    const inMortar = m >= MORTAR.min && m <= MORTAR.max;
    const inArty   = m >= ARTY.min   && m <= ARTY.max;

    if (inMortar) {
      return { ok: true, weapon: MORTAR, inMortar, inArty,
        text: "In range for the <strong>L81 Mortar</strong>. " +
              Math.round(MORTAR.max - m) + " M below max range." };
    }
    if (inArty) {
      return { ok: true, weapon: ARTY, inMortar, inArty,
        text: "In range for the <strong>SPH-2 Artillery</strong>. " +
              Math.round(m - ARTY.min) + " M above min range." };
    }

    if (m < MORTAR.min) {
      return { ok: false, inMortar, inArty,
        text: "<strong>Too close.</strong> The L81 needs at least " + MORTAR.min +
              " M. Move back " + Math.ceil(MORTAR.min - m) + " M." };
    }
    if (m > MORTAR.max && m < ARTY.min) {
      return { ok: false, inMortar, inArty,
        text: "<strong>Dead band.</strong> Too far for the L81 (max " + MORTAR.max +
              " M) and too close for the SPH-2 (min " + ARTY.min + " M). Move " +
              Math.ceil(m - MORTAR.max) + " M closer for the mortar or " +
              Math.ceil(ARTY.min - m) + " M back for the artillery." };
    }
    return { ok: false, inMortar, inArty,
      text: "<strong>Out of range.</strong> The SPH-2 reaches " + ARTY.max +
            " M. Move " + Math.ceil(m - ARTY.max) + " M closer." };
  }

  function paintEnvelopes(m, a) {
    el.chipMortar.classList.toggle("is-live", a.inMortar);
    el.chipArty.classList.toggle("is-live", a.inArty);
    el.bandMortar.classList.toggle("is-live", a.inMortar);
    el.bandArty.classList.toggle("is-live", a.inArty);

    el.marker.style.left = pct(m) + "%";
    el.marker.classList.toggle("is-out", !a.ok);

    el.rangeCard.classList.toggle("is-out", !a.ok);

    el.verdict.innerHTML = a.text;
    el.verdict.classList.toggle("is-out", !a.ok);
  }

  function layoutTrack() {
    el.bandMortar.style.left  = pct(MORTAR.min) + "%";
    el.bandMortar.style.width = (pct(MORTAR.max) - pct(MORTAR.min)) + "%";
    el.bandArty.style.left    = pct(ARTY.min) + "%";
    el.bandArty.style.width   = (pct(ARTY.max) - pct(ARTY.min)) + "%";

    el.scale.innerHTML =
      '<span class="edge-l">0 M</span>' +
      '<span class="pair-l" style="left:' + pct(MORTAR.max) + '%">' + MORTAR.max + '</span>' +
      '<span class="pair-r" style="left:' + pct(ARTY.min) + '%">' + ARTY.min + '</span>' +
      '<span class="edge-r">' + ARTY.max + ' M</span>';
  }

  /* ---------- spotter ---------- */

  // Compass letters beside the spotter's bearing, e.g. 235 shows SW.
  function updateBearingSuffix() {
    const brg = num(el.spBrg);
    el.spBrgDir.textContent = brg !== null && brg >= 0 && brg <= 360 ? compassAbbr(brg) : "";
  }

  /* An input's rendered text width is invisible to CSS, so mirror the value in
     a hidden span that borrows the same typography and measure that instead.
     One span serves every field; it is only ever read synchronously. */
  const unitMirror = document.createElement("span");
  unitMirror.setAttribute("aria-hidden", "true");
  unitMirror.style.cssText =
    "position:absolute;left:-9999px;top:0;white-space:pre;pointer-events:none";
  document.body.appendChild(unitMirror);

  // Parks the unit just past the value, and hides it when there is nothing to label.
  function placeUnit(input) {
    const field = input.closest(".field");
    const unit = field && field.querySelector(".field-suffix");
    if (!unit) return;

    const show = input.value.trim() !== "" && unit.textContent.trim() !== "";
    field.classList.toggle("has-unit", show);
    if (!show) return;

    const cs = getComputedStyle(input);
    unitMirror.style.fontFamily = cs.fontFamily;
    unitMirror.style.fontSize = cs.fontSize;
    unitMirror.style.fontWeight = cs.fontWeight;
    unitMirror.style.fontStyle = cs.fontStyle;
    unitMirror.style.letterSpacing = cs.letterSpacing;
    unitMirror.style.fontVariantNumeric = cs.fontVariantNumeric;
    unitMirror.textContent = input.value;

    const border = parseFloat(cs.borderLeftWidth);
    const x = border + parseFloat(cs.paddingLeft) + unitMirror.offsetWidth + 6;
    // never let an unexpectedly long value push the unit out of the box
    const limit = border + input.clientWidth - parseFloat(cs.paddingRight) - unit.offsetWidth;
    field.style.setProperty("--suffix-x", Math.min(x, limit) + "px");
  }

  function setSpotterEnabled(on) {
    [el.spX, el.spY, el.spBrg, el.spRng].forEach((i) => { i.disabled = !on; });
    el.rowSpotter.classList.toggle("is-off", !on);

    el.tgtX.readOnly = on;
    el.tgtY.readOnly = on;
    el.rowTarget.classList.toggle("is-derived", on);
    document.querySelector('.paste-btn[data-paste="target"]').disabled = on;
    document.querySelector('.paste-btn[data-paste="spotter"]').disabled = !on;

    if (on && !el.spX.value) el.spX.focus();
    recalc();
  }

  el.spotterOn.addEventListener("change", () => {
    setSpotterEnabled(el.spotterOn.checked);
    say(el.spotterOn.checked
      ? "Spotter on. Target co-ordinates now come from the spotter's call."
      : "Spotter off. Enter the target co-ordinates.");
  });

  /* ---------- recalc ---------- */

  function recalc() {
    updateBearingSuffix();
    placeUnit(el.spBrg);
    placeUnit(el.spRng);

    const you = { x: num(el.youX), y: num(el.youY) };
    const youOK = you.x !== null && you.y !== null;
    el.rowYou.classList.toggle("is-filled", youOK);

    let target = null;

    if (el.spotterOn.checked) {
      const sp = { x: num(el.spX), y: num(el.spY) };
      const brg = num(el.spBrg);
      const rng = num(el.spRng);
      const spOK = sp.x !== null && sp.y !== null && brg !== null && rng !== null;
      el.rowSpotter.classList.toggle("is-filled", spOK);

      const brgBad = brg !== null && (brg < 0 || brg > 360);
      const rngBad = rng !== null && rng <= 0;
      el.spBrg.classList.toggle("is-bad", brgBad);
      el.spRng.classList.toggle("is-bad", rngBad);

      if (spOK && !brgBad && !rngBad) {
        target = targetFromSpotter(sp, brg, rng);
        el.tgtX.value = target.x.toFixed(2);
        el.tgtY.value = target.y.toFixed(2);
      } else {
        el.tgtX.value = "";
        el.tgtY.value = "";
      }
    } else {
      const t = { x: num(el.tgtX), y: num(el.tgtY) };
      if (t.x !== null && t.y !== null) target = t;
    }

    el.rowTarget.classList.toggle("is-filled", !!target);

    if (!youOK || !target) {
      el.solutionWrap.hidden = true;
      el.empty.hidden = false;
      setSolution(null);
      el.mathLive.textContent = "";
      return;
    }

    const s = solve(you, target);

    if (s.units === 0) {
      el.solutionWrap.hidden = true;
      el.empty.hidden = false;
      say("You and the target are on the same spot.", true);
      setSolution(null);
      return;
    }

    el.empty.hidden = true;
    el.solutionWrap.hidden = false;

    el.outBearing.textContent = bearingText(s.bearing) + " " + compassAbbr(s.bearing);
    el.outBearingSub.textContent = s.bearing.toFixed(2) + "° true · " + compassPoint(s.bearing);

    el.outRange.textContent = Math.round(s.metres).toLocaleString() + " M";
    el.outRangeSub.textContent = s.units.toFixed(4) + " grid units · dx " +
      s.dx.toFixed(2) + ", dy " + s.dy.toFixed(2);

    const a = assess(s.metres);
    paintEnvelopes(s.metres, a);

    el.mathLive.innerHTML = "Right now: <code>" + s.dx.toFixed(2) + "² + " + s.dy.toFixed(2) +
      "² = " + (s.dx * s.dx + s.dy * s.dy).toFixed(4) + "</code>, square root <code>" +
      s.units.toFixed(5) + "</code>, times 100 = <code>" + s.metres.toFixed(1) + " M</code>.";

    setSolution({ you, target, s, a });
    drawDial(you, s);
  }

  /* ---------- dial ---------- */

  const NS = "http://www.w3.org/2000/svg";
  function mk(tag, attrs) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  function drawDial(you, s) {
    const svg = el.dial;
    while (svg.childNodes.length > 1) svg.removeChild(svg.lastChild);

    const cx = 116, cy = 116, R = 96, plotR = 78;
    // Colours live in the #dial CSS rules; is-out swaps the accent to red.
    svg.classList.toggle("is-out", !!(lastSolution && !lastSolution.a.ok));

    svg.appendChild(mk("circle", { class: "face", cx, cy, r: R, "stroke-width": 1 }));
    svg.appendChild(mk("circle", { class: "ring", cx, cy, r: plotR * 0.5,
      "stroke-width": 1, "stroke-dasharray": "2 4" }));

    for (let a = 0; a < 360; a += 15) {
      const major = a % 45 === 0;
      const rad = a * Math.PI / 180;
      const r1 = R - (major ? 9 : 4);
      svg.appendChild(mk("line", {
        class: major ? "tick major" : "tick",
        x1: cx + r1 * Math.sin(rad), y1: cy - r1 * Math.cos(rad),
        x2: cx + R * Math.sin(rad), y2: cy - R * Math.cos(rad),
        "stroke-width": major ? 1.5 : 1
      }));
    }

    // All eight labels share one ring. The intercardinals are smaller and
    // dimmer so they name the diagonal spokes without crowding N/E/S/W.
    [["N", 0], ["NE", 45], ["E", 90], ["SE", 135],
     ["S", 180], ["SW", 225], ["W", 270], ["NW", 315]].forEach(([lab, a]) => {
      const rad = a * Math.PI / 180, lr = R - 20;
      const ordinal = lab.length === 2;
      const t = mk("text", {
        class: lab === "N" ? "cardinal north" : (ordinal ? "cardinal ordinal" : "cardinal"),
        x: cx + lr * Math.sin(rad), y: cy - lr * Math.cos(rad) + (ordinal ? 3 : 4),
        "text-anchor": "middle",
        "font-family": "'Saira Condensed', sans-serif",
        "font-size": ordinal ? 9.5 : 13, "font-weight": 600, "letter-spacing": "0.08em"
      });
      t.textContent = lab;
      svg.appendChild(t);
    });

    let maxD = s.units;
    let spSol = null;

    if (el.spotterOn.checked) {
      const sp = { x: num(el.spX), y: num(el.spY) };
      if (sp.x !== null && sp.y !== null) {
        spSol = solve(you, sp);
        maxD = Math.max(maxD, spSol.units);
      }
    }

    const place = (bearing, d) => {
      const rad = bearing * Math.PI / 180;
      const r = (d / maxD) * plotR;
      return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
    };

    const tg = place(s.bearing, s.units);

    if (spSol && spSol.units > 0) {
      const sp = place(spSol.bearing, spSol.units);
      svg.appendChild(mk("line", { class: "spot-link", x1: sp.x, y1: sp.y, x2: tg.x, y2: tg.y,
        "stroke-width": 1.5, "stroke-dasharray": "3 4" }));
      svg.appendChild(mk("line", { class: "spot-ray", x1: cx, y1: cy, x2: sp.x, y2: sp.y,
        "stroke-width": 1 }));
      svg.appendChild(mk("circle", { class: "spot-dot", cx: sp.x, cy: sp.y, r: 4.5,
        "stroke-width": 1.8 }));
      const lab = mk("text", { class: "spot-label", x: sp.x, y: sp.y - 10, "text-anchor": "middle",
        "font-family": "'Saira Condensed', sans-serif", "font-size": 10,
        "letter-spacing": "0.1em" });
      lab.textContent = "SPOT";
      svg.appendChild(lab);
    }

    const arcR = 34;
    const endRad = s.bearing * Math.PI / 180;
    const large = s.bearing > 180 ? 1 : 0;
    svg.appendChild(mk("path", {
      class: "arc",
      d: "M " + cx + " " + (cy - arcR) + " A " + arcR + " " + arcR + " 0 " + large + " 1 " +
         (cx + arcR * Math.sin(endRad)) + " " + (cy - arcR * Math.cos(endRad)),
      "stroke-width": 2
    }));

    svg.appendChild(mk("line", { class: "north-line", x1: cx, y1: cy - plotR - 6, x2: cx, y2: cy,
      "stroke-width": 1, "stroke-dasharray": "3 3" }));

    svg.appendChild(mk("line", { class: "heading", x1: cx, y1: cy, x2: tg.x, y2: tg.y,
      "stroke-width": 2.5, "stroke-linecap": "round" }));

    svg.appendChild(mk("circle", { class: "target-halo", cx: tg.x, cy: tg.y, r: 9 }));
    svg.appendChild(mk("circle", { class: "target-dot", cx: tg.x, cy: tg.y, r: 4.5 }));

    svg.appendChild(mk("circle", { class: "you-dot", cx, cy, r: 5.5, "stroke-width": 2 }));
    svg.appendChild(mk("circle", { class: "you-pip", cx, cy, r: 1.6 }));
  }

  /* ---------- popovers ---------- */

  function closeAllPopovers() {
    document.querySelectorAll(".popover[data-open='true']").forEach((p) => {
      p.dataset.open = "false";
      const trig = document.querySelector('.help[data-pop="' + p.id + '"]');
      if (trig) trig.setAttribute("aria-expanded", "false");
    });
  }

  // Shift an open popover sideways if it would run off the edge of the screen.
  function keepOnScreen(pop) {
    pop.style.removeProperty("--nudge");
    const box = pop.getBoundingClientRect();
    const gutter = 12;
    const right = document.documentElement.clientWidth - gutter;
    let nudge = 0;
    if (box.left < gutter) nudge = gutter - box.left;
    else if (box.right > right) nudge = right - box.right;
    if (nudge) pop.style.setProperty("--nudge", Math.round(nudge) + "px");
  }

  document.querySelectorAll(".help").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const pop = document.getElementById(btn.dataset.pop);
      const open = pop.dataset.open === "true";
      closeAllPopovers();
      pop.dataset.open = String(!open);
      btn.setAttribute("aria-expanded", String(!open));
      if (!open) keepOnScreen(pop);
    });
  });

  document.addEventListener("click", (ev) => {
    if (!ev.target.closest(".popover")) closeAllPopovers();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") closeAllPopovers();
  });

  /* ---------- how-to screenshots ---------- */

  const copyHowtoBtn = $("copyHowtoBtn");
  const copyHowto = $("copyHowto");

  copyHowtoBtn.addEventListener("click", () => {
    const open = copyHowtoBtn.getAttribute("aria-expanded") !== "true";
    copyHowtoBtn.setAttribute("aria-expanded", String(open));
    copyHowto.hidden = !open;
  });

  // Until a screenshot exists, hide the broken image so the placeholder shows.
  copyHowto.querySelectorAll("img").forEach((img) => {
    const missing = () => { img.hidden = true; };
    img.addEventListener("error", missing);
    if (img.complete && img.naturalWidth === 0) missing();
  });

  /* ---------- actions ---------- */

  el.copyBtn.addEventListener("click", async () => {
    if (!lastSolution) return;
    const { s } = lastSolution;
    /* Name the gun the target is in range for; a target in the dead band or
       beyond either gun gets the bearing and range on their own. */
    const m = s.metres;
    let prefix = "";
    if (m >= MORTAR.min && m <= MORTAR.max) prefix = "Mortar ";
    else if (m >= ARTY.min && m <= ARTY.max) prefix = "Artillery ";
    const text = prefix + "Bearing " + bearingText(s.bearing) + " " + compassAbbr(s.bearing) +
                 ", Range (RNG) " + Math.round(m) + " M";
    try {
      await navigator.clipboard.writeText(text);
      say("Copied: " + text);
    } catch (e) {
      say("Clipboard blocked by the browser. Read the solution from the screen.", true);
    }
  });

  $("clearBtn").addEventListener("click", () => {
    [el.youX, el.youY, el.tgtX, el.tgtY, el.spX, el.spY, el.spBrg, el.spRng]
      .forEach((i) => { i.value = ""; i.classList.remove("is-bad"); });
    el.spotterOn.checked = false;
    setSpotterEnabled(false);
    say("Cleared.");
    el.youX.focus();
  });

  /* ---------- wiring ---------- */

  [el.youX, el.youY, el.tgtX, el.tgtY, el.spX, el.spY, el.spBrg, el.spRng]
    .forEach((i) => i.addEventListener("input", recalc));

  document.querySelectorAll("input[data-row]").forEach((i) => {
    i.addEventListener("focus", () => {
      document.querySelectorAll(".row").forEach((r) => r.classList.remove("is-active"));
      const row = i.closest(".row");
      if (row) row.classList.add("is-active");
    });
    i.addEventListener("blur", () => {
      const row = i.closest(".row");
      if (row) setTimeout(() => row.classList.remove("is-active"), 60);
    });
  });

  document.querySelectorAll("input[type='text']").forEach((i) => {
    i.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      const all = Array.from(document.querySelectorAll("input[type='text']"))
        .filter((x) => !x.disabled && !x.readOnly && x.offsetParent !== null);
      const idx = all.indexOf(i);
      if (idx > -1 && idx < all.length - 1) all[idx + 1].focus();
      else i.blur();
    });
  });

  layoutTrack();
  setSpotterEnabled(false);
  recalc();

  // the webfonts change how wide a value renders, so measure again once they land
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { placeUnit(el.spBrg); placeUnit(el.spRng); });
  }

  /* ---------- footer ---------- */

  /* Throwaway lines that cycle on click. Each load draws a random handful of them
     in a random order, one per backdrop change across two laps of the backdrops,
     and once they have all been shown the footer settles on the ko-fi link and
     stays there. Every click advances the backdrop, so the 6th click is both the
     second lap finishing and the one that brings up the link. */
  const FOOTER_LINES = [
    "Other rangefinding tools are available",
    "Please mortar responsibly",
    "Tally-ho, lads",
    "Do not forget your dogs of war",
    "Just as the founding fathers intended",
    "They're using artillery on us!",
    "Do you know who's in command here?",
    "Verify range to target, one ping only",
    "Have mercy"
  ];
  const FOOTER_LAST = { text: "Buy me a coffee here.", href: "https://ko-fi.com/jann3" };
  const BG_COUNT = 3;
  const BG_LAPS = 2;                        // go round the backdrops twice...
  const LINE_COUNT = BG_COUNT * BG_LAPS;    // ...showing one line per stop, then the link

  // Fisher–Yates over a copy, then keep the first LINE_COUNT
  function pickLines(pool, n) {
    const a = pool.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a.slice(0, n);
  }

  const footerEl = $("footer");
  const root = document.documentElement;
  const lines = pickLines(FOOTER_LINES, LINE_COUNT);
  let clicks = 0;
  let bgIdx = Number(root.dataset.bg) || 1;

  // resolved against css/style.css, where the custom property is consumed
  const bgUrl = (n) => "url('../images/background" + n + "-blur.webp')";

  // CSS owns the duration; read it back so the two never drift apart.
  function swapMs() {
    const v = getComputedStyle(root).getPropertyValue("--bg-swap").trim();
    const n = parseFloat(v);
    if (!n) return 0;
    return /ms$/.test(v) ? n : n * 1000;
  }

  /* Ride the incoming image in on html::before, then hand it to the base layer
     and clear the top one behind what is now an identical picture. */
  function advanceBackdrop() {
    bgIdx = (bgIdx % BG_COUNT) + 1;
    root.style.setProperty("--bg-next", bgUrl(bgIdx));
    root.classList.add("bg-swap");
    window.setTimeout(() => {
      root.style.setProperty("--bg-image", bgUrl(bgIdx));
      root.classList.remove("bg-swap");
    }, swapMs());
  }

  function lineButton(text) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "footer-msg";
    b.textContent = text;
    b.addEventListener("click", cycleFooter);
    return b;
  }

  function beerLink() {
    const a = document.createElement("a");
    a.className = "footer-msg";
    a.href = FOOTER_LAST.href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = FOOTER_LAST.text;
    return a;
  }

  /* The line swaps instantly — only the backdrop behind it cross-fades. */
  function swapFooter(node, keepFocus) {
    footerEl.replaceChildren(node);
    if (keepFocus) node.focus();   // keyboard users stay on the line they were on
  }

  function cycleFooter(ev) {
    const keepFocus = document.activeElement === ev.currentTarget;
    advanceBackdrop();
    clicks += 1;
    if (clicks < lines.length) {
      swapFooter(lineButton(lines[clicks]), keepFocus);
    } else {
      swapFooter(beerLink(), keepFocus);
    }
  }

  footerEl.replaceChildren(lineButton(lines[0]));
})();
