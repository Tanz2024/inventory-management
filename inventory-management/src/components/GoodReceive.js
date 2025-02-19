import React, { useState, useEffect, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import './GoodReceive.css';

function GoodReceivedForm({ onItemsUpdate }) {
  // Vendor / Supplier Information
  const [attnPerson, setAttnPerson] = useState(''); // Contact person (supplier)
  const [vendorName, setVendorName] = useState('');   // Vendor name
  const [vendorAddress, setVendorAddress] = useState('');
  const [vendorTel, setVendorTel] = useState('');
  const [vendorEmail, setVendorEmail] = useState('');

  // Goods Received Details
  const [grNo, setGrNo] = useState('');
  const [receivedDate, setReceivedDate] = useState(''); // Received Date (date only)
  const [inspector, setInspector] = useState('');
  const [remarks, setRemarks] = useState('');

  // Items received
  const [items, setItems] = useState([{ itemId: '', qty: 1, unitPrice: 0 }]);
  const [includeUnitPrice, setIncludeUnitPrice] = useState(true);
  const [adminItems, setAdminItems] = useState([]);

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

  // Handlers for items list
  const handleItemChange = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  };

  const handleAddItem = () => setItems([...items, { itemId: '', qty: 1, unitPrice: 0 }]);
  const handleRemoveItem = (index) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
    if (onItemsUpdate) onItemsUpdate(newItems);
  };

  // Helper to capitalize a string
  const capitalize = (str) =>
    str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();

  // Clear form fields
  const clearForm = () => {
    setAttnPerson('');
    setVendorName('');
    setVendorAddress('');
    setVendorTel('');
    setVendorEmail('');
    setGrNo('');
    setReceivedDate('');
    setInspector('');
    setRemarks('');
    setItems([{ itemId: '', qty: 1, unitPrice: 0 }]);
    setIncludeUnitPrice(true);
  };

  // Compute real-time summary
  const totalQty = useMemo(() => items.reduce((sum, item) => sum + Number(item.qty), 0), [items]);
  const totalAmount = useMemo(
    () =>
      includeUnitPrice
        ? items.reduce((sum, item) => sum + Number(item.qty) * parseFloat(item.unitPrice || 0), 0)
        : 0,
    [items, includeUnitPrice]
  );

  // Update admin inventory via API
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

  // Generate PDF for Goods Received Note.
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
    const leftMargin = 10;

    // --- Header Section (SQUARECLOUD Details) ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    let currentY = 15;
    doc.text('SQUARECLOUD (MALAYSIA) SDN BHD', leftMargin, currentY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    currentY += 6;
    doc.text('D-61-3A, LEVEL 3A, JAYA ONE, 72A,', leftMargin, currentY);
    currentY += 5;
    doc.text('Jln Profesor Diraja Ungku Aziz, Seksyen 13,', leftMargin, currentY);
    currentY += 5;
    doc.text('46200 Petaling Jaya, Selangor', leftMargin, currentY);
    currentY += 5;
    doc.text('Tel: 03-7497 2558', leftMargin, currentY);

    // Company Logo (right)
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

    // --- Title Section ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    const titleY = currentY + 10;
    doc.text('GOOD RECEIVED NOTE', leftMargin, titleY);

    // --- Vendor / Supplier Details (Recipient) ---
    const infoY = titleY + 15;
    doc.setFont('helvetica', 'normal');
    doc.text(`Attn: ${attnPerson}`, leftMargin, infoY);
    doc.setFont('helvetica', 'bold');
    doc.text(`To: ${vendorName}`, leftMargin, infoY + 8);
    doc.setFont('helvetica', 'normal');
    doc.text(vendorAddress, leftMargin, infoY + 16);
    doc.text(`Tel: ${vendorTel}`, leftMargin, infoY + 24);
    doc.text(`Email: ${vendorEmail}`, leftMargin, infoY + 32);

    // --- Goods Received Details (Right Column) ---
    doc.text(`GR No: ${grNo}`, pageWidth - 10, infoY, { align: 'right' });
    doc.text(`Received Date: ${formattedDate}`, pageWidth - 10, infoY + 8, { align: 'right' });
    doc.text(`Inspector: ${inspector}`, pageWidth - 10, infoY + 16, { align: 'right' });

    // --- Additional Received Info ---
    const receivedInfoY = infoY + 28;
    doc.text(`Remarks: ${remarks}`, leftMargin, receivedInfoY);

    // --- Introduction Paragraph ---
    const introY = infoY + 40;
    doc.text('Goods Received by:', leftMargin, introY);
    doc.text('Please find below the details of the received goods.', leftMargin, introY + 8);

    // --- Items Table Section ---
    let tableColumns, tableRows;
    if (includeUnitPrice) {
      doc.setFont('times', 'bold');
      tableColumns = [
        { header: capitalize('item no'), dataKey: 'itemNo' },
        { header: capitalize('description'), dataKey: 'description' },
        { header: capitalize('qty'), dataKey: 'qty' },
        { header: 'Unit Price (RM)', dataKey: 'unitPrice' },
        { header: 'Amount (RM)', dataKey: 'amount' },
      ];
      doc.setFont('helvetica', 'normal');
      tableRows = items.map((item, index) => {
        const adminItem = adminItems.find((ai) => ai.item_id.toString() === item.itemId);
        const description = adminItem ? adminItem.item_name : '';
        const unitPrice = parseFloat(item.unitPrice);
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
      const totalQty = items.reduce((sum, item) => sum + Number(item.qty), 0);
      const totalAmount = items.reduce((sum, item) => sum + Number(item.qty) * parseFloat(item.unitPrice), 0);
      tableRows.push({
        itemNo: '',
        description: 'Total quantity',
        qty: totalQty,
        unitPrice: '',
        amount: '',
      });
      tableRows.push({
        itemNo: '',
        description: 'Total amount',
        qty: '',
        unitPrice: '',
        amount: totalAmount.toFixed(2),
      });
    } else {
      doc.setFont('times', 'bold');
      tableColumns = [
        { header: capitalize('item no'), dataKey: 'itemNo' },
        { header: capitalize('description'), dataKey: 'description' },
        { header: capitalize('qty'), dataKey: 'qty' },
      ];
      doc.setFont('helvetica', 'normal');
      tableRows = items.map((item, index) => {
        const adminItem = adminItems.find((ai) => ai.item_id.toString() === item.itemId);
        const description = adminItem ? adminItem.item_name : '';
        return {
          itemNo: index + 1,
          description,
          qty: item.qty,
        };
      });
      const totalQty = items.reduce((sum, item) => sum + Number(item.qty), 0);
      tableRows.push({
        itemNo: '',
        description: 'Total quantity',
        qty: totalQty,
      });
    }

    doc.autoTable({
      startY: introY + 12,
      head: [tableColumns.map((col) => col.header)],
      body: tableRows.map((row) => tableColumns.map((col) => row[col.dataKey])),
      theme: 'grid',
      styles: { halign: 'center', cellPadding: 3, lineWidth: 0.5, lineColor: 0 },
      headStyles: { fillColor: 255, textColor: 0, fontStyle: 'bold' },
      margin: { left: 20, right: 20, bottom: 5 },
    });

    // --- Signature Section ---
    const finalY = doc.lastAutoTable.finalY + 20;
    doc.setFontSize(10);
    doc.text('Goods received by:', leftMargin, finalY);
    doc.text('Receiver Signature: ______________________', leftMargin, finalY + 8);
    doc.text('Approved by: ______________________', pageWidth - 10, finalY + 8, { align: 'right' });

    doc.save('Goods_Received_Note.pdf');
    updateAdminInventory();
  };

  return (
    <div className="form-container">
      <h1 className="form-title">Goods Received Form</h1>

      {/* Vendor Information Section */}
      <section className="section">
        <h2>Vendor Information</h2>
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
            <label>Vendor Name:</label>
            <input
              type="text"
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              required
              style={{ fontWeight: 'bold' }}
            />
          </div>
          <div className="form-item">
            <label>Vendor Address:</label>
            <input
              type="text"
              value={vendorAddress}
              onChange={(e) => setVendorAddress(e.target.value)}
              required
            />
          </div>
          <div className="form-item">
            <label>Vendor Phone:</label>
            <input
              type="text"
              value={vendorTel}
              onChange={(e) => setVendorTel(e.target.value)}
              required
            />
          </div>
          <div className="form-item">
            <label>Vendor Email:</label>
            <input
              type="email"
              value={vendorEmail}
              onChange={(e) => setVendorEmail(e.target.value)}
              required
            />
          </div>
        </div>
      </section>

      {/* Goods Received Details Section */}
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
            <label>Inspector:</label>
            <input
              type="text"
              value={inspector}
              onChange={(e) => setInspector(e.target.value)}
              placeholder="Enter inspector name"
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
              <button type="button" className="remove-btn" onClick={() => handleRemoveItem(index)}>
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

      {/* Goods Received Summary Section */}
      <section className="section">
        <h2>Goods Received Summary</h2>
        <div className="summary">
          <p>Total Quantity: <strong>{totalQty}</strong></p>
          {includeUnitPrice && (
            <p>Total Amount: <strong>RM {totalAmount.toFixed(2)}</strong></p>
          )}
        </div>
      </section>

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
