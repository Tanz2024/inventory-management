import React, { useState, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import './GoodReceive.css';

function GoodReceivedForm({ onItemsUpdate }) {
  // ---------------------------
  //  State: Company Information
  // ---------------------------
  const [attnPerson, setAttnPerson] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [companyTel, setCompanyTel] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');

  // ---------------------------
  //  State: Goods Received
  // ---------------------------
  const [grNo, setGrNo] = useState('');
  const [receivedDate, setReceivedDate] = useState('');
  const [remarks, setRemarks] = useState('');

  // ---------------------------
  //  Items
  // ---------------------------
  const [items, setItems] = useState([{ itemId: '', qty: 1, unitPrice: 0 }]);
  const [includeUnitPrice, setIncludeUnitPrice] = useState(true);
  const [adminItems, setAdminItems] = useState([]);

  // ---------------------------
  //  File Upload & History
  // ---------------------------
  const [localFiles, setLocalFiles] = useState([]);
  const [fileHistory, setFileHistory] = useState([]);

  // ---------------------------
  //  Preview & Edit Modals
  // ---------------------------
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);

  // Fullscreen toggle (no zoom)
  const [isMaximized, setIsMaximized] = useState(false);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [currentFile, setCurrentFile] = useState(null);
  const [editedFileName, setEditedFileName] = useState('');
  const [editedStatus, setEditedStatus] = useState('');

  // ---------------------------
  //  Effects
  // ---------------------------
  // Fetch admin items on mount and every 30 seconds
  useEffect(() => {
    const fetchAdminItems = () => {
      fetch('http://localhost:5000/admin-dashboard/items', {
        method: 'GET',
        credentials: 'include',
      })
        .then((res) => res.json())
        .then((data) => setAdminItems(data.items || []))
        .catch((err) => console.error('Error fetching admin items:', err));
    };
    fetchAdminItems();
    const interval = setInterval(fetchAdminItems, 30000);
    return () => clearInterval(interval);
  }, []);

  // Fetch file history on mount
  useEffect(() => {
    fetchFileHistory();
  }, []);

  const fetchFileHistory = () => {
    fetch('http://localhost:5000/api/fileHistory', {
      method: 'GET',
      credentials: 'include',
    })
      .then((res) => res.json())
      .then((data) => setFileHistory(data.files || []))
      .catch((err) => console.error('Error fetching file history:', err));
  };

  // ---------------------------
  //  Items Handlers
  // ---------------------------
  const handleItemChange = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  };

  const handleAddItem = () =>
    setItems([...items, { itemId: '', qty: 1, unitPrice: 0 }]);

  const handleRemoveItem = (index) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
    if (onItemsUpdate) onItemsUpdate(newItems);
  };

  // ---------------------------
  //  Clear Form
  // ---------------------------
  const clearForm = () => {
    setAttnPerson('');
    setCompanyName('');
    setCompanyAddress('');
    setCompanyTel('');
    setCompanyEmail('');
    setGrNo('');
    setReceivedDate('');
    setRemarks('');
    setItems([{ itemId: '', qty: 1, unitPrice: 0 }]);
    setIncludeUnitPrice(true);
    setLocalFiles([]);
    setIsMaximized(false);
  };

  // ---------------------------
  //  Summaries
  // ---------------------------
  const totalQty = items.reduce((sum, item) => sum + Number(item.qty), 0);
  const totalAmount = includeUnitPrice
    ? items.reduce(
        (sum, it) => sum + Number(it.qty) * parseFloat(it.unitPrice || 0),
        0
      )
    : 0;

  // ---------------------------
  //  Inventory Update
  // ---------------------------
  const updateAdminInventory = () => {
    const payload = {
      items: items.map((item) => ({
        itemId: item.itemId,
        qty: Number(item.qty),
      })),
    };

    fetch('http://localhost:5000/goodsreceived/update-inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    })
      .then((response) => {
        if (!response.ok) throw new Error('Failed to update inventory.');
        return response.json();
      })
      .then((data) => {
        console.log('Inventory updated:', data);
        window.dispatchEvent(new Event('inventoryUpdated'));
      })
      .catch((err) => console.error('Error updating inventory:', err));
  };

  // ---------------------------
  //  File Upload & Tracking
  // ---------------------------
  const handleLocalFileChange = (e) => {
    const files = Array.from(e.target.files).map((file) => ({
      file,
      status: 'Pending',
    }));
    setLocalFiles((prev) => [...prev, ...files]);
  };

  const updateLocalFileStatus = (index, newStatus) => {
    const updated = [...localFiles];
    updated[index].status = newStatus;
    setLocalFiles(updated);
  };

  const removeLocalFile = (index) => {
    setLocalFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async () => {
    if (localFiles.length === 0) {
      alert('No files selected to upload.');
      return;
    }
    const formData = new FormData();
    localFiles.forEach(({ file }) => {
      formData.append('files', file);
    });
    try {
      const response = await fetch('http://localhost:5000/api/uploadFiles', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (!response.ok) {
        throw new Error('File upload failed.');
      }
      alert('Files uploaded successfully.');
      setLocalFiles([]);
      fetchFileHistory();
    } catch (error) {
      console.error('Error uploading files:', error);
      alert('Error uploading files.');
    }
  };

  // ---------------------------
  //  Preview, Delete, Edit
  // ---------------------------
  const previewFile = async (fileId) => {
    try {
      const res = await fetch(`http://localhost:5000/api/filePreview/${fileId}`, {
        method: 'GET',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch file preview.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      setPreviewUrl(url);
      setIsMaximized(false); // reset fullscreen
      setPreviewModalOpen(true);
    } catch (err) {
      console.error('Error previewing file:', err);
      alert('Error previewing file.');
    }
  };

  const deleteFile = async (fileId) => {
    if (!window.confirm('Are you sure you want to delete this file?')) return;
    try {
      const res = await fetch(`http://localhost:5000/api/deleteFile/${fileId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to delete file.');
      alert('File deleted successfully.');
      fetchFileHistory();
    } catch (err) {
      console.error('Error deleting file:', err);
      alert('Error deleting file.');
    }
  };

  const openEditModal = (file) => {
    setCurrentFile(file);
    setEditedFileName(file.file_name);
    setEditedStatus(file.status);
    setEditModalOpen(true);
  };

  const saveFileEdits = async () => {
    if (!currentFile) return;
    try {
      const res = await fetch(`http://localhost:5000/api/updateFile/${currentFile.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          file_name: editedFileName,
          status: editedStatus,
        }),
      });
      if (!res.ok) throw new Error('Failed to update file.');
      alert('File updated successfully.');
      setEditModalOpen(false);
      fetchFileHistory();
    } catch (err) {
      console.error('Error updating file:', err);
      alert('Error updating file.');
    }
  };

  // ---------------------------
  //  Generate PDF
  // ---------------------------
  const generateGoodsReceivedPDF = () => {
    if (!receivedDate) {
      alert('Please select a valid Received Date.');
      return;
    }
    const rDate = new Date(receivedDate);
    if (isNaN(rDate.getTime())) {
      alert('Invalid Received Date.');
      return;
    }
    const formattedDate = rDate.toLocaleDateString();

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const centerX = pageWidth / 2;
    const leftMargin = 15;
    let currentY = 20;
    const lineSpacing = 7;

    // Header Section
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('SQUARECLOUD (MALAYSIA) SDN BHD', leftMargin, currentY);
    currentY += lineSpacing;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text('D-61-3A, LEVEL 3A, JAYA ONE, 72A,', leftMargin, currentY);
    currentY += lineSpacing;
    doc.text('Jln Profesor Diraja Ungku Aziz, Seksyen 13,', leftMargin, currentY);
    currentY += lineSpacing;
    doc.text('46200 Petaling Jaya, Selangor', leftMargin, currentY);
    currentY += lineSpacing;
    doc.text('Tel: 03-7497 2558', leftMargin, currentY);

    // Company Logo (if available)
    const logoWidth = 40;
    const logoHeight = 40;
    const logoX = pageWidth - logoWidth - 10;
    const logoY = 10;
    const logoPath = '/Squarecloud_Logo1.png';
    try {
      doc.addImage(logoPath, 'PNG', logoX, logoY, logoWidth, logoHeight);
    } catch (e) {
      console.warn('Logo image error:', e);
    }

    // Title: "GOOD RECEIVE" (centered)
    currentY += 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('GOOD RECEIVE', centerX, currentY, { align: 'center' });
    currentY += lineSpacing * 2;

    // Attn on the left
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(`Attn: ${attnPerson}`, leftMargin, currentY);

    // GR No on the right
    doc.text(`GR No: ${grNo}`, pageWidth - 15, currentY, { align: 'right' });
    currentY += lineSpacing * 2;

    // "Receive From" in bold, then company details
    doc.setFont('helvetica', 'bold');
    doc.text('RECEIVE FROM:', leftMargin, currentY);
    doc.setFont('helvetica', 'normal');
    currentY += lineSpacing;
    doc.text(`${companyName}`, leftMargin + 10, currentY);
    currentY += lineSpacing;
    doc.text(`${companyAddress}`, leftMargin + 10, currentY);
    currentY += lineSpacing;
    doc.text(`Tel: ${companyTel}`, leftMargin + 10, currentY);
    currentY += lineSpacing;
    doc.text(`Email: ${companyEmail}`, leftMargin + 10, currentY);
    currentY += lineSpacing * 2;

    // Remarks
    if (remarks.trim()) {
      doc.setFont('helvetica', 'italic');
      doc.text('Remarks:', leftMargin, currentY);
      currentY += lineSpacing;
      doc.setFont('helvetica', 'normal');
      doc.text(remarks, leftMargin + 10, currentY);
      currentY += lineSpacing * 2;
    }

    // Items Table
    const tableColumns = includeUnitPrice
      ? [
          { header: 'Item No', dataKey: 'itemNo' },
          { header: 'Description', dataKey: 'description' },
          { header: 'Qty', dataKey: 'qty' },
          { header: 'Unit Price (RM)', dataKey: 'unitPrice' },
          { header: 'Amount (RM)', dataKey: 'amount' },
        ]
      : [
          { header: 'Item No', dataKey: 'itemNo' },
          { header: 'Description', dataKey: 'description' },
          { header: 'Qty', dataKey: 'qty' },
        ];

    const tableRows = items.map((item, index) => {
      const adminItem = adminItems.find((ai) => ai.item_id.toString() === item.itemId);
      const description = adminItem ? adminItem.item_name : '';
      const unitPrice = parseFloat(item.unitPrice || 0);
      const qty = Number(item.qty);
      const amount = qty * unitPrice;
      return {
        itemNo: index + 1,
        description,
        qty,
        unitPrice: includeUnitPrice ? unitPrice.toFixed(2) : undefined,
        amount: includeUnitPrice ? amount.toFixed(2) : undefined,
      };
    });

    const totalQtyValue = items.reduce((sum, it) => sum + Number(it.qty), 0);
    if (includeUnitPrice) {
      const totalAmountValue = items.reduce(
        (s, it) => s + Number(it.qty) * parseFloat(it.unitPrice),
        0
      );
      tableRows.push({
        itemNo: '',
        description: 'Total Quantity',
        qty: totalQtyValue,
        unitPrice: '',
        amount: '',
      });
      tableRows.push({
        itemNo: '',
        description: 'Total Amount',
        qty: '',
        unitPrice: '',
        amount: totalAmountValue.toFixed(2),
      });
    } else {
      tableRows.push({
        itemNo: '',
        description: 'Total Quantity',
        qty: totalQtyValue,
      });
    }

    doc.autoTable({
      startY: currentY,
      head: [tableColumns.map((col) => col.header)],
      body: tableRows.map((row) =>
        tableColumns.map((col) => row[col.dataKey] || '')
      ),
      theme: 'grid',
      styles: { halign: 'center', cellPadding: 4 },
      headStyles: { fillColor: 240, textColor: 20, fontStyle: 'bold' },
      margin: { left: 15, right: 15 },
    });
    currentY = doc.lastAutoTable.finalY + lineSpacing * 2;

    // Signature Section
    doc.setFontSize(11);
    doc.text('Goods received by:', leftMargin, currentY);
    currentY += lineSpacing;
    doc.text('Receiver Signature: ______________________', leftMargin, currentY);
    doc.text('Approved by: ______________________', pageWidth - 15, currentY, {
      align: 'right',
    });

    // Received Date below signature
    currentY += lineSpacing * 2;
    doc.setFont('helvetica', 'bold');
    doc.text('Received Date:', leftMargin, currentY);
    doc.setFont('helvetica', 'normal');
    doc.text(`${formattedDate}`, leftMargin + 30, currentY);

    doc.save('Goods_Received.pdf');
    updateAdminInventory();
  };

  // ---------------------------
  //  Render
  // ---------------------------
  return (
    <div className="form-container">
      <h1 className="form-title">Goods Received Form</h1>

      {/* Company Information */}
      <section className="section">
        <h2>Company Information</h2>
        <div className="grid-container">
          <div className="form-item">
            <label>Attn (Person Name):</label>
            <input
              type="text"
              value={attnPerson}
              onChange={(e) => setAttnPerson(e.target.value)}
              placeholder="Enter contact person"
            />
          </div>
          <div className="form-item">
            <label>Company Name:</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
              style={{ fontWeight: 'bold' }}
            />
          </div>
          <div className="form-item">
            <label>Company Address:</label>
            <input
              type="text"
              value={companyAddress}
              onChange={(e) => setCompanyAddress(e.target.value)}
              required
            />
          </div>
          <div className="form-item">
            <label>Company Phone:</label>
            <input
              type="text"
              value={companyTel}
              onChange={(e) => setCompanyTel(e.target.value)}
              required
            />
          </div>
          <div className="form-item">
            <label>Company Email:</label>
            <input
              type="email"
              value={companyEmail}
              onChange={(e) => setCompanyEmail(e.target.value)}
              required
            />
          </div>
        </div>
      </section>

      {/* Goods Received Details */}
      <section className="section">
        <h2>Goods Received Details</h2>
        <div className="grid-container">
          <div className="form-item">
            <label>GR No:</label>
            <input
              type="text"
              value={grNo}
              onChange={(e) => setGrNo(e.target.value)}
              required
            />
          </div>
          <div className="form-item">
            <label>Received Date:</label>
            <input
              type="date"
              value={receivedDate}
              onChange={(e) => setReceivedDate(e.target.value)}
              required
            />
          </div>
          <div className="form-item">
            <label>Remarks:</label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>
          <div className="form-item">
            <label>
              <input
                type="checkbox"
                checked={includeUnitPrice}
                onChange={() => setIncludeUnitPrice(!includeUnitPrice)}
              />
              Include Unit Price (RM)
            </label>
          </div>
        </div>
      </section>

      {/* Items Section */}
      <section className="section">
        <h2>Items</h2>
        {items.map((item, index) => (
          <div key={index} className="item-form">
            <div className="form-item">
              <label>Item Description:</label>
              <select
                value={item.itemId}
                onChange={(e) => handleItemChange(index, 'itemId', e.target.value)}
                required
              >
                <option value="">Select an item</option>
                {adminItems.map((adminItem) => (
                  <option key={adminItem.item_id} value={adminItem.item_id}>
                    {adminItem.item_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-item">
              <label>Quantity:</label>
              <input
                type="number"
                value={item.qty}
                onChange={(e) => handleItemChange(index, 'qty', e.target.value)}
                min="1"
                required
              />
            </div>
            {includeUnitPrice && (
              <div className="form-item">
                <label>Unit Price (RM):</label>
                <input
                  type="number"
                  value={item.unitPrice}
                  onChange={(e) => handleItemChange(index, 'unitPrice', e.target.value)}
                  min="0"
                  step="0.01"
                  required
                />
              </div>
            )}
            {items.length > 1 && (
              <button
                type="button"
                className="remove-btn"
                onClick={() => handleRemoveItem(index)}
              >
                Remove Item
              </button>
            )}
            <hr />
          </div>
        ))}
        <button type="button" onClick={handleAddItem} className="add-btn">
          Add Item
        </button>
      </section>

      {/* Summary Section */}
      <section className="section">
        <h2>Goods Received Summary</h2>
        <div className="summary">
          <p>Total Quantity: <strong>{totalQty}</strong></p>
          {includeUnitPrice && (
            <p>Total Amount: <strong>RM {totalAmount.toFixed(2)}</strong></p>
          )}
        </div>
      </section>

      {/* File Upload & Tracking Section */}
      <section className="section">
        <h2>Upload & Track Files</h2>
        <div className="form-item">
          <label>Select Files to Upload:</label>
          <input type="file" name="files" onChange={handleLocalFileChange} multiple />
        </div>
        {localFiles.length > 0 && (
          <div className="files-list">
            <h3>Files Selected (Not yet uploaded)</h3>
            <ul>
              {localFiles.map((fileObj, index) => (
                <li key={index}>
                  <span>{fileObj.file.name}</span> —
                  <select
                    value={fileObj.status}
                    onChange={(e) => updateLocalFileStatus(index, e.target.value)}
                  >
                    <option value="Pending">Pending</option>
                    <option value="Reviewed">Reviewed</option>
                    <option value="Approved">Approved</option>
                  </select>
                  <button onClick={() => removeLocalFile(index)}>Remove</button>
                </li>
              ))}
            </ul>
            <button type="button" onClick={uploadFiles}>
              Upload Files to Server
            </button>
          </div>
        )}
      </section>

      {/* File History Section (not in PDF) */}
      <section className="section">
        <h2>Uploaded Files History</h2>
        {fileHistory.length > 0 ? (
          <table className="file-history-table">
            <thead>
              <tr>
                <th>File Name</th>
                <th>File Type</th>
                <th>Status</th>
                <th>Uploaded At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {fileHistory.map((file) => (
                <tr key={file.id}>
                  <td>{file.file_name}</td>
                  <td>{file.file_type}</td>
                  <td>{file.status}</td>
                  <td>{new Date(file.uploaded_at).toLocaleString()}</td>
                  <td>
                    <button onClick={() => previewFile(file.id)}>Preview</button>
                    <button
                      onClick={() => openEditModal(file)}
                      style={{ marginLeft: '5px' }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteFile(file.id)}
                      style={{ marginLeft: '5px' }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No files uploaded yet.</p>
        )}
      </section>

      {/* Responsive Preview Modal (No Zoom Buttons) */}
      {previewModalOpen && (
        <div className="modal-overlay" onClick={() => setPreviewModalOpen(false)}>
          <div
            className={`modal-content responsive-preview ${
              isMaximized ? 'fullscreen' : ''
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="preview-header">
              <h3>File Preview</h3>
              <div>
                {/* Fullscreen toggle */}
                <button
                  onClick={() => setIsMaximized((prev) => !prev)}
                  style={{ marginLeft: '15px' }}
                >
                  {isMaximized ? 'Restore' : 'Fullscreen'}
                </button>
                <button
                  onClick={() => setPreviewModalOpen(false)}
                  style={{ marginLeft: '15px' }}
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="preview-body">
              {previewUrl ? (
                <iframe
                  title="File Preview"
                  src={previewUrl}
                  style={{
                    width: '100%',
                    height: '100%',
                  }}
                />
              ) : (
                <p>Loading preview...</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModalOpen && (
        <div className="modal-overlay" onClick={() => setEditModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Edit File Details</h3>
            <div className="form-item">
              <label>File Name:</label>
              <input
                type="text"
                value={editedFileName}
                onChange={(e) => setEditedFileName(e.target.value)}
              />
            </div>
            <div className="form-item">
              <label>Status:</label>
              <select
                value={editedStatus}
                onChange={(e) => setEditedStatus(e.target.value)}
              >
                <option value="Pending">Pending</option>
                <option value="Reviewed">Reviewed</option>
                <option value="Approved">Approved</option>
              </select>
            </div>
            <button onClick={saveFileEdits}>Save Changes</button>
            <button
              onClick={() => setEditModalOpen(false)}
              style={{ marginLeft: '5px' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="button-group">
        <button type="button" onClick={generateGoodsReceivedPDF} className="generate-btn">
          Generate PDF
        </button>
        <button type="button" className="refresh-btn" onClick={clearForm}>
          Refresh Form
        </button>
      </div>
    </div>
  );
}

export default GoodReceivedForm;
