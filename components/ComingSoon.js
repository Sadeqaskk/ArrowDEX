export default function ComingSoon({ title, description }) {
  return (
    <div className="max-w-[600px] mx-auto text-center py-24">
      <div className="card-label mb-3">In Progress</div>
      <h1 className="text-[28px] font-bold mb-3">{title}</h1>
      <p className="text-dim text-sm leading-relaxed">{description}</p>
    </div>
  );
}
