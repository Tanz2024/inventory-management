import React, { useState, useEffect } from 'react';
import './ZeroQuantity.css'; // Make sure to include your CSS file

const ZeroQuantityPage = () => {
  const [items, setItems] = useState([]);
  const [zeroQuantityItems, setZeroQuantityItems] = useState([]);
  const [error, setError] = useState('');
  const [transactionLogs, setTransactionLogs] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: '', direction: '' }); // State for sorting config

  useEffect(() => {
    fetchItems();
    fetchTransactionLogs();
  }, []);

  const fetchItems = async () => {
    try {
      const response = await fetch('http://localhost:5000/admin-dashboard/items', { 
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': '1'
        },
        credentials: 'include' 
      });
      const data = await response.json();
      setItems(data.items);
      
      // Filter items with quantity less than or equal to 5
      const itemsWithLowStock = data.items.filter(item => item.quantity <= 5);
      setZeroQuantityItems(itemsWithLowStock);
    } catch (error) {
      console.error('Error fetching items:', error);
      setError('Failed to fetch items.');
    }
  };

  const fetchTransactionLogs = async () => {
    try {
      const response = await fetch('http://localhost:5000/logs', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': '1'
        },
        credentials: 'include',
      });
      const data = await response.json();

      // Filter logs for the past month
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      const pastMonthLogs = data.logs.filter(log => new Date(log.timestamp) >= oneMonthAgo);
      setTransactionLogs(pastMonthLogs);
    } catch (error) {
      console.error('Error fetching logs:', error);
      setError('Failed to fetch transaction logs.');
    }
  };

  const handleSort = (key, datasetType) => {
    let direction = 'ascending';
    // If the same column is clicked again, toggle sort direction
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });

    // Determine which dataset to sort
    let dataset = [];
    if (datasetType === 'items') {
      dataset = [...zeroQuantityItems];
    } else if (datasetType === 'logs') {
      dataset = [...transactionLogs];
    }

    const sortedData = dataset.sort((a, b) => {
      if (a[key] < b[key]) return direction === 'ascending' ? -1 : 1;
      if (a[key] > b[key]) return direction === 'ascending' ? 1 : -1;
      return 0;
    });

    if (datasetType === 'items') {
      setZeroQuantityItems(sortedData);
    } else if (datasetType === 'logs') {
      setTransactionLogs(sortedData);
    }
  };

  return (
    <div className="zero-quantity-page">
      <h1>Low Stock Items (Quantity ≤ 5)</h1>
      {error && <p className="error-message">{error}</p>}

      {zeroQuantityItems.length === 0 ? (
        <p>No items with quantity less than or equal to 5.</p>
      ) : (
        <div className="zero-quantity-table-container">
          <table className="zero-quantity-table">
            <thead>
              <tr>
                {['item_id', 'category', 'item_name', 'model', 'item_unique_id', 'quantity'].map(column => (
                  <th
                    key={column}
                    onClick={() => handleSort(column, 'items')}
                  >
                    {column.replace('_', ' ')}
                    {sortConfig.key === column && (sortConfig.direction === 'ascending' ? ' ↑' : ' ↓')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {zeroQuantityItems.map(item => (
                <tr key={item.item_id}>
                  <td>{item.item_id}</td>
                  <td>{item.category}</td>
                  <td>{item.item_name}</td>
                  <td>{item.model}</td>
                  <td>{item.item_unique_id}</td>
                  <td>{item.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h1 className="transaction-logs-title">Past Month Transaction Logs</h1>
      {transactionLogs.length === 0 ? (
        <p>No transactions in the past month.</p>
      ) : (
        <div className="zero-quantity-table-container2">
          <table className="zero-quantity-table2">
            <thead>
              <tr>
                {['item_id', 'category', 'item_name', 'model', 'item_unique_id', 'transaction_type', 'quantity_change', 'timestamp', 'remarks', 'status'].map(column => (
                  <th
                    key={column}
                    onClick={() => handleSort(column, 'logs')}
                  >
                    {column.replace('_', ' ')}
                    {sortConfig.key === column && (sortConfig.direction === 'ascending' ? ' ↑' : ' ↓')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transactionLogs.map(log => (
                <tr key={log.transaction_id || `${log.timestamp}-${Math.random()}`}>
                  <td>{log.item_id || 'N/A'}</td>
                  <td>{log.category || 'N/A'}</td>
                  <td>{log.item_name || 'N/A'}</td>
                  <td>{log.model || 'N/A'}</td>
                  <td>{log.item_unique_id || 'N/A'}</td>
                  <td>{log.transaction_type || 'N/A'}</td>
                  <td>{log.quantity_change || 0}</td>
                  <td>{new Date(log.timestamp).toLocaleString()}</td>
                  <td>{log.remarks || 'N/A'}</td>
                  <td>{log.status || 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ZeroQuantityPage;
