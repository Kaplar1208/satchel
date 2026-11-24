/**
 * Satchel — mobile character sheet for Foundry VTT v13-v14 + dnd5e 5.x-6.x
 *
 * On a phone it disables the canvas (on that device only), hides the Foundry UI
 * and shows a touch-friendly sheet that rolls through the native dnd5e API.
 *
 * Per-device mode (localStorage "satchel.mode"): "auto" | "on" | "off".
 * It can also be forced with ?satchel=1 / ?satchel=0 on the /game URL.
 */

const MODULE_ID = "satchel";
const MODE_KEY = "satchel.mode";
const OWNS_NOCANVAS_KEY = "satchel.ownsNoCanvas";
const ACTOR_KEY = "satchel.actor";
const NOCANVAS_KEY = "core.noCanvas";

/* -------------------------------------------- */
/*  Early decision (before Foundry initializes  */
/*  the canvas)                                 */
/* -------------------------------------------- */

function storageGet(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function storageSet(key, value) {
  try { window.localStorage.setItem(key, value); } catch { /* no storage available: carry on */ }
}
function storageRemove(key) {
  try { window.localStorage.removeItem(key); } catch { /* noop */ }
}

function looksLikePhone() {
  const coarse = window.matchMedia?.("(pointer: coarse)").matches;
  const shortSide = Math.min(window.screen.width, window.screen.height);
  return Boolean(coarse) && shortSide < 820;
}

function resolveMode() {
  const param = new URLSearchParams(window.location.search).get("satchel");
  if (param === "1") storageSet(MODE_KEY, "on");
  else if (param === "0") storageSet(MODE_KEY, "off");
  const mode = storageGet(MODE_KEY) ?? "auto";
  if (mode === "on") return true;
  if (mode === "off") return false;
  return looksLikePhone();
}

/* -------------------------------------------- */
/*  Loading screen with diagnostics             */
/*  (phones have no console, so the current     */
/*  stage and any errors are shown here)        */
/* -------------------------------------------- */

// The splash runs before Foundry's i18n is ready, so it carries its own few strings.
const SPLASH_STRINGS = {
  en: { loading: "Loading…", retry: "Retry", exit: "Full Foundry" },
  es: { loading: "Cargando…", retry: "Reintentar", exit: "Foundry completo" }
};
const SPLASH_TEXT = SPLASH_STRINGS[(navigator.language ?? "en").slice(0, 2)] ?? SPLASH_STRINGS.en;

const Splash = {
  el: null,
  stage: "scripts",
  errors: [],
  // Seconds from the start of the /game navigation to each stage.
  marks: { scripts: performance.now() / 1000 },
  t0: Date.now(),
  timer: null,

  mount() {
    const attach = () => {
      if (this.el) return;
      this.el = document.createElement("div");
      this.el.id = "satchel-splash";
      document.body.append(this.el);
      this.el.addEventListener("click", (event) => {
        const action = event.target.closest("[data-splash]")?.dataset.splash;
        if (action === "exit") exitToFoundry();
        else if (action === "retry") window.location.reload();
      });
      this.timer = setInterval(() => this.paint(), 1000);
      this.paint();
    };
    if (document.body) attach();
    else document.addEventListener("DOMContentLoaded", attach, { once: true });

    window.addEventListener("error", (e) => this.error(e.error ?? e.message));
    window.addEventListener("unhandledrejection", (e) => this.error(e.reason));
    for (const hook of ["init", "i18nInit", "setup", "ready"]) {
      Hooks.once(hook, () => this.setStage(hook));
    }
    // Foundry reports errors caught inside other modules' hooks here.
    Hooks.on("error", (location, err) => this.error(err, location));
  },

  setStage(stage) {
    this.stage = stage;
    this.marks[stage] = performance.now() / 1000;
    this.paint();
  },

  error(err, where) {
    const msg = err?.message ?? String(err ?? "?");
    this.errors.push(where ? `[${where}] ${msg}` : msg);
    if (this.errors.length > 6) this.errors.shift();
    this.paint();
  },

  paint() {
    if (!this.el) return;
    const secs = Math.round((Date.now() - this.t0) / 1000);
    const slow = secs > 45;
    const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    this.el.innerHTML = `
      <div class="sat-splash-box">
        <div class="sat-splash-title">Satchel</div>
        <div class="sat-splash-stage">${SPLASH_TEXT.loading} <b>${esc(this.stage)}</b> · ${secs} s</div>
        ${this.errors.length ? `<ul class="sat-splash-errors">${this.errors.map(e => `<li>${esc(e)}</li>`).join("")}</ul>` : ""}
        ${slow || this.errors.length ? `
          <div class="sat-splash-actions">
            <button type="button" data-splash="retry">${SPLASH_TEXT.retry}</button>
            <button type="button" data-splash="exit">${SPLASH_TEXT.exit}</button>
          </div>` : ""}
      </div>`;
  },

  done() {
    clearInterval(this.timer);
    this.el?.remove();
    this.el = null;
  }
};

function exitToFoundry() {
  storageSet(MODE_KEY, "off");
  window.location.href = window.location.pathname; // drop ?satchel=1
}

const SATCHEL_ACTIVE = resolveMode();

// core.noCanvas is a client-scoped setting stored in localStorage as JSON.
// We write it before the canvas reads it (Canvas#initialize, during game setup).
if (SATCHEL_ACTIVE) {
  if (storageGet(NOCANVAS_KEY) !== "true") {
    storageSet(NOCANVAS_KEY, "true");
    storageSet(OWNS_NOCANVAS_KEY, "1");
  }
  document.documentElement.classList.add("satchel-active");
  Splash.mount();
} else if (storageGet(OWNS_NOCANVAS_KEY) === "1") {
  // Leaving Satchel: restore the canvas, but only if we were the ones who disabled it.
  storageSet(NOCANVAS_KEY, "false");
  storageRemove(OWNS_NOCANVAS_KEY);
}

/* -------------------------------------------- */
/*  Utilities                                   */
/* -------------------------------------------- */

const t = (key, data) => data
  ? game.i18n.format(`SATCHEL.${key}`, data)
  : game.i18n.localize(`SATCHEL.${key}`);

const esc = (value) => foundry.utils.escapeHTML(String(value ?? ""));

const signed = (n) => {
  const v = Number(n) || 0;
  return v >= 0 ? `+${v}` : `${v}`;
};

const label = (cfg) => game.i18n.localize(typeof cfg === "string" ? cfg : (cfg?.label ?? ""));

function saveValue(ability) {
  const s = ability?.save;
  return typeof s === "object" ? (s?.value ?? 0) : (s ?? 0);
}

/* -------------------------------------------- */
/*  App                                         */
/* -------------------------------------------- */

const TABS = ["sheet", "attacks", "spells", "features", "inventory"];
const PHYSICAL = ["weapon", "equipment", "consumable", "tool", "container", "loot"];
const DESCRIPTION_CACHE = new Map();

const stripHTML = (html) => {
  const div = document.createElement("div");
  div.innerHTML = (html ?? "").replace(/<br\s*\/?>/gi, " · ");
  return div.textContent.trim();
};

const midiActive = () => Boolean(game.modules.get("midi-qol")?.active);

function activitiesOf(item) {
  const acts = item.system.activities;
  if (!acts) return [];
  return Array.from(acts.values?.() ?? acts).filter(a => a && (a.canUse ?? true));
}

function usesText(uses) {
  if (!uses?.max) return "";
  return `${uses.value ?? 0}/${uses.max}`;
}

/** "DC 13 Dex" for saving-throw activities. */
function saveText(activity) {
  const dc = activity?.save?.dc?.value;
  if (!dc) return "";
  const abilities = [...(activity.save.ability ?? [])]
    .map(k => game.i18n.localize(CONFIG.DND5E.abilities[k]?.abbreviation ?? k)).join("/");
  return `${t("SpellDC")} ${dc}${abilities ? ` ${abilities}` : ""}`;
}

/** Damage/healing and save summary from the first activity that has them. */
function effectText(item) {
  const acts = activitiesOf(item);
  const dmgAct = acts.find(a => a.labels?.damage?.length);
  const dmg = dmgAct ? dmgAct.labels.damage.map(d => d.label ?? d.formula).join(" + ") : "";
  const save = saveText(acts.find(a => a.type === "save"));
  return [save, dmg].filter(Boolean).join(" · ");
}

function rangeText(item) {
  const r = item.system.range;
  if (!r) return "";
  if (r.value) return `${r.value}${r.long ? `/${r.long}` : ""} ${r.units ?? ""}`.trim();
  if (r.reach) return `${r.reach} ${r.units ?? ""}`.trim();
  return item.labels?.range ?? "";
}

/* ---------- inspiration ----------
 * With really-inspired active, Satchel follows its counter (individual or shared pool)
 * and its reroll flow. It doesn't import that module's code: it reads its flags/settings
 * and reuses the "reroll with inspiration" option that module adds to the chat context
 * menu (getChatMessageContextOptions hook). Without it, dnd5e's native yes/no
 * inspiration is used. */

const RI_ID = "really-inspired";
const riActive = () => Boolean(game.modules.get(RI_ID)?.active);

function inspirationInfo(actor) {
  if (riActive()) {
    try {
      const shared = game.settings.get(RI_ID, "poolMode") === "shared";
      const perChar = game.settings.get(RI_ID, "maxPerCharacter") ?? 1;
      const party = game.actors.filter(a => a.type === "character" && a.hasPlayerOwner);
      const countOf = (a) => a.getFlag(RI_ID, "count") ?? 0;
      return shared
        ? { count: party.reduce((s, a) => s + countOf(a), 0), max: perChar * party.length, shared }
        : { count: countOf(actor), max: perChar, shared };
    } catch (err) {
      console.warn(`${MODULE_ID} | really-inspired did not respond as expected`, err);
    }
  }
  return { count: actor.system.attributes?.inspiration ? 1 : 0, max: 1, shared: false };
}

/** The reroll option really-inspired registers in the chat context menu, for one message. */
function riRerollOption(messageId) {
  const options = [];
  Hooks.callAll("getChatMessageContextOptions", document.createElement("div"), options);
  const option = options.find(o => o.group === RI_ID);
  if (!option) return null;
  const li = document.createElement("li");
  li.dataset.messageId = messageId;
  return { option, li };
}

function canRerollWithInspiration(msg, actor) {
  if (game.user.isGM) return false;
  const first = msg.rolls?.[0];
  if (!(first instanceof CONFIG.Dice.D20Roll) && first?.constructor?.name !== "D20Roll") return false;
  if (riActive()) {
    const ri = riRerollOption(msg.id);
    if (ri) return Boolean(ri.option.condition?.(ri.li) ?? true);
  }
  return Boolean(actor?.system.attributes?.inspiration);
}

async function rerollWithInspiration(msg, actor) {
  if (riActive()) {
    const ri = riRerollOption(msg.id);
    if (ri) return ri.option.callback(ri.li);
  }
  // Native dnd5e: spend inspiration and reroll the same formula.
  if (!actor?.system.attributes?.inspiration) return;
  await actor.update({ "system.attributes.inspiration": false });
  const roll = await msg.rolls[0].reroll();
  return roll.toMessage({
    speaker: msg.speaker,
    flavor: `${msg.flavor ?? ""}<br>${t("RerolledWithInspiration")}`
  });
}

/* ---------- stand-in token ----------
 * midi-qol needs the caster's Token for its workflow. Without a canvas it tries to build
 * a real one, which throws (Token needs canvas.dimensions). While Satchel uses an
 * activity, Actor#getActiveTokens returns a stand-in: an object with the Token prototype
 * and the character's TokenDocument, created without running the constructor.
 * It only lives for the duration of the action, so initiative and other modules are
 * not misled. */

let standInDepth = 0;

function standInToken(actor) {
  const scenes = [game.scenes.viewed, game.scenes.active, ...game.scenes.contents].filter(Boolean);
  let doc = null;
  for (const scene of scenes) {
    doc = scene.tokens.find(t => t.actorId === actor.id);
    if (doc) break;
  }
  if (!doc) {
    const scene = scenes[0];
    if (!scene) return null;
    const data = actor.prototypeToken.toObject();
    data.actorId = actor.id;
    doc = new CONFIG.Token.documentClass(data, { parent: scene });
  }
  const token = Object.create(CONFIG.Token.objectClass.prototype);
  Object.defineProperties(token, {
    document: { value: doc },
    scene: { value: doc.parent },
    controlled: { value: false, writable: true }
  });
  return token;
}

function patchActiveTokens() {
  const proto = CONFIG.Actor.documentClass.prototype;
  const original = proto.getActiveTokens;
  proto.getActiveTokens = function(...args) {
    const tokens = original.apply(this, args);
    if (standInDepth > 0 && !tokens.length && !canvas?.ready) {
      const token = standInToken(this);
      if (token) return [token];
    }
    return tokens;
  };
}

async function withStandInToken(fn) {
  standInDepth++;
  try {
    return await fn();
  } finally {
    // midi finishes some steps after use() resolves; leave some margin.
    setTimeout(() => { standInDepth = Math.max(0, standInDepth - 1); }, 5000);
  }
}

class SatchelApp {
  constructor() {
    this.root = null;
    this.actorId = null;
    this.tab = storageGet("satchel.tab") ?? "sheet";
    this.rollMode = "normal"; // normal | advantage | disadvantage
    this.loadSeconds = null;
    this.expanded = new Set();
    this.allSpells = false;
    this.lastActionAt = 0;
    this.seenRolls = new Map(); // messageId → number of rolls already shown
  }

  get actors() {
    const characters = game.actors.filter(a => a.type === "character");
    if (!game.user.isGM) return characters.filter(a => a.isOwner);
    // For the GM: characters owned by at least one player.
    const owned = characters.filter(a => game.users.some(u => !u.isGM && a.testUserPermission(u, "OWNER")));
    return owned.length ? owned : characters;
  }

  get actor() {
    return game.actors.get(this.actorId) ?? null;
  }

  start() {
    this.loadSeconds = (performance.now() / 1000).toFixed(1);
    const list = this.actors;
    const saved = storageGet(ACTOR_KEY);
    this.actorId = list.find(a => a.id === saved)?.id
      ?? game.user.character?.id
      ?? list[0]?.id
      ?? null;
    if (!TABS.includes(this.tab)) this.tab = "sheet";

    this.root = document.createElement("div");
    this.root.id = "satchel";
    document.body.append(this.root);
    this.root.addEventListener("click", this.#onClick.bind(this));
    this.root.addEventListener("change", this.#onChange.bind(this));

    const rerender = (doc, changes) => {
      const actor = doc?.actor ?? doc?.parent ?? doc;
      // really-inspired's shared pool changes when another character is updated.
      const inspirationChanged = changes?.flags?.[RI_ID] !== undefined;
      if (actor?.id === this.actorId || inspirationChanged) this.#scheduleRender();
    };
    for (const hook of ["updateActor", "updateItem", "createItem", "deleteItem",
      "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
      Hooks.on(hook, rerender);
    }

    // Results are read from chat, so native rolls and midi-qol workflows behave the same.
    Hooks.on("createChatMessage", (msg) => this.#onChatMessage(msg));
    Hooks.on("updateChatMessage", (msg) => this.#onChatMessage(msg));

    this.#watchWindows();

    // Foundry only reads module.json at server start, so game.modules may report a stale
    // version after the files are updated. Read the served file instead.
    fetch(foundry.utils.getRoute(`modules/${MODULE_ID}/module.json`), { cache: "no-cache" })
      .then(r => r.json())
      .then(json => { this.fileVersion = json.version; this.#scheduleRender(); })
      .catch(() => {});

    // Compact header while scrolled (with hysteresis so it doesn't flicker at the threshold).
    this.root.addEventListener("scroll", () => {
      const y = this.root.scrollTop;
      const compact = this.root.classList.contains("compact");
      if (!compact && y > 90) this.root.classList.add("compact");
      else if (compact && y < 10) this.root.classList.remove("compact");
    }, { passive: true });

    // If the first render fails, the splash stays up showing the error.
    if (!this.render()) return;
    document.documentElement.classList.add("satchel-ready");
    Splash.done();
  }

  /* ---------- Foundry windows ---------- */

  /**
   * Everything already in <body> at startup (other modules' HUDs) is hidden by CSS.
   * Windows that appear shortly after the player taps something in Satchel (midi's usage
   * dialog, picking a spell slot…) are allowed through and styled for mobile.
   */
  #watchWindows() {
    const allow = (el) => {
      if (!(el instanceof HTMLElement) || el.id?.startsWith("satchel")) return;
      const isWindow = el.matches(".application, .app, dialog, .dialog");
      const recent = Date.now() - this.lastActionAt < 20000;
      if (isWindow && (recent || el.matches(".dialog, dialog"))) el.classList.add("satchel-allow");
    };
    new MutationObserver((mutations) => {
      for (const m of mutations) m.addedNodes.forEach(allow);
    }).observe(document.body, { childList: true });
  }

  /* ---------- results ---------- */

  #onChatMessage(msg) {
    if (!this.root) return;
    if (msg.author?.id !== game.user.id) return;
    if (Date.now() - this.lastActionAt > 60000) return; // rolls that didn't come from Satchel
    const rolls = msg.rolls ?? [];
    const shown = this.seenRolls.get(msg.id) ?? 0;
    if (rolls.length <= shown) return;
    this.seenRolls.set(msg.id, rolls.length);

    // midi appends damage to the attack's message: show all of its rolls together.
    // dnd5e 6 (Foundry v14) moved this from flags.dnd5e to the message's system data.
    const itemId = msg.system?.item?.id ?? msg.flags?.dnd5e?.item?.id;
    const itemName = itemId ? this.actor?.items.get(itemId)?.name : null;
    const title = itemName || stripHTML(msg.flavor) || msg.speaker?.alias || "";
    const parts = rolls.map(roll => {
      const d20 = roll.dice?.find(d => d.faces === 20);
      const isD20 = roll.constructor?.name === "D20Roll" || (d20 && roll.dice.length === 1);
      if (isD20 && d20) {
        const nat = d20.total;
        const crit = nat === 20 ? "crit" : nat === 1 ? "fumble" : "";
        return `<span class="sat-toast-total ${crit}">${roll.total}</span><span class="sat-toast-nat">d20: ${nat}</span>`;
      }
      const types = roll.options?.types ?? (roll.options?.type ? [roll.options.type] : []);
      const typeLabel = types.map(k => label(CONFIG.DND5E.damageTypes?.[k] ?? CONFIG.DND5E.healingTypes?.[k])).filter(Boolean).join(", ");
      return `<span class="sat-toast-total dmg">${roll.total}</span><span class="sat-toast-nat">${esc(typeLabel || roll.formula)}</span>`;
    });
    let reroll = "";
    try {
      if (canRerollWithInspiration(msg, this.actor)) {
        reroll = `<button type="button" class="sat-btn sat-reroll" data-action="inspire" data-message="${msg.id}">★ ${t("RerollInspiration")}</button>`;
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | inspiration check failed`, err);
    }
    this.#toast(`<span class="sat-toast-label">${esc(title)}</span><div class="sat-toast-rolls">${parts.map(p => `<div>${p}</div>`).join("")}</div>${reroll}`,
      "result", reroll ? 12000 : 7000);
  }

  /* ---------- render ---------- */

  #scheduleRender() {
    if (this._renderQueued) return;
    this._renderQueued = true;
    requestAnimationFrame(() => {
      this._renderQueued = false;
      this.render();
    });
  }

  render() {
    if (!this.root) return false;
    try {
      const actor = this.actor;
      const toast = this.root.querySelector(".sat-toast");
      const scroll = this.root.scrollTop;
      this.root.innerHTML = actor ? this.#sheetHTML(actor) : this.#emptyHTML();
      if (toast) this.root.querySelector(".sat-toast")?.replaceWith(toast);
      this.root.scrollTop = scroll;
      return true;
    } catch (err) {
      console.error(`${MODULE_ID} | render failed`, err);
      Splash.error(err, "Satchel render");
      return false;
    }
  }

  #emptyHTML() {
    return `
      <header class="sat-top">
        <div class="sat-title">Satchel</div>
        <button type="button" class="sat-link" data-action="exit">${t("FullFoundry")}</button>
      </header>
      <p class="sat-empty">${t("NoActors")}</p>
      <div class="sat-toast" hidden></div>`;
  }

  #sheetHTML(actor) {
    const sys = actor.system;
    const attr = sys.attributes ?? {};
    const hp = attr.hp ?? {};
    const classes = actor.items
      .filter(i => i.type === "class")
      .map(i => `${esc(i.name)} ${i.system.levels ?? ""}`)
      .join(" · ");

    const picker = this.actors.length > 1
      ? `<select class="sat-picker" data-change="actor">${this.actors.map(a =>
          `<option value="${a.id}" ${a.id === actor.id ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select>`
      : `<div class="sat-name">${esc(actor.name)}</div>`;

    const hpPct = hp.max ? Math.max(0, Math.min(100, Math.round((hp.value / hp.max) * 100))) : 0;
    const dying = hp.max && hp.value <= 0;
    const hasSpells = actor.items.some(i => i.type === "spell");
    const tabs = TABS.filter(tab => tab !== "spells" || hasSpells);
    const tab = tabs.includes(this.tab) ? this.tab : "sheet";

    let body;
    switch (tab) {
      case "attacks": body = this.#attacksHTML(actor); break;
      case "spells": body = this.#spellsHTML(actor); break;
      case "features": body = this.#featuresHTML(actor); break;
      case "inventory": body = this.#inventoryHTML(actor); break;
      default: body = this.#mainHTML(actor);
    }

    const insp = inspirationInfo(actor);
    const inspText = insp.max > 1 ? `${insp.count}/${insp.max}` : (insp.count > 0 ? "★" : "—");

    return `
      <div class="sat-head">
      <header class="sat-top">
        <img class="sat-portrait" src="${esc(actor.img)}" alt="">
        <div class="sat-ident">
          ${picker}
          <div class="sat-sub">${classes || `${t("Level")} ${sys.details?.level ?? "?"}`}</div>
        </div>
        <button type="button" class="sat-link" data-action="exit">${t("FullFoundry")}</button>
      </header>

      <section class="sat-vitals">
        <div class="sat-hp">
          <div class="sat-hp-bar"><span style="width:${hpPct}%"></span></div>
          <div class="sat-hp-text">
            <b>${hp.value ?? 0}</b> / ${hp.max ?? 0} ${t("HP")}
            ${hp.temp ? `<span class="sat-temp">+${hp.temp}</span>` : ""}
          </div>
        </div>
        <div class="sat-stat"><small>${t("AC")}</small><b>${attr.ac?.value ?? "—"}</b></div>
        <button type="button" class="sat-stat sat-tap" data-action="init">
          <small>${t("Init")}</small><b>${signed(attr.init?.total ?? attr.init?.mod)}</b>
        </button>
        <div class="sat-stat sat-insp ${insp.count > 0 ? "on" : ""}"><small>${t("Insp")}</small><b>${inspText}</b></div>
        <div class="sat-stat sat-minor"><small>${t("Prof")}</small><b>${signed(attr.prof)}</b></div>
        <div class="sat-stat sat-minor"><small>${t("Speed")}</small><b>${attr.movement?.walk ?? "—"}</b></div>
      </section>

      ${dying ? this.#deathHTML(actor, true) : ""}

      <div class="sat-sticky">
        <nav class="sat-tabs">
          ${tabs.map(k => `<button type="button" data-action="tab" data-tab="${k}" class="${k === tab ? "active" : ""}">${t(`Tab.${k}`)}</button>`).join("")}
        </nav>
        <nav class="sat-mode" role="radiogroup">
          ${["disadvantage", "normal", "advantage"].map(m => `
            <button type="button" data-action="mode" data-mode="${m}" class="${this.rollMode === m ? "active" : ""} ${m}">
              ${t(m.charAt(0).toUpperCase() + m.slice(1))}
            </button>`).join("")}
        </nav>
      </div>
      </div>

      ${body}

      <footer class="sat-foot">
        ${t("LoadedIn", { s: this.loadSeconds })} · Satchel ${esc(this.fileVersion ?? game.modules.get(MODULE_ID)?.version ?? "")}<br>
        ${Object.entries(Splash.marks).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(" · ")}
        ${Splash.lite ? `<br>${t("LiteMode", { kept: Splash.lite.actorsKept, total: Splash.lite.actors })}` : ""}
      </footer>
      <div class="sat-toast" hidden></div>`;
  }

  /* ---------- tab: sheet ---------- */

  #mainHTML(actor) {
    const sys = actor.system;
    return `
      <section class="sat-card">
        <h2>${t("Abilities")}</h2>
        <p class="sat-hint">${t("AbilitiesHint")}</p>
        <div class="sat-abilities">${this.#abilitiesHTML(sys)}</div>
      </section>

      <section class="sat-card">
        <h2>${t("Skills")}</h2>
        <ul class="sat-skills">${this.#skillsHTML(sys)}</ul>
      </section>

      ${(sys.attributes?.hp?.value ?? 1) > 0 ? this.#deathHTML(actor, false) : ""}`;
  }

  /** Death saves: on top and red at 0 HP; otherwise a low-key card at the end of the sheet. */
  #deathHTML(actor, dying) {
    const death = actor.system.attributes?.death ?? {};
    const pips = (n, cls) => Array.from({ length: 3 }, (_, i) =>
      `<span class="sat-pip ${cls} ${i < (n ?? 0) ? "full" : ""}"></span>`).join("");
    // dnd5e only allows the roll at 0 HP and before 3 successes or 3 failures.
    let status = "";
    if ((death.success ?? 0) >= 3) status = t("Stable");
    else if ((death.failure ?? 0) >= 3) status = t("Dead");
    else if (!dying) status = t("DeathOnlyAtZero");
    const button = status
      ? `<small class="sat-death-status">${status}</small>`
      : `<button type="button" class="sat-btn danger" data-action="death">${t("DeathSave")}</button>`;
    return `
      <section class="sat-card sat-deathcard ${dying ? "dying" : ""}">
        <div class="sat-death-row">
          <div class="sat-death-track">
            <span><small>${t("Successes")}</small>${pips(death.success, "good")}</span>
            <span><small>${t("Failures")}</small>${pips(death.failure, "bad")}</span>
          </div>
          ${button}
        </div>
      </section>`;
  }

  #abilitiesHTML(sys) {
    const cfg = CONFIG.DND5E.abilities;
    return Object.entries(sys.abilities ?? {}).map(([key, abl]) => {
      const c = cfg[key] ?? {};
      const abbr = game.i18n.localize(c.abbreviation ?? key).toUpperCase();
      const prof = abl.proficient ? "prof" : "";
      return `
        <div class="sat-ability">
          <div class="sat-abbr" title="${esc(label(c))}">${esc(abbr)}</div>
          <div class="sat-score">${abl.value ?? 10}</div>
          <button type="button" class="sat-mod" data-action="check" data-key="${key}">${signed(abl.mod)}</button>
          <button type="button" class="sat-save ${prof}" data-action="save" data-key="${key}">
            ${t("Saves")} ${signed(saveValue(abl))}
          </button>
        </div>`;
    }).join("");
  }

  #skillsHTML(sys) {
    const cfg = CONFIG.DND5E.skills;
    const abilities = CONFIG.DND5E.abilities;
    return Object.entries(sys.skills ?? {})
      .map(([key, skl]) => ({ key, skl, name: label(cfg[key]) || key }))
      .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang))
      .map(({ key, skl, name }) => {
        const profClass = { 0.5: "half", 1: "prof", 2: "expert" }[skl.value] ?? "none";
        const abbr = game.i18n.localize(abilities[skl.ability]?.abbreviation ?? skl.ability ?? "");
        return `
          <li>
            <button type="button" class="sat-skill" data-action="skill" data-key="${key}">
              <span class="sat-dot ${profClass}"></span>
              <span class="sat-skill-name">${esc(name)} <small>${esc(abbr)}</small></span>
              <span class="sat-passive">${skl.passive ?? ""} <small>${t("Passive")}</small></span>
              <b>${signed(skl.total)}</b>
            </button>
          </li>`;
      }).join("");
  }

  /* ---------- item rows (shared) ---------- */

  /** Buttons for an item's activities. */
  #activityButtons(item, { only } = {}) {
    let acts = activitiesOf(item);
    if (only) acts = acts.filter(a => only.includes(a.type));
    if (!acts.length) return "";
    const midi = midiActive();
    return acts.map(a => {
      // "Lay on Hands: Heal" → "Heal": the item name is already shown in the row.
      const short = a.name?.startsWith(item.name) ? a.name.slice(item.name.length).replace(/^[\s:–-]+/, "") : a.name;
      const name = acts.length > 1 ? esc(short || a.name) : "";
      if (a.type === "attack" && !midi) {
        return `
          <button type="button" class="sat-btn" data-action="attack" data-item="${item.id}" data-activity="${a.id}">${t("Attack")} ${name}</button>
          <button type="button" class="sat-btn ghost" data-action="damage" data-item="${item.id}" data-activity="${a.id}">${t("Damage")}</button>`;
      }
      const verb = a.type === "attack" ? t("Attack") : item.type === "spell" ? t("Cast") : t("Use");
      return `<button type="button" class="sat-btn" data-action="use" data-item="${item.id}" data-activity="${a.id}">${verb} ${name}</button>`;
    }).join("");
  }

  #descriptionHTML(item) {
    if (!this.expanded.has(item.id)) return "";
    const html = DESCRIPTION_CACHE.get(item.uuid);
    return `<div class="sat-desc">${html ?? `<em>…</em>`}</div>`;
  }

  #itemRow(item, { meta = "", side = "", buttons = "" } = {}) {
    const open = this.expanded.has(item.id) ? "open" : "";
    return `
      <li class="sat-item ${open}">
        <div class="sat-item-head">
          <button type="button" class="sat-item-name" data-action="toggle" data-item="${item.id}">
            <img src="${esc(item.img)}" alt="">
            <span><b>${esc(item.name)}</b>${meta ? `<small>${meta}</small>` : ""}</span>
          </button>
          ${side ? `<div class="sat-item-side">${side}</div>` : ""}
        </div>
        ${buttons ? `<div class="sat-item-actions">${buttons}</div>` : ""}
        ${this.#descriptionHTML(item)}
      </li>`;
  }

  /* ---------- tab: attacks ---------- */

  #attacksHTML(actor) {
    const items = actor.items.filter(i => {
      if (i.type === "spell") return false;
      if (!activitiesOf(i).some(a => a.type === "attack")) return false;
      return i.type !== "weapon" || i.system.equipped !== false;
    }).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

    if (!items.length) return `<section class="sat-card"><p class="sat-empty">${t("NoAttacks")}</p></section>`;

    const rows = items.map(item => {
      const attack = activitiesOf(item).find(a => a.type === "attack");
      const toHit = attack?.labels?.toHit ?? "";
      const dmg = (attack?.labels?.damage ?? []).map(d => esc(d.label ?? d.formula)).join(" + ");
      const meta = [rangeText(item), dmg].filter(Boolean).join(" · ");
      const uses = usesText(item.system.uses);
      const side = `${toHit ? `<b class="sat-big">${esc(toHit)}</b>` : ""}${uses ? `<small>${uses}</small>` : ""}`;
      return this.#itemRow(item, { meta, side, buttons: this.#activityButtons(item) });
    }).join("");

    const note = midiActive() ? `<p class="sat-hint">${t("MidiHint")}</p>` : "";
    return `<section class="sat-card"><h2>${t("Tab.attacks")}</h2>${note}<ul class="sat-items">${rows}</ul></section>`;
  }

  /* ---------- tab: spells ---------- */

  #spellsHTML(actor) {
    const sys = actor.system;
    const spellAttr = sys.attributes?.spell ?? {};
    const abilityKey = sys.attributes?.spellcasting;
    const abilityLabel = abilityKey ? label(CONFIG.DND5E.abilities[abilityKey]) : "";

    // Spell slots.
    const slots = Object.entries(sys.spells ?? {})
      .filter(([, s]) => s?.max > 0)
      .map(([key, s]) => {
        const lvl = key === "pact" ? `${t("Pact")} (${s.level ?? "?"})` : (key.replace("spell", "") );
        const pips = Array.from({ length: s.max }, (_, i) =>
          `<span class="sat-pip ${i < (s.value ?? 0) ? "full" : ""}"></span>`).join("");
        return `
          <div class="sat-slot">
            <span class="sat-slot-lvl">${esc(lvl)}</span>
            <span class="sat-pips">${pips}</span>
            <span class="sat-slot-ctl">
              <button type="button" data-action="slot" data-key="${key}" data-delta="-1">−</button>
              <button type="button" data-action="slot" data-key="${key}" data-delta="1">+</button>
            </span>
          </div>`;
      }).join("");

    const usable = (s) => {
      const lvl = s.system.level ?? 0;
      const method = s.system.method ?? s.system.preparation?.mode;
      const prepared = s.system.prepared ?? s.system.preparation?.prepared;
      if (lvl === 0) return true;
      if (method && method !== "spell" && method !== "prepared") return true; // pact, innate, at-will, ritual
      return Boolean(prepared);
    };
    const spells = actor.items.filter(i => i.type === "spell" && (this.allSpells || usable(i)));
    const byLevel = new Map();
    for (const s of spells) {
      const lvl = s.system.level ?? 0;
      if (!byLevel.has(lvl)) byLevel.set(lvl, []);
      byLevel.get(lvl).push(s);
    }
    const levels = [...byLevel.keys()].sort((a, b) => a - b);

    const groups = levels.map(lvl => {
      const list = byLevel.get(lvl).sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
      const title = lvl === 0 ? t("Cantrips") : `${t("Level")} ${lvl}`;
      const rows = list.map(s => {
        const meta = [s.labels?.activation, rangeText(s), effectText(s),
          s.system.properties?.has?.("concentration") ? t("Concentration") : ""].filter(Boolean).map(esc).join(" · ");
        const prepared = s.system.prepared ?? s.system.preparation?.prepared;
        const side = !usable(s) ? `<small class="sat-muted">${t("NotPrepared")}</small>` : (prepared === 2 ? `<small>★</small>` : "");
        return this.#itemRow(s, { meta, side, buttons: this.#activityButtons(s) });
      }).join("");
      return `<h3>${esc(title)}</h3><ul class="sat-items">${rows}</ul>`;
    }).join("");

    return `
      <section class="sat-card">
        <div class="sat-spell-head">
          <div><small>${t("SpellDC")}</small><b>${spellAttr.dc ?? "—"}</b></div>
          <div><small>${t("SpellAttack")}</small><b>${signed(spellAttr.attack)}</b></div>
          <div><small>${t("SpellAbility")}</small><b>${esc(abilityLabel || "—")}</b></div>
        </div>
        ${slots ? `<div class="sat-slots">${slots}</div>` : ""}
      </section>
      <section class="sat-card">
        <div class="sat-row-between">
          <h2>${t("Tab.spells")}</h2>
          <button type="button" class="sat-link" data-action="allspells">${this.allSpells ? t("OnlyPrepared") : t("AllSpells")}</button>
        </div>
        ${groups || `<p class="sat-empty">${t("NoSpells")}</p>`}
      </section>`;
  }

  /* ---------- tab: features ---------- */

  #featuresHTML(actor) {
    const feats = actor.items.filter(i => i.type === "feat")
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
    if (!feats.length) return `<section class="sat-card"><p class="sat-empty">${t("NoFeatures")}</p></section>`;

    // Group by origin: class, species/race, feat, other.
    const groupOf = (f) => {
      const type = f.system.type?.value;
      if (type) return label(CONFIG.DND5E.featureTypes?.[type]) || type;
      return t("Other");
    };
    const groups = new Map();
    // Limited-use features first: they're the ones checked during play.
    const ordered = [...feats.filter(f => f.system.uses?.max), ...feats.filter(f => !f.system.uses?.max)];
    for (const f of ordered) {
      const g = f.system.uses?.max ? t("LimitedUse") : groupOf(f);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(f);
    }

    const html = [...groups.entries()].map(([g, list]) => {
      const rows = list.map(f => {
        const uses = f.system.uses;
        const recovery = (uses?.recovery ?? []).map(r => label(CONFIG.DND5E.limitedUsePeriods?.[r.period]?.abbreviation
          ?? CONFIG.DND5E.limitedUsePeriods?.[r.period])).filter(Boolean).join(", ");
        const side = uses?.max ? `<b class="sat-big">${uses.value ?? 0}/${uses.max}</b>${recovery ? `<small>${esc(recovery)}</small>` : ""}` : "";
        const meta = esc(f.system.requirements ?? "");
        return this.#itemRow(f, { meta, side, buttons: this.#activityButtons(f) });
      }).join("");
      return `<h3>${esc(g)}</h3><ul class="sat-items">${rows}</ul>`;
    }).join("");

    return `<section class="sat-card"><h2>${t("Tab.features")}</h2>${html}</section>`;
  }

  /* ---------- tab: inventory ---------- */

  #inventoryHTML(actor) {
    const sys = actor.system;
    const cur = sys.currency ?? {};
    const coins = ["pp", "gp", "ep", "sp", "cp"].filter(k => k in cur)
      .map(k => `<div class="sat-coin ${k}"><b>${cur[k] ?? 0}</b><small>${esc(label(CONFIG.DND5E.currencies?.[k]?.abbreviation) || k)}</small></div>`).join("");
    const enc = sys.attributes?.encumbrance;
    const encHTML = enc?.max ? `
      <div class="sat-enc">
        <div class="sat-hp-bar enc"><span style="width:${Math.round(enc.pct ?? 0)}%"></span></div>
        <small>${Math.round((enc.value ?? 0) * 10) / 10} / ${enc.max} ${esc(enc.units ?? "")}</small>
      </div>` : "";

    const items = actor.items.filter(i => PHYSICAL.includes(i.type));
    const groups = PHYSICAL.map(type => {
      const list = items.filter(i => i.type === type).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
      if (!list.length) return "";
      const title = game.i18n.localize(CONFIG.Item.typeLabels?.[type] ?? type);
      const rows = list.map(item => {
        const s = item.system;
        const qty = s.quantity > 1 ? ` ×${s.quantity}` : "";
        const weight = s.weight?.value ? `${s.weight.value} ${s.weight.units ?? ""}` : "";
        const meta = [qty.trim(), weight, s.attuned ? t("Attuned") : ""].filter(Boolean).map(esc).join(" · ");
        const canEquip = "equipped" in s && ["weapon", "equipment", "tool"].includes(item.type);
        const equip = canEquip
          ? `<button type="button" class="sat-equip ${s.equipped ? "on" : ""}" data-action="equip" data-item="${item.id}" title="${t("Equipped")}">${s.equipped ? "✓" : ""}</button>`
          : "";
        const uses = usesText(s.uses);
        const side = `${uses ? `<small>${uses}</small>` : ""}${equip}`;
        const buttons = item.type === "consumable" ? this.#activityButtons(item) : "";
        return this.#itemRow(item, { meta, side, buttons });
      }).join("");
      return `<h3>${esc(title)}</h3><ul class="sat-items">${rows}</ul>`;
    }).join("");

    return `
      <section class="sat-card">
        <div class="sat-coins">${coins}</div>
        ${encHTML}
      </section>
      <section class="sat-card">
        <h2>${t("Tab.inventory")}</h2>
        ${groups || `<p class="sat-empty">${t("NoItems")}</p>`}
      </section>`;
  }

  /* ---------- events ---------- */

  #onChange(event) {
    const el = event.target;
    if (el.dataset.change === "actor") {
      this.actorId = el.value;
      storageSet(ACTOR_KEY, el.value);
      this.expanded.clear();
      this.render();
      this.root.scrollTo({ top: 0 });
    }
  }

  async #onClick(event) {
    const el = event.target.closest("[data-action]");
    if (!el) return;
    const { action, key } = el.dataset;
    this.lastActionAt = Date.now();

    switch (action) {
      case "mode":
        this.rollMode = el.dataset.mode;
        this.root.querySelectorAll(".sat-mode button").forEach(b =>
          b.classList.toggle("active", b.dataset.mode === this.rollMode));
        return;
      case "tab":
        this.tab = el.dataset.tab;
        storageSet("satchel.tab", this.tab);
        this.render();
        return;
      case "exit":
        exitToFoundry();
        return;
      case "allspells":
        this.allSpells = !this.allSpells;
        this.render();
        return;
      case "toggle":
        return this.#toggleDescription(el.dataset.item);
    }

    const actor = this.actor;
    if (!actor) return;
    const adv = {
      advantage: this.rollMode === "advantage",
      disadvantage: this.rollMode === "disadvantage"
    };
    const fast = { configure: false };
    const item = el.dataset.item ? actor.items.get(el.dataset.item) : null;
    const activity = item && el.dataset.activity ? item.system.activities?.get(el.dataset.activity) : null;

    if (action === "inspire") {
      const msg = game.messages.get(el.dataset.message);
      if (!msg) return;
      el.disabled = true;
      try {
        await rerollWithInspiration(msg, actor);
      } catch (err) {
        console.error(`${MODULE_ID} | inspiration reroll failed`, err);
        this.#toast(t("RollFailed"), "error");
      }
      return;
    }

    // Actions that don't roll dice.
    if (action === "equip" && item) {
      return item.update({ "system.equipped": !item.system.equipped });
    }
    if (action === "slot") {
      const slot = actor.system.spells?.[key];
      if (!slot) return;
      const value = Math.clamp((slot.value ?? 0) + Number(el.dataset.delta), 0, slot.max ?? 0);
      return actor.update({ [`system.spells.${key}.value`]: value });
    }

    el.classList.add("busy");
    this.#toast(t("Rolling"));
    try {
      switch (action) {
        case "check": await actor.rollAbilityCheck({ ability: key, ...adv }, fast); break;
        case "save": await actor.rollSavingThrow({ ability: key, ...adv }, fast); break;
        case "skill": await actor.rollSkill({ skill: key, ...adv }, fast); break;
        case "init": await this.#rollInitiative(actor, adv); break;
        case "death": await actor.rollDeathSave({ ...adv }, fast); break;
        case "attack": await activity?.rollAttack({ ...adv }, fast); break;
        case "damage": await activity?.rollDamage({}, fast); break;
        case "use": {
          // midi-qol reads advantage/disadvantage from midiOptions; ignored without midi.
          const usage = { midiOptions: { ...adv } };
          const result = await withStandInToken(() => activity ? activity.use(usage) : item?.use(usage));
          // Without midi, dnd5e leaves damage/healing as a button on the chat card, which
          // isn't visible on the phone, so offer it here.
          if (result && !midiActive()) this.#offerFollowUp(item, activity);
          break;
        }
        default: return;
      }
    } catch (err) {
      console.error(`${MODULE_ID} | ${action} failed`, err);
      this.#toast(t("RollFailed"), "error");
    } finally {
      el.classList.remove("busy");
    }
  }

  #offerFollowUp(item, activity) {
    if (!activity || typeof activity.rollDamage !== "function") return;
    if (activity.type === "attack") return; // attacks already have their own buttons
    const isHeal = activity.type === "heal";
    if (!isHeal && !activity.damage?.parts?.length) return;
    const formula = (activity.labels?.damage ?? []).map(d => d.label ?? d.formula).join(" + ");
    const save = saveText(activity);
    this.#toast(`
      <span class="sat-toast-label">${esc(item.name)}</span>
      ${save ? `<span class="sat-toast-nat">${esc(save)}</span>` : ""}
      <button type="button" class="sat-btn sat-reroll" data-action="damage" data-item="${item.id}" data-activity="${activity.id}">
        ${isHeal ? t("RollHealing") : t("RollDamage")}${formula ? ` · ${esc(formula)}` : ""}
      </button>`, "result", 20000);
  }

  /**
   * Initiative without creating combatants. With no canvas, Actor#rollInitiative can't find
   * the token and adds the character again as a token-less combatant (a duplicate). From
   * the phone we only roll for combatants the GM already added to the encounter.
   */
  async #rollInitiative(actor, adv) {
    const combat = game.combat;
    if (!combat) return this.#toast(t("NoCombat"), "error");
    const mine = combat.combatants.filter(c => c.actorId === actor.id || c.actor === actor);
    if (!mine.length) return this.#toast(t("NotInCombat"), "error");
    if (mine.every(c => c.initiative !== null)) return this.#toast(t("AlreadyInitiative"), "error");

    // Reuse dnd5e's rollInitiativeDialog (advantage, bonuses, chat message) but force
    // createCombatants: false in its inner call to rollInitiative.
    const original = actor.rollInitiative;
    actor.rollInitiative = (options = {}, rollOptions) =>
      original.call(actor, { ...options, createCombatants: false }, rollOptions);
    try {
      await actor.rollInitiativeDialog({ ...adv }, { configure: false });
    } finally {
      delete actor.rollInitiative;
    }
  }

  async #toggleDescription(itemId) {
    const item = this.actor?.items.get(itemId);
    if (!item) return;
    if (this.expanded.has(itemId)) {
      this.expanded.delete(itemId);
      return this.render();
    }
    this.expanded.add(itemId);
    this.render();
    if (!DESCRIPTION_CACHE.has(item.uuid)) {
      let html = "";
      try {
        const TextEditor = foundry.applications.ux.TextEditor.implementation;
        html = await TextEditor.enrichHTML(item.system.description?.value ?? "", {
          relativeTo: item, rollData: item.getRollData?.(), secrets: false
        });
      } catch (err) {
        console.warn(`${MODULE_ID} | enrich failed`, err);
        html = item.system.description?.value ?? "";
      }
      DESCRIPTION_CACHE.set(item.uuid, html || `<em>${t("NoDescription")}</em>`);
      this.render();
    }
  }

  #toast(html, kind = "", ms) {
    const el = this.root?.querySelector(".sat-toast");
    if (!el) return;
    el.className = `sat-toast ${kind}`;
    el.innerHTML = html;
    el.hidden = false;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { el.hidden = true; }, ms ?? (kind === "result" ? 7000 : 2500));
  }
}

/* -------------------------------------------- */
/*  Lite mode                                   */
/*  Foundry sends the whole world to every      */
/*  client and builds all of it in memory. A    */
/*  player's phone only needs the party's       */
/*  characters, so game.data is trimmed before  */
/*  initializeDocuments(). This only affects    */
/*  local memory: nothing is written to the     */
/*  server, and Foundry ignores updates for     */
/*  documents the client doesn't have.          */
/* -------------------------------------------- */

const OWNER = 3;
const ASSISTANT_ROLE = 3;
const KEEP_MESSAGES = 30;

function filterInPlace(arr, keep) {
  if (!Array.isArray(arr)) return 0;
  const before = arr.length;
  let w = 0;
  for (let r = 0; r < arr.length; r++) if (keep(arr[r])) arr[w++] = arr[r];
  arr.length = w;
  return before - w;
}

function applyLiteMode() {
  const data = game.data;
  const userId = game.userId;
  const me = data?.users?.find(u => u._id === userId);
  // GMs (and assistants) need the full world: midi-qol and other modules run actions
  // on their client on behalf of players.
  if (!me || me.role >= ASSISTANT_ROLE) return null;

  const owns = (doc) => ((doc.ownership?.[userId] ?? doc.ownership?.default ?? 0) >= OWNER);
  const myActors = new Set(data.actors.filter(owns).map(a => a._id));
  if (me.character) myActors.add(me.character);

  // Keep the other players' characters too (there are few): really-inspired's shared
  // pool adds up the whole party's inspiration and needs them.
  const playerIds = data.users.filter(u => u.role < ASSISTANT_ROLE).map(u => u._id);
  const isPartyMember = (a) => a.type === "character"
    && playerIds.some(id => (a.ownership?.[id] ?? 0) >= OWNER);

  const stats = { actors: data.actors.length };
  filterInPlace(data.actors, a => myActors.has(a._id) || isPartyMember(a));
  stats.actorsKept = data.actors.length;

  // None of this appears on the sheet; rolls use what is embedded in the actor.
  for (const key of ["items", "journal", "tables", "cards"]) {
    if (Array.isArray(data[key])) data[key].length = 0;
  }
  if (Array.isArray(data.messages) && data.messages.length > KEEP_MESSAGES) {
    data.messages.splice(0, data.messages.length - KEEP_MESSAGES);
  }

  // Scenes aren't drawn without a canvas; keep only the player's tokens
  // (initiative and combat use them).
  for (const scene of data.scenes ?? []) {
    for (const key of ["walls", "lights", "sounds", "notes", "drawings", "tiles", "templates", "regions"]) {
      if (Array.isArray(scene[key])) scene[key].length = 0;
    }
    filterInPlace(scene.tokens, t => myActors.has(t.actorId));
  }
  return stats;
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

if (SATCHEL_ACTIVE) {
  // "init" runs before setupGame() → initializeDocuments().
  Hooks.once("init", () => {
    try {
      const stats = applyLiteMode();
      if (stats) {
        Splash.lite = stats;
        console.log(`${MODULE_ID} | lite mode: kept ${stats.actorsKept}/${stats.actors} actors`);
      }
    } catch (err) {
      console.error(`${MODULE_ID} | lite mode failed`, err);
      Splash.error(err, "Satchel lite");
    }
  });
}

Hooks.once("ready", () => {
  if (game.system.id !== "dnd5e") return;

  if (SATCHEL_ACTIVE) {
    try {
      patchActiveTokens();
      const app = new SatchelApp();
      game.modules.get(MODULE_ID).api = app;
      app.start();
    } catch (err) {
      console.error(`${MODULE_ID} | start failed`, err);
      Splash.error(err, "Satchel start");
    }
    return;
  }

  // On a phone with Satchel turned off: floating button to return to the sheet.
  if (looksLikePhone()) {
    const btn = document.createElement("button");
    btn.id = "satchel-reopen";
    btn.type = "button";
    btn.textContent = t("OpenSatchel");
    btn.addEventListener("click", () => {
      storageSet(MODE_KEY, "auto");
      window.location.reload();
    });
    document.body.append(btn);
  }
});
