# Cryptic Conqueror: Monsters That Learn

Street Fighter-style one-on-one fights against monsters from world folklore, except the monsters learn. You play **Dakila**, a modern Filipino fighter trained in Kali / Eskrima / Arnis, armed with twin rattan sticks. He travels the world facing its legendary creatures, and **every monster studies how you fight**.

The first stop is home: a Philippine barrio on a blood-moon night, where an **Aswang** hunts. This hackathon build contains that fight. The world-tour map teases the stops ahead (Eastern Europe, Latin America, Greece) and a final boss in Japan.

Every few seconds the game summarizes your habits (jump-ins, turtling, whiffed thrusts, dashes, spacing) and sends that summary to **NVIDIA Nemotron** on **Nebius Token Factory**. Nemotron answers with a tactical plan, and the Aswang changes its behavior to beat you. If you spam jump attacks, it starts swatting you out of the air. If you turtle, it grabs through your guard. If you swing wildly, it baits you into whiffing and punishes the recovery.

The **Aswang Mind** panel next to the arena shows that loop as it runs: **OBSERVE → ADAPT → PLAN**, plus the model, latency, plan history, and the exact telemetry the Aswang sent.

> Hackathon: Nebius × NVIDIA Global AI Hackathon, track **Best Apps and Agents**.

---

## Roadmap

- **Now (hackathon build):** Dakila vs. the Aswang, with Nemotron-driven adaptation, including the **manananggal** transformation (below).
- **Later:** the rest of the world tour, each monster with its own fighting style for Nemotron to adapt:

  | Stop | Monster | Style |
  |---|---|---|
  | Philippines | Aswang → Manananggal | Shapeshifting predator (built) |
  | Eastern Europe | Baba Yaga | Witch who sets traps where you like to walk |
  | Latin America | Chupacabra | Small, fast, wall-jumping biter |
  | Greece | Minotaur | Charging brute, walls that shrink the arena |
  | Michigan, USA | Dogman | Feral stalker |
  | Japan | Kitsune (final boss) | Becomes every monster you have faced, fighting with all their styles and everything they learned about you |

## It grows, and it remembers

- **Levels.** A new player faces a **Level 1** Aswang, gentler than the rest so newcomers can win. Each time the player wins a match it grows a level, up to **Level 5**: more health and damage, faster reactions, and Nemotron replanning more often. Losing never lowers it. Tuning lives in the `LEVELS` table in `public/js/main.js`.

  | Level | Health | Damage | Reactions | Nemotron replans every |
  |---|---|---|---|---|
  | 1 | 100 | 70% | slower | 10 s |
  | 2 | 110 | 85% | a bit slower | 9 s |
  | 3 | 120 | 100% | normal | 8 s |
  | 4 | 135 | 118% | faster | 6.5 s |
  | 5 | 150 | 135% | much faster | 5 s |

- **Memory across matches.** After each match the browser stores a compact summary of the player's habits and which plans worked (`public/js/memory.js`, localStorage only, never sent anywhere but to Nemotron in telemetry). With memory on record, Nemotron is asked for an opening plan before round 1, so the Aswang starts the fight already countering you ("It remembers you from 3 matches…"). The title screen's **Forget me** wipes the memory and resets the level.

## The manananggal transformation

In Philippine folklore the manananggal is a kind of aswang whose upper body tears away from its legs and flies on bat wings. Here, once per round when the Aswang drops below 40% health, it does exactly that:

- The screen shakes and flashes, a **MANANANGGAL!** banner appears, and the torso rises into the air on bat wings (smoke, no gore). Its legs stay standing where it split.
- In flight it **swipes**, **dives**, and **spits bile down** at the player. Hovering low, it can be hit with normal attacks; up high, only jump attacks reach.
- **The legend's weak spot:** hitting the abandoned legs deals 1.5× damage to the flier, so the player has to choose between fighting it and going for the legs while it attacks.
- Nemotron is told about the new form (`aswangForm`, `hitsOnAbandonedLegs` in the telemetry) and is asked for a new plan the moment it transforms. Its intents map onto flight: aggressive intents hover low and dive, defensive ones hover high and spit, and counter/bait hover between the player and its legs to protect them (`public/js/brain.js`, `flyUpdate`).

## Quick start

Requires **Node.js 20+**. No npm dependencies.

```bash
cp .env.example .env          # then put your Nebius Token Factory key in NEBIUS_API_KEY
npm start                     # http://localhost:3000
```

Open http://localhost:3000, press **Enter**, and fight.

Without `NEBIUS_API_KEY` the game still runs, but the panel shows **OFFLINE** and the Aswang fights on its baseline "instinct" profile only. Nothing is faked: no plan is shown unless Nemotron produced it.

Run tests: `npm test`

### Controls

Several layouts work at the same time, so players can use whichever feels natural (W A S D + mouse like Roblox, arrows + Z X C like arcade games, or W A S D + J K L). The first round shows a controls reminder at the bottom of the arena.

