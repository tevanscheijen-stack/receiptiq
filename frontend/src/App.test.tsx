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
  processing_status: 'uploaded',
  processing_started_at: null,
  processing_finished_at: null,
  processing_error: null,
  ocr_status: 'pending',
  ocr_started_at: null,
  ocr_finished_at: null,
  ocr_error: null,
  ocr_text: null,
}

const secondUploadedReceipt = {
  ...uploadedReceipt,
  id: 'receipt-2',
  original_filename: 'pharmacy.pdf',
  stored_filename: 'stored-2.pdf',
}

const completedReceipt = {
  ...uploadedReceipt,
  processing_status: 'completed',
  processing_started_at: '2026-07-05T12:01:00Z',
  processing_finished_at: '2026-07-05T12:01:01Z',
  processing_error: null,
  ocr_status: 'completed',
  ocr_started_at: '2026-07-05T12:01:00Z',
  ocr_finished_at: '2026-07-05T12:01:01Z',
  ocr_error: null,
  ocr_text: 'Milk\nBread\nCoffee',
}

const secondCompletedReceipt = {
  ...secondUploadedReceipt,
  processing_status: 'completed',
  processing_started_at: '2026-07-05T12:01:00Z',
  processing_finished_at: '2026-07-05T12:01:01Z',
  processing_error: null,
  ocr_status: 'completed',
  ocr_started_at: '2026-07-05T12:01:00Z',
  ocr_finished_at: '2026-07-05T12:01:01Z',
  ocr_error: null,
  ocr_text: 'Aspirin',
}

const failedOcrReceipt = {
  ...uploadedReceipt,
  processing_status: 'failed',
  processing_error: 'ReceiptIQ could not read this receipt.',
  ocr_status: 'failed',
  ocr_started_at: '2026-07-05T12:01:00Z',
  ocr_finished_at: '2026-07-05T12:01:01Z',
  ocr_error: 'ReceiptIQ could not read this receipt.',
  ocr_text: null,
}

