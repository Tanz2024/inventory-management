import React, { useState, useEffect, useMemo } from 'react';
import './LogsPage.css';

const LogsPage = () => {
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: '', direction: '' });

  // 1) Fetch logs from API on mount
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

  // 2) Compute the latest log per item (by timestamp) for extra highlighting
  const latestLogs = useMemo(() => {
    const latest = {};
    logs.forEach((log) => {
      const currentTs = new Date(log.timestamp).getTime();
      if (
        !latest[log.item_id] ||
        currentTs > new Date(latest[log.item_id].timestamp).getTime() ||
        (currentTs === new Date(latest[log.item_id].timestamp).getTime() &&
         log.transaction_id > latest[log.item_id].transaction_id)
      ) {
        latest[log.item_id] = log;
      }
    });
    return latest;
  }, [logs]);

  // 3) Sorting Logic (improved for timestamps)
  const handleSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });

    const sortedLogs = [...logs].sort((a, b) => {
      let aVal = a[key];
      let bVal = b[key];

      // For timestamp, compare as Date objects
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

  // 4) Row Highlighting based on transaction type
  // All rows get a base color based on their type:
  //  - "Add": green, "Subtract": red, otherwise no background color.
  // If a row is the latest log for an item, extra styling is added.
  const getRowClass = (log) => {
    let baseClass = '';
    if (log.transaction_type === 'Add') {
      baseClass = 'add';
    } else if (log.transaction_type === 'Subtract') {
      baseClass = 'subtract';
    }
    // You can add similar logic for other types if desired.
    
    // If this is the latest log for the item, append the "latest" modifier.
    const latestLog = latestLogs[log.item_id];
    if (latestLog && latestLog.transaction_id === log.transaction_id) {
      return `latest ${baseClass}`.trim();
    }
    return baseClass;
  };

  // 5) Column Definitions
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
                <td>
                  {(log.transaction_type === 'Add' ||
                    log.transaction_type === 'Subtract' ||
                    log.transaction_type === 'Combined Update')
                    ? log.quantity_change
                    : 'N/A'}
                </td>
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
