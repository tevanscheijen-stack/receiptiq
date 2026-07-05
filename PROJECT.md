# ReceiptIQ Project

## Vision

ReceiptIQ helps households understand purchasing behaviour over time.

ReceiptIQ is not accounting software.

## Goals

- Understand household spending
- Understand purchasing behaviour
- Keep complete purchase history
- Provide AI insights
- Keep everything local

## Scope

ReceiptIQ helps households collect, preserve, process, and understand receipts.

The product stores original receipt files, records receipt metadata in a local database, and will grow into a tool that extracts purchase information, visualises patterns, and provides household-focused insights.

ReceiptIQ intentionally does not replace accounting software. It does not manage business ledgers, tax filings, invoices, payroll, or bookkeeping workflows. It is also not a banking product. Bank transactions may become an import source later, but the product focus remains household purchasing behaviour.

## Design Principles

- macOS-first
- Local-first
- No cloud
- User owns the data
- Original receipts are always preserved
- Database is the source of truth
- Dashboard visualises data only
- AI models should be replaceable
- Old receipts must always be reprocessable

## Functional Overview

ReceiptIQ is built around a few major functional areas:

- Receipt intake: users add receipts from supported file types.
- Original storage: uploaded receipt files are preserved unchanged.
- Receipt registration: every receipt is recorded in SQLite with stable metadata.
- OCR recognition: ReceiptIQ converts supported receipt files into plain text.
- AI extraction: future releases will interpret OCR text into structured purchase information.
- Product intelligence: future releases will understand products, quantities, prices, and categories.
- Dashboard: future releases will visualise stored data without becoming the source of truth.
- Insights: future releases will help households understand trends, habits, and opportunities.

## Supported File Types

Current:

- PDF
- PNG
- JPG
- JPEG
- HEIC
- WEBP
- HTML

Future possibilities:

- EML
- MSG
- CSV
