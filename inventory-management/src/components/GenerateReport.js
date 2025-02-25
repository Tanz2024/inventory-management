import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Helper: Formats a Date object into a human-readable string.
 */
function formatDateTime(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return 'N/A';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).format(date);
}

/**
 * generateReportPDF
 *
 * Generates a PDF report with the following sections:
 *   1) HEADER SECTION: Uses Helvetica to print company address and logo.
 *   2) Metadata Section: Includes report title, site, location filter, start/end date, report time, recipient, and admin info.
 *   3) For each item, a table of transaction logs is generated. Logs are sorted in descending order
 *      (most recent first) and the running stock is computed backwards (with negative quantity changes preserved).
 *   4) Footer: Page numbering at bottom-right.
 *
 * @param {Object} reportConfig - Configuration for the report.
 * @param {Array} reportConfig.selectedItems - Array of items (each should include item_id, item_name, quantity, etc.)
 * @param {Array} reportConfig.logs - Array of transaction log objects.
 * @param {string|null} reportConfig.locationFilter - Optional location filter.
 * @param {string} reportConfig.adminName - Name of the admin issuing the report.
 * @param {string} reportConfig.siteName - Site name.
 * @param {Date|null} reportConfig.startDate - Start date (assumed adjusted to beginning of day).
 * @param {Date|null} reportConfig.endDate - End date (assumed adjusted to end of day).
 * @param {string} reportConfig.recipientName - Recipient of the report.
 */
