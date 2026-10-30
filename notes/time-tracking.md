# Time-tracking mini pipeline

Created 2026-10-29 21:25 PT. Updated 2026-10-29 21:25 PT.

Pipeline source and exportable installation, architecture, privacy, monitoring and test documentation live on the albot mini at ~/kat-time-tracking/pipeline/README.md. Screen source coverage and exact collector contract are ~/kat-time-tracking/SCREEN-HANDOFF.md.

Hourly launchd label io.kat.time-tracking in gui/502 refreshes local-only audio inference and SHA-verified existing screen exports, then durable idempotent calendar writes to Time Tracking via the existing ahuang5000 grant. Entry point /usr/bin/python3 ~/kat-time-tracking/pipeline/locked.py. New launchd only, no legacy restart. Initial launch requires mini Full Disk/SSH access already provisioned, existing personal Google grant, local whisper.cpp/base.en/Silero files, and quiet SSH access to the existing laptop exporter. No new laptop app or GUI permissions were granted by this pipeline.

Private JSON, raw transcripts and calendar receipts stay ~/kat-time-tracking/private/ mode0700, outside Git. Local transcripts/OCR are never sent to an external model. Calendar receives fixed rule-derived lowercase labels, confidence and hashed evidence identifiers. Preserve all v0 and existing own geometry; never pad source gaps.

Health ~/kat-time-tracking/private/pipeline-health.json tracks last_attempt, last_success, safe error, source_watermarks, calendar_last_verified and separate calendar_latest_evidence_end. Generic mini stream monitor owns alerting and repair; historical missing capture is not falsely marked repaired.

Migration needs the independent repository, local source collector dependencies, existing Google auth privately, SSH configuration privately, private state/receipts and source cache privately, and launchd plist generation via pipeline/install.py. No secret belongs in Git. Verify a native calendar readback plus a repeat run, not only a loaded job.
