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
}

type UploadState = 'idle' | 'uploading' | 'success' | 'error'

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

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const hasLocalReceiptChangesRef = useRef(false)
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
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

  return (
    <main className="min-h-screen bg-paper text-ink">
      <section className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-10">
        <header className="mb-10 text-center">
          <h1 className="text-5xl font-semibold tracking-normal">ReceiptIQ</h1>
          <p className="mt-4 text-2xl text-spruce">Upload your first receipt</p>
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
          <h2 className="text-2xl font-semibold text-ink">Uploaded receipts</h2>
          <div className="mt-4 overflow-hidden rounded-md border border-spruce/15 bg-white">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-spruce text-white">
                <tr>
                  <th className="px-4 py-3 font-semibold">Upload date</th>
                  <th className="px-4 py-3 font-semibold">Filename</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Size</th>
                </tr>
              </thead>
              <tbody>
                {receipts.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-ink/60" colSpan={4}>
                      No receipts uploaded yet.
                    </td>
                  </tr>
                ) : (
                  receipts.map((receipt) => (
                    <tr className="border-t border-spruce/10" key={receipt.id}>
                      <td className="px-4 py-3">
                        {formatUploadDate(receipt.upload_timestamp)}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {receipt.original_filename}
                      </td>
                      <td className="px-4 py-3">{receipt.status}</td>
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
      </section>
    </main>
  )
}

export default App
