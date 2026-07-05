# ReceiptIQ Architecture

ReceiptIQ is a local-first web application. The backend, frontend, and SQLite database all run on the user's computer.

## Services

- `backend`: FastAPI application with SQLAlchemy, Alembic, and SQLite.
- `frontend`: React, TypeScript, Vite, and TailwindCSS.
- `database`: SQLite file managed by the backend process and Alembic migrations.

## Sprint 1 Scope

This foundation intentionally excludes receipt parsing, AI, OCR, authentication, and accounting workflows.

