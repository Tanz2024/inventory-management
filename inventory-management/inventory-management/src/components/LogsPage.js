import React, { useState, useEffect, useMemo } from 'react';
import './LogsPage.css';

const LogsPage = () => {
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: '', direction: '' });

  // Fetch logs from the API
  const fetchLogs = async () => {
    try {
      const response = await fetch('http://localhost:5000/logs', {
        method: 'GET',
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setLogs(data.logs);
      } else {
        setError('Failed to fetch logs.');
      }
    } catch (err) {
      console.error('Error fetching logs:', err);
      setError('An error occurred while fetching the logs.');
    }
  };

  // Fetch logs on mount and every 5 seconds
  useEffect(() => {
    fetchLogs();
    const intervalId = setInterval(fetchLogs, 5000);
    return () => clearInterval(intervalId);
  }, []);

  // Compute the latest log per item (by timestamp)
  const latestLogs = useMemo(() => {
    const latest = {};
    logs.forEach((log) => {
      const ts = new Date(log.timestamp);
      if (!latest[log.item_id] || ts > new Date(latest[log.item_id].timestamp)) {
        latest[log.item_id] = log;
      }
    });
    return latest;
  }, [logs]);

  // Handle sorting by column
  const handleSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
    const sortedLogs = [...logs].sort((a, b) => {
      if (a[key] < b[key]) return direction === 'ascending' ? -1 : 1;
      if (a[key] > b[key]) return direction === 'ascending' ? 1 : -1;
      return 0;
    });
    setLogs(sortedLogs);
  };

  const getRowClass = (log) => {
    const latestLog = latestLogs[log.item_id];
    
    // Only highlight the most recent price update
    if (latestLog && latestLog.transaction_id === log.transaction_id) {
      // If this is the most recent price update
      if (log.transaction_type === 'Price Update') {
        return 'latest-price';
      } else if (log.transaction_type === 'Add' || log.transaction_type === 'Subtract') {
        return 'latest-quantity';
      } else if (log.transaction_type === 'Combined Update') {
        return 'latest-combined';
      }
    }
    return ''; // No highlight for non-latest rows
  };
  
  return (
    <div className="logs-page-container">
      <h2>Transaction Logs</h2>
      {error && <p className="error-message">{error}</p>}
      <table>
        <thead>
          <tr>
            {[
              { key: 'transaction_id', label: 'ID' },
              { key: 'item_id', label: 'Item ID' },
              { key: 'category', label: 'Category' },
              { key: 'item_name', label: 'Item Name' },
              { key: 'model', label: 'Model' },
              { key: 'item_unique_id', label: 'Unique ID' },
              { key: 'updated_by', label: 'Updated By' },
              { key: 'transaction_type', label: 'Transaction Type' },
              { key: 'quantity_change', label: 'Quantity Change' },
              { key: 'price_update', label: 'Price Update' },
              { key: 'timestamp', label: 'Timestamp' },
              { key: 'remarks', label: 'Remarks' },
              { key: 'status', label: 'Status' },
              { key: 'change_summary', label: 'Change Summary' },
            ].map((col) => (
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
              <td>{new Date(log.timestamp).toLocaleString()}</td>
              <td>{log.remarks}</td>
              <td>{log.status}</td>
              <td>{log.change_summary}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default LogsPage;
