# voice-ai-worker

AI telephone agent for Acoustic. Handles inbound calls when human staff is
unavailable (outside business hours, or all operators busy), speaks Uzbek
(with Russian fallback), collects lead data, and pushes everything back to
the CRM through the existing internal endpoints — **no new backend modules
are required**.

```
Caller → FreePBX → (Time Condition / Queue timeout) → AGI(agi://host:4573)
                                                            │
                                                            ▼
                                              voice-ai-worker (this app)
                                                ├── AGI TCP server
                                                ├── Google STT (streaming)
                                                ├── Claude conversation
                                                ├── Google TTS (female uz-UZ)
                                                ├── CRM internal endpoints
                                                └── Telegram notifier
```

## Why this exists (vs. the other workers)

| Worker | Job |
|---|---|
| `telephony-worker` | Translates AMI events into CRM call lifecycle. **Per-tenant, persistent AMI socket.** |
| `ai-worker` | After-the-fact transcription + QA scoring on completed calls. **Async BullMQ consumer.** |
| **`voice-ai-worker`** | **Real-time** AI conversation during a live call. **AGI TCP server, one connection per call.** |

The three are independent processes. voice-ai-worker reuses the other workers'
shared HTTP shape (the `X-Worker-Secret` header on the CRM's internal
endpoints) and the same env keys for Google credentials and the Claude API.

## What's new vs. the spec in `acoustic_voice_ai_prompt.md`

- **No `asterisk-agi` dependency.** AGI is small enough to host in
  `src/agi/agi-protocol.ts` (raw line-based protocol).
