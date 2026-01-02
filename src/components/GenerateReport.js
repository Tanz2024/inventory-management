import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Formats a Date object into a short format for the Date & Time column.
 * The output format will be like "8 may 2025".
 */
function formatKeyInDateShort(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return 'N/A';
  const day = date.getDate();
  let month = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date);
  month = month.replace('.', '').toLowerCase();
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

/**
 * generateReportPDF
 *
 * - Removes the original Timestamp column.
 * - Adds Previous Stock and Current Stock columns calculated per log.
 * - Limits the PDF output to one A4 page.
 * - Improves table layout by letting AutoTable determine column widths automatically.
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

  // Convert startDate and endDate to Date objects if needed.
  const startDateObj = startDate ? new Date(startDate) : null;
  const endDateObj = endDate ? new Date(endDate) : null;

  // Create new PDF document.
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 10;
  const marginRight = 15;
  const marginTop = 15;
  const marginBottom = 20;

  // Function to draw the header.
  const drawHeader = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    let headerY = marginTop;
    doc.text('Leopard Inventory', marginLeft, headerY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    headerY += 6;
    doc.text('D-61-3A, LEVEL 3A, JAYA ONE, 72A,', marginLeft, headerY);
    headerY += 5;
    doc.text('Jln Profesor Diraja Ungku Aziz, Seksyen 13,', marginLeft, headerY);
    headerY += 5;
    doc.text('46200 Petaling Jaya, Selangor', marginLeft, headerY);
    headerY += 5;
    doc.text('Tel: 03-7497 2558', marginLeft, headerY);

    // Add company logo (if available)
    const logoWidth = 40;
    const logoHeight = 40;
    const logoX = pageWidth - logoWidth - marginRight;
    const logoY = 10;
    try {
      doc.addImage('/leopard-logo.jpg', 'JPEG', logoX, logoY, logoWidth, logoHeight);
    } catch (e) {
      console.warn('Logo image error:', e);
    }
    doc.setLineWidth(0.5);
    doc.line(marginLeft, headerY + 4, pageWidth - marginRight, headerY + 4);
  };

  drawHeader();

  // ---------- METADATA SECTION ----------
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
  if (startDateObj) {
    doc.text(`Start Date: ${startDateObj.toLocaleDateString()}`, marginLeft, currentY);
    currentY += 5;
  }
  if (endDateObj) {
    doc.text(`End Date: ${endDateObj.toLocaleDateString()}`, marginLeft, currentY);
    currentY += 5;
  }
  if (locationFilter) {
    doc.text(`Location: ${locationFilter}`, marginLeft, currentY);
    currentY += 5;
  }
  doc.text(`Report Time: ${new Date().toLocaleString()}`, marginLeft, currentY);
  currentY += 5;
  if (recipientName) {
    doc.text(`Recipient: ${recipientName}`, marginLeft, currentY);
    currentY += 5;
  }
  doc.text(`Admin Issued By: ${adminName}`, marginLeft, currentY);
  currentY += 10;

  // ---------- Prepare Per-Item Tables ----------
  // Group logs by item_id.
  const logsByItemId = new Map();
  logs.forEach((log) => {
    if (!logsByItemId.has(log.item_id)) {
      logsByItemId.set(log.item_id, []);
    }
    logsByItemId.get(log.item_id).push(log);
  });

  // Define the table header for each item.
  // Columns: Date & Time, Changed By Who, Qty In, Qty Out, Prev Stock, Curr Stock, Site
  const tableHeader = [
    'Date & Time',
    'Changed By Who',
    'Qty In',
    'Qty Out',
    'Prev Stock',
    'Curr Stock',
    'Site',
  ];

  // Estimate available space on the page.
  const availableHeight = pageHeight - currentY - marginBottom;
  const estimatedHeaderHeight = 10; // approximate header height for the table
  const estimatedRowHeight = 8;     // approximate row height
  const maxRowsPerTable = Math.floor((availableHeight - estimatedHeaderHeight) / estimatedRowHeight);

  // For each selected item, render the item header and its table.
  for (let i = 0; i < selectedItems.length; i++) {
    const item = selectedItems[i];

    // Get logs for the item; filter out any with zero quantity change.
    let itemLogs = logsByItemId.get(item.item_id) || [];
    itemLogs = itemLogs.filter((log) => {
      const qtyChange = parseInt(log.quantity_change, 10) || 0;
      return qtyChange !== 0;
    });

    // Sort logs in ascending order (oldest first) for proper cumulative calculation.
    itemLogs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // Calculate initial stock based on total changes.
    const totalChange = itemLogs.reduce(
      (sum, log) => sum + (parseInt(log.quantity_change, 10) || 0),
      0
    );
    let initialStock = item.quantity - totalChange;
    let runningStock = initialStock;

    // Build table rows with Previous and Current Stock.
    const tableRows = itemLogs.map((log) => {
      const qtyChange = parseInt(log.quantity_change, 10) || 0;
      const prevStock = runningStock;
      const currStock = runningStock + qtyChange;
      runningStock = currStock;

      // Use key_in_date (or fallback to timestamp) for the Date & Time column.
      const dateObj = log.key_in_date ? new Date(log.key_in_date) : new Date(log.timestamp);
      const dateStr = formatKeyInDateShort(dateObj);

      // 'Changed By Who' is set to log.remarks, or you can change it as needed.
      const changedByWho = log.remarks || '';

      const qtyIn = qtyChange > 0 ? `+${qtyChange}` : '';
      const qtyOut = qtyChange < 0 ? `${qtyChange}` : '';
      const displaySite = log.site_name && log.site_name.trim() !== '' ? log.site_name : 'N/A';

      return [
        dateStr,
        changedByWho,
        qtyIn,
        qtyOut,
        String(prevStock),
        String(currStock),
        displaySite,
      ];
    });

    // If no logs remain after filtering, add a placeholder row.
    if (tableRows.length === 0) {
      tableRows.push([
        'N/A',
        'N/A',
        '',
        '',
        String(item.quantity),
        String(item.quantity),
        item.site_name || 'N/A',
      ]);
    }

    // Limit the number of rows if they exceed the available space.
    const limitedRows = tableRows.slice(0, maxRowsPerTable);

    // Before drawing, check if adding this item's header and table will overflow the page.
    // Estimate required height: header text (6mm) + table header + rows.
    const requiredHeight = 6 + estimatedHeaderHeight + limitedRows.length * estimatedRowHeight;
    if (currentY + requiredHeight > pageHeight - marginBottom) {
      // Stop processing further items to ensure only one page is printed.
      break;
    }

    // Draw the item header.
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    const headerText = `Item: ${item.item_name} (Current Stock: ${item.quantity})`;
    doc.text(headerText, marginLeft, currentY);
    currentY += 6;

    // Draw the table for this item.
    autoTable(doc, {
      startY: currentY,
      // Let autoTable handle horizontal centering with 'auto' tableWidth and margin.
      margin: { left: marginLeft, right: marginRight },
      tableWidth: 'auto',
      head: [tableHeader],
      body: limitedRows,
      theme: 'striped',
      styles: {
        font: 'helvetica',
        fontSize: 10,
        textColor: 0,
        // Add some extra padding for a cleaner look
        cellPadding: 3,
      },
      headStyles: {
        fillColor: [30, 30, 30],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
      },
      columnStyles: {
        // Center align numeric columns, left align text columns.
        0: { halign: 'center' }, // Date & Time
        1: { halign: 'left' },   // Changed By Who
        2: { halign: 'center' }, // Qty In
        3: { halign: 'center' }, // Qty Out
        4: { halign: 'center' }, // Prev Stock
        5: { halign: 'center' }, // Curr Stock
        6: { halign: 'left' },   // Site
      },
      // Disable automatic page breaking so that all content stays on one page.
      didDrawPage: () => {},
      pageBreak: 'avoid',
    });

    // Update currentY based on the last drawn table.
    currentY = doc.lastAutoTable.finalY + 10;
  }

  // ---------- FOOTER (PAGE NUMBERING) ----------
  // Since we are limiting to one page, add footer only for page 1.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Page 1 of 1`, pageWidth - marginRight, pageHeight - 10, { align: 'right' });

  // Save the PDF with a date-based filename.
  doc.save(`Inventory_${new Date().toISOString().slice(0, 10)}.pdf`);
}

