import ConfirmDialog from './ui/ConfirmDialog.jsx';

/**
 * Shows a fetched document (object URL) inside the page: PDFs in a viewer, images as a picture,
 * with a button to open it in a new tab. `preview` is { url, type, title } or null.
 */
export default function DocumentPreviewDialog({ preview, onClose }) {
  return (
    <ConfirmDialog
      open={Boolean(preview)}
      title={preview?.title || ''}
      cancelLabel="Close preview"
      confirmLabel="Open in new tab"
      onConfirm={() => window.open(preview.url, '_blank', 'noopener,noreferrer')}
      onCancel={onClose}
    >
      {preview && (preview.type === 'application/pdf'
        ? <iframe title={`Preview of ${preview.title}`} src={preview.url} className="h-[60vh] w-full rounded-lg border" />
        : <img alt={`Preview of ${preview.title}`} src={preview.url} className="max-h-[60vh] w-full rounded-lg object-contain" />)}
    </ConfirmDialog>
  );
}