- **No `acoustic_db` writes.** We never touch the Acoustic Analytics database.
  Every call is captured through the CRM's `/api/v1/internal/calls/{started,
  completed}` lifecycle, which already runs the Contact/Card auto-creation,
  Telegram notifier, missed-call → callback Task — for free.
- **Reuses the existing Claude HTTP shape** (`x-api-key`, `anthropic-version`
  `2023-06-01`) and the same defaults as `ai-worker`'s `ClaudeLlmAdapter`.

## Quick start

1. Install deps:
   ```bash
   cd /var/www/acoustic-crm
   pnpm install
   pnpm --filter @acoustic-crm/voice-ai-worker build
   ```

2. Provision Google Cloud credentials (Speech-to-Text + Text-to-Speech APIs
   enabled on the same project), drop the JSON key file somewhere readable,
   and point `GOOGLE_APPLICATION_CREDENTIALS` at it.

3. Set the env vars listed in [Configuration](#configuration) below.

4. Wire FreePBX (see [FreePBX dialplan](#freepbx-dialplan)).

5. Launch via pm2 (an `acoustic-voice-ai-worker` entry was added to
   `ecosystem.config.cjs`):
   ```bash
   pm2 start ecosystem.config.cjs --only acoustic-voice-ai-worker
   ```

## Configuration

All env vars are read at boot. The variables prefixed `VOICE_AI_*` are
specific to this worker; the rest are shared with the other workers.

| Var | Default | Purpose |
|---|---|---|
| `VOICE_AI_TENANT_ID` | _required_ | CRM tenant calls are attributed to. |
| `VOICE_AI_AGI_PORT` | `4573` | TCP port FreePBX dials with `AGI(agi://…)`. |
| `VOICE_AI_AGI_HOST` | `0.0.0.0` | Bind address. |
| `VOICE_AI_RECORDINGS_DIR` | `/var/spool/asterisk/voice-ai` | Where the AGI `RECORD FILE` command writes per-turn audio. **Must be writable by Asterisk and readable by this worker** (same machine, or NFS). |
| `VOICE_AI_GREETING_SOUND` | `acoustic/greeting-uz` | Asterisk sound name (no extension) played before the conversation starts. Falls back to TTS if missing. |
| `VOICE_AI_TRANSFER_CONTEXT` | _unset_ | Dialplan context the agent jumps into on `action=transfer` (e.g. `from-internal,9000,1` to enter a queue). |
| `VOICE_AI_MAX_TURNS` | `18` | Safety cap — hang up after this many user/assistant turns. |
| `VOICE_AI_MAX_SILENCE_MS` | `3000` | RECORD FILE VAD silence cut-off. |
| `VOICE_AI_MAX_TURN_MS` | `30000` | Hard cap on a single user utterance. |
| `VOICE_AI_CLAUDE_MODEL` | `claude-opus-4-7` | Override for cheaper/faster experiments (`claude-haiku-4-5-20251001`, etc). |
| `VOICE_AI_STT_MODEL` | `phone_call` | Google STT acoustic model. |
| `VOICE_AI_WEBHOOK_SECRETS` | _unset_ | JSON map `{"<tenantId>":"<secret>"}` — when set, we additionally POST a Lead with the AI-collected data to `/api/v1/leads/webhook/:tenantId/voice-ai`. |
| `VOICE_AI_INBOUND_NUMBER` | DID from AGI | Number we report as `toNumber` for the Call row. |
| `VOICE_AI_TELEGRAM_BOT_TOKEN` | _unset_ | If set, posts a per-call summary to Telegram. |
| `VOICE_AI_TELEGRAM_BRANCH_CHATS` | _unset_ | JSON map `{"Sebzor":-100123}` — branch-specific chat fan-out. |
| `VOICE_AI_TELEGRAM_MASTER_CHAT_ID` | _unset_ | Master call-center chat (every call goes here). |
| `BUSINESS_HOURS_START` / `_END` / `BUSINESS_DAYS` / `BUSINESS_TZ` | `9` / `18` / `1,2,3,4,5,6` / `Asia/Tashkent` | Used in agent's "ertaga soat 9 dan" line. |
| `BACKEND_URL` | `http://localhost:3005` | CRM backend (same as the other workers). |
| `TELEPHONY_WORKER_SECRET` | _required_ | Shared secret for the CRM's `internal` endpoints. |
| `ANTHROPIC_API_KEY` | _required_ | Claude API key. |
| `GOOGLE_APPLICATION_CREDENTIALS` | _required_ | Path to Google Cloud service-account JSON. |
| `TTS_CACHE_DIR` | `/tmp/voice-ai-tts-cache` | Disk cache for synthesized prompts. |

## FreePBX dialplan

`extensions_custom.conf`:

```ini
[acoustic-ai-ivr]
exten => s,1,NoOp(Acoustic Voice AI inbound)
 same => n,Answer()
 same => n,Set(MONITOR_FILENAME=${UNIQUEID})
 same => n,MixMonitor(${UNIQUEID}.wav,b)
 same => n,AGI(agi://127.0.0.1:4573)
 same => n,Hangup()
```

In the FreePBX GUI:

1. **Inbound Route** → Set Destination to the Time Condition.
2. **Time Conditions** → `acoustic-business-hours`, Mon–Sat 09:00–18:00.
   - **In hours** → Queue (operators).
   - **Out of hours** → Custom Destinations → `acoustic-ai-ivr,s,1`.
3. **Queue** → set `Agent Timeout` to ~20 s; on timeout/no agents, fail
   over to the same `acoustic-ai-ivr,s,1` Custom Destination.

`MixMonitor` is optional — it records the call so the existing
`ai-worker` STT/QA pipeline can rate the AI's performance afterwards.

## What happens during a call

1. FreePBX opens a TCP connection to `:4573`, sends env headers
   (`agi_callerid`, `agi_uniqueid`, `agi_dnid`, …).
2. We `ANSWER`, play the pre-recorded greeting (or TTS fallback).
3. Loop:
   - `RECORD FILE` the caller's utterance (VAD silence cut-off) into
     `VOICE_AI_RECORDINGS_DIR/turn-<uniqueid>-<N>.sln16`.
   - Stream the file to Google STT (`phone_call` model, uz-UZ primary, ru-RU
     alternative).
   - Send transcript + conversation history to Claude with the system prompt
     from `src/ai/system-prompt.ts`.
   - Parse the JSON envelope `{speak, action, collected, confidence, notes}`.
   - Synthesize `speak` via Google TTS (uz-UZ-Wavenet-A / ru-RU-Wavenet-C),
     cache by MD5(text+voice), `STREAM FILE` it.
   - If `action ∈ {save_to_crm, transfer, end}` → exit loop.
4. POST `/api/v1/internal/calls/{started,completed}` so the call shows up in
   the CRM exactly like an operator-handled one (Contact + Card created
   automatically by the existing backend logic).
5. (Optional) POST a Lead with all collected data to
   `/api/v1/leads/webhook/:tenantId/voice-ai`.
6. Send a Telegram summary to the branch chat (and the master call-center
   chat) so a human picks up tomorrow morning.

## Limitations / explicit non-goals

- **Not low-latency streaming TTS.** Each turn waits for Claude + TTS to
  finish before STREAM FILE plays. Typical end-to-end latency is 1.5–3 s on a
  good network — acceptable for a callback-style IVR, not for interruption-
  friendly dialogue. Real bidirectional streaming would need AudioSocket or
  WebRTC and is out of scope.
- **No medical, legal, or pricing advice.** Hard-coded in the system prompt
  and reinforced by the JSON envelope — these always route to a human.
- **One tenant per process.** Run one pm2 instance per tenant if you have
  more than one Acoustic-style customer. The CRM remains multi-tenant.
