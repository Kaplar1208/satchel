# Satchel

![Downloads](https://img.shields.io/github/downloads/Kaplar1208/satchel/total?style=for-the-badge) ![GitHub issues](https://img.shields.io/github/issues/Kaplar1208/satchel?style=for-the-badge) ![GitHub release](https://img.shields.io/github/v/release/Kaplar1208/satchel?style=for-the-badge) ![Foundry Core Compatible Version](https://img.shields.io/badge/dynamic/json.svg?url=https%3A%2F%2Fgithub.com%2FKaplar1208%2Fsatchel%2Freleases%2Flatest%2Fdownload%2Fmodule.json&label=Foundry%20Version&query=$.compatibility.verified&colorB=orange&style=for-the-badge) ![dnd5e Version](https://img.shields.io/badge/dynamic/json.svg?url=https%3A%2F%2Fgithub.com%2FKaplar1208%2Fsatchel%2Freleases%2Flatest%2Fdownload%2Fmodule.json&label=dnd5e&query=$.relationships.systems%5B0%5D.compatibility.verified&colorB=red&style=for-the-badge) ![License](https://img.shields.io/github/license/Kaplar1208/satchel?style=for-the-badge)

A mobile character sheet for **Foundry VTT v13** and the **D&D 5e** system (5.x).

Foundry isn't built for phones: the canvas is heavy and the interface doesn't fit a small screen. When a player opens Foundry on a phone, Satchel replaces the interface with a touch-friendly character sheet. Players can check their character and roll from it, and the rolls land in the Foundry chat like any other roll.

It's a regular Foundry module. It needs no extra server, relay or app.

## Features

- **Automatic on phones.** On a touch device with a small screen, Satchel turns on by itself. The canvas is disabled on that device only; desktops keep the normal Foundry interface.
- **Sheet tab.** Ability checks, saving throws, skills with passives, initiative, and death saves.
- **Attacks tab.** Equipped weapons and anything with an attack activity, with to-hit, damage and range.
- **Spells tab.** Spell DC, attack bonus, spell slots (with manual +/− adjustment), and spells grouped by level. Shows prepared spells by default, with a toggle to show all.
- **Features tab.** Limited-use features first, with remaining uses and recovery period.
- **Inventory tab.** Currency, encumbrance, items by type, equip toggles, and usable consumables.
- **Descriptions.** Tap any item name to expand its full description.
- **Advantage / disadvantage selector.** Stays pinned at the top while scrolling.
- **Results on the phone.** Each roll shows its total and natural d20 (attack and damage side by side), and is posted to chat as usual.
- **Dialogs.** Foundry dialogs triggered from Satchel (spell slot choice, consumption, midi-qol prompts) are shown full-width.
- **Lite mode.** On a player's phone, Satchel skips loading what the sheet doesn't need: NPCs, world items, journals, tables, and scene walls and lights. Large worlds load several times faster. This only affects that phone's memory; nothing is changed on the server. GMs always load the full world.
- **Languages.** English and Spanish, following each user's Foundry language.

## Optional integrations

Satchel works on its own. If these modules are active, it adapts to them:

| Module | What changes |
|---|---|
| [midi-qol](https://foundryvtt.com/packages/midi-qol) | Attacks, spells and features run through midi's workflow, with attack and damage in one tap. Without midi, attack and damage are separate buttons, and spells that deal damage or healing offer a follow-up "Roll damage" / "Roll healing" button. |
| [Really Inspired](https://github.com/Kaplar1208/really-inspired) | The inspiration counter (individual or shared pool) appears in the header, and rolls offer "Reroll with inspiration" using that module's flow. Without it, dnd5e's native inspiration is used. |

## Installation

In Foundry, go to **Add-on Modules → Install Module** and paste this manifest URL:

```
https://raw.githubusercontent.com/Kaplar1208/satchel/main/module.json
```

Then enable **Satchel** in your world's module settings.

## Usage

- **Players:** open your Foundry URL on your phone and log in. Satchel opens automatically.
- **Switching views:** the **Full Foundry** button switches that device back to the normal interface. A floating **Satchel** button brings the sheet back.
- **Forcing a mode:** add `?satchel=1` or `?satchel=0` to the `/game` URL. This is handy for trying Satchel on a desktop.
- **Initiative:** the GM adds tokens to the combat from a desktop as usual. Players then roll initiative from Satchel. Satchel never adds combatants itself.
- **Targeting:** phones have no canvas, so players can't pick targets. The GM resolves hits and applies damage.

## Notes

- Satchel needs the world to be running, like any Foundry client.
- First load on a phone downloads every active module's scripts, just like a desktop would. Later loads are faster if your server or reverse proxy lets browsers cache static files.

## License

[MIT](LICENSE)
