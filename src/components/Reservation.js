import React, { useState, useEffect } from 'react';
import './Reservation.css'
import Reservation_status from './Reservation_status';  // Import the AddItem dialog

const Reservation = ({ onLogout,userId,username }) => {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [inputValue, setInputValue] = useState({}); // Store input values for each item
  const [remarks, setRemarks] = useState({}); // Store remarks for each item
  const [sortConfig, setSortConfig] = useState({ key: '', direction: '' }); // State for sorting config
  const [showStatusDialog, setShowStatusDialog] = useState(false); // Control modal visibility

  // ocr
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [ocrSummaries, setOcrSummaries] = useState([]);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState(null);

  // Fetch the list of users when the component is mounted
  const fetchItems = async () => {
    try {
      const response = await fetch('http://localhost:5000/admin-dashboard/items', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          },
      });

      if (response.ok) {
        const data = await response.json();
        setItems(data.items);
        const initialInputValues = data.items.reduce((acc, item) => {
          acc[item.item_id] = 0;
          return acc;
        }, {});
        setInputValue(initialInputValues);

        const initialRemarks = data.items.reduce((acc, item) => {
          // If userId is 2, set the remarks to 'admin'
          acc[item.item_id] = userId === 2 ? 'admin' : item.remarks || '';
          return acc;
        }, {});
        setRemarks(initialRemarks);
      } else {
        setError('Failed to load items');
      }
    } catch (error) {
      console.error('Error fetching items:', error);
      setError('An error occurred while fetching the items.');
    }
  };

  // Fetch items when the component is mounted
  useEffect(() => {
    fetchItems();
  }, []);

  // Handle quantity change via + or - buttons
  const handleQuantityChange = (itemId, change) => {
    setInputValue((prevValue) => ({
      ...prevValue,
      [itemId]: (prevValue[itemId] || 0) + change, // Increment or decrement the value
    }));
  };

  // Handle manual input change
  const handleInputChange = (itemId, newQuantity) => {
    if (isNaN(newQuantity) || newQuantity < 0) return; // Prevent non-numeric or negative values
    setInputValue((prevValue) => ({
      ...prevValue,
      [itemId]: newQuantity,
    }));
  };

  const handleRemarksChange = (itemId, newRemarks) => {
    setRemarks((prevRemarks) => ({
      ...prevRemarks,
      [itemId]: newRemarks, // Update remarks for the specific item
    }));
  };

  // Confirm the update for a specific item
  const handleConfirm = async (itemId) => {
    const newQuantity = inputValue[itemId] || 0; // Default to 0 if there's no input value
    const updatedRemarks = remarks[itemId]; // Get the updated remarks

    if (!updatedRemarks) {  // Check if remarks are empty or null
      alert('No remarks provided. Update skipped.');
      return;
    }

    try {
      const response = await fetch(`http://localhost:5000/admin-dashboard/items/${itemId}/reserve`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          },
        credentials: 'include',
        body: JSON.stringify({ quantityToReserve: newQuantity, remarks: updatedRemarks }), // Send the quantity to reserve
      });

      if (response.ok) {
        const updatedItem = await response.json();
        setItems((prevItems) =>
          prevItems.map((item) =>
            item.item_id === itemId ? updatedItem.item : item // Update the item in the state
          )
        );

        setInputValue((prevValue) => ({
          ...prevValue,
          [itemId]: 0, // Reset input value to 0 after confirmation
        }));

        alert('Items reserved successfully');
      } else if (response.status === 400) {
        const errorData = await response.json(); // Get the error message from the response
        alert(errorData.message); // Display the error message
      } else {
        alert('Failed to reserve items');
      }
    } catch (error) {
      console.error('Error reserving item:', error);
      alert('An error occurred while reserving the item.');
    }
  };
 

  const handleSort = (key) => {
    // Skip sorting for remarks column
    if (key === 'remarks' || key ==='quantity changed' || key ==='confirmation' ) return;
  
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
  
    setSortConfig({ key, direction });
  
    const sortedItems = [...items].sort((a, b) => {
      if (a[key] < b[key]) {
        return direction === 'ascending' ? -1 : 1;
      }
      if (a[key] > b[key]) {
        return direction === 'ascending' ? 1 : -1;
      }
      return 0;
    });
  
    setItems(sortedItems);
  };

  const handleCloseStatusDialog = () => {
    setShowStatusDialog(false);
  };

  const handleFileChange = (event) => {
    const files = Array.from(event.target.files);
    setSelectedFiles(files);
  };


  const handleOcrSubmit = async (e) => {
    e.preventDefault();
    if (selectedFiles.length === 0) {
      alert('Please select files first!');
      return;
    }
  
    setOcrLoading(true);
    setOcrError(null);
    setInputValue({}); // Reset all input fields to 0

  
    try {
      const formData = new FormData();
      selectedFiles.forEach((file) => {
        formData.append('files', file);
      });
  
      // Make POST request to backend
      const response = await fetch('http://localhost:5000/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers: {
          
          },
      });
  
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
  
      // Parse the response data
      const responseData = await response.json();
    const summaries = responseData.summaries; // Extract summaries from response

    const matchedItemsMap = {}; // Use a map to aggregate quantities by unique ID

    // Process each gptSummary from all files
    for (const summary of summaries) {
      const gptSummaryRaw = summary.gptSummary;
      if (!gptSummaryRaw) {
        console.warn('Skipping file with no gptSummary');
        continue;
      }

      const parsedSummaries = JSON.parse(gptSummaryRaw); // Parse JSON string
      console.log('Parsed Summaries:', parsedSummaries);

      for (const parsedSummary of parsedSummaries) {
        const { id, qty } = parsedSummary;

        // Skip invalid or empty IDs
        if (!id || id.trim() === "") {
          console.warn(`Skipping summary with empty id`);
          continue;
        }

        // Find the matched item in `items`
        const matchedItem = items.find((item) => item.item_unique_id === id);

        if (matchedItem) {
          // Aggregate quantities
          if (matchedItemsMap[id]) {
            matchedItemsMap[id].qty += qty; // Add to existing quantity
          } else {
            matchedItemsMap[id] = {
              ...matchedItem,
              qty, // Set initial quantity
            };
          }
        } else {
          console.warn(`No match found for ID: ${id}`);
        }
      }
    }

    // Convert the map to an array for rendering
    const matchedItems = Object.values(matchedItemsMap);

    console.log('Matched Items:', matchedItems);

    // Update the setInputValue with total matched quantities
    const updatedInputValues = {};
    matchedItems.forEach((item) => {
      // Check if total matched qty exceeds available stock
      if (item.qty > item.quantity) {
        alert(
          `Stock not enough for ${item.item_name}. Requested: ${item.qty}, Available: ${item.quantity}`
        );
        // Do not insert the value into setInputValue if stock is insufficient
      } else {
        // Set input value to total matched quantity
        updatedInputValues[item.item_id] = item.qty;
      }
    });

    // Update state
    setInputValue((prevValue) => ({
      ...prevValue,
      ...updatedInputValues,
    }));

    setOcrSummaries(matchedItems); // Update state with matched items
  } catch (error) {
    console.error('Error during OCR process:', error);
    setOcrError('Error during OCR process. Please try again.');
  } finally {
    setOcrLoading(false);
  }
};

  return (
    <div className="reserve-container">
      <div className="ocr-container">
        <h2>OCR Entry Page</h2>
        {ocrError && <p className="error-message">{ocrError}</p>}
        <form onSubmit={handleOcrSubmit} className="ocr-form">
          <input type="file" multiple onChange={handleFileChange} className="ocr-input" />
          <button type="submit" disabled={ocrLoading} className="ocr-submit-btn">
            {ocrLoading ? 'Processing...' : 'Upload and Process'}
          </button>
        </form>
        {ocrSummaries.length > 0 && (
          <div className="ocr-summary-table">
            <h3>Matched Items</h3>
            <table>
              <thead>
                <tr>
                  <th>Item ID</th>
                  <th>Unique ID</th>
                  <th>Item Name</th>
                  <th>Quantity Left</th>
                  <th>Matched Qty</th>
                </tr>
              </thead>
              <tbody>
                {ocrSummaries.map((item, index) => (
                  <tr key={index}>
                    <td>{item.item_id}</td>
                    <td>{item.item_unique_id}</td>
                    <td>{item.item_name}</td>
                    <td>{item.quantity}</td>
                    <td>{item.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="header-container">
        <h2 className="header-admin-dashboard">Reservation</h2>
        <div>
            <button className="add-item-button" onClick={() => setShowStatusDialog(true)}>
              Status
            </button> 
        </div>
        {showStatusDialog && (
          <Reservation_status open={showStatusDialog} onClose={handleCloseStatusDialog} fetchItems={fetchItems} />
        )}
      </div>
      {error && <p className="error-message">{error}</p>}

      <table className="admin-dashboard-table">
        <thead>
          <tr>
            {['item_id','category','item_name','model','unique id','quantity','reserved','remarks','quantity changed','reservation'].map((column) => (
              <th
                key={column}
                className="dashboard-C"
                onClick={() => handleSort(column)} // Call the sort function on header click
              >
                {column.replace('_', ' ')} {/* Display readable column name */}
                {sortConfig.key === column && (sortConfig.direction === 'ascending' ? ' ↑' : ' ↓')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.item_id}>
              <td className="dashboard-D">{item.item_id}</td>
              <td className="dashboard-D">{item.category}</td>
              <td className="dashboard-D">{item.item_name}</td>
              <td className="dashboard-D">{item.model}</td>
              <td className="dashboard-D">{item.item_unique_id}</td>
              <td className="dashboard-D">{item.quantity}</td>
              <td className="dashboard-D">{item.reserved_quantity}</td>
              <td className="dashboard-D">
                <input
                  type="text"
                  value={remarks[item.item_id] || ''}
                  onChange={(e) => handleRemarksChange(item.item_id, e.target.value)}
                  placeholder="Remarks"
                  className="remarks-input"
                />
              </td>
              <td>
                <div className="quantity-container">
                  <button onClick={() => handleQuantityChange(item.item_id, -1)}>-</button>
                  <input
                    type="number"
                    value={inputValue[item.item_id] || 0}
                    onChange={(e) => handleInputChange(item.item_id, parseInt(e.target.value) || 0)}
                    className="quantity-input"
                  />
                  <button onClick={() => handleQuantityChange(item.item_id, 1)}>+</button>
                </div>
              </td>
              <td>
                <button className="confirmButton" onClick={() => handleConfirm(item.item_id)}>Reserve</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default Reservation;
