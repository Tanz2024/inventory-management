import React, { useState, useEffect, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import './Delivery.css';

function DeliveryOrderForm({ onItemsUpdate }) {
  // Form state
  const [attnPerson, setAttnPerson] = useState(''); // Contact person name
  const [attnName, setAttnName] = useState('');       // Company name
  const [address, setAddress] = useState('');
  const [tel, setTel] = useState('');
  const [email, setEmail] = useState('');
  const [poNo, setPoNo] = useState('');
  const [date, setDate] = useState('');               // Order date (date only)
  const [validityPeriod, setValidityPeriod] = useState('30'); // "30" or "60" days
  const [comments, setComments] = useState('');         // Additional comments
  const [items, setItems] = useState([{ itemId: '', qty: 1, unitPrice: 0 }]);
  const [includeUnitPrice, setIncludeUnitPrice] = useState(true);
  const [adminItems, setAdminItems] = useState([]);

  // Fetch admin items on mount and every 30 seconds
  useEffect(() => {
    const fetchAdminItems = () => {
      fetch('https://bc4a-211-25-11-204.ngrok-free.app/admin-dashboard/items', {
        method: 'GET',
        credentials: 'include'
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

  // Compute real-time order summary
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
      items: items.map(item => ({
        itemId: item.itemId,
        qty: Number(item.qty)
      }))
    };

    fetch('https://bc4a-211-25-11-204.ngrok-free.app/delivery/update-inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    })
      .then(response => {
        if (!response.ok) throw new Error('Failed to update inventory.');
        return response.json();
      })
      .then(data => {
        console.log('Inventory updated:', data);
        window.dispatchEvent(new Event('inventoryUpdated'));
      })
      .catch(err => console.error('Error updating inventory:', err));
  };

  // Generate PDF with updated recipient layout:
  // Row 1: "Attn: {contact person}" at x = 10.
  // Rows 2–5: "To:" block with company name (in bold), address, Tel, and Email, all printed starting at x = 10.
  // Order details are printed in the right column.
  const generateDeliveryOrder = () => {
    if (!date) {
      alert("Please select a valid Order Date.");
      return;
    }
    const orderDate = new Date(date);
    if (isNaN(orderDate.getTime())) {
      alert("Invalid Order Date.");
      return;
    }
    // Format date as locale date string (date only)
    const formattedDate = orderDate.toLocaleDateString();

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // --- Header Section ---
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
    const logoPath = '/Squarecloud_Logo1.png';
    try {
      doc.addImage(logoPath, 'PNG', logoX, logoY, logoWidth, logoHeight);
    } catch (e) {
      console.warn('Logo image error:', e);
    }

    // Title (centered)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('Delivery Order', pageWidth / 2, 50, { align: 'center' });

    // --- Recipient Details ---
    const infoY = 60;
    doc.setFontSize(10);
    // Row 1: Attn: (contact person) at x = 10
    doc.setFont('helvetica', 'normal');
    doc.text(`Attn: ${attnPerson}`, 10, infoY);
    // Row 2: "To:" with company name at x = 10 (set company name in bold)
    doc.setFont('helvetica', 'bold');
    doc.text(`To: ${attnName}`, 10, infoY + 8);
    // Reset font to normal
    doc.setFont('helvetica', 'normal');
    // Row 3: Delivery address at x = 10
    doc.text(address, 10, infoY + 16);
    // Row 4: Tel at x = 10
    doc.text(`Tel: ${tel}`, 10, infoY + 24);
    // Row 5: Email at x = 10
    doc.text(`Email: ${email}`, 10, infoY + 32);

    // Right column: Order details remain unchanged
    doc.text(`PO No: ${poNo}`, pageWidth - 10, infoY, { align: 'right' });
    doc.text(`Order Date: ${formattedDate}`, pageWidth - 10, infoY + 8, { align: 'right' });
    doc.text(`Validity: ${validityPeriod} Days`, pageWidth - 10, infoY + 16, { align: 'right' });

    // --- Introduction Paragraph ---
    const introY = infoY + 40;
    doc.setFont('helvetica', 'normal');
    doc.text("Dear Sir/Madam,", 10, introY);
    doc.text("Please find below our delivery order details.", 10, introY + 8);

    // --- Item Table Section ---
    let tableColumns, tableRows;
    if (includeUnitPrice) {
      doc.setFont('times', 'bold');
      tableColumns = [
        { header: capitalize("item no"), dataKey: 'itemNo' },
        { header: capitalize("description"), dataKey: 'description' },
        { header: capitalize("qty"), dataKey: 'qty' },
        { header: "Unit Price (RM)", dataKey: 'unitPrice' },
        { header: "Amount (RM)", dataKey: 'amount' }
      ];
      doc.setFont('helvetica', 'normal');
      tableRows = items.map((item, index) => {
        const adminItem = adminItems.find(ai => ai.item_id.toString() === item.itemId);
        const description = adminItem ? adminItem.item_name : '';
        const unitPrice = parseFloat(item.unitPrice);
        const qty = Number(item.qty);
        const amount = qty * unitPrice;
        return {
          itemNo: index + 1,
          description,
          qty,
          unitPrice: unitPrice.toFixed(2),
          amount: amount.toFixed(2)
        };
      });
      const totalQty = items.reduce((sum, item) => sum + Number(item.qty), 0);
      const totalAmount = items.reduce((sum, item) => sum + (Number(item.qty) * parseFloat(item.unitPrice)), 0);
      tableRows.push({
        itemNo: "",
        description: "Total quantity",
        qty: totalQty,
        unitPrice: "",
        amount: ""
      });
      tableRows.push({
        itemNo: "",
        description: "Total amount",
        qty: "",
        unitPrice: "",
        amount: totalAmount.toFixed(2)
      });
    } else {
      doc.setFont('times', 'bold');
      tableColumns = [
        { header: capitalize("item no"), dataKey: 'itemNo' },
        { header: capitalize("description"), dataKey: 'description' },
        { header: capitalize("qty"), dataKey: 'qty' }
      ];
      doc.setFont('helvetica', 'normal');
      tableRows = items.map((item, index) => {
        const adminItem = adminItems.find(ai => ai.item_id.toString() === item.itemId);
        const description = adminItem ? adminItem.item_name : '';
        return {
          itemNo: index + 1,
          description,
          qty: item.qty
        };
      });
      const totalQty = items.reduce((sum, item) => sum + Number(item.qty), 0);
      tableRows.push({
        itemNo: "",
        description: "Total quantity",
        qty: totalQty
      });
    }

    doc.autoTable({
      startY: introY + 12,
      head: [tableColumns.map(col => col.header)],
      body: tableRows.map(row => tableColumns.map(col => row[col.dataKey])),
      theme: 'grid',
      styles: { halign: 'center', cellPadding: 3, lineWidth: 0.5, lineColor: 0 },
      headStyles: { fillColor: 255, textColor: 0, fontStyle: 'bold' },
      margin: { left: 20, right: 20, bottom: 5 }
    });

    // --- Additional Comments Section ---
    const commentsY = doc.lastAutoTable.finalY + 10;
    if (comments.trim()) {
      doc.setFont('helvetica', 'bold');
      doc.text("Additional Comments:", 10, commentsY);
      doc.setFont('helvetica', 'normal');
      const splitComments = doc.splitTextToSize(comments, pageWidth - 20);
      doc.text(splitComments, 10, commentsY + 6);
    }

    // --- Notes & Signature Section ---
    const finalY = doc.lastAutoTable.finalY + 20;
    doc.setFontSize(10);
    doc.text("Delivery & Installation will be completed as scheduled.", 10, finalY);
    doc.text("Payment shall be made upon invoice (30 days term).", 10, finalY + 6);
    doc.text("Yours faithfully,", 10, finalY + 16);
    doc.text("______________________", 10, finalY + 22);
    doc.text("Approved and confirmed by:", pageWidth - 10, finalY + 16, { align: 'right' });
    doc.text("______________________", pageWidth - 10, finalY + 22, { align: 'right' });

    doc.save('Delivery_Order.pdf');
    updateAdminInventory();
  };

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
          <div className="form-item">
            <label>Validity:</label>
            <div className="radio-group">
              <label>
                <input
                  type="radio"
                  name="validity"
                  value="30"
                  checked={validityPeriod === '30'}
                  onChange={(e) => setValidityPeriod(e.target.value)}
                />
                30 Days
              </label>
              <label>
                <input
                  type="radio"
                  name="validity"
                  value="60"
                  checked={validityPeriod === '60'}
                  onChange={(e) => setValidityPeriod(e.target.value)}
                />
                60 Days
              </label>
            </div>
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

      {/* Order Summary Section */}
      <section className="section">
        <h2>Order Summary</h2>
        <div className="summary">
          <p>Total Quantity: <strong>{totalQty}</strong></p>
          {includeUnitPrice && (
            <p>Total Amount: <strong>RM {totalAmount.toFixed(2)}</strong></p>
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
