export function MenuSkeleton() {
  return (
    <div className="space-y-6 px-4 py-4" aria-busy="true" aria-label="Loading the menu">
      <div className="skeleton h-6 w-40 rounded-lg" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card overflow-hidden">
            <div className="skeleton aspect-[4/3] w-full" />
            <div className="space-y-2 p-3">
              <div className="skeleton h-4 w-3/4 rounded" />
              <div className="skeleton h-3 w-full rounded" />
              <div className="skeleton h-4 w-1/3 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function OrdersSkeleton() {
  return (
    <div className="space-y-3 px-4 py-4" aria-busy="true">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="card space-y-3 p-4">
          <div className="skeleton h-5 w-32 rounded" />
          <div className="skeleton h-2 w-full rounded-full" />
          <div className="skeleton h-4 w-2/3 rounded" />
        </div>
      ))}
    </div>
  );
}
