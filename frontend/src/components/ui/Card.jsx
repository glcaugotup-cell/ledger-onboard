export default function Card({ className = '', children, title, action }) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-5 shadow-sm ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between">
          {title && <h3 className="text-base font-semibold text-gray-900">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
