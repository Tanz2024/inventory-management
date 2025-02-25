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
  const [validityPeriod, setValidityPeriod] = useState('60');

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
  const [siteName, setSiteName] = useState('');

  // ---------------------------
  //  Preview & Edit Modals
  // ---------------------------
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [currentFile, setCurrentFile] = useState(null);
  const [editedFileName, setEditedFileName] = useState('');
  const [editedStatus, setEditedStatus] = useState('');

  // ---------------------------
  //  Effects
  // ---------------------------
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
    setValidityPeriod('60');
    setItems([{ itemId: '', qty: 1, unitPrice: 0 }]);
    setIncludeUnitPrice(true);
    setLocalFiles([]);
    setSiteName('');
    setIsMaximized(false);
  };

  // ---------------------------
  //  Summaries
  // ---------------------------
  const totalQty = items.reduce((sum, item) => sum + Number(item.qty), 0);
  const totalAmount = includeUnitPrice
    ? items.reduce((sum, it) => sum + Number(it.qty) * parseFloat(it.unitPrice || 0), 0)
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
    formData.append('siteName', siteName);
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
      setIsMaximized(false);
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
  //  Generate "Good Receive" PDF
  // ---------------------------
  const generateGoodReceivePDF = () => {
    // Validate the received date
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
  
    // Create PDF instance
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
  
    // Constants for layout
    const MARGIN = 10;
    const HEADER_FONT_SIZE = 12;
    const NORMAL_FONT_SIZE = 10;
    const TITLE_FONT_SIZE = 18;
    const LOGO_DIMENSIONS = { width: 40, height: 40 };
  
    // ---------- Helper Functions ----------
  
    const drawHeader = () => {
      let currentY = 15;
  
      // Company Information
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(HEADER_FONT_SIZE);
      doc.text('SQUARECLOUD (MALAYSIA) SDN BHD', MARGIN, currentY);
  
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(NORMAL_FONT_SIZE);
      currentY += 6;
      doc.text('D-61-3A, LEVEL 3A, JAYA ONE, 72A,', MARGIN, currentY);
      currentY += 5;
      doc.text('Jln Profesor Diraja Ungku Aziz, Seksyen 13,', MARGIN, currentY);
      currentY += 5;
      doc.text('46200 Petaling Jaya, Selangor', MARGIN, currentY);
      currentY += 5;
      doc.text('Tel: 03-7497 2558', MARGIN, currentY);
  
      // Company Logo (right)
      const logoX = pageWidth - LOGO_DIMENSIONS.width - MARGIN;
      const logoY = 10;
      try {
        doc.addImage('/Squarecloud_Logo1.png', 'PNG', logoX, logoY, LOGO_DIMENSIONS.width, LOGO_DIMENSIONS.height);
      } catch (e) {
        console.warn('Logo image error:', e);
      }
  
      // Title (centered)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(TITLE_FONT_SIZE);
      doc.text('GOOD RECEIVE', pageWidth / 2, 50, { align: 'center' });
    };
  
    const drawRecipientDetails = () => {
      const infoY = 60;
      doc.setFontSize(NORMAL_FONT_SIZE);
      doc.setFont('helvetica', 'normal');
      doc.text(`Attn: ${attnPerson}`, MARGIN, infoY);
  
      doc.setFont('helvetica', 'bold');
      doc.text(`Received From: ${companyName}`, MARGIN, infoY + 8);
  
      doc.setFont('helvetica', 'normal');
      doc.text(companyAddress, MARGIN, infoY + 16);
      doc.text(`Tel: ${companyTel}`, MARGIN, infoY + 24);
      doc.text(`Email: ${companyEmail}`, MARGIN, infoY + 32);
  
      // Right Column details
      doc.text(`Document ID: ${grNo}`, pageWidth - MARGIN, infoY, { align: 'right' });
      doc.text(`Received Date: ${formattedDate}`, pageWidth - MARGIN, infoY + 8, { align: 'right' });
      doc.text(`Validity: ${validityPeriod} Days`, pageWidth - MARGIN, infoY + 16, { align: 'right' });
    };
  
    const drawTableSection = () => {
      const tableStartY = 60 + 50; // infoY + 50
      let tableColumns = [];
      let tableRows = [];
  
      if (includeUnitPrice) {
        tableColumns = [
          { header: 'Item No', dataKey: 'itemNo' },
          { header: 'Description', dataKey: 'description' },
          { header: 'Qty', dataKey: 'qty' },
          { header: 'Unit Price (RM)', dataKey: 'unitPrice' },
          { header: 'Amount (RM)', dataKey: 'amount' },
        ];
  
        tableRows = items.map((item, index) => {
          const adminItem = adminItems.find(ai => ai.item_id.toString() === item.itemId);
          const description = adminItem ? adminItem.item_name : '';
          const unitPrice = parseFloat(item.unitPrice || 0);
          const qty = Number(item.qty);
          const amount = qty * unitPrice;
          return {
            itemNo: index + 1,
            description,
            qty,
            unitPrice: unitPrice.toFixed(2),
            amount: amount.toFixed(2),
          };
        });
  
        // Totals
        const totalQtyValue = items.reduce((sum, i) => sum + Number(i.qty), 0);
        const totalAmountValue = items.reduce(
          (sum, i) => sum + Number(i.qty) * parseFloat(i.unitPrice || 0),
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
        tableColumns = [
          { header: 'Item No', dataKey: 'itemNo' },
          { header: 'Description', dataKey: 'description' },
          { header: 'Qty', dataKey: 'qty' },
        ];
  
        tableRows = items.map((item, index) => {
          const adminItem = adminItems.find(ai => ai.item_id.toString() === item.itemId);
          const description = adminItem ? adminItem.item_name : '';
          return {
            itemNo: index + 1,
            description,
            qty: item.qty,
          };
        });
  
        const totalQtyValue = items.reduce((sum, i) => sum + Number(i.qty), 0);
        tableRows.push({
          itemNo: '',
          description: 'Total Quantity',
          qty: totalQtyValue,
        });
      }
  
      // Center table horizontally
      const tableWidth = pageWidth - 2 * MARGIN; // Using a 20px margin overall
      const marginLeft = (pageWidth - tableWidth) / 2;
  
      doc.autoTable({
        startY: tableStartY,
        head: [tableColumns.map(col => col.header)],
        body: tableRows.map(row => tableColumns.map(col => row[col.dataKey] || '')),
        theme: 'grid',
        styles: {
          halign: 'center',
          cellPadding: 3,
          lineWidth: 0.5,
          lineColor: 0,
        },
        headStyles: { fillColor: 255, textColor: 0, fontStyle: 'bold' },
        margin: { left: marginLeft, right: marginLeft, bottom: 5 },
      });
    };
  
    const drawRemarksSection = () => {
      const finalTableY = doc.lastAutoTable.finalY;
      if (remarks.trim()) {
        const remarksY = finalTableY + 10;
        doc.setFont('helvetica', 'bold');
        doc.text('Remarks:', MARGIN, remarksY);
        doc.setFont('helvetica', 'normal');
        const splitRemarks = doc.splitTextToSize(remarks, pageWidth - 2 * MARGIN);
        doc.text(splitRemarks, MARGIN, remarksY + 6);
      }
    };
  
    const drawSignatureSection = () => {
      const signatureStartY = doc.lastAutoTable.finalY + 80;
      doc.setFontSize(NORMAL_FONT_SIZE);
      doc.text('Receiver Signature:', MARGIN, signatureStartY + 16);
      doc.text('______________________', MARGIN, signatureStartY + 22);
      doc.text('Approved and confirmed by:', pageWidth - MARGIN, signatureStartY + 16, { align: 'right' });
      doc.text('______________________', pageWidth - MARGIN, signatureStartY + 22, { align: 'right' });
    };
  
    // ---------- Execute PDF Generation ----------
  
    drawHeader();
    drawRecipientDetails();
    drawTableSection();
    drawRemarksSection();
    drawSignatureSection();
  
    // Save the PDF
    doc.save('Good_Receive.pdf');
  
    // Update inventory after generating the PDF
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
            <label>Document ID:</label>
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
            <label>Validity Period (days):</label>
            <select
              value={validityPeriod}
              onChange={(e) => setValidityPeriod(e.target.value)}
            >
              <option value="15">15</option>
              <option value="30">30</option>
              <option value="60">60</option>
              <option value="90">90</option>
            </select>
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
          <p>
            Total Quantity: <strong>{totalQty}</strong>
          </p>
          {includeUnitPrice && (
            <p>
              Total Amount: <strong>RM {totalAmount.toFixed(2)}</strong>
            </p>
          )}
        </div>
      </section>

      {/* File Upload & Tracking Section */}
      <section className="section">
        <h2>Upload & Track Files</h2>
        <div className="grid-container">
          <div className="form-item">
            <label>Site Name:</label>
            <input
              type="text"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              placeholder="Enter site name"
            />
          </div>
          <div className="form-item">
            <label>Select Files to Upload:</label>
            <input type="file" name="files" onChange={handleLocalFileChange} multiple />
          </div>
        </div>
        {localFiles.length > 0 && (
          <div className="files-list">
            <h3>Files Selected (Not yet uploaded)</h3>
            <ul>
              {localFiles.map((fileObj, index) => (
                <li key={index}>
                  <span>{fileObj.file.name}</span> —{' '}
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

      {/* File History Section */}
      <section className="section">
        <h2>Uploaded Files History</h2>
        {fileHistory.length > 0 ? (
          <table className="file-history-table">
            <thead>
              <tr>
                <th>File Name</th>
                <th>File Type</th>
                <th>Status</th>
                <th>Site Name</th>
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
                  <td>{file.siteName || ''}</td>
                  <td>{new Date(file.uploaded_at).toLocaleString()}</td>
                  <td>
                    <button onClick={() => previewFile(file.id)}>Preview</button>
                    <button onClick={() => openEditModal(file)} style={{ marginLeft: '5px' }}>
                      Edit
                    </button>
                    <button onClick={() => deleteFile(file.id)} style={{ marginLeft: '5px' }}>
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

      {/* Responsive Preview Modal */}
      {previewModalOpen && (
        <div className="modal-overlay" onClick={() => setPreviewModalOpen(false)}>
          <div
            className={`modal-content responsive-preview ${isMaximized ? 'fullscreen' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="preview-header">
              <h3>File Preview</h3>
              <div>
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
                  style={{ width: '100%', height: '100%' }}
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
              <select value={editedStatus} onChange={(e) => setEditedStatus(e.target.value)}>
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
        {/* Instead of "Generate PDF", we call our function generateGoodReceivePDF */}
        <button type="button" onClick={generateGoodReceivePDF} className="generate-btn">
          Generate Good Receive
        </button>
        <button type="button" className="refresh-btn" onClick={clearForm}>
          Refresh Form
        </button>
      </div>
    </div>
  );
}

export default GoodReceivedForm;
