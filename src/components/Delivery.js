import React, { useState, useEffect, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import './Delivery.css';

function DeliveryOrderForm({ onItemsUpdate }) {
  // ---------------------------
  // Form State
  // ---------------------------
  const [attnPerson, setAttnPerson] = useState('');
  const [attnName, setAttnName] = useState('');
  const [address, setAddress] = useState('');
  const [tel, setTel] = useState('');
  const [email, setEmail] = useState('');
  const [poNo, setPoNo] = useState('');
  const [date, setDate] = useState('');
  const [validityPeriod, setValidityPeriod] = useState('30'); // 15, 30, 60, 90
  const [comments, setComments] = useState('');
  const [items, setItems] = useState([{ itemId: '', qty: 1, unitPrice: 0 }]);
  const [includeUnitPrice, setIncludeUnitPrice] = useState(true);
  const [adminItems, setAdminItems] = useState([]);

  // ---------------------------
  // Fetch admin items
  // ---------------------------
  useEffect(() => {
    const fetchAdminItems = () => {
      fetch('http://localhost:5000/admin-dashboard/items', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'ngrok-skip-browser-warning': '1',
          'Content-Type': 'application/json', // Only needed if you're sending data

        },
      })
        .then((res) => res.json())
        .then((data) => setAdminItems(data.items || []))
        .catch((err) => console.error('Error fetching admin items:', err));
    };
    fetchAdminItems();
    const interval = setInterval(fetchAdminItems, 30000);
    return () => clearInterval(interval);
  }, []);

  // ---------------------------
  // Items Handlers
  // ---------------------------
  const handleItemChange = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  };

  const handleAddItem = () => {
    setItems([...items, { itemId: '', qty: 1, unitPrice: 0 }]);
  };

  const handleRemoveItem = (index) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
    if (onItemsUpdate) onItemsUpdate(newItems);
  };

  // ---------------------------
  // Clear Form
  // ---------------------------
  const clearForm = () => {
    setAttnPerson('');
    setAttnName('');
    setAddress('');
    setTel('');
    setEmail('');
    setPoNo('');
    setDate('');
    setValidityPeriod('30');
    setComments('');
    setItems([{ itemId: '', qty: 1, unitPrice: 0 }]);
    setIncludeUnitPrice(true);
  };

  // ---------------------------
  // Summaries
  // ---------------------------
  const totalQty = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.qty), 0),
    [items]
  );

  const totalAmount = useMemo(() => {
    if (!includeUnitPrice) return 0;
    return items.reduce(
      (sum, item) => sum + Number(item.qty) * parseFloat(item.unitPrice || 0),
      0
    );
  }, [items, includeUnitPrice]);

  // ---------------------------
  // Update Inventory
  // ---------------------------
  const updateAdminInventory = () => {
    const payload = {
      items: items.map((item) => ({
        itemId: item.itemId,
        qty: Number(item.qty),
      })),
    };

    fetch('http://localhost:5000/delivery/update-inventory', {
      method: 'POST',
      headers: {
        'ngrok-skip-browser-warning': '1',
        'Content-Type': 'application/json', // Only needed if you're sending data

      },
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
  // Helper function to capitalize
  // ---------------------------
  const capitalize = (str) =>
    str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();

  // ---------------------------
  // Generate Delivery Order PDF
  // ---------------------------
  const generateDeliveryOrder = () => {
    if (!date) {
      alert('Please select a valid Order Date.');
      return;
    }
    const orderDate = new Date(date);
    if (isNaN(orderDate.getTime())) {
      alert('Invalid Order Date.');
      return;
    }
    const formattedDate = orderDate.toLocaleDateString();

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header Section
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    const addressX = 10;
    let currentY = 15;
    doc.text('SQUARECLOUD (MALAYSIA) SDN BHD', addressX, currentY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    currentY += 6;
    doc.text('D-61-3A, LEVEL 3A, JAYA ONE, 72A,', addressX, currentY);
    currentY += 5;
    doc.text('Jln Profesor Diraja Ungku Aziz, Seksyen 13,', addressX, currentY);
    currentY += 5;
    doc.text('46200 Petaling Jaya, Selangor', addressX, currentY);
    currentY += 5;
    doc.text('Tel: 03-7497 2558', addressX, currentY);

    // Company Logo (right)
    const logoWidth = 40;
    const logoHeight = 40;
    const logoX = pageWidth - logoWidth - 10;
    const logoY = 10;
    const logoPath = '/Squarecloud_Logo1.png'; // Adjust if needed
    try {
      doc.addImage(logoPath, 'PNG', logoX, logoY, logoWidth, logoHeight);
    } catch (e) {
      console.warn('Logo image error:', e);
    }

    // Title (centered)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('Delivery Order', pageWidth / 2, 50, { align: 'center' });

    // Recipient Details
    const infoY = 60;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Attn: ${attnPerson}`, 10, infoY);

    doc.setFont('helvetica', 'bold');
    doc.text(`To: ${attnName}`, 10, infoY + 8);

    doc.setFont('helvetica', 'normal');
    doc.text(address, 10, infoY + 16);
    doc.text(`Tel: ${tel}`, 10, infoY + 24);
    doc.text(`Email: ${email}`, 10, infoY + 32);

    // Right column: Order details
    doc.text(`PO No: ${poNo}`, pageWidth - 10, infoY, { align: 'right' });
    doc.text(`Order Date: ${formattedDate}`, pageWidth - 10, infoY + 8, { align: 'right' });
    doc.text(`Validity: ${validityPeriod} Days`, pageWidth - 10, infoY + 16, { align: 'right' });

    // Intro Paragraph
    const introY = infoY + 40;
    doc.setFont('helvetica', 'normal');
    doc.text('Dear Sir/Madam,', 10, introY);
    doc.text(
      'We are pleased to append here with our quotation for your reference as below:',
      10,
      introY + 8
    );

    // Add some space above the table for a professional look
    let tableStartY = introY + 20;

    // Item Table Section
    let tableColumns;
    let tableRows;

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

      const totalQtyValue = items.reduce((sum, i) => sum + Number(i.qty), 0);
      const totalAmountValue = items.reduce(
        (sum, i) => sum + Number(i.qty) * parseFloat(i.unitPrice || 0),
        0
      );

      // Additional rows for totals
      tableRows.push({
        itemNo: '',
        description: 'Total quantity',
        qty: totalQtyValue,
        unitPrice: '',
        amount: '',
      });
      tableRows.push({
        itemNo: '',
        description: 'Total amount',
        qty: '',
        unitPrice: '',
        amount: totalAmountValue.toFixed(2),
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

      const totalQtyValue = items.reduce((sum, i) => sum + Number(i.qty), 0);
      tableRows.push({
        itemNo: '',
        description: 'Total quantity',
        qty: totalQtyValue,
      });
    }

    // Center table horizontally
    const tableWidth = pageWidth - 40; // 20px margin each side
    const marginLeft = (pageWidth - tableWidth) / 2;

    doc.autoTable({
      startY: tableStartY,
      head: [tableColumns.map((col) => col.header)],
      body: tableRows.map((row) => tableColumns.map((col) => row[col.dataKey] || '')),
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

    // Additional Comments Section
    const commentsY = doc.lastAutoTable.finalY + 10;
    if (comments.trim()) {
      doc.setFont('helvetica', 'bold');
      doc.text('Additional Comments:', 10, commentsY);
      doc.setFont('helvetica', 'normal');
      const splitComments = doc.splitTextToSize(comments, pageWidth - 20);
      doc.text(splitComments, 10, commentsY + 6);
    }

    // Notes & Signature Section
    // Increase space for signature
    const signatureStart = doc.lastAutoTable.finalY + 100; // more space for signatures
    doc.setFontSize(10);

    // Adjust these Y offsets to create more vertical spacing
    doc.text('1) Delivery & Installation will be completed as scheduled.', 10, signatureStart);
    doc.text('2) Payment shall be made upon invoice (30 days term).', 10, signatureStart + 6);

 
    doc.text('Thank you.', 10, signatureStart + 16);
    doc.text('Yours faithfully,', 10, signatureStart + 26);

    doc.text('______________________', 10, signatureStart + 32);

    // Right side signature
    doc.text('Approved and confirmed by:', pageWidth - 10, signatureStart + 26, {
      align: 'right',
    });
    doc.text('______________________', pageWidth - 10, signatureStart + 32, {
      align: 'right',
    });

    // Save the PDF
    doc.save('Delivery_Order.pdf');

    // Update Inventory
    updateAdminInventory();
  };

  // ---------------------------
  // Render
  // ---------------------------
  return (
    <div className="form-container">
      <h1 className="form-title">Delivery Order Form</h1>

      {/* Company Information Section */}
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
              value={attnName}
              onChange={(e) => setAttnName(e.target.value)}
              required
              style={{ fontWeight: 'bold' }}
            />
          </div>
          <div className="form-item">
            <label>Address:</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
            />
          </div>
          <div className="form-item">
            <label>Phone:</label>
            <input
              type="text"
              value={tel}
              onChange={(e) => setTel(e.target.value)}
              required
            />
          </div>
          <div className="form-item">
            <label>Email:</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
        </div>
      </section>

      {/* Order Details Section */}
      <section className="section">
        <h2>Order Details</h2>
        <div className="grid-container">
          <div className="form-item">
            <label>PO No:</label>
            <input
              type="text"
              value={poNo}
              onChange={(e) => setPoNo(e.target.value)}
              required
            />
          </div>
          <div className="form-item">
            <label>Order Date:</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          {/* Validity as a <select> with 15, 30, 60, 90 */}
          <div className="form-item">
            <label>Validity (Days):</label>
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
            <label>
              <input
                type="checkbox"
                checked={includeUnitPrice}
                onChange={() => setIncludeUnitPrice(!includeUnitPrice)}
              />
              Include Unit Price (RM)
            </label>
          </div>
          <div className="form-item">
            <label>Additional Comments:</label>
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Enter any additional comments here"
            />
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

      {/* Order Summary Section */}
      <section className="section">
        <h2>Order Summary</h2>
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

      {/* Action Buttons */}
      <div className="button-group">
        <button type="button" onClick={generateDeliveryOrder} className="generate-btn">
          Generate PDF
        </button>
        <button type="button" className="refresh-btn" onClick={clearForm}>
          Refresh Form
        </button>
      </div>
    </div>
  );
}

export default DeliveryOrderForm;