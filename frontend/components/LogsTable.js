export default function LogsTable({ logs }) {
  return (
    <table className="table-auto w-full border border-gray-300">
      <thead>
        <tr className="bg-gray-200">
          <th className="px-4 py-2">Platform</th>
          <th className="px-4 py-2">Status</th>
          <th className="px-4 py-2">Timestamp</th>
        </tr>
      </thead>
      <tbody>
        {logs.map((log, idx) => {
          const status = (log.output && log.output.status) || log.status || log.message || 'unknown';
          const ts = (log.output && log.output.timestamp) || log.timestamp || log.time || null;
          return (
            <tr key={idx}>
              <td className="border px-4 py-2">{log.platform}</td>
              <td className="border px-4 py-2">{status}</td>
              <td className="border px-4 py-2">{ts ? new Date(ts).toLocaleString() : ''}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