| Action | Keyboard / mouse | Gamepad |
|---|---|---|
| Move | `A` `D` or `←` `→` | Left stick / D-pad |
| Jump | `W` / `↑` / `Space` | A |
| Crouch + block | `S` / `↓` (hold): blocks everything except grabs, bile spit included | LB / D-pad down |
| Witik (fast strike) | Left click / `J` / `Z` | X |
| Redonda (heavy spin) | Right click / `K` / `X` | Y |
| Sungkite (long thrust) | `E` / `L` / `C` / middle click | B |
| Lusob (jump strike) | Jump + attack together, or any attack in the air | Jump + attack |
| Walis (low sweep) | Any attack while crouching: knocks down, beats a standing guard | Crouch + attack |
| Dash / dodge | `Shift` | RB / RT |
| Pause / mute | `P` / `M` | — |

---

## How Nemotron is used

```
player behavior ──► Observer (telemetry) ──► /api/strategy ──► Nemotron on Nebius Token Factory
                                                                        │
       Aswang brain (deterministic game code) ◄── validated plan ◄──────┘
       {intent, focus[], observe, adapt, taunt}
```

1. **Observe.** `public/js/observer.js` records combat events: moves used, hits, whiffs, blocks, jumps, dashes, guard time, range and movement percentages, damage both ways. It also records how each past plan performed (damage dealt vs. taken).
2. **Ask.** Every ~8 s of fighting, and between rounds, `public/js/strategist.js` POSTs that summary to `/api/strategy`.
3. **Plan.** The server (`lib/nemotron.js`) sends it to Nemotron through Token Factory's OpenAI-compatible `chat/completions` API. Nemotron must reply with JSON only:
   ```json
   {"observe":"Player jump-attacked 4 times in 8s.","adapt":"Ready the rising claw for every jump-in.",
    "intent":"COUNTER","focus":["ANTI_AIR"],"taunt":"Lipad ka pa?"}
   ```
   The reply is validated against fixed enums. Unknown intents are rejected and text is length-capped. The model's private reasoning is never displayed: thinking is disabled, and any `<think>` block is stripped.
4. **Execute.** `public/js/brain.js` maps the plan onto a tuning profile: reaction time, preferred spacing, and the odds of anti-air, whiff punish, dash punish, guard, grab, spit, pounce, and feints. The normal game engine (`public/js/fighter.js`) still does all movement, collision, damage, and animation. **Nemotron never presses buttons.**

**Intents:** `AGGRESSIVE` · `DEFENSIVE` · `COUNTER` · `ZONE` · `BAIT` · `PRESSURE` · `RETREAT`
**Focus (0–2):** `ANTI_AIR` · `PUNISH_WHIFF` · `PUNISH_DASH` · `GRAB_GUARD` · `KEEP_DISTANCE` · `CLOSE_DISTANCE` · `GUARD_MORE`

The adaptation shows up in three places: the Aswang Mind panel, a callout over the Aswang when its plan changes, and the Aswang's **eye color**, which follows its current intent. The "MIND:" tag under its health bar shows the same thing.

### Where the AI integration lives

| File | Role |
|---|---|
| `lib/nemotron.js` | Prompt, Token Factory call, response parsing and validation |
| `lib/handler.js` | Request handling, config from env, per-client throttle |
| `server.js` | Local zero-dependency server (static files + `/api/strategy`) |
| `api/strategy.js` | Same handler as a Vercel serverless function |
| `public/js/observer.js` | Builds the telemetry summary |
| `public/js/strategist.js` | Calls the API on a timer, drives the Aswang Mind panel |
| `public/js/brain.js` | Turns intent + focus into concrete, deterministic behavior |

### Nebius Token Factory

- Endpoint: `https://api.tokenfactory.nebius.com/v1` (OpenAI-compatible; override with `NEBIUS_BASE_URL`)
- Default model: `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`, chosen for low latency (override with `NEMOTRON_MODEL`, e.g. `nvidia/nemotron-3-super-120b-a12b`)
- Sent with `chat_template_kwargs: {"enable_thinking": false}` for fast, direct answers. If the endpoint rejects that field, the call is retried once without it.
- The API key stays on the server and is never sent to the browser.

---

## Deploying (public demo)

**Vercel:** import the repo, framework preset **Other**, no build command. Add the `NEBIUS_API_KEY` environment variable. `public/` is served statically and `api/strategy.js` becomes the function.

**Any Node host** (Render, Fly.io, a Nebius AI Cloud VM, …): `npm start` with `NEBIUS_API_KEY` and `PORT` set.

---

## Art, audio, and IP

- All characters, the arena, and effects are **drawn procedurally in code** (`public/js/render.js`) in a bold, silly-but-cool cartoon style: thick ink outlines, flat colors, big expressive faces, squash and stretch. No sprite sheets or images from other works.
- All audio is **synthesized at runtime** with WebAudio (`public/js/audio.js`). No recorded or licensed music.
- The Aswang and Kali / Eskrima / Arnis belong to Philippine folklore and martial heritage. Dakila and this Aswang's design are our own interpretations.
- Dakila's look is original: a hoodie, jeans and sneakers, with a red *putong* (headband) and a woven bracelet as nods to his heritage.
- Third-party code: none. See `THIRD_PARTY.md`.

## License

MIT. See `LICENSE`.
