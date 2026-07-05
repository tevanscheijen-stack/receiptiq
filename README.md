# ReceiptIQ

ReceiptIQ helps households understand their spending by analysing receipts over time.

ReceiptIQ runs on your Mac. Your data stays on your computer.

ReceiptIQ is not accounting software.

## Install ReceiptIQ on macOS

1. Clone this repository.

2. Open Terminal in the ReceiptIQ folder.

3. Run:

```bash
./scripts/setup_mac.sh
```

4. When setup is finished, run:

```bash
./scripts/start_mac.sh
```

ReceiptIQ will open in your browser automatically.

## Stop ReceiptIQ

Run:

```bash
./scripts/stop_mac.sh
```

## Start ReceiptIQ Again

Run:

```bash
./scripts/start_mac.sh
```

## Reset the Local Database

This deletes the local ReceiptIQ database and creates a fresh one.

Run:

```bash
./scripts/reset_database.sh
```

## Uploading Receipts

Start ReceiptIQ:

```bash
./scripts/start_mac.sh
```

Your browser opens automatically.

To upload a receipt:

1. Drag a receipt file onto the upload area, or click the upload area to choose a file.
2. Wait for the success message.
3. The receipt appears in the uploaded receipts list.

ReceiptIQ stores the original file on your Mac.

Supported file types:

- PDF
- PNG
- JPG
- JPEG
- HEIC
- WEBP
- HTML

Maximum file size: 25 MB.

ReceiptIQ does not read, parse, or analyse the receipt yet. This release only stores the original uploaded file.

## If Setup Says Something Is Missing

The setup script checks for:

- Python 3.13 or newer
- Node.js 22 or newer
- pnpm

If one is missing, the script explains how to install it.

## Local Addresses

ReceiptIQ opens here:

```text
http://localhost:5173
```

The backend health check is here:

```text
http://localhost:8000/health
```

## For Developers

Docker files are still included for developers, but Docker is not required to use ReceiptIQ.

Run checks:

```bash
./scripts/check.sh
```

Start with Docker, if you specifically want Docker:

```bash
docker compose up --build
```
