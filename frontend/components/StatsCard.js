export default function StatsCard({ title, value }) {
  return (
    <div className="bg-white shadow rounded p-4 flex flex-col items-center">
      <div className="text-gray-500">{title}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}
