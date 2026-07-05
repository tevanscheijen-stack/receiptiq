import { ChangeEvent, DragEvent, useEffect, useRef, useState } from 'react'

type Receipt = {
  id: string
  original_filename: string
  stored_filename: string
  file_extension: string
  mime_type: string
  file_size: number
  upload_timestamp: string
  status: string
  processing_status: string
  processing_started_at: string | null
  processing_finished_at: string | null
  processing_error: string | null
  ocr_status: string
  ocr_started_at: string | null
  ocr_finished_at: string | null
  ocr_error: string | null
  ocr_text: string | null
}

type UploadState = 'idle' | 'uploading' | 'success' | 'error'
type ProcessingState = 'idle' | 'processing'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'
const supportedExtensions = ['PDF', 'PNG', 'JPG', 'JPEG', 'HEIC', 'WEBP', 'HTML']
const allowedExtensions = supportedExtensions.map((extension) =>
  extension.toLowerCase(),
)
const maxFileSize = 25 * 1024 * 1024

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  const kilobytes = bytes / 1024
  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(1)} KB`
  }

  return `${(kilobytes / 1024).toFixed(1)} MB`
}

function formatUploadDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function getExtension(file: File) {
  return file.name.split('.').pop()?.toLowerCase() ?? ''
}

function validateFile(file: File) {
  if (!allowedExtensions.includes(getExtension(file))) {
    return 'ReceiptIQ supports PDF, PNG, JPG, JPEG, HEIC, WEBP, and HTML files.'
  }

  if (file.size > maxFileSize) {
    return 'This receipt is too large. The maximum size is 25 MB.'
  }

  return null
}

function formatProcessingStatus(status: string) {
  const labels: Record<string, string> = {
    uploaded: 'Uploaded',
    queued: 'Queued',
    processing: 'Reading receipt...',
    completed: 'Completed',
    failed: 'Failed',
  }

  return labels[status] ?? 'Uploaded'
}

function formatOcrStatus(status: string) {
  const labels: Record<string, string> = {
    pending: 'Pending',
    processing: 'Recognising text',
    completed: 'Text recognised',
    failed: 'OCR failed',
  }

  return labels[status] ?? 'Pending'
}

function canPreviewAsImage(receipt: Receipt) {
  return ['png', 'jpg', 'jpeg', 'webp', 'heic'].includes(receipt.file_extension)
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-spruce/30 border-t-spruce"
    />
  )
}

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const selectAllRef = useRef<HTMLInputElement>(null)
  const hasLocalReceiptChangesRef = useRef(false)
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [selectedReceiptIds, setSelectedReceiptIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [processingState, setProcessingState] = useState<ProcessingState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [activeReceiptId, setActiveReceiptId] = useState<string | null>(null)
  const [copyMessage, setCopyMessage] = useState<string | null>(null)
  const [lastUploadedReceipt, setLastUploadedReceipt] = useState<Receipt | null>(
    null,
  )
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    fetch(`${apiBaseUrl}/api/v1/receipts`)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Receipt list unavailable')
        }
        return response.json() as Promise<Receipt[]>
      })
      .then((loadedReceipts) => {
        if (!hasLocalReceiptChangesRef.current) {
          setReceipts(loadedReceipts)
        }
      })
      .catch(() => {
        setErrorMessage('ReceiptIQ could not load uploaded receipts.')
      })
  }, [])

  const uploadFile = async (file: File) => {
    const validationError = validateFile(file)
    if (validationError) {
      setUploadState('error')
      setErrorMessage(validationError)
      return
    }

    setUploadState('uploading')
    setErrorMessage(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/receipts/upload`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          detail?: string
        } | null
        throw new Error(body?.detail ?? 'ReceiptIQ could not upload this receipt.')
      }

      const uploadedReceipt = (await response.json()) as Receipt
      hasLocalReceiptChangesRef.current = true
      setLastUploadedReceipt(uploadedReceipt)
      setReceipts((currentReceipts) => [uploadedReceipt, ...currentReceipts])
      setUploadState('success')
    } catch (error) {
      setUploadState('error')
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'ReceiptIQ could not upload this receipt.',
      )
    }
  }

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0]
    if (file) {
      void uploadFile(file)
    }
  }

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleFiles(event.target.files)
    event.target.value = ''
  }

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault()
    setIsDragging(false)
    handleFiles(event.dataTransfer.files)
  }

  const visibleReceiptIds = receipts.map((receipt) => receipt.id)
  const selectedVisibleReceiptIds = visibleReceiptIds.filter((receiptId) =>
    selectedReceiptIds.has(receiptId),
  )
  const selectedReceiptCount = selectedReceiptIds.size
  const allVisibleReceiptsSelected =
    visibleReceiptIds.length > 0 &&
    selectedVisibleReceiptIds.length === visibleReceiptIds.length
  const someVisibleReceiptsSelected =
    selectedVisibleReceiptIds.length > 0 && !allVisibleReceiptsSelected
  const activeReceipt =
    receipts.find((receipt) => receipt.id === activeReceiptId) ?? null
  const activeReceiptOriginalUrl = activeReceipt
    ? `${apiBaseUrl}/api/v1/receipts/${activeReceipt.id}/original`
    : null
  const uploadHeading =
    receipts.length === 0 ? 'Upload your first receipt' : 'Upload another receipt'
  const hasReceiptInProgress = receipts.some((receipt) =>
    ['queued', 'processing'].includes(receipt.processing_status),
  )
  const isProcessingLocked =
    processingState === 'processing' || hasReceiptInProgress

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleReceiptsSelected
    }
  }, [someVisibleReceiptsSelected])

  useEffect(() => {
    setCopyMessage(null)
  }, [activeReceiptId])

  const toggleReceiptSelection = (receiptId: string) => {
    setSelectedReceiptIds((currentSelectedReceiptIds) => {
      const nextSelectedReceiptIds = new Set(currentSelectedReceiptIds)
      if (nextSelectedReceiptIds.has(receiptId)) {
        nextSelectedReceiptIds.delete(receiptId)
      } else {
        nextSelectedReceiptIds.add(receiptId)
      }
      return nextSelectedReceiptIds
    })
  }

  const toggleAllVisibleReceipts = () => {
    setSelectedReceiptIds((currentSelectedReceiptIds) => {
      const nextSelectedReceiptIds = new Set(currentSelectedReceiptIds)

      if (allVisibleReceiptsSelected) {
        visibleReceiptIds.forEach((receiptId) => {
          nextSelectedReceiptIds.delete(receiptId)
        })
      } else {
        visibleReceiptIds.forEach((receiptId) => {
          nextSelectedReceiptIds.add(receiptId)
        })
      }

      return nextSelectedReceiptIds
    })
  }

  const processReceipts = async () => {
    const receiptIds = Array.from(selectedReceiptIds)
    if (receiptIds.length === 0 || isProcessingLocked) {
      return
    }

    setProcessingState('processing')
    setErrorMessage(null)

    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/receipts/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receipt_ids: receiptIds }),
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          detail?: string
        } | null
        throw new Error(
          body?.detail ?? 'ReceiptIQ could not process receipts right now.',
        )
      }

      const processedReceipts = (await response.json()) as Receipt[]
      hasLocalReceiptChangesRef.current = true
      setReceipts(processedReceipts)
      setSelectedReceiptIds(new Set())
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'ReceiptIQ could not process receipts right now.',
      )
      setUploadState('error')
    } finally {
      setProcessingState('idle')
    }
  }

  const processButtonLabel =
    selectedReceiptCount === 0
      ? 'Process selected'
      : `Process selected (${selectedReceiptCount})`

  const copyOcrText = async () => {
    if (!activeReceipt?.ocr_text) {
      return
    }

    try {
      await navigator.clipboard.writeText(activeReceipt.ocr_text)
      setCopyMessage('OCR text copied')
    } catch {
      setCopyMessage('ReceiptIQ could not copy OCR text.')
    }
  }

  return (
    <main className="min-h-screen bg-paper text-ink">
      <section className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-10">
        <header className="mb-10 text-center">
          <h1 className="text-5xl font-semibold tracking-normal">ReceiptIQ</h1>
          <p className="mt-4 text-2xl text-spruce">{uploadHeading}</p>
        </header>

        <input
          ref={fileInputRef}
          aria-label="Choose receipt file"
          className="hidden"
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.heic,.webp,.html"
          onChange={handleInputChange}
        />

        <button
          className={`flex min-h-72 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition ${
            isDragging
              ? 'border-spruce bg-mint/40'
              : 'border-spruce/30 bg-white hover:border-spruce/60'
          }`}
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault()
            setIsDragging(true)
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <span className="text-xl font-semibold text-spruce">
            Drag a receipt here, or click to choose one
          </span>
          <span className="mt-4 text-sm font-medium text-ink/70">
            Supported file types
          </span>
          <span className="mt-2 text-sm text-ink/70">
            {supportedExtensions.join('  ')}
          </span>
          <span className="mt-5 text-sm text-ink/60">Maximum size: 25 MB</span>
          {uploadState === 'uploading' ? (
            <span className="mt-6 text-sm font-semibold text-spruce">
              Uploading receipt...
            </span>
          ) : null}
        </button>

        {uploadState === 'success' && lastUploadedReceipt ? (
          <section
            aria-live="polite"
            className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 px-5 py-4 text-left"
          >
            <h2 className="text-lg font-semibold text-emerald-800">
              ✓ Receipt uploaded successfully
            </h2>
            <dl className="mt-3 grid gap-2 text-sm text-emerald-950 sm:grid-cols-3">
              <div>
                <dt className="font-medium">Original filename</dt>
                <dd>{lastUploadedReceipt.original_filename}</dd>
              </div>
              <div>
                <dt className="font-medium">Upload time</dt>
                <dd>{formatUploadDate(lastUploadedReceipt.upload_timestamp)}</dd>
              </div>
              <div>
                <dt className="font-medium">File size</dt>
                <dd>{formatFileSize(lastUploadedReceipt.file_size)}</dd>
              </div>
            </dl>
          </section>
        ) : null}

        {uploadState === 'error' && errorMessage ? (
          <div
            role="alert"
            className="mt-6 rounded-md border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-medium text-rose-900"
          >
            {errorMessage}
          </div>
        ) : null}

        <section className="mt-10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-2xl font-semibold text-ink">Uploaded receipts</h2>
            <button
              className="rounded-md bg-spruce px-4 py-2 text-sm font-semibold text-white transition hover:bg-spruce/90 disabled:cursor-not-allowed disabled:bg-spruce/40"
              type="button"
              disabled={selectedReceiptCount === 0 || isProcessingLocked}
              onClick={() => void processReceipts()}
            >
              {isProcessingLocked
                ? 'Processing selected...'
                : processButtonLabel}
            </button>
          </div>
          {isProcessingLocked ? (
            <div
              aria-live="polite"
              className="mt-4 flex items-start gap-3 rounded-md border border-spruce/15 bg-white px-4 py-3 text-sm text-ink"
            >
              <Spinner />
              <div>
                <p className="font-semibold text-spruce">Reading receipt...</p>
                <p className="mt-1 text-ink/60">
                  This usually takes a few seconds.
                </p>
              </div>
            </div>
          ) : null}
          <div className="mt-4 overflow-hidden rounded-md border border-spruce/15 bg-white">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-spruce text-white">
                <tr>
                  <th className="w-12 px-4 py-3">
                    <input
                      ref={selectAllRef}
                      aria-label="Select all receipts"
                      checked={allVisibleReceiptsSelected}
                      disabled={receipts.length === 0 || isProcessingLocked}
                      type="checkbox"
                      onChange={toggleAllVisibleReceipts}
                    />
                  </th>
                  <th className="px-4 py-3 font-semibold">Upload date</th>
                  <th className="px-4 py-3 font-semibold">Filename</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Size</th>
                </tr>
              </thead>
              <tbody>
                {receipts.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-ink/60" colSpan={5}>
                      No receipts uploaded yet.
                    </td>
                  </tr>
                ) : (
                  receipts.map((receipt) => (
                    <tr className="border-t border-spruce/10" key={receipt.id}>
                      <td className="px-4 py-3">
                        <input
                          aria-label={`Select ${receipt.original_filename}`}
                          checked={selectedReceiptIds.has(receipt.id)}
                          disabled={isProcessingLocked}
                          type="checkbox"
                          onChange={() => toggleReceiptSelection(receipt.id)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        {formatUploadDate(receipt.upload_timestamp)}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        <button
                          className="text-left font-medium text-spruce underline-offset-4 hover:underline"
                          type="button"
                          onClick={() => setActiveReceiptId(receipt.id)}
                        >
                          {receipt.original_filename}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        {(processingState === 'processing' &&
                          selectedReceiptIds.has(receipt.id)) ||
                        receipt.processing_status === 'processing' ||
                        receipt.processing_status === 'queued' ? (
                          <span className="inline-flex items-center gap-2">
                            <Spinner />
                            Reading receipt...
                          </span>
                        ) : (
                          <span>
                            {formatProcessingStatus(receipt.processing_status)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {formatFileSize(receipt.file_size)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {activeReceipt && activeReceiptOriginalUrl ? (
          <section className="mt-10">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-ink">Receipt</h2>
                <p className="mt-1 text-sm text-ink/60">
                  {activeReceipt.original_filename}
                </p>
              </div>
              <button
                className="rounded-md bg-spruce px-4 py-2 text-sm font-semibold text-white transition hover:bg-spruce/90 disabled:cursor-not-allowed disabled:bg-spruce/40"
                type="button"
                disabled={!activeReceipt.ocr_text}
                onClick={() => void copyOcrText()}
              >
                Copy OCR text
              </button>
            </div>

            <div className="mt-4 grid gap-5 lg:grid-cols-2">
              <div>
                <h3 className="text-lg font-semibold text-ink">Original receipt</h3>
                <div className="mt-3 h-[32rem] overflow-hidden rounded-md border border-spruce/15 bg-white">
                  {canPreviewAsImage(activeReceipt) ? (
                    <img
                      alt={`Original receipt ${activeReceipt.original_filename}`}
                      className="h-full w-full object-contain"
                      src={activeReceiptOriginalUrl}
                    />
                  ) : (
                    <iframe
                      className="h-full w-full"
                      src={activeReceiptOriginalUrl}
                      title={`Original receipt ${activeReceipt.original_filename}`}
                    />
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-ink">
                    Recognised OCR text
                  </h3>
                  <span className="text-sm text-ink/60">
                    {formatOcrStatus(activeReceipt.ocr_status)}
                  </span>
                </div>

                {activeReceipt.ocr_status === 'failed' ? (
                  <div
                    role="alert"
                    className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900"
                  >
                    ReceiptIQ could not recognise text from this receipt.
                  </div>
                ) : null}

                {copyMessage ? (
                  <p className="mt-3 text-sm font-medium text-spruce">
                    {copyMessage}
                  </p>
                ) : null}

                {activeReceipt.ocr_text ? (
                  <pre className="mt-3 h-[32rem] overflow-auto whitespace-pre-wrap rounded-md border border-spruce/15 bg-white p-4 font-mono text-sm leading-6 text-ink">
                    {activeReceipt.ocr_text}
                  </pre>
                ) : (
                  <div className="mt-3 rounded-md border border-spruce/15 bg-white px-4 py-6 text-sm text-ink/60">
                    No OCR text available yet.
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : null}
      </section>
    </main>
  )
}

export default App