export default function generateReportPDF(reportConfig) {
  const {
    selectedItems = [],
    logs = [],
    locationFilter = null,
    adminName = 'N/A',
    siteName = '',
    startDate = null,
    endDate = null,
    recipientName = '',
  } = reportConfig;

  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 10;
  const marginRight = 15;
  const marginTop = 15;

  // ---------- 1) HEADER SECTION ----------
  const drawHeader = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    const addressX = marginLeft;
    let headerY = marginTop;
    doc.text('SQUARECLOUD (MALAYSIA) SDN BHD', addressX, headerY);
  
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    headerY += 6;
    doc.text('D-61-3A, LEVEL 3A, JAYA ONE, 72A,', addressX, headerY);
    headerY += 5;
    doc.text('Jln Profesor Diraja Ungku Aziz, Seksyen 13,', addressX, headerY);
    headerY += 5;
    doc.text('46200 Petaling Jaya, Selangor', addressX, headerY);
    headerY += 5;
    doc.text('Tel: 03-7497 2558', addressX, headerY);
  
    // Company Logo (right)
    const logoWidth = 40;
    const logoHeight = 40;
    const logoX = pageWidth - logoWidth - marginRight;
    const logoY = 10;
    try {
      doc.addImage('/Squarecloud_Logo1.png', 'PNG', logoX, logoY, logoWidth, logoHeight);
    } catch (e) {
      console.warn('Logo image error:', e);
    }
  
    // Draw a horizontal line to separate header from content.
    doc.setLineWidth(0.5);
    doc.line(marginLeft, headerY + 4, pageWidth - marginRight, headerY + 4);
  };

  // Draw header on the first page.
  drawHeader();

  /* ----------------------------------------------------
     2. Metadata Section
  ----------------------------------------------------- */
  let currentY = marginTop + 45; // leave space below header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Inventory Management Report', pageWidth / 2, currentY, { align: 'center' });
  currentY += 8;
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  if (siteName) {
    doc.text(`Site: ${siteName}`, marginLeft, currentY);
    currentY += 5;
  }
  if (startDate) {
    doc.text(`Start Date: ${startDate.toLocaleDateString()}`, marginLeft, currentY);
    currentY += 5;
  }
  if (endDate) {
    doc.text(`End Date: ${endDate.toLocaleDateString()}`, marginLeft, currentY);
    currentY += 5;
  }
  
  // Show location filter if provided
  if (locationFilter) {
    doc.text(`Location: ${locationFilter}`, marginLeft, currentY);
    currentY += 5;
  }
  
  // Report Time
  const reportTime = `Report Time: ${formatDateTime(new Date())}`;
  doc.text(reportTime, marginLeft, currentY);
  currentY += 5;
  
  if (recipientName) {
    doc.text(`Recipient: ${recipientName}`, marginLeft, currentY);
    currentY += 5;
  }
  doc.text(`Admin Issued By: ${adminName}`, marginLeft, currentY);
  currentY += 10;
  
  /* ----------------------------------------------------
     3. Build Report Tables for Each Item
  ----------------------------------------------------- */
  // Filter items if location filter is provided.
  const finalItems = locationFilter
    ? selectedItems.filter(item =>
        item.location && item.location.toLowerCase().includes(locationFilter.toLowerCase()))
    : selectedItems;
  
  // Group logs by item_id.
  const logsByItemId = new Map();
  logs.forEach(log => {
    const itemExists = finalItems.find(i => i.item_id === log.item_id);
    if (!itemExists) return;
    if (!logsByItemId.has(log.item_id)) {
      logsByItemId.set(log.item_id, []);
    }
    logsByItemId.get(log.item_id).push(log);
  });
  
  finalItems.forEach(item => {
    // Check if there's enough space; if not, add a new page.
    if (currentY > pageHeight - 40) {
      doc.addPage();
      drawHeader();
      currentY = marginTop + 45;
    }
  
    // Draw item header.
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    const headerText = `Item: ${item.item_name}   (Current Stock: ${Math.max(item.quantity, 0)})`;
    doc.text(headerText, marginLeft, currentY);
    currentY += 6;
  
    // Retrieve logs for this item.
    let itemLogs = logsByItemId.get(item.item_id) || [];
    // Sort logs in descending order (most recent first).
    itemLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
    // Initialize running stock with current stock.
    let runningStock = item.quantity;
    const computedRows = itemLogs.map(log => {
      const ts = new Date(log.timestamp);
      const dtStr = formatDateTime(ts);
  
      // Determine who made the change.
      let changedBy = log.updated_by || 'N/A';
      if (log.remarks) {
        const r = log.remarks.toLowerCase();
        if (r.includes('admin')) changedBy = 'Admin';
        else if (r.includes('user')) changedBy = 'User';
      }
  
// Parse the quantity change.
const qtyChange = parseInt(log.quantity_change, 10) || 0;

// Separate Quantity In and Quantity Out
const quantityIn = qtyChange > 0 ? `+${qtyChange}` : "";
const quantityOut = qtyChange < 0 ? `${qtyChange}` : "";

      // Display the current running stock.
      const stockDisplayed = runningStock < 0 ? 0 : runningStock;
  
      // Use the provided site name if available, otherwise "N/A".
      const displaySite = log.site_name && log.site_name.trim() !== "" 
        ? log.site_name 
        : "N/A";
  
      const remarks = log.remarks || "";
  
      // Update running stock "backwards".
      runningStock = runningStock - qtyChange;
      if (runningStock < 0) runningStock = 0;
  
      return {
        dtStr,
        changedBy,
        quantityIn,
        quantityOut,
        stock: String(stockDisplayed),
        displaySite,
        remarks
      };
    });
  
    // If no logs, add a placeholder.
    if (computedRows.length === 0) {
      computedRows.push({
        dtStr: 'No logs found',
        changedBy: '',
        quantityIn: "",
        quantityOut: "",
        stock: String(item.quantity),
        displaySite: item.site || "N/A",
        remarks: ""
      });
    }
  
    // Build table rows.
    const tableRows = computedRows.map(row => {
      return [
        row.dtStr,
        row.changedBy,
        row.quantityIn,
        row.quantityOut,
        row.stock,
        row.displaySite,
        row.remarks
      ];
    });
  
    // Define table headers.
    const headCols = ['Date & Time', 'Changed By', 'Quantity In', 'Quantity Out', 'Stock', 'Site', 'Remarks'];
    const tableHead = [headCols];
  
    // Define column styles.
    const columnStyles = {};
    headCols.forEach((col, idx) => {
      let cellWidth = 25;
      switch (col.toLowerCase()) {
        case 'date & time': cellWidth = 38; break;
        case 'changed by': cellWidth = 25; break;
        case 'quantity in': cellWidth = 20; break;
        case 'quantity out': cellWidth = 20; break;
        case 'stock': cellWidth = 20; break;
        case 'site': cellWidth = 25; break;
        case 'remarks': cellWidth = 30; break;
        default: cellWidth = 25;
      }
      columnStyles[idx] = { halign: 'center', cellWidth };
    });
    const totalTableWidth = headCols.reduce((sum, _, idx) => sum + columnStyles[idx].cellWidth, 0);
    const startX = (pageWidth - totalTableWidth) / 2;
  
    // Generate the table using autoTable.
    autoTable(doc, {
      startY: currentY,
      startX: startX,
      head: tableHead,
      body: tableRows,
      theme: 'striped',
      styles: {
        font: 'helvetica',
        fontSize: 10,
        halign: 'center',
        overflow: 'linebreak',
        textColor: 0,
      },
      headStyles: {
        fillColor: [30, 30, 30],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles,
      margin: { left: marginLeft, right: marginRight },
    });
    currentY = doc.lastAutoTable.finalY + 10;
  });
  
  /* ----------------------------------------------------
     4. Footer Section: Page Numbering (Bottom Right)
  ----------------------------------------------------- */
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - marginRight, pageHeight - 10, { align: 'right' });
  }
  
  // Save the PDF with a date-based filename.
  doc.save(`Inventory_${new Date().toISOString().slice(0, 10)}.pdf`);
}
