import React, { useState, useEffect, useMemo } from 'react';
import './LogsPage.css';

const LogsPage = () => {
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: '', direction: '' });

  // Fetch logs from API on component mount
  const fetchLogs = async () => {
    try {
      const response = await fetch('http://localhost:5000/logs', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': '1'
        },
      });
      if (!response.ok) {
        setError('Failed to fetch logs.');
        return;
      }
      const data = await response.json();
      setLogs(data.logs || []);
      setError('');
    } catch (err) {
      console.error('Error fetching logs:', err);
      setError('An error occurred while fetching the logs.');
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  // Compute the latest log per item for extra highlighting
  const latestLogs = useMemo(() => {
    return logs.reduce((latest, log) => {
      const currentTs = new Date(log.timestamp).getTime();
      if (
        !latest[log.item_id] ||
        currentTs > new Date(latest[log.item_id].timestamp).getTime() ||
        (currentTs === new Date(latest[log.item_id].timestamp).getTime() &&
          log.transaction_id > latest[log.item_id].transaction_id)
      ) {
        latest[log.item_id] = log;
      }
      return latest;
    }, {});
  }, [logs]);

  // Sorting logic for table columns
  const handleSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });

    const sortedLogs = [...logs].sort((a, b) => {
      let aVal = a[key];
      let bVal = b[key];

      // Convert timestamp to Date for comparison
      if (key === 'timestamp') {
        aVal = new Date(aVal);
        bVal = new Date(bVal);
      }

      if (aVal < bVal) return direction === 'ascending' ? -1 : 1;
      if (aVal > bVal) return direction === 'ascending' ? 1 : -1;
      return 0;
    });
    setLogs(sortedLogs);
  };

  // Determine row styling based on quantity_change and if it is the latest log for the item
  const getRowClass = (log) => {
    const qty = Number(log.quantity_change);
    let baseClass = '';
    if (!isNaN(qty)) {
      if (qty > 0) {
        baseClass = 'add';
      } else if (qty < 0) {
        baseClass = 'subtract';
      }
    }
    // Append "latest" modifier if this is the latest log for the item
    const latestLog = latestLogs[log.item_id];
    if (latestLog && latestLog.transaction_id === log.transaction_id) {
      return baseClass ? `latest ${baseClass}`.trim() : 'latest';
    }
    return baseClass;
  };

  // Define table columns
  const columns = [
    { key: 'transaction_id', label: 'ID' },
    { key: 'item_id', label: 'Item ID' },
    { key: 'category', label: 'Category' },
    { key: 'item_name', label: 'Item Name' },
    { key: 'model', label: 'Model' },
    { key: 'item_unique_id', label: 'Unique ID' },
    { key: 'site_name', label: 'Site Name' },
    { key: 'updated_by', label: 'Updated By' },
    { key: 'transaction_type', label: 'Transaction Type' },
    { key: 'quantity_change', label: 'Quantity Change' },
    { key: 'price_update', label: 'Price Update' },
    { key: 'timestamp', label: 'Timestamp' },
    { key: 'remarks', label: 'Remarks' },
    { key: 'status', label: 'Status' },
    { key: 'change_summary', label: 'Change Summary' },
  ];

  return (
    <div className="logs-page-container">
      <h2>Transaction Logs</h2>
      {error && <p className="error-message">{error}</p>}
      <div className="logs-table-container">
        <table className="logs-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className="logs-header"
                >
                  {col.label}
                  {sortConfig.key === col.key &&
                    (sortConfig.direction === 'ascending' ? ' ↑' : ' ↓')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.transaction_id} className={getRowClass(log)}>
                <td>{log.transaction_id}</td>
                <td>{log.item_id}</td>
                <td>{log.category}</td>
                <td>{log.item_name}</td>
                <td>{log.model}</td>
                <td>{log.item_unique_id}</td>
                <td>{log.site_name || 'N/A'}</td>
                <td>{log.updated_by || 'N/A'}</td>
                <td>{log.transaction_type}</td>
                <td>{log.quantity_change}</td>
                <td>
                  {(log.transaction_type === 'Price Update' ||
                    log.transaction_type === 'Combined Update')
                    ? `RM ${log.price_update}`
                    : 'N/A'}
                </td>
                <td>
                  {log.timestamp
                    ? new Date(log.timestamp).toLocaleString()
                    : 'N/A'}
                </td>
                <td>{log.remarks || 'N/A'}</td>
                <td>{log.status || 'N/A'}</td>
                <td>{log.change_summary || 'N/A'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default LogsPage;
