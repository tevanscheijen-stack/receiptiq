# Codex Instructions

## Product Philosophy

ReceiptIQ is NOT accounting software.

ReceiptIQ exists to understand household purchasing behaviour.

Always optimise for user value.

## Development Philosophy

Always build small usable releases.

Every release must provide new user functionality.

Avoid overengineering.

Keep solutions simple.

Don't build speculative features.

## Architecture Rules

Everything runs locally.

macOS-first.

Database is the source of truth.

Original receipts are never modified.

Dashboard visualises data only.

Receipt processing should be modular.

The Processing Engine owns the complete user-facing lifecycle.

Individual processors (OCR, AI extraction, product recognition and future processors) must never expose independent user-facing lifecycle states.

The UI always reflects the overall processing pipeline.

Importers should remain isolated.

Future AI models must be able to reprocess old receipts.

OCR must only recognize text.

Receipt interpretation belongs exclusively to the AI extraction layer.

## AI Principles

Never destroy original information.

Always preserve uploaded files.

Separate extraction from interpretation.

Support future AI improvements.

## Coding Conventions

Readable code.

Explicit over clever.

Keep files small.

Avoid unnecessary abstractions.

Write tests.

Don't break existing APIs.

## Repository Rules

Keep documentation current.

Update CHANGELOG after every approved release.

Update ROADMAP whenever planning changes.

PROJECT explains the product.

CODEX explains how the project must be built.

GitHub is the single source of truth.
