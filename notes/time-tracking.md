# Time-tracking mini pipeline

Created 2026-10-29 21:25 PT. Updated 2026-10-29 21:25 PT.

Pipeline source and exportable installation, architecture, privacy, monitoring and test documentation live on the albot mini at ~/kat-time-tracking/pipeline/README.md. Screen source coverage and exact collector contract are ~/kat-time-tracking/SCREEN-HANDOFF.md.

Hourly launchd label io.kat.time-tracking in gui/502 refreshes local-only audio inference and SHA-verified existing screen exports, then durable idempotent calendar writes to Time Tracking via the existing ahuang5000 grant. Entry point /usr/bin/python3 ~/kat-time-tracking/pipeline/locked.py. New launchd only, no legacy restart. Initial launch requires mini Full Disk/SSH access already provisioned, existing personal Google grant, local whisper.cpp/base.en/Silero files, and quiet SSH access to the existing laptop exporter. No new laptop app or GUI permissions were granted by this pipeline.

Private JSON, raw transcripts and calendar receipts stay ~/kat-time-tracking/private/ mode0700, outside Git. Local transcripts/OCR are never sent to an external model. Calendar receives fixed rule-derived lowercase labels, confidence and hashed evidence identifiers. Preserve all v0. Authorized Oct28-29 generated v1 can be replaced only with a full prior backup and verified intention segmentation; never pad source gaps.

Health ~/kat-time-tracking/private/pipeline-health.json tracks last_attempt, last_success, safe error, source_watermarks, calendar_last_verified and separate calendar_latest_evidence_end. Generic mini stream monitor owns alerting and repair; historical missing capture is not falsely marked repaired.

Migration needs the independent repository, local source collector dependencies, existing Google auth privately, SSH configuration privately, private state/receipts and source cache privately, and launchd plist generation via pipeline/install.py. No secret belongs in Git. Verify a native calendar readback plus a repeat run, not only a loaded job.

## Intention-only writer and intentional pause

The mini writer is paused after rejecting per-speech-chunk calendar blocks. Both ~/kat-time-tracking/private/WRITER-PAUSED and CALENDAR-WRITER-PAUSED are enforced by installer, kernel-lock runner, cycle, mutation wrapper and direct delivery. The source pipeline keeps running locally; no audio completion hook can call Calendar. Resume only after complete local transcript processing, content-reviewed intention candidates and hard writer gates pass. Original owner mandate permits conditional resume without extra permission, never early resume.

The writer reads audio-intention-blocks.json plus optional screen-intention-blocks.json, never raw speech-span JSON. Calendar spans never exclude intentions. Batch median must be >=25min, every event >=5min unless explicit transition, no generic speech/unresolved titles, no real recorder gaps >=5min, no overlaps. Owner Oct28 fixture requires Hux discussion end approx15:35, later onsite tasker directing and separate dinner discussion approx19. Uncertainty remains explicit. Sparse Oct29 mic-check speech correctly yields zero audio intentions, not padding.

Mini read-only preflight is node ~/kat-time-tracking/pipeline/check-intentions.mjs. Independent actual Calendar readback is node ~/kat-time-tracking/pipeline/verify-intentions.mjs. Neither can publish or unpause. Receipts are private/intention-preflight.json and intention-calendar-readback.json. Tests33pass, 10000 seeded scenarios,13/13 targeted semantic mutations; full commands and coverage gaps are in mini pipeline/README.md. Existing native read health is not TT writer health.

Emergency cleanup backed up29remaining generated events plus all17v0 and source JSON at private/revisions/OWNER-STOP-2026-10-30T04-46-54-441Z.json. Removed29 generated events, readback zero generated,17v0 unchanged. Snapshot SHA256 75696a2c2c5a926f8c28f647d4c4be953c6a248529f7897da59eb068d531771f. private/owner-stop-cleanup.json is durable receipt; active rejected queue isolated under an additional revision backup so it cannot replay. All migration still requires private state/cache/config and existing Google grant, never secrets in Git. No new laptop permissions or apps.