const processingReceipt = {
  ...uploadedReceipt,
  processing_status: 'processing',
  processing_started_at: '2026-07-05T12:01:00Z',
  processing_finished_at: null,
  processing_error: null,
  ocr_status: 'processing',
  ocr_started_at: '2026-07-05T12:01:00Z',
  ocr_finished_at: null,
  ocr_error: null,
  ocr_text: null,
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
  Object.assign(navigator, {
    clipboard: {
      writeText: vi.fn(() => Promise.resolve()),
    },
  })
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
    expect(screen.getByText('Uploaded')).toBeInTheDocument()
    expect(screen.queryByText(/OCR:/)).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/v1/receipts/upload',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  test('renders friendly processing status labels', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse([completedReceipt])))

    render(<App />)

    expect(await screen.findByText('Completed')).toBeInTheDocument()
    expect(screen.queryByText(/OCR:/)).not.toBeInTheDocument()
    expect(screen.getByText('groceries.pdf')).toBeInTheDocument()
  })

  test('manually processes uploaded receipts and updates statuses', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([uploadedReceipt]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([completedReceipt]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    expect(await screen.findByText('Uploaded')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Select groceries.pdf'))
    fireEvent.click(screen.getByRole('button', { name: 'Process selected (1)' }))

    expect(await screen.findByText('Completed')).toBeInTheDocument()
    expect(screen.queryByText(/OCR:/)).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/v1/receipts/process',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ receipt_ids: ['receipt-1'] }),
      }),
    )
    expect(screen.getByLabelText('Select groceries.pdf')).not.toBeChecked()
  })

  test('shows a spinner while receipt text is being read', async () => {
    let finishProcessing: (response: Response) => void = () => undefined
    const processingPromise = new Promise<Response>((resolve) => {
      finishProcessing = resolve
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([uploadedReceipt]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockReturnValueOnce(processingPromise)
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    fireEvent.click(await screen.findByLabelText('Select groceries.pdf'))
    fireEvent.click(screen.getByRole('button', { name: 'Process selected (1)' }))

    expect(screen.getAllByText('Reading receipt...').length).toBeGreaterThan(0)
    expect(
      screen.getByText('This usually takes a few seconds.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Processing selected...' }),
    ).toBeDisabled()

    finishProcessing(
      new Response(JSON.stringify([completedReceipt]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    expect(await screen.findByText('Completed')).toBeInTheDocument()
  })

  test('shows only the overall processing status in the receipt overview', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse([processingReceipt])))

    render(<App />)

    expect((await screen.findAllByText('Reading receipt...')).length).toBeGreaterThan(
      0,
    )
    expect(screen.queryByText(/OCR:/)).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Processing selected...' }),
    ).toBeDisabled()
  })

  test('keeps the process button disabled until receipts are selected', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse([uploadedReceipt])))

    render(<App />)

    const processButton = await screen.findByRole('button', {
      name: 'Process selected',
    })
    expect(processButton).toBeDisabled()

    fireEvent.click(screen.getByLabelText('Select groceries.pdf'))

    expect(
      screen.getByRole('button', { name: 'Process selected (1)' }),
    ).toBeEnabled()
  })

  test('supports selecting one or multiple receipts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse([uploadedReceipt, secondUploadedReceipt])),
    )

    render(<App />)

    fireEvent.click(await screen.findByLabelText('Select groceries.pdf'))
    expect(
      screen.getByRole('button', { name: 'Process selected (1)' }),
    ).toBeEnabled()

    fireEvent.click(screen.getByLabelText('Select pharmacy.pdf'))
    expect(
      screen.getByRole('button', { name: 'Process selected (2)' }),
    ).toBeEnabled()
  })

  test('select all and deselect all toggle visible receipts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse([uploadedReceipt, secondUploadedReceipt])),
    )

    render(<App />)

    const selectAll = await screen.findByLabelText('Select all receipts')
    fireEvent.click(selectAll)

    expect(screen.getByLabelText('Select groceries.pdf')).toBeChecked()
    expect(screen.getByLabelText('Select pharmacy.pdf')).toBeChecked()
    expect(
      screen.getByRole('button', { name: 'Process selected (2)' }),
    ).toBeEnabled()

    fireEvent.click(selectAll)

    expect(screen.getByLabelText('Select groceries.pdf')).not.toBeChecked()
    expect(screen.getByLabelText('Select pharmacy.pdf')).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Process selected' })).toBeDisabled()
  })

  test('process button can be used again after processing finishes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([uploadedReceipt]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([completedReceipt]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    fireEvent.click(await screen.findByLabelText('Select groceries.pdf'))
    fireEvent.click(screen.getByRole('button', { name: 'Process selected (1)' }))

    expect(await screen.findByText('Completed')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Select groceries.pdf'))

    expect(
      screen.getByRole('button', { name: 'Process selected (1)' }),
    ).toBeEnabled()
  })

  test('select all shows the native indeterminate state for partial selection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse([uploadedReceipt, secondUploadedReceipt])),
    )

    render(<App />)

    const selectAll = (await screen.findByLabelText(
      'Select all receipts',
    )) as HTMLInputElement
    fireEvent.click(screen.getByLabelText('Select groceries.pdf'))

    expect(selectAll.indeterminate).toBe(true)
  })

  test('clears all selections after successful processing', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([uploadedReceipt, secondUploadedReceipt]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([completedReceipt, secondCompletedReceipt]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    fireEvent.click(await screen.findByLabelText('Select all receipts'))
    fireEvent.click(screen.getByRole('button', { name: 'Process selected (2)' }))

    await screen.findAllByText('Completed')
    expect(screen.getByLabelText('Select groceries.pdf')).not.toBeChecked()
    expect(screen.getByLabelText('Select pharmacy.pdf')).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Process selected' })).toBeDisabled()
  })

  test('opens a receipt detail view with original receipt and OCR text', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse([completedReceipt])))

    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'groceries.pdf' }))

    expect(screen.getByRole('heading', { name: 'Receipt' })).toBeInTheDocument()
    expect(screen.getByText('Original receipt')).toBeInTheDocument()
    expect(screen.getByText('Recognised OCR text')).toBeInTheDocument()
    expect(
      screen.getByText((_, element) => element?.textContent === 'Milk\nBread\nCoffee'),
    ).toBeInTheDocument()
  })

  test('copies OCR text from the receipt detail view', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse([completedReceipt])))

    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'groceries.pdf' }))
    fireEvent.click(screen.getByRole('button', { name: 'Copy OCR text' }))

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'Milk\nBread\nCoffee',
      ),
    )
    expect(await screen.findByText('OCR text copied')).toBeInTheDocument()
  })

  test('shows a friendly OCR failure message in the receipt detail view', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse([failedOcrReceipt])))

    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'groceries.pdf' }))

    expect(
      screen.getByText('ReceiptIQ could not recognise text from this receipt.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy OCR text' })).toBeDisabled()
  })

  test('changes the upload heading when receipts already exist', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse([uploadedReceipt])))

    render(<App />)

    expect(await screen.findByText('Upload another receipt')).toBeInTheDocument()
    expect(screen.queryByText('Upload your first receipt')).not.toBeInTheDocument()
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
