// DOMOVINA brand tricolor — red / white / navy. Same 4px strip used across
// every property in the umbrella (karta, klubovi, domovina.ai itself).
export function BrandStripe() {
  return (
    <div className="flex h-1 w-full flex-none" aria-hidden="true">
      <span className="flex-1" style={{ background: "var(--brand-red)" }} />
      <span className="flex-1 bg-white" />
      <span className="flex-1" style={{ background: "var(--brand-navy)" }} />
    </div>
  );
}
