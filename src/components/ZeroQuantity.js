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
      
      // Filter items with quantity 0
      const itemsWithZeroQuantity = data.items.filter(item => item.quantity <= 5);
      setZeroQuantityItems(itemsWithZeroQuantity);
    } catch (error) {
      console.error('Error fetching items:', error);
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
      console.log(data);  // Check the structure here


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

  const handleSort = (key, dataset) => {
  
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
  
    setSortConfig({ key, direction });
  
    const sortedData = [...dataset].sort((a, b) => {
      if (a[key] < b[key]) {
        return direction === 'ascending' ? -1 : 1;
      }
      if (a[key] > b[key]) {
        return direction === 'ascending' ? 1 : -1;
      }
      return 0;
    });
  
    if (dataset === zeroQuantityItems) {
      setZeroQuantityItems(sortedData); // Update state for zeroQuantityItems
    } else if (dataset === transactionLogs) {
      setTransactionLogs(sortedData); // Update state for transactionLogs
    }
  };


  return (
    <div className="zero-quantity-page">
      <h1>Low Stock</h1>
      {error && <p className="error-message">{error}</p>}

      {zeroQuantityItems.length === 0 ? (
        <p>No items with quantity less than 5.</p>
      ) : (
        <div className="zero-quantity-table-container">
        <table className="zero-quantity-table">
          <thead>
            <tr>
              {['item_id', 'category', 'item_name', 'model','unique id','quantity'].map((column) => (
              <th
                key={column}
                onClick={() => handleSort(column,zeroQuantityItems)} // Call the sort function on header click
              >
                {column.replace('_', ' ')} {/* Display readable column name */}
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
              {['item_id','category', 'item_name', 'model','unique id','transaction_type','quantity_change', 'timestamp', 'remarks','status'].map((column) => (
                <th
                    key={column}
                    onClick={() => handleSort(column, transactionLogs)} // Pass transactionLogs as the dataset
                >
                    {column.replace('_', ' ')} {/* Display readable column name */}
                    {sortConfig.key === column && (sortConfig.direction === 'ascending' ? ' ↑' : ' ↓')}
                </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transactionLogs.map(log => (
                <tr key={log.transaction_id}>
                  <td>{log.item_id}</td>
                  <td>{log.category}</td>
                  <td>{log.item_name}</td>
                  <td>{log.model}</td>
                  <td>{log.item_unique_id}</td>
                  <td>{log.transaction_type}</td>
                  <td>{log.quantity_change}</td>
                  <td>{new Date(log.timestamp).toLocaleString()}</td>
                  <td>{log.remarks}</td>
                  <td>{log.status}</td>
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