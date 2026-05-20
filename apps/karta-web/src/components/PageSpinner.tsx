export function PageSpinner() {
  return (
    <div className="flex h-full flex-1 items-center justify-center">
      <div
        className="h-8 w-8 animate-spin rounded-full border-[3px]"
        style={{
          borderColor: "var(--line)",
          borderTopColor: "var(--ui-accent)",
        }}
        role="status"
        aria-label="Učitavam"
      />
    </div>
  );
}
