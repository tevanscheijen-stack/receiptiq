import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import App from './App'

const uploadedReceipt = {
  id: 'receipt-1',
  original_filename: 'groceries.pdf',
  stored_filename: 'stored.pdf',
  file_extension: 'pdf',
  mime_type: 'application/pdf',
  file_size: 2048,
  upload_timestamp: '2026-07-05T12:00:00Z',
  status: 'UPLOADED',
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      ...init,
    }),
  )
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => jsonResponse([])))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Receipt upload page', () => {
  test('shows the upload component and supported file types', async () => {
    render(<App />)

    expect(screen.getByText('ReceiptIQ')).toBeInTheDocument()
    expect(screen.getByText('Upload your first receipt')).toBeInTheDocument()
    expect(
      screen.getByText('Drag a receipt here, or click to choose one'),
    ).toBeInTheDocument()
    expect(screen.getByText('PDF PNG JPG JPEG HEIC WEBP HTML')).toBeInTheDocument()
    expect(await screen.findByText('No receipts uploaded yet.')).toBeInTheDocument()
  })

  test('shows upload success and adds the receipt to the list', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(uploadedReceipt), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    const input = screen.getByLabelText('Choose receipt file')
    fireEvent.change(input, {
      target: {
        files: [
          new File(['receipt'], 'groceries.pdf', {
            type: 'application/pdf',
          }),
        ],
      },
    })

    expect(
      await screen.findByText('✓ Receipt uploaded successfully'),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getAllByText('groceries.pdf')).toHaveLength(2),
    )
    expect(screen.getByText('UPLOADED')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/v1/receipts/upload',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  test('shows a friendly message for unsupported files', async () => {
    const fetchMock = vi.fn(() => jsonResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    fireEvent.change(screen.getByLabelText('Choose receipt file'), {
      target: {
        files: [new File(['hello'], 'notes.txt', { type: 'text/plain' })],
      },
    })

    expect(
      await screen.findByText(
        'ReceiptIQ supports PDF, PNG, JPG, JPEG, HEIC, WEBP, and HTML files.',
      ),
    ).toBeInTheDocument()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  })

  test('shows a friendly message for files larger than 25 MB', async () => {
    render(<App />)

    const largeFile = new File(['receipt'], 'large.pdf', {
      type: 'application/pdf',
    })
    Object.defineProperty(largeFile, 'size', {
      value: 25 * 1024 * 1024 + 1,
    })

    fireEvent.change(screen.getByLabelText('Choose receipt file'), {
      target: { files: [largeFile] },
    })

    expect(
      await screen.findByText(
        'This receipt is too large. The maximum size is 25 MB.',
      ),
    ).toBeInTheDocument()
  })
})
